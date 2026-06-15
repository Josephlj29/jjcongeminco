/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.V_Recambio_Producto (REPLACE)
	Tipo de Cambio: REPLACE VIEW - excluir requerimientos anulados del cálculo
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: Agrega "AND RQ.Situacion <> 'anulado'" al WHERE. Un consumo de
	             mantenimiento rechazado (con su entrada de reversa) deja el
	             requerimiento en 'anulado': no debe contar como un recambio real ni
	             distorsionar los intervalos (LAG). Corrige además el caso preexistente
	             de requerimientos anulados a mano que se colaban en el reporte.
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
		  AND RQ."Situacion" <> 'anulado'
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

COMMENT ON VIEW "inv"."V_Recambio_Producto" IS 'Recambios por equipo/placa × producto con intervalo (días) desde el recambio anterior. Excluye requerimientos anulados. Acelerado = desgaste_prematuro marcado o intervalo < 50% del promedio del par.';
