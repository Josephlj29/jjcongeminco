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