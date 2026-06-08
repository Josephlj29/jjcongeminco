/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: catalogo (T_UnidadMedida, T_Categoria, T_Producto, T_Ubicacion, T_Proveedor, T_Vehiculo)
	Tipo de Cambio: CREATE - catalogo maestro del inventario
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Tablas maestras del catalogo unificado de los 6 KARDEX.
*/

/* =====================================================================
	inv.T_UnidadMedida
===================================================================== */
CREATE TABLE "inv"."T_UnidadMedida"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Codigo"              VARCHAR(10)  NOT NULL,
	"Nombre"              VARCHAR(50)  NOT NULL,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_UnidadMedida" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_UnidadMedida_Codigo" UNIQUE ("Codigo")
);

COMMENT ON TABLE "inv"."T_UnidadMedida" IS 'Unidades de medida normalizadas (NIU, UND, LT, KG, M).';
COMMENT ON COLUMN "inv"."T_UnidadMedida"."Id" IS 'Identificador unico de la unidad de medida.';
COMMENT ON COLUMN "inv"."T_UnidadMedida"."Codigo" IS 'Codigo corto de la unidad (NIU, UND, LT, KG, M).';
COMMENT ON COLUMN "inv"."T_UnidadMedida"."Nombre" IS 'Nombre descriptivo de la unidad.';
COMMENT ON COLUMN "inv"."T_UnidadMedida"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE TRIGGER "TR_T_UnidadMedida_Auditoria"
	BEFORE UPDATE ON "inv"."T_UnidadMedida"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_Categoria  (jerarquica: familia -> categoria via IdCategoriaPadre)
===================================================================== */
CREATE TABLE "inv"."T_Categoria"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdCategoriaPadre"    UUID,
	"Codigo"              VARCHAR(20)  NOT NULL,
	"Nombre"              VARCHAR(80)  NOT NULL,
	"Descripcion"         VARCHAR(200),
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Categoria" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Categoria_Codigo" UNIQUE ("Codigo"),
	CONSTRAINT "FK_T_Categoria_Categoria_IdCategoriaPadre"
		FOREIGN KEY ("IdCategoriaPadre") REFERENCES "inv"."T_Categoria" ("Id")
);

COMMENT ON TABLE "inv"."T_Categoria" IS 'Categorias jerarquicas: nivel padre = familia (Herramientas, Filtros...), hijo = categoria del Excel.';
COMMENT ON COLUMN "inv"."T_Categoria"."Id" IS 'Identificador unico de la categoria.';
COMMENT ON COLUMN "inv"."T_Categoria"."IdCategoriaPadre" IS 'Categoria padre (NULL si es familia raiz).';
COMMENT ON COLUMN "inv"."T_Categoria"."Codigo" IS 'Codigo unico de la categoria.';
COMMENT ON COLUMN "inv"."T_Categoria"."Nombre" IS 'Nombre de la categoria o familia.';
COMMENT ON COLUMN "inv"."T_Categoria"."Descripcion" IS 'Descripcion opcional.';

CREATE INDEX "IX_T_Categoria_IdCategoriaPadre" ON "inv"."T_Categoria" ("IdCategoriaPadre");

CREATE TRIGGER "TR_T_Categoria_Auditoria"
	BEFORE UPDATE ON "inv"."T_Categoria"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_Producto  (catalogo unificado; Sku unico global)
===================================================================== */
CREATE TABLE "inv"."T_Producto"
(
	"Id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
	"Sku"                 CITEXT        NOT NULL,
	"Nombre"              VARCHAR(200)  NOT NULL,
	"IdCategoria"         UUID          NOT NULL,
	"IdUnidadMedida"      UUID          NOT NULL,
	"StockMinimo"         NUMERIC(14,3) NOT NULL DEFAULT 0,
	"CodigoBarra"         VARCHAR(50),
	"Atributos"           JSONB         NOT NULL DEFAULT '{}',
	"Estado"              BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Producto" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Producto_Sku" UNIQUE ("Sku"),
	CONSTRAINT "FK_T_Producto_Categoria_IdCategoria"
		FOREIGN KEY ("IdCategoria") REFERENCES "inv"."T_Categoria" ("Id"),
	CONSTRAINT "FK_T_Producto_UnidadMedida_IdUnidadMedida"
		FOREIGN KEY ("IdUnidadMedida") REFERENCES "inv"."T_UnidadMedida" ("Id"),
	CONSTRAINT "CHK_T_Producto_StockMinimo_NoNegativo"
		CHECK ("StockMinimo" >= 0)
);

