/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAplicarMovimientoSaldo (REPLACE)
	Tipo de Cambio: REPLACE - guard de no-negatividad en el ledger
	Autor: Equipo Desarrollo
	Fecha: 2026-06-13
	Descripcion: Ninguna salida puede dejar el saldo de un producto/ubicacion por
	             debajo de cero. Cierra el TOCTOU de sobre-giro entre movimientos
	             concurrentes: el upsert sobre T_SaldoStock toma row-lock, asi que
	             las salidas competidoras sobre el mismo saldo se serializan y la
	             segunda ve el saldo ya decrementado. Consciente de la direccion:
	             los INGRESOS (+1) nunca se bloquean (permiten corregir negativos
	             historicos); solo los EGRESOS (-1) que dejarian saldo negativo
	             fallan, con ERRCODE check_violation.
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
