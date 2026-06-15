/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: SEED demo - RESET total de data de prueba + 20 productos + movimientos
	Autor: Equipo Desarrollo
	Fecha: 2026-06-15
	Descripcion: DATA DE PRUEBA. Borra TODO el inventario (movimientos, documentos,
	             saldos, requerimientos, precios, imagenes, importaciones, equipos,
	             vehiculos, proveedores, productos y categorias) y lo recrea desde
	             cero con 20 productos que ejemplifican TODOS los casos del modelo
	             (general, 1 tipo, varios tipos, todas las categorias/unidades) y
	             ~8 flujos: existencia inicial valorizada, compras (costo promedio
	             movil + historial de lotes), salida por placa, transferencia,
	             ajustes por recuento (+/-) y requerimientos (pendiente + atendido
	             que genera la salida valorizada).
	CONSERVA: usuarios/roles (seg), almacenes (T_Ubicacion), unidades y tipos de
	          equipo preconfigurados.
	Re-ejecutable: hace el reset completo cada vez (idempotente por diseño).
*/

BEGIN;

/* ===================== 1. WIPE (orden seguro por FK) ===================== */
ALTER TABLE "inv"."T_MovimientoStock" DISABLE TRIGGER "TR_T_MovimientoStock_BloquearDelete";
DELETE FROM "inv"."T_MovimientoStock";
ALTER TABLE "inv"."T_MovimientoStock" ENABLE TRIGGER "TR_T_MovimientoStock_BloquearDelete";

DELETE FROM "inv"."T_ProductoPrecioHistorico";
DELETE FROM "inv"."T_SaldoStock";
DELETE FROM "inv"."T_RequerimientoDetalle";
DELETE FROM "inv"."T_Requerimiento";
DELETE FROM "inv"."T_DocumentoInventarioDetalle";
DELETE FROM "inv"."T_DocumentoInventario";
DELETE FROM "inv"."T_ProductoImagen";
DELETE FROM "inv"."T_ProductoTipoEquipo";
DELETE FROM "inv"."T_Importacion";
DELETE FROM "inv"."T_Vehiculo";
DELETE FROM "inv"."T_Producto";
DELETE FROM "inv"."T_Equipo";
DELETE FROM "inv"."T_Proveedor";
DELETE FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" IS NOT NULL;
DELETE FROM "inv"."T_Categoria";

/* ===================== 2. Familias + categorias ===================== */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre") VALUES
	('FAM-LUB','Lubricantes',NULL)
	,('FAM-FIL','Filtros',NULL)
	,('FAM-REP','Repuestos',NULL)
	,('FAM-HER','Herramientas',NULL)
	,('FAM-SUM','Suministros',NULL);

INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")
SELECT H."Codigo", H."Nombre", F."Id"
FROM (VALUES
	('CAT-ACEITE','Aceites','FAM-LUB')
	,('CAT-GRASA','Grasas','FAM-LUB')
	,('CAT-FILTRO','Filtros','FAM-FIL')
	,('CAT-REPUESTO','Repuestos','FAM-REP')
	,('CAT-HERRAMIENTA','Herramientas','FAM-HER')
	,('CAT-SUMINISTRO','Suministros','FAM-SUM')
) AS H("Codigo","Nombre","FamCod")
INNER JOIN "inv"."T_Categoria" F ON F."Codigo" = H."FamCod";

/* ===================== 3. Productos (20, todos los casos) ===================== */
INSERT INTO "inv"."T_Producto"
	("Sku","Nombre","IdCategoria","IdUnidadMedida","StockMinimo","EsGeneral","CodigoProductoProveedor")
