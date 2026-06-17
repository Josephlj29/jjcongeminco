/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.V_Producto_StockConsolidado (ALTER)
	Tipo de Cambio: ALTER - consistencia de RLS (auditoria QA / advisor Supabase)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-17
	Descripcion: Extension del hallazgo A2. El advisor de seguridad de Supabase
	             (security_definer_view, nivel ERROR) detecto que V_Producto_StockConsolidado
	             (creada en 0004) sigue SIN security_invoker, igual que las vistas de kardex
	             corregidas en 0038. Sin esa clausula la vista evalua las tablas base con
	             permisos del OWNER y saltea la RLS del usuario. Se completa el fix para que
	             TODAS las vistas de inv respeten la RLS del que consulta.
*/

ALTER VIEW "inv"."V_Producto_StockConsolidado" SET (security_invoker = true);
