/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_RequerimientoDetalle (ALTER) + inv.FnRegistrarRequerimiento (REPLACE)
	        + inv.FnAtenderRequerimiento (REPLACE) + inv.FnCatalogarLineaRequerimiento (CREATE)
	        + storage bucket "requerimientos" (CREATE)
	Tipo de Cambio: ALTER + REPLACE + CREATE - lineas de requerimiento NO catalogadas
	Autor: Equipo Desarrollo
	Fecha: 2026-09-02
	Descripcion: Caso de campo — a veces se pide algo urgente que no existe en el
	             catalogo. Hoy es imposible: T_RequerimientoDetalle.IdProducto es
	             NOT NULL. Se habilita la linea "producto nuevo":

	             1. La linea admite (IdProducto) XOR (DescripcionLibre + UrlFotoLibre
	                opcional, max 1 foto). CHECK: al menos uno de los dos — tras
	                catalogar conviven ambos (la descripcion queda como traza de lo
	                pedido). NO se crea tabla alterna de productos: la descripcion y
	                la foto dependen funcionalmente de la LINEA (3FN); el producto
	                real se crea en T_Producto al catalogar y la foto pasa a
	                T_ProductoImagen (sus casas normalizadas).
	             2. FnRegistrarRequerimiento acepta y valida ambas variantes.
	             3. FnAtenderRequerimiento v5 (v4 de 0060 + LEFT JOIN): una linea sin
	                catalogar NO se puede entregar — error claro (P0001 -> 409 en la
	                API). Las demas lineas pueden entregarse (parcial).
	             4. FnCatalogarLineaRequerimiento: registra el producto AL MOMENTO DE
	                ENTREGAR. SECURITY DEFINER con revalidacion de rol (patron
	                0039/0057) porque quien entrega (gerencia/supervision,
	                requerimientoAprobar) no tiene productoEscritura en la RLS de
	                T_Producto: alta escoped a este flujo. Atomica: producto (SKU
	                autogenerado por 0059 si llega vacio; StockMinimo autocalculado
	                por flota si llega 0) + foto como imagen principal + link de la
	                linea.
	             5. Bucket publico "requerimientos" (espejo de 0049) para las fotos
	                de lineas no catalogadas (path solicitudes/{uuid}-{archivo}).
	             Idempotente donde es posible.
*/

/* ===== 1. T_RequerimientoDetalle: linea catalogo XOR linea libre ===== */
ALTER TABLE "inv"."T_RequerimientoDetalle"
	ALTER COLUMN "IdProducto" DROP NOT NULL;

ALTER TABLE "inv"."T_RequerimientoDetalle"
	ADD COLUMN IF NOT EXISTS "DescripcionLibre" VARCHAR(200),
	ADD COLUMN IF NOT EXISTS "UrlFotoLibre"     VARCHAR(500);

ALTER TABLE "inv"."T_RequerimientoDetalle"
	DROP CONSTRAINT IF EXISTS "CHK_T_RequerimientoDetalle_ProductoODescripcion";
ALTER TABLE "inv"."T_RequerimientoDetalle"
	ADD CONSTRAINT "CHK_T_RequerimientoDetalle_ProductoODescripcion"
	CHECK ("IdProducto" IS NOT NULL OR "DescripcionLibre" IS NOT NULL);

COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."DescripcionLibre" IS 'Descripcion del producto NO catalogado pedido de urgencia. Se conserva como traza tras catalogar (IdProducto pasa a estar seteado).';
COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."UrlFotoLibre" IS 'Foto (max 1) del producto no catalogado, bucket "requerimientos". Al catalogar se registra ademas como imagen principal en T_ProductoImagen.';

