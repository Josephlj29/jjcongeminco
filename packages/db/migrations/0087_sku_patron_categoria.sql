/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Categoria.PrefijoSku, inv.T_Producto.SkuAnterior,
	        inv.FnGuardarProducto (REPLACE), vistas de stock consolidado (REPLACE)
	Tipo de Cambio: ALTER + DATA + REPLACE
	Autor: Equipo Desarrollo
	Fecha: 2026-11-09
	Descripcion: Los SKU no seguian ningun patron: CON-/REP- heredados de la
	             clasificacion vieja en 20 categorias, abreviaturas sueltas
	             (Fil 01, Filt003, Ret 02, TAPA-001-001) y texto basura de
	             pruebas (Jdjdks, Hjkkbv, 1). Nuevo patron unico:

	                 PREFIJO-NNNN    (FIL-0001, FOC-0012, RET-0003)

	             PREFIJO = T_Categoria.PrefijoSku, 3 letras fijas por categoria.
	                       Si una categoria nueva no lo tiene, se usan las 3
	                       primeras letras de su codigo sin CAT-/FAM-.
	             NNNN    = correlativo de 4 digitos (sigue sin truncar pasado 9999).

	             Regla clave: el SKU es un identificador, no una descripcion.
	             Se asigna al crear y NO cambia si despues se reclasifica el
	             producto (FnGuardarProducto ya lo conservaba en la edicion).

	             Renumeracion: cada producto activo recibe el correlativo segun
	             su antiguedad dentro de su categoria actual (FechaCreacion,
	             desempate por SKU viejo). El SKU viejo queda en SkuAnterior y
	             la busqueda lo sigue encontrando, para etiquetas y Excel viejos.
	             Idempotente: solo toca productos sin SkuAnterior.

	             Todo lo demas (kardex, requerimientos, OT, saldos) referencia el
	             producto por Id, asi que el cambio no toca el historial.
*/

/* ── 1. Prefijo por categoria ── */
ALTER TABLE inv."T_Categoria" ADD COLUMN IF NOT EXISTS "PrefijoSku" VARCHAR(4);

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_T_Categoria_PrefijoSku') THEN
		ALTER TABLE inv."T_Categoria"
			ADD CONSTRAINT "CK_T_Categoria_PrefijoSku" CHECK ("PrefijoSku" ~ '^[A-Z]{3}$');
	END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_T_Categoria_PrefijoSku"
	ON inv."T_Categoria" ("PrefijoSku")
	WHERE "Estado" = true AND "PrefijoSku" IS NOT NULL;

COMMENT ON COLUMN inv."T_Categoria"."PrefijoSku" IS
	'3 letras del SKU autogenerado (PREFIJO-NNNN). Unico entre categorias activas.';

UPDATE inv."T_Categoria" c
SET "PrefijoSku" = m.prefijo, "UsuarioModificacion" = 'MIGRACION-0087'
FROM (VALUES
	('CAT-CARROCERIA', 'CAR'), ('CAT-CINTA', 'CIN'), ('CAT-COMBUSTIBLE', 'CMB'),
	('CAT-CORREA', 'COR'), ('CAT-DIRECCION', 'DIR'), ('CAT-ELECTRICO', 'ELE'),
	('CAT-EMERGENCIA', 'EMG'), ('CAT-EPP', 'EPP'), ('CAT-EQUIPO-TALLER', 'TAL'),
	('CAT-ESLINGA', 'ESL'), ('CAT-FIJACION', 'FIJ'), ('CAT-FILTRO', 'FIL'),
	('CAT-FLUIDO', 'FLU'), ('CAT-FOCO', 'FOC'), ('CAT-FRENO', 'FRE'),
	('CAT-FUSIBLE', 'FUS'), ('CAT-HERRAMIENTA', 'HER'), ('CAT-HIDRAULICO', 'HID'),
	('CAT-IMPLEMENTO', 'IMP'), ('CAT-LIMPIEZA', 'LIM'), ('CAT-LLANTA', 'NEU'),
	('CAT-LUBRICANTE', 'LUB'), ('CAT-MEDICION', 'MED'), ('CAT-MOTOR', 'MOT'),
	('CAT-MUELLE', 'MUE'), ('CAT-NEUMATICO', 'VUL'), ('CAT-QUIMICO', 'QUI'),
	('CAT-RELAY', 'REL'), ('CAT-RETEN', 'RET'), ('CAT-RODAMIENTO', 'ROD'),
	('CAT-SELLANTE', 'SEL'), ('CAT-SUSPENSION', 'SUS'), ('CAT-TERMINAL', 'TER'),
	('CAT-TRANSMISION', 'TRA')
) AS m(codigo, prefijo)
WHERE c."Codigo" = m.codigo AND c."Estado" AND c."PrefijoSku" IS NULL;

