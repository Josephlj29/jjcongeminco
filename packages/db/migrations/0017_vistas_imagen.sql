/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: vistas con imagen principal + saldo por ubicacion
	Tipo de Cambio: REPLACE vistas + CREATE vista
	Autor: Equipo Desarrollo
	Fecha: 2026-06-08
	Descripcion: Agrega la URL de la imagen principal a las vistas de stock
	             (catalogo, combobox, saldos) y crea la vista de saldo por
	             ubicacion para la pantalla Saldos (mobile-first).
	NOTA: las columnas nuevas se agregan AL FINAL para permitir CREATE OR REPLACE
	      (no se puede reordenar columnas de una vista existente).
*/

CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado"
WITH (security_invoker = true) AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Nombre" AS "NombreCategoria"
		,UM."Codigo" AS "CodigoUnidad"
		,P."StockMinimo"
		,COALESCE(SUM(S."CantidadDisponible"), 0) AS "StockTotal"
		,COALESCE(SUM(S."CantidadDisponible"), 0) < P."StockMinimo" AS "BajoMinimo"
		,P."IdCategoria"
		,P."CostoPromedio"
		,(SELECT PI."Url" FROM "inv"."T_ProductoImagen" PI
			WHERE PI."IdProducto" = P."Id" AND PI."Estado" = TRUE
			ORDER BY PI."EsPrincipal" DESC, PI."Orden" ASC LIMIT 1) AS "UrlImagenPrincipal"
	FROM "inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE P."Estado" = TRUE
	GROUP BY P."Id", P."Sku", P."Nombre", C."Nombre", UM."Codigo", P."StockMinimo", P."IdCategoria", P."CostoPromedio";

COMMENT ON VIEW "inv"."V_Producto_StockConsolidado" IS 'Saldo total por producto con imagen principal y alerta BajoMinimo.';

CREATE OR REPLACE VIEW "inv"."V_Producto_Valorizado"
WITH (security_invoker = true) AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Nombre" AS "NombreCategoria"
		,UM."Codigo" AS "CodigoUnidad"
		,P."StockMinimo"
		,P."CostoPromedio"
		,P."UltimoCosto"
		,COALESCE(SUM(S."CantidadDisponible"), 0) AS "StockTotal"
		,(COALESCE(SUM(S."CantidadDisponible"), 0) * P."CostoPromedio") AS "ValorTotal"
		,COALESCE(SUM(S."CantidadDisponible"), 0) < P."StockMinimo" AS "BajoMinimo"
		,(SELECT PI."Url" FROM "inv"."T_ProductoImagen" PI
			WHERE PI."IdProducto" = P."Id" AND PI."Estado" = TRUE
			ORDER BY PI."EsPrincipal" DESC, PI."Orden" ASC LIMIT 1) AS "UrlImagenPrincipal"
	FROM "inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE P."Estado" = TRUE
	GROUP BY P."Id", P."Sku", P."Nombre", C."Nombre", UM."Codigo", P."StockMinimo", P."CostoPromedio", P."UltimoCosto";

COMMENT ON VIEW "inv"."V_Producto_Valorizado" IS 'Stock total y valor (StockTotal * CostoPromedio) por producto, con imagen.';

CREATE OR REPLACE VIEW "inv"."V_SaldoStock_PorUbicacion"
WITH (security_invoker = true) AS
	SELECT
		S."IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,S."IdUbicacion"
		,U."Nombre" AS "NombreUbicacion"
		,U."Codigo" AS "CodigoUbicacion"
		,S."CantidadDisponible"
		,P."StockMinimo"
		,P."CostoPromedio"
	FROM "inv"."T_SaldoStock" S
	INNER JOIN "inv"."T_Producto" P ON P."Id" = S."IdProducto"
	INNER JOIN "inv"."T_Ubicacion" U ON U."Id" = S."IdUbicacion"
	WHERE P."Estado" = TRUE AND S."CantidadDisponible" <> 0;

COMMENT ON VIEW "inv"."V_SaldoStock_PorUbicacion" IS 'Saldo de cada producto en cada ubicacion (para la consulta de saldos mobile).';