/* ===== 2. FnRegistrarRequerimiento: acepta linea catalogo XOR linea libre ===== */
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarRequerimiento"("PRequerimiento" jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	"vId"          UUID;
	"vUsuario"     VARCHAR(50);
	"vDetalle"     JSONB;
	"vIdProducto"  UUID;
	"vDescripcion" TEXT;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento","FechaRequerimiento","Origen","IdEquipo","IdVehiculo",
		"IdPersonalSolicitante","Notas","Situacion","UsuarioCreacion","UsuarioModificacion"
	)
	VALUES
	(
		NULLIF("PRequerimiento"->>'NumeroRequerimiento', '')
		,("PRequerimiento"->>'FechaRequerimiento')::DATE
		,"PRequerimiento"->>'Origen'
		,NULLIF("PRequerimiento"->>'IdEquipo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdVehiculo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdPersonalSolicitante', '')::UUID
		,NULLIF("PRequerimiento"->>'Notas', '')
		,'pendiente'
		,"vUsuario","vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PRequerimiento"->'Detalle')
	LOOP
		"vIdProducto"  = NULLIF("vDetalle"->>'IdProducto', '')::UUID;
		"vDescripcion" = NULLIF(TRIM("vDetalle"->>'DescripcionLibre'), '');

		/* XOR: producto del catalogo O descripcion libre, nunca ambos ni ninguno. */
		IF "vIdProducto" IS NULL AND "vDescripcion" IS NULL THEN
			RAISE EXCEPTION 'Cada linea debe tener un producto del catalogo o la descripcion del producto nuevo.';
		END IF;
		IF "vIdProducto" IS NOT NULL AND "vDescripcion" IS NOT NULL THEN
			RAISE EXCEPTION 'Una linea no puede tener producto del catalogo y descripcion libre a la vez.';
		END IF;

		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento","IdProducto","Cantidad","IdVehiculo","Notas",
			"DescripcionLibre","UrlFotoLibre",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,"vIdProducto"
			,("vDetalle"->>'Cantidad')::NUMERIC
			,COALESCE(
				NULLIF("vDetalle"->>'IdVehiculo', ''),
				NULLIF("PRequerimiento"->>'IdVehiculo', '')
			)::UUID
			,NULLIF("vDetalle"->>'Notas', '')
			,"vDescripcion"
			/* La foto solo aplica a lineas libres. */
			,CASE WHEN "vDescripcion" IS NOT NULL
				THEN NULLIF("vDetalle"->>'UrlFotoLibre', '') END
			,"vUsuario","vUsuario"
		);
	END LOOP;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarRequerimiento"(JSONB) IS 'Crea un requerimiento con su detalle en una transaccion. Cada linea lleva producto del catalogo XOR descripcion libre (+ foto opcional) para urgencias no catalogadas. Placa por linea con fallback a cabecera.';