/* ── 2. SKU anterior ── */
ALTER TABLE inv."T_Producto" ADD COLUMN IF NOT EXISTS "SkuAnterior" TEXT;

COMMENT ON COLUMN inv."T_Producto"."SkuAnterior" IS
	'SKU que tenia el producto antes de la normalizacion PREFIJO-NNNN (0087). Solo para busqueda y trazabilidad.';

/* ── 3. Renumeracion ── */
DO $$
DECLARE
	vSinPrefijo INT;
	vActualizados INT;
BEGIN
	SELECT count(*) INTO vSinPrefijo
	FROM inv."T_Producto" p JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
	WHERE p."Estado" AND p."SkuAnterior" IS NULL AND c."PrefijoSku" IS NULL;
	IF vSinPrefijo > 0 THEN
		RAISE EXCEPTION '0087: % productos activos estan en categorias sin PrefijoSku', vSinPrefijo;
	END IF;

	-- Un choque con un SKU existente lo frena UQ_T_Producto_Sku y aborta todo.
	WITH nuevos AS (
		SELECT p."Id", p."Sku"::TEXT AS "SkuViejo",
			c."PrefijoSku" || '-' || LPAD((
				-- Arranca despues del mayor correlativo ya usado con el patron nuevo
				-- (0 hoy; deja la migracion segura si se reaplica tras altas nuevas).
				COALESCE((SELECT max(substring(x."Sku" FROM 5)::INT) FROM inv."T_Producto" x
					WHERE x."Sku" ~* ('^' || c."PrefijoSku" || '-[0-9]{4,}$')), 0)
				+ row_number() OVER (PARTITION BY c."PrefijoSku" ORDER BY p."FechaCreacion", p."Sku")
			)::TEXT, 4, '0') AS "SkuNuevo"
		FROM inv."T_Producto" p JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
		WHERE p."Estado" AND p."SkuAnterior" IS NULL AND p."Sku" !~* '^[A-Z]{3}-[0-9]{4,}$'
	)
	UPDATE inv."T_Producto" p
	SET "SkuAnterior" = n."SkuViejo",
		"Sku" = n."SkuNuevo",
		"UsuarioModificacion" = 'MIGRACION-0087'
	FROM nuevos n
	WHERE p."Id" = n."Id";
	GET DIAGNOSTICS vActualizados = ROW_COUNT;
	RAISE NOTICE '0087: % SKU normalizados', vActualizados;
END $$;

/* ── 4. Generacion del SKU en altas ── */
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
		/* SKU: si viene vacio, se autogenera PREFIJO-NNNN desde la categoria. */
		IF "vSku" IS NULL THEN
			SELECT "Codigo", "PrefijoSku" INTO "vCodCat", "vPrefijo"
			FROM "inv"."T_Categoria"
			WHERE "Id" = ("PProducto"->>'IdCategoria')::UUID;

			IF "vCodCat" IS NULL THEN
				RAISE EXCEPTION 'No se pudo resolver la categoría para generar el SKU.';
			END IF;

			IF "vPrefijo" IS NULL THEN
				"vPrefijo" = UPPER(LEFT(REGEXP_REPLACE(
					REGEXP_REPLACE("vCodCat", '^(CAT|FAM)-', '', 'i'),
					'[^A-Za-z0-9]+', '', 'g'
				), 3));
			END IF;
			IF "vPrefijo" IS NULL OR "vPrefijo" = '' THEN
				RAISE EXCEPTION 'El código de la categoría "%" no sirve para armar el SKU.', "vCodCat";
			END IF;

			/* Primer correlativo libre contra TODA la tabla (tambien bajas).
			   LPAD trunca strings mas largos, por eso el CASE al pasar de 9999. */
			LOOP
				"vSku" = "vPrefijo" || '-' ||
					CASE WHEN "vCorr" < 10000
						THEN LPAD("vCorr"::TEXT, 4, '0')
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

