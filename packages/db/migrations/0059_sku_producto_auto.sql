/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnGuardarProducto (REPLACE)
	Tipo de Cambio: REPLACE - autogeneracion del SKU en el servidor
	Autor: Equipo Desarrollo
	Fecha: 2026-08-29
	Descripcion: Tipear el SKU a mano era tedioso y propenso a duplicados. Ahora,
	             cuando el alta llega sin Sku (vacio o ausente), el servidor lo
	             genera con la nomenclatura:

	                 PREFIJO-NNN

	             PREFIJO = codigo de la categoria sin el prefijo CAT-/FAM-,
	                       saneado a alfanumerico (separadores -> guion) y en
	                       mayusculas (CAT-FOCO -> FOCO).
	             NNN     = primer correlativo libre de 3 digitos para ese
	                       prefijo (mismo patron que el N° de orden de
	                       mantenimiento en 0056).

	             El correlativo se compara contra TODA la tabla (incluidos
	             productos dados de baja) para no resucitar SKUs que ya viven
	             en reportes historicos: la serie deja huecos a proposito.
	             Sku es CITEXT, asi que la comparacion es case-insensitive.
	             El indice unico parcial UQ_T_Producto_Sku (0054) queda como
	             red de seguridad final ante una carrera concurrente.

	             Ademas, la rama UPDATE ahora conserva el Sku actual cuando el
	             payload no lo trae (COALESCE): el frontend deja de enviarlo.

	             La importacion masiva (FnImportarProductos) NO cambia: cada
	             fila del Excel sigue trayendo su SKU explicito.
*/

CREATE OR REPLACE FUNCTION "inv"."FnGuardarProducto"
(
	"PProducto" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"        UUID;
	"vEsGeneral" BOOLEAN;
	"vUsuario"   VARCHAR(50);
	"vTipos"     JSONB;
	"vCantTipos" INT;
	"vSku"       TEXT;
	"vCodCat"    TEXT;
	"vPrefijo"   TEXT;
	"vCorr"      INT := 1;
BEGIN
	"vUsuario"   = COALESCE(auth.uid()::TEXT, 'API');
	"vId"        = NULLIF("PProducto"->>'Id', '')::UUID;
	"vEsGeneral" = COALESCE(("PProducto"->>'EsGeneral')::BOOLEAN, FALSE);
	"vTipos"     = COALESCE("PProducto"->'IdsTipoEquipo', '[]'::JSONB);
	"vCantTipos" = JSONB_ARRAY_LENGTH("vTipos");
	"vSku"       = NULLIF(TRIM("PProducto"->>'Sku'), '');

	IF "vEsGeneral" AND "vCantTipos" > 0 THEN
		RAISE EXCEPTION 'Un producto general no lleva tipos de equipo.';
	END IF;
	IF NOT "vEsGeneral" AND "vCantTipos" = 0 THEN
		RAISE EXCEPTION 'Elige al menos un tipo de equipo o marca el producto como general.';
	END IF;

	IF "vId" IS NULL THEN
		/* SKU: si viene vacio, se autogenera PREFIJO-NNN desde la categoria. */
		IF "vSku" IS NULL THEN
			SELECT "Codigo" INTO "vCodCat"
			FROM "inv"."T_Categoria"
			WHERE "Id" = ("PProducto"->>'IdCategoria')::UUID;

			IF "vCodCat" IS NULL THEN
				RAISE EXCEPTION 'No se pudo resolver la categoría para generar el SKU.';
			END IF;

			"vPrefijo" = UPPER(TRIM(BOTH '-' FROM REGEXP_REPLACE(
				REGEXP_REPLACE("vCodCat", '^(CAT|FAM)-', '', 'i'),
				'[^A-Za-z0-9]+', '-', 'g'
			)));
			IF "vPrefijo" IS NULL OR "vPrefijo" = '' THEN
				RAISE EXCEPTION 'El código de la categoría "%" no sirve para armar el SKU.', "vCodCat";
			END IF;

			/* Primer correlativo libre contra TODA la tabla (tambien bajas).
			   LPAD trunca strings mas largos, por eso el CASE al pasar de 999. */
			LOOP
				"vSku" = "vPrefijo" || '-' ||
					CASE WHEN "vCorr" < 1000
						THEN LPAD("vCorr"::TEXT, 3, '0')
						ELSE "vCorr"::TEXT
					END;
				EXIT WHEN NOT EXISTS (
					SELECT 1 FROM "inv"."T_Producto" WHERE "Sku" = "vSku"
				);
				"vCorr" = "vCorr" + 1;
			END LOOP;
		END IF;

		INSERT INTO "inv"."T_Producto"
		(
			"Sku","Nombre","IdCategoria","IdUnidadMedida","StockMinimo",
			"CodigoBarra","CodigoProductoProveedor","Atributos","EsGeneral",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"vSku",
			"PProducto"->>'Nombre',
			("PProducto"->>'IdCategoria')::UUID,
			("PProducto"->>'IdUnidadMedida')::UUID,
			COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, 0),
			NULLIF("PProducto"->>'CodigoBarra', ''),
			NULLIF("PProducto"->>'CodigoProductoProveedor', ''),
			COALESCE("PProducto"->'Atributos', '{}'::JSONB),
			"vEsGeneral",
			"vUsuario",
			"vUsuario"
		)
		RETURNING "Id" INTO "vId";
	ELSE
		UPDATE "inv"."T_Producto"
		SET "Sku"                     = COALESCE("vSku", "Sku"),
			"Nombre"                  = "PProducto"->>'Nombre',
			"IdCategoria"             = ("PProducto"->>'IdCategoria')::UUID,
			"IdUnidadMedida"          = ("PProducto"->>'IdUnidadMedida')::UUID,
			"StockMinimo"             = COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, "StockMinimo"),
			"CodigoBarra"             = NULLIF("PProducto"->>'CodigoBarra', ''),
			"CodigoProductoProveedor" = NULLIF("PProducto"->>'CodigoProductoProveedor', ''),
			"Atributos"               = COALESCE("PProducto"->'Atributos', "Atributos"),
			"EsGeneral"               = "vEsGeneral",
			"UsuarioModificacion"     = "vUsuario"
		WHERE "Id" = "vId";

		IF NOT FOUND THEN
			RAISE EXCEPTION 'El producto no existe.';
		END IF;
	END IF;

	DELETE FROM "inv"."T_ProductoTipoEquipo" WHERE "IdProducto" = "vId";

	IF NOT "vEsGeneral" THEN
		INSERT INTO "inv"."T_ProductoTipoEquipo"
			("IdProducto","IdTipoEquipo","UsuarioCreacion","UsuarioModificacion")
		SELECT "vId", t.elem::UUID, "vUsuario", "vUsuario"
		FROM JSONB_ARRAY_ELEMENTS_TEXT("vTipos") AS t(elem);
	END IF;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnGuardarProducto"(JSONB) IS 'Alta/edicion de producto con compatibilidad (general XOR tipos) en una transaccion. Si el alta llega sin Sku, lo autogenera como PREFIJO-NNN a partir del codigo de la categoria (primer correlativo libre contra toda la tabla, incluidas bajas). En edicion, un Sku ausente conserva el actual.';
