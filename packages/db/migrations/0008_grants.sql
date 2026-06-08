/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: GRANTs para los roles de PostgREST (anon, authenticated)
	Tipo de Cambio: GRANT - permisos de acceso a los esquemas inv/seg
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: PostgREST usa los roles anon/authenticated. Sin GRANT a nivel
	             de tabla, devuelve "permission denied" aunque el esquema este
	             expuesto. La RLS sigue filtrando fila por fila igual.
*/

GRANT USAGE ON SCHEMA "inv", "seg" TO anon, authenticated;

/* authenticated: opera el sistema (la RLS limita por rol) */
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "inv" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "seg" TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "inv" TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "seg" TO authenticated;

/* anon: solo lectura del catalogo publico (la RLS igual exige usuario activo) */
GRANT SELECT ON ALL TABLES IN SCHEMA "inv" TO anon;

/* Objetos futuros heredan los mismos permisos */
ALTER DEFAULT PRIVILEGES IN SCHEMA "inv"
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "seg"
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "inv"
	GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "seg"
	GRANT EXECUTE ON FUNCTIONS TO authenticated;
