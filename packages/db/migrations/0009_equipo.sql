/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Equipo + vinculo con inv.T_Vehiculo
	Tipo de Cambio: CREATE + ALTER - dimension Equipo (1:N placas)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Un equipo agrupa varias placas. Los requerimientos pueden apuntar
	             al equipo (general) o a una placa exacta; las salidas van por placa.
*/

CREATE TABLE "inv"."T_Equipo"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Codigo"              VARCHAR(20)  NOT NULL,
	"Nombre"              VARCHAR(120) NOT NULL,
	"Descripcion"         VARCHAR(200),
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Equipo" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Equipo_Codigo" UNIQUE ("Codigo")
);

COMMENT ON TABLE "inv"."T_Equipo" IS 'Equipo que agrupa una o varias placas/vehiculos (1:N). Destino de requerimientos a nivel general.';
COMMENT ON COLUMN "inv"."T_Equipo"."Id" IS 'Identificador unico del equipo.';
COMMENT ON COLUMN "inv"."T_Equipo"."Codigo" IS 'Codigo corto del equipo.';
COMMENT ON COLUMN "inv"."T_Equipo"."Nombre" IS 'Nombre del equipo.';
COMMENT ON COLUMN "inv"."T_Equipo"."Descripcion" IS 'Descripcion del equipo.';
COMMENT ON COLUMN "inv"."T_Equipo"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE TRIGGER "TR_T_Equipo_Auditoria"
	BEFORE UPDATE ON "inv"."T_Equipo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* Cada placa/vehiculo pertenece (opcionalmente) a un equipo */
ALTER TABLE "inv"."T_Vehiculo"
	ADD COLUMN "IdEquipo" UUID;

ALTER TABLE "inv"."T_Vehiculo"
	ADD CONSTRAINT "FK_T_Vehiculo_Equipo_IdEquipo"
		FOREIGN KEY ("IdEquipo") REFERENCES "inv"."T_Equipo" ("Id");

COMMENT ON COLUMN "inv"."T_Vehiculo"."IdEquipo" IS 'Equipo al que pertenece la placa/vehiculo.';

CREATE INDEX "IX_T_Vehiculo_IdEquipo" ON "inv"."T_Vehiculo" ("IdEquipo");

/* RLS */
ALTER TABLE "inv"."T_Equipo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_Equipo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "EquipoEscritura" ON "inv"."T_Equipo"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));
