/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_TipoEquipo + inv.T_ProductoTipoEquipo + asociacion masiva
	Tipo de Cambio: CREATE + ALTER - clasificacion de productos por tipo de equipo
	Autor: Equipo Desarrollo
	Fecha: 2026-06-08
	Descripcion: Un tipo de equipo (camion, camioneta, grua...) agrupa equipos y
	             define que productos le son compatibles. Un producto puede ser
	             compatible con N tipos (tabla puente). PRODUCTO SIN FILAS EN LA
	             PUENTE = producto GENERAL (usable por cualquier equipo, ej. grasa).
*/

/* =====================================================================
	inv.T_TipoEquipo  (maestro)
===================================================================== */
CREATE TABLE "inv"."T_TipoEquipo"
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
	CONSTRAINT "PK_T_TipoEquipo" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_TipoEquipo_Codigo" UNIQUE ("Codigo")
);

COMMENT ON TABLE "inv"."T_TipoEquipo" IS 'Tipo de equipo (camion, camioneta, grua...). Agrupa equipos y define compatibilidad de productos.';
COMMENT ON COLUMN "inv"."T_TipoEquipo"."Id" IS 'Identificador unico del tipo de equipo.';
COMMENT ON COLUMN "inv"."T_TipoEquipo"."Codigo" IS 'Codigo corto del tipo de equipo.';
COMMENT ON COLUMN "inv"."T_TipoEquipo"."Nombre" IS 'Nombre del tipo de equipo.';
COMMENT ON COLUMN "inv"."T_TipoEquipo"."Descripcion" IS 'Descripcion del tipo de equipo.';
COMMENT ON COLUMN "inv"."T_TipoEquipo"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE TRIGGER "TR_T_TipoEquipo_Auditoria"
	BEFORE UPDATE ON "inv"."T_TipoEquipo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_TipoEquipo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_TipoEquipo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "TipoEquipoEscritura" ON "inv"."T_TipoEquipo"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/* =====================================================================
	ALTER inv.T_Equipo  (cada equipo pertenece a un tipo)
	Nullable para equipos legacy; la UI lo exige al crear/editar.
===================================================================== */
ALTER TABLE "inv"."T_Equipo"
	ADD COLUMN "IdTipoEquipo" UUID;

ALTER TABLE "inv"."T_Equipo"
	ADD CONSTRAINT "FK_T_Equipo_TipoEquipo_IdTipoEquipo"
		FOREIGN KEY ("IdTipoEquipo") REFERENCES "inv"."T_TipoEquipo" ("Id");

COMMENT ON COLUMN "inv"."T_Equipo"."IdTipoEquipo" IS 'Tipo al que pertenece el equipo (camion, camioneta...).';

CREATE INDEX "IX_T_Equipo_IdTipoEquipo" ON "inv"."T_Equipo" ("IdTipoEquipo");

/* =====================================================================
	inv.T_ProductoTipoEquipo  (puente N:M producto <-> tipo de equipo)
===================================================================== */
CREATE TABLE "inv"."T_ProductoTipoEquipo"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdProducto"          UUID         NOT NULL,
	"IdTipoEquipo"        UUID         NOT NULL,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_ProductoTipoEquipo" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_ProductoTipoEquipo_IdProducto_IdTipoEquipo" UNIQUE ("IdProducto","IdTipoEquipo"),
	CONSTRAINT "FK_T_ProductoTipoEquipo_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_ProductoTipoEquipo_TipoEquipo_IdTipoEquipo"
		FOREIGN KEY ("IdTipoEquipo") REFERENCES "inv"."T_TipoEquipo" ("Id") ON DELETE CASCADE
);

COMMENT ON TABLE "inv"."T_ProductoTipoEquipo" IS 'Compatibilidad producto<->tipo de equipo (N:M). Producto SIN filas aqui = producto GENERAL (compatible con cualquier tipo).';
COMMENT ON COLUMN "inv"."T_ProductoTipoEquipo"."Id" IS 'Identificador unico de la asociacion.';
COMMENT ON COLUMN "inv"."T_ProductoTipoEquipo"."IdProducto" IS 'Producto compatible.';
COMMENT ON COLUMN "inv"."T_ProductoTipoEquipo"."IdTipoEquipo" IS 'Tipo de equipo con el que es compatible.';

CREATE INDEX "IX_T_ProductoTipoEquipo_IdTipoEquipo" ON "inv"."T_ProductoTipoEquipo" ("IdTipoEquipo");