/* ===== 3. FnAtenderRequerimiento v5 (v4 de 0060 + guard de linea no catalogada) ===== */
CREATE OR REPLACE FUNCTION "inv"."FnAtenderRequerimiento"
(
	"PIdRequerimiento" UUID,
	"PEntrega"         JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vReq"         "inv"."T_Requerimiento";
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vNotas"       TEXT;
	"vRol"         TEXT;
	"vLinea"       JSONB;
	"vIdDetalle"   UUID;
	"vModo"        TEXT;
	"vCant"        NUMERIC;
	"vCosto"       NUMERIC;
	"vSolicitada"  NUMERIC;
	"vAtendida"    NUMERIC;
	"vPendiente"   NUMERIC;
	"vIdProducto"  UUID;
	"vIdVehiculo"  UUID;
	"vNombreProd"  TEXT;
	"vDescLibre"   TEXT;
	"vSalidaDet"   JSONB := '[]'::JSONB;
	"vCompraDet"   JSONB := '[]'::JSONB;
	"vIdSalida"    UUID;
	"vTodoAtendido" BOOLEAN;
BEGIN
	"vUbic"        = NULLIF("PEntrega"->>'IdUbicacionOrigen', '')::UUID;
	"vProveedor"   = NULLIF("PEntrega"->>'IdProveedor', '')::UUID;
	"vComprobante" = NULLIF("PEntrega"->>'Comprobante', '');
	"vNotas"       = NULLIF("PEntrega"->>'Notas', '');

	SELECT * INTO "vReq" FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE FOR UPDATE;
	IF "vReq" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;
	/* Admite re-atencion de un requerimiento parcial. */
	IF "vReq"."Situacion" NOT IN ('pendiente','parcial') THEN
		RAISE EXCEPTION 'Solo se aprueban requerimientos pendientes o parciales (situacion actual: %).', "vReq"."Situacion";
	END IF;

	"vRol" = "seg"."FnRolUsuario"();
	/* C1: defensa en profundidad — funcion SECURITY DEFINER expuesta por RPC;
	   revalidamos requerimientoAprobar dentro de la funcion. */
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para aprobar requerimientos.'
			USING ERRCODE = '42501';
	END IF;

	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vReq"."UsuarioCreacion"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes aprobar un requerimiento que tu mismo creaste.';
	END IF;

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	/* Guard de lineas duplicadas: cada IdDetalle a lo sumo una vez (evita doble egreso) */
	IF (SELECT COUNT(*) FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas')) <>
	   (SELECT COUNT(DISTINCT (e->>'IdDetalle')) FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas') e) THEN
		RAISE EXCEPTION 'Hay lineas de entrega duplicadas en la solicitud.';
	END IF;

	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas')
	LOOP
		"vIdDetalle" = ("vLinea"->>'IdDetalle')::UUID;
		"vModo"      = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"      = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"     = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		/* LEFT JOIN: la linea puede ser un producto NO catalogado (IdProducto NULL). */
		SELECT D."Cantidad", D."CantidadAtendida", D."IdProducto", D."IdVehiculo",
		       P."Nombre", D."DescripcionLibre"
		INTO "vSolicitada", "vAtendida", "vIdProducto", "vIdVehiculo",
		     "vNombreProd", "vDescLibre"
		FROM "inv"."T_RequerimientoDetalle" D
		LEFT JOIN "inv"."T_Producto" P ON P."Id" = D."IdProducto"
		WHERE D."Id" = "vIdDetalle"
		  AND D."IdRequerimiento" = "PIdRequerimiento"
		  AND D."Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Linea de detalle invalida para este requerimiento.';
		END IF;

		/* Linea no catalogada: hay que registrar el producto ANTES de entregarla
		   (FnCatalogarLineaRequerimiento). Las demas lineas pueden entregarse. */
		IF "vIdProducto" IS NULL THEN
			RAISE EXCEPTION 'La linea "%" es un producto no catalogado: registralo en el catalogo antes de entregar.',
				COALESCE("vDescLibre", 'sin descripcion');
		END IF;

		/* A6: cantidad invalida se RECHAZA (antes se descartaba en silencio con CONTINUE) */
		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad a entregar de % debe ser mayor a cero.', "vNombreProd";
		END IF;

		/* Valida contra el SALDO pendiente, no contra la cantidad total. */
		"vPendiente" = "vSolicitada" - "vAtendida";
		IF "vCant" > "vPendiente" THEN
			RAISE EXCEPTION 'No puedes entregar mas de lo pendiente en %: pendiente %, intento %.',
				"vNombreProd", "vPendiente", "vCant";
		END IF;

		/* Placa POR LINEA hacia la salida; si es NULL, el fallback a la placa
		   de cabecera lo resuelve FnRegistrarDocumentoInventario (0052). */
		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT(
			'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'IdVehiculo', "vIdVehiculo");

		IF "vModo" = 'compra' THEN
			IF "vProveedor" IS NULL OR "vComprobante" IS NULL THEN
				RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
			END IF;
			IF "vCosto" IS NULL OR "vCosto" <= 0 THEN
				RAISE EXCEPTION 'La compra directa de % requiere un costo unitario mayor a cero.', "vNombreProd";
			END IF;
			"vCompraDet" = "vCompraDet" || JSONB_BUILD_OBJECT(
				'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'CostoUnitario', "vCosto"
			);
		END IF;

		/* ACUMULA (antes sobreescribia con SET = vCant, perdiendo entregas previas). */
		UPDATE "inv"."T_RequerimientoDetalle"
		SET "CantidadAtendida" = "CantidadAtendida" + "vCant"
		WHERE "Id" = "vIdDetalle";
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vSalidaDet") = 0 THEN
		RAISE EXCEPTION 'No se especifico ninguna cantidad a entregar.';
	END IF;

	IF JSONB_ARRAY_LENGTH("vCompraDet") > 0 THEN
		PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			'TipoDocumento',     'entrada',
			'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionDestino', "vUbic",
			'IdProveedor',       "vProveedor",
			'Comprobante',       "vComprobante",
			'Referencia',        'Compra directa REQ ' || COALESCE("vReq"."NumeroRequerimiento", LEFT("PIdRequerimiento"::TEXT, 8)),
			'Notas',             'Compra inmediata para atender requerimiento',
			'Detalle',           "vCompraDet"
		));
	END IF;

	"vIdSalida" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "vUbic",
		'IdVehiculo',        "vReq"."IdVehiculo",
		'Referencia',        COALESCE("vReq"."NumeroRequerimiento", 'REQ ' || LEFT("PIdRequerimiento"::TEXT, 8)),
		'Notas',             COALESCE("vNotas", 'Atencion de requerimiento'),
		'Detalle',           "vSalidaDet"
	));

	/* Registrar esta entrega en la tabla puente (trazabilidad de parciales). */
	INSERT INTO "inv"."T_RequerimientoAtencion" ("IdRequerimiento", "IdDocumentoInventario")
	VALUES ("PIdRequerimiento", "vIdSalida");

	/* Situacion final: atendido si TODAS las lineas quedaron completas, si no parcial. */
	SELECT bool_and("CantidadAtendida" >= "Cantidad")
	INTO "vTodoAtendido"
	FROM "inv"."T_RequerimientoDetalle"
	WHERE "IdRequerimiento" = "PIdRequerimiento" AND "Estado" = TRUE;

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = CASE WHEN "vTodoAtendido" THEN 'atendido' ELSE 'parcial' END,
		"IdDocumentoInventario" = "vIdSalida"  -- ultima salida (compat)
	WHERE "Id" = "PIdRequerimiento";

	RETURN "vIdSalida";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, JSONB) IS 'Aprueba un requerimiento con entrega por linea (parcial acumulativa y/o compra directa). Una linea NO catalogada (IdProducto NULL) se rechaza con error claro: debe catalogarse antes (FnCatalogarLineaRequerimiento). Propaga la placa POR LINEA a la salida. Admite re-atender un parcial; valida contra el saldo pendiente; acumula CantidadAtendida; Situacion atendido/parcial por bool_and. SECURITY DEFINER; revalida requerimientoAprobar (C1); el creador no aprueba lo suyo (admin exento).';

