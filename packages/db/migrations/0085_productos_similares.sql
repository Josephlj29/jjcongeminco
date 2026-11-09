/*
	0085 - Control de duplicados al crear productos.

	Problema: cada usuario describe la misma pieza a su manera, el buscador
	(ILIKE '%frase%') no la encuentra y se crea otra ficha. Ejemplo real:
	"Termostato" existe dos veces (REP-001 y CON-002).

	1. Extensiones pg_trgm (similitud por trigramas) y unaccent (ignorar tildes).
	2. inv."FnNormalizarCodigoProveedor": "90915-YZZD2" y "90915 yzzd2" son el
	   mismo codigo. Los marcadores de "sin codigo" (S/C, vacio, N/A...) no
	   cuentan como codigo.
	3. inv."FnProductosSimilares": antes de guardar, devuelve los productos
	   activos con el mismo codigo de proveedor (Motivo 'codigo') o con nombre
	   parecido (Motivo 'nombre', word_similarity >= 0.55, calibrado contra los
	   443 productos de produccion el 2026-11-07).
	4. Trigger que BLOQUEA guardar un codigo de proveedor que ya tiene otro
	   producto activo (SQLSTATE P0409). Solo se dispara al crear o al CAMBIAR
	   el codigo: los 34 productos que ya comparten codigo hoy (datos sucios del
	   ETL) se pueden seguir editando en sus otros campos sin trabarse.
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

/* ── 2. Normalizacion del codigo de proveedor ── */
CREATE OR REPLACE FUNCTION inv."FnNormalizarCodigoProveedor"("PCodigo" TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = inv, public
AS $$
DECLARE
	vCodigo TEXT := upper(regexp_replace(coalesce("PCodigo", ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
	IF vCodigo IN ('', '0', 'SC', 'SM', 'SN', 'NA', 'NN', 'SINCODIGO', 'SINCOD', 'NOAPLICA', 'GENERICO') THEN
		RETURN NULL;
	END IF;
	RETURN vCodigo;
END;
$$;

COMMENT ON FUNCTION inv."FnNormalizarCodigoProveedor"(TEXT) IS
	'Codigo de proveedor comparable: mayusculas, sin espacios ni signos. NULL si es un marcador de "sin codigo" (S/C, N/A, vacio).';

GRANT EXECUTE ON FUNCTION inv."FnNormalizarCodigoProveedor"(TEXT) TO authenticated;

/* ── 3. Productos parecidos ── */
CREATE OR REPLACE FUNCTION inv."FnProductosSimilares"(
	"PNombre" TEXT,
	"PCodigoProveedor" TEXT DEFAULT NULL,
	"PIdExcluir" UUID DEFAULT NULL
)
RETURNS TABLE (
	"Id" UUID,
	"Sku" TEXT,
	"Nombre" TEXT,
	"CodigoProductoProveedor" TEXT,
	"Motivo" TEXT,
	"Similitud" NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = inv, extensions, public
AS $$
	WITH entrada AS (
		SELECT
			extensions.unaccent(lower(btrim(coalesce("PNombre", '')))) AS nombre,
			inv."FnNormalizarCodigoProveedor"("PCodigoProveedor") AS codigo
	),
	candidatos AS (
		SELECT
			p."Id",
			p."Sku"::TEXT AS "Sku",
			p."Nombre"::TEXT AS "Nombre",
			p."CodigoProductoProveedor"::TEXT AS "CodigoProductoProveedor",
			(e.codigo IS NOT NULL
				AND inv."FnNormalizarCodigoProveedor"(p."CodigoProductoProveedor") = e.codigo) AS mismo_codigo,
			CASE WHEN length(e.nombre) >= 3
				THEN extensions.word_similarity(e.nombre, extensions.unaccent(lower(p."Nombre")))
				ELSE 0 END AS ws,
			CASE WHEN length(e.nombre) >= 3
				THEN extensions.similarity(e.nombre, extensions.unaccent(lower(p."Nombre")))
				ELSE 0 END AS s
		FROM inv."T_Producto" p
		CROSS JOIN entrada e
		WHERE p."Estado"
			AND ("PIdExcluir" IS NULL OR p."Id" <> "PIdExcluir")
	)
	SELECT
		c."Id",
		c."Sku",
		c."Nombre",
		c."CodigoProductoProveedor",
		CASE WHEN c.mismo_codigo THEN 'codigo' ELSE 'nombre' END,
		round((CASE WHEN c.mismo_codigo THEN 1 ELSE c.ws END)::NUMERIC, 2)
	FROM candidatos c
	WHERE c.mismo_codigo OR c.ws >= 0.55
	ORDER BY c.mismo_codigo DESC, c.ws DESC, c.s DESC
	LIMIT 6;
$$;

COMMENT ON FUNCTION inv."FnProductosSimilares"(TEXT, TEXT, UUID) IS
	'Productos activos que podrian ser el mismo: mismo codigo de proveedor (Motivo codigo) o nombre parecido sin importar tildes ni orden (Motivo nombre).';

GRANT EXECUTE ON FUNCTION inv."FnProductosSimilares"(TEXT, TEXT, UUID) TO authenticated;

/* ── 4. Bloqueo de codigo de proveedor repetido ── */
CREATE OR REPLACE FUNCTION inv."FnValidarCodigoProveedorUnico"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = inv, public
AS $$
DECLARE
	vCodigo TEXT := inv."FnNormalizarCodigoProveedor"(NEW."CodigoProductoProveedor");
	vSku TEXT;
	vNombre TEXT;
BEGIN
	IF vCodigo IS NULL OR NOT NEW."Estado" THEN
		RETURN NEW;
	END IF;

	-- En edicion solo se valida si el codigo CAMBIO: los pares que ya comparten
	-- codigo hoy no deben trabarse al editar otro campo.
	IF TG_OP = 'UPDATE'
		AND inv."FnNormalizarCodigoProveedor"(OLD."CodigoProductoProveedor") IS NOT DISTINCT FROM vCodigo THEN
		RETURN NEW;
	END IF;

	SELECT p."Sku"::TEXT, p."Nombre" INTO vSku, vNombre
	FROM inv."T_Producto" p
	WHERE p."Estado"
		AND p."Id" <> NEW."Id"
		AND inv."FnNormalizarCodigoProveedor"(p."CodigoProductoProveedor") = vCodigo
	ORDER BY p."Sku"
	LIMIT 1;

	IF vSku IS NOT NULL THEN
		RAISE EXCEPTION 'El código de proveedor % ya está registrado en % (%). Si es el mismo repuesto, usa ese producto; si no, corrige el código.',
			btrim(NEW."CodigoProductoProveedor"), vSku, vNombre
			USING ERRCODE = 'P0409';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "TR_T_Producto_CodigoProveedorUnico"
	BEFORE INSERT OR UPDATE OF "CodigoProductoProveedor" ON inv."T_Producto"
	FOR EACH ROW EXECUTE FUNCTION inv."FnValidarCodigoProveedorUnico"();
