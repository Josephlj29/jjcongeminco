/*
	Pruebas de integracion — migracion 0080
	(catalogo de dos niveles: 14 familias, 34 categorias colgadas de su familia,
	 8 fusiones, 2 bajas y el trigger que impide un tercer nivel o un ciclo)

	Bloque 1: solo LEE, no necesita rollback.
	Bloque 2: prueba el comportamiento del trigger. Si el trigger funciona, los
	INSERT se rechazan y no escriben nada; si NO funciona, el RAISE del final
	deshace lo que se haya escrito.

		psql "$DATABASE_URL" -f packages/db/tests/0080_familias_categorias.sql

	Salida esperada en verde: NOTICE "0080 estructura OK" y "0080 trigger OK".
*/

/* =====================================================================
	Bloque 1 — estructura y datos
===================================================================== */
DO $$
DECLARE
	"vCant"  INTEGER;
	"vTexto" TEXT;
BEGIN
	/* ---- 1. Las 14 familias, todas en la raiz ---- */
	SELECT STRING_AGG("Codigo", ',' ORDER BY "Codigo") INTO "vTexto"
	FROM "inv"."T_Categoria"
	WHERE "Estado" AND "Codigo" LIKE 'FAM-%';
	/* Las 14 familias del plan MAS FAM-REP, que sigue en pie a proposito: sus 67
	   productos se reparten uno por uno en la fase de productos, que depende de
	   Revision-catalogo-productos.xlsx. Recien ahi FAM-REP se da de baja. */
	IF "vTexto" <> 'FAM-ACC,FAM-CON,FAM-ELE,FAM-FIL,FAM-FRE,FAM-HER,FAM-HID,FAM-IZA,FAM-LUB,FAM-MOT,FAM-NEU,FAM-REP,FAM-ROD,FAM-SEG,FAM-SUS' THEN
		RAISE EXCEPTION 'FALLA 1a: el juego de familias activas no es el esperado: %', "vTexto";
	END IF;

	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Categoria"
	WHERE "Estado" AND "Codigo" LIKE 'FAM-%' AND "IdCategoriaPadre" IS NOT NULL;
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 1b: % familias activas cuelgan de otra categoria; una familia es raiz', "vCant";
	END IF;

	SELECT "Nombre" INTO "vTexto" FROM "inv"."T_Categoria" WHERE "Codigo" = 'FAM-LUB' AND "Estado";
	IF "vTexto" <> 'Lubricantes y fluidos' THEN
		RAISE EXCEPTION 'FALLA 1c: FAM-LUB deberia llamarse "Lubricantes y fluidos", se llama "%"', "vTexto";
	END IF;

	/* ---- 2. Ninguna categoria suelta: toda CAT- cuelga de una familia ---- */
	SELECT STRING_AGG("Codigo", ',' ORDER BY "Codigo") INTO "vTexto"
	FROM "inv"."T_Categoria"
	WHERE "Estado" AND "Codigo" LIKE 'CAT-%' AND "IdCategoriaPadre" IS NULL;
	IF "vTexto" IS NOT NULL THEN
		RAISE EXCEPTION 'FALLA 2a: quedan categorias sueltas en la raiz: %', "vTexto";
	END IF;

	/* Y no sobrevive ninguna categoria con codigo fuera del estandar
	   (FARO, MUELLE, GOMA, PRECA, ROD, TAPA, padre) */
	SELECT STRING_AGG("Codigo", ',' ORDER BY "Codigo") INTO "vTexto"
	FROM "inv"."T_Categoria"
	WHERE "Estado" AND "Codigo" NOT LIKE 'FAM-%' AND "Codigo" NOT LIKE 'CAT-%';
	IF "vTexto" IS NOT NULL THEN
		RAISE EXCEPTION 'FALLA 2b: quedan categorias con codigo fuera del estandar: %', "vTexto";
	END IF;

	/* ---- 3. Cada categoria cuelga de la familia que le toca ---- */
	SELECT STRING_AGG(C."Codigo" || '>' || COALESCE(F."Codigo",'(raiz)'), ',' ORDER BY C."Codigo") INTO "vTexto"
	FROM "inv"."T_Categoria" C
	LEFT JOIN "inv"."T_Categoria" F ON F."Id" = C."IdCategoriaPadre"
	WHERE C."Estado" AND C."Codigo" LIKE 'CAT-%';
	IF "vTexto" <> 'CAT-CARROCERIA>FAM-ACC,CAT-CINTA>FAM-CON,CAT-COMBUSTIBLE>FAM-MOT,CAT-CORREA>FAM-MOT'
		|| ',CAT-DIRECCION>FAM-SUS,CAT-ELECTRICO>FAM-ELE,CAT-EMERGENCIA>FAM-SEG,CAT-EPP>FAM-SEG'
		|| ',CAT-EQUIPO-TALLER>FAM-HER,CAT-ESLINGA>FAM-IZA,CAT-FIJACION>FAM-ACC,CAT-FILTRO>FAM-FIL'
		|| ',CAT-FLUIDO>FAM-LUB,CAT-FOCO>FAM-ELE,CAT-FRENO>FAM-FRE,CAT-FUSIBLE>FAM-ELE'
		|| ',CAT-HERRAMIENTA>FAM-HER,CAT-HIDRAULICO>FAM-HID,CAT-IMPLEMENTO>FAM-ACC,CAT-LIMPIEZA>FAM-CON'
		|| ',CAT-LLANTA>FAM-NEU,CAT-LUBRICANTE>FAM-LUB,CAT-MEDICION>FAM-HER,CAT-MOTOR>FAM-MOT'
		|| ',CAT-MUELLE>FAM-SUS,CAT-NEUMATICO>FAM-NEU,CAT-QUIMICO>FAM-CON,CAT-RELAY>FAM-ELE'
		|| ',CAT-RETEN>FAM-ROD,CAT-RODAMIENTO>FAM-ROD,CAT-SELLANTE>FAM-CON,CAT-SUSPENSION>FAM-SUS'
		|| ',CAT-TERMINAL>FAM-ELE,CAT-TRANSMISION>FAM-MOT' THEN
		RAISE EXCEPTION 'FALLA 3a: el arbol familia>categoria no es el esperado: %', "vTexto";
	END IF;

	/* ---- 4. Dos niveles y nada mas ---- */
	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Categoria" N
	JOIN "inv"."T_Categoria" P ON P."Id" = N."IdCategoriaPadre"
	WHERE N."Estado" AND P."IdCategoriaPadre" IS NOT NULL;
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 4a: hay % categorias activas en un tercer nivel', "vCant";
	END IF;

	/* ---- 5. Las 8 fusionadas y las 2 bajas quedaron inactivas y vacias ---- */
	SELECT STRING_AGG("Codigo", ',' ORDER BY "Codigo") INTO "vTexto"
	FROM "inv"."T_Categoria"
	WHERE "Estado" AND "Codigo" IN ('CAT- CRUCETA','CAT-SEGURIDAD','FARO','GOMA','MUELLE','PRECA','ROD','TAPA','CAT-VARIOS','padre');
	IF "vTexto" IS NOT NULL THEN
		RAISE EXCEPTION 'FALLA 5a: estas deberian estar dadas de baja: %', "vTexto";
	END IF;

	SELECT COUNT(*) INTO "vCant"
	FROM "inv"."T_Producto" P
	JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	WHERE P."Estado" AND NOT C."Estado";
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 5b: % productos activos siguen en una categoria dada de baja', "vCant";
	END IF;

	/* ---- 6. Las fusiones no perdieron ni un producto ---- */
	SELECT STRING_AGG(Z."Codigo" || '=' || Z."n", ',' ORDER BY Z."Codigo") INTO "vTexto"
	FROM (
		SELECT C."Codigo"
			 , (SELECT COUNT(*) FROM "inv"."T_Producto" P WHERE P."IdCategoria" = C."Id" AND P."Estado")::TEXT AS "n"
		FROM "inv"."T_Categoria" C
		WHERE C."Estado" AND C."Codigo" IN
			('CAT-TRANSMISION','CAT-FIJACION','CAT-FOCO','CAT-FRENO','CAT-MUELLE','CAT-MOTOR','CAT-IMPLEMENTO')
	) Z;
	IF "vTexto" <> 'CAT-FIJACION=7,CAT-FOCO=34,CAT-FRENO=11,CAT-IMPLEMENTO=1,CAT-MOTOR=5,CAT-MUELLE=6,CAT-TRANSMISION=5' THEN
		RAISE EXCEPTION 'FALLA 6a: los destinos de las fusiones no tienen la cantidad esperada: %', "vTexto";
	END IF;

	/* La invariante que importa: la fusion MUEVE, no borra. 436 activos de 443
	   filas (7 estaban dados de baja desde antes). */
	SELECT COUNT(*) INTO "vCant" FROM "inv"."T_Producto" WHERE "Estado";
	IF "vCant" <> 436 THEN
		RAISE EXCEPTION 'FALLA 6b: habia 436 productos activos antes de 0080, hay %', "vCant";
	END IF;

	SELECT COUNT(*) INTO "vCant" FROM "inv"."T_Producto" WHERE "Estado" AND "IdCategoria" IS NULL;
	IF "vCant" <> 0 THEN
		RAISE EXCEPTION 'FALLA 6c: % productos activos quedaron sin categoria', "vCant";
	END IF;

	/* ---- 7. Lo que 0080 NO toca, y tiene que seguir intacto ---- */
	SELECT STRING_AGG(Z."Codigo" || '=' || Z."n", ',' ORDER BY Z."Codigo") INTO "vTexto"
	FROM (
		SELECT C."Codigo"
			 , (SELECT COUNT(*) FROM "inv"."T_Producto" P WHERE P."IdCategoria" = C."Id" AND P."Estado")::TEXT AS "n"
		FROM "inv"."T_Categoria" C
		WHERE C."Codigo" IN ('FAM-REP','FAM-CON')
	) Z;
	IF "vTexto" <> 'FAM-CON=94,FAM-REP=67' THEN
		RAISE EXCEPTION 'FALLA 7a: los 161 productos colgados de FAM-CON y FAM-REP se reparten en la fase de productos, no en 0080. Hoy: %', "vTexto";
	END IF;

	RAISE NOTICE '0080 estructura OK';