/* ===== 4. FnCatalogarLineaRequerimiento: registrar el producto al entregar ===== */
CREATE OR REPLACE FUNCTION "inv"."FnCatalogarLineaRequerimiento"
(
	"PIdDetalle" UUID,
	"PProducto"  JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vRol"          TEXT;
	"vUsuario"      VARCHAR(50);
	"vIdProdActual" UUID;
	"vUrlFoto"      TEXT;
	"vSituacion"    TEXT;
	"vProducto"     JSONB;
	"vEsGeneral"    BOOLEAN;
	"vStockMin"     NUMERIC;
	"vIdProducto"   UUID;
BEGIN
	/* Defensa en profundidad: quien entrega (aprobadores) no tiene productoEscritura
	   en la RLS de T_Producto; este es un camino de alta ESCOPED al flujo de entrega,
	   revalidado aqui (patron 0039/0057). Almacenero tambien puede (ya tiene el
	   permiso general de productos). */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision','almacenero') THEN
		RAISE EXCEPTION 'No tienes permiso para registrar productos de un requerimiento.'
			USING ERRCODE = '42501';
	END IF;
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	/* Lock de la linea + situacion del requerimiento padre (check+use atomico). */
	SELECT D."IdProducto", D."UrlFotoLibre", R."Situacion"
	INTO "vIdProdActual", "vUrlFoto", "vSituacion"
	FROM "inv"."T_RequerimientoDetalle" D
	JOIN "inv"."T_Requerimiento" R ON R."Id" = D."IdRequerimiento" AND R."Estado" = TRUE
	WHERE D."Id" = "PIdDetalle" AND D."Estado" = TRUE
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'La linea del requerimiento no existe.';
	END IF;
	IF "vIdProdActual" IS NOT NULL THEN
		RAISE EXCEPTION 'La linea ya esta vinculada a un producto del catalogo.';
	END IF;
	IF "vSituacion" NOT IN ('pendiente','parcial') THEN
		RAISE EXCEPTION 'Solo se catalogan lineas de requerimientos pendientes o parciales (situacion actual: %).', "vSituacion";
	END IF;

	/* StockMinimo automatico si llega 0/ausente: misma formula de flota adoptada —
	   general -> total de equipos activos; con tipos -> equipos de esos tipos; piso 1. */
	"vProducto" = "PProducto";
	IF COALESCE(NULLIF("vProducto"->>'StockMinimo', '')::NUMERIC, 0) = 0 THEN
		"vEsGeneral" = COALESCE(("vProducto"->>'EsGeneral')::BOOLEAN, FALSE);
		IF "vEsGeneral" THEN
			SELECT COUNT(*) INTO "vStockMin" FROM "inv"."T_Equipo" WHERE "Estado" = TRUE;
		ELSE
			SELECT COUNT(DISTINCT e."Id") INTO "vStockMin"
			FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE("vProducto"->'IdsTipoEquipo', '[]'::JSONB)) t("id")
			JOIN "inv"."T_Equipo" e ON e."IdTipoEquipo" = t."id"::UUID AND e."Estado" = TRUE;
		END IF;
		"vProducto" = "vProducto" || JSONB_BUILD_OBJECT('StockMinimo', GREATEST(1, COALESCE("vStockMin", 0)));
	END IF;

	/* Alta real: FnGuardarProducto valida XOR general/tipos y autogenera el SKU (0059).
	   Corre con los privilegios del definer -> la RLS de T_Producto no bloquea al aprobador. */
	"vIdProducto" = "inv"."FnGuardarProducto"("vProducto");

	/* La foto de la solicitud pasa a ser la imagen principal del producto. */
	IF NULLIF("vUrlFoto", '') IS NOT NULL THEN
		INSERT INTO "inv"."T_ProductoImagen"
			("IdProducto","Url","Orden","EsPrincipal","UsuarioCreacion","UsuarioModificacion")
		VALUES ("vIdProducto", "vUrlFoto", 1, TRUE, "vUsuario", "vUsuario");
	END IF;

	/* Link de la linea; DescripcionLibre se conserva como traza de lo pedido. */
	UPDATE "inv"."T_RequerimientoDetalle"
	SET "IdProducto" = "vIdProducto"
	WHERE "Id" = "PIdDetalle";

	RETURN "vIdProducto";