COMMENT ON TABLE "inv"."T_Producto" IS 'Catalogo unificado de productos. Sku unico global (resuelve prefijos compartidos entre familias).';
COMMENT ON COLUMN "inv"."T_Producto"."Id" IS 'Identificador unico del producto.';
COMMENT ON COLUMN "inv"."T_Producto"."Sku" IS 'Codigo original del KARDEX. Unico en todo el catalogo.';
COMMENT ON COLUMN "inv"."T_Producto"."Nombre" IS 'Descripcion del producto.';
COMMENT ON COLUMN "inv"."T_Producto"."IdCategoria" IS 'Categoria a la que pertenece el producto.';
COMMENT ON COLUMN "inv"."T_Producto"."IdUnidadMedida" IS 'Unidad de medida del producto.';
COMMENT ON COLUMN "inv"."T_Producto"."StockMinimo" IS 'Punto de reorden para alertas de stock bajo.';
COMMENT ON COLUMN "inv"."T_Producto"."CodigoBarra" IS 'Codigo de barras opcional.';
COMMENT ON COLUMN "inv"."T_Producto"."Atributos" IS 'Atributos variables por familia (marca, medida, viscosidad) en JSON.';
COMMENT ON COLUMN "inv"."T_Producto"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE INDEX "IX_T_Producto_IdCategoria" ON "inv"."T_Producto" ("IdCategoria");
CREATE INDEX "IX_T_Producto_CodigoBarra" ON "inv"."T_Producto" ("CodigoBarra") WHERE "CodigoBarra" IS NOT NULL;
CREATE INDEX "IX_T_Producto_Estado" ON "inv"."T_Producto" ("Estado");

CREATE TRIGGER "TR_T_Producto_Auditoria"
	BEFORE UPDATE ON "inv"."T_Producto"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_Ubicacion  (multi-almacen)
===================================================================== */
CREATE TABLE "inv"."T_Ubicacion"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Codigo"              VARCHAR(20)  NOT NULL,
	"Nombre"              VARCHAR(120) NOT NULL,
	"Tipo"                VARCHAR(20)  NOT NULL DEFAULT 'proyecto',
	"Direccion"           VARCHAR(200),
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Ubicacion" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Ubicacion_Codigo" UNIQUE ("Codigo"),
	CONSTRAINT "CHK_T_Ubicacion_Tipo_Permitido"
		CHECK ("Tipo" IN ('almacen_central','proyecto','otro'))
);

COMMENT ON TABLE "inv"."T_Ubicacion" IS 'Almacenes y ubicaciones fisicas (central Arequipa, proyectos como Tambomayo).';
COMMENT ON COLUMN "inv"."T_Ubicacion"."Id" IS 'Identificador unico de la ubicacion.';
COMMENT ON COLUMN "inv"."T_Ubicacion"."Codigo" IS 'Codigo corto de la ubicacion.';
COMMENT ON COLUMN "inv"."T_Ubicacion"."Nombre" IS 'Nombre de la ubicacion.';
COMMENT ON COLUMN "inv"."T_Ubicacion"."Tipo" IS 'Tipo: almacen_central, proyecto u otro.';
COMMENT ON COLUMN "inv"."T_Ubicacion"."Direccion" IS 'Direccion fisica.';

CREATE TRIGGER "TR_T_Ubicacion_Auditoria"
	BEFORE UPDATE ON "inv"."T_Ubicacion"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_Proveedor
===================================================================== */
CREATE TABLE "inv"."T_Proveedor"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Ruc"                 CITEXT,
	"Nombre"              VARCHAR(150) NOT NULL,
	"Contacto"            VARCHAR(120),
	"Telefono"            VARCHAR(20),
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Proveedor" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Proveedor_Ruc" UNIQUE ("Ruc")
);

COMMENT ON TABLE "inv"."T_Proveedor" IS 'Proveedores referenciados en las entradas/compras.';
COMMENT ON COLUMN "inv"."T_Proveedor"."Id" IS 'Identificador unico del proveedor.';
COMMENT ON COLUMN "inv"."T_Proveedor"."Ruc" IS 'Registro Unico de Contribuyentes.';
COMMENT ON COLUMN "inv"."T_Proveedor"."Nombre" IS 'Razon social o nombre del proveedor.';
COMMENT ON COLUMN "inv"."T_Proveedor"."Contacto" IS 'Persona de contacto.';
COMMENT ON COLUMN "inv"."T_Proveedor"."Telefono" IS 'Telefono de contacto.';

CREATE TRIGGER "TR_T_Proveedor_Auditoria"
	BEFORE UPDATE ON "inv"."T_Proveedor"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_Vehiculo  (transferencias / futuro modulo de mantenimiento)
===================================================================== */
CREATE TABLE "inv"."T_Vehiculo"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Placa"               VARCHAR(15)  NOT NULL,
	"Modelo"              VARCHAR(80),
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Vehiculo" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Vehiculo_Placa" UNIQUE ("Placa")
);

COMMENT ON TABLE "inv"."T_Vehiculo" IS 'Vehiculos para transferencias y futuro modulo de mantenimiento.';
COMMENT ON COLUMN "inv"."T_Vehiculo"."Id" IS 'Identificador unico del vehiculo.';
COMMENT ON COLUMN "inv"."T_Vehiculo"."Placa" IS 'Placa del vehiculo.';
COMMENT ON COLUMN "inv"."T_Vehiculo"."Modelo" IS 'Modelo del vehiculo.';

CREATE TRIGGER "TR_T_Vehiculo_Auditoria"
	BEFORE UPDATE ON "inv"."T_Vehiculo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();