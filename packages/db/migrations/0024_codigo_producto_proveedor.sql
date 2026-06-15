/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: T_Producto.CodigoProductoProveedor + inv.FnGuardarProducto (REPLACE)
	Tipo de Cambio: ALTER + REPLACE - código del producto en el proveedor
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: Código con el que el proveedor identifica el producto (el que se
	             usa al comprar, ej. 'X123'). Campo distinto del código de barras.
	             Nota: hoy es un solo código por producto; si se necesita uno por
	             proveedor, migrar a una puente producto↔proveedor.
*/
ALTER TABLE "inv"."T_Producto"
	ADD COLUMN IF NOT EXISTS "CodigoProductoProveedor" VARCHAR(60);

COMMENT ON COLUMN "inv"."T_Producto"."CodigoProductoProveedor" IS 'Código del producto en el proveedor (el que se brinda al comprar). Distinto del código de barras.';

/* FnGuardarProducto: incluir CodigoProductoProveedor en alta y edición */
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
BEGIN
	"vUsuario"   = COALESCE(auth.uid()::TEXT, 'API');
	"vId"        = NULLIF("PProducto"->>'Id', '')::UUID;
	"vEsGeneral" = COALESCE(("PProducto"->>'EsGeneral')::BOOLEAN, FALSE);
	"vTipos"     = COALESCE("PProducto"->'IdsTipoEquipo', '[]'::JSONB);
	"vCantTipos" = JSONB_ARRAY_LENGTH("vTipos");

	IF "vEsGeneral" AND "vCantTipos" > 0 THEN
		RAISE EXCEPTION 'Un producto general no lleva tipos de equipo.';
	END IF;
	IF NOT "vEsGeneral" AND "vCantTipos" = 0 THEN
		RAISE EXCEPTION 'Elige al menos un tipo de equipo o marca el producto como general.';
	END IF;

	IF "vId" IS NULL THEN
		INSERT INTO "inv"."T_Producto"
		(
			"Sku","Nombre","IdCategoria","IdUnidadMedida","StockMinimo",
			"CodigoBarra","CodigoProductoProveedor","Atributos","EsGeneral",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"PProducto"->>'Sku',
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
		SET "Sku"                     = "PProducto"->>'Sku',
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

COMMENT ON FUNCTION "inv"."FnGuardarProducto"(JSONB) IS 'Crea (sin Id) o edita (con Id) un producto (incluye CodigoProductoProveedor) y reemplaza su compatibilidad por tipo de equipo en una transaccion. Aplica la invariante general XOR tipos.';