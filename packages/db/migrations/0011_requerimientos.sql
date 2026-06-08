/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Requerimiento + inv.T_RequerimientoDetalle
	Tipo de Cambio: CREATE - modulo de requerimientos/pedidos con historico
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Pedidos contra un equipo (general) o una placa exacta, con origen
	             (planificado, presupuestado, desgaste prematuro). Permite ver el
	             historico de cuantas veces se pidio cada producto.
*/

CREATE TABLE "inv"."T_Requerimiento"
(
	"Id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
	"NumeroRequerimiento"   VARCHAR(40),
	"FechaRequerimiento"    DATE         NOT NULL,
	"Origen"                VARCHAR(25)  NOT NULL,
	"IdEquipo"              UUID,
	"IdVehiculo"            UUID,
	"Situacion"             VARCHAR(15)  NOT NULL DEFAULT 'pendiente',
	"Notas"                 VARCHAR(500),
	"IdDocumentoInventario" UUID,
	"Estado"                BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"       VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"   VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"            BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"           UUID,
	CONSTRAINT "PK_T_Requerimiento" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_Requerimiento_Equipo_IdEquipo"
		FOREIGN KEY ("IdEquipo") REFERENCES "inv"."T_Equipo" ("Id"),
	CONSTRAINT "FK_T_Requerimiento_Vehiculo_IdVehiculo"
		FOREIGN KEY ("IdVehiculo") REFERENCES "inv"."T_Vehiculo" ("Id"),
	CONSTRAINT "FK_T_Requerimiento_DocumentoInventario_IdDocumentoInventario"
		FOREIGN KEY ("IdDocumentoInventario") REFERENCES "inv"."T_DocumentoInventario" ("Id"),
	CONSTRAINT "CHK_T_Requerimiento_Origen_Permitido"
		CHECK ("Origen" IN ('planificado','presupuestado','desgaste_prematuro')),
	CONSTRAINT "CHK_T_Requerimiento_Situacion_Permitida"
		CHECK ("Situacion" IN ('pendiente','atendido','anulado')),
	CONSTRAINT "CHK_T_Requerimiento_Destino_Obligatorio"
		CHECK ("IdEquipo" IS NOT NULL OR "IdVehiculo" IS NOT NULL)
);

COMMENT ON TABLE "inv"."T_Requerimiento" IS 'Pedido de productos para un equipo o placa, con origen y situacion. Base del historico de pedidos.';
COMMENT ON COLUMN "inv"."T_Requerimiento"."Id" IS 'Identificador unico del requerimiento.';
COMMENT ON COLUMN "inv"."T_Requerimiento"."NumeroRequerimiento" IS 'Correlativo del requerimiento.';
COMMENT ON COLUMN "inv"."T_Requerimiento"."FechaRequerimiento" IS 'Fecha del pedido.';
COMMENT ON COLUMN "inv"."T_Requerimiento"."Origen" IS 'Origen: planificado, presupuestado o desgaste_prematuro.';
COMMENT ON COLUMN "inv"."T_Requerimiento"."IdEquipo" IS 'Equipo destino (pedido general).';
COMMENT ON COLUMN "inv"."T_Requerimiento"."IdVehiculo" IS 'Placa exacta destino (si aplica).';
COMMENT ON COLUMN "inv"."T_Requerimiento"."Situacion" IS 'Situacion: pendiente, atendido, anulado.';
COMMENT ON COLUMN "inv"."T_Requerimiento"."IdDocumentoInventario" IS 'Documento de salida que atendio el requerimiento (si aplica).';
COMMENT ON COLUMN "inv"."T_Requerimiento"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE INDEX "IX_T_Requerimiento_Fecha" ON "inv"."T_Requerimiento" ("FechaRequerimiento");
CREATE INDEX "IX_T_Requerimiento_IdEquipo" ON "inv"."T_Requerimiento" ("IdEquipo");
CREATE INDEX "IX_T_Requerimiento_IdVehiculo" ON "inv"."T_Requerimiento" ("IdVehiculo");
CREATE INDEX "IX_T_Requerimiento_Situacion" ON "inv"."T_Requerimiento" ("Situacion");

CREATE TRIGGER "TR_T_Requerimiento_Auditoria"
	BEFORE UPDATE ON "inv"."T_Requerimiento"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

CREATE TABLE "inv"."T_RequerimientoDetalle"
(
	"Id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdRequerimiento"     UUID          NOT NULL,
	"IdProducto"          UUID          NOT NULL,
	"Cantidad"            NUMERIC(14,3) NOT NULL,
	"CantidadAtendida"    NUMERIC(14,3) NOT NULL DEFAULT 0,
	"Notas"               VARCHAR(300),
	"Estado"              BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_RequerimientoDetalle" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_RequerimientoDetalle_Requerimiento_IdRequerimiento"
		FOREIGN KEY ("IdRequerimiento") REFERENCES "inv"."T_Requerimiento" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_RequerimientoDetalle_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "CHK_T_RequerimientoDetalle_Cantidad_MayorACero"
		CHECK ("Cantidad" > 0)
);

COMMENT ON TABLE "inv"."T_RequerimientoDetalle" IS 'Lineas de producto de un requerimiento.';
COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."Id" IS 'Identificador unico de la linea.';
COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."IdRequerimiento" IS 'Requerimiento al que pertenece.';
COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."IdProducto" IS 'Producto pedido.';
COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."Cantidad" IS 'Cantidad solicitada.';
COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."CantidadAtendida" IS 'Cantidad ya atendida del pedido.';

CREATE INDEX "IX_T_RequerimientoDetalle_IdRequerimiento" ON "inv"."T_RequerimientoDetalle" ("IdRequerimiento");
CREATE INDEX "IX_T_RequerimientoDetalle_IdProducto" ON "inv"."T_RequerimientoDetalle" ("IdProducto");

CREATE TRIGGER "TR_T_RequerimientoDetalle_Auditoria"
	BEFORE UPDATE ON "inv"."T_RequerimientoDetalle"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* RLS: lectura autenticado; escritura admin/almacenero/supervision */
ALTER TABLE "inv"."T_Requerimiento"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_RequerimientoDetalle" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_Requerimiento"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "RequerimientoEscritura" ON "inv"."T_Requerimiento"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

CREATE POLICY "LecturaAutenticado" ON "inv"."T_RequerimientoDetalle"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "RequerimientoDetalleEscritura" ON "inv"."T_RequerimientoDetalle"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));