END;
$$;

/* =====================================================================
	Bloque 2 — el trigger de jerarquia
	Si el trigger funciona, ningun INSERT llega a escribir.
===================================================================== */
DO $$
DECLARE
	"vRechazado" BOOLEAN;
	"vIdFamilia" UUID;
	"vIdCat"     UUID;
BEGIN
	SELECT "Id" INTO "vIdFamilia" FROM "inv"."T_Categoria" WHERE "Codigo" = 'FAM-FIL' AND "Estado";
	SELECT "Id" INTO "vIdCat"     FROM "inv"."T_Categoria" WHERE "Codigo" = 'CAT-FILTRO' AND "Estado";

	/* ---- 8. Un tercer nivel se rechaza ---- */
	"vRechazado" = FALSE;
	BEGIN
		INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
		VALUES ('ZZ-NIVEL3','Prueba tercer nivel', "vIdCat");
	EXCEPTION WHEN OTHERS THEN
		"vRechazado" = TRUE;
	END;
	IF NOT "vRechazado" THEN
		RAISE EXCEPTION 'FALLA 8a: el trigger dejo colgar una categoria de otra categoria (tercer nivel)';
	END IF;

	/* ---- 9. Colgar de una familia si se permite ---- */
	"vRechazado" = FALSE;
	BEGIN
		INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
		VALUES ('ZZ-NIVEL2','Prueba segundo nivel', "vIdFamilia");
	EXCEPTION WHEN OTHERS THEN
		"vRechazado" = TRUE;
	END;
	IF "vRechazado" THEN
		RAISE EXCEPTION 'FALLA 9a: el trigger rechazo una categoria colgada de una familia, que es el caso valido';
	END IF;

	/* ---- 10. Un ciclo sobre si misma se rechaza ---- */
	"vRechazado" = FALSE;
	BEGIN
		UPDATE "inv"."T_Categoria" SET "IdCategoriaPadre" = "Id" WHERE "Codigo" = 'ZZ-NIVEL2';
	EXCEPTION WHEN OTHERS THEN
		"vRechazado" = TRUE;
	END;
	IF NOT "vRechazado" THEN
		RAISE EXCEPTION 'FALLA 10a: el trigger dejo que una categoria sea su propio padre';
	END IF;

	/* ---- 11. Una familia con hijas no puede volverse categoria ---- */
	"vRechazado" = FALSE;
	BEGIN
		UPDATE "inv"."T_Categoria" SET "IdCategoriaPadre" = "vIdFamilia" WHERE "Codigo" = 'FAM-ELE';
	EXCEPTION WHEN OTHERS THEN
		"vRechazado" = TRUE;
	END;
	IF NOT "vRechazado" THEN
		RAISE EXCEPTION 'FALLA 11a: el trigger dejo colgar FAM-ELE (que tiene hijas) de otra familia';
	END IF;

	RAISE NOTICE '0080 trigger OK';

	/* Deshace la ZZ-NIVEL2 que si se inserto, y cualquier resto. */
	RAISE EXCEPTION 'ROLLBACK DE PRUEBA: 0080 trigger OK, nada quedo escrito';
END;
$$;
