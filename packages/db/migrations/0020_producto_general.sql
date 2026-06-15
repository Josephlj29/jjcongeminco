/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: T_Producto.EsGeneral + inv.FnGuardarProducto + guard de integridad
	Tipo de Cambio: ALTER + CREATE/REPLACE - modelo de compatibilidad refinado
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: La compatibilidad producto<->tipo de equipo vive en el PRODUCTO
	             (fitment), no en la categoria (taxonomia). "General" pasa a ser un
	             flag intensional (EsGeneral = aplica a todos los tipos, presentes y
	             futuros), en vez de la convencion implicita "sin filas en la puente".
	             Invariante: un producto es general XOR tiene >=1 tipo especifico.
	             FnGuardarProducto crea/edita el producto y reemplaza su compatibilidad
	             en una sola transaccion (unico camino de escritura desde la app).
*/

/* 1. Flag explicito de producto general -------------------------------- */
ALTER TABLE "inv"."T_Producto"
	ADD COLUMN IF NOT EXISTS "EsGeneral" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "inv"."T_Producto"."EsGeneral" IS 'TRUE = compatible con cualquier tipo de equipo (presente o futuro). Si es TRUE, no lleva filas en T_ProductoTipoEquipo.';

/* 2. Guard de integridad: un producto general no lleva tipos ----------- */
CREATE OR REPLACE FUNCTION "inv"."FnBloquearTipoEnProductoGeneral"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF (SELECT "EsGeneral" FROM "inv"."T_Producto" WHERE "Id" = NEW."IdProducto") THEN
		RAISE EXCEPTION 'Un producto marcado como general no puede tener tipos de equipo asociados.';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "TR_T_ProductoTipoEquipo_BloquearGeneral" ON "inv"."T_ProductoTipoEquipo";
CREATE TRIGGER "TR_T_ProductoTipoEquipo_BloquearGeneral"
	BEFORE INSERT ON "inv"."T_ProductoTipoEquipo"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnBloquearTipoEnProductoGeneral"();

/* 3. Alta/edicion atomica del producto + su compatibilidad ------------- */
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

	/* Invariante: general XOR tipos especificos */
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
			"CodigoBarra","Atributos","EsGeneral","UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"PProducto"->>'Sku',
			"PProducto"->>'Nombre',
			("PProducto"->>'IdCategoria')::UUID,
			("PProducto"->>'IdUnidadMedida')::UUID,
			COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, 0),
			NULLIF("PProducto"->>'CodigoBarra', ''),
			COALESCE("PProducto"->'Atributos', '{}'::JSONB),
			"vEsGeneral",
			"vUsuario",
			"vUsuario"
		)
		RETURNING "Id" INTO "vId";
	ELSE
		UPDATE "inv"."T_Producto"
		SET "Sku"                 = "PProducto"->>'Sku',
			"Nombre"              = "PProducto"->>'Nombre',
			"IdCategoria"         = ("PProducto"->>'IdCategoria')::UUID,
			"IdUnidadMedida"      = ("PProducto"->>'IdUnidadMedida')::UUID,
			"StockMinimo"         = COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, "StockMinimo"),
			"CodigoBarra"         = NULLIF("PProducto"->>'CodigoBarra', ''),
			"Atributos"           = COALESCE("PProducto"->'Atributos', "Atributos"),
			"EsGeneral"           = "vEsGeneral",
			"UsuarioModificacion" = "vUsuario"
		WHERE "Id" = "vId";

		IF NOT FOUND THEN
			RAISE EXCEPTION 'El producto no existe.';
		END IF;
	END IF;

	/* Reemplaza la compatibilidad. General => sin filas (el guard lo respalda). */
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

COMMENT ON FUNCTION "inv"."FnGuardarProducto"(JSONB) IS 'Crea (sin Id) o edita (con Id) un producto y reemplaza su compatibilidad por tipo de equipo en una transaccion. Aplica la invariante general XOR tipos.';

/* 4. Asociacion masiva por categoria: consistente con EsGeneral -------- */
CREATE OR REPLACE FUNCTION "inv"."FnAsociarCategoriaTipoEquipo"
(
	"PIdCategoria"   UUID
	,"PIdTipoEquipo" UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vInsertados" INTEGER;
BEGIN
	/* Asociar a un tipo concreto implica que ya no son generales. */
	UPDATE "inv"."T_Producto"
	SET "EsGeneral" = FALSE
	WHERE "IdCategoria" = "PIdCategoria" AND "Estado" = TRUE AND "EsGeneral" = TRUE;

	INSERT INTO "inv"."T_ProductoTipoEquipo" ("IdProducto","IdTipoEquipo")
	SELECT P."Id", "PIdTipoEquipo"
	FROM "inv"."T_Producto" P
	WHERE P."IdCategoria" = "PIdCategoria" AND P."Estado" = TRUE
	ON CONFLICT ("IdProducto","IdTipoEquipo") DO NOTHING;

	GET DIAGNOSTICS "vInsertados" = ROW_COUNT;
	RETURN "vInsertados";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAsociarCategoriaTipoEquipo"(UUID, UUID) IS 'Asocia todos los productos activos de una categoria a un tipo (los marca no-generales). Idempotente, retorna insertados.';

/* 5. Vista de stock con EsGeneral (para grilla / form / filtros) ------- */
CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado" AS
SELECT
	p."Id" AS "IdProducto",
	p."Sku",
	p."Nombre" AS "NombreProducto",
	c."Nombre" AS "NombreCategoria",
	um."Codigo" AS "CodigoUnidad",
	p."StockMinimo",
	COALESCE(SUM(s."CantidadDisponible"), 0::NUMERIC) AS "StockTotal",
	COALESCE(SUM(s."CantidadDisponible"), 0::NUMERIC) < p."StockMinimo" AS "BajoMinimo",
	p."IdCategoria",
	p."CostoPromedio",
	(SELECT pi."Url"
		FROM inv."T_ProductoImagen" pi
		WHERE pi."IdProducto" = p."Id" AND pi."Estado" = TRUE
		ORDER BY pi."EsPrincipal" DESC, pi."Orden"
		LIMIT 1) AS "UrlImagenPrincipal",
	p."EsGeneral"
FROM inv."T_Producto" p
	JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
	JOIN inv."T_UnidadMedida" um ON um."Id" = p."IdUnidadMedida"
	LEFT JOIN inv."T_SaldoStock" s ON s."IdProducto" = p."Id"
WHERE p."Estado" = TRUE
GROUP BY p."Id", p."Sku", p."Nombre", c."Nombre", um."Codigo", p."StockMinimo", p."IdCategoria", p."CostoPromedio", p."EsGeneral";
