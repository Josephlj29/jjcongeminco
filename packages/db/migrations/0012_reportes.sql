/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: vistas de reportes (movimientos, valorizado, historial de requerimientos)
	Tipo de Cambio: CREATE - reportes con filtros avanzados
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Vistas con todas las dimensiones para filtrar (fecha, proveedor,
	             producto, categoria, equipo, placa) y valorizar. security_invoker
	             para que respeten la RLS del usuario.
*/

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Movimientos con todas las dimensiones y valor (Cantidad * CostoUnitario).
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_Reporte_Movimiento"
WITH (security_invoker = true) AS
	SELECT
		M."Id" AS "IdMovimiento"
		,M."FechaMovimiento"
		,D."TipoDocumento"
		,D."NumeroDocumento"
		,D."Comprobante"
		,P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Id" AS "IdCategoria"
		,C."Nombre" AS "NombreCategoria"
		,UB."Id" AS "IdUbicacion"
		,UB."Nombre" AS "NombreUbicacion"
		,PR."Id" AS "IdProveedor"
		,PR."Nombre" AS "NombreProveedor"
		,VE."Id" AS "IdVehiculo"
		,VE."Placa"
		,EQ."Id" AS "IdEquipo"
		,EQ."Nombre" AS "NombreEquipo"
		,M."Direccion"
		,M."Cantidad"
		,(M."Direccion" * M."Cantidad") AS "CantidadConSigno"
		,M."CostoUnitario"
		,(M."Cantidad" * COALESCE(M."CostoUnitario", 0)) AS "ValorMovimiento"
	FROM
		"inv"."T_MovimientoStock" M
	INNER JOIN "inv"."T_Producto" P ON P."Id" = M."IdProducto"
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_Ubicacion" UB ON UB."Id" = M."IdUbicacion"
	INNER JOIN "inv"."T_DocumentoInventario" D ON D."Id" = M."IdDocumentoInventario"
	LEFT JOIN "inv"."T_Proveedor" PR ON PR."Id" = D."IdProveedor"
	LEFT JOIN "inv"."T_Vehiculo" VE ON VE."Id" = D."IdVehiculo"
	LEFT JOIN "inv"."T_Equipo" EQ ON EQ."Id" = VE."IdEquipo";

COMMENT ON VIEW "inv"."V_Reporte_Movimiento" IS 'Movimientos con dimensiones (categoria, proveedor, equipo, placa) y valor, para reportes filtrables.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Stock valorizado por producto (StockTotal * CostoPromedio).
-- =============================================
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
	FROM
		"inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE
		P."Estado" = TRUE
	GROUP BY
		P."Id"
		,P."Sku"
		,P."Nombre"
		,C."Nombre"
		,UM."Codigo"
		,P."StockMinimo"
		,P."CostoPromedio"
		,P."UltimoCosto";

COMMENT ON VIEW "inv"."V_Producto_Valorizado" IS 'Stock total y valor (StockTotal * CostoPromedio) por producto.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Historial de requerimientos por producto (cuantas veces se pidio).
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_Producto_HistorialRequerimiento"
WITH (security_invoker = true) AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,COUNT(DISTINCT RQ."Id") AS "VecesPedido"
		,COALESCE(SUM(RD."Cantidad"), 0) AS "CantidadTotalPedida"
		,MAX(RQ."FechaRequerimiento") AS "UltimaFechaPedido"
		,COUNT(DISTINCT RQ."Id") FILTER (WHERE RQ."Origen" = 'desgaste_prematuro') AS "VecesDesgastePrematuro"
	FROM
		"inv"."T_Producto" P
	INNER JOIN "inv"."T_RequerimientoDetalle" RD ON RD."IdProducto" = P."Id"
	INNER JOIN "inv"."T_Requerimiento" RQ ON RQ."Id" = RD."IdRequerimiento"
	WHERE
		RQ."Estado" = TRUE
	GROUP BY
		P."Id"
		,P."Sku"
		,P."Nombre";

COMMENT ON VIEW "inv"."V_Producto_HistorialRequerimiento" IS 'Cuantas veces y cuanto se pidio cada producto, con conteo de desgaste prematuro.';