SELECT D."Sku", D."Nombre", C."Id", U."Id", D."StockMin", D."EsGeneral", NULLIF(D."CodProv",'')
FROM (VALUES
	-- especificos multi-tipo
	('ACE-15W40','Aceite Motor 15W40','CAT-ACEITE','LT',50,false,'LUB-15W40')
	,('ACE-85W140','Aceite Transmision 85W140','CAT-ACEITE','LT',30,false,'LUB-85W140')
	,('REP-PASTILLA','Pastillas de Freno','CAT-REPUESTO','UND',16,false,'')
	-- especificos un tipo
	,('ACE-ATF','Aceite Hidraulico ATF','CAT-ACEITE','LT',20,false,'')
	,('ACE-10W30','Aceite Liviano 10W30','CAT-ACEITE','LT',24,false,'')
	,('FIL-ACECAM','Filtro Aceite Camion','CAT-FILTRO','UND',12,false,'FR-7654')
	,('FIL-AIRCAM','Filtro Aire Camion','CAT-FILTRO','UND',12,false,'FR-7655')
	,('FIL-COMCIS','Filtro Combustible Cisterna','CAT-FILTRO','UND',8,false,'')
	,('FIL-ACECTA','Filtro Aceite Camioneta','CAT-FILTRO','UND',10,false,'')
	,('FIL-HIDGRU','Filtro Hidraulico Grua','CAT-FILTRO','UND',6,false,'')
	,('REP-CORREA','Correa de Distribucion','CAT-REPUESTO','UND',8,false,'')
	-- generales (compatibles con todo)
	,('GRA-MULTI','Grasa Multiproposito','CAT-GRASA','KG',15,true,'')
	,('GRA-EP2','Grasa EP2 Litio','CAT-GRASA','KG',10,true,'')
	,('REP-FOCO','Foco H4 12V','CAT-REPUESTO','UND',20,true,'')
	,('HER-LLAVE','Juego de Llaves Mixtas','CAT-HERRAMIENTA','UND',3,true,'')
	,('HER-GATO','Gato Hidraulico 12T','CAT-HERRAMIENTA','UND',2,true,'')
	,('SUM-WAIPE','Waipe Industrial','CAT-SUMINISTRO','KG',30,true,'')
	,('SUM-GUANTE','Guantes de Nitrilo','CAT-SUMINISTRO','UND',100,true,'')
	,('SUM-CINTA','Cinta Aislante','CAT-SUMINISTRO','M',50,true,'')
	,('SUM-SOLDA','Soldadura 6011','CAT-SUMINISTRO','KG',25,true,'')
) AS D("Sku","Nombre","CatCod","UniCod","StockMin","EsGeneral","CodProv")
INNER JOIN "inv"."T_Categoria" C ON C."Codigo" = D."CatCod"
INNER JOIN "inv"."T_UnidadMedida" U ON U."Codigo" = D."UniCod";

/* Compatibilidad producto<->tipo (solo NO generales; el guard bloquea generales) */
INSERT INTO "inv"."T_ProductoTipoEquipo" ("IdProducto","IdTipoEquipo")
SELECT P."Id", T."Id"
FROM (VALUES
	('ACE-15W40','CAMION'),('ACE-15W40','CISTERNA'),('ACE-15W40','BUS')
	,('ACE-85W140','CAMION'),('ACE-85W140','GRUA')
	,('REP-PASTILLA','CAMION'),('REP-PASTILLA','CAMIONETA'),('REP-PASTILLA','BUS')
	,('ACE-ATF','GRUA')
	,('ACE-10W30','CAMIONETA')
	,('FIL-ACECAM','CAMION')
	,('FIL-AIRCAM','CAMION')
	,('FIL-COMCIS','CISTERNA')
	,('FIL-ACECTA','CAMIONETA')
	,('FIL-HIDGRU','GRUA')
	,('REP-CORREA','CAMIONETA')
) AS A("Sku","TipoCod")
INNER JOIN "inv"."T_Producto" P ON P."Sku" = A."Sku"
INNER JOIN "inv"."T_TipoEquipo" T ON T."Codigo" = A."TipoCod";

/* ===================== 4. Maestros para movimientos ===================== */
INSERT INTO "inv"."T_Proveedor" ("Ruc","Nombre","Contacto","Telefono") VALUES
	('20100100101','REPUESTOS MINEROS SAC','Juan Perez','054-200100')
	,('20200200202','LUBRICANTES DEL SUR EIRL','Maria Gomez','054-300200')
	,('20300300303','FILTROS Y RODAMIENTOS SRL','Carlos Ruiz','054-400300');

INSERT INTO "inv"."T_Equipo" ("Codigo","Nombre","Descripcion","IdTipoEquipo")
SELECT E."Codigo", E."Nombre", E."Desc", T."Id"
FROM (VALUES
	('EQ-VOLQ01','Volquete EX8','Volquete Hyundai EX8','CAMION')
	,('EQ-BUS01','Bus County','Bus de personal Hyundai County','BUS')
	,('EQ-CIST01','Cisterna Volvo','Camion cisterna de agua','CISTERNA')
	,('EQ-GRUA01','Grua 25T','Grua de izaje','GRUA')
	,('EQ-CTA01','Camioneta Hilux','Camioneta 4x4','CAMIONETA')
) AS E("Codigo","Nombre","Desc","TipoCod")
INNER JOIN "inv"."T_TipoEquipo" T ON T."Codigo" = E."TipoCod";

