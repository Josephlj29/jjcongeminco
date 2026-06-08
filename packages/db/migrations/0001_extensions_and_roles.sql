/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: esquemas, extensiones, seguridad (T_Rol, T_Usuario)
	Tipo de Cambio: CREATE - estructura inicial de identidad
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Crea esquemas por area, utilidades de auditoria y las tablas
	             de roles y usuarios. Nomenclatura estandar BSG adaptada a Postgres.
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

/* Esquemas por area (BSG: ningun objeto en public/dbo) */
CREATE SCHEMA IF NOT EXISTS "comun";
CREATE SCHEMA IF NOT EXISTS "seg";
CREATE SCHEMA IF NOT EXISTS "inv";

/* ---------------------------------------------------------------------
	Utilidad de auditoria reutilizable.
	En SQL Server RowVersion es nativo; en Postgres se simula con un
	contador incremental mantenido por este trigger en cada UPDATE.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "comun"."FnAuditoriaActualizacion"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	NEW."FechaModificacion" = NOW();
	NEW."RowVersion" = OLD."RowVersion" + 1;
	RETURN NEW;
END;
$$;

/* =====================================================================
	seg.T_Rol
===================================================================== */
CREATE TABLE "seg"."T_Rol"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Codigo"              VARCHAR(20)  NOT NULL,
	"Nombre"              VARCHAR(50)  NOT NULL,
	"Descripcion"         VARCHAR(200),
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Rol" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Rol_Codigo" UNIQUE ("Codigo"),
	CONSTRAINT "CHK_T_Rol_Codigo_Permitido"
		CHECK ("Codigo" IN ('admin','gerencia','supervision','almacenero'))
);

COMMENT ON TABLE "seg"."T_Rol" IS 'Roles de acceso del sistema. La autorizacion fina se aplica via RLS.';
COMMENT ON COLUMN "seg"."T_Rol"."Id" IS 'Identificador unico del rol.';
COMMENT ON COLUMN "seg"."T_Rol"."Codigo" IS 'Codigo logico del rol: admin, gerencia, supervision, almacenero.';
COMMENT ON COLUMN "seg"."T_Rol"."Nombre" IS 'Nombre visible del rol.';
COMMENT ON COLUMN "seg"."T_Rol"."Descripcion" IS 'Descripcion del alcance del rol.';
COMMENT ON COLUMN "seg"."T_Rol"."Estado" IS 'Estado de auditoria: activo (TRUE) o inactivo (FALSE).';
COMMENT ON COLUMN "seg"."T_Rol"."RowVersion" IS 'Version de fila para concurrencia optimista (incrementada por trigger).';
COMMENT ON COLUMN "seg"."T_Rol"."IdMigracion" IS 'Identificador de origen en migracion (opcional).';

CREATE TRIGGER "TR_T_Rol_Auditoria"
	BEFORE UPDATE ON "seg"."T_Rol"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	seg.T_Usuario  (extiende auth.users de Supabase, 1:1 por Id)
===================================================================== */
CREATE TABLE "seg"."T_Usuario"
(
	"Id"                  UUID         NOT NULL,
	"NombreCompleto"      VARCHAR(150) NOT NULL,
	"Dni"                 VARCHAR(15),
	"Telefono"            VARCHAR(20),
	"IdRol"               UUID         NOT NULL,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Usuario" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_Usuario_AuthUsers_Id"
		FOREIGN KEY ("Id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_Usuario_Rol_IdRol"
		FOREIGN KEY ("IdRol") REFERENCES "seg"."T_Rol" ("Id"),
	CONSTRAINT "UQ_T_Usuario_Dni" UNIQUE ("Dni")
);

COMMENT ON TABLE "seg"."T_Usuario" IS 'Datos de negocio del usuario. Las credenciales viven en auth.users (Supabase).';
COMMENT ON COLUMN "seg"."T_Usuario"."Id" IS 'Identificador del usuario, igual al id de auth.users.';
COMMENT ON COLUMN "seg"."T_Usuario"."NombreCompleto" IS 'Nombre completo del usuario.';
COMMENT ON COLUMN "seg"."T_Usuario"."Dni" IS 'Documento Nacional de Identidad.';
COMMENT ON COLUMN "seg"."T_Usuario"."Telefono" IS 'Telefono de contacto.';
COMMENT ON COLUMN "seg"."T_Usuario"."IdRol" IS 'Rol asignado al usuario.';
COMMENT ON COLUMN "seg"."T_Usuario"."Estado" IS 'Estado de auditoria: activo o inactivo.';
COMMENT ON COLUMN "seg"."T_Usuario"."RowVersion" IS 'Version de fila para concurrencia optimista.';

CREATE INDEX "IX_T_Usuario_IdRol" ON "seg"."T_Usuario" ("IdRol");

CREATE TRIGGER "TR_T_Usuario_Auditoria"
	BEFORE UPDATE ON "seg"."T_Usuario"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* ---------------------------------------------------------------------
	Devuelve el codigo de rol del usuario autenticado (para las RLS).
	SECURITY DEFINER para leer T_Usuario sin recursion de politicas.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "seg"."FnRolUsuario"()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "seg", "public"
AS $$
	SELECT R."Codigo"
	FROM "seg"."T_Usuario" U
	INNER JOIN "seg"."T_Rol" R ON R."Id" = U."IdRol"
	WHERE U."Id" = auth.uid() AND U."Estado" = TRUE;
$$;

COMMENT ON FUNCTION "seg"."FnRolUsuario"() IS 'Codigo del rol del usuario autenticado: admin, gerencia, supervision o almacenero.';