/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Requerimiento (CHECK) + inv.T_RequerimientoAtencion (CREATE)
	        + inv.FnAtenderRequerimiento (REPLACE) + inv.FnAnularRequerimiento (REPLACE)
	Tipo de Cambio: ALTER + CREATE + REPLACE - atencion parcial de requerimientos
	Autor: Equipo Desarrollo
	Fecha: 2026-08-28
	Descripcion: HALLAZGO (auditoria) — FnAtenderRequerimiento fijaba Situacion='atendido'
	             con CUALQUIER entrega y SOBREESCRIBIA CantidadAtendida (SET = vCant), y el
	             CHECK solo admitia pendiente|atendido|anulado. Como re-atender estaba
	             bloqueado (Situacion <> 'pendiente'), el saldo pendiente
	             (Cantidad - CantidadAtendida) NUNCA se podia entregar: se perdia en
	             silencio. Ademas se validaba contra Cantidad (no contra el saldo), asi
	             que una segunda atencion podria haber sobre-entregado.

	             Fix — maquina de estados pendiente -> parcial -> atendido (anulado
	             terminal desde pendiente/parcial):
	               1. CHECK ampliado con 'parcial' (superconjunto: cero backfill de datos).
	               2. FnAtenderRequerimiento v3: admite pendiente|parcial; valida contra
	                  el SALDO (Cantidad - CantidadAtendida); ACUMULA (+= vCant); calcula
	                  la situacion final con bool_and(CantidadAtendida >= Cantidad).
	               3. Tabla puente T_RequerimientoAtencion (req <-> N documentos de salida)
	                  para trazabilidad de multiples entregas; IdDocumentoInventario del
	                  requerimiento se conserva como "ultima salida" (compat con vistas/UI).
	               4. FnAnularRequerimiento admite anular tambien 'parcial' (anula el saldo
	                  no entregado; lo ya entregado queda en el kardex, no se toca).
	             Idempotente donde es posible (CREATE OR REPLACE / IF NOT EXISTS).
*/

/* 1. Ampliar el CHECK de situacion (superconjunto -> no requiere backfill) --- */
ALTER TABLE "inv"."T_Requerimiento"
	DROP CONSTRAINT IF EXISTS "CHK_T_Requerimiento_Situacion_Permitida";
ALTER TABLE "inv"."T_Requerimiento"
	ADD CONSTRAINT "CHK_T_Requerimiento_Situacion_Permitida"
	CHECK ("Situacion" IN ('pendiente','parcial','atendido','anulado'));

COMMENT ON COLUMN "inv"."T_Requerimiento"."Situacion" IS 'Situacion: pendiente, parcial, atendido, anulado.';

/* 2. Tabla puente req <-> documentos de salida (N atenciones por requerimiento) */
CREATE TABLE IF NOT EXISTS "inv"."T_RequerimientoAtencion"
(
	"Id"                     UUID        NOT NULL DEFAULT gen_random_uuid(),
	"IdRequerimiento"        UUID        NOT NULL,
	"IdDocumentoInventario"  UUID        NOT NULL,
	"Estado"                 BOOLEAN     NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"        VARCHAR(50) NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"    VARCHAR(50) NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	"FechaModificacion"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	"RowVersion"             BIGINT      NOT NULL DEFAULT 0,
	"IdMigracion"            UUID,
	CONSTRAINT "PK_T_RequerimientoAtencion" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_RequerimientoAtencion_Requerimiento_IdRequerimiento"
		FOREIGN KEY ("IdRequerimiento") REFERENCES "inv"."T_Requerimiento" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_RequerimientoAtencion_Documento_IdDocumentoInventario"
		FOREIGN KEY ("IdDocumentoInventario") REFERENCES "inv"."T_DocumentoInventario" ("Id")
);

COMMENT ON TABLE "inv"."T_RequerimientoAtencion" IS 'Cada entrega (salida) que atiende un requerimiento. Un requerimiento parcial acumula varias. T_Requerimiento.IdDocumentoInventario guarda la ultima como atajo.';

CREATE INDEX IF NOT EXISTS "IX_T_RequerimientoAtencion_IdRequerimiento"
	ON "inv"."T_RequerimientoAtencion" ("IdRequerimiento");

DROP TRIGGER IF EXISTS "TR_T_RequerimientoAtencion_Auditoria" ON "inv"."T_RequerimientoAtencion";
CREATE TRIGGER "TR_T_RequerimientoAtencion_Auditoria"
	BEFORE UPDATE ON "inv"."T_RequerimientoAtencion"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_RequerimientoAtencion" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LecturaAutenticado" ON "inv"."T_RequerimientoAtencion";
CREATE POLICY "LecturaAutenticado" ON "inv"."T_RequerimientoAtencion"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

/* Escritura solo via la funcion SECURITY DEFINER; sin policy de escritura directa
   (mismo patron que el ledger). */

/* Backfill: las atenciones historicas (una por requerimiento ya atendido). */
INSERT INTO "inv"."T_RequerimientoAtencion" ("IdRequerimiento", "IdDocumentoInventario")
SELECT "Id", "IdDocumentoInventario"
FROM "inv"."T_Requerimiento"
WHERE "IdDocumentoInventario" IS NOT NULL
  AND NOT EXISTS (
	SELECT 1 FROM "inv"."T_RequerimientoAtencion" a
	WHERE a."IdRequerimiento" = "inv"."T_Requerimiento"."Id"
	  AND a."IdDocumentoInventario" = "inv"."T_Requerimiento"."IdDocumentoInventario"
  );

/* 3. FnAtenderRequerimiento v3 — acumula + situacion parcial/atendido --------- */
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
	"vNombreProd"  TEXT;
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
	/* Ahora admite re-atencion de un requerimiento parcial. */
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

		SELECT D."Cantidad", D."CantidadAtendida", D."IdProducto", P."Nombre"
		INTO "vSolicitada", "vAtendida", "vIdProducto", "vNombreProd"
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

		/* Valida contra el SALDO pendiente, no contra la cantidad total. */
		"vPendiente" = "vSolicitada" - "vAtendida";
		IF "vCant" > "vPendiente" THEN
			RAISE EXCEPTION 'No puedes entregar mas de lo pendiente en %: pendiente %, intento %.',
				"vNombreProd", "vPendiente", "vCant";
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

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, JSONB) IS 'Aprueba un requerimiento con entrega por linea (parcial acumulativa y/o compra directa). Admite re-atender un requerimiento parcial; valida contra el saldo pendiente; acumula CantidadAtendida; deja Situacion atendido/parcial segun bool_and por linea. Registra cada salida en T_RequerimientoAtencion. SECURITY DEFINER; revalida requerimientoAprobar (C1); el creador no aprueba lo suyo (admin exento).';

/* 4. FnAnularRequerimiento — permitir anular tambien 'parcial' --------------- */
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
	/* Anula el SALDO no entregado; lo ya entregado (parcial) queda en el kardex. */
	IF "vReq"."Situacion" NOT IN ('pendiente','parcial') THEN
		RAISE EXCEPTION 'Solo se rechazan requerimientos pendientes o parciales (situacion actual: %).', "vReq"."Situacion";
	END IF;

	/* C1: defensa en profundidad — SECURITY DEFINER expuesta por RPC. */
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

COMMENT ON FUNCTION "inv"."FnAnularRequerimiento"(UUID, VARCHAR) IS 'Rechaza un requerimiento pendiente o parcial (anulado): anula el saldo no entregado; lo ya entregado permanece en el kardex. SECURITY DEFINER; revalida requerimientoAprobar (C1). El creador no puede rechazar lo suyo (admin exento).';
