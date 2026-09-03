/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAtenderRequerimiento (REPLACE) + inv.V_Recambio_Producto (REPLACE)
	Tipo de Cambio: REPLACE - propagar la placa POR LINEA al atender + IdDetalle en recambios
	Autor: Equipo Desarrollo
	Fecha: 2026-09-02
	Descripcion: 0053 movio la placa al detalle del requerimiento, pero
	             FnAtenderRequerimiento (v3, 0058) seguia armando el detalle de
	             la salida SIN IdVehiculo y pasando solo la placa de CABECERA.
	             Como 0053 tambien elimino CHK_T_Requerimiento_Destino_Obligatorio,
	             un requerimiento con placas solo por linea generaba movimientos
	             con IdVehiculo NULL: el consumo desaparecia del reporte por placa
	             y del analisis de recambios. Fix (mismo patron que
	             FnConsumirRepuestosOrdenMantenimiento en 0053:190-192):
	               - el SELECT por linea ahora lee D."IdVehiculo";
	               - vSalidaDet incluye 'IdVehiculo' por linea.
	             El fallback linea->cabecera NO se duplica aqui: ya vive en
	             FnRegistrarDocumentoInventario (0052, COALESCE detalle/cabecera).

	             Ademas V_Recambio_Producto expone rd."Id" AS "IdDetalle" (al
	             final, como exige CREATE OR REPLACE VIEW): key estable para el
	             reporte cuando el mismo producto va en varias lineas del mismo
	             requerimiento (multi-placa via line-split).

	             Incluye backfill best-effort de movimientos historicos con
	             placa NULL, solo donde la atribucion es inequivoca.
*/

/* ===== 1. FnAtenderRequerimiento v4 (v3 de 0058 + placa por linea) ===== */
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

		SELECT D."Cantidad", D."CantidadAtendida", D."IdProducto", D."IdVehiculo", P."Nombre"
		INTO "vSolicitada", "vAtendida", "vIdProducto", "vIdVehiculo", "vNombreProd"
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

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, JSONB) IS 'Aprueba un requerimiento con entrega por linea (parcial acumulativa y/o compra directa). Propaga la placa (IdVehiculo) POR LINEA a la salida — fallback a cabecera en FnRegistrarDocumentoInventario. Admite re-atender un parcial; valida contra el saldo pendiente; acumula CantidadAtendida; Situacion atendido/parcial por bool_and. Registra cada salida en T_RequerimientoAtencion. SECURITY DEFINER; revalida requerimientoAprobar (C1); el creador no aprueba lo suyo (admin exento).';

/* ===== 2. V_Recambio_Producto: exponer IdDetalle (key estable del reporte) ===== */
CREATE OR REPLACE VIEW "inv"."V_Recambio_Producto" WITH (security_invoker = true) AS
	WITH "base" AS (
		SELECT
			rq."Id" AS "IdRequerimiento",
			rq."NumeroRequerimiento",
			rq."FechaRequerimiento",
			rq."Origen",
			COALESCE(rd."IdVehiculo", rq."IdVehiculo", rq."IdEquipo") AS "TargetId",
			CASE
				WHEN COALESCE(rd."IdVehiculo", rq."IdVehiculo") IS NOT NULL THEN 'placa'::text
				ELSE 'equipo'::text
			END AS "TargetTipo",
			COALESCE(v."Placa", ((e."Codigo"::text || ' — '::text) || e."Nombre"::text)::character varying) AS "TargetNombre",
			rd."IdProducto",
			p."Sku",
			p."Nombre" AS "NombreProducto",
			rd."Cantidad",
			rq."FechaRequerimiento" - lag(rq."FechaRequerimiento") OVER (
				PARTITION BY COALESCE(rd."IdVehiculo", rq."IdVehiculo", rq."IdEquipo"), rd."IdProducto"
				ORDER BY rq."FechaRequerimiento", rq."Id"
			) AS "DiasDesdeAnterior",
			rd."Id" AS "IdDetalle"
		FROM "inv"."T_Requerimiento" rq
			JOIN "inv"."T_RequerimientoDetalle" rd ON rd."IdRequerimiento" = rq."Id" AND rd."Estado" = true
			JOIN "inv"."T_Producto" p ON p."Id" = rd."IdProducto"
			LEFT JOIN "inv"."T_Vehiculo" v ON v."Id" = COALESCE(rd."IdVehiculo", rq."IdVehiculo")
			LEFT JOIN "inv"."T_Equipo" e ON e."Id" = rq."IdEquipo"
		WHERE rq."Estado" = true AND rq."Situacion"::text <> 'anulado'::text
	), "conprom" AS (
		SELECT
			"base".*,
			avg("base"."DiasDesdeAnterior") OVER (PARTITION BY "base"."TargetId", "base"."IdProducto") AS "PromedioDiasPar"
		FROM "base"
	)
	SELECT
		"IdRequerimiento",
		"NumeroRequerimiento",
		"FechaRequerimiento",
		"Origen",
		"TargetId",
		"TargetTipo",
		"TargetNombre",
		"IdProducto",
		"Sku",
		"NombreProducto",
		"Cantidad",
		"DiasDesdeAnterior",
		round("PromedioDiasPar", 1) AS "PromedioDiasPar",
		"Origen"::text = 'desgaste_prematuro'::text
			OR "DiasDesdeAnterior" IS NOT NULL AND "PromedioDiasPar" IS NOT NULL
			   AND "PromedioDiasPar" > 0::numeric
			   AND "DiasDesdeAnterior"::numeric < ("PromedioDiasPar" * 0.5) AS "Acelerado",
		"IdDetalle"
	FROM "conprom";

