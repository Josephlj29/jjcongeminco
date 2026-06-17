/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: seg.T_Modulo + seg.T_RolModulo + seg.FnModulosUsuario + seg.FnPuedeVerModulo
	Tipo de Cambio: CREATE - control de acceso por modulo a nivel de TABLA (RBAC)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: Mueve el mapa rol->modulo (antes hardcodeado en TS) a la base de datos,
	             que es la mejor practica para RBAC: la asignacion de modulos por rol se
	             configura sin redeploy y queda como unica fuente de verdad junto al
	             resto de la autorizacion (esquema seg / RLS).
	               - T_Modulo: catalogo de modulos (codigos estables que mapean a rutas).
	               - T_RolModulo: que modulos ve cada rol (configurable).
	               - FnModulosUsuario(): los codigos de modulo del usuario autenticado.
	               - FnPuedeVerModulo(codigo): si el usuario actual ve ese modulo.
	             Idempotente (IF NOT EXISTS / ON CONFLICT) para convivir con los dos
	             mecanismos de migracion del proyecto.
*/

/* 1. Catalogo de modulos --------------------------------------------------- */
CREATE TABLE IF NOT EXISTS "seg"."T_Modulo"
(
	"Codigo"              VARCHAR(40)  NOT NULL,
	"Nombre"              VARCHAR(80)  NOT NULL,
	"Orden"               INT          NOT NULL DEFAULT 0,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	CONSTRAINT "PK_T_Modulo" PRIMARY KEY ("Codigo")
);

COMMENT ON TABLE "seg"."T_Modulo" IS 'Catalogo de modulos del sistema. El Codigo mapea a una seccion/ruta del frontend.';

/* 2. Asignacion rol -> modulo (configurable) ------------------------------- */
CREATE TABLE IF NOT EXISTS "seg"."T_RolModulo"
(
	"IdRol"               UUID         NOT NULL,
	"CodigoModulo"        VARCHAR(40)  NOT NULL,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	CONSTRAINT "PK_T_RolModulo" PRIMARY KEY ("IdRol","CodigoModulo"),
	CONSTRAINT "FK_T_RolModulo_Rol_IdRol"
		FOREIGN KEY ("IdRol") REFERENCES "seg"."T_Rol" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_RolModulo_Modulo_CodigoModulo"
		FOREIGN KEY ("CodigoModulo") REFERENCES "seg"."T_Modulo" ("Codigo") ON DELETE CASCADE
);

COMMENT ON TABLE "seg"."T_RolModulo" IS 'Que modulos ve cada rol (RBAC configurable). Fuente de verdad del control de acceso por modulo.';

CREATE INDEX IF NOT EXISTS "IX_T_RolModulo_CodigoModulo" ON "seg"."T_RolModulo" ("CodigoModulo");

/* 3. GRANTs (PostgREST: authenticated) ------------------------------------- */
GRANT SELECT ON "seg"."T_Modulo"   TO authenticated;
GRANT SELECT ON "seg"."T_RolModulo" TO authenticated;

/* 4. RLS: lectura autenticada; escritura solo admin ------------------------ */
ALTER TABLE "seg"."T_Modulo"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seg"."T_RolModulo" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LecturaAutenticado" ON "seg"."T_Modulo";
CREATE POLICY "LecturaAutenticado" ON "seg"."T_Modulo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

DROP POLICY IF EXISTS "ModuloEscrituraAdmin" ON "seg"."T_Modulo";
CREATE POLICY "ModuloEscrituraAdmin" ON "seg"."T_Modulo"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

DROP POLICY IF EXISTS "LecturaAutenticado" ON "seg"."T_RolModulo";
CREATE POLICY "LecturaAutenticado" ON "seg"."T_RolModulo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

DROP POLICY IF EXISTS "RolModuloEscrituraAdmin" ON "seg"."T_RolModulo";
CREATE POLICY "RolModuloEscrituraAdmin" ON "seg"."T_RolModulo"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

/* 5. Funciones de resolucion (para frontend, guards y RLS) ----------------- */
CREATE OR REPLACE FUNCTION "seg"."FnModulosUsuario"()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "seg", "public"
AS $$
	SELECT COALESCE(ARRAY_AGG(rm."CodigoModulo"), ARRAY[]::TEXT[])
	FROM "seg"."T_RolModulo" rm
	JOIN "seg"."T_Usuario" u ON u."IdRol" = rm."IdRol"
	WHERE u."Id" = auth.uid() AND u."Estado" = TRUE;
$$;

COMMENT ON FUNCTION "seg"."FnModulosUsuario"() IS 'Codigos de modulo que ve el usuario autenticado (segun su rol). SECURITY DEFINER para leer sin recursion de RLS.';

CREATE OR REPLACE FUNCTION "seg"."FnPuedeVerModulo"("PCodigo" TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "seg", "public"
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "seg"."T_RolModulo" rm
		JOIN "seg"."T_Usuario" u ON u."IdRol" = rm."IdRol"
		WHERE u."Id" = auth.uid() AND u."Estado" = TRUE AND rm."CodigoModulo" = "PCodigo"
	);
$$;

COMMENT ON FUNCTION "seg"."FnPuedeVerModulo"(TEXT) IS 'TRUE si el usuario autenticado tiene asignado el modulo indicado.';

GRANT EXECUTE ON FUNCTION "seg"."FnModulosUsuario"()        TO authenticated;
GRANT EXECUTE ON FUNCTION "seg"."FnPuedeVerModulo"(TEXT)    TO authenticated;

/* 6. Seed del catalogo de modulos ----------------------------------------- */
INSERT INTO "seg"."T_Modulo" ("Codigo","Nombre","Orden") VALUES
	('dashboard',            'Dashboard',              10),
	('saldos',               'Saldos',                 20),
	('catalogo',             'Catálogo',               30),
	('movimientos',          'Movimientos',            40),
	('requerimientos',       'Requerimientos',         50),
	('aprobaciones',         'Aprobaciones',           60),
	('mantenimiento',        'Mantenimiento',          70),
	('reportes',             'Reportes',               80),
	('importar',             'Importar',               90),
	('maestros.general',     'Maestros',              100),
	('maestros.proveedores', 'Maestros · Proveedores',110)
ON CONFLICT ("Codigo") DO NOTHING;

/* 7. Seed de asignaciones rol -> modulo (sin hardcodear UUIDs) ------------- */
INSERT INTO "seg"."T_RolModulo" ("IdRol","CodigoModulo")
SELECT r."Id", m."Codigo"
FROM "seg"."T_Rol" r
CROSS JOIN "seg"."T_Modulo" m
WHERE
	   (r."Codigo" = 'admin')                                                                    -- admin: todo
	OR (r."Codigo" = 'gerencia'    AND m."Codigo" <> 'importar')                                 -- gerencia: todo menos importar
	OR (r."Codigo" = 'supervision' AND m."Codigo" NOT IN ('importar','maestros.proveedores'))   -- supervision: sin importar ni proveedores
	OR (r."Codigo" = 'almacenero'  AND m."Codigo" IN
			('dashboard','saldos','catalogo','movimientos','requerimientos','mantenimiento'))    -- almacenero: solo operacion
ON CONFLICT ("IdRol","CodigoModulo") DO NOTHING;
