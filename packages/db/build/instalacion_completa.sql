/*
	 INSTALACION COMPLETA - Inventario JJ Congeminco (re-ejecutable)
	 reset + 0001-0027 + seed + 222 productos. No incluye Storage ni admin.
*/

BEGIN;

/* RESET (limpia instalacion previa) - elimina datos del inventario, no toca auth */
DROP SCHEMA IF EXISTS "inv" CASCADE;
DROP SCHEMA IF EXISTS "seg" CASCADE;
DROP SCHEMA IF EXISTS "comun" CASCADE;

/* ===================== migrations/0001_extensions_and_roles.sql ===================== */
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

/* ===================== migrations/0002_catalog.sql ===================== */
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

/* ===================== migrations/0003_documents_ledger_balances.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: documentos, detalle, ledger (T_MovimientoStock) y saldos (T_SaldoStock)
	Tipo de Cambio: CREATE - nucleo transaccional del inventario
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Patron ERP de 3 capas. El ledger es la unica fuente de verdad
	             (append-only). El saldo se deriva y se cachea por trigger.
*/

/* =====================================================================
	inv.T_DocumentoInventario  (cabecera)
	Situacion = estado del flujo del documento (no confundir con Estado de auditoria).
===================================================================== */
CREATE TABLE "inv"."T_DocumentoInventario"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"TipoDocumento"       VARCHAR(25)  NOT NULL,
	"NumeroDocumento"     VARCHAR(40),
	"FechaDocumento"      DATE         NOT NULL,
	"IdUbicacionOrigen"   UUID,
	"IdUbicacionDestino"  UUID,
	"IdProveedor"         UUID,
	"Comprobante"         VARCHAR(60),
	"Referencia"          VARCHAR(120),
	"IdVehiculo"          UUID,
	"Situacion"           VARCHAR(15)  NOT NULL DEFAULT 'borrador',
	"Notas"               VARCHAR(500),
	"RutaPdf"             VARCHAR(500),
	"FechaConfirmacion"   TIMESTAMPTZ,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_DocumentoInventario" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Ubicacion_IdUbicacionOrigen"
		FOREIGN KEY ("IdUbicacionOrigen") REFERENCES "inv"."T_Ubicacion" ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Ubicacion_IdUbicacionDestino"
		FOREIGN KEY ("IdUbicacionDestino") REFERENCES "inv"."T_Ubicacion" ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Proveedor_IdProveedor"
		FOREIGN KEY ("IdProveedor") REFERENCES "inv"."T_Proveedor" ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Vehiculo_IdVehiculo"
		FOREIGN KEY ("IdVehiculo") REFERENCES "inv"."T_Vehiculo" ("Id"),
	CONSTRAINT "CHK_T_DocumentoInventario_TipoDocumento_Permitido"
		CHECK ("TipoDocumento" IN ('existencia_inicial','entrada','salida','transferencia','ajuste')),
	CONSTRAINT "CHK_T_DocumentoInventario_Situacion_Permitida"
		CHECK ("Situacion" IN ('borrador','confirmado','anulado')),
	CONSTRAINT "CHK_T_DocumentoInventario_Ubicaciones_PorTipo"
		CHECK
		(
			CASE "TipoDocumento"
				WHEN 'entrada'            THEN "IdUbicacionDestino" IS NOT NULL
				WHEN 'existencia_inicial' THEN "IdUbicacionDestino" IS NOT NULL
				WHEN 'salida'             THEN "IdUbicacionOrigen" IS NOT NULL
				WHEN 'transferencia'      THEN "IdUbicacionOrigen" IS NOT NULL
				                            AND "IdUbicacionDestino" IS NOT NULL
				                            AND "IdUbicacionOrigen" <> "IdUbicacionDestino"
				WHEN 'ajuste'             THEN "IdUbicacionDestino" IS NOT NULL
				                            OR "IdUbicacionOrigen" IS NOT NULL
			END
		)
);

COMMENT ON TABLE "inv"."T_DocumentoInventario" IS 'Cabecera de documentos de inventario (entrada, salida, transferencia, ajuste, existencia inicial).';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Id" IS 'Identificador unico del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."TipoDocumento" IS 'Tipo: existencia_inicial, entrada, salida, transferencia, ajuste.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."NumeroDocumento" IS 'Correlativo interno del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."FechaDocumento" IS 'Fecha del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdUbicacionOrigen" IS 'Ubicacion de salida (salida, transferencia).';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdUbicacionDestino" IS 'Ubicacion de entrada (entrada, transferencia).';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdProveedor" IS 'Proveedor en caso de compra/entrada.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Comprobante" IS 'Numero de factura, boleta o guia.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Referencia" IS 'Referencia libre: orden de trabajo, guia de remision, placa.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdVehiculo" IS 'Vehiculo asociado al traslado.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Situacion" IS 'Estado del flujo: borrador, confirmado, anulado.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Notas" IS 'Observaciones del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."RutaPdf" IS 'Ruta del PDF generado en Supabase Storage.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."FechaConfirmacion" IS 'Momento en que el documento fue confirmado.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE INDEX "IX_T_DocumentoInventario_TipoFecha" ON "inv"."T_DocumentoInventario" ("TipoDocumento","FechaDocumento");
CREATE INDEX "IX_T_DocumentoInventario_IdUbicacionOrigen" ON "inv"."T_DocumentoInventario" ("IdUbicacionOrigen");
CREATE INDEX "IX_T_DocumentoInventario_IdUbicacionDestino" ON "inv"."T_DocumentoInventario" ("IdUbicacionDestino");
CREATE INDEX "IX_T_DocumentoInventario_Situacion" ON "inv"."T_DocumentoInventario" ("Situacion");

CREATE TRIGGER "TR_T_DocumentoInventario_Auditoria"
	BEFORE UPDATE ON "inv"."T_DocumentoInventario"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_DocumentoInventarioDetalle  (lineas)
===================================================================== */
CREATE TABLE "inv"."T_DocumentoInventarioDetalle"
(
	"Id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdDocumentoInventario" UUID          NOT NULL,
	"IdProducto"            UUID          NOT NULL,
	"Cantidad"              NUMERIC(14,3) NOT NULL,
	"CostoUnitario"         NUMERIC(14,4),
	"Notas"                 VARCHAR(300),
	"Estado"                BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"       VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"   VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"            BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"           UUID,
	CONSTRAINT "PK_T_DocumentoInventarioDetalle" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_DocumentoInventarioDetalle_DocumentoInventario_IdDocumentoInventario"
		FOREIGN KEY ("IdDocumentoInventario") REFERENCES "inv"."T_DocumentoInventario" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_DocumentoInventarioDetalle_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "CHK_T_DocumentoInventarioDetalle_Cantidad_MayorACero"
		CHECK ("Cantidad" > 0)
);

COMMENT ON TABLE "inv"."T_DocumentoInventarioDetalle" IS 'Lineas de un documento de inventario.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."Id" IS 'Identificador unico de la linea.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."IdDocumentoInventario" IS 'Documento al que pertenece la linea.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."IdProducto" IS 'Producto movido.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."Cantidad" IS 'Cantidad positiva del movimiento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."CostoUnitario" IS 'Costo unitario opcional (valorizacion futura).';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."Notas" IS 'Observaciones de la linea.';

CREATE INDEX "IX_T_DocumentoInventarioDetalle_IdDocumentoInventario" ON "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario");
CREATE INDEX "IX_T_DocumentoInventarioDetalle_IdProducto" ON "inv"."T_DocumentoInventarioDetalle" ("IdProducto");

CREATE TRIGGER "TR_T_DocumentoInventarioDetalle_Auditoria"
	BEFORE UPDATE ON "inv"."T_DocumentoInventarioDetalle"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_MovimientoStock  (LEDGER inmutable, append-only)
	Direccion: +1 entra, -1 sale. Una transferencia genera 2 filas.
===================================================================== */
CREATE TABLE "inv"."T_MovimientoStock"
(
	"Id"                          UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdDocumentoInventarioDetalle" UUID         NOT NULL,
	"IdDocumentoInventario"       UUID          NOT NULL,
	"IdProducto"                  UUID          NOT NULL,
	"IdUbicacion"                 UUID          NOT NULL,
	"Direccion"                   SMALLINT      NOT NULL,
	"Cantidad"                    NUMERIC(14,3) NOT NULL,
	"CostoUnitario"               NUMERIC(14,4),
	"FechaMovimiento"             DATE          NOT NULL,
	"Estado"                      BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"             VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"         VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"                  BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"                 UUID,
	CONSTRAINT "PK_T_MovimientoStock" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_DocumentoInventarioDetalle_IdDocumentoInventarioDetalle"
		FOREIGN KEY ("IdDocumentoInventarioDetalle") REFERENCES "inv"."T_DocumentoInventarioDetalle" ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_DocumentoInventario_IdDocumentoInventario"
		FOREIGN KEY ("IdDocumentoInventario") REFERENCES "inv"."T_DocumentoInventario" ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_Ubicacion_IdUbicacion"
		FOREIGN KEY ("IdUbicacion") REFERENCES "inv"."T_Ubicacion" ("Id"),
	CONSTRAINT "CHK_T_MovimientoStock_Direccion_Permitida"
		CHECK ("Direccion" IN (-1, 1)),
	CONSTRAINT "CHK_T_MovimientoStock_Cantidad_MayorACero"
		CHECK ("Cantidad" > 0)
);

COMMENT ON TABLE "inv"."T_MovimientoStock" IS 'Ledger append-only. Unica fuente de verdad. Para revertir se anula el documento (movimientos inversos).';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."Id" IS 'Identificador unico del movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdDocumentoInventarioDetalle" IS 'Linea de documento que origino el movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdDocumentoInventario" IS 'Documento que origino el movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdProducto" IS 'Producto movido.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdUbicacion" IS 'Ubicacion afectada por el movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."Direccion" IS 'Sentido del movimiento: 1 entra, -1 sale.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."Cantidad" IS 'Cantidad positiva movida.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."CostoUnitario" IS 'Costo unitario opcional (valorizacion futura).';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."FechaMovimiento" IS 'Fecha contable del movimiento.';

CREATE INDEX "IX_T_MovimientoStock_ProductoUbicacionFecha" ON "inv"."T_MovimientoStock" ("IdProducto","IdUbicacion","FechaMovimiento");
CREATE INDEX "IX_T_MovimientoStock_UbicacionFecha" ON "inv"."T_MovimientoStock" ("IdUbicacion","FechaMovimiento");
CREATE INDEX "IX_T_MovimientoStock_IdDocumentoInventario" ON "inv"."T_MovimientoStock" ("IdDocumentoInventario");

/* =====================================================================
	inv.T_SaldoStock  (cache de saldos por producto + ubicacion)
	PK surrogate "Id" + clave natural unica (BSG: PK Id + UQ del par natural).
===================================================================== */
CREATE TABLE "inv"."T_SaldoStock"
(
	"Id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdProducto"          UUID          NOT NULL,
	"IdUbicacion"         UUID          NOT NULL,
	"CantidadDisponible"  NUMERIC(14,3) NOT NULL DEFAULT 0,
	"Estado"              BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_SaldoStock" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_SaldoStock_IdProducto_IdUbicacion" UNIQUE ("IdProducto","IdUbicacion"),
	CONSTRAINT "FK_T_SaldoStock_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "FK_T_SaldoStock_Ubicacion_IdUbicacion"
		FOREIGN KEY ("IdUbicacion") REFERENCES "inv"."T_Ubicacion" ("Id")
);

COMMENT ON TABLE "inv"."T_SaldoStock" IS 'Cache de saldo por producto y ubicacion. Mantenido por trigger desde el ledger.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."Id" IS 'Identificador unico del saldo.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."IdProducto" IS 'Producto del saldo.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."IdUbicacion" IS 'Ubicacion del saldo.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."CantidadDisponible" IS 'Cantidad disponible cacheada (derivada del ledger).';

/* ---------------------------------------------------------------------
	Al insertar un movimiento, actualiza el saldo cacheado (upsert).
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnAplicarMovimientoSaldo"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO "inv"."T_SaldoStock"
	(
		"IdProducto"
		,"IdUbicacion"
		,"CantidadDisponible"
	)
	VALUES
	(
		NEW."IdProducto"
		,NEW."IdUbicacion"
		,NEW."Direccion" * NEW."Cantidad"
	)
	ON CONFLICT ("IdProducto","IdUbicacion") DO UPDATE
		SET "CantidadDisponible" = "inv"."T_SaldoStock"."CantidadDisponible" + (NEW."Direccion" * NEW."Cantidad")
			,"FechaModificacion" = NOW()
			,"RowVersion" = "inv"."T_SaldoStock"."RowVersion" + 1;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "TR_T_MovimientoStock_AplicarSaldo"
	AFTER INSERT ON "inv"."T_MovimientoStock"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnAplicarMovimientoSaldo"();

/* ---------------------------------------------------------------------
	Bloquea UPDATE/DELETE del ledger (inmutabilidad real).
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnRechazarMutacionLedger"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'T_MovimientoStock es inmutable (append-only). Para revertir, anule el documento.';
END;
$$;

CREATE TRIGGER "TR_T_MovimientoStock_BloquearUpdate"
	BEFORE UPDATE ON "inv"."T_MovimientoStock"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnRechazarMutacionLedger"();

CREATE TRIGGER "TR_T_MovimientoStock_BloquearDelete"
	BEFORE DELETE ON "inv"."T_MovimientoStock"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnRechazarMutacionLedger"();

/* ---------------------------------------------------------------------
	Confirma un documento en borrador: explota sus lineas en el ledger.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnConfirmarDocumentoInventario"
(
	"PIdDocumentoInventario" UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vDocumento" "inv"."T_DocumentoInventario";
	"vDetalle"   "inv"."T_DocumentoInventarioDetalle";
BEGIN
	SELECT * INTO "vDocumento"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = "PIdDocumentoInventario"
	FOR UPDATE;

	IF "vDocumento" IS NULL THEN
		RAISE EXCEPTION 'El documento % no existe.', "PIdDocumentoInventario";
	END IF;

	IF "vDocumento"."Situacion" <> 'borrador' THEN
		RAISE EXCEPTION 'Solo se confirman documentos en borrador (situacion actual: %).', "vDocumento"."Situacion";
	END IF;

	FOR "vDetalle" IN
		SELECT * FROM "inv"."T_DocumentoInventarioDetalle"
		WHERE "IdDocumentoInventario" = "PIdDocumentoInventario"
	LOOP
		IF "vDocumento"."IdUbicacionOrigen" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('salida','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle"
				,"IdDocumentoInventario"
				,"IdProducto"
				,"IdUbicacion"
				,"Direccion"
				,"Cantidad"
				,"CostoUnitario"
				,"FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id"
				,"vDocumento"."Id"
				,"vDetalle"."IdProducto"
				,"vDocumento"."IdUbicacionOrigen"
				,-1
				,"vDetalle"."Cantidad"
				,"vDetalle"."CostoUnitario"
				,"vDocumento"."FechaDocumento"
			);
		END IF;

		IF "vDocumento"."IdUbicacionDestino" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('entrada','existencia_inicial','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle"
				,"IdDocumentoInventario"
				,"IdProducto"
				,"IdUbicacion"
				,"Direccion"
				,"Cantidad"
				,"CostoUnitario"
				,"FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id"
				,"vDocumento"."Id"
				,"vDetalle"."IdProducto"
				,"vDocumento"."IdUbicacionDestino"
				,1
				,"vDetalle"."Cantidad"
				,"vDetalle"."CostoUnitario"
				,"vDocumento"."FechaDocumento"
			);
		END IF;
	END LOOP;

	UPDATE "inv"."T_DocumentoInventario"
	SET "Situacion" = 'confirmado'
		,"FechaConfirmacion" = NOW()
	WHERE "Id" = "PIdDocumentoInventario";
END;
$$;

COMMENT ON FUNCTION "inv"."FnConfirmarDocumentoInventario"(UUID) IS 'Confirma un documento borrador: genera el ledger desde sus lineas y lo marca confirmado.';

/* ===================== migrations/0004_views_and_imports.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: vistas de reporte y T_Importacion
	Tipo de Cambio: CREATE - reportes y auditoria de cargas
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Vistas de reconciliacion, kardex y stock; tabla de auditoria de carga masiva.
*/

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Saldo recalculado desde el ledger. Sirve para auditar el cache T_SaldoStock.
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_SaldoReconciliacion" AS
	SELECT
		M."IdProducto"
		,M."IdUbicacion"
		,SUM(M."Direccion" * M."Cantidad") AS "CantidadDisponible"
	FROM
		"inv"."T_MovimientoStock" M
	GROUP BY
		M."IdProducto"
		,M."IdUbicacion";

COMMENT ON VIEW "inv"."V_MovimientoStock_SaldoReconciliacion" IS 'Saldo recalculado desde el ledger para auditar el cache T_SaldoStock.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Kardex detallado con saldo corrido por producto y ubicacion.
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_Kardex" AS
	SELECT
		M."Id" AS "IdMovimientoStock"
		,M."IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,M."IdUbicacion"
		,U."Nombre" AS "NombreUbicacion"
		,M."FechaMovimiento"
		,D."TipoDocumento"
		,D."NumeroDocumento"
		,D."Comprobante"
		,M."Direccion"
		,M."Cantidad"
		,(M."Direccion" * M."Cantidad") AS "CantidadConSigno"
		,SUM(M."Direccion" * M."Cantidad") OVER
			(
				PARTITION BY M."IdProducto", M."IdUbicacion"
				ORDER BY M."FechaMovimiento", M."Id"
				ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
			) AS "SaldoCorrido"
	FROM
		"inv"."T_MovimientoStock" M
	INNER JOIN "inv"."T_Producto" P ON P."Id" = M."IdProducto"
	INNER JOIN "inv"."T_Ubicacion" U ON U."Id" = M."IdUbicacion"
	INNER JOIN "inv"."T_DocumentoInventario" D ON D."Id" = M."IdDocumentoInventario";

COMMENT ON VIEW "inv"."V_MovimientoStock_Kardex" IS 'Kardex con saldo corrido (running balance) por producto y ubicacion.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Saldo total por producto y alerta de stock bajo minimo para el dashboard.
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado" AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Nombre" AS "NombreCategoria"
		,UM."Codigo" AS "CodigoUnidad"
		,P."StockMinimo"
		,COALESCE(SUM(S."CantidadDisponible"), 0) AS "StockTotal"
		,COALESCE(SUM(S."CantidadDisponible"), 0) < P."StockMinimo" AS "BajoMinimo"
	FROM
		"inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE
		P."Estado" = TRUE
	GROUP BY
		P."Id"
		,P."Sku"
		,P."Nombre"
		,C."Nombre"
		,UM."Codigo"
		,P."StockMinimo";

COMMENT ON VIEW "inv"."V_Producto_StockConsolidado" IS 'Saldo total por producto con alerta BajoMinimo para el dashboard de reorden.';

