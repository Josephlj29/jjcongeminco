/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: seg.T_Rol — policy de lectura para autenticados
	Tipo de Cambio: CREATE POLICY - fix de RLS (login de usuarios no-admin)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-17
	Descripcion: BUG PREEXISTENTE. seg.T_Rol solo tenia la policy 'RolAdministracion'
	             (ALL, FnRolUsuario()='admin'), por lo que SOLO un admin podia LEER
	             T_Rol. obtenerUsuario() resuelve el rol con T_Usuario!inner(T_Rol);
	             para cualquier usuario NO admin (logistica, almacenero, gerencia,
	             supervision) el inner join devolvia 0 filas -> 406 -> la app rebotaba
	             al login ("no entra"). No se habia detectado porque hasta ahora solo
	             existian usuarios admin. Fix: permitir SELECT de T_Rol a cualquier
	             usuario autenticado (los roles no son dato sensible). La ESCRITURA
	             sigue restringida a admin por la policy 'RolAdministracion' (las
	             policies de SELECT se combinan con OR).
*/

DROP POLICY IF EXISTS "RolLecturaAutenticado" ON "seg"."T_Rol";
CREATE POLICY "RolLecturaAutenticado" ON "seg"."T_Rol"
	FOR SELECT USING (auth.uid() IS NOT NULL);
