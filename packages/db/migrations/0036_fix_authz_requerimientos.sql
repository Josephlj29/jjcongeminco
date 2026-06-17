/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAtenderRequerimiento (REPLACE) + inv.FnAnularRequerimiento (REPLACE)
	Tipo de Cambio: REPLACE - seguridad de autorizacion (auditoria QA)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: HALLAZGO CRITICO C1 — estas funciones son SECURITY DEFINER y quedan
	             EXPUESTAS por PostgREST (GRANT EXECUTE a authenticated en 0008). El
	             control de permiso vivia SOLO en la API de Next (puede(...,
	             requerimientoAprobar)), por lo que cualquier usuario autenticado
	             (ej. almacenero) podia invocar la RPC directo y auto-aprobar/anular
	             requerimientos, sacando stock sin pasar por el guard de la API.
	             Fix: revalidar el rol DENTRO de la funcion, mismo patron que ya usan
	             FnConsumirRepuestosOrdenMantenimiento y FnReconciliarOrdenMantenimiento
	             (0033). Roles permitidos = requerimientoAprobar (admin, gerencia,
	             supervision), reflejo de packages/shared/src/roles.ts.

	             HALLAZGO A6 — en FnAtenderRequerimiento una linea con Cantidad <= 0 se
	             descartaba en silencio (CONTINUE). Como la funcion queda expuesta por
	             RPC (Zod no aplica si se llama directo), ahora se rechaza con error
	             explicito por producto.
*/

CREATE OR REPLACE FUNCTION "inv"."FnAnularRequerimiento"
(
	"PIdRequerimiento" UUID,
	"PMotivo"          VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vReq" "inv"."T_Requerimiento";
	"vRol" TEXT;
BEGIN
	SELECT * INTO "vReq" FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE FOR UPDATE;

	IF "vReq" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;
	IF "vReq"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se rechazan requerimientos pendientes (situacion actual: %).', "vReq"."Situacion";
	END IF;

	/* C1: defensa en profundidad — esta funcion es SECURITY DEFINER y esta expuesta
	   por RPC; revalidamos el permiso requerimientoAprobar (no confiamos solo en la API). */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para rechazar requerimientos.'
			USING ERRCODE = '42501';
	END IF;

	/* Segregacion de funciones: el creador no rechaza lo suyo (admin exento) */
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vReq"."UsuarioCreacion"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes rechazar un requerimiento que tu mismo creaste.';
	END IF;

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'anulado',
		"Notas" = CASE
			WHEN "PMotivo" IS NULL OR "PMotivo" = '' THEN "Notas"
			ELSE LEFT(COALESCE("Notas" || ' | ', '') || 'Rechazado: ' || "PMotivo", 500)
		END
	WHERE "Id" = "PIdRequerimiento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAnularRequerimiento"(UUID, VARCHAR) IS 'Rechaza un requerimiento pendiente (anulado). SECURITY DEFINER; revalida requerimientoAprobar DENTRO de la funcion (C1). El creador no puede rechazar lo suyo (admin exento).';

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
	"vIdProducto"  UUID;
	"vNombreProd"  TEXT;
	"vSalidaDet"   JSONB := '[]'::JSONB;
	"vCompraDet"   JSONB := '[]'::JSONB;
	"vIdSalida"    UUID;
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
	IF "vReq"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se aprueban requerimientos pendientes (situacion actual: %).', "vReq"."Situacion";
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

		SELECT D."Cantidad", D."IdProducto", P."Nombre"
		INTO "vSolicitada", "vIdProducto", "vNombreProd"
		FROM "inv"."T_RequerimientoDetalle" D
		JOIN "inv"."T_Producto" P ON P."Id" = D."IdProducto"
		WHERE D."Id" = "vIdDetalle"
		  AND D."IdRequerimiento" = "PIdRequerimiento"
		  AND D."Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Linea de detalle invalida para este requerimiento.';
		END IF;

		/* A6: cantidad invalida se RECHAZA (antes se descartaba en silencio con CONTINUE) */
		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad a entregar de % debe ser mayor a cero.', "vNombreProd";
		END IF;

		IF "vCant" > "vSolicitada" THEN
			RAISE EXCEPTION 'No puedes entregar mas de lo solicitado en %: solicitado %, intento %.',
				"vNombreProd", "vSolicitada", "vCant";
		END IF;

		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', "vCant");

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

		UPDATE "inv"."T_RequerimientoDetalle"
		SET "CantidadAtendida" = "vCant"
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

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido', "IdDocumentoInventario" = "vIdSalida"
	WHERE "Id" = "PIdRequerimiento";

	RETURN "vIdSalida";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, JSONB) IS 'Aprueba un requerimiento con entrega por linea (parcial y/o compra directa). SECURITY DEFINER; revalida requerimientoAprobar DENTRO de la funcion (C1); el creador no aprueba lo suyo (admin exento). Cantidad <= 0 se rechaza (A6). Modo compra = entrada + salida valorizada al costo promedio movil (NIC 2).';