/* =====================================================================
	inv.T_Importacion  (auditoria de carga masiva Excel/CSV)
===================================================================== */
CREATE TABLE "inv"."T_Importacion"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"NombreArchivo"       VARCHAR(255) NOT NULL,
	"Objetivo"            VARCHAR(20)  NOT NULL,
	"Situacion"           VARCHAR(20)  NOT NULL DEFAULT 'procesando',
	"CantidadFilas"       INTEGER      NOT NULL DEFAULT 0,
	"CantidadCorrectas"   INTEGER      NOT NULL DEFAULT 0,
	"LogErrores"          JSONB        NOT NULL DEFAULT '[]',
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Importacion" PRIMARY KEY ("Id"),
	CONSTRAINT "CHK_T_Importacion_Objetivo_Permitido"
		CHECK ("Objetivo" IN ('productos','movimientos')),
	CONSTRAINT "CHK_T_Importacion_Situacion_Permitida"
		CHECK ("Situacion" IN ('procesando','completado','con_errores','fallido'))
);

COMMENT ON TABLE "inv"."T_Importacion" IS 'Auditoria de cargas masivas Excel/CSV (productos o movimientos).';
COMMENT ON COLUMN "inv"."T_Importacion"."Id" IS 'Identificador unico de la importacion.';
COMMENT ON COLUMN "inv"."T_Importacion"."NombreArchivo" IS 'Nombre del archivo cargado.';
COMMENT ON COLUMN "inv"."T_Importacion"."Objetivo" IS 'Que se cargo: productos o movimientos.';
COMMENT ON COLUMN "inv"."T_Importacion"."Situacion" IS 'Estado del proceso: procesando, completado, con_errores, fallido.';
COMMENT ON COLUMN "inv"."T_Importacion"."CantidadFilas" IS 'Total de filas leidas del archivo.';
COMMENT ON COLUMN "inv"."T_Importacion"."CantidadCorrectas" IS 'Filas procesadas correctamente.';
COMMENT ON COLUMN "inv"."T_Importacion"."LogErrores" IS 'Detalle de errores por fila en JSON.';

CREATE INDEX "IX_T_Importacion_FechaCreacion" ON "inv"."T_Importacion" ("FechaCreacion" DESC);

CREATE TRIGGER "TR_T_Importacion_Auditoria"
	BEFORE UPDATE ON "inv"."T_Importacion"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* ===================== migrations/0005_rls.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: politicas Row Level Security por rol
	Tipo de Cambio: CREATE - seguridad a nivel de fila
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: RLS por rol (admin, gerencia, supervision, almacenero) usando seg.FnRolUsuario().
	             El ledger se escribe solo via FnConfirmarDocumentoInventario (SECURITY DEFINER).
*/

ALTER TABLE "seg"."T_Rol"                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seg"."T_Usuario"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_UnidadMedida"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Categoria"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Producto"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Ubicacion"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Proveedor"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Vehiculo"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_DocumentoInventario"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_DocumentoInventarioDetalle"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_MovimientoStock"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_SaldoStock"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Importacion"                 ENABLE ROW LEVEL SECURITY;

/* ---------------------------------------------------------------------
	Lectura: todo usuario autenticado y activo lee catalogo, saldos y movimientos.
--------------------------------------------------------------------- */
CREATE POLICY "LecturaAutenticado" ON "inv"."T_UnidadMedida"               FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Categoria"                  FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Producto"                   FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Ubicacion"                  FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Proveedor"                  FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Vehiculo"                   FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_DocumentoInventario"        FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_DocumentoInventarioDetalle" FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_MovimientoStock"            FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_SaldoStock"                 FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Importacion"                FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

/* ---------------------------------------------------------------------
	Seguridad: cada usuario ve su perfil; admin gestiona usuarios y roles.
--------------------------------------------------------------------- */
CREATE POLICY "UsuarioLecturaPropia" ON "seg"."T_Usuario"
	FOR SELECT USING ("Id" = auth.uid() OR "seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "UsuarioEscrituraAdmin" ON "seg"."T_Usuario"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "RolAdministracion" ON "seg"."T_Rol"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

/* ---------------------------------------------------------------------
	Catalogo: admin y almacenero crean/editan productos; admin el resto.
--------------------------------------------------------------------- */
CREATE POLICY "ProductoEscritura" ON "inv"."T_Producto"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

CREATE POLICY "CategoriaEscrituraAdmin" ON "inv"."T_Categoria"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "UnidadMedidaEscrituraAdmin" ON "inv"."T_UnidadMedida"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "UbicacionEscrituraAdmin" ON "inv"."T_Ubicacion"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "ProveedorEscritura" ON "inv"."T_Proveedor"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

CREATE POLICY "VehiculoEscritura" ON "inv"."T_Vehiculo"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/* ---------------------------------------------------------------------
	Documentos e items: admin, almacenero y supervision crean y editan borradores.
--------------------------------------------------------------------- */
CREATE POLICY "DocumentoEscritura" ON "inv"."T_DocumentoInventario"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

CREATE POLICY "DetalleEscritura" ON "inv"."T_DocumentoInventarioDetalle"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

CREATE POLICY "ImportacionEscritura" ON "inv"."T_Importacion"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/*
	Ledger y saldos: sin politicas de escritura a proposito.
	Con RLS activo y sin policy INSERT/UPDATE/DELETE, queda denegada toda
	escritura directa de cliente. El ledger se escribe via la funcion
	FnConfirmarDocumentoInventario (SECURITY DEFINER) y el saldo via trigger.
*/

/* ===================== migrations/0006_registrar_documento.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRegistrarDocumentoInventario
	Tipo de Cambio: CREATE - registro atomico de documento + detalle + confirmacion
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Recibe el documento completo en JSONB, crea cabecera y detalle
	             y lo confirma (genera el ledger) en una sola transaccion.
	             SECURITY INVOKER: la insercion de cabecera/detalle respeta RLS;
	             el ledger se escribe via FnConfirmarDocumentoInventario (DEFINER).
*/
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarDocumentoInventario"
(
	"PDocumento" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vIdDocumento" UUID;
	"vUsuario"     VARCHAR(50);
	"vDetalle"     JSONB;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_DocumentoInventario"
	(
		"TipoDocumento"
		,"NumeroDocumento"
		,"FechaDocumento"
		,"IdUbicacionOrigen"
		,"IdUbicacionDestino"
		,"IdProveedor"
		,"Comprobante"
		,"Referencia"
		,"IdVehiculo"
		,"Notas"
		,"Situacion"
		,"UsuarioCreacion"
		,"UsuarioModificacion"
	)
	VALUES
	(
		"PDocumento"->>'TipoDocumento'
		,NULLIF("PDocumento"->>'NumeroDocumento', '')
		,("PDocumento"->>'FechaDocumento')::DATE
		,NULLIF("PDocumento"->>'IdUbicacionOrigen', '')::UUID
		,NULLIF("PDocumento"->>'IdUbicacionDestino', '')::UUID
		,NULLIF("PDocumento"->>'IdProveedor', '')::UUID
		,NULLIF("PDocumento"->>'Comprobante', '')
		,NULLIF("PDocumento"->>'Referencia', '')
		,NULLIF("PDocumento"->>'IdVehiculo', '')::UUID
		,NULLIF("PDocumento"->>'Notas', '')
		,'borrador'
		,"vUsuario"
		,"vUsuario"
	)
	RETURNING "Id" INTO "vIdDocumento";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PDocumento"->'Detalle')
	LOOP
		INSERT INTO "inv"."T_DocumentoInventarioDetalle"
		(
			"IdDocumentoInventario"
			,"IdProducto"
			,"Cantidad"
			,"CostoUnitario"
			,"Notas"
			,"UsuarioCreacion"
			,"UsuarioModificacion"
		)
		VALUES
		(
			"vIdDocumento"
			,("vDetalle"->>'IdProducto')::UUID
			,("vDetalle"->>'Cantidad')::NUMERIC
			,NULLIF("vDetalle"->>'CostoUnitario', '')::NUMERIC
			,NULLIF("vDetalle"->>'Notas', '')
			,"vUsuario"
			,"vUsuario"
		);
	END LOOP;

	PERFORM "inv"."FnConfirmarDocumentoInventario"("vIdDocumento");

	RETURN "vIdDocumento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarDocumentoInventario"(JSONB) IS 'Crea cabecera + detalle desde JSON y confirma el documento (genera el ledger) en una transaccion.';

/* ===================== migrations/0007_producto_imagen.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_ProductoImagen
	Tipo de Cambio: CREATE - imagenes de producto (1:N)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Un producto puede tener N imagenes (sin limite a nivel de tabla).
	             El maximo de 3 se aplica en la capa de aplicacion, no en la BD.
	             Las imagenes se alojan en Supabase Storage; aqui se guarda la URL.
*/
CREATE TABLE "inv"."T_ProductoImagen"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdProducto"          UUID         NOT NULL,
	"Url"                 VARCHAR(500) NOT NULL,
	"Orden"               SMALLINT     NOT NULL DEFAULT 1,
	"EsPrincipal"         BOOLEAN      NOT NULL DEFAULT FALSE,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_ProductoImagen" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_ProductoImagen_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id") ON DELETE CASCADE,
	CONSTRAINT "CHK_T_ProductoImagen_Orden_MayorACero"
		CHECK ("Orden" > 0)
);

COMMENT ON TABLE "inv"."T_ProductoImagen" IS 'Imagenes de un producto (1:N). Maximo 3 aplicado en la app; sin limite en BD. URL apunta a Supabase Storage.';
COMMENT ON COLUMN "inv"."T_ProductoImagen"."Id" IS 'Identificador unico de la imagen.';
COMMENT ON COLUMN "inv"."T_ProductoImagen"."IdProducto" IS 'Producto al que pertenece la imagen.';
COMMENT ON COLUMN "inv"."T_ProductoImagen"."Url" IS 'URL publica o ruta en Supabase Storage.';
COMMENT ON COLUMN "inv"."T_ProductoImagen"."Orden" IS 'Orden de visualizacion (1, 2, 3...).';
COMMENT ON COLUMN "inv"."T_ProductoImagen"."EsPrincipal" IS 'Indica si es la imagen principal del producto.';
COMMENT ON COLUMN "inv"."T_ProductoImagen"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE INDEX "IX_T_ProductoImagen_IdProducto" ON "inv"."T_ProductoImagen" ("IdProducto");

/* Una sola imagen principal por producto */
CREATE UNIQUE INDEX "UQ_T_ProductoImagen_Principal"
	ON "inv"."T_ProductoImagen" ("IdProducto")
	WHERE "EsPrincipal" = TRUE;

CREATE TRIGGER "TR_T_ProductoImagen_Auditoria"
	BEFORE UPDATE ON "inv"."T_ProductoImagen"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* RLS: lectura para autenticados; escritura admin/almacenero (igual que productos) */
ALTER TABLE "inv"."T_ProductoImagen" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_ProductoImagen"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "ProductoImagenEscritura" ON "inv"."T_ProductoImagen"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/* ===================== migrations/0008_grants.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: GRANTs para los roles de PostgREST (anon, authenticated)
	Tipo de Cambio: GRANT - permisos de acceso a los esquemas inv/seg
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: PostgREST usa los roles anon/authenticated. Sin GRANT a nivel
	             de tabla, devuelve "permission denied" aunque el esquema este
	             expuesto. La RLS sigue filtrando fila por fila igual.
*/

GRANT USAGE ON SCHEMA "inv", "seg" TO anon, authenticated;

/* authenticated: opera el sistema (la RLS limita por rol) */
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "inv" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "seg" TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "inv" TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "seg" TO authenticated;

/* anon: solo lectura del catalogo publico (la RLS igual exige usuario activo) */
GRANT SELECT ON ALL TABLES IN SCHEMA "inv" TO anon;

/* Objetos futuros heredan los mismos permisos */
ALTER DEFAULT PRIVILEGES IN SCHEMA "inv"
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "seg"
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "inv"
	GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "seg"
	GRANT EXECUTE ON FUNCTIONS TO authenticated;

/* ===================== migrations/0009_equipo.sql ===================== */
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

/* ===================== migrations/0010_valorizacion.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: valorizacion (costo promedio movil + historico de precios)
	Tipo de Cambio: ALTER + CREATE - precios del inventario
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Activa el costo promedio movil por producto (global), guarda el
	             ultimo costo y mantiene un historico de precios por producto.
	             El promedio se recalcula en cada entrada con costo unitario.
*/

ALTER TABLE "inv"."T_Producto"
	ADD COLUMN "CostoPromedio" NUMERIC(14,4) NOT NULL DEFAULT 0,
	ADD COLUMN "UltimoCosto"   NUMERIC(14,4);

COMMENT ON COLUMN "inv"."T_Producto"."CostoPromedio" IS 'Costo promedio movil del producto (global, recalculado en cada entrada con costo).';
COMMENT ON COLUMN "inv"."T_Producto"."UltimoCosto" IS 'Ultimo costo unitario de compra registrado.';

/* =====================================================================
	inv.T_ProductoPrecioHistorico  (historico de precios por producto)
===================================================================== */
CREATE TABLE "inv"."T_ProductoPrecioHistorico"
(
	"Id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdProducto"            UUID          NOT NULL,
	"Costo"                 NUMERIC(14,4) NOT NULL,
	"CostoPromedio"         NUMERIC(14,4) NOT NULL,
	"FechaPrecio"           DATE          NOT NULL,
	"IdProveedor"           UUID,
	"IdDocumentoInventario" UUID,
	"Origen"                VARCHAR(20)   NOT NULL DEFAULT 'compra',
	"Estado"                BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"       VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"   VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"            BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"           UUID,
	CONSTRAINT "PK_T_ProductoPrecioHistorico" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_ProductoPrecioHistorico_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "FK_T_ProductoPrecioHistorico_Proveedor_IdProveedor"
		FOREIGN KEY ("IdProveedor") REFERENCES "inv"."T_Proveedor" ("Id"),
	CONSTRAINT "FK_T_ProductoPrecioHistorico_DocumentoInventario_IdDocumentoInventario"
		FOREIGN KEY ("IdDocumentoInventario") REFERENCES "inv"."T_DocumentoInventario" ("Id"),
	CONSTRAINT "CHK_T_ProductoPrecioHistorico_Origen_Permitido"
		CHECK ("Origen" IN ('compra','manual','ajuste'))
);

COMMENT ON TABLE "inv"."T_ProductoPrecioHistorico" IS 'Historico de precios por producto. Cada entrada con costo o cambio manual deja un registro.';
COMMENT ON COLUMN "inv"."T_ProductoPrecioHistorico"."Costo" IS 'Costo unitario registrado en ese momento.';
COMMENT ON COLUMN "inv"."T_ProductoPrecioHistorico"."CostoPromedio" IS 'Costo promedio resultante luego de aplicar este precio.';
COMMENT ON COLUMN "inv"."T_ProductoPrecioHistorico"."FechaPrecio" IS 'Fecha a la que corresponde el precio.';
COMMENT ON COLUMN "inv"."T_ProductoPrecioHistorico"."IdProveedor" IS 'Proveedor de la compra (si aplica).';
COMMENT ON COLUMN "inv"."T_ProductoPrecioHistorico"."IdDocumentoInventario" IS 'Documento que origino el precio (si aplica).';
COMMENT ON COLUMN "inv"."T_ProductoPrecioHistorico"."Origen" IS 'Origen del precio: compra, manual o ajuste.';

CREATE INDEX "IX_T_ProductoPrecioHistorico_IdProducto_Fecha"
	ON "inv"."T_ProductoPrecioHistorico" ("IdProducto","FechaPrecio");

CREATE TRIGGER "TR_T_ProductoPrecioHistorico_Auditoria"
	BEFORE UPDATE ON "inv"."T_ProductoPrecioHistorico"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* ---------------------------------------------------------------------
	Recalcula el costo promedio movil al ingresar una entrada con costo.
	Se ejecuta DESPUES del trigger de saldo (nombre alfabetico posterior),
	por lo que T_SaldoStock ya refleja la cantidad de esta entrada.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnRecalcularCostoPromedio"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vTotalActual"  NUMERIC(14,3);
	"vTotalPrevio"  NUMERIC(14,3);
	"vCostoPrevio"  NUMERIC(14,4);
	"vCostoNuevo"   NUMERIC(14,4);
	"vIdProveedor"  UUID;
BEGIN
	IF NEW."Direccion" <> 1 OR NEW."CostoUnitario" IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT COALESCE(SUM("CantidadDisponible"), 0) INTO "vTotalActual"
	FROM "inv"."T_SaldoStock"
	WHERE "IdProducto" = NEW."IdProducto";

	"vTotalPrevio" = GREATEST("vTotalActual" - NEW."Cantidad", 0);

	SELECT "CostoPromedio" INTO "vCostoPrevio"
	FROM "inv"."T_Producto"
	WHERE "Id" = NEW."IdProducto";

	IF ("vTotalPrevio" + NEW."Cantidad") <= 0 THEN
		"vCostoNuevo" = NEW."CostoUnitario";
	ELSE
		"vCostoNuevo" =
			(("vTotalPrevio" * COALESCE("vCostoPrevio", 0)) + (NEW."Cantidad" * NEW."CostoUnitario"))
			/ ("vTotalPrevio" + NEW."Cantidad");
	END IF;

	UPDATE "inv"."T_Producto"
	SET "CostoPromedio" = "vCostoNuevo"
		,"UltimoCosto" = NEW."CostoUnitario"
	WHERE "Id" = NEW."IdProducto";

	SELECT "IdProveedor" INTO "vIdProveedor"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = NEW."IdDocumentoInventario";

	INSERT INTO "inv"."T_ProductoPrecioHistorico"
	(
		"IdProducto"
		,"Costo"
		,"CostoPromedio"
		,"FechaPrecio"
		,"IdProveedor"
		,"IdDocumentoInventario"
		,"Origen"
	)
	VALUES
	(
		NEW."IdProducto"
		,NEW."CostoUnitario"
		,"vCostoNuevo"
		,NEW."FechaMovimiento"
		,"vIdProveedor"
		,NEW."IdDocumentoInventario"
		,'compra'
	);

	RETURN NEW;
END;
$$;

CREATE TRIGGER "TR_T_MovimientoStock_Costo"
	AFTER INSERT ON "inv"."T_MovimientoStock"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnRecalcularCostoPromedio"();

/* RLS del historico de precios */
ALTER TABLE "inv"."T_ProductoPrecioHistorico" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_ProductoPrecioHistorico"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

/*
	Escritura solo via trigger (compra) o service-role (ajustes/manual).
	No se crea policy de escritura para clientes con RLS.
*/

/* ===================== migrations/0011_requerimientos.sql ===================== */
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