END;
$$;

COMMENT ON FUNCTION "inv"."FnCatalogarLineaRequerimiento"(UUID, JSONB) IS 'Registra en el catalogo el producto de una linea no catalogada (al momento de entregar) y la vincula, en una transaccion: FnGuardarProducto (SKU autogenerado, StockMinimo por flota si llega 0) + foto de la solicitud como imagen principal + link de la linea. SECURITY DEFINER: habilita el alta a los aprobadores (gerencia/supervision) SOLO en este flujo; revalida rol adentro.';

/* ===== 5. Storage: bucket publico "requerimientos" (espejo de 0049) ===== */
INSERT INTO storage.buckets (id, name, public)
VALUES ('requerimientos', 'requerimientos', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "requerimientos_lectura_publica" ON storage.objects;
CREATE POLICY "requerimientos_lectura_publica" ON storage.objects
	FOR SELECT TO public USING (bucket_id = 'requerimientos');

DROP POLICY IF EXISTS "requerimientos_subida_auth" ON storage.objects;
CREATE POLICY "requerimientos_subida_auth" ON storage.objects
	FOR INSERT TO authenticated WITH CHECK (bucket_id = 'requerimientos');

DROP POLICY IF EXISTS "requerimientos_actualizar_auth" ON storage.objects;
CREATE POLICY "requerimientos_actualizar_auth" ON storage.objects
	FOR UPDATE TO authenticated USING (bucket_id = 'requerimientos');

DROP POLICY IF EXISTS "requerimientos_eliminar_auth" ON storage.objects;
CREATE POLICY "requerimientos_eliminar_auth" ON storage.objects
	FOR DELETE TO authenticated USING (bucket_id = 'requerimientos');
