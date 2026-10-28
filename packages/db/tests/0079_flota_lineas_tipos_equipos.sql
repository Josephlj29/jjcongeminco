/*
	Pruebas de integracion — migracion 0079
	(linea de flota como dato, tipos sin prefijo, camiones opcion A,
	 codigos de equipo normalizados y cadena tipo -> equipo -> placa obligatoria)

	Este escenario solo LEE: no escribe nada, asi que no necesita rollback.
	Falla con EXCEPTION en la primera asercion que no se cumpla.

		psql "$DATABASE_URL" -f packages/db/tests/0079_flota_lineas_tipos_equipos.sql

	Salida esperada en verde: un unico NOTICE "0079 OK".
*/
DO $$
DECLARE
	"vCant"       INTEGER;
	"vTexto"      TEXT;
	"vIdGrua"     UUID;
	"vIdCisterna" UUID;
	"vIdCamiones" UUID;
	"vIdLinea"    UUID;
	"vDeps"       JSONB;
BEGIN
	/* =============================================================
		1. La linea existe como DATO, no incrustada en el codigo
	============================================================= */
	IF TO_REGCLASS('inv."T_LineaEquipo"') IS NULL THEN
		RAISE EXCEPTION 'FALLA 1a: no existe la tabla inv.T_LineaEquipo';
	END IF;

	SELECT COUNT(*) INTO "vCant" FROM "inv"."T_LineaEquipo" WHERE "Estado";
	IF "vCant" <> 2 THEN
		RAISE EXCEPTION 'FALLA 1b: se esperaban 2 lineas activas (TRACKLESS, LIVIANA), hay %', "vCant";
	END IF;

	SELECT STRING_AGG("Codigo", ',' ORDER BY "Codigo") INTO "vTexto"
	FROM "inv"."T_LineaEquipo" WHERE "Estado";
	IF "vTexto" <> 'LIVIANA,TRACKLESS' THEN
		RAISE EXCEPTION 'FALLA 1c: codigos de linea inesperados: %', "vTexto";
	END IF;

	/* La columna tiene que ser obligatoria, no "nullable con suerte" */
	SELECT "is_nullable" INTO "vTexto"
	FROM "information_schema"."columns"
	WHERE "table_schema" = 'inv' AND "table_name" = 'T_TipoEquipo' AND "column_name" = 'IdLinea';
	IF "vTexto" IS NULL THEN
		RAISE EXCEPTION 'FALLA 1d: T_TipoEquipo no tiene la columna IdLinea';
	END IF;
	IF "vTexto" <> 'NO' THEN
		RAISE EXCEPTION 'FALLA 1e: T_TipoEquipo.IdLinea deberia ser NOT NULL, es %', "vTexto";
	END IF;

	/* =============================================================
		2. Tipos de equipo: sin prefijo de linea y con la linea correcta
	============================================================= */
	SELECT COUNT(*) INTO "vCant" FROM "inv"."T_TipoEquipo" WHERE "Estado" AND "Codigo" LIKE 'LIN%';
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 2a: quedan % tipos activos con el prefijo LIN en el codigo', "vCant";
	END IF;

	SELECT STRING_AGG("Codigo", ',' ORDER BY "Codigo") INTO "vTexto"
	FROM "inv"."T_TipoEquipo" WHERE "Estado";
	IF "vTexto" <> 'CAMION-CISTERNA,CAMION-GRUA,CAMIONETA,MINIBUS,MINICARGADOR,MOTONIVELADORA,TELEHANDLER' THEN
		RAISE EXCEPTION 'FALLA 2b: el juego de tipos activos no es el esperado: %', "vTexto";
	END IF;

	SELECT STRING_AGG(T."Codigo", ',' ORDER BY T."Codigo") INTO "vTexto"
	FROM "inv"."T_TipoEquipo" T
	JOIN "inv"."T_LineaEquipo" L ON L."Id" = T."IdLinea"
	WHERE T."Estado" AND L."Codigo" = 'TRACKLESS';
	IF "vTexto" <> 'MINICARGADOR,MOTONIVELADORA,TELEHANDLER' THEN
		RAISE EXCEPTION 'FALLA 2c: la linea TRACKLESS no agrupa los tipos esperados: %', "vTexto";
	END IF;

	SELECT STRING_AGG(T."Codigo", ',' ORDER BY T."Codigo") INTO "vTexto"
	FROM "inv"."T_TipoEquipo" T
	JOIN "inv"."T_LineaEquipo" L ON L."Id" = T."IdLinea"
	WHERE T."Estado" AND L."Codigo" = 'LIVIANA';
	IF "vTexto" <> 'CAMION-CISTERNA,CAMION-GRUA,CAMIONETA,MINIBUS' THEN
		RAISE EXCEPTION 'FALLA 2d: la linea LIVIANA no agrupa los tipos esperados: %', "vTexto";
	END IF;

	/* Los nombres que describian el USO pasaron a describir el TIPO */
	SELECT "Nombre" INTO "vTexto" FROM "inv"."T_TipoEquipo" WHERE "Codigo" = 'CAMIONETA' AND "Estado";
	IF "vTexto" <> 'Camioneta' THEN
		RAISE EXCEPTION 'FALLA 2e: CAMIONETA deberia llamarse "Camioneta", se llama "%"', "vTexto";
	END IF;
	SELECT "Nombre" INTO "vTexto" FROM "inv"."T_TipoEquipo" WHERE "Codigo" = 'MINIBUS' AND "Estado";
	IF "vTexto" <> 'Minibús' THEN
		RAISE EXCEPTION 'FALLA 2f: MINIBUS deberia llamarse "Minibús", se llama "%"', "vTexto";
	END IF;

	/* =============================================================
		3. Camiones, opcion A: grua y cisterna son tipos distintos
	============================================================= */
	SELECT "Id" INTO "vIdGrua"     FROM "inv"."T_TipoEquipo" WHERE "Codigo" = 'CAMION-GRUA'     AND "Estado";
	SELECT "Id" INTO "vIdCisterna" FROM "inv"."T_TipoEquipo" WHERE "Codigo" = 'CAMION-CISTERNA' AND "Estado";
	SELECT "Id" INTO "vIdCamiones" FROM "inv"."T_TipoEquipo" WHERE "Codigo" = 'LIN LIV - CAMIONES';

	IF "vIdCamiones" IS NULL THEN
		RAISE EXCEPTION 'FALLA 3a: se esperaba conservar LIN LIV - CAMIONES dado de baja, para la traza';
	END IF;
	IF (SELECT "Estado" FROM "inv"."T_TipoEquipo" WHERE "Id" = "vIdCamiones") THEN
		RAISE EXCEPTION 'FALLA 3b: LIN LIV - CAMIONES deberia estar dado de baja';
	END IF;

	/* Cada camion quedo en su tipo, segun su nombre y su placa */
	SELECT STRING_AGG(E."Codigo" || '/' || V."Placa", ',' ORDER BY E."Codigo") INTO "vTexto"
	FROM "inv"."T_Equipo" E
	JOIN "inv"."T_Vehiculo" V ON V."IdEquipo" = E."Id" AND V."Estado"
	WHERE E."Estado" AND E."IdTipoEquipo" = "vIdGrua";
	IF "vTexto" <> 'CAMION-01/VDS927' THEN
		RAISE EXCEPTION 'FALLA 3c: CAMION-GRUA deberia tener solo CAMION-01/VDS927, tiene: %', "vTexto";
	END IF;

	SELECT STRING_AGG(E."Codigo" || '/' || V."Placa", ',' ORDER BY E."Codigo") INTO "vTexto"
	FROM "inv"."T_Equipo" E
	JOIN "inv"."T_Vehiculo" V ON V."IdEquipo" = E."Id" AND V."Estado"
	WHERE E."Estado" AND E."IdTipoEquipo" = "vIdCisterna";
	IF "vTexto" <> 'CAMION-02/VCZ891' THEN
		RAISE EXCEPTION 'FALLA 3d: CAMION-CISTERNA deberia tener solo CAMION-02/VCZ891, tiene: %', "vTexto";
	END IF;

	/* El tipo de baja no puede quedarse con equipos */
	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Equipo" WHERE "Estado" AND "IdTipoEquipo" = "vIdCamiones";
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 3e: % equipos activos siguen colgados del tipo dado de baja', "vCant";
	END IF;

	/* Los productos del chasis quedaron compatibles con AMBOS camiones.
	   Antes eran los 147 de LIN LIV - CAMIONES; ninguno puede haberse perdido. */
	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_ProductoTipoEquipo" Ant
	JOIN "inv"."T_Producto" P ON P."Id" = Ant."IdProducto" AND P."Estado"
	WHERE Ant."IdTipoEquipo" = "vIdCamiones"
	  AND NOT EXISTS (
			SELECT 1 FROM "inv"."T_ProductoTipoEquipo" X
			WHERE X."IdProducto" = Ant."IdProducto" AND X."IdTipoEquipo" = "vIdGrua" AND X."Estado"
		);
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 3f: % productos del chasis no quedaron compatibles con CAMION-GRUA', "vCant";
	END IF;

	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_ProductoTipoEquipo" Ant
	JOIN "inv"."T_Producto" P ON P."Id" = Ant."IdProducto" AND P."Estado"
	WHERE Ant."IdTipoEquipo" = "vIdCamiones"
	  AND NOT EXISTS (
			SELECT 1 FROM "inv"."T_ProductoTipoEquipo" X
			WHERE X."IdProducto" = Ant."IdProducto" AND X."IdTipoEquipo" = "vIdCisterna" AND X."Estado"
		);
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 3g: % productos del chasis no quedaron compatibles con CAMION-CISTERNA', "vCant";
	END IF;

	/* Ninguna compatibilidad activa puede apuntar a un tipo dado de baja:
	   era justo el bug que escondia 13 productos de ninguna placa. */
	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_ProductoTipoEquipo" PTE
	JOIN "inv"."T_TipoEquipo" T ON T."Id" = PTE."IdTipoEquipo"
	WHERE PTE."Estado" AND NOT T."Estado";
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 3h: % compatibilidades activas apuntan a un tipo dado de baja', "vCant";
	END IF;

	/* Y ningun producto activo con compatibilidad declarada puede quedar invisible
	   para TODAS las placas (compatible solo con tipos sin equipos). */
	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Producto" P
	WHERE P."Estado"
	  AND EXISTS (SELECT 1 FROM "inv"."T_ProductoTipoEquipo" X WHERE X."IdProducto" = P."Id" AND X."Estado")
	  AND NOT EXISTS (
			SELECT 1
			FROM "inv"."T_ProductoTipoEquipo" X
			JOIN "inv"."T_TipoEquipo" T ON T."Id" = X."IdTipoEquipo" AND T."Estado"
			JOIN "inv"."T_Equipo" E ON E."IdTipoEquipo" = T."Id" AND E."Estado"
			WHERE X."IdProducto" = P."Id" AND X."Estado"
		);
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 3i: % productos activos no aparecen para ninguna placa', "vCant";
	END IF;

	/* =============================================================
		4. Equipos: codigo sin prefijo, numero a dos digitos, sin espacios
	============================================================= */
	SELECT STRING_AGG("Codigo", ',' ORDER BY "Codigo") INTO "vTexto"
	FROM "inv"."T_Equipo" WHERE "Estado";
	IF "vTexto" <> 'CAMION-01,CAMION-02,CAMIONETA-01,CAMIONETA-02,MINI-01,MINIBUS-01,MINIBUS-02,MOTO-01,TELE-01,TELE-02' THEN
		RAISE EXCEPTION 'FALLA 4a: el juego de codigos de equipo no es el esperado: %', "vTexto";
	END IF;

	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Equipo"
	WHERE "Estado" AND ("Codigo" <> TRIM("Codigo") OR "Nombre" <> TRIM("Nombre"));
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 4b: % equipos activos tienen espacios sobrantes en codigo o nombre', "vCant";
	END IF;

	/* =============================================================
		5. La cadena tipo -> equipo -> placa es obligatoria, no opcional
	============================================================= */
	SELECT "is_nullable" INTO "vTexto"
	FROM "information_schema"."columns"
	WHERE "table_schema" = 'inv' AND "table_name" = 'T_Equipo' AND "column_name" = 'IdTipoEquipo';
	IF "vTexto" <> 'NO' THEN
		RAISE EXCEPTION 'FALLA 5a: T_Equipo.IdTipoEquipo deberia ser NOT NULL, es %', "vTexto";
	END IF;

	SELECT "is_nullable" INTO "vTexto"
	FROM "information_schema"."columns"
	WHERE "table_schema" = 'inv' AND "table_name" = 'T_Vehiculo' AND "column_name" = 'IdEquipo';
	IF "vTexto" <> 'NO' THEN
		RAISE EXCEPTION 'FALLA 5b: T_Vehiculo.IdEquipo deberia ser NOT NULL, es %', "vTexto";
	END IF;

	/* Los dos telehandler no tenian placa: sin placa no se les puede atribuir
	   consumo, asi que reciben su codigo interno como placa. */
	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Vehiculo" WHERE "Estado" AND "Placa" IN ('TELE-01','TELE-02');
	IF "vCant" <> 2 THEN
		RAISE EXCEPTION 'FALLA 5c: se esperaban las placas TELE-01 y TELE-02, hay % de 2', "vCant";
	END IF;

	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Equipo" E
	WHERE E."Estado"
	  AND NOT EXISTS (SELECT 1 FROM "inv"."T_Vehiculo" V WHERE V."IdEquipo" = E."Id" AND V."Estado");
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 5d: % equipos activos no tienen ninguna placa: no se les puede atribuir consumo', "vCant";
	END IF;

	/* =============================================================
		6. La linea entra al contador de dependencias
	============================================================= */
	SELECT "Id" INTO "vIdLinea" FROM "inv"."T_LineaEquipo" WHERE "Codigo" = 'LIVIANA';
	"vDeps" = "inv"."FnContarDependencias"('lineaEquipo', "vIdLinea");
	IF ("vDeps"->>'tipos')::INTEGER <> 4 THEN
		RAISE EXCEPTION 'FALLA 6a: LIVIANA deberia tener 4 tipos activos, el contador dice %', "vDeps"->>'tipos';
	END IF;
	IF ("vDeps"->>'puedeEliminar')::BOOLEAN THEN
		RAISE EXCEPTION 'FALLA 6b: una linea con tipos colgados no deberia poder eliminarse';
	END IF;

	RAISE NOTICE '0079 OK';
END;
$$;