/* ===================== migrations/0012_reportes.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: vistas de reportes (movimientos, valorizado, historial de requerimientos)
	Tipo de Cambio: CREATE - reportes con filtros avanzados
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Vistas con todas las dimensiones para filtrar (fecha, proveedor,
	             producto, categoria, equipo, placa) y valorizar. security_invoker
	             para que respeten la RLS del usuario.
*/

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Movimientos con todas las dimensiones y valor (Cantidad * CostoUnitario).
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_Reporte_Movimiento"
WITH (security_invoker = true) AS
	SELECT
		M."Id" AS "IdMovimiento"
		,M."FechaMovimiento"
		,D."TipoDocumento"
		,D."NumeroDocumento"
		,D."Comprobante"
		,P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Id" AS "IdCategoria"
		,C."Nombre" AS "NombreCategoria"
		,UB."Id" AS "IdUbicacion"
		,UB."Nombre" AS "NombreUbicacion"
		,PR."Id" AS "IdProveedor"
		,PR."Nombre" AS "NombreProveedor"
		,VE."Id" AS "IdVehiculo"
		,VE."Placa"
		,EQ."Id" AS "IdEquipo"
		,EQ."Nombre" AS "NombreEquipo"
		,M."Direccion"
		,M."Cantidad"
		,(M."Direccion" * M."Cantidad") AS "CantidadConSigno"
		,M."CostoUnitario"
		,(M."Cantidad" * COALESCE(M."CostoUnitario", 0)) AS "ValorMovimiento"
	FROM
		"inv"."T_MovimientoStock" M
	INNER JOIN "inv"."T_Producto" P ON P."Id" = M."IdProducto"
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_Ubicacion" UB ON UB."Id" = M."IdUbicacion"
	INNER JOIN "inv"."T_DocumentoInventario" D ON D."Id" = M."IdDocumentoInventario"
	LEFT JOIN "inv"."T_Proveedor" PR ON PR."Id" = D."IdProveedor"
	LEFT JOIN "inv"."T_Vehiculo" VE ON VE."Id" = D."IdVehiculo"
	LEFT JOIN "inv"."T_Equipo" EQ ON EQ."Id" = VE."IdEquipo";

COMMENT ON VIEW "inv"."V_Reporte_Movimiento" IS 'Movimientos con dimensiones (categoria, proveedor, equipo, placa) y valor, para reportes filtrables.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Stock valorizado por producto (StockTotal * CostoPromedio).
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_Producto_Valorizado"
WITH (security_invoker = true) AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Nombre" AS "NombreCategoria"
		,UM."Codigo" AS "CodigoUnidad"
		,P."StockMinimo"
		,P."CostoPromedio"
		,P."UltimoCosto"
		,COALESCE(SUM(S."CantidadDisponible"), 0) AS "StockTotal"
		,(COALESCE(SUM(S."CantidadDisponible"), 0) * P."CostoPromedio") AS "ValorTotal"
		,COALESCE(SUM(S."CantidadDisponible"), 0) < P."StockMinimo" AS "BajoMinimo"
	FROM
		"inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE
		P."Estado" = TRUE
	GROUP BY
		P."Id"
		,P."Sku"
		,P."Nombre"
		,C."Nombre"
		,UM."Codigo"
		,P."StockMinimo"
		,P."CostoPromedio"
		,P."UltimoCosto";

COMMENT ON VIEW "inv"."V_Producto_Valorizado" IS 'Stock total y valor (StockTotal * CostoPromedio) por producto.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Historial de requerimientos por producto (cuantas veces se pidio).
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_Producto_HistorialRequerimiento"
WITH (security_invoker = true) AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,COUNT(DISTINCT RQ."Id") AS "VecesPedido"
		,COALESCE(SUM(RD."Cantidad"), 0) AS "CantidadTotalPedida"
		,MAX(RQ."FechaRequerimiento") AS "UltimaFechaPedido"
		,COUNT(DISTINCT RQ."Id") FILTER (WHERE RQ."Origen" = 'desgaste_prematuro') AS "VecesDesgastePrematuro"
	FROM
		"inv"."T_Producto" P
	INNER JOIN "inv"."T_RequerimientoDetalle" RD ON RD."IdProducto" = P."Id"
	INNER JOIN "inv"."T_Requerimiento" RQ ON RQ."Id" = RD."IdRequerimiento"
	WHERE
		RQ."Estado" = TRUE
	GROUP BY
		P."Id"
		,P."Sku"
		,P."Nombre";

COMMENT ON VIEW "inv"."V_Producto_HistorialRequerimiento" IS 'Cuantas veces y cuanto se pidio cada producto, con conteo de desgaste prematuro.';

/* ===================== migrations/0013_registrar_requerimiento.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRegistrarRequerimiento
	Tipo de Cambio: CREATE - registro atomico de requerimiento + detalle
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Crea cabecera y detalle de un requerimiento desde JSONB en una
	             transaccion. SECURITY INVOKER: respeta la RLS del usuario.
*/
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarRequerimiento"
(
	"PRequerimiento" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"      UUID;
	"vUsuario" VARCHAR(50);
	"vDetalle" JSONB;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento"
		,"FechaRequerimiento"
		,"Origen"
		,"IdEquipo"
		,"IdVehiculo"
		,"Notas"
		,"Situacion"
		,"UsuarioCreacion"
		,"UsuarioModificacion"
	)
	VALUES
	(
		NULLIF("PRequerimiento"->>'NumeroRequerimiento', '')
		,("PRequerimiento"->>'FechaRequerimiento')::DATE
		,"PRequerimiento"->>'Origen'
		,NULLIF("PRequerimiento"->>'IdEquipo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdVehiculo', '')::UUID
		,NULLIF("PRequerimiento"->>'Notas', '')
		,'pendiente'
		,"vUsuario"
		,"vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PRequerimiento"->'Detalle')
	LOOP
		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento"
			,"IdProducto"
			,"Cantidad"
			,"Notas"
			,"UsuarioCreacion"
			,"UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,("vDetalle"->>'IdProducto')::UUID
			,("vDetalle"->>'Cantidad')::NUMERIC
			,NULLIF("vDetalle"->>'Notas', '')
			,"vUsuario"
			,"vUsuario"
		);
	END LOOP;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarRequerimiento"(JSONB) IS 'Crea un requerimiento con su detalle desde JSON en una transaccion.';

/* ===================== migrations/0014_dependencias.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnContarDependencias
	Tipo de Cambio: CREATE - verificacion de datos enlazados antes de eliminar
	Autor: Equipo Desarrollo
	Fecha: 2026-06-08
	Descripcion: Cuenta los registros enlazados a una entidad (producto, proveedor,
	             ubicacion, equipo, vehiculo). Si total > 0 NO se puede eliminar.
	             Se usa para el modal explicativo y como guardia en el backend.
*/
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

/* ===================== migrations/0015_tipo_equipo.sql ===================== */
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

/* ===================== migrations/0016_valorizacion_salidas.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: valorizacion de salidas (kardex valorizado completo)
	Tipo de Cambio: REPLACE funciones + backfill
	Autor: Equipo Desarrollo
	Fecha: 2026-06-08
	Descripcion: Las salidas toman el CostoPromedio movil vigente del producto
	             (metodo NIC 2 / SUNAT Art. 62 LIR) si el detalle no trae costo.
	             El ledger es inmutable: cada salida congela el costo de su momento.
	             Las transferencias mueven valor (ambas patas con el mismo costo) y
	             NO recalculan el promedio.
*/

/* ---------------------------------------------------------------------
	FnConfirmarDocumentoInventario: valoriza egresos con el promedio vigente.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnConfirmarDocumentoInventario"
(
	"PIdDocumentoInventario" UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vDocumento"      "inv"."T_DocumentoInventario";
	"vDetalle"        "inv"."T_DocumentoInventarioDetalle";
	"vCostoPromedio"  NUMERIC(14,4);
	"vCostoEgreso"    NUMERIC(14,4);
BEGIN
	SELECT * INTO "vDocumento"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = "PIdDocumentoInventario"
	FOR UPDATE;

	IF "vDocumento" IS NULL THEN
		RAISE EXCEPTION 'El documento % no existe.', "PIdDocumentoInventario";
	END IF;

	IF "vDocumento"."Situacion" <> 'borrador' THEN
		RAISE EXCEPTION 'Solo se confirman documentos en borrador (situacion actual: %).', "vDocumento"."Situacion";
	END IF;

	FOR "vDetalle" IN
		SELECT * FROM "inv"."T_DocumentoInventarioDetalle"
		WHERE "IdDocumentoInventario" = "PIdDocumentoInventario"
	LOOP
		/* Costo de egreso: el del detalle (override) o el promedio movil vigente */
		SELECT "CostoPromedio" INTO "vCostoPromedio"
		FROM "inv"."T_Producto" WHERE "Id" = "vDetalle"."IdProducto";
		"vCostoEgreso" = COALESCE("vDetalle"."CostoUnitario", "vCostoPromedio", 0);

		/* Pata de egreso (-1): salida, transferencia, ajuste */
		IF "vDocumento"."IdUbicacionOrigen" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('salida','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle"
				,"IdDocumentoInventario"
				,"IdProducto"
				,"IdUbicacion"
				,"Direccion"
				,"Cantidad"
				,"CostoUnitario"
				,"FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id"
				,"vDocumento"."Id"
				,"vDetalle"."IdProducto"
				,"vDocumento"."IdUbicacionOrigen"
				,-1
				,"vDetalle"."Cantidad"
				,"vCostoEgreso"
				,"vDocumento"."FechaDocumento"
			);
		END IF;

		/* Pata de ingreso (+1): entrada, existencia_inicial, transferencia, ajuste.
		   En transferencia, el ingreso lleva el MISMO costo que el egreso (mueve valor).
		   En el resto, el costo es el del detalle (NULL permitido en compras sin costo). */
		IF "vDocumento"."IdUbicacionDestino" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('entrada','existencia_inicial','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle"
				,"IdDocumentoInventario"
				,"IdProducto"
				,"IdUbicacion"
				,"Direccion"
				,"Cantidad"
				,"CostoUnitario"
				,"FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id"
				,"vDocumento"."Id"
				,"vDetalle"."IdProducto"
				,"vDocumento"."IdUbicacionDestino"
				,1
				,"vDetalle"."Cantidad"
				,CASE WHEN "vDocumento"."TipoDocumento" = 'transferencia'
					THEN "vCostoEgreso"
					ELSE "vDetalle"."CostoUnitario"
				END
				,"vDocumento"."FechaDocumento"
			);
		END IF;
	END LOOP;

	UPDATE "inv"."T_DocumentoInventario"
	SET "Situacion" = 'confirmado'
		,"FechaConfirmacion" = NOW()
	WHERE "Id" = "PIdDocumentoInventario";
END;
$$;

COMMENT ON FUNCTION "inv"."FnConfirmarDocumentoInventario"(UUID) IS 'Confirma un documento borrador: genera el ledger. Egresos se valorizan con el costo promedio movil vigente (o el override del detalle). Transferencias mueven el mismo costo en ambas patas.';

/* ---------------------------------------------------------------------
	FnRecalcularCostoPromedio: NO recalcula en transferencias (la pata de
	ingreso de una transferencia ya trae costo y contaminaria el promedio).
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnRecalcularCostoPromedio"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vTotalActual"  NUMERIC(14,3);
	"vTotalPrevio"  NUMERIC(14,3);
	"vCostoPrevio"  NUMERIC(14,4);
	"vCostoNuevo"   NUMERIC(14,4);
	"vIdProveedor"  UUID;
	"vTipoDocumento" TEXT;
BEGIN
	IF NEW."Direccion" <> 1 OR NEW."CostoUnitario" IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT "TipoDocumento" INTO "vTipoDocumento"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = NEW."IdDocumentoInventario";

	/* Las transferencias mueven costo, no lo crean: no recalcular promedio */
	IF "vTipoDocumento" = 'transferencia' THEN
		RETURN NEW;
	END IF;

	SELECT COALESCE(SUM("CantidadDisponible"), 0) INTO "vTotalActual"
	FROM "inv"."T_SaldoStock"
	WHERE "IdProducto" = NEW."IdProducto";

	"vTotalPrevio" = GREATEST("vTotalActual" - NEW."Cantidad", 0);

	SELECT "CostoPromedio" INTO "vCostoPrevio"
	FROM "inv"."T_Producto"
	WHERE "Id" = NEW."IdProducto";

	IF ("vTotalPrevio" + NEW."Cantidad") <= 0 THEN
		"vCostoNuevo" = NEW."CostoUnitario";
	ELSE
		"vCostoNuevo" =
			(("vTotalPrevio" * COALESCE("vCostoPrevio", 0)) + (NEW."Cantidad" * NEW."CostoUnitario"))
			/ ("vTotalPrevio" + NEW."Cantidad");
	END IF;

	UPDATE "inv"."T_Producto"
	SET "CostoPromedio" = "vCostoNuevo"
		,"UltimoCosto" = NEW."CostoUnitario"
	WHERE "Id" = NEW."IdProducto";

	SELECT "IdProveedor" INTO "vIdProveedor"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = NEW."IdDocumentoInventario";

	INSERT INTO "inv"."T_ProductoPrecioHistorico"
	(
		"IdProducto","Costo","CostoPromedio","FechaPrecio","IdProveedor","IdDocumentoInventario","Origen"
	)
	VALUES
	(
		NEW."IdProducto"
		,NEW."CostoUnitario"
		,"vCostoNuevo"
		,NEW."FechaMovimiento"
		,"vIdProveedor"
		,NEW."IdDocumentoInventario"
		,CASE WHEN "vTipoDocumento" = 'ajuste' THEN 'ajuste' ELSE 'compra' END
	);

	RETURN NEW;
END;
$$;

/* ---------------------------------------------------------------------
	Backfill: valorizar salidas historicas que quedaron con costo NULL.
	Excepcion unica y documentada a la inmutabilidad del ledger (datos demo).
--------------------------------------------------------------------- */
ALTER TABLE "inv"."T_MovimientoStock" DISABLE TRIGGER "TR_T_MovimientoStock_BloquearUpdate";

UPDATE "inv"."T_MovimientoStock" M
SET "CostoUnitario" = P."CostoPromedio"
FROM "inv"."T_Producto" P
WHERE P."Id" = M."IdProducto"
  AND M."Direccion" = -1
  AND M."CostoUnitario" IS NULL;

ALTER TABLE "inv"."T_MovimientoStock" ENABLE TRIGGER "TR_T_MovimientoStock_BloquearUpdate";

/* ===================== migrations/0017_vistas_imagen.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: vistas con imagen principal + saldo por ubicacion
	Tipo de Cambio: REPLACE vistas + CREATE vista
	Autor: Equipo Desarrollo
	Fecha: 2026-06-08
	Descripcion: Agrega la URL de la imagen principal a las vistas de stock
	             (catalogo, combobox, saldos) y crea la vista de saldo por
	             ubicacion para la pantalla Saldos (mobile-first).
	NOTA: las columnas nuevas se agregan AL FINAL para permitir CREATE OR REPLACE
	      (no se puede reordenar columnas de una vista existente).
*/

CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado"
WITH (security_invoker = true) AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Nombre" AS "NombreCategoria"
		,UM."Codigo" AS "CodigoUnidad"
		,P."StockMinimo"
		,COALESCE(SUM(S."CantidadDisponible"), 0) AS "StockTotal"
		,COALESCE(SUM(S."CantidadDisponible"), 0) < P."StockMinimo" AS "BajoMinimo"
		,P."IdCategoria"
		,P."CostoPromedio"
		,(SELECT PI."Url" FROM "inv"."T_ProductoImagen" PI
			WHERE PI."IdProducto" = P."Id" AND PI."Estado" = TRUE
			ORDER BY PI."EsPrincipal" DESC, PI."Orden" ASC LIMIT 1) AS "UrlImagenPrincipal"
	FROM "inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE P."Estado" = TRUE
	GROUP BY P."Id", P."Sku", P."Nombre", C."Nombre", UM."Codigo", P."StockMinimo", P."IdCategoria", P."CostoPromedio";

COMMENT ON VIEW "inv"."V_Producto_StockConsolidado" IS 'Saldo total por producto con imagen principal y alerta BajoMinimo.';

CREATE OR REPLACE VIEW "inv"."V_Producto_Valorizado"
WITH (security_invoker = true) AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Nombre" AS "NombreCategoria"
		,UM."Codigo" AS "CodigoUnidad"
		,P."StockMinimo"
		,P."CostoPromedio"
		,P."UltimoCosto"
		,COALESCE(SUM(S."CantidadDisponible"), 0) AS "StockTotal"
		,(COALESCE(SUM(S."CantidadDisponible"), 0) * P."CostoPromedio") AS "ValorTotal"
		,COALESCE(SUM(S."CantidadDisponible"), 0) < P."StockMinimo" AS "BajoMinimo"
		,(SELECT PI."Url" FROM "inv"."T_ProductoImagen" PI
			WHERE PI."IdProducto" = P."Id" AND PI."Estado" = TRUE
			ORDER BY PI."EsPrincipal" DESC, PI."Orden" ASC LIMIT 1) AS "UrlImagenPrincipal"
	FROM "inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE P."Estado" = TRUE
	GROUP BY P."Id", P."Sku", P."Nombre", C."Nombre", UM."Codigo", P."StockMinimo", P."CostoPromedio", P."UltimoCosto";

COMMENT ON VIEW "inv"."V_Producto_Valorizado" IS 'Stock total y valor (StockTotal * CostoPromedio) por producto, con imagen.';

CREATE OR REPLACE VIEW "inv"."V_SaldoStock_PorUbicacion"
WITH (security_invoker = true) AS
	SELECT
		S."IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,S."IdUbicacion"
		,U."Nombre" AS "NombreUbicacion"
		,U."Codigo" AS "CodigoUbicacion"
		,S."CantidadDisponible"
		,P."StockMinimo"
		,P."CostoPromedio"
	FROM "inv"."T_SaldoStock" S
	INNER JOIN "inv"."T_Producto" P ON P."Id" = S."IdProducto"
	INNER JOIN "inv"."T_Ubicacion" U ON U."Id" = S."IdUbicacion"
	WHERE P."Estado" = TRUE AND S."CantidadDisponible" <> 0;

COMMENT ON VIEW "inv"."V_SaldoStock_PorUbicacion" IS 'Saldo de cada producto en cada ubicacion (para la consulta de saldos mobile).';

/* ===================== migrations/0018_atender_requerimiento.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAtenderRequerimiento + inv.FnAnularRequerimiento
	Tipo de Cambio: CREATE - flujo de aprobacion de requerimientos
	Autor: Equipo Desarrollo
	Fecha: 2026-06-13
	Descripcion: Aprobar un requerimiento genera la salida de stock que lo atiende.
	             Reusa FnRegistrarDocumentoInventario (crea + confirma el documento,
	             valoriza al costo promedio movil vigente). Marca el requerimiento
	             como 'atendido', enlaza el documento y registra CantidadAtendida.
	             Valida stock suficiente en el almacen de origen (todo o nada).
*/