CREATE TRIGGER "TR_T_ProductoTipoEquipo_Auditoria"
	BEFORE UPDATE ON "inv"."T_ProductoTipoEquipo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_ProductoTipoEquipo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_ProductoTipoEquipo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "ProductoTipoEquipoEscritura" ON "inv"."T_ProductoTipoEquipo"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/* ---------------------------------------------------------------------
	Asociacion masiva: asocia TODOS los productos de una categoria a un tipo.
	Escribe filas individuales en la puente (unica fuente de verdad).
	Idempotente (ON CONFLICT). Retorna la cantidad de filas insertadas.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnAsociarCategoriaTipoEquipo"
(
	"PIdCategoria"   UUID
	,"PIdTipoEquipo" UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vInsertados" INTEGER;
BEGIN
	INSERT INTO "inv"."T_ProductoTipoEquipo" ("IdProducto","IdTipoEquipo")
	SELECT P."Id", "PIdTipoEquipo"
	FROM "inv"."T_Producto" P
	WHERE P."IdCategoria" = "PIdCategoria" AND P."Estado" = TRUE
	ON CONFLICT ("IdProducto","IdTipoEquipo") DO NOTHING;

	GET DIAGNOSTICS "vInsertados" = ROW_COUNT;
	RETURN "vInsertados";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAsociarCategoriaTipoEquipo"(UUID, UUID) IS 'Asocia todos los productos activos de una categoria a un tipo de equipo. Idempotente, retorna insertados.';

/* ---------------------------------------------------------------------
	FnContarDependencias: agrega rama 'tipoEquipo'.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnContarDependencias"
(
	"PEntidad" TEXT
	,"PId"     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vResultado" JSONB;
	"vTotal"     NUMERIC;
BEGIN
	IF "PEntidad" = 'producto' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'movimientos', (SELECT COUNT(*) FROM "inv"."T_MovimientoStock" WHERE "IdProducto" = "PId"),
			'detalleDocumentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventarioDetalle" WHERE "IdProducto" = "PId"),
			'detalleRequerimientos', (SELECT COUNT(*) FROM "inv"."T_RequerimientoDetalle" WHERE "IdProducto" = "PId"),
			'stockDisponible', (SELECT COALESCE(SUM("CantidadDisponible"), 0) FROM "inv"."T_SaldoStock" WHERE "IdProducto" = "PId")
		);
	ELSIF "PEntidad" = 'proveedor' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdProveedor" = "PId"),
			'precios', (SELECT COUNT(*) FROM "inv"."T_ProductoPrecioHistorico" WHERE "IdProveedor" = "PId")
		);
	ELSIF "PEntidad" = 'ubicacion' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdUbicacionOrigen" = "PId" OR "IdUbicacionDestino" = "PId"),
			'movimientos', (SELECT COUNT(*) FROM "inv"."T_MovimientoStock" WHERE "IdUbicacion" = "PId"),
			'stockDisponible', (SELECT COALESCE(SUM("CantidadDisponible"), 0) FROM "inv"."T_SaldoStock" WHERE "IdUbicacion" = "PId")
		);
	ELSIF "PEntidad" = 'equipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'vehiculos', (SELECT COUNT(*) FROM "inv"."T_Vehiculo" WHERE "IdEquipo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdEquipo" = "PId")
		);
	ELSIF "PEntidad" = 'vehiculo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdVehiculo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdVehiculo" = "PId")
		);
	ELSIF "PEntidad" = 'tipoEquipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'equipos', (SELECT COUNT(*) FROM "inv"."T_Equipo" WHERE "IdTipoEquipo" = "PId"),
			'productosAsociados', (SELECT COUNT(*) FROM "inv"."T_ProductoTipoEquipo" WHERE "IdTipoEquipo" = "PId")
		);
	ELSE
		RAISE EXCEPTION 'Entidad no soportada para verificacion de dependencias: %', "PEntidad";
	END IF;

	SELECT COALESCE(SUM(value::NUMERIC), 0) INTO "vTotal"
	FROM JSONB_EACH_TEXT("vResultado");

	RETURN "vResultado"
		|| JSONB_BUILD_OBJECT('total', "vTotal")
		|| JSONB_BUILD_OBJECT('puedeEliminar', "vTotal" = 0);
END;
$$;

COMMENT ON FUNCTION "inv"."FnContarDependencias"(TEXT, UUID) IS 'Cuenta datos enlazados de una entidad. puedeEliminar=true solo si total=0.';

/* Seed de tipos base (idempotente) */
INSERT INTO "inv"."T_TipoEquipo" ("Codigo","Nombre","Descripcion")
VALUES
	('CAMION','Camion','Camiones de carga y volquetes')
	,('CAMIONETA','Camioneta','Camionetas y vehiculos livianos')
	,('GRUA','Grua','Gruas de izaje')
	,('CISTERNA','Cisterna','Camiones cisterna')
	,('BUS','Bus','Buses de personal')
ON CONFLICT ("Codigo") DO NOTHING;
