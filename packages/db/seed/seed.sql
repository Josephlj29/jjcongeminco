/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: datos base (roles, unidades, categorias, ubicaciones)
	Tipo de Cambio: INSERT - seed idempotente
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Carga inicial reejecutable (ON CONFLICT DO NOTHING).
*/

/* Roles */
INSERT INTO "seg"."T_Rol" ("Codigo","Nombre","Descripcion")
VALUES
	('admin','Administrador','Acceso total: usuarios, catalogo, anulaciones.')
	,('gerencia','Gerencia','Lectura total, dashboard y reportes.')
	,('supervision','Supervision','Lectura y creacion/confirmacion de salidas y transferencias.')
	,('almacenero','Almacenero','Registro de entradas, salidas, transferencias y productos.')
ON CONFLICT ("Codigo") DO NOTHING;

/* Unidades de medida */
INSERT INTO "inv"."T_UnidadMedida" ("Codigo","Nombre")
VALUES
	('NIU','Unidad (NIU)')
	,('UND','Unidad')
	,('LT','Litro')
	,('KG','Kilogramo')
	,('M','Metro')
ON CONFLICT ("Codigo") DO NOTHING;

/* Familias (categorias raiz), una por KARDEX */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
VALUES
	('FAM-HER','Herramientas',NULL)
	,('FAM-FIL','Filtros',NULL)
	,('FAM-ACE','Aceites y Liquidos',NULL)
	,('FAM-ESL','Eslingas y Grilletes',NULL)
	,('FAM-SUS','Sistema de Suspension',NULL)
	,('FAM-SUM','Suministros de Rotacion',NULL)
ON CONFLICT ("Codigo") DO NOTHING;

/* Categorias hijas (columna CATEGORIA del Excel) colgadas de su familia */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
SELECT
	V."Codigo"
	,V."Nombre"
	,C."Id"
FROM
	(
		VALUES
			('CAT-HERRAMIENTA','HERRAMIENTA','FAM-HER')
			,('CAT-FILTRO','FILTRO','FAM-FIL')
			,('CAT-ACEITE','ACEITE','FAM-ACE')
			,('CAT-GRASA','GRASA','FAM-ACE')
			,('CAT-REPUESTO','REPUESTO','FAM-SUS')
			,('CAT-SUMINISTRO','SUMINISTRO','FAM-SUM')
	) AS V("Codigo","Nombre","CodigoPadre")
INNER JOIN "inv"."T_Categoria" C ON C."Codigo" = V."CodigoPadre"
ON CONFLICT ("Codigo") DO NOTHING;

/* Ubicaciones (de las guias de remision analizadas) */
INSERT INTO "inv"."T_Ubicacion" ("Codigo","Nombre","Tipo","Direccion")
VALUES
	('ALM-AQP','Almacen Central - Arequipa','almacen_central','Sol Oeste 107 - Cerro Colorado - Arequipa')
	,('PROY-TAM','Proyecto Tambomayo','proyecto','Tapay - Caylloma - Arequipa')
ON CONFLICT ("Codigo") DO NOTHING;