CREATE OR REPLACE FUNCTION "inv"."FnAtenderRequerimiento"
(
	"PIdRequerimiento"   UUID,
	"PIdUbicacionOrigen" UUID,
	"PNotas"             VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vRequerimiento" "inv"."T_Requerimiento";
	"vDetalleJson"   JSONB;
	"vDocumento"     JSONB;
	"vIdDocumento"   UUID;
	"vFaltante"      TEXT;
BEGIN
	SELECT * INTO "vRequerimiento"
	FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE
	FOR UPDATE;

	IF "vRequerimiento" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;

	IF "vRequerimiento"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se aprueban requerimientos pendientes (situacion actual: %).', "vRequerimiento"."Situacion";
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion"
		WHERE "Id" = "PIdUbicacionOrigen" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	SELECT string_agg(
		P."Nombre" || ' (disponible ' || COALESCE("S"."CantidadDisponible", 0)
		|| ', solicita ' || D."Cantidad" || ')',
		'; ' ORDER BY P."Nombre"
	)
	INTO "vFaltante"
	FROM "inv"."T_RequerimientoDetalle" D
	JOIN "inv"."T_Producto" P ON P."Id" = D."IdProducto"
	LEFT JOIN "inv"."T_SaldoStock" "S"
		ON "S"."IdProducto" = D."IdProducto"
		AND "S"."IdUbicacion" = "PIdUbicacionOrigen"
	WHERE D."IdRequerimiento" = "PIdRequerimiento"
	  AND D."Estado" = TRUE
	  AND COALESCE("S"."CantidadDisponible", 0) < D."Cantidad";

	IF "vFaltante" IS NOT NULL THEN
		RAISE EXCEPTION 'Stock insuficiente en el almacen seleccionado: %', "vFaltante";
	END IF;

	SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
		'IdProducto', D."IdProducto",
		'Cantidad',   D."Cantidad",
		'Notas',      D."Notas"
	))
	INTO "vDetalleJson"
	FROM "inv"."T_RequerimientoDetalle" D
	WHERE D."IdRequerimiento" = "PIdRequerimiento" AND D."Estado" = TRUE;

	IF "vDetalleJson" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no tiene lineas para atender.';
	END IF;

	"vDocumento" = JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "PIdUbicacionOrigen",
		'IdVehiculo',        "vRequerimiento"."IdVehiculo",
		'Referencia',        COALESCE("vRequerimiento"."NumeroRequerimiento", 'REQ ' || LEFT("PIdRequerimiento"::TEXT, 8)),
		'Notas',             COALESCE("PNotas", 'Atencion de requerimiento ' || COALESCE("vRequerimiento"."NumeroRequerimiento", LEFT("PIdRequerimiento"::TEXT, 8))),
		'Detalle',           "vDetalleJson"
	);

	"vIdDocumento" = "inv"."FnRegistrarDocumentoInventario"("vDocumento");

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido',
		"IdDocumentoInventario" = "vIdDocumento"
	WHERE "Id" = "PIdRequerimiento";

	UPDATE "inv"."T_RequerimientoDetalle"
	SET "CantidadAtendida" = "Cantidad"
	WHERE "IdRequerimiento" = "PIdRequerimiento" AND "Estado" = TRUE;

	RETURN "vIdDocumento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, UUID, VARCHAR) IS 'Aprueba un requerimiento pendiente: genera la salida valorizada desde el almacen origen, lo marca atendido y enlaza el documento. Valida stock suficiente (todo o nada).';

CREATE OR REPLACE FUNCTION "inv"."FnAnularRequerimiento"
(
	"PIdRequerimiento" UUID,
	"PMotivo"          VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	"vSituacion" VARCHAR(15);
BEGIN
	SELECT "Situacion" INTO "vSituacion"
	FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE
	FOR UPDATE;

	IF "vSituacion" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;

	IF "vSituacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se rechazan requerimientos pendientes (situacion actual: %).', "vSituacion";
	END IF;

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'anulado',
		"Notas" = CASE
			WHEN "PMotivo" IS NULL OR "PMotivo" = '' THEN "Notas"
			ELSE LEFT(COALESCE("Notas" || ' | ', '') || 'Rechazado: ' || "PMotivo", 500)
		END
	WHERE "Id" = "PIdRequerimiento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAnularRequerimiento"(UUID, VARCHAR) IS 'Rechaza un requerimiento pendiente (situacion = anulado), con motivo opcional anexado a las notas.';

/* ===================== migrations/0019_guard_saldo_no_negativo.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAplicarMovimientoSaldo (REPLACE)
	Tipo de Cambio: REPLACE - guard de no-negatividad en el ledger
	Autor: Equipo Desarrollo
	Fecha: 2026-06-13
	Descripcion: Ninguna salida puede dejar el saldo por debajo de cero. Cierra el
	             TOCTOU de sobre-giro concurrente (el upsert toma row-lock y serializa
	             las salidas sobre el mismo saldo). Los ingresos (+1) nunca se bloquean.
*/
CREATE OR REPLACE FUNCTION "inv"."FnAplicarMovimientoSaldo"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vNuevoSaldo" NUMERIC(14,3);
BEGIN
	INSERT INTO "inv"."T_SaldoStock"
	(
		"IdProducto"
		,"IdUbicacion"
		,"CantidadDisponible"
	)
	VALUES
	(
		NEW."IdProducto"
		,NEW."IdUbicacion"
		,NEW."Direccion" * NEW."Cantidad"
	)
	ON CONFLICT ("IdProducto","IdUbicacion") DO UPDATE
		SET "CantidadDisponible" = "inv"."T_SaldoStock"."CantidadDisponible" + (NEW."Direccion" * NEW."Cantidad")
			,"FechaModificacion" = NOW()
			,"RowVersion" = "inv"."T_SaldoStock"."RowVersion" + 1
	RETURNING "CantidadDisponible" INTO "vNuevoSaldo";

	/* Un egreso no puede dejar el saldo fisico por debajo de cero. */
	IF NEW."Direccion" = -1 AND "vNuevoSaldo" < 0 THEN
		RAISE EXCEPTION 'Stock insuficiente: el movimiento dejaria el saldo en % (producto %, ubicacion %).',
			"vNuevoSaldo", NEW."IdProducto", NEW."IdUbicacion"
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "inv"."FnAplicarMovimientoSaldo"() IS 'Trigger: actualiza el saldo cacheado por cada movimiento (upsert). Rechaza egresos que dejarian el saldo negativo (serializa salidas concurrentes via row-lock del upsert). Los ingresos nunca se bloquean.';

/* ===================== migrations/0020_producto_general.sql ===================== */
/*
	Compatibilidad producto<->tipo de equipo en el PRODUCTO (fitment), no en la
	categoria. "General" pasa a ser un flag intensional (EsGeneral). Invariante:
	general XOR >=1 tipo. FnGuardarProducto crea/edita producto + compatibilidad.
*/
ALTER TABLE "inv"."T_Producto"
	ADD COLUMN IF NOT EXISTS "EsGeneral" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "inv"."T_Producto"."EsGeneral" IS 'TRUE = compatible con cualquier tipo de equipo (presente o futuro). Si es TRUE, no lleva filas en T_ProductoTipoEquipo.';

CREATE OR REPLACE FUNCTION "inv"."FnBloquearTipoEnProductoGeneral"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF (SELECT "EsGeneral" FROM "inv"."T_Producto" WHERE "Id" = NEW."IdProducto") THEN
		RAISE EXCEPTION 'Un producto marcado como general no puede tener tipos de equipo asociados.';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "TR_T_ProductoTipoEquipo_BloquearGeneral" ON "inv"."T_ProductoTipoEquipo";
CREATE TRIGGER "TR_T_ProductoTipoEquipo_BloquearGeneral"
	BEFORE INSERT ON "inv"."T_ProductoTipoEquipo"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnBloquearTipoEnProductoGeneral"();

CREATE OR REPLACE FUNCTION "inv"."FnGuardarProducto"
(
	"PProducto" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"        UUID;
	"vEsGeneral" BOOLEAN;
	"vUsuario"   VARCHAR(50);
	"vTipos"     JSONB;
	"vCantTipos" INT;
BEGIN
	"vUsuario"   = COALESCE(auth.uid()::TEXT, 'API');
	"vId"        = NULLIF("PProducto"->>'Id', '')::UUID;
	"vEsGeneral" = COALESCE(("PProducto"->>'EsGeneral')::BOOLEAN, FALSE);
	"vTipos"     = COALESCE("PProducto"->'IdsTipoEquipo', '[]'::JSONB);
	"vCantTipos" = JSONB_ARRAY_LENGTH("vTipos");

	IF "vEsGeneral" AND "vCantTipos" > 0 THEN
		RAISE EXCEPTION 'Un producto general no lleva tipos de equipo.';
	END IF;
	IF NOT "vEsGeneral" AND "vCantTipos" = 0 THEN
		RAISE EXCEPTION 'Elige al menos un tipo de equipo o marca el producto como general.';
	END IF;

	IF "vId" IS NULL THEN
		INSERT INTO "inv"."T_Producto"
		(
			"Sku","Nombre","IdCategoria","IdUnidadMedida","StockMinimo",
			"CodigoBarra","Atributos","EsGeneral","UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"PProducto"->>'Sku',
			"PProducto"->>'Nombre',
			("PProducto"->>'IdCategoria')::UUID,
			("PProducto"->>'IdUnidadMedida')::UUID,
			COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, 0),
			NULLIF("PProducto"->>'CodigoBarra', ''),
			COALESCE("PProducto"->'Atributos', '{}'::JSONB),
			"vEsGeneral",
			"vUsuario",
			"vUsuario"
		)
		RETURNING "Id" INTO "vId";
	ELSE
		UPDATE "inv"."T_Producto"
		SET "Sku"                 = "PProducto"->>'Sku',
			"Nombre"              = "PProducto"->>'Nombre',
			"IdCategoria"         = ("PProducto"->>'IdCategoria')::UUID,
			"IdUnidadMedida"      = ("PProducto"->>'IdUnidadMedida')::UUID,
			"StockMinimo"         = COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, "StockMinimo"),
			"CodigoBarra"         = NULLIF("PProducto"->>'CodigoBarra', ''),
			"Atributos"           = COALESCE("PProducto"->'Atributos', "Atributos"),
			"EsGeneral"           = "vEsGeneral",
			"UsuarioModificacion" = "vUsuario"
		WHERE "Id" = "vId";

		IF NOT FOUND THEN
			RAISE EXCEPTION 'El producto no existe.';
		END IF;
	END IF;

	DELETE FROM "inv"."T_ProductoTipoEquipo" WHERE "IdProducto" = "vId";

	IF NOT "vEsGeneral" THEN
		INSERT INTO "inv"."T_ProductoTipoEquipo"
			("IdProducto","IdTipoEquipo","UsuarioCreacion","UsuarioModificacion")
		SELECT "vId", t.elem::UUID, "vUsuario", "vUsuario"
		FROM JSONB_ARRAY_ELEMENTS_TEXT("vTipos") AS t(elem);
	END IF;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnGuardarProducto"(JSONB) IS 'Crea (sin Id) o edita (con Id) un producto y reemplaza su compatibilidad por tipo de equipo en una transaccion. Aplica la invariante general XOR tipos.';

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
	UPDATE "inv"."T_Producto"
	SET "EsGeneral" = FALSE
	WHERE "IdCategoria" = "PIdCategoria" AND "Estado" = TRUE AND "EsGeneral" = TRUE;

	INSERT INTO "inv"."T_ProductoTipoEquipo" ("IdProducto","IdTipoEquipo")
	SELECT P."Id", "PIdTipoEquipo"
	FROM "inv"."T_Producto" P
	WHERE P."IdCategoria" = "PIdCategoria" AND P."Estado" = TRUE
	ON CONFLICT ("IdProducto","IdTipoEquipo") DO NOTHING;

	GET DIAGNOSTICS "vInsertados" = ROW_COUNT;
	RETURN "vInsertados";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAsociarCategoriaTipoEquipo"(UUID, UUID) IS 'Asocia todos los productos activos de una categoria a un tipo (los marca no-generales). Idempotente, retorna insertados.';

CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado" AS
SELECT
	p."Id" AS "IdProducto",
	p."Sku",
	p."Nombre" AS "NombreProducto",
	c."Nombre" AS "NombreCategoria",
	um."Codigo" AS "CodigoUnidad",
	p."StockMinimo",
	COALESCE(SUM(s."CantidadDisponible"), 0::NUMERIC) AS "StockTotal",
	COALESCE(SUM(s."CantidadDisponible"), 0::NUMERIC) < p."StockMinimo" AS "BajoMinimo",
	p."IdCategoria",
	p."CostoPromedio",
	(SELECT pi."Url"
		FROM inv."T_ProductoImagen" pi
		WHERE pi."IdProducto" = p."Id" AND pi."Estado" = TRUE
		ORDER BY pi."EsPrincipal" DESC, pi."Orden"
		LIMIT 1) AS "UrlImagenPrincipal",
	p."EsGeneral"
FROM inv."T_Producto" p
	JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
	JOIN inv."T_UnidadMedida" um ON um."Id" = p."IdUnidadMedida"
	LEFT JOIN inv."T_SaldoStock" s ON s."IdProducto" = p."Id"
WHERE p."Estado" = TRUE
GROUP BY p."Id", p."Sku", p."Nombre", c."Nombre", um."Codigo", p."StockMinimo", p."IdCategoria", p."CostoPromedio", p."EsGeneral";

/* ===================== migrations/0021_atender_requerimiento_v2.sql ===================== */
/*
	Aprobacion con entrega por linea (parcial y/o compra directa). Modo stock =
	sale del almacen; modo compra = entrada de compra + salida (neto 0), valorizada
	al costo. SECURITY DEFINER; el creador no puede aprobar lo suyo (admin exento).
*/
DROP FUNCTION IF EXISTS "inv"."FnAtenderRequerimiento"(UUID, UUID, VARCHAR);

CREATE OR REPLACE FUNCTION "inv"."FnAtenderRequerimiento"
(
	"PIdRequerimiento" UUID,
	"PEntrega"         JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vReq"         "inv"."T_Requerimiento";
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vNotas"       TEXT;
	"vRol"         TEXT;
	"vLinea"       JSONB;
	"vIdDetalle"   UUID;
	"vModo"        TEXT;
	"vCant"        NUMERIC;
	"vCosto"       NUMERIC;
	"vSolicitada"  NUMERIC;
	"vIdProducto"  UUID;
	"vNombreProd"  TEXT;
	"vSalidaDet"   JSONB := '[]'::JSONB;
	"vCompraDet"   JSONB := '[]'::JSONB;
	"vIdSalida"    UUID;
BEGIN
	"vUbic"        = NULLIF("PEntrega"->>'IdUbicacionOrigen', '')::UUID;
	"vProveedor"   = NULLIF("PEntrega"->>'IdProveedor', '')::UUID;
	"vComprobante" = NULLIF("PEntrega"->>'Comprobante', '');
	"vNotas"       = NULLIF("PEntrega"->>'Notas', '');

	SELECT * INTO "vReq" FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE FOR UPDATE;
	IF "vReq" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;
	IF "vReq"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se aprueban requerimientos pendientes (situacion actual: %).', "vReq"."Situacion";
	END IF;

	"vRol" = "seg"."FnRolUsuario"();
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vReq"."UsuarioCreacion"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes aprobar un requerimiento que tu mismo creaste.';
	END IF;

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas')
	LOOP
		"vIdDetalle" = ("vLinea"->>'IdDetalle')::UUID;
		"vModo"      = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"      = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"     = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			CONTINUE;
		END IF;

		SELECT D."Cantidad", D."IdProducto", P."Nombre"
		INTO "vSolicitada", "vIdProducto", "vNombreProd"
		FROM "inv"."T_RequerimientoDetalle" D
		JOIN "inv"."T_Producto" P ON P."Id" = D."IdProducto"
		WHERE D."Id" = "vIdDetalle"
		  AND D."IdRequerimiento" = "PIdRequerimiento"
		  AND D."Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Linea de detalle invalida para este requerimiento.';
		END IF;

		IF "vCant" > "vSolicitada" THEN
			RAISE EXCEPTION 'No puedes entregar mas de lo solicitado en %: solicitado %, intento %.',
				"vNombreProd", "vSolicitada", "vCant";
		END IF;

		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', "vCant");

		IF "vModo" = 'compra' THEN
			IF "vProveedor" IS NULL OR "vComprobante" IS NULL THEN
				RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
			END IF;
			IF "vCosto" IS NULL OR "vCosto" <= 0 THEN
				RAISE EXCEPTION 'La compra directa de % requiere un costo unitario mayor a cero.', "vNombreProd";
			END IF;
			"vCompraDet" = "vCompraDet" || JSONB_BUILD_OBJECT(
				'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'CostoUnitario', "vCosto"
			);
		END IF;

		UPDATE "inv"."T_RequerimientoDetalle"
		SET "CantidadAtendida" = "vCant"
		WHERE "Id" = "vIdDetalle";
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vSalidaDet") = 0 THEN
		RAISE EXCEPTION 'No se especifico ninguna cantidad a entregar.';
	END IF;

	IF JSONB_ARRAY_LENGTH("vCompraDet") > 0 THEN
		PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			'TipoDocumento',     'entrada',
			'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionDestino', "vUbic",
			'IdProveedor',       "vProveedor",
			'Comprobante',       "vComprobante",
			'Referencia',        'Compra directa REQ ' || COALESCE("vReq"."NumeroRequerimiento", LEFT("PIdRequerimiento"::TEXT, 8)),
			'Notas',             'Compra inmediata para atender requerimiento',
			'Detalle',           "vCompraDet"
		));
	END IF;

	"vIdSalida" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "vUbic",
		'IdVehiculo',        "vReq"."IdVehiculo",
		'Referencia',        COALESCE("vReq"."NumeroRequerimiento", 'REQ ' || LEFT("PIdRequerimiento"::TEXT, 8)),
		'Notas',             COALESCE("vNotas", 'Atencion de requerimiento'),
		'Detalle',           "vSalidaDet"
	));

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido', "IdDocumentoInventario" = "vIdSalida"
	WHERE "Id" = "PIdRequerimiento";

	RETURN "vIdSalida";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, JSONB) IS 'Aprueba un requerimiento con entrega por linea (parcial y/o compra directa). Modo stock = sale del almacen; modo compra = entrada de compra + salida (neto 0), valorizada al costo. SECURITY DEFINER; el creador no puede aprobar lo suyo (admin exento).';

