/*
	0086 - Dar de baja productos con historial (duplicados ya unificados).

	Problema: el "Eliminar" de 0057 solo procede si el producto no tiene nada
	enlazado. Un duplicado historico siempre tiene kardex, asi que nunca se podia
	sacar de circulacion: seguia apareciendo en el catalogo y en los selectores,
	y la gente le volvia a cargar movimientos.

	"Dar de baja" es distinto de "Eliminar" (Estado = FALSE):
	- El producto se CONSERVA (Estado sigue TRUE): el kardex, los documentos y
	  los reportes viejos siguen mostrando su nombre y su SKU sigue reservado.
	- Desaparece para todos: V_Producto_StockConsolidado y la faceta de
	  categorias lo excluyen, y de ahi leen catalogo, saldos y los selectores de
	  requerimientos, movimientos y consumo de OT.
	- El admin lo sigue viendo en V_Producto_StockConsolidadoTodos y puede
	  reactivarlo.

	Reglas (FnDarDeBajaProducto, revalidadas en la BD):
	- Solo admin.
	- Saldo 0 en TODOS los almacenes (primero se pasa el stock al producto bueno).
	- Sin requerimientos pendientes/parciales ni OT abiertas que lo usen.
	- Opcional: el producto en el que se unifico (trazabilidad: "CON-002 se
	  unifico en REP-001"). Debe estar activo, no dado de baja y no ser el mismo.

	Ademas un trigger impide cargar un producto dado de baja en documentos,
	requerimientos o repuestos de OT aunque alguien tenga la pantalla abierta
	de antes, y el control de duplicados de 0085 lo ignora (no tiene sentido
	sugerir ni bloquear contra un producto que ya nadie ve).
*/

/* ── 1. Columnas ── */
ALTER TABLE inv."T_Producto"
	ADD COLUMN IF NOT EXISTS "DadoDeBaja" BOOLEAN NOT NULL DEFAULT FALSE,
	ADD COLUMN IF NOT EXISTS "FechaBaja" TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS "UsuarioBaja" VARCHAR(50),
	ADD COLUMN IF NOT EXISTS "MotivoBaja" VARCHAR(300),
	ADD COLUMN IF NOT EXISTS "IdProductoUnificado" UUID;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_T_Producto_IdProductoUnificado') THEN
		ALTER TABLE inv."T_Producto"
			ADD CONSTRAINT "FK_T_Producto_IdProductoUnificado"
			FOREIGN KEY ("IdProductoUnificado") REFERENCES inv."T_Producto"("Id");
	END IF;
END $$;

COMMENT ON COLUMN inv."T_Producto"."DadoDeBaja" IS
	'TRUE = fuera de circulacion (duplicado unificado u obsoleto). Se conserva por su historial; solo admin lo ve. Distinto de Estado = FALSE (eliminado).';
COMMENT ON COLUMN inv."T_Producto"."IdProductoUnificado" IS
	'Producto en el que se unifico este al darlo de baja (opcional).';

/* ── 2. Vistas ── */
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
	(SELECT u."Sku"::TEXT FROM inv."T_Producto" u WHERE u."Id" = p."IdProductoUnificado") AS "SkuUnificado"
FROM inv."T_Producto" p
	JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
	JOIN inv."T_UnidadMedida" um ON um."Id" = p."IdUnidadMedida"
	LEFT JOIN inv."T_SaldoStock" s ON s."IdProducto" = p."Id"
WHERE p."Estado" = true
GROUP BY p."Id", p."Sku", p."Nombre", c."Nombre", um."Codigo", p."StockMinimo", p."IdCategoria",
	p."CostoPromedio", p."EsGeneral", p."CodigoProductoProveedor";

COMMENT ON VIEW inv."V_Producto_StockConsolidadoTodos" IS
	'Stock consolidado INCLUYENDO dados de baja. Solo para el catalogo del admin (la API lo restringe).';

GRANT SELECT ON inv."V_Producto_StockConsolidadoTodos" TO authenticated;

-- Mismas columnas y en el mismo orden que antes (+ las nuevas al final):
-- CREATE OR REPLACE VIEW no permite reordenar ni quitar columnas.
CREATE OR REPLACE VIEW inv."V_Producto_StockConsolidado"
WITH (security_invoker = true) AS
SELECT
	t."IdProducto", t."Sku", t."NombreProducto", t."NombreCategoria", t."CodigoUnidad",
	t."StockMinimo", t."StockTotal", t."BajoMinimo", t."IdCategoria", t."CostoPromedio",
	t."UrlImagenPrincipal", t."EsGeneral", t."CodigoProductoProveedor", t."UltimoMovimiento",
	t."DadoDeBaja", t."FechaBaja", t."UsuarioBaja", t."MotivoBaja", t."IdProductoUnificado", t."SkuUnificado"
