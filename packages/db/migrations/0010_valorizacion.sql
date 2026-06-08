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
