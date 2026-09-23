/*
	Prueba de integración SQL — migración 0073
	Objeto: inv.FnAplicarMovimientoSaldo (guard de saldo no-negativo)

	Verifica que el rechazo por stock insuficiente sea LEGIBLE para quien está en
	almacén: nombre + SKU del producto, nombre de la ubicación, disponible,
	solicitado y faltante. Y que NO aparezcan los UUID, que es lo que se le
	mostraba al usuario en el toast antes de 0073.

	Cómo correrla (psql o el SQL editor de Supabase). Todo ocurre dentro del
	bloque y termina en ROLLBACK vía RAISE EXCEPTION: no persiste nada.

		\i packages/db/tests/0073_stock_insuficiente_legible.sql

	Resultado esperado: una única excepción final con el texto
	"OK 0073: ... (rollback de la prueba)". Cualquier otra cosa es un fallo y el
	mensaje enumera qué aserción no se cumplió.

	Contra 0019 (antes del fix) esta prueba FALLA en las aserciones 2, 3, 4 y 6:
	el mensaje viejo era "Stock insuficiente: el movimiento dejaria el saldo en
	-3.000 (producto <uuid>, ubicacion <uuid>)".
*/
DO $$
DECLARE
	"vIdCategoria" UUID;
	"vIdUnidad"    UUID;
	"vIdProducto"  UUID;
	"vIdUbicacion" UUID;
	"vNombre"      TEXT := 'Faro de prueba 0073';
	"vSku"         TEXT := 'TEST-0073-FARO';
	"vUbicacion"   TEXT := 'Almacen de prueba 0073';
	"vMensaje"     TEXT;
	"vEstado"      TEXT;
	"vFallas"      TEXT[] := ARRAY[]::TEXT[];
BEGIN
	/* ── Datos de prueba ───────────────────────────────────────────────── */
	SELECT "Id" INTO "vIdCategoria" FROM "inv"."T_Categoria" WHERE "Estado" = TRUE LIMIT 1;
	SELECT "Id" INTO "vIdUnidad"    FROM "inv"."T_UnidadMedida" WHERE "Estado" = TRUE LIMIT 1;
	IF "vIdCategoria" IS NULL OR "vIdUnidad" IS NULL THEN
		RAISE EXCEPTION 'La base no tiene catálogo mínimo (categoría/unidad) para la prueba.';
	END IF;

	INSERT INTO "inv"."T_Ubicacion" ("Codigo", "Nombre")
	VALUES ('TEST-0073', "vUbicacion")
	RETURNING "Id" INTO "vIdUbicacion";

	INSERT INTO "inv"."T_Producto" ("Sku", "Nombre", "IdCategoria", "IdUnidadMedida")
	VALUES ("vSku", "vNombre", "vIdCategoria", "vIdUnidad")
	RETURNING "Id" INTO "vIdProducto";

	/* Ingreso de 1 unidad: el saldo queda en 1. */
	PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',      'entrada',
		'FechaDocumento',     to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionDestino', "vIdUbicacion",
		'Referencia',         'Prueba 0073',
		'Detalle',            JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
			'IdProducto', "vIdProducto", 'Cantidad', 1, 'CostoUnitario', 10
		))
	));

	/* ── Acto: sacar 4 con 1 disponible ────────────────────────────────── */
	BEGIN
		PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			'TipoDocumento',     'salida',
			'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionOrigen', "vIdUbicacion",
			'Referencia',        'Prueba 0073',
			'Detalle',           JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
				'IdProducto', "vIdProducto", 'Cantidad', 4
			))
		));
		"vFallas" = "vFallas" || 'El guard NO rechazó el egreso que deja el saldo en -3.'::TEXT;
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT, "vEstado" = RETURNED_SQLSTATE;
	END;

	/* ── Aserciones ────────────────────────────────────────────────────── */
	IF "vMensaje" IS NOT NULL THEN
		/* 1. El SQLSTATE no cambia: es lo que mapearErrorNegocio traduce a 409. */
		IF "vEstado" <> '23514' THEN
			"vFallas" = "vFallas" || FORMAT('1) SQLSTATE esperado 23514 (check_violation), llegó %s.', "vEstado");
		END IF;

		/* 2-3. El usuario reconoce el producto por nombre y SKU, no por UUID. */
		IF POSITION("vNombre" IN "vMensaje") = 0 THEN
			"vFallas" = "vFallas" || FORMAT('2) El mensaje no nombra el producto "%s".', "vNombre");
		END IF;
		IF POSITION("vSku" IN "vMensaje") = 0 THEN
			"vFallas" = "vFallas" || FORMAT('3) El mensaje no trae el SKU %s.', "vSku");
		END IF;

		/* 4. Ningún UUID a la vista: es el bug que se está corrigiendo. */
		IF POSITION("vIdProducto"::TEXT IN "vMensaje") > 0 THEN
			"vFallas" = "vFallas" || '4) El mensaje expone el UUID del producto.'::TEXT;
		END IF;
		IF POSITION("vIdUbicacion"::TEXT IN "vMensaje") > 0 THEN
			"vFallas" = "vFallas" || '4) El mensaje expone el UUID de la ubicación.'::TEXT;
		END IF;

		/* 5. Dónde faltó el stock. */
		IF POSITION("vUbicacion" IN "vMensaje") = 0 THEN
			"vFallas" = "vFallas" || FORMAT('5) El mensaje no nombra la ubicación "%s".', "vUbicacion");
		END IF;

		/* 6. Cuánto hay, cuánto se pide y cuánto falta, sin ceros de relleno. */
		IF POSITION('disponible 1,' IN "vMensaje") = 0 THEN
			"vFallas" = "vFallas" || '6) El mensaje no informa "disponible 1".'::TEXT;
		END IF;
		IF POSITION('sacar 4' IN "vMensaje") = 0 THEN
			"vFallas" = "vFallas" || '6) El mensaje no informa que se intenta sacar 4.'::TEXT;
		END IF;
		IF POSITION('faltan 3' IN "vMensaje") = 0 THEN
			"vFallas" = "vFallas" || '6) El mensaje no informa que faltan 3.'::TEXT;
		END IF;
	END IF;

	IF ARRAY_LENGTH("vFallas", 1) > 0 THEN
		RAISE EXCEPTION E'FALLA 0073:\n  - %\n\nMensaje recibido: %',
			ARRAY_TO_STRING("vFallas", E'\n  - '), COALESCE("vMensaje", '(ninguno)');
	END IF;

	RAISE EXCEPTION 'OK 0073: "%" (rollback de la prueba)', "vMensaje";
END $$;
