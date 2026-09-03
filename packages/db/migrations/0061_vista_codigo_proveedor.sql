/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.V_Producto_StockConsolidado (REPLACE)
	Tipo de Cambio: REPLACE - exponer CodigoProductoProveedor en la vista
	Autor: Equipo Desarrollo
	Fecha: 2026-09-02
	Descripcion: El combo de productos (requerimientos, movimientos, consumo de
	             repuestos) se alimenta de esta vista. Se agrega el codigo del
	             producto en el proveedor para mostrarlo y hacerlo BUSCABLE en
	             el selector. La columna nueva va AL FINAL (regla de
	             CREATE OR REPLACE VIEW).
*/
CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado" WITH (security_invoker = true) AS
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
	(
		SELECT pi."Url"
		FROM "inv"."T_ProductoImagen" pi
		WHERE pi."IdProducto" = p."Id" AND pi."Estado" = TRUE
		ORDER BY pi."EsPrincipal" DESC, pi."Orden"
		LIMIT 1
	) AS "UrlImagenPrincipal",
	p."EsGeneral",
	p."CodigoProductoProveedor"
FROM "inv"."T_Producto" p
	JOIN "inv"."T_Categoria" c ON c."Id" = p."IdCategoria"
	JOIN "inv"."T_UnidadMedida" um ON um."Id" = p."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" s ON s."IdProducto" = p."Id"
WHERE p."Estado" = TRUE
GROUP BY p."Id", p."Sku", p."Nombre", c."Nombre", um."Codigo", p."StockMinimo",
	p."IdCategoria", p."CostoPromedio", p."EsGeneral", p."CodigoProductoProveedor";