COMMENT ON FUNCTION "inv"."FnGuardarProducto"(JSONB) IS 'Alta/edicion de producto con compatibilidad (general XOR tipos) en una transaccion. Si el alta llega sin Sku, lo autogenera como PREFIJO-NNNN (T_Categoria.PrefijoSku, o 3 letras del codigo; primer correlativo libre contra toda la tabla, incluidas bajas). En edicion, un Sku ausente conserva el actual: el SKU no cambia al reclasificar.';

/* ── 5. Vistas: SkuAnterior al final (CREATE OR REPLACE no permite reordenar) ── */
CREATE OR REPLACE VIEW inv."V_Producto_StockConsolidadoTodos"
WITH (security_invoker = true) AS
SELECT
	p."Id" AS "IdProducto",
	p."Sku",
	p."Nombre" AS "NombreProducto",
	c."Nombre" AS "NombreCategoria",
	um."Codigo" AS "CodigoUnidad",
	p."StockMinimo",
	COALESCE(sum(s."CantidadDisponible"), 0::numeric) AS "StockTotal",
	COALESCE(sum(s."CantidadDisponible"), 0::numeric) < p."StockMinimo" AS "BajoMinimo",
	p."IdCategoria",
	p."CostoPromedio",
	(SELECT pi."Url"
		FROM inv."T_ProductoImagen" pi
		WHERE pi."IdProducto" = p."Id" AND pi."Estado" = true
		ORDER BY pi."EsPrincipal" DESC, pi."Orden"
		LIMIT 1) AS "UrlImagenPrincipal",
	p."EsGeneral",
	p."CodigoProductoProveedor",
	max(s."FechaModificacion") AS "UltimoMovimiento",
	p."DadoDeBaja",
	p."FechaBaja",
	seg."FnNombreUsuario"(p."UsuarioBaja") AS "UsuarioBaja",
	p."MotivoBaja",
	p."IdProductoUnificado",
	(SELECT u."Sku"::TEXT FROM inv."T_Producto" u WHERE u."Id" = p."IdProductoUnificado") AS "SkuUnificado",
	p."SkuAnterior"
FROM inv."T_Producto" p
	JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
	JOIN inv."T_UnidadMedida" um ON um."Id" = p."IdUnidadMedida"
	LEFT JOIN inv."T_SaldoStock" s ON s."IdProducto" = p."Id"
WHERE p."Estado" = true
GROUP BY p."Id", p."Sku", p."Nombre", c."Nombre", um."Codigo", p."StockMinimo", p."IdCategoria",
	p."CostoPromedio", p."EsGeneral", p."CodigoProductoProveedor";

CREATE OR REPLACE VIEW inv."V_Producto_StockConsolidado"
WITH (security_invoker = true) AS
SELECT
	t."IdProducto", t."Sku", t."NombreProducto", t."NombreCategoria", t."CodigoUnidad",
	t."StockMinimo", t."StockTotal", t."BajoMinimo", t."IdCategoria", t."CostoPromedio",
	t."UrlImagenPrincipal", t."EsGeneral", t."CodigoProductoProveedor", t."UltimoMovimiento",
	t."DadoDeBaja", t."FechaBaja", t."UsuarioBaja", t."MotivoBaja", t."IdProductoUnificado", t."SkuUnificado",
	t."SkuAnterior"
FROM inv."V_Producto_StockConsolidadoTodos" t
WHERE NOT t."DadoDeBaja";
