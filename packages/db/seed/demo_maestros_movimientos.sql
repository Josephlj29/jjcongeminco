/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: SEED demo - maestros (proveedores, equipos, placas) + movimientos
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Carga proveedores, equipos y vehiculos, y simula movimientos
	             (existencia inicial, compra con costo, salida por placa,
	             transferencia y un requerimiento). Ejercita ledger, saldos,
	             valorizacion (costo promedio + historico) e historial de pedidos.
	Requisitos: ejecutar DESPUES de la instalacion completa (productos cargados).
	Idempotente en maestros (ON CONFLICT). Los movimientos solo se cargan si el
	ledger esta vacio, para no duplicar al re-ejecutar.
*/

/* ---------- Maestros (idempotentes) ---------- */
INSERT INTO "inv"."T_Proveedor" ("Ruc","Nombre","Contacto","Telefono")
VALUES
	('20100100101','REPUESTOS MINEROS SAC','Juan Perez','054-200100')
	,('20200200202','LUBRICANTES DEL SUR EIRL','Maria Gomez','054-300200')
	,('20300300303','FILTROS Y RODAMIENTOS SRL','Carlos Ruiz','054-400300')
ON CONFLICT ("Ruc") DO NOTHING;

INSERT INTO "inv"."T_Equipo" ("Codigo","Nombre","Descripcion")
VALUES
	('EQ-EX8','Volquete EX8','Volquete Hyundai EX8')
	,('EQ-COUNTY','Bus County','Bus de personal Hyundai County')
	,('EQ-CISTERNA','Cisterna','Camion cisterna de agua')
	,('EQ-GRUA','Grua','Grua de izaje')
ON CONFLICT ("Codigo") DO NOTHING;

INSERT INTO "inv"."T_Vehiculo" ("Placa","Modelo","IdEquipo")
SELECT V."Placa", V."Modelo", E."Id"
FROM
	(
		VALUES
			('VOX700','Hyundai EX8','EQ-EX8')
			,('VBU158','Hyundai County','EQ-COUNTY')
			,('ABC123','Cisterna Volvo','EQ-CISTERNA')
	) AS V("Placa","Modelo","CodigoEquipo")
INNER JOIN "inv"."T_Equipo" E ON E."Codigo" = V."CodigoEquipo"
ON CONFLICT ("Placa") DO NOTHING;

/* ---------- Movimientos demo (solo si el ledger esta vacio) ---------- */
DO $$
DECLARE
	"vAlm"  UUID;
	"vProy" UUID;
	"vProv" UUID;
	"vVeh"  UUID;
	"vDoc"  UUID;
BEGIN
	IF (SELECT COUNT(*) FROM "inv"."T_MovimientoStock") > 0 THEN
		RAISE NOTICE 'Ya existen movimientos; se omite la carga demo.';
		RETURN;
	END IF;

	SELECT "Id" INTO "vAlm"  FROM "inv"."T_Ubicacion" WHERE "Codigo" = 'ALM-AQP';
	SELECT "Id" INTO "vProy" FROM "inv"."T_Ubicacion" WHERE "Codigo" = 'PROY-TAM';
	SELECT "Id" INTO "vProv" FROM "inv"."T_Proveedor" WHERE "Ruc" = '20300300303';
	SELECT "Id" INTO "vVeh"  FROM "inv"."T_Vehiculo" WHERE "Placa" = 'VBU158';

	/* 1) Existencia inicial en Almacen Central (con costo) */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionDestino","Notas","Situacion")
	VALUES ('existencia_inicial','2025-06-11',"vAlm",'Carga inicial demo','borrador')
	RETURNING "Id" INTO "vDoc";

	INSERT INTO "inv"."T_DocumentoInventarioDetalle"
		("IdDocumentoInventario","IdProducto","Cantidad","CostoUnitario")
	SELECT "vDoc", P."Id", D."Cantidad", D."Costo"
	FROM
		(
			VALUES
				('AF1010', 12, 40.00)
				,('AF1011', 8, 55.00)
				,('SUS1002', 20, 18.50)
				,('SUS1006', 15, 22.00)
				,('SUM1009', 50, 6.50)
				,('HE1001', 3, 120.00)
		) AS D("Sku","Cantidad","Costo")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 2) Entrada (compra) con costo -> recalcula costo promedio + historico */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionDestino","IdProveedor","Comprobante","Notas","Situacion")
	VALUES ('entrada','2025-06-15',"vAlm","vProv",'F001-1234','Compra de reposicion','borrador')
	RETURNING "Id" INTO "vDoc";

	INSERT INTO "inv"."T_DocumentoInventarioDetalle"
		("IdDocumentoInventario","IdProducto","Cantidad","CostoUnitario")
	SELECT "vDoc", P."Id", D."Cantidad", D."Costo"
	FROM
		(
			VALUES
				('AF1010', 20, 45.50)
				,('AF1011', 10, 58.00)
		) AS D("Sku","Cantidad","Costo")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 3) Salida por placa exacta (VBU158) desde el Almacen Central */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionOrigen","IdVehiculo","Referencia","Notas","Situacion")
	VALUES ('salida','2025-06-20',"vAlm","vVeh",'OT-450','Consumo en VBU158','borrador')
	RETURNING "Id" INTO "vDoc";

	INSERT INTO "inv"."T_DocumentoInventarioDetalle"
		("IdDocumentoInventario","IdProducto","Cantidad")
	SELECT "vDoc", P."Id", D."Cantidad"
	FROM (VALUES ('AF1010', 2), ('SUM1009', 6)) AS D("Sku","Cantidad")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 4) Transferencia Almacen Central -> Proyecto Tambomayo */
	INSERT INTO "inv"."T_DocumentoInventario"
		("TipoDocumento","FechaDocumento","IdUbicacionOrigen","IdUbicacionDestino","Referencia","Notas","Situacion")
	VALUES ('transferencia','2025-06-22',"vAlm","vProy",'GR-EG07-206','Traslado a Tambomayo','borrador')
	RETURNING "Id" INTO "vDoc";

	INSERT INTO "inv"."T_DocumentoInventarioDetalle"
		("IdDocumentoInventario","IdProducto","Cantidad")
	SELECT "vDoc", P."Id", D."Cantidad"
	FROM (VALUES ('SUS1002', 5), ('SUS1006', 4)) AS D("Sku","Cantidad")
	INNER JOIN "inv"."T_Producto" P ON P."Sku" = D."Sku";
	PERFORM "inv"."FnConfirmarDocumentoInventario"("vDoc");

	/* 5) Requerimiento por desgaste prematuro (alimenta el historial) */
	INSERT INTO "inv"."T_Requerimiento"
		("FechaRequerimiento","Origen","IdVehiculo","Notas","Situacion")
	VALUES ('2025-06-25','desgaste_prematuro',"vVeh",'Falla prematura de filtro de aceite','pendiente')
	RETURNING "Id" INTO "vDoc";

	INSERT INTO "inv"."T_RequerimientoDetalle"
		("IdRequerimiento","IdProducto","Cantidad")
	SELECT "vDoc", P."Id", 3
	FROM "inv"."T_Producto" P WHERE P."Sku" = 'AF1010';

	RAISE NOTICE 'Movimientos demo cargados.';
END $$;