/* ===================== migrations/0022_fixes_aprobacion.sql ===================== */
/*
	Correcciones del flujo de aprobaciones: FnAnularRequerimiento pasa a SECURITY
	DEFINER (gerencia puede rechazar; control en la API) + guard creador≠quien
	rechaza. FnAtenderRequerimiento: guard de lineas duplicadas + comentario
	correcto sobre la valorizacion (promedio movil; = costo de compra solo si no
	habia stock previo).
*/
CREATE OR REPLACE FUNCTION "inv"."FnAnularRequerimiento"
(
	"PIdRequerimiento" UUID,
	"PMotivo"          VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vReq" "inv"."T_Requerimiento";
	"vRol" TEXT;
BEGIN
	SELECT * INTO "vReq" FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE FOR UPDATE;

	IF "vReq" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;
	IF "vReq"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se rechazan requerimientos pendientes (situacion actual: %).', "vReq"."Situacion";
	END IF;

	"vRol" = "seg"."FnRolUsuario"();
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vReq"."UsuarioCreacion"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes rechazar un requerimiento que tu mismo creaste.';
	END IF;

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'anulado',
		"Notas" = CASE
			WHEN "PMotivo" IS NULL OR "PMotivo" = '' THEN "Notas"
			ELSE LEFT(COALESCE("Notas" || ' | ', '') || 'Rechazado: ' || "PMotivo", 500)
		END
	WHERE "Id" = "PIdRequerimiento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAnularRequerimiento"(UUID, VARCHAR) IS 'Rechaza un requerimiento pendiente (anulado). SECURITY DEFINER; el control de quién rechaza vive en la API (requerimientoAprobar). El creador no puede rechazar lo suyo (admin exento).';

CREATE OR REPLACE FUNCTION "inv"."FnAtenderRequerimiento"
(
	"PIdRequerimiento" UUID,
	"PEntrega"         JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vReq"         "inv"."T_Requerimiento";
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vNotas"       TEXT;
	"vRol"         TEXT;
	"vLinea"       JSONB;
	"vIdDetalle"   UUID;
	"vModo"        TEXT;
	"vCant"        NUMERIC;
	"vCosto"       NUMERIC;
	"vSolicitada"  NUMERIC;
	"vIdProducto"  UUID;
	"vNombreProd"  TEXT;
	"vSalidaDet"   JSONB := '[]'::JSONB;
	"vCompraDet"   JSONB := '[]'::JSONB;
	"vIdSalida"    UUID;
BEGIN
	"vUbic"        = NULLIF("PEntrega"->>'IdUbicacionOrigen', '')::UUID;
	"vProveedor"   = NULLIF("PEntrega"->>'IdProveedor', '')::UUID;
	"vComprobante" = NULLIF("PEntrega"->>'Comprobante', '');
	"vNotas"       = NULLIF("PEntrega"->>'Notas', '');

	SELECT * INTO "vReq" FROM "inv"."T_Requerimiento"
	WHERE "Id" = "PIdRequerimiento" AND "Estado" = TRUE FOR UPDATE;
	IF "vReq" IS NULL THEN
		RAISE EXCEPTION 'El requerimiento no existe.';
	END IF;
	IF "vReq"."Situacion" <> 'pendiente' THEN
		RAISE EXCEPTION 'Solo se aprueban requerimientos pendientes (situacion actual: %).', "vReq"."Situacion";
	END IF;

	"vRol" = "seg"."FnRolUsuario"();
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vReq"."UsuarioCreacion"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes aprobar un requerimiento que tu mismo creaste.';
	END IF;

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	IF (SELECT COUNT(*) FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas')) <>
	   (SELECT COUNT(DISTINCT (e->>'IdDetalle')) FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas') e) THEN
		RAISE EXCEPTION 'Hay lineas de entrega duplicadas en la solicitud.';
	END IF;

	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PEntrega"->'Lineas')
	LOOP
		"vIdDetalle" = ("vLinea"->>'IdDetalle')::UUID;
		"vModo"      = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"      = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"     = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			CONTINUE;
		END IF;

		SELECT D."Cantidad", D."IdProducto", P."Nombre"
		INTO "vSolicitada", "vIdProducto", "vNombreProd"
		FROM "inv"."T_RequerimientoDetalle" D
		JOIN "inv"."T_Producto" P ON P."Id" = D."IdProducto"
		WHERE D."Id" = "vIdDetalle"
		  AND D."IdRequerimiento" = "PIdRequerimiento"
		  AND D."Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Linea de detalle invalida para este requerimiento.';
		END IF;

		IF "vCant" > "vSolicitada" THEN
			RAISE EXCEPTION 'No puedes entregar mas de lo solicitado en %: solicitado %, intento %.',
				"vNombreProd", "vSolicitada", "vCant";
		END IF;

		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', "vCant");

		IF "vModo" = 'compra' THEN
			IF "vProveedor" IS NULL OR "vComprobante" IS NULL THEN
				RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
			END IF;
			IF "vCosto" IS NULL OR "vCosto" <= 0 THEN
				RAISE EXCEPTION 'La compra directa de % requiere un costo unitario mayor a cero.', "vNombreProd";
			END IF;
			"vCompraDet" = "vCompraDet" || JSONB_BUILD_OBJECT(
				'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'CostoUnitario', "vCosto"
			);
		END IF;

		UPDATE "inv"."T_RequerimientoDetalle"
		SET "CantidadAtendida" = "vCant"
		WHERE "Id" = "vIdDetalle";
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vSalidaDet") = 0 THEN
		RAISE EXCEPTION 'No se especifico ninguna cantidad a entregar.';
	END IF;

	IF JSONB_ARRAY_LENGTH("vCompraDet") > 0 THEN
		PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			'TipoDocumento',     'entrada',
			'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionDestino', "vUbic",
			'IdProveedor',       "vProveedor",
			'Comprobante',       "vComprobante",
			'Referencia',        'Compra directa REQ ' || COALESCE("vReq"."NumeroRequerimiento", LEFT("PIdRequerimiento"::TEXT, 8)),
			'Notas',             'Compra inmediata para atender requerimiento',
			'Detalle',           "vCompraDet"
		));
	END IF;

	"vIdSalida" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "vUbic",
		'IdVehiculo',        "vReq"."IdVehiculo",
		'Referencia',        COALESCE("vReq"."NumeroRequerimiento", 'REQ ' || LEFT("PIdRequerimiento"::TEXT, 8)),
		'Notas',             COALESCE("vNotas", 'Atencion de requerimiento'),
		'Detalle',           "vSalidaDet"
	));

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido', "IdDocumentoInventario" = "vIdSalida"
	WHERE "Id" = "PIdRequerimiento";

	RETURN "vIdSalida";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAtenderRequerimiento"(UUID, JSONB) IS 'Aprueba un requerimiento con entrega por linea (parcial y/o compra directa). Modo stock = sale del almacen. Modo compra = entrada de compra + salida: el consumo se valoriza al COSTO PROMEDIO MOVIL resultante (igual al costo de compra solo si el producto no tenia stock previo; con stock previo el promedio se mezcla, NIC 2). Un solo proveedor/comprobante por aprobacion. SECURITY DEFINER; control de quien aprueba en la API; el creador no aprueba lo suyo (admin exento).';

/* ===================== migrations/0023_historial_precios_stock.sql ===================== */
/*
	Historial de precios + remanente de stock por lote (FIFO de solo lectura).
	TieneStock=true si el lote aun respalda stock. No cambia la valorizacion
	(promedio movil); habilita/inhabilita el override de precio en salidas.
*/
CREATE OR REPLACE FUNCTION "inv"."FnHistorialPreciosProducto"
(
	"PIdProducto" UUID
)
RETURNS TABLE
(
	"Id"                    UUID,
	"IdProducto"            UUID,
	"Costo"                 NUMERIC,
	"CostoPromedio"         NUMERIC,
	"FechaPrecio"           DATE,
	"IdProveedor"           UUID,
	"IdDocumentoInventario" UUID,
	"Origen"                VARCHAR,
	"NombreProveedor"       TEXT,
	"CantidadComprada"      NUMERIC,
	"CantidadRemanente"     NUMERIC,
	"TieneStock"            BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
	WITH "stock" AS (
		SELECT COALESCE(SUM("CantidadDisponible"), 0) AS "s"
		FROM "inv"."T_SaldoStock"
		WHERE "IdProducto" = "PIdProducto"
	),
	"lotes" AS (
		SELECT
			h."Id", h."IdProducto", h."Costo", h."CostoPromedio", h."FechaPrecio",
			h."IdProveedor", h."IdDocumentoInventario", h."Origen", h."FechaCreacion",
			COALESCE((
				SELECT SUM(m."Cantidad")
				FROM "inv"."T_MovimientoStock" m
				WHERE m."IdDocumentoInventario" = h."IdDocumentoInventario"
				  AND m."IdProducto" = h."IdProducto"
				  AND m."Direccion" = 1
			), 0) AS "qty"
		FROM "inv"."T_ProductoPrecioHistorico" h
		WHERE h."IdProducto" = "PIdProducto" AND h."Estado" = TRUE
	),
	"fifo" AS (
		SELECT *,
			SUM("qty") OVER (
				ORDER BY "FechaPrecio" DESC, "FechaCreacion" DESC, "Id" DESC
				ROWS UNBOUNDED PRECEDING
			) AS "acum"
		FROM "lotes"
	)
	SELECT
		f."Id", f."IdProducto", f."Costo", f."CostoPromedio", f."FechaPrecio",
		f."IdProveedor", f."IdDocumentoInventario", f."Origen",
		pr."Nombre" AS "NombreProveedor",
		f."qty" AS "CantidadComprada",
		GREATEST(0, LEAST(f."qty", (SELECT "s" FROM "stock") - (f."acum" - f."qty"))) AS "CantidadRemanente",
		(GREATEST(0, LEAST(f."qty", (SELECT "s" FROM "stock") - (f."acum" - f."qty"))) > 0) AS "TieneStock"
	FROM "fifo" f
	LEFT JOIN "inv"."T_Proveedor" pr ON pr."Id" = f."IdProveedor"
	ORDER BY f."FechaPrecio" DESC, f."FechaCreacion" DESC, f."Id" DESC
	LIMIT 50;
$$;

COMMENT ON FUNCTION "inv"."FnHistorialPreciosProducto"(UUID) IS 'Historial de precios + remanente de stock por lote (FIFO de solo lectura sobre el ledger). TieneStock=true si el lote aun respalda stock. No cambia la valorizacion (promedio movil); solo habilita/inhabilita el override de precio en salidas.';

/* ===================== migrations/0024_codigo_producto_proveedor.sql ===================== */
/*
	Codigo del producto en el proveedor (el que se usa al comprar, ej. 'X123').
	Campo distinto del codigo de barras. Un solo codigo por producto (si se
	necesita uno por proveedor, migrar a una puente producto-proveedor).
*/
ALTER TABLE "inv"."T_Producto"
	ADD COLUMN IF NOT EXISTS "CodigoProductoProveedor" VARCHAR(60);

COMMENT ON COLUMN "inv"."T_Producto"."CodigoProductoProveedor" IS 'Código del producto en el proveedor (el que se brinda al comprar). Distinto del código de barras.';

CREATE OR REPLACE FUNCTION "inv"."FnGuardarProducto"
(
	"PProducto" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"        UUID;
	"vEsGeneral" BOOLEAN;
	"vUsuario"   VARCHAR(50);
	"vTipos"     JSONB;
	"vCantTipos" INT;
BEGIN
	"vUsuario"   = COALESCE(auth.uid()::TEXT, 'API');
	"vId"        = NULLIF("PProducto"->>'Id', '')::UUID;
	"vEsGeneral" = COALESCE(("PProducto"->>'EsGeneral')::BOOLEAN, FALSE);
	"vTipos"     = COALESCE("PProducto"->'IdsTipoEquipo', '[]'::JSONB);
	"vCantTipos" = JSONB_ARRAY_LENGTH("vTipos");

	IF "vEsGeneral" AND "vCantTipos" > 0 THEN
		RAISE EXCEPTION 'Un producto general no lleva tipos de equipo.';
	END IF;
	IF NOT "vEsGeneral" AND "vCantTipos" = 0 THEN
		RAISE EXCEPTION 'Elige al menos un tipo de equipo o marca el producto como general.';
	END IF;

	IF "vId" IS NULL THEN
		INSERT INTO "inv"."T_Producto"
		(
			"Sku","Nombre","IdCategoria","IdUnidadMedida","StockMinimo",
			"CodigoBarra","CodigoProductoProveedor","Atributos","EsGeneral",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"PProducto"->>'Sku',
			"PProducto"->>'Nombre',
			("PProducto"->>'IdCategoria')::UUID,
			("PProducto"->>'IdUnidadMedida')::UUID,
			COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, 0),
			NULLIF("PProducto"->>'CodigoBarra', ''),
			NULLIF("PProducto"->>'CodigoProductoProveedor', ''),
			COALESCE("PProducto"->'Atributos', '{}'::JSONB),
			"vEsGeneral",
			"vUsuario",
			"vUsuario"
		)
		RETURNING "Id" INTO "vId";
	ELSE
		UPDATE "inv"."T_Producto"
		SET "Sku"                     = "PProducto"->>'Sku',
			"Nombre"                  = "PProducto"->>'Nombre',
			"IdCategoria"             = ("PProducto"->>'IdCategoria')::UUID,
			"IdUnidadMedida"          = ("PProducto"->>'IdUnidadMedida')::UUID,
			"StockMinimo"             = COALESCE(("PProducto"->>'StockMinimo')::NUMERIC, "StockMinimo"),
			"CodigoBarra"             = NULLIF("PProducto"->>'CodigoBarra', ''),
			"CodigoProductoProveedor" = NULLIF("PProducto"->>'CodigoProductoProveedor', ''),
			"Atributos"               = COALESCE("PProducto"->'Atributos', "Atributos"),
			"EsGeneral"               = "vEsGeneral",
			"UsuarioModificacion"     = "vUsuario"
		WHERE "Id" = "vId";

		IF NOT FOUND THEN
			RAISE EXCEPTION 'El producto no existe.';
		END IF;
	END IF;

	DELETE FROM "inv"."T_ProductoTipoEquipo" WHERE "IdProducto" = "vId";

	IF NOT "vEsGeneral" THEN
		INSERT INTO "inv"."T_ProductoTipoEquipo"
			("IdProducto","IdTipoEquipo","UsuarioCreacion","UsuarioModificacion")
		SELECT "vId", t.elem::UUID, "vUsuario", "vUsuario"
		FROM JSONB_ARRAY_ELEMENTS_TEXT("vTipos") AS t(elem);
	END IF;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnGuardarProducto"(JSONB) IS 'Crea (sin Id) o edita (con Id) un producto (incluye CodigoProductoProveedor) y reemplaza su compatibilidad por tipo de equipo en una transaccion. Aplica la invariante general XOR tipos.';

/* ===================== migrations/0025_dependencias_categoria.sql ===================== */
/*
	FnContarDependencias: rama 'categoria' (productos con esa IdCategoria +
	subcategorias con esa IdCategoriaPadre) para borrado seguro de categorías.
*/
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
	ELSIF "PEntidad" = 'categoria' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'productos', (SELECT COUNT(*) FROM "inv"."T_Producto" WHERE "IdCategoria" = "PId" AND "Estado" = TRUE),
			'subcategorias', (SELECT COUNT(*) FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" = "PId" AND "Estado" = TRUE)
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

COMMENT ON FUNCTION "inv"."FnContarDependencias"(TEXT, UUID) IS 'Cuenta datos enlazados de una entidad (incluye categoria: productos + subcategorias). puedeEliminar=true solo si total=0.';

/* ===================== migrations/0026_recambios.sql ===================== */
/*
	V_Recambio_Producto: recambios por equipo/placa × producto con intervalo (días)
	desde el recambio anterior. Acelerado = desgaste_prematuro marcado o intervalo
	< 50% del promedio del par. Detecta prematuros sin configurar vida útil.
*/
CREATE OR REPLACE VIEW "inv"."V_Recambio_Producto"
WITH (security_invoker = true) AS
	WITH "base" AS (
		SELECT
			RQ."Id"                  AS "IdRequerimiento",
			RQ."NumeroRequerimiento",
			RQ."FechaRequerimiento",
			RQ."Origen",
			COALESCE(RQ."IdVehiculo", RQ."IdEquipo") AS "TargetId",
			CASE WHEN RQ."IdVehiculo" IS NOT NULL THEN 'placa' ELSE 'equipo' END AS "TargetTipo",
			COALESCE(V."Placa", E."Codigo" || ' — ' || E."Nombre") AS "TargetNombre",
			RD."IdProducto",
			P."Sku",
			P."Nombre" AS "NombreProducto",
			RD."Cantidad",
			(RQ."FechaRequerimiento" - LAG(RQ."FechaRequerimiento") OVER (
				PARTITION BY COALESCE(RQ."IdVehiculo", RQ."IdEquipo"), RD."IdProducto"
				ORDER BY RQ."FechaRequerimiento", RQ."Id"
			)) AS "DiasDesdeAnterior"
		FROM "inv"."T_Requerimiento" RQ
		JOIN "inv"."T_RequerimientoDetalle" RD ON RD."IdRequerimiento" = RQ."Id" AND RD."Estado" = TRUE
		JOIN "inv"."T_Producto" P ON P."Id" = RD."IdProducto"
		LEFT JOIN "inv"."T_Vehiculo" V ON V."Id" = RQ."IdVehiculo"
		LEFT JOIN "inv"."T_Equipo" E ON E."Id" = RQ."IdEquipo"
		WHERE RQ."Estado" = TRUE
	),
	"conprom" AS (
		SELECT
			"base".*,
			AVG("DiasDesdeAnterior") OVER (PARTITION BY "TargetId", "IdProducto") AS "PromedioDiasPar"
		FROM "base"
	)
	SELECT
		"IdRequerimiento",
		"NumeroRequerimiento",
		"FechaRequerimiento",
		"Origen",
		"TargetId",
		"TargetTipo",
		"TargetNombre",
		"IdProducto",
		"Sku",
		"NombreProducto",
		"Cantidad",
		"DiasDesdeAnterior",
		ROUND("PromedioDiasPar", 1) AS "PromedioDiasPar",
		(
			"Origen" = 'desgaste_prematuro'
			OR (
				"DiasDesdeAnterior" IS NOT NULL
				AND "PromedioDiasPar" IS NOT NULL
				AND "PromedioDiasPar" > 0
				AND "DiasDesdeAnterior" < "PromedioDiasPar" * 0.5
			)
		) AS "Acelerado"
	FROM "conprom";

COMMENT ON VIEW "inv"."V_Recambio_Producto" IS 'Recambios por equipo/placa × producto con intervalo (días) desde el recambio anterior. Acelerado = desgaste_prematuro marcado o intervalo < 50% del promedio del par. Detecta prematuros sin configurar vida útil.';

/* ===================== migrations/0030_personal_cargo.sql ===================== */
/*
	Maestro de personal (solicitantes) + catálogo de cargos. El requerimiento
	referencia al solicitante por FK (distinto de UsuarioCreacion). El rol de
	acceso vive en el usuario vinculado (opcional), no en el personal.
*/
CREATE TABLE "inv"."T_Cargo"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
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
	CONSTRAINT "PK_T_Cargo" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Cargo_Codigo" UNIQUE ("Codigo")
);
COMMENT ON TABLE "inv"."T_Cargo" IS 'Catálogo de cargos del personal (mecánico, operador, jefe de taller...).';

CREATE TRIGGER "TR_T_Cargo_Auditoria"
	BEFORE UPDATE ON "inv"."T_Cargo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_Cargo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Cargo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "CargoEscrituraAdmin" ON "inv"."T_Cargo"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE TABLE "inv"."T_Personal"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"NombreCompleto"      VARCHAR(150) NOT NULL,
	"Dni"                 VARCHAR(15),
	"Telefono"            VARCHAR(20),
	"IdCargo"             UUID         NOT NULL,
	"IdUsuario"           UUID,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Personal" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_Personal_Cargo_IdCargo"
		FOREIGN KEY ("IdCargo") REFERENCES "inv"."T_Cargo" ("Id"),
	CONSTRAINT "FK_T_Personal_Usuario_IdUsuario"
		FOREIGN KEY ("IdUsuario") REFERENCES "seg"."T_Usuario" ("Id")
);
COMMENT ON TABLE "inv"."T_Personal" IS 'Personal de la obra (solicitantes). Cargo por FK; usuario de login opcional (el rol de acceso vive en el usuario, no acá).';

CREATE INDEX "IX_T_Personal_IdCargo" ON "inv"."T_Personal" ("IdCargo");
-- Unicidad de login solo sobre personal ACTIVO: el soft-delete libera el usuario (0031).
CREATE UNIQUE INDEX "UQ_T_Personal_IdUsuario"
	ON "inv"."T_Personal" ("IdUsuario")
	WHERE "Estado" = true;

