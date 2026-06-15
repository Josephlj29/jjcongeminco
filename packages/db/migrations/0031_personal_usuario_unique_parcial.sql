/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Personal — índice único parcial sobre IdUsuario
	Tipo de Cambio: DROP CONSTRAINT + CREATE UNIQUE INDEX (parcial)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: La constraint única retenía el login aun con el personal dado de
	             baja (Estado=false), impidiendo reasignar ese usuario a otra
	             persona. Se reemplaza por un índice único parcial: la unicidad
	             solo aplica a personal activo. Los NULL siguen distintos (sin
	             login = permitido).
*/
ALTER TABLE inv."T_Personal" DROP CONSTRAINT IF EXISTS "UQ_T_Personal_IdUsuario";

CREATE UNIQUE INDEX "UQ_T_Personal_IdUsuario"
	ON inv."T_Personal" ("IdUsuario")
	WHERE "Estado" = true;

COMMENT ON INDEX inv."UQ_T_Personal_IdUsuario" IS
	'Un usuario de acceso se vincula a un solo personal ACTIVO. El soft-delete libera el login.';
