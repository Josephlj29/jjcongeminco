/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAtenderRequerimiento (REPLACE, nueva firma)
	Tipo de Cambio: DROP + CREATE - aprobacion con entrega parcial y compra directa
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: La aprobacion ahora recibe el detalle de entrega por linea (JSON),
	             soporta:
	               - Entrega PARCIAL: cantidad entregada <= solicitada por linea.
	               - Modo 'stock': sale del almacen origen (valida stock via ledger).
	               - Modo 'compra' (compra directa): genera una ENTRADA de compra
	                 (proveedor + costo + comprobante) y luego la SALIDA, ambas en el
	                 mismo almacen (neto 0 de stock), valorizadas al costo de compra.
	             SECURITY DEFINER: el aprobador (gerencia/supervision/admin) dispara
	             el movimiento sin necesitar permisos de almacen directos; el control
	             de "quien aprueba" vive en la API (permiso requerimientoAprobar).
	             Guard de segregacion de funciones: el creador no puede aprobar su
	             propio requerimiento (admin exento).
*/

DROP FUNCTION IF EXISTS "inv"."FnAtenderRequerimiento"(UUID, UUID, VARCHAR);

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

	/* 1. Requerimiento pendiente */
	SELECT * INTO "vReq" FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE FOR UPDATE;
	IF "vReq" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;
	IF "vReq"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se aprueban requerimientos pendientes (situacion actual: %).', "vReq"."Situacion";
	END IF;

	/* 2. Segregacion de funciones: el creador no aprueba lo suyo (admin exento) */
	"vRol" = "seg"."FnRolUsuario"();
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vReq"."UsuarioCreacion"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes aprobar un requerimiento que tu mismo creaste.';
	END IF;

	/* 3. Almacen valido */
	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	/* 4. Procesar cada linea de entrega */
	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas')
	LOOP
		"vIdDetalle" = ("vLinea"->>'IdDetalle')::UUID;
		"vModo"      = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"      = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"     = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		/* Cantidad 0 (o nula) = no se entrega esa linea */
		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			CONTINUE;
		END IF;

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

		IF "vCant" > "vSolicitada" THEN
			RAISE EXCEPTION 'No puedes entregar mas de lo solicitado en %: solicitado %, intento %.',
				"vNombreProd", "vSolicitada", "vCant";
		END IF;

		/* Toda linea entregada va a la SALIDA */
		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', "vCant");

		/* Compra directa: ademas alimenta la ENTRADA (con costo) */
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

	/* 5. Entrada de compra directa (si hay) -> sube stock + promedio al costo */
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

	/* 6. Salida de consumo (todas las lineas entregadas), valorizada al promedio */
	"vIdSalida" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "vUbic",
		'IdVehiculo',        "vReq"."IdVehiculo",
		'Referencia',        COALESCE("vReq"."NumeroRequerimiento", 'REQ ' || LEFT("PIdRequerimiento"::TEXT, 8)),
		'Notas',             COALESCE("vNotas", 'Atencion de requerimiento'),
		'Detalle',           "vSalidaDet"
	));

	/* 7. Cerrar requerimiento (enlaza la salida como documento de atencion) */
	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido', "IdDocumentoInventario" = "vIdSalida"
	WHERE "Id" = "PIdRequerimiento";

	RETURN "vIdSalida";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, JSONB) IS 'Aprueba un requerimiento con entrega por linea (parcial y/o compra directa). Modo stock = sale del almacen; modo compra = entrada de compra + salida (neto 0), valorizada al costo. SECURITY DEFINER; el creador no puede aprobar lo suyo (admin exento).';