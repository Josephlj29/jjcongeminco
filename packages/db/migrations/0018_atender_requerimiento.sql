/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAtenderRequerimiento + inv.FnAnularRequerimiento
	Tipo de Cambio: CREATE - flujo de aprobacion de requerimientos
	Autor: Equipo Desarrollo
	Fecha: 2026-06-13
	Descripcion: Aprobar un requerimiento genera la salida de stock que lo atiende.
	             Reusa FnRegistrarDocumentoInventario (crea + confirma el documento,
	             valoriza al costo promedio movil vigente). Marca el requerimiento
	             como 'atendido', enlaza el documento y registra CantidadAtendida.
	             Valida stock suficiente en el almacen de origen (todo o nada): el
	             ledger no impide saldos negativos, asi que la validacion vive aqui.
	             SECURITY INVOKER: respeta RLS (escritura de documentos = los mismos
	             roles que registran salidas en Movimientos).
*/

/* ---------------------------------------------------------------------
	FnAtenderRequerimiento: aprueba y genera la salida valorizada.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnAtenderRequerimiento"
(
	"PIdRequerimiento"   UUID,
	"PIdUbicacionOrigen" UUID,
	"PNotas"             VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vRequerimiento" "inv"."T_Requerimiento";
	"vDetalleJson"   JSONB;
	"vDocumento"     JSONB;
	"vIdDocumento"   UUID;
	"vFaltante"      TEXT;
BEGIN
	/* 1. Requerimiento existente, activo y pendiente (bloqueo de fila) */
	SELECT * INTO "vRequerimiento"
	FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE
	FOR UPDATE;

	IF "vRequerimiento" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;

	IF "vRequerimiento"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se aprueban requerimientos pendientes (situacion actual: %).', "vRequerimiento"."Situacion";
	END IF;

	/* 2. Almacen de origen valido */
	IF NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion"
		WHERE "Id" = "PIdUbicacionOrigen" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	/* 3. Stock suficiente en el origen (todo o nada). El ledger no bloquea
	      saldos negativos, por eso validamos aqui antes de mover nada. */
	SELECT string_agg(
		P."Nombre" || ' (disponible ' || COALESCE("S"."CantidadDisponible", 0)
		|| ', solicita ' || D."Cantidad" || ')',
		'; ' ORDER BY P."Nombre"
	)
	INTO "vFaltante"
	FROM "inv"."T_RequerimientoDetalle" D
	JOIN "inv"."T_Producto" P ON P."Id" = D."IdProducto"
	LEFT JOIN "inv"."T_SaldoStock" "S"
		ON "S"."IdProducto" = D."IdProducto"
		AND "S"."IdUbicacion" = "PIdUbicacionOrigen"
	WHERE D."IdRequerimiento" = "PIdRequerimiento"
	  AND D."Estado" = TRUE
	  AND COALESCE("S"."CantidadDisponible", 0) < D."Cantidad";

	IF "vFaltante" IS NOT NULL THEN
		RAISE EXCEPTION 'Stock insuficiente en el almacen seleccionado: %', "vFaltante";
	END IF;

	/* 4. Detalle de la salida desde las lineas del requerimiento (sin costo:
	      la confirmacion toma el costo promedio movil vigente). */
	SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
		'IdProducto', D."IdProducto",
		'Cantidad',   D."Cantidad",
		'Notas',      D."Notas"
	))
	INTO "vDetalleJson"
	FROM "inv"."T_RequerimientoDetalle" D
	WHERE D."IdRequerimiento" = "PIdRequerimiento" AND D."Estado" = TRUE;

	IF "vDetalleJson" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no tiene lineas para atender.';
	END IF;

	/* 5. Documento de salida + confirmacion (genera el ledger valorizado) */
	"vDocumento" = JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "PIdUbicacionOrigen",
		'IdVehiculo',        "vRequerimiento"."IdVehiculo",
		'Referencia',        COALESCE("vRequerimiento"."NumeroRequerimiento", 'REQ ' || LEFT("PIdRequerimiento"::TEXT, 8)),
		'Notas',             COALESCE("PNotas", 'Atencion de requerimiento ' || COALESCE("vRequerimiento"."NumeroRequerimiento", LEFT("PIdRequerimiento"::TEXT, 8))),
		'Detalle',           "vDetalleJson"
	);

	"vIdDocumento" = "inv"."FnRegistrarDocumentoInventario"("vDocumento");

	/* 6. Cerrar el requerimiento: atendido + enlace al documento */
	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido',
		"IdDocumentoInventario" = "vIdDocumento"
	WHERE "Id" = "PIdRequerimiento";

	/* 7. Registrar la cantidad atendida en cada linea (atencion total) */
	UPDATE "inv"."T_RequerimientoDetalle"
	SET "CantidadAtendida" = "Cantidad"
	WHERE "IdRequerimiento" = "PIdRequerimiento" AND "Estado" = TRUE;

	RETURN "vIdDocumento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, UUID, VARCHAR) IS 'Aprueba un requerimiento pendiente: genera la salida valorizada desde el almacen origen, lo marca atendido y enlaza el documento. Valida stock suficiente (todo o nada).';

/* ---------------------------------------------------------------------
	FnAnularRequerimiento: rechaza un requerimiento pendiente.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnAnularRequerimiento"
(
	"PIdRequerimiento" UUID,
	"PMotivo"          VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	"vSituacion" VARCHAR(15);
BEGIN
	SELECT "Situacion" INTO "vSituacion"
	FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE
	FOR UPDATE;

	IF "vSituacion" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;

	IF "vSituacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se rechazan requerimientos pendientes (situacion actual: %).', "vSituacion";
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

COMMENT ON FUNCTION "inv"."FnAnularRequerimiento"(UUID, VARCHAR) IS 'Rechaza un requerimiento pendiente (situacion = anulado), con motivo opcional anexado a las notas.';
