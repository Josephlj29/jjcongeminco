/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_OrdenMantenimiento + inv.T_OrdenMantenimientoTrabajo
	Tipo de Cambio: CREATE - módulo de órdenes de trabajo de mantenimiento (OT)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: Encabezado de mantenimiento por placa (preventivo/correctivo), con
	             kilometraje, turno, mecánico responsable y la lista de trabajos
	             realizados (tabla normalizada). Los REPUESTOS UTILIZADOS NO se
	             modelan aquí: la OT se enlaza 1:1 a un T_Requerimiento (IdRequerimiento)
	             que es la única fuente de verdad del consumo de stock. Flujo
	             "consumir y reconciliar" (Model 2): la salida se genera al registrar
	             los repuestos; el admin ratifica después. Estados: abierta → consumida
	             → cerrada (aprobada) | anulada (rechazada, con entrada de reversa).
*/

/* ===== T_OrdenMantenimiento (cabecera) ===== */
CREATE TABLE "inv"."T_OrdenMantenimiento"
(
	"Id"                          UUID         NOT NULL DEFAULT gen_random_uuid(),
	"NumeroOrden"                 VARCHAR(40),
	"TipoMantenimiento"           VARCHAR(15)  NOT NULL,
	"FechaOrden"                  DATE         NOT NULL,
	"Turno"                       VARCHAR(10)  NOT NULL,
	"Kilometraje"                 NUMERIC(10,2),
	"IdVehiculo"                  UUID         NOT NULL,
	"IdMecanicoResponsable"       UUID         NOT NULL,
	"Observaciones"               VARCHAR(500),
	"Situacion"                   VARCHAR(12)  NOT NULL DEFAULT 'abierta',
	"IdRequerimiento"             UUID,
	"IdDocumentoInventarioReversa" UUID,
	"MotivoReconciliacion"        VARCHAR(500),
	"FechaReconciliacion"         TIMESTAMPTZ,
	"Estado"                      BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"             VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"         VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"                  BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"                 UUID,
	CONSTRAINT "PK_T_OrdenMantenimiento" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_OrdenMantenimiento_Vehiculo_IdVehiculo"
		FOREIGN KEY ("IdVehiculo") REFERENCES "inv"."T_Vehiculo" ("Id"),
	CONSTRAINT "FK_T_OrdenMantenimiento_Personal_IdMecanicoResponsable"
		FOREIGN KEY ("IdMecanicoResponsable") REFERENCES "inv"."T_Personal" ("Id"),
	CONSTRAINT "FK_T_OrdenMantenimiento_Requerimiento_IdRequerimiento"
		FOREIGN KEY ("IdRequerimiento") REFERENCES "inv"."T_Requerimiento" ("Id"),
	CONSTRAINT "FK_T_OrdenMantenimiento_DocInv_Reversa"
		FOREIGN KEY ("IdDocumentoInventarioReversa") REFERENCES "inv"."T_DocumentoInventario" ("Id"),
	CONSTRAINT "CHK_T_OrdenMantenimiento_Tipo_Permitido"
		CHECK ("TipoMantenimiento" IN ('preventivo','correctivo')),
	CONSTRAINT "CHK_T_OrdenMantenimiento_Turno_Permitido"
		CHECK ("Turno" IN ('dia','tarde','noche')),
	CONSTRAINT "CHK_T_OrdenMantenimiento_Situacion_Permitida"
		CHECK ("Situacion" IN ('abierta','consumida','cerrada','anulada')),
	CONSTRAINT "CHK_T_OrdenMantenimiento_Km_NoNegativo"
		CHECK ("Kilometraje" IS NULL OR "Kilometraje" >= 0)
);