CREATE TRIGGER "TR_T_Personal_Auditoria"
	BEFORE UPDATE ON "inv"."T_Personal"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_Personal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Personal"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "PersonalEscrituraAdmin" ON "inv"."T_Personal"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

ALTER TABLE "inv"."T_Requerimiento"
	ADD COLUMN IF NOT EXISTS "IdPersonalSolicitante" UUID;
ALTER TABLE "inv"."T_Requerimiento"
	ADD CONSTRAINT "FK_T_Requerimiento_Personal_IdPersonalSolicitante"
		FOREIGN KEY ("IdPersonalSolicitante") REFERENCES "inv"."T_Personal" ("Id");
COMMENT ON COLUMN "inv"."T_Requerimiento"."IdPersonalSolicitante" IS 'Persona que solicita (FK a T_Personal). Distinto de UsuarioCreacion (quien lo cargó).';
CREATE INDEX "IX_T_Requerimiento_IdPersonalSolicitante" ON "inv"."T_Requerimiento" ("IdPersonalSolicitante");

CREATE OR REPLACE FUNCTION "inv"."FnRegistrarRequerimiento"
(
	"PRequerimiento" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"      UUID;
	"vUsuario" VARCHAR(50);
	"vDetalle" JSONB;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento","FechaRequerimiento","Origen","IdEquipo","IdVehiculo",
		"IdPersonalSolicitante","Notas","Situacion","UsuarioCreacion","UsuarioModificacion"
	)
	VALUES
	(
		NULLIF("PRequerimiento"->>'NumeroRequerimiento', '')
		,("PRequerimiento"->>'FechaRequerimiento')::DATE
		,"PRequerimiento"->>'Origen'
		,NULLIF("PRequerimiento"->>'IdEquipo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdVehiculo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdPersonalSolicitante', '')::UUID
		,NULLIF("PRequerimiento"->>'Notas', '')
		,'pendiente'
		,"vUsuario"
		,"vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PRequerimiento"->'Detalle')
	LOOP
		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento","IdProducto","Cantidad","Notas","UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,("vDetalle"->>'IdProducto')::UUID
			,("vDetalle"->>'Cantidad')::NUMERIC
			,NULLIF("vDetalle"->>'Notas', '')
			,"vUsuario"
			,"vUsuario"
		);
	END LOOP;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarRequerimiento"(JSONB) IS 'Crea un requerimiento con su detalle (incluye solicitante) desde JSON en una transaccion.';

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
	ELSIF "PEntidad" = 'categoria' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'productos', (SELECT COUNT(*) FROM "inv"."T_Producto" WHERE "IdCategoria" = "PId" AND "Estado" = TRUE),
			'subcategorias', (SELECT COUNT(*) FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'cargo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'personal', (SELECT COUNT(*) FROM "inv"."T_Personal" WHERE "IdCargo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'personal' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdPersonalSolicitante" = "PId")
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

COMMENT ON FUNCTION "inv"."FnContarDependencias"(TEXT, UUID) IS 'Cuenta datos enlazados de una entidad (incluye categoria, cargo, personal). puedeEliminar=true solo si total=0.';

/* ===================== seed/seed.sql ===================== */
/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: datos base (roles, unidades, categorias, ubicaciones)
	Tipo de Cambio: INSERT - seed idempotente
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Carga inicial reejecutable (ON CONFLICT DO NOTHING).
*/

/* Roles */
INSERT INTO "seg"."T_Rol" ("Codigo","Nombre","Descripcion")
VALUES
	('admin','Administrador','Acceso total: usuarios, catalogo, anulaciones.')
	,('gerencia','Gerencia','Lectura total, dashboard y reportes.')
	,('supervision','Supervision','Lectura y creacion/confirmacion de salidas y transferencias.')
	,('almacenero','Almacenero','Registro de entradas, salidas, transferencias y productos.')
ON CONFLICT ("Codigo") DO NOTHING;

/* Unidades de medida */
INSERT INTO "inv"."T_UnidadMedida" ("Codigo","Nombre")
VALUES
	('NIU','Unidad (NIU)')
	,('UND','Unidad')
	,('LT','Litro')
	,('KG','Kilogramo')
	,('M','Metro')
ON CONFLICT ("Codigo") DO NOTHING;

/* Familias (categorias raiz), una por KARDEX */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
VALUES
	('FAM-HER','Herramientas',NULL)
	,('FAM-FIL','Filtros',NULL)
	,('FAM-ACE','Aceites y Liquidos',NULL)
	,('FAM-ESL','Eslingas y Grilletes',NULL)
	,('FAM-SUS','Sistema de Suspension',NULL)
	,('FAM-SUM','Suministros de Rotacion',NULL)
ON CONFLICT ("Codigo") DO NOTHING;

/* Categorias hijas (columna CATEGORIA del Excel) colgadas de su familia */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
SELECT
	V."Codigo"
	,V."Nombre"
	,C."Id"
FROM
	(
		VALUES
			('CAT-HERRAMIENTA','HERRAMIENTA','FAM-HER')
			,('CAT-FILTRO','FILTRO','FAM-FIL')
			,('CAT-ACEITE','ACEITE','FAM-ACE')
			,('CAT-GRASA','GRASA','FAM-ACE')
			,('CAT-REPUESTO','REPUESTO','FAM-SUS')
			,('CAT-SUMINISTRO','SUMINISTRO','FAM-SUM')
	) AS V("Codigo","Nombre","CodigoPadre")
INNER JOIN "inv"."T_Categoria" C ON C."Codigo" = V."CodigoPadre"
ON CONFLICT ("Codigo") DO NOTHING;

/* Ubicaciones (de las guias de remision analizadas) */
INSERT INTO "inv"."T_Ubicacion" ("Codigo","Nombre","Tipo","Direccion")
VALUES
	('ALM-AQP','Almacen Central - Arequipa','almacen_central','Sol Oeste 107 - Cerro Colorado - Arequipa')
	,('PROY-TAM','Proyecto Tambomayo','proyecto','Tapay - Caylloma - Arequipa')
ON CONFLICT ("Codigo") DO NOTHING;

/* ===================== seed/productos.sql ===================== */
/*
	SEED de productos (equivalente al ETL, generado desde los 6 Excel KARDEX).
	Ejecutar DESPUES de seed.sql. Idempotente (ON CONFLICT DO NOTHING).
	Total productos: 222.
	Colisiones de Sku omitidas (se conservo la primera aparicion):
	  - AF1019 (3. KARDEX - ACEITES  Y LIQUIDOS.xlsx)
*/
WITH "Datos" ("Sku","Nombre","CodigoCategoria") AS
(
	VALUES
		('HE1001','GATA HIDRÁULICA DE 4 TONELADAS','CAT-HERRAMIENTA'),
		('HE1002','ENGRASADORA MANUAL','CAT-HERRAMIENTA'),
		('HE1003','TORQUIMETRO','CAT-HERRAMIENTA'),
		('HE1004','ESCOBILLA DE ACERO','CAT-HERRAMIENTA'),
		('HE1005','STYLSON','CAT-HERRAMIENTA'),
		('HE1006','COMBO DE 4 LB','CAT-HERRAMIENTA'),
		('HE1007','JUEGO DE LLAVES (7A24) MENOS N° 17','CAT-HERRAMIENTA'),
		('HE1008','ALICATE DE PRESIÓN - STANLEY','CAT-HERRAMIENTA'),
		('HE1009','MARTILLO - STANLEY','CAT-HERRAMIENTA'),
		('HE1010','ESTRACTO DE FILTRO SATA','CAT-HERRAMIENTA'),
		('HE1011','JUEGO DE LLAVES ALLEN - STANLEY','CAT-HERRAMIENTA'),
		('HE1012','JUEGO DE LLAVES ALLEN - TRUPER','CAT-HERRAMIENTA'),
		('HE1013','ALICATE MECÁNICO - STANLEY','CAT-HERRAMIENTA'),
		('HE1014','ALICATE DE PUNTA','CAT-HERRAMIENTA'),
		('HE1015','ALICATE DE CORTE´- STANLEY','CAT-HERRAMIENTA'),
		('HE1016','FLEXOMETRO - STANLEY','CAT-HERRAMIENTA'),
		('HE1017','JUEGO DE EXAGONALES EN "L"','CAT-HERRAMIENTA'),
		('HE1018','DADO CARDANICO DE 1/2','CAT-HERRAMIENTA'),
		('HE1019','MANERAL CARDANICO DE 1/2 - STANLEY','CAT-HERRAMIENTA'),
		('HE1020','DESTORNILLADOR PLANA PEQUEÑA Y MEDIANA','CAT-HERRAMIENTA'),
		('HE1021','DESTORNILLADOR ESTRELLA PEQUEÑA Y MEDIANA','CAT-HERRAMIENTA'),
		('HE1022','DADO N°27 DE 3/4','CAT-HERRAMIENTA'),
		('HE1023','ESPÁTULA','CAT-HERRAMIENTA'),
		('HE1024','MANERAL CARDANICO DE 3/4 STANLEY','CAT-HERRAMIENTA'),
		('HE1025','ACOPLE DE 3/4 MEDIANO ( ESTENSIÓN)','CAT-HERRAMIENTA'),
		('HE1026','REDUCTOR 3/4','CAT-HERRAMIENTA'),
		('HE1027','LLAVE FRANCESA 12"','CAT-HERRAMIENTA'),
		('HE1028','ARCO SIERRA','CAT-HERRAMIENTA'),
		('HE1029','JUEGO DE DADOS 29 PIEZAS - STANLEY','CAT-HERRAMIENTA'),
		('HE1030','MULTIPLICADOR DE FUERZA -7 PIEZAS','CAT-HERRAMIENTA'),
		('HE1031','PISTOLA ELECTRICA DE 1/2  - ROTAKE','CAT-HERRAMIENTA'),
		('HE1032','ALICATE SACA SEGURO','CAT-HERRAMIENTA'),
		('HE1033','MEDIDOR DE PRESIÓN','CAT-HERRAMIENTA'),
		('HE1034','VALVULA PARA INFLADO','CAT-HERRAMIENTA'),
		('HE1035','REGULADOR DE FRENOS','CAT-HERRAMIENTA'),
		('HE1036','MULTIMETRO - TRUPER','CAT-HERRAMIENTA'),
		('HE1037','JUEGO DE DADOS TUBULARES 10 PIEZAS','CAT-HERRAMIENTA'),
		('HE1038','ALICATE PELACABLES','CAT-HERRAMIENTA'),
		('HE1039','PILOTO ELECTRICO','CAT-HERRAMIENTA'),
		('HE1040','DADO N°32 DE 3/4','CAT-HERRAMIENTA'),
		('HE1041','DADO N°30 DE 3/4','CAT-HERRAMIENTA'),
		('HE1042','DADO N°34 DE 3/4','CAT-HERRAMIENTA'),
		('HE1043','ACOPLE DE 3/4  ( ESTENSIÓN)','CAT-HERRAMIENTA'),
		('HE1044','MEDIDOR DE COCADA DE LLANTA','CAT-HERRAMIENTA'),
		('HE1045','CABALLETE DE 3 TONELADAS','CAT-HERRAMIENTA'),
		('HE1046','ESCANNER LAUNCH','CAT-HERRAMIENTA'),
		('HE1047','GATA HIDROLIZA TIPO BOTELLA - TRUPER','CAT-HERRAMIENTA'),
		('HE1048','RETIFICADORA DEREK','CAT-HERRAMIENTA'),
		('HE1049','SACA VALVULA','CAT-HERRAMIENTA'),
		('AF1009','FILTRO DE COMBUSTIBLE - EX8','CAT-FILTRO'),
		('AF1010','FILTRO DE ACEITE - EX8','CAT-FILTRO'),
		('AF1012','FILTRO DE ACEITE HIDRAULICO - GRUA','CAT-FILTRO'),
		('AF1011','FILTRO DE AIRE - EX8','CAT-FILTRO'),
		('AF1013','FILTRO DE AIRE - COUNTY / BAE1024 WILLY BUSH','CAT-FILTRO'),
		('AF1014','FILTRO DE ACEITE - COUNTY','CAT-FILTRO'),
		('AF1015','FILTRO DE COMBUSTIBLE - COUNTY','CAT-FILTRO'),
		('AF1016','FILTRO DE ACONDICIONAMIENTO - EX8 / FILTRO DE CABINA 97133-4H000','CAT-FILTRO'),
		('AF1019','FILTRO DE COMBUSTIBLE DE ABASTECIMIENTO','CAT-FILTRO'),
		('AF1001','GRASA SKF DE  1KG','CAT-GRASA'),
		('AF1002','GRASA CHASIS - DAYTOYA','CAT-GRASA'),
		('AF1003','GRASA MULTIPROPÓSITO - VISTONY','CAT-GRASA'),
		('AF1004','ACEITE 10W40 MOTUL * GALON 4 LITROS','CAT-ACEITE'),
		('AF1005','ACEITE 10W40 MOTUL * GALON 1 LITRO','CAT-ACEITE'),
		('AF1006','LIQUIDO DE FRENO 1LT - WAGNER','FAM-ACE'),
		('AF1007','LIQUIDO DE FRENO 1/4 LT - AMALIE','FAM-ACE'),
		('AF1008','REFRIGERANTE GALON','FAM-ACE'),
		('AF1020','BALDE DE ACEITE MOBIL SAE80W-90 (19 LT) ACEITE DE CAJA','CAT-ACEITE'),
		('AF1021','BALDE DE ACEITE MOBIL SAE85W-140 DE 5 GL (18.93 LT) ACEITE DE CORONA','CAT-ACEITE'),
		('AF1022','BALDE DRAULA - H ISO 68 VISTONY ACEITE HIDRAULICO DE 5 GL DE 18.92 LT','CAT-ACEITE'),
		('ESL1001','TENSOR DE CARGA','CAT-SUMINISTRO'),
		('ESL1002','GRILLETE 3/4','CAT-SUMINISTRO'),
		('ESL1003','GRILLETE 1/2','CAT-SUMINISTRO'),
		('ESL1004','ESLINGA DE 6 METROS 2 CAPAS','CAT-SUMINISTRO'),
		('ESL1005','ESLINGA DE 3 METROS 2 CAPAS','CAT-SUMINISTRO'),
		('ESL1006','ESLINGA DE 4 METROS 2 CAPAS','CAT-SUMINISTRO'),
		('ESL1007','ESLINGA DE 2 METROS 2 CAPAS','CAT-SUMINISTRO'),
		('ESL1008','ESLINGA DE 1 METROS 2 CAPAS','CAT-SUMINISTRO'),
		('ESL1009','ESLINGA PLANA 4 METROS','CAT-SUMINISTRO'),
		('ESL1010','NIVEL DE GRUA','CAT-SUMINISTRO'),
		('SUS1001','PARCHE DE CÁMARA','CAT-REPUESTO'),
		('SUS1002','RODAMIENTO 30213 JR','CAT-REPUESTO'),
		('SUS1003','RODAMIENTO 50 KW01/3720','CAT-REPUESTO'),
		('SUS1004','RODAMIENTO 6303-2NSE9C3','CAT-REPUESTO'),
		('SUS1005','RODAMIENTO 6203-2RSH/C3','CAT-REPUESTO'),
		('SUS1006','CORREA FAJA 4PK1220','CAT-REPUESTO'),
		('SUS1007','TRABATUERCAS UNIDADES','CAT-REPUESTO'),
		('SUS1008','CAMARA Y LLANTA DELANTERA NUEVA VIKRAN','CAT-REPUESTO'),
		('SUS1013','REMACHES','CAT-REPUESTO'),
		('SUS1014','PARCHE PARA LLANTA N°2','CAT-REPUESTO'),
		('SUS1015','CAMARAS','CAT-REPUESTO'),
		('SUS1016','PONCHO DE LLANTA','CAT-REPUESTO'),
		('SUS1017','TRABATUERCAS JUEGOS','CAT-REPUESTO'),
		('SUS1018','CAMARA Y LLANTA POSTERIOR NUEVA VIKRAN','CAT-REPUESTO'),
		('SUS1019','ABRAZADERAS EX8','CAT-REPUESTO'),
		('SUS1021','SEGMENTO PARA MUELLE 0044 EX8','CAT-REPUESTO'),
		('SUS1022','PAQUETES COMPLETOS DE MUELLE EX8','CAT-REPUESTO'),
		('SUS1023','AMORTIGUADORES / MONRO MAGNUM 60 / 6901 / 6803','CAT-REPUESTO'),
		('SUS1024','FAJA DE ALTERNADOR 8PK - 1710 EX8','CAT-REPUESTO'),
		('SUS1025','FAJA DE ALTERNADOR 8PK - 1540 COUNTY','CAT-REPUESTO'),
		('SUS1026','FAJA DE BOMBA DE AGUA 8PK - 1020 COUNTY','CAT-REPUESTO'),
		('SUS1028','GOMAS DE FRENO DE 1 1/4','CAT-REPUESTO'),
		('SUS1029','GOMAS DE FRENO DE 1 1/8','CAT-REPUESTO'),
		('SUS1030','RODAJE PISTA -  CONO 17458X3021JR','CAT-REPUESTO'),
		('SUS1031','RODAJE PISTA -  CONO 25417X50KW01','CAT-REPUESTO'),
		('SUS1032','RETEN 72X94X108381083810X72X94X10','CAT-REPUESTO'),
		('SUS1033','RETEN 65X113X10/30 71119XBH-4727E','CAT-REPUESTO'),
		('SUS1034','RETEN 56X99X10/34.5 7234X56X99X10/345','CAT-REPUESTO'),
		('SUS1035','PASADOR ZAPATA HYUNDAI EX8','CAT-REPUESTO'),
		('SUS1036','ARANDELA ZAPATA FRENO HYUNDAI HD-65/72/78 EX8','CAT-REPUESTO'),
		('SUS1037','RESORTE HYUNDAI EX8','CAT-REPUESTO'),
		('SUS1038','RESORTE DE FRENO HYUNDAI EX8','CAT-REPUESTO'),
		('SUS1040','GOMAS DE MUELLE POSTERIOR COUNTY','CAT-REPUESTO'),
		('SUS1041','GOMAS DE MUELLE DELANTERO COUNTY','CAT-REPUESTO'),
		('SUS1042','GOMAS DE AMORTIGUADOR COUNTY','CAT-REPUESTO'),
		('SUS1043','ARO CON PESTAÑA','CAT-REPUESTO'),
		('SUS1044','CAMARA Y LLANTA POSTERIOR NUEVA JK TYRE','CAT-REPUESTO'),
		('SUS1045','GOMAS DE BARRA DE DIRECCION COUNTY','CAT-REPUESTO'),
		('SUS1046','BUJE 9752','CAT-REPUESTO'),
		('SUS1047','RODAMIENTO','CAT-REPUESTO'),
		('SUS1048','ZAPATA FRENO DE MANO HYUNDAI','CAT-REPUESTO'),
		('SUS1049','ZAPATA FRENO ESTACIONAMIENTO HYUNDAI','CAT-REPUESTO'),
		('SUS1051','RETEN CIGÜEÑAL DELANTERO HYUNDAI EX8','CAT-REPUESTO'),
		('SUS1052','RETEN RUEDA POST. INT. HYUNDAI HD-65/72/78 COUNTY - EX8','CAT-REPUESTO'),
		('SUS1053','ZAPATA/FAJA EX8 - COUNTY - NORMAL (JUEGO DE 4) UNIDADES','CAT-REPUESTO'),
		('SUS1054','CRUCETA DE CARDAN EX8','CAT-REPUESTO'),
		('SUS1055','CRUCETA DE CARDAN COUNTY','CAT-REPUESTO'),
		('SUS1056','CABLE DE FRENO DE MANO EX8 - CABLE DE FRENO DE MANO DE PARQUEO','CAT-REPUESTO'),
		('SUS1057','GOMAS DE BARRA ESTABILIZADORA TIPO YOYO - COUNTY','CAT-REPUESTO'),
		('SUS1058','SOPORTE DE CARDAN COUNTY','CAT-REPUESTO'),
		('SUS1059','SOPORTE DE CARDAN EX8','CAT-REPUESTO'),
		('SUS1060','RETEN DELANTERO INFERIOR 72*94*10 EX8 - COUNTY','CAT-REPUESTO'),
		('SUS1061','FAJA ACANALADA BANDA 8PK 1020 * 58171','CAT-REPUESTO'),
		('SUS1062','FAJA ACANALADA BANDA 8PK 1540 * 79684','CAT-REPUESTO'),
		('SUS1063','FAJA ACANALADA BANDA 8PK 1450','CAT-REPUESTO'),
		('SUS1064','FAJA ACANALADA BANDA 8PK 102','CAT-REPUESTO'),
		('SUS1065','FAJA DE ALTERNADOR COUNTY - HYUNDAI','CAT-REPUESTO'),
		('SUS1066','CAÑERIA FRENO POST LH HYUNDAI - 165837 15K500','CAT-REPUESTO'),
		('SUS1067','CAÑERIA FRENO POST RH HYUNDAI - 165847 15K500','CAT-REPUESTO'),
		('SUS1068','BUJES DE MUELLE POSTERIOR','CAT-REPUESTO'),
		('SUS1069','BUJES DE MUELLE DELANTERO','CAT-REPUESTO'),
		('SUS1070','BUJES DE MUELLE DE SOPORTE','CAT-REPUESTO'),
		('SUS1071','ZAPATA/FAJA EX8 - COUNTY - X  (JUEGO DE 4) UNIDADES','CAT-REPUESTO'),
		('SUS1072','MUELLE DELANTERO (7 FAJAS) COUNTY - UNIDAD','CAT-REPUESTO'),
		('SUS1073','MUELLE POSTERIOR (8 FAJAS) COUNTY - UNIDAD','CAT-REPUESTO'),
		('SUS1074','FAJA DE ALTERNADOR PIX FORCE PK1840 - EPOM - XC - 1106','CAT-REPUESTO'),
		('SUS1075','ABRAZADERA DE MUELLE AB5/8X23/4X6','CAT-REPUESTO'),
		('SUS1076','ABRAZADERA DE MUELLE AB5/8X23/4X7','CAT-REPUESTO'),
		('SUS1077','EMBRIAGUE DE ENFRIAMIENTO - HIDROSTATICO - COUNTY HYUNDAI ORIGINAL','CAT-REPUESTO'),
		('SUS1078','TAPA DE RADIADOR 0.9 ALTERNATIVO - HYUNDAI','CAT-REPUESTO'),
		('SUS1079','TAPA DE RADIADOR 0.7 ORIGINAL - HYUNDAI CODIGO: 253405L250','CAT-REPUESTO'),
		('SUS1080','POLEA CODIGO: 252164800','CAT-REPUESTO'),
		('SUS1081','REGULADOR','CAT-REPUESTO'),
		('SUS1082','RETEN DELANTERO','CAT-REPUESTO'),
		('SUS1083','RODAMIENTO DELANTERO','CAT-REPUESTO'),
		('SUS1084','RETEN POSTERIOR INFERIOR EX8','CAT-REPUESTO'),
		('SUS1085','RETEN INFERIOR DE BOCAMASA','CAT-REPUESTO'),
		('SUS1086','AMORTIGUADOR PORTERIOR','CAT-REPUESTO'),
		('SUS1087','FAJA DE MOTOR','CAT-REPUESTO'),
		('SUS1088','CORREA DE ACCESORIOS DE AIRE ACONDICIONADO','CAT-REPUESTO'),
		('SUM1001','WD_40 AFLOJATODO','CAT-SUMINISTRO'),
		('SUM1002','SELLADOR - SUPER SEÑAL','CAT-SUMINISTRO'),
		('SUM1003','PEGAMENTO - VIPAL','CAT-SUMINISTRO'),
		('SUM1004','LIJA N°80','CAT-SUMINISTRO'),
		('SUM1005','CIRCULINA  AZUL','CAT-SUMINISTRO'),
		('SUM1006','FARO NEBLINERO AMARILLO','CAT-SUMINISTRO'),
		('SUM1007','CLAXON CARACOL 24V','CAT-SUMINISTRO'),
		('SUM1008','FOCO 21/5W 24V','CAT-SUMINISTRO'),
		('SUM1009','FOCO H4 24V','CAT-SUMINISTRO'),
		('SUM1010','FOCO H4 12V','CAT-SUMINISTRO'),
		('SUM1011','FOCO 67 PARA SALÓN','CAT-SUMINISTRO'),
		('SUM1012','FARO PIRATA','CAT-SUMINISTRO'),
		('SUM1013','ALARMA DE RETROCESO 12-24V','CAT-SUMINISTRO'),
		('SUM1014','FARO LATERAL CASTILLO','CAT-SUMINISTRO'),
		('SUM1017','PORTA RELAY','CAT-SUMINISTRO'),
		('SUM1018','PORTAFUSIBLE','CAT-SUMINISTRO'),
		('SUM1019','RELAY DE 24V','CAT-SUMINISTRO'),
		('SUM1020','SILICONA DE MÉCANICO','CAT-SUMINISTRO'),
		('SUM1021','FUSIBLE DE 15 AMPERIOS','CAT-SUMINISTRO'),
		('SUM1022','FUSIBLE DE 20 AMPERIOS','CAT-SUMINISTRO'),
		('SUM1023','FUSIBLE DE 10 AMPERIOS','CAT-SUMINISTRO'),
		('SUM1024','MINI FUSIBLE DE 5 AMPERIOS','CAT-SUMINISTRO'),
		('SUM1025','MINIFUSIBLE DE 20 AMPERIOS','CAT-SUMINISTRO'),
		('SUM1026','MINI FUSIBLE DE 30 AMPERIOS','CAT-SUMINISTRO'),
		('SUM1027','BATERIA USADA','CAT-SUMINISTRO'),
		('SUM1028','TAMPONES PARA DESFOGUE DE MOTOR','CAT-SUMINISTRO'),
		('SUM1029','JEBE DE PISO DE CISTERNA','CAT-SUMINISTRO'),
		('SUM1030','FORRO MANUBRIO','CAT-SUMINISTRO'),
		('SUM1031','FOCOS PIRATAS EX8','CAT-SUMINISTRO'),
		('SUM1032','TENSOR DE CARGA','CAT-SUMINISTRO'),
		('SUM1033','ATOMIZADORES','CAT-SUMINISTRO'),
		('SUM1034','BOTELLA DE SILICONA','CAT-SUMINISTRO'),
		('SUM1035','TRABATUERCAS JUEGOS','CAT-SUMINISTRO'),
		('SUM1036','CIRCULINA AMBAR','CAT-SUMINISTRO'),
		('SUM1037','FARO PARA PLACAS EX8','CAT-SUMINISTRO'),
		('SUM1038','BOQUILLA PARA ENGRASE','CAT-SUMINISTRO'),
		('SUM1039','FITTING DE ENGRASE','CAT-SUMINISTRO'),
		('SUM1040','NIVEL DE GRUA ( TIPO SCTIKER)','CAT-SUMINISTRO'),
		('SUM1041','FOCO DE 1 SOLO FILAMENTO','CAT-SUMINISTRO'),
		('SUM1042','FOCO DE DOBLE FILAMENTO','CAT-SUMINISTRO'),
		('SUM1043','FOCO H1 24V','CAT-SUMINISTRO'),
		('SUM1044','SOLDIMEC DE 24 HORAS','CAT-SUMINISTRO'),
		('SUM1046','PERNOS CENTRALES EX8 GRUA','CAT-SUMINISTRO'),
		('SUM1048','FUNDA DE MOTOR COUNTY','CAT-SUMINISTRO'),
		('SUM1049','ESCOBILLONES','CAT-SUMINISTRO'),
		('SUM1050','TRAPOS PARA SALON','CAT-SUMINISTRO'),
		('SUM1051','FOCO 24V H3 70W (48700)','CAT-SUMINISTRO'),
		('SUM1052','FARO LATERAL REDONDO CHIC','CAT-SUMINISTRO'),
		('SUM1053','MANGUERA DE 15 MTS PARA GRUA','CAT-SUMINISTRO'),
		('SUM1054','UNION RAPIDA M6','CAT-SUMINISTRO'),
		('SUM1055','NIPLE UNION BRONCE','CAT-SUMINISTRO'),
		('SUM1056','P CONO GUIA X JUEGO','CAT-SUMINISTRO'),
		('SUM1057','CLAXON CARACOL 12V EX8','CAT-SUMINISTRO'),
		('SUM1058','PORTA FILTRO EX8 GRUA','CAT-SUMINISTRO'),
		('SUM1059','PORTA FUSIBLE','CAT-SUMINISTRO'),
		('SUM1060','CABLE VULCANIZADO AUTOMOTRIZ METROS','CAT-SUMINISTRO'),
		('SUM1061','JUEGO DE CHUPETINES ( 5 PIEZAS CADA UNO )','CAT-SUMINISTRO'),
		('SUM1062','CORTACORRIENTE 12V 24V UN','CAT-SUMINISTRO'),
		('SUM1063','FOCO 12V 67 5W (17171)','CAT-SUMINISTRO'),
		('SUM1064','RODILLO PARA CARRETE LUBERWORK CISTERNA KIT','CAT-SUMINISTRO'),
		('SUM1065','VALVULAS DE GRUA','CAT-SUMINISTRO'),
		('SUM1066','LIMPIA CONTACTO','CAT-SUMINISTRO'),
		('SUM1067','RELAY DE 12V','CAT-SUMINISTRO')
)
INSERT INTO "inv"."T_Producto"
	("Sku","Nombre","IdCategoria","IdUnidadMedida","UsuarioCreacion","UsuarioModificacion","IdMigracion")
SELECT
	D."Sku"
	,D."Nombre"
	,C."Id"
	,U."Id"
	,'ETL'
	,'ETL'
	,gen_random_uuid()
FROM
	"Datos" D
INNER JOIN "inv"."T_Categoria" C ON C."Codigo" = D."CodigoCategoria"
CROSS JOIN (SELECT "Id" FROM "inv"."T_UnidadMedida" WHERE "Codigo" = 'UND') U
ON CONFLICT ("Sku") DO NOTHING;


/* ===================== migrations/0027_importar_productos.sql ===================== */
CREATE OR REPLACE FUNCTION "inv"."FnImportarProductos"
(
	"PLote" JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
	"vModo"        TEXT;
	"vUsuario"     VARCHAR(50);
	"vFilas"       JSONB;
	"vFila"        JSONB;
	"vErrores"     JSONB := '[]'::JSONB;
	"vOps"         JSONB := '[]'::JSONB;
	"vSkusVistos"  TEXT[] := ARRAY[]::TEXT[];
	"vNumFila"     INT;
	"vSku"         TEXT;
	"vNombre"      TEXT;
	"vCodCat"      TEXT;
	"vCodUni"      TEXT;
	"vEsGeneral"   BOOLEAN;
	"vTipos"       JSONB;
	"vCantTipos"   INT;
	"vStockMin"    NUMERIC;
	"vIdCategoria" UUID;
	"vIdUnidad"    UUID;
	"vIdProducto"  UUID;
	"vIdsTipos"    UUID[];
	"vCodTipo"     TEXT;
	"vIdTipo"      UUID;
	"vCodsFaltan"  TEXT[];
	"vCreados"     INT := 0;
	"vActualiza"   INT := 0;
	"vErrorFila"   BOOLEAN;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');
	"vModo"    = LOWER(COALESCE("PLote"->>'Modo', 'crear'));
	IF "vModo" NOT IN ('crear', 'upsert') THEN
		RAISE EXCEPTION 'Modo invalido: % (use crear o upsert).', "vModo";
	END IF;

	"vFilas" = COALESCE("PLote"->'Filas', '[]'::JSONB);

	FOR "vFila" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("vFilas")
	LOOP
		"vErrorFila" = FALSE;
		"vNumFila"   = COALESCE(NULLIF("vFila"->>'Fila','')::INT, 0);
		"vSku"       = NULLIF(TRIM("vFila"->>'Sku'), '');
		"vNombre"    = NULLIF(TRIM("vFila"->>'Nombre'), '');
		"vCodCat"    = NULLIF(TRIM("vFila"->>'CodigoCategoria'), '');
		"vCodUni"    = NULLIF(TRIM("vFila"->>'CodigoUnidad'), '');
		"vEsGeneral" = COALESCE(("vFila"->>'EsGeneral')::BOOLEAN, FALSE);
		"vTipos"     = COALESCE("vFila"->'TiposEquipo', '[]'::JSONB);
		"vCantTipos" = JSONB_ARRAY_LENGTH("vTipos");
		"vIdCategoria" = NULL;
		"vIdUnidad"    = NULL;
		"vIdProducto"  = NULL;
		"vIdsTipos"    = ARRAY[]::UUID[];

		IF "vSku" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','CAMPO_REQUERIDO','error','El Sku es obligatorio.');
			"vErrorFila" = TRUE;
		END IF;
		IF "vNombre" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Nombre','codigo','CAMPO_REQUERIDO','error','El Nombre es obligatorio.');
			"vErrorFila" = TRUE;
		END IF;

		BEGIN
			"vStockMin" = COALESCE(NULLIF("vFila"->>'StockMinimo','')::NUMERIC, 0);
			IF "vStockMin" < 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','StockMinimo','codigo','CAMPO_INVALIDO','error','StockMinimo no puede ser negativo.');
				"vErrorFila" = TRUE;
			END IF;
		EXCEPTION WHEN others THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','StockMinimo','codigo','CAMPO_INVALIDO','error','StockMinimo debe ser numerico.');
			"vErrorFila" = TRUE;
			"vStockMin" = 0;
		END;

		IF "vCodCat" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoCategoria','codigo','CAMPO_REQUERIDO','error','El CodigoCategoria es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdCategoria" FROM "inv"."T_Categoria" WHERE "Codigo" = "vCodCat" AND "Estado" = TRUE;
			IF "vIdCategoria" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoCategoria','codigo','CATEGORIA_NO_EXISTE','error',FORMAT('La categoria "%s" no existe.', "vCodCat"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF "vCodUni" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUnidad','codigo','CAMPO_REQUERIDO','error','El CodigoUnidad es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdUnidad" FROM "inv"."T_UnidadMedida" WHERE "Codigo" = "vCodUni" AND "Estado" = TRUE;
			IF "vIdUnidad" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUnidad','codigo','UNIDAD_NO_EXISTE','error',FORMAT('La unidad "%s" no existe.', "vCodUni"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF "vEsGeneral" AND "vCantTipos" > 0 THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','EsGeneral','codigo','INVARIANTE_GENERAL','error','Un producto general no lleva tipos de equipo.');
			"vErrorFila" = TRUE;
		ELSIF NOT "vEsGeneral" AND "vCantTipos" = 0 THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','TiposEquipo','codigo','INVARIANTE_GENERAL','error','Indique al menos un tipo de equipo o marque EsGeneral.');
			"vErrorFila" = TRUE;
		END IF;

		IF NOT "vEsGeneral" AND "vCantTipos" > 0 THEN
			"vCodsFaltan" = ARRAY[]::TEXT[];
			FOR "vCodTipo" IN SELECT JSONB_ARRAY_ELEMENTS_TEXT("vTipos")
			LOOP
				"vCodTipo" = TRIM("vCodTipo");
				SELECT "Id" INTO "vIdTipo" FROM "inv"."T_TipoEquipo" WHERE "Codigo" = "vCodTipo" AND "Estado" = TRUE;
				IF "vIdTipo" IS NULL THEN
					"vCodsFaltan" = "vCodsFaltan" || "vCodTipo";
				ELSE
					"vIdsTipos" = "vIdsTipos" || "vIdTipo";
				END IF;
			END LOOP;
			IF ARRAY_LENGTH("vCodsFaltan", 1) > 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','TiposEquipo','codigo','TIPO_EQUIPO_NO_EXISTE','error',FORMAT('Tipos de equipo inexistentes: %s', ARRAY_TO_STRING("vCodsFaltan", ', ')));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF "vSku" IS NOT NULL THEN
			IF "vSku" = ANY("vSkusVistos") THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_DUPLICADO','error',FORMAT('El Sku "%s" esta repetido en el archivo.', "vSku"));
				"vErrorFila" = TRUE;
			ELSE
				"vSkusVistos" = "vSkusVistos" || "vSku";
			END IF;

			SELECT "Id" INTO "vIdProducto" FROM "inv"."T_Producto" WHERE "Sku" = "vSku";
			IF "vIdProducto" IS NOT NULL AND "vModo" = 'crear' THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_DUPLICADO','error',FORMAT('El Sku "%s" ya existe (modo crear).', "vSku"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF NOT "vErrorFila" THEN
			"vOps" = "vOps" || JSONB_BUILD_OBJECT(
				'idProducto', "vIdProducto",
				'sku', "vSku",
				'nombre', "vNombre",
				'idCategoria', "vIdCategoria",
				'idUnidad', "vIdUnidad",
				'esGeneral', "vEsGeneral",
				'idsTipos', TO_JSONB("vIdsTipos"),
				'stockMin', "vStockMin",
				'codigoBarra', NULLIF(TRIM("vFila"->>'CodigoBarra'), ''),
				'codigoProv', NULLIF(TRIM("vFila"->>'CodigoProductoProveedor'), '')
			);
		END IF;
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vErrores") > 0 THEN
		RETURN JSONB_BUILD_OBJECT(
			'cantidadFilas',    JSONB_ARRAY_LENGTH("vFilas"),
			'cantidadCorrectas',0,
			'cantidadErrores',  JSONB_ARRAY_LENGTH("vErrores"),
			'creados',          0,
			'actualizados',     0,
			'errores',          "vErrores"
		);
	END IF;

	FOR "vFila" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("vOps")
	LOOP
		"vSku"         = "vFila"->>'sku';
		"vIdProducto"  = NULLIF("vFila"->>'idProducto','')::UUID;
		"vEsGeneral"   = ("vFila"->>'esGeneral')::BOOLEAN;
		"vIdsTipos"    = ARRAY(SELECT JSONB_ARRAY_ELEMENTS_TEXT("vFila"->'idsTipos'))::UUID[];

		IF "vIdProducto" IS NULL THEN
			INSERT INTO "inv"."T_Producto"
			(
				"Sku","Nombre","IdCategoria","IdUnidadMedida","StockMinimo",
				"CodigoBarra","CodigoProductoProveedor","EsGeneral",
				"UsuarioCreacion","UsuarioModificacion"
			)
			VALUES
			(
				"vSku",
				"vFila"->>'nombre',
				("vFila"->>'idCategoria')::UUID,
				("vFila"->>'idUnidad')::UUID,
				COALESCE(("vFila"->>'stockMin')::NUMERIC, 0),
				NULLIF("vFila"->>'codigoBarra',''),
				NULLIF("vFila"->>'codigoProv',''),
				"vEsGeneral",
				"vUsuario","vUsuario"
			)
			RETURNING "Id" INTO "vIdProducto";
			"vCreados" = "vCreados" + 1;
		ELSE
			UPDATE "inv"."T_Producto"
			SET "Nombre"                  = "vFila"->>'nombre',
				"IdCategoria"             = ("vFila"->>'idCategoria')::UUID,
				"IdUnidadMedida"          = ("vFila"->>'idUnidad')::UUID,
				"StockMinimo"             = COALESCE(("vFila"->>'stockMin')::NUMERIC, "StockMinimo"),
				"CodigoBarra"             = NULLIF("vFila"->>'codigoBarra',''),
				"CodigoProductoProveedor" = NULLIF("vFila"->>'codigoProv',''),
				"EsGeneral"               = "vEsGeneral",
				"UsuarioModificacion"     = "vUsuario"
			WHERE "Id" = "vIdProducto";
			"vActualiza" = "vActualiza" + 1;
		END IF;

		DELETE FROM "inv"."T_ProductoTipoEquipo" WHERE "IdProducto" = "vIdProducto";
		IF NOT "vEsGeneral" THEN
			INSERT INTO "inv"."T_ProductoTipoEquipo"
				("IdProducto","IdTipoEquipo","UsuarioCreacion","UsuarioModificacion")
			SELECT "vIdProducto", t.elem, "vUsuario", "vUsuario"
			FROM UNNEST("vIdsTipos") AS t(elem);
		END IF;
	END LOOP;

	RETURN JSONB_BUILD_OBJECT(
		'cantidadFilas',    JSONB_ARRAY_LENGTH("vFilas"),
		'cantidadCorrectas',"vCreados" + "vActualiza",
		'cantidadErrores',  0,
		'creados',          "vCreados",
		'actualizados',     "vActualiza",
		'errores',          '[]'::JSONB
	);
END;
$$;

COMMENT ON FUNCTION "inv"."FnImportarProductos"(JSONB) IS 'Importacion masiva de productos desde JSON con codigos naturales. Valida todo-o-nada, resuelve categoria/unidad/tipos, aplica invariante general XOR tipos, modo crear|upsert. Devuelve reporte con errores por fila.';


/* ===================== migrations/0028_importar_saldos.sql ===================== */
ALTER TABLE "inv"."T_Importacion"
	DROP CONSTRAINT IF EXISTS "CHK_T_Importacion_Objetivo_Permitido";
ALTER TABLE "inv"."T_Importacion"
	ADD CONSTRAINT "CHK_T_Importacion_Objetivo_Permitido"
	CHECK ("Objetivo" IN ('productos','movimientos','saldos_iniciales'));

CREATE OR REPLACE FUNCTION "inv"."FnImportarSaldosIniciales"
(
	"PLote" JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
	"vModo"       TEXT;
	"vFecha"      DATE;
	"vFilas"      JSONB;
	"vFila"       JSONB;
	"vErrores"    JSONB := '[]'::JSONB;
	"vOps"        JSONB := '[]'::JSONB;
	"vParesVistos" TEXT[] := ARRAY[]::TEXT[];
	"vNumFila"    INT;
	"vCodUbic"    TEXT;
	"vSku"        TEXT;
	"vCantidad"   NUMERIC;
	"vCosto"      NUMERIC;
	"vIdUbic"     UUID;
	"vIdProd"     UUID;
	"vSaldoAct"   NUMERIC;
	"vDiff"       NUMERIC;
	"vErrorFila"  BOOLEAN;
	"vPar"        TEXT;
	"vCreados"    INT := 0;
	"vLineas"     INT := 0;
	"vCorrectas"  INT := 0;
	"vIdUbicLoop" UUID;
	"vDetalle"    JSONB;
	"vDoc"        JSONB;
BEGIN
	"vModo"  = LOWER(COALESCE("PLote"->>'Modo', 'inicial'));
	IF "vModo" NOT IN ('inicial', 'recuento') THEN
		RAISE EXCEPTION 'Modo invalido: % (use inicial o recuento).', "vModo";
	END IF;

	BEGIN
		"vFecha" = ("PLote"->>'FechaDocumento')::DATE;
	EXCEPTION WHEN others THEN
		RAISE EXCEPTION 'FechaDocumento invalida o ausente (formato YYYY-MM-DD).';
	END;
	IF "vFecha" IS NULL THEN
		RAISE EXCEPTION 'FechaDocumento es obligatoria.';
	END IF;

	"vFilas" = COALESCE("PLote"->'Filas', '[]'::JSONB);

	FOR "vFila" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("vFilas")
	LOOP
		"vErrorFila" = FALSE;
		"vNumFila"   = COALESCE(NULLIF("vFila"->>'Fila','')::INT, 0);
		"vCodUbic"   = NULLIF(TRIM("vFila"->>'CodigoUbicacion'), '');
		"vSku"       = NULLIF(TRIM("vFila"->>'Sku'), '');
		"vIdUbic"    = NULL;
		"vIdProd"    = NULL;
		"vCosto"     = NULL;

		BEGIN
			"vCantidad" = NULLIF("vFila"->>'Cantidad','')::NUMERIC;
		EXCEPTION WHEN others THEN
			"vCantidad" = NULL;
		END;
		IF "vCantidad" IS NULL OR "vCantidad" <= 0 THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Cantidad','codigo','CANTIDAD_INVALIDA','error','La cantidad debe ser un numero mayor a 0.');
			"vErrorFila" = TRUE;
		END IF;

		IF NULLIF("vFila"->>'CostoUnitario','') IS NOT NULL THEN
			BEGIN
				"vCosto" = ("vFila"->>'CostoUnitario')::NUMERIC;
			EXCEPTION WHEN others THEN
				"vCosto" = NULL;
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CostoUnitario','codigo','COSTO_INVALIDO','error','El costo unitario debe ser numerico.');
				"vErrorFila" = TRUE;
			END;
			IF "vCosto" IS NOT NULL AND "vCosto" < 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CostoUnitario','codigo','COSTO_INVALIDO','error','El costo unitario no puede ser negativo.');
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF "vCodUbic" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUbicacion','codigo','CAMPO_REQUERIDO','error','El CodigoUbicacion es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdUbic" FROM "inv"."T_Ubicacion" WHERE "Codigo" = "vCodUbic";
			IF "vIdUbic" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUbicacion','codigo','UBICACION_NO_EXISTE','error',FORMAT('La ubicacion "%s" no existe.', "vCodUbic"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF "vSku" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','CAMPO_REQUERIDO','error','El Sku es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdProd" FROM "inv"."T_Producto" WHERE "Sku" = "vSku" AND "Estado" = TRUE;
			IF "vIdProd" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_NO_EXISTE','error',FORMAT('El Sku "%s" no existe en el catalogo.', "vSku"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF "vIdUbic" IS NOT NULL AND "vIdProd" IS NOT NULL THEN
			"vPar" = "vIdUbic"::TEXT || '|' || "vIdProd"::TEXT;
			IF "vPar" = ANY("vParesVistos") THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','DUPLICADO','error',FORMAT('El producto "%s" esta repetido para la ubicacion "%s".', "vSku", "vCodUbic"));
				"vErrorFila" = TRUE;
			ELSE
				"vParesVistos" = "vParesVistos" || "vPar";
			END IF;

			SELECT COALESCE("CantidadDisponible", 0) INTO "vSaldoAct"
			FROM "inv"."T_SaldoStock"
			WHERE "IdProducto" = "vIdProd" AND "IdUbicacion" = "vIdUbic";
			"vSaldoAct" = COALESCE("vSaldoAct", 0);

			IF "vModo" = 'inicial' AND "vSaldoAct" <> 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Cantidad','codigo','SALDO_YA_EXISTE','error',FORMAT('El producto "%s" ya tiene saldo (%s) en "%s". Use modo recuento para ajustar.', "vSku", "vSaldoAct", "vCodUbic"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF NOT "vErrorFila" THEN
			"vDiff" = CASE WHEN "vModo" = 'recuento' THEN "vCantidad" - "vSaldoAct" ELSE "vCantidad" END;
			"vOps" = "vOps" || JSONB_BUILD_OBJECT(
				'idUbic', "vIdUbic", 'idProd', "vIdProd",
				'cantidad', "vCantidad", 'diff', "vDiff", 'costo', "vCosto"
			);
		END IF;
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vErrores") > 0 THEN
		RETURN JSONB_BUILD_OBJECT(
			'cantidadFilas', JSONB_ARRAY_LENGTH("vFilas"),
			'cantidadCorrectas', 0, 'cantidadErrores', JSONB_ARRAY_LENGTH("vErrores"),
			'creados', 0, 'actualizados', 0, 'errores', "vErrores"
		);
	END IF;

	"vCorrectas" = JSONB_ARRAY_LENGTH("vOps");

	IF "vModo" = 'inicial' THEN
		FOR "vIdUbicLoop" IN SELECT DISTINCT (op->>'idUbic')::UUID FROM JSONB_ARRAY_ELEMENTS("vOps") op
		LOOP
			"vDetalle" = (
				SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
					'IdProducto', op->>'idProd', 'Cantidad', (op->>'cantidad')::NUMERIC, 'CostoUnitario', op->>'costo'))
				FROM JSONB_ARRAY_ELEMENTS("vOps") op WHERE (op->>'idUbic')::UUID = "vIdUbicLoop"
			);
			"vDoc" = JSONB_BUILD_OBJECT(
				'TipoDocumento', 'existencia_inicial', 'FechaDocumento', "vFecha"::TEXT,
				'IdUbicacionDestino', "vIdUbicLoop"::TEXT, 'Notas', 'Importacion de existencia inicial', 'Detalle', "vDetalle");
			PERFORM "inv"."FnRegistrarDocumentoInventario"("vDoc");
			"vCreados" = "vCreados" + 1;
			"vLineas"  = "vLineas" + JSONB_ARRAY_LENGTH("vDetalle");
		END LOOP;
	ELSE
		FOR "vIdUbicLoop" IN SELECT DISTINCT (op->>'idUbic')::UUID FROM JSONB_ARRAY_ELEMENTS("vOps") op
		LOOP
			"vDetalle" = (
				SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
					'IdProducto', op->>'idProd', 'Cantidad', (op->>'diff')::NUMERIC, 'CostoUnitario', op->>'costo'))
				FROM JSONB_ARRAY_ELEMENTS("vOps") op
				WHERE (op->>'idUbic')::UUID = "vIdUbicLoop" AND (op->>'diff')::NUMERIC > 0
			);
			IF "vDetalle" IS NOT NULL THEN
				"vDoc" = JSONB_BUILD_OBJECT(
					'TipoDocumento', 'ajuste', 'FechaDocumento', "vFecha"::TEXT,
					'IdUbicacionDestino', "vIdUbicLoop"::TEXT, 'Notas', 'Ajuste por recuento (entrada)', 'Detalle', "vDetalle");
				PERFORM "inv"."FnRegistrarDocumentoInventario"("vDoc");
				"vCreados" = "vCreados" + 1;
				"vLineas"  = "vLineas" + JSONB_ARRAY_LENGTH("vDetalle");
			END IF;

			"vDetalle" = (
				SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
					'IdProducto', op->>'idProd', 'Cantidad', (-1 * (op->>'diff')::NUMERIC)))
				FROM JSONB_ARRAY_ELEMENTS("vOps") op
				WHERE (op->>'idUbic')::UUID = "vIdUbicLoop" AND (op->>'diff')::NUMERIC < 0
			);
			IF "vDetalle" IS NOT NULL THEN
				"vDoc" = JSONB_BUILD_OBJECT(
					'TipoDocumento', 'ajuste', 'FechaDocumento', "vFecha"::TEXT,
					'IdUbicacionOrigen', "vIdUbicLoop"::TEXT, 'Notas', 'Ajuste por recuento (salida)', 'Detalle', "vDetalle");
				PERFORM "inv"."FnRegistrarDocumentoInventario"("vDoc");
				"vCreados" = "vCreados" + 1;
				"vLineas"  = "vLineas" + JSONB_ARRAY_LENGTH("vDetalle");
			END IF;
		END LOOP;
	END IF;

	RETURN JSONB_BUILD_OBJECT(
		'cantidadFilas', JSONB_ARRAY_LENGTH("vFilas"),
		'cantidadCorrectas', "vCorrectas", 'cantidadErrores', 0,
		'creados', "vCreados", 'actualizados', "vLineas", 'errores', '[]'::JSONB
	);
