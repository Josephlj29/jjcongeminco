/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: seed de categorias para el inventario Tambomayo (almacen 01)
	Tipo de Cambio: INSERT idempotente - familias y categorias del Excel
	Autor: Equipo Desarrollo
	Fecha: 2026-07-16
	Descripcion: Jerarquia familia -> categoria para los 79 productos del
	             Excel "plantilla-productos alm 01.xlsx" (Tambomayo).
	             Ademas corrige el typo de CAT-001 ("RESPUESTOS") y la
	             cuelga bajo la familia Repuestos.
	             Idempotente: se puede ejecutar mas de una vez sin efecto.
*/

/* 1. Familias (categorias raiz) */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
VALUES
	('FAM-ELE','Sistema Eléctrico',NULL)
	,('FAM-CON','Consumibles',NULL)
	,('FAM-NEU','Neumáticos',NULL)
	,('FAM-LUB','Lubricantes',NULL)
	,('FAM-HER','Herramientas',NULL)
	,('FAM-REP','Repuestos',NULL)
ON CONFLICT ("Codigo") WHERE "Estado" = true DO NOTHING;

/* 2. Categorias hijas (columna CodigoCategoria del Excel) colgadas de su familia */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
SELECT
	V."Codigo"
	,V."Nombre"
	,F."Id"
FROM
	(
		VALUES
			('CAT-FOCO','Focos','FAM-ELE')
			,('CAT-RELAY','Relays','FAM-ELE')
			,('CAT-FUSIBLE','Fusibles','FAM-ELE')
			,('CAT-TERMINAL','Terminales','FAM-ELE')
			,('CAT-ELECTRICO','Componentes Eléctricos','FAM-ELE')
			,('CAT-CINTA','Cintas','FAM-CON')
			,('CAT-SELLANTE','Sellantes y Adhesivos','FAM-CON')
			,('CAT-QUIMICO','Químicos Automotrices','FAM-CON')
			,('CAT-NEUMATICO','Reparación de Neumáticos','FAM-NEU')
			,('CAT-LUBRICANTE','Grasas y Lubricantes','FAM-LUB')
			,('CAT-HERRAMIENTA','Herramientas','FAM-HER')
	) AS V("Codigo","Nombre","CodigoPadre")
INNER JOIN "inv"."T_Categoria" F ON F."Codigo" = V."CodigoPadre"
ON CONFLICT ("Codigo") WHERE "Estado" = true DO NOTHING;

/* 3. CAT-001: corregir typo y colgar bajo Repuestos (solo si sigue con el typo) */
UPDATE "inv"."T_Categoria" C
SET
	"Nombre"           = 'Repuestos CAT 140'
	,"IdCategoriaPadre" = F."Id"
FROM "inv"."T_Categoria" F
WHERE
	F."Codigo" = 'FAM-REP'
	AND C."Codigo" = 'CAT-001'
	AND C."Nombre" = 'RESPUESTOS CAT 140';