/* ===== 3. Backfill best-effort: movimientos historicos con placa NULL =====
   Solo repara donde la atribucion es inequivoca: el producto aparece en el
   detalle del requerimiento con EXACTAMENTE UNA placa distinta. Los casos
   ambiguos (mismo producto a 2+ placas) quedan NULL a proposito. */
WITH "atribucion" AS (
	SELECT
		doc."IdDocumento",
		rd."IdProducto",
		MIN(rd."IdVehiculo"::text)::uuid AS "IdVehiculo"
	FROM (
		SELECT ra."IdDocumentoInventario" AS "IdDocumento", ra."IdRequerimiento"
		FROM "inv"."T_RequerimientoAtencion" ra
		UNION
		SELECT rq."IdDocumentoInventario", rq."Id"
		FROM "inv"."T_Requerimiento" rq
		WHERE rq."IdDocumentoInventario" IS NOT NULL
	) doc
	JOIN "inv"."T_RequerimientoDetalle" rd
		ON rd."IdRequerimiento" = doc."IdRequerimiento"
		AND rd."IdVehiculo" IS NOT NULL
		AND rd."Estado" = TRUE
	/* Sin lineas del mismo producto SIN placa: si las hubiera, atribuiria la
	   placa tambien a los movimientos de esas lineas. */
	WHERE NOT EXISTS (
		SELECT 1 FROM "inv"."T_RequerimientoDetalle" rd2
		WHERE rd2."IdRequerimiento" = doc."IdRequerimiento"
		  AND rd2."IdProducto" = rd."IdProducto"
		  AND rd2."Estado" = TRUE
		  AND rd2."IdVehiculo" IS NULL
	)
	GROUP BY doc."IdDocumento", rd."IdProducto"
	HAVING COUNT(DISTINCT rd."IdVehiculo") = 1
)
UPDATE "inv"."T_DocumentoInventarioDetalle" dd
SET "IdVehiculo" = a."IdVehiculo"
FROM "atribucion" a
WHERE dd."IdVehiculo" IS NULL
  AND dd."IdDocumentoInventario" = a."IdDocumento"
  AND dd."IdProducto" = a."IdProducto";

/* El ledger es append-only (TR_T_MovimientoStock_BloquearUpdate); se
   deshabilita SOLO para este backfill de atribucion y se reactiva al final. */
ALTER TABLE "inv"."T_MovimientoStock" DISABLE TRIGGER "TR_T_MovimientoStock_BloquearUpdate";

WITH "atribucion" AS (
	SELECT
		doc."IdDocumento",
		rd."IdProducto",
		MIN(rd."IdVehiculo"::text)::uuid AS "IdVehiculo"
	FROM (
		SELECT ra."IdDocumentoInventario" AS "IdDocumento", ra."IdRequerimiento"
		FROM "inv"."T_RequerimientoAtencion" ra
		UNION
		SELECT rq."IdDocumentoInventario", rq."Id"
		FROM "inv"."T_Requerimiento" rq
		WHERE rq."IdDocumentoInventario" IS NOT NULL
	) doc
	JOIN "inv"."T_RequerimientoDetalle" rd
		ON rd."IdRequerimiento" = doc."IdRequerimiento"
		AND rd."IdVehiculo" IS NOT NULL
		AND rd."Estado" = TRUE
	/* Sin lineas del mismo producto SIN placa: si las hubiera, atribuiria la
	   placa tambien a los movimientos de esas lineas. */
	WHERE NOT EXISTS (
		SELECT 1 FROM "inv"."T_RequerimientoDetalle" rd2
		WHERE rd2."IdRequerimiento" = doc."IdRequerimiento"
		  AND rd2."IdProducto" = rd."IdProducto"
		  AND rd2."Estado" = TRUE
		  AND rd2."IdVehiculo" IS NULL
	)
	GROUP BY doc."IdDocumento", rd."IdProducto"
	HAVING COUNT(DISTINCT rd."IdVehiculo") = 1
)
UPDATE "inv"."T_MovimientoStock" m
SET "IdVehiculo" = a."IdVehiculo"
FROM "atribucion" a
WHERE m."IdVehiculo" IS NULL
  AND m."IdDocumentoInventario" = a."IdDocumento"
  AND m."IdProducto" = a."IdProducto";

ALTER TABLE "inv"."T_MovimientoStock" ENABLE TRIGGER "TR_T_MovimientoStock_BloquearUpdate";