END;
$$;

COMMENT ON FUNCTION "inv"."FnImportarSaldosIniciales"(JSONB) IS 'Carga masiva de saldos desde JSON. Modo inicial (existencia_inicial) o recuento (ajuste por diferencia). No escribe T_SaldoStock directo: genera documentos y reusa el ledger. Todo-o-nada, errores por fila.';


/* ===================== migrations/0029_proveedor_cuentas_bancarias.sql ===================== */
CREATE TABLE "inv"."T_ProveedorCuentaBancaria"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdProveedor"         UUID         NOT NULL,
	"Banco"               VARCHAR(80)  NOT NULL,
	"TipoCuenta"          VARCHAR(15)  NOT NULL DEFAULT 'corriente',
	"NumeroCuenta"        VARCHAR(40)  NOT NULL,
	"Cci"                 VARCHAR(25),
	"Moneda"              VARCHAR(3)   NOT NULL DEFAULT 'PEN',
	"TitularCuenta"       VARCHAR(150),
	"EsPrincipal"         BOOLEAN      NOT NULL DEFAULT FALSE,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_ProveedorCuentaBancaria" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_ProveedorCuentaBancaria_Proveedor_IdProveedor"
		FOREIGN KEY ("IdProveedor") REFERENCES "inv"."T_Proveedor" ("Id") ON DELETE CASCADE,
	CONSTRAINT "CHK_T_ProveedorCuentaBancaria_TipoCuenta_Permitido"
		CHECK ("TipoCuenta" IN ('corriente','ahorros')),
	CONSTRAINT "CHK_T_ProveedorCuentaBancaria_Moneda_Permitida"
		CHECK ("Moneda" IN ('PEN','USD'))
);