FROM inv."V_Producto_StockConsolidadoTodos" t
WHERE NOT t."DadoDeBaja";

CREATE OR REPLACE VIEW inv."V_Producto_FacetaCategoria"
WITH (security_invoker = true) AS
SELECT
	c."Id" AS "IdCategoria",
	c."Nombre" AS "NombreCategoria",
	count(*)::integer AS "Productos"
FROM inv."T_Producto" p
	JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
WHERE p."Estado" = true AND NOT p."DadoDeBaja" AND c."Estado" = true
GROUP BY c."Id", c."Nombre";

/* ── 3. Dar de baja / reactivar ── */
CREATE OR REPLACE FUNCTION inv."FnDarDeBajaProducto"(
	"PIdProducto" UUID,
	"PIdProductoUnificado" UUID DEFAULT NULL,
	"PMotivo" TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = inv, seg, public
AS $$
DECLARE
	vSku TEXT;
	vDadoDeBaja BOOLEAN;
	vSaldo NUMERIC;
	vDocumentos TEXT;
BEGIN
	IF seg."FnRolUsuario"() IS DISTINCT FROM 'admin' THEN
		RAISE EXCEPTION 'Solo un administrador puede dar de baja productos.' USING ERRCODE = '42501';
	END IF;

	SELECT p."Sku"::TEXT, p."DadoDeBaja" INTO vSku, vDadoDeBaja
	FROM inv."T_Producto" p
	WHERE p."Id" = "PIdProducto" AND p."Estado"
	FOR UPDATE;

	IF vSku IS NULL THEN
		RAISE EXCEPTION 'El producto no existe o fue eliminado.';
	END IF;
	IF vDadoDeBaja THEN
		RAISE EXCEPTION 'El producto % ya está dado de baja.', vSku;
	END IF;

	-- Lock de los saldos: un movimiento concurrente no puede colarse entre la
	-- verificacion y la baja.
	PERFORM 1 FROM inv."T_SaldoStock" s WHERE s."IdProducto" = "PIdProducto" FOR UPDATE;
	SELECT COALESCE(sum(s."CantidadDisponible"), 0) INTO vSaldo
	FROM inv."T_SaldoStock" s WHERE s."IdProducto" = "PIdProducto";
	IF EXISTS (SELECT 1 FROM inv."T_SaldoStock" s WHERE s."IdProducto" = "PIdProducto" AND s."CantidadDisponible" <> 0) THEN
		RAISE EXCEPTION 'El producto % todavía tiene saldo (% en total). Pasa el stock al producto que queda antes de darlo de baja.', vSku, vSaldo;
	END IF;

	SELECT string_agg(DISTINCT r."NumeroRequerimiento"::TEXT, ', ') INTO vDocumentos
	FROM inv."T_RequerimientoDetalle" d
		JOIN inv."T_Requerimiento" r ON r."Id" = d."IdRequerimiento"
	WHERE d."IdProducto" = "PIdProducto" AND d."Estado" AND r."Estado"
		AND r."Situacion"::TEXT IN ('pendiente', 'parcial')
		AND COALESCE(d."CantidadAtendida", 0) < d."Cantidad";
	IF vDocumentos IS NOT NULL THEN
		RAISE EXCEPTION 'El producto % está en requerimientos sin atender (%). Atiéndelos o anúlalos antes de darlo de baja.', vSku, vDocumentos;
	END IF;

	SELECT string_agg(DISTINCT o."NumeroOrden"::TEXT, ', ') INTO vDocumentos
	FROM inv."T_OrdenMantenimientoRepuesto" rp
		JOIN inv."T_OrdenMantenimiento" o ON o."Id" = rp."IdOrdenMantenimiento"
	WHERE rp."IdProducto" = "PIdProducto" AND rp."Estado" AND o."Estado"
		AND o."Situacion"::TEXT = 'abierta';
	IF vDocumentos IS NOT NULL THEN
		RAISE EXCEPTION 'El producto % está en órdenes de mantenimiento abiertas (%). Ciérralas o cambia el repuesto antes de darlo de baja.', vSku, vDocumentos;
	END IF;

	IF "PIdProductoUnificado" IS NOT NULL THEN
		IF "PIdProductoUnificado" = "PIdProducto" THEN
			RAISE EXCEPTION 'Un producto no puede unificarse en sí mismo.';
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM inv."T_Producto" u
			WHERE u."Id" = "PIdProductoUnificado" AND u."Estado" AND NOT u."DadoDeBaja"
		) THEN
			RAISE EXCEPTION 'El producto en el que se unifica no existe o también está dado de baja.';
		END IF;
	END IF;

	UPDATE inv."T_Producto"
	SET "DadoDeBaja" = TRUE,
		"FechaBaja" = now(),
		"UsuarioBaja" = auth.uid()::TEXT,
		"MotivoBaja" = NULLIF(left(btrim(COALESCE("PMotivo", '')), 300), ''),
		"IdProductoUnificado" = "PIdProductoUnificado",
		"UsuarioModificacion" = auth.uid()::TEXT
	WHERE "Id" = "PIdProducto";
END;
$$;

COMMENT ON FUNCTION inv."FnDarDeBajaProducto"(UUID, UUID, TEXT) IS
	'Saca de circulacion un producto con historial (solo admin, saldo 0, sin requerimientos ni OT abiertas). Lo conserva para el kardex.';

CREATE OR REPLACE FUNCTION inv."FnReactivarProducto"("PIdProducto" UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = inv, seg, public
AS $$
BEGIN
	IF seg."FnRolUsuario"() IS DISTINCT FROM 'admin' THEN
		RAISE EXCEPTION 'Solo un administrador puede reactivar productos.' USING ERRCODE = '42501';
	END IF;

	UPDATE inv."T_Producto"
	SET "DadoDeBaja" = FALSE,
		"FechaBaja" = NULL,
		"UsuarioBaja" = NULL,
		"MotivoBaja" = NULL,
		"IdProductoUnificado" = NULL,
		"UsuarioModificacion" = auth.uid()::TEXT
	WHERE "Id" = "PIdProducto" AND "Estado" AND "DadoDeBaja";

	IF NOT FOUND THEN
		RAISE EXCEPTION 'El producto no existe o no está dado de baja.';
	END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION inv."FnDarDeBajaProducto"(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inv."FnReactivarProducto"(UUID) TO authenticated;

/* ── 4. Un producto dado de baja no recibe operaciones nuevas ── */
CREATE OR REPLACE FUNCTION inv."FnValidarProductoNoDadoDeBaja"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = inv, public
AS $$
DECLARE
	vSku TEXT;
	vSkuUnificado TEXT;
BEGIN
	IF NEW."IdProducto" IS NULL THEN
		RETURN NEW;
	END IF;
	IF TG_OP = 'UPDATE' AND OLD."IdProducto" IS NOT DISTINCT FROM NEW."IdProducto" THEN
		RETURN NEW;
	END IF;

	SELECT p."Sku"::TEXT, u."Sku"::TEXT INTO vSku, vSkuUnificado
	FROM inv."T_Producto" p
		LEFT JOIN inv."T_Producto" u ON u."Id" = p."IdProductoUnificado"
	WHERE p."Id" = NEW."IdProducto" AND p."DadoDeBaja";

	IF vSku IS NOT NULL THEN
		RAISE EXCEPTION 'El producto % está dado de baja%. Usa el producto vigente o pide a un administrador que lo reactive.',
			vSku, COALESCE(' (se unificó en ' || vSkuUnificado || ')', '');
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "TR_T_DocumentoInventarioDetalle_ProductoVigente"
	BEFORE INSERT OR UPDATE OF "IdProducto" ON inv."T_DocumentoInventarioDetalle"
	FOR EACH ROW EXECUTE FUNCTION inv."FnValidarProductoNoDadoDeBaja"();

CREATE OR REPLACE TRIGGER "TR_T_RequerimientoDetalle_ProductoVigente"
	BEFORE INSERT OR UPDATE OF "IdProducto" ON inv."T_RequerimientoDetalle"
	FOR EACH ROW EXECUTE FUNCTION inv."FnValidarProductoNoDadoDeBaja"();

CREATE OR REPLACE TRIGGER "TR_T_OrdenMantenimientoRepuesto_ProductoVigente"
	BEFORE INSERT OR UPDATE OF "IdProducto" ON inv."T_OrdenMantenimientoRepuesto"
	FOR EACH ROW EXECUTE FUNCTION inv."FnValidarProductoNoDadoDeBaja"();

/* ── 5. El control de duplicados (0085) ignora los dados de baja ── */
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
			AND NOT p."DadoDeBaja"
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
	IF vCodigo IS NULL OR NOT NEW."Estado" OR NEW."DadoDeBaja" THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'UPDATE'
		AND inv."FnNormalizarCodigoProveedor"(OLD."CodigoProductoProveedor") IS NOT DISTINCT FROM vCodigo THEN
		RETURN NEW;
	END IF;

	SELECT p."Sku"::TEXT, p."Nombre" INTO vSku, vNombre
	FROM inv."T_Producto" p
	WHERE p."Estado"
		AND NOT p."DadoDeBaja"
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