COMMENT ON TABLE "inv"."T_OrdenMantenimiento" IS 'Orden de trabajo de mantenimiento por placa. Enlaza 1:1 a un requerimiento (repuestos) que descuenta el stock. Flujo consumir→reconciliar.';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."TipoMantenimiento" IS 'preventivo o correctivo. Correctivo deriva Origen=desgaste_prematuro en el requerimiento.';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."Kilometraje" IS 'Lectura de odómetro al momento del servicio (única captura de km en el sistema).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."Situacion" IS 'abierta, consumida (repuestos consumidos, por aprobar), cerrada (aprobada), anulada (rechazada con reversa).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."IdRequerimiento" IS 'Requerimiento de repuestos enlazado 1:1 (único origen del consumo de stock).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."IdDocumentoInventarioReversa" IS 'Documento de entrada de reversa generado si la reconciliación se rechaza.';

CREATE UNIQUE INDEX "UQ_T_OrdenMantenimiento_IdRequerimiento"
	ON "inv"."T_OrdenMantenimiento" ("IdRequerimiento")
	WHERE "IdRequerimiento" IS NOT NULL;
CREATE INDEX "IX_T_OrdenMantenimiento_IdVehiculo" ON "inv"."T_OrdenMantenimiento" ("IdVehiculo");
CREATE INDEX "IX_T_OrdenMantenimiento_Situacion" ON "inv"."T_OrdenMantenimiento" ("Situacion");
CREATE INDEX "IX_T_OrdenMantenimiento_FechaOrden" ON "inv"."T_OrdenMantenimiento" ("FechaOrden");
CREATE INDEX "IX_T_OrdenMantenimiento_IdMecanicoResponsable" ON "inv"."T_OrdenMantenimiento" ("IdMecanicoResponsable");

CREATE TRIGGER "TR_T_OrdenMantenimiento_Auditoria"
	BEFORE UPDATE ON "inv"."T_OrdenMantenimiento"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* ===== T_OrdenMantenimientoTrabajo (TRABAJOS REALIZADOS) ===== */
CREATE TABLE "inv"."T_OrdenMantenimientoTrabajo"
(
	"Id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdOrdenMantenimiento"  UUID         NOT NULL,
	"Secuencia"             INT          NOT NULL,
	"Descripcion"           VARCHAR(300) NOT NULL,
	"Estado"                BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"       VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"   VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"            BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"           UUID,
	CONSTRAINT "PK_T_OrdenMantenimientoTrabajo" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_OrdenMantenimientoTrabajo_Orden_IdOrdenMantenimiento"
		FOREIGN KEY ("IdOrdenMantenimiento") REFERENCES "inv"."T_OrdenMantenimiento" ("Id") ON DELETE CASCADE,
	CONSTRAINT "UQ_T_OrdenMantenimientoTrabajo_Orden_Secuencia"
		UNIQUE ("IdOrdenMantenimiento", "Secuencia")
);

COMMENT ON TABLE "inv"."T_OrdenMantenimientoTrabajo" IS 'Lista de trabajos realizados de una orden de mantenimiento (mano de obra, normalizada).';

CREATE INDEX "IX_T_OrdenMantenimientoTrabajo_IdOrden" ON "inv"."T_OrdenMantenimientoTrabajo" ("IdOrdenMantenimiento");

CREATE TRIGGER "TR_T_OrdenMantenimientoTrabajo_Auditoria"
	BEFORE UPDATE ON "inv"."T_OrdenMantenimientoTrabajo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* ===== RLS: lectura autenticado; escritura admin/almacenero/supervision ===== */
ALTER TABLE "inv"."T_OrdenMantenimiento"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_OrdenMantenimientoTrabajo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_OrdenMantenimiento"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "OrdenMantenimientoEscritura" ON "inv"."T_OrdenMantenimiento"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

CREATE POLICY "LecturaAutenticado" ON "inv"."T_OrdenMantenimientoTrabajo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "OrdenMantenimientoTrabajoEscritura" ON "inv"."T_OrdenMantenimientoTrabajo"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

/* ===== Seed: cargo MECANICO (para el responsable de la OT) ===== */
INSERT INTO "inv"."T_Cargo" ("Codigo", "Nombre", "Descripcion")
VALUES ('MECANICO', 'Mecánico', 'Personal de mantenimiento mecánico')
ON CONFLICT ("Codigo") DO NOTHING;
