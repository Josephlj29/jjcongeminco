/*
	Prueba de integración SQL — migraciones 0075 y 0076
	Objeto: seg.FnNombreUsuario, inv.V_MovimientoStock_Kardex, inv.V_Reporte_Movimiento

	0075 expone en las vistas CUÁNDO se cargó de verdad cada movimiento y QUIÉN lo
	hizo, contra la fecha contable del documento, que puede fecharse hacia atrás.
	0076 corrige el saldo corrido, que desempataba por el UUID del movimiento
	(aleatorio) y por eso con dos movimientos en la misma fecha contable el
	acumulado salía en cualquier orden.

	Cómo correrla (psql o el SQL editor de Supabase). Es de solo lectura salvo por
	el RAISE final, que además hace rollback:

		\i packages/db/tests/0075_0076_trazabilidad_y_saldo_corrido.sql

	Resultado esperado: "OK 0075/0076 ... (rollback de la prueba)".
*/
DO $$
DECLARE
	"vFallas"       TEXT[] := ARRAY[]::TEXT[];
	"vCol"          TEXT;
	"vDesordenados" BIGINT;
	"vNombre"       TEXT;
BEGIN
	/* ── 1. Las vistas exponen la trazabilidad ─────────────────────────── */
	FOREACH "vCol" IN ARRAY ARRAY['FechaRegistro','RegistradoPor'] LOOP
		IF NOT EXISTS (SELECT 1 FROM information_schema.columns
			WHERE table_schema='inv' AND table_name='V_MovimientoStock_Kardex' AND column_name="vCol") THEN
			"vFallas" = "vFallas" || FORMAT('1) El kardex no expone %s.', "vCol");
		END IF;
		IF NOT EXISTS (SELECT 1 FROM information_schema.columns
			WHERE table_schema='inv' AND table_name='V_Reporte_Movimiento' AND column_name="vCol") THEN
			"vFallas" = "vFallas" || FORMAT('1) El reporte de movimientos no expone %s.', "vCol");
		END IF;
	END LOOP;

	/* ── 2. FnNombreUsuario resuelve los cuatro casos ──────────────────── */
	SELECT "seg"."FnNombreUsuario"('API') INTO "vNombre";
	IF "vNombre" IS DISTINCT FROM 'API' THEN
		"vFallas" = "vFallas" || FORMAT('2) Un valor que no es uid debe salir tal cual, salió %s.', COALESCE("vNombre",'NULL'));
	END IF;

	SELECT "seg"."FnNombreUsuario"('11111111-2222-3333-4444-555555555555') INTO "vNombre";
	IF "vNombre" IS DISTINCT FROM '11111111-2222-3333-4444-555555555555' THEN
		"vFallas" = "vFallas" || '2) Un uid inexistente debe devolverse tal cual, no NULL.'::TEXT;
	END IF;

	IF "seg"."FnNombreUsuario"(NULL) IS NOT NULL OR "seg"."FnNombreUsuario"('') IS NOT NULL THEN
		"vFallas" = "vFallas" || '2) NULL y cadena vacía deben devolver NULL.'::TEXT;
	END IF;

	/* Un uid real tiene que resolver a un nombre distinto del uid. */
	SELECT "seg"."FnNombreUsuario"(U."Id"::VARCHAR) INTO "vNombre"
	FROM "seg"."T_Usuario" U WHERE U."Estado" LIMIT 1;
	IF "vNombre" IS NULL OR "vNombre" ~* '^[0-9a-f]{8}-' THEN
		"vFallas" = "vFallas" || '2) Un uid existente no resolvió a su NombreCompleto.'::TEXT;
	END IF;

	/* ── 3. El saldo corrido acumula en el orden en que se lee el kardex ─ */
	WITH esperado AS (
		SELECT k."IdMovimientoStock", k."SaldoCorrido",
		       SUM(k."CantidadConSigno") OVER (
		           PARTITION BY k."IdProducto", k."IdUbicacion"
		           ORDER BY k."FechaMovimiento", k."FechaRegistro", k."IdMovimientoStock"
		           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		       ) AS "SaldoEsperado"
		FROM "inv"."V_MovimientoStock_Kardex" k
	)
	SELECT count(*) INTO "vDesordenados" FROM esperado WHERE "SaldoCorrido" <> "SaldoEsperado";
	IF "vDesordenados" > 0 THEN
		"vFallas" = "vFallas" || FORMAT('3) %s movimientos tienen el saldo corrido fuera de orden.', "vDesordenados");
	END IF;

	IF ARRAY_LENGTH("vFallas", 1) > 0 THEN
		RAISE EXCEPTION E'FALLA 0075/0076:\n  - %', ARRAY_TO_STRING("vFallas", E'\n  - ');
	END IF;

	RAISE EXCEPTION 'OK 0075/0076: trazabilidad expuesta y saldo corrido en orden (rollback de la prueba)';
END $$;
