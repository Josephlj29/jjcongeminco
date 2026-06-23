/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: seg.T_Rol (nuevo rol 'logistica') + asignacion de modulos
	Tipo de Cambio: ALTER + seed - rol de solo visualizacion para logistica
	Autor: Equipo Desarrollo
	Fecha: 2026-06-17
	Descripcion: El area de logistica necesita VISUALIZAR stock, movimientos y reportes,
	             sin aprobar requerimientos ni acceder a maestros ni a datos bancarios.
	             Ningun rol existente encaja, asi que se agrega 'logistica' (RBAC
	             configurable). Modulos: dashboard, saldos, catalogo, movimientos, reportes.
	             Idempotente.
*/

/* 1. Ampliar el CHECK de codigos de rol permitidos --------------------- */
ALTER TABLE "seg"."T_Rol" DROP CONSTRAINT IF EXISTS "CHK_T_Rol_Codigo_Permitido";
ALTER TABLE "seg"."T_Rol" ADD CONSTRAINT "CHK_T_Rol_Codigo_Permitido"
	CHECK ("Codigo" IN ('admin','gerencia','supervision','almacenero','logistica'));

/* 2. Crear el rol logistica -------------------------------------------- */
INSERT INTO "seg"."T_Rol" ("Codigo","Nombre","Descripcion")
VALUES ('logistica','Logística','Visualización de stock, movimientos y reportes (solo lectura).')
ON CONFLICT ("Codigo") DO NOTHING;

/* 3. Asignar los modulos del rol logistica ----------------------------- */
INSERT INTO "seg"."T_RolModulo" ("IdRol","CodigoModulo")
SELECT r."Id", m."Codigo"
FROM "seg"."T_Rol" r
CROSS JOIN "seg"."T_Modulo" m
WHERE r."Codigo" = 'logistica'
  AND m."Codigo" IN ('dashboard','saldos','catalogo','movimientos','reportes')
ON CONFLICT ("IdRol","CodigoModulo") DO NOTHING;
