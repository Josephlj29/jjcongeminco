/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.V_MovimientoStock_Kardex + inv.V_MovimientoStock_SaldoReconciliacion (REPLACE)
	Tipo de Cambio: REPLACE - consistencia de RLS (auditoria QA)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: HALLAZGO A2 — estas vistas (creadas en 0004) quedaron SIN
	             security_invoker, a diferencia de las vistas mas nuevas del proyecto
	             (V_SaldoStock_PorUbicacion, V_Producto_Valorizado, etc.). Sin esa
	             clausula, la vista evalua las tablas base con permisos del OWNER y
	             saltea la RLS del usuario. Hoy no cambia resultados (la RLS de
	             T_MovimientoStock es abierta a autenticados), pero es una bomba de
	             tiempo: si manana se segmenta el ledger por almacen, el kardex
	             seguiria mostrando TODO a todos. Cambio preventivo y sin efecto
	             funcional inmediato.
*/

CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_SaldoReconciliacion"
WITH (security_invoker = true) AS
	SELECT
		M."IdProducto"
		,M."IdUbicacion"
		,SUM(M."Direccion" * M."Cantidad") AS "CantidadDisponible"
	FROM
		"inv"."T_MovimientoStock" M
	GROUP BY
		M."IdProducto"
		,M."IdUbicacion";

COMMENT ON VIEW "inv"."V_MovimientoStock_SaldoReconciliacion" IS 'Saldo recalculado desde el ledger para auditar el cache T_SaldoStock. security_invoker: respeta la RLS del usuario.';

CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_Kardex"
WITH (security_invoker = true) AS
	SELECT
		M."Id" AS "IdMovimientoStock"
		,M."IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,M."IdUbicacion"
		,U."Nombre" AS "NombreUbicacion"
		,M."FechaMovimiento"
		,D."TipoDocumento"
		,D."NumeroDocumento"
		,D."Comprobante"
		,M."Direccion"
		,M."Cantidad"
		,(M."Direccion" * M."Cantidad") AS "CantidadConSigno"
		,SUM(M."Direccion" * M."Cantidad") OVER
			(
				PARTITION BY M."IdProducto", M."IdUbicacion"
				ORDER BY M."FechaMovimiento", M."Id"
				ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
			) AS "SaldoCorrido"
	FROM
		"inv"."T_MovimientoStock" M
	INNER JOIN "inv"."T_Producto" P ON P."Id" = M."IdProducto"
	INNER JOIN "inv"."T_Ubicacion" U ON U."Id" = M."IdUbicacion"
	INNER JOIN "inv"."T_DocumentoInventario" D ON D."Id" = M."IdDocumentoInventario";

COMMENT ON VIEW "inv"."V_MovimientoStock_Kardex" IS 'Kardex con saldo corrido (running balance) por producto y ubicacion. security_invoker: respeta la RLS del usuario.';