COMMENT ON TABLE "inv"."T_ProveedorCuentaBancaria" IS 'Cuentas bancarias del proveedor (1:N): banco, tipo, numero, CCI, moneda.';

CREATE INDEX "IX_T_ProveedorCuentaBancaria_IdProveedor" ON "inv"."T_ProveedorCuentaBancaria" ("IdProveedor");

CREATE TRIGGER "TR_T_ProveedorCuentaBancaria_Auditoria"
	BEFORE UPDATE ON "inv"."T_ProveedorCuentaBancaria"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_ProveedorCuentaBancaria" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_ProveedorCuentaBancaria"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "ProveedorCuentaEscritura" ON "inv"."T_ProveedorCuentaBancaria"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

CREATE OR REPLACE FUNCTION "inv"."FnGuardarProveedor"
(
	"PProveedor" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"      UUID;
	"vUsuario" VARCHAR(50);
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');
	"vId"      = NULLIF("PProveedor"->>'Id', '')::UUID;

	IF "vId" IS NULL THEN
		INSERT INTO "inv"."T_Proveedor"
			("Ruc","Nombre","Contacto","Telefono","UsuarioCreacion","UsuarioModificacion")
		VALUES
		(
			NULLIF("PProveedor"->>'Ruc', ''),
			"PProveedor"->>'Nombre',
			NULLIF("PProveedor"->>'Contacto', ''),
			NULLIF("PProveedor"->>'Telefono', ''),
			"vUsuario", "vUsuario"
		)
		RETURNING "Id" INTO "vId";
	ELSE
		UPDATE "inv"."T_Proveedor"
		SET "Ruc"                 = NULLIF("PProveedor"->>'Ruc', ''),
			"Nombre"              = "PProveedor"->>'Nombre',
			"Contacto"            = NULLIF("PProveedor"->>'Contacto', ''),
			"Telefono"            = NULLIF("PProveedor"->>'Telefono', ''),
			"UsuarioModificacion" = "vUsuario"
		WHERE "Id" = "vId";

		IF NOT FOUND THEN
			RAISE EXCEPTION 'El proveedor no existe.';
		END IF;
	END IF;

	DELETE FROM "inv"."T_ProveedorCuentaBancaria" WHERE "IdProveedor" = "vId";

	INSERT INTO "inv"."T_ProveedorCuentaBancaria"
		("IdProveedor","Banco","TipoCuenta","NumeroCuenta","Cci","Moneda","TitularCuenta","EsPrincipal","UsuarioCreacion","UsuarioModificacion")
	SELECT
		"vId",
		TRIM(c->>'Banco'),
		COALESCE(NULLIF(c->>'TipoCuenta',''), 'corriente'),
		TRIM(c->>'NumeroCuenta'),
		NULLIF(TRIM(c->>'Cci'), ''),
		COALESCE(NULLIF(c->>'Moneda',''), 'PEN'),
		NULLIF(TRIM(c->>'TitularCuenta'), ''),
		COALESCE((c->>'EsPrincipal')::BOOLEAN, FALSE),
		"vUsuario", "vUsuario"
	FROM JSONB_ARRAY_ELEMENTS(COALESCE("PProveedor"->'Cuentas', '[]'::JSONB)) AS c
	WHERE NULLIF(TRIM(c->>'Banco'), '') IS NOT NULL
	   OR NULLIF(TRIM(c->>'NumeroCuenta'), '') IS NOT NULL;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnGuardarProveedor"(JSONB) IS 'Crea (sin Id) o edita (con Id) un proveedor y reemplaza sus cuentas bancarias en una transaccion.';

CREATE OR REPLACE VIEW "inv"."V_Proveedor" AS
SELECT
	p."Id",
	p."Ruc",
	p."Nombre",
	p."Contacto",
	p."Telefono",
	p."Estado",
	COALESCE(
		(
			SELECT JSONB_AGG(
				JSONB_BUILD_OBJECT(
					'Id', c."Id",
					'Banco', c."Banco",
					'TipoCuenta', c."TipoCuenta",
					'NumeroCuenta', c."NumeroCuenta",
					'Cci', c."Cci",
					'Moneda', c."Moneda",
					'TitularCuenta', c."TitularCuenta",
					'EsPrincipal', c."EsPrincipal"
				)
				ORDER BY c."EsPrincipal" DESC, c."Banco"
			)
			FROM "inv"."T_ProveedorCuentaBancaria" c
			WHERE c."IdProveedor" = p."Id" AND c."Estado" = TRUE
		),
		'[]'::JSONB
	) AS "Cuentas"
FROM "inv"."T_Proveedor" p
WHERE p."Estado" = TRUE;

COMMENT ON VIEW "inv"."V_Proveedor" IS 'Proveedor activo con sus cuentas bancarias embebidas (arreglo JSON).';


COMMIT;
