/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnHistorialPreciosProducto
	Tipo de Cambio: CREATE - historial de precios con remanente de stock (FIFO)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: Devuelve el historial de precios de un producto y, por cada compra
	             (lote), cuánto stock le queda asociado, calculado por FIFO de SOLO
	             LECTURA sobre el ledger: el stock actual lo respaldan los lotes más
	             RECIENTES (los más antiguos se consumen primero). NO cambia el método
	             de valorización (sigue siendo promedio móvil); sirve para que la UI
	             muestre todo el histórico pero solo permita ELEGIR como override un
	             precio cuyo lote todavía tiene stock (TieneStock = true).
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