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