INSERT INTO "inv"."T_Vehiculo" ("Placa","Modelo","IdEquipo")
SELECT V."Placa", V."Modelo", E."Id"
FROM (VALUES
	('VOX700','Hyundai EX8','EQ-VOLQ01')
	,('VBU158','Hyundai County','EQ-BUS01')
	,('ABC123','Cisterna Volvo','EQ-CIST01')
) AS V("Placa","Modelo","CodEq")
INNER JOIN "inv"."T_Equipo" E ON E."Codigo" = V."CodEq";

/* ===================== 5. Movimientos (ejemplos) ===================== */
DO $$
DECLARE
	"vAlm"   UUID;
	"vProy"  UUID;
	"vProvL" UUID;
	"vProvF" UUID;
	"vVeh"   UUID;
	"vVehV"  UUID;
	"vDoc"   UUID;
	"vReq"   UUID;
	"vLineas" JSONB;
BEGIN
	SELECT "Id" INTO "vAlm"   FROM "inv"."T_Ubicacion" WHERE "Codigo" = 'ALM-AQP';
	SELECT "Id" INTO "vProy"  FROM "inv"."T_Ubicacion" WHERE "Codigo" = 'PROY-TAM';
	SELECT "Id" INTO "vProvL" FROM "inv"."T_Proveedor" WHERE "Ruc" = '20200200202';
	SELECT "Id" INTO "vProvF" FROM "inv"."T_Proveedor" WHERE "Ruc" = '20300300303';
	SELECT "Id" INTO "vVeh"   FROM "inv"."T_Vehiculo" WHERE "Placa" = 'VBU158';
	SELECT "Id" INTO "vVehV"  FROM "inv"."T_Vehiculo" WHERE "Placa" = 'VOX700';

	/* 1) Existencia inicial valorizada en Almacen Central */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionDestino","Notas","Situacion")
	VALUES ('existencia_inicial','2025-01-15',"vAlm",'Carga inicial de inventario','borrador')
	RETURNING "Id" INTO "vDoc";
	INSERT INTO "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario","IdProducto","Cantidad","CostoUnitario")
	SELECT "vDoc", P."Id", D."Cant", D."Costo"
	FROM (VALUES
		('ACE-15W40',100,22.00),('ACE-85W140',60,28.00),('ACE-ATF',40,25.00),
		('ACE-10W30',50,20.00),('GRA-MULTI',30,12.00),('GRA-EP2',25,14.00),
		('FIL-ACECAM',40,18.00),('FIL-AIRCAM',35,22.00),('FIL-COMCIS',20,30.00),
		('FIL-ACECTA',25,16.00),('REP-PASTILLA',30,45.00),('REP-FOCO',50,8.00),
		('SUM-WAIPE',80,6.00),('SUM-GUANTE',200,1.50)
	) AS D("Sku","Cant","Costo")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 2) Entrada / compra (proveedor LUBRICANTES) -> costo promedio movil */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionDestino","IdProveedor","Comprobante","Notas","Situacion")
	VALUES ('entrada','2025-02-10',"vAlm","vProvL",'F001-1234','Compra de reposicion','borrador')
	RETURNING "Id" INTO "vDoc";
	INSERT INTO "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario","IdProducto","Cantidad","CostoUnitario")
	SELECT "vDoc", P."Id", D."Cant", D."Costo"
	FROM (VALUES ('ACE-15W40',200,24.00),('ACE-85W140',50,29.50)) AS D("Sku","Cant","Costo")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 3) Entrada / compra (proveedor FILTROS) -> 2do lote (historial de precios) */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionDestino","IdProveedor","Comprobante","Notas","Situacion")
	VALUES ('entrada','2025-03-05',"vAlm","vProvF",'F002-5678','Compra filtros + aceite','borrador')
	RETURNING "Id" INTO "vDoc";
	INSERT INTO "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario","IdProducto","Cantidad","CostoUnitario")
	SELECT "vDoc", P."Id", D."Cant", D."Costo"
	FROM (VALUES ('FIL-ACECAM',60,19.50),('ACE-15W40',100,26.00)) AS D("Sku","Cant","Costo")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 4) Salida por placa exacta (consumo valorizado al promedio vigente) */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionOrigen","IdVehiculo","Referencia","Notas","Situacion")
	VALUES ('salida','2025-03-12',"vAlm","vVeh",'OT-450','Consumo en VBU158','borrador')
	RETURNING "Id" INTO "vDoc";
	INSERT INTO "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario","IdProducto","Cantidad")
	SELECT "vDoc", P."Id", D."Cant"
	FROM (VALUES ('ACE-15W40',30),('SUM-WAIPE',10),('FIL-AIRCAM',5)) AS D("Sku","Cant")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 5) Transferencia Almacen Central -> Proyecto Tambomayo (mueve costo) */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionOrigen","IdUbicacionDestino","Referencia","Notas","Situacion")
	VALUES ('transferencia','2025-03-15',"vAlm","vProy",'GR-001','Traslado a Tambomayo','borrador')
	RETURNING "Id" INTO "vDoc";
	INSERT INTO "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario","IdProducto","Cantidad")
	SELECT "vDoc", P."Id", D."Cant"
	FROM (VALUES ('ACE-15W40',50),('GRA-MULTI',10),('REP-PASTILLA',8)) AS D("Sku","Cant")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 6a) Ajuste por recuento: faltante (merma) de guantes */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionOrigen","Notas","Situacion")
	VALUES ('ajuste','2025-03-20',"vAlm",'Recuento fisico: merma','borrador')
	RETURNING "Id" INTO "vDoc";
	INSERT INTO "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario","IdProducto","Cantidad")
	SELECT "vDoc", P."Id", 15 FROM "inv"."T_Producto" P WHERE P."Sku" = 'SUM-GUANTE';
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 6b) Ajuste por recuento: sobrante de herramienta no registrada (con costo) */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionDestino","Notas","Situacion")
	VALUES ('ajuste','2025-03-20',"vAlm",'Recuento fisico: hallazgo','borrador')
	RETURNING "Id" INTO "vDoc";
	INSERT INTO "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario","IdProducto","Cantidad","CostoUnitario")
	SELECT "vDoc", P."Id", 5, 95.00 FROM "inv"."T_Producto" P WHERE P."Sku" = 'HER-LLAVE';
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 7) Requerimiento PENDIENTE (para el panel de aprobaciones) */
	INSERT INTO "inv"."T_Requerimiento"
		("FechaRequerimiento","Origen","IdVehiculo","Notas","Situacion")
	VALUES ('2025-03-22','desgaste_prematuro',"vVehV",'Falla prematura de filtro de aceite','pendiente')
	RETURNING "Id" INTO "vReq";
	INSERT INTO "inv"."T_RequerimientoDetalle" ("IdRequerimiento","IdProducto","Cantidad")
	SELECT "vReq", P."Id", D."Cant"
	FROM (VALUES ('FIL-ACECAM',4),('ACE-15W40',20)) AS D("Sku","Cant")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";

	/* 8) Requerimiento ATENDIDO -> genera la salida valorizada */
	INSERT INTO "inv"."T_Requerimiento"
		("FechaRequerimiento","Origen","IdVehiculo","Notas","Situacion")
	VALUES ('2025-03-18','planificado',"vVeh",'Mantenimiento programado','pendiente')
	RETURNING "Id" INTO "vReq";

	WITH "ins" AS (
		INSERT INTO "inv"."T_RequerimientoDetalle" ("IdRequerimiento","IdProducto","Cantidad")
		SELECT "vReq", P."Id", D."Cant"
		FROM (VALUES ('FIL-AIRCAM',3),('ACE-85W140',10)) AS D("Sku","Cant")
		INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku"
		RETURNING "Id", "Cantidad"
	)
	SELECT JSONB_AGG(JSONB_BUILD_OBJECT('IdDetalle', "Id", 'Modo', 'stock', 'Cantidad', "Cantidad"))
	INTO "vLineas" FROM "ins";

	PERFORM "inv"."FnAtenderRequerimiento"(
		"vReq",
		JSONB_BUILD_OBJECT('IdUbicacionOrigen', "vAlm"::TEXT, 'Lineas', "vLineas")
	);

	RAISE NOTICE 'Seed demo cargado: 20 productos + movimientos de ejemplo.';
END $$;

COMMIT;
