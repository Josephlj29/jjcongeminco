/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnAplicarMovimientoSaldo (REPLACE)
	Tipo de Cambio: REPLACE - mensaje de stock insuficiente legible para el usuario
	Autor: Equipo Desarrollo
	Fecha: 2026-09-23
	Descripcion: El guard de no-negatividad (0019) rechazaba el egreso con los UUID
	             crudos del producto y de la ubicacion:

	               "Stock insuficiente: el movimiento dejaria el saldo en -3.000
	                (producto cde15d10-..., ubicacion d0e377ee-...)."

	             Ese texto viaja sin tocarse hasta el toast del navegador (ERRCODE
	             check_violation -> 409 en mapearErrorNegocio -> body.error -> toast),
	             y nadie en almacen sabe que producto es un UUID: sabe el nombre y el
	             SKU. Ahora dice que falta, donde y cuanto:

	               "Stock insuficiente de "Faro cuadrado multivoltaje" (FARO-003) en
	                Almacen Tambomayo: disponible 1, se intenta sacar 4 (faltan 3)."

	             Mismo criterio que ya usaba FnAtenderRequerimiento (0018), que arma
	             su faltante con el nombre del producto.

	             El lookup del catalogo va DENTRO del IF de error: el camino feliz
	             (cada INSERT del ledger) no paga dos SELECT extra, y cuando entra al
	             IF la transaccion ya esta condenada, asi que el costo da igual.

	             Cambia SOLO el texto: la regla, la direccion evaluada y el ERRCODE
	             siguen iguales. El ERRCODE check_violation es lo que mantiene la
	             respuesta en 409 (no 500), no se toca.
*/
CREATE OR REPLACE FUNCTION "inv"."FnAplicarMovimientoSaldo"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vNuevoSaldo" NUMERIC(14,3);
	"vNombre"     TEXT;
	"vSku"        TEXT;
	"vUbicacion"  TEXT;
	"vEtiqueta"   TEXT;
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
		SELECT P."Nombre", P."Sku" INTO "vNombre", "vSku"
		FROM "inv"."T_Producto" P
		WHERE P."Id" = NEW."IdProducto";

		SELECT U."Nombre" INTO "vUbicacion"
		FROM "inv"."T_Ubicacion" U
		WHERE U."Id" = NEW."IdUbicacion";

		/* Si el catalogo no resuelve (no deberia: hay FK), el UUID es mejor que
		   un hueco en el mensaje. */
		"vEtiqueta" = COALESCE(
			'"' || "vNombre" || '"' || COALESCE(' (' || "vSku" || ')', ''),
			'el producto ' || NEW."IdProducto"::TEXT
		);
		"vUbicacion" = COALESCE("vUbicacion", 'la ubicacion ' || NEW."IdUbicacion"::TEXT);

		/* trim_scale: NUMERIC(14,3) imprime "4.000"; al usuario se le muestra "4".
		   El saldo ya viene descontado, asi que el disponible previo es
		   vNuevoSaldo + Cantidad y el faltante es -vNuevoSaldo. */
		RAISE EXCEPTION 'Stock insuficiente de % en %: disponible %, se intenta sacar % (faltan %).',
			"vEtiqueta",
			"vUbicacion",
			trim_scale("vNuevoSaldo" + NEW."Cantidad"),
			trim_scale(NEW."Cantidad"),
			trim_scale(-"vNuevoSaldo")
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "inv"."FnAplicarMovimientoSaldo"() IS 'Trigger: actualiza el saldo cacheado por cada movimiento (upsert). Rechaza egresos que dejarian el saldo negativo (serializa salidas concurrentes via row-lock del upsert), nombrando producto (nombre + SKU), ubicacion, disponible y faltante. Los ingresos nunca se bloquean.';
