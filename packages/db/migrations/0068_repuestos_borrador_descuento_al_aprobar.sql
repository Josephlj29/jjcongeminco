/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_OrdenMantenimientoRepuesto (CREATE),
	        inv.T_OrdenMantenimiento (ADD IdUbicacionConsumo / IdProveedorCompra / ComprobanteCompra),
	        inv.FnGuardarRepuestosOrdenMantenimiento (CREATE, interna),
	        inv.FnRegistrarOrdenMantenimiento (REPLACE),
	        inv.FnActualizarOrdenMantenimiento (REPLACE),
	        inv.FnReconciliarOrdenMantenimiento (REPLACE),
	        inv.FnEliminarOrdenMantenimiento (REPLACE),
	        inv.FnCerrarOrdenMantenimiento (REPLACE),
	        inv.FnConsumirRepuestosOrdenMantenimiento (DROP),
	        inv.V_OrdenMantenimientoRepuesto (CREATE)
	Tipo de Cambio: CREATE TABLE + ALTER TABLE + REPLACE de 5 funciones + DROP + CREATE VIEW
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Requiere: 0067 aplicada (fotos por tarea, sin evidencia por orden).
	Descripcion: DECISION DE NEGOCIO. En campo los repuestos se consumen primero y se
	             registran en el sistema despues; hasta que el admin aprueba, la OT
	             tiene que seguir editable (cabecera, trabajos y repuestos: agregar,
	             subir o bajar cantidades). Aprobar ES aprobar el descuento de stock.

	             Hasta 0066/0067 regia el "Model 2": el consumo descontaba stock al
	             registrarse (salida inmediata) y aprobar solo ratificaba; editar lo
	             consumido obligaba a rechazar (reversa contable) y rehacer la OT.
	             Desde esta migracion:

	               1. Los repuestos de una OT viven como BORRADOR en la nueva tabla
	                  inv.T_OrdenMantenimientoRepuesto (+ almacen/proveedor/comprobante
	                  en la cabecera). Cero impacto en el kardex mientras esta
	                  "Por aprobar": se reemplaza completo en cada guardado.

	               2. FnRegistrarOrdenMantenimiento guarda el borrador; TODA OT nueva
	                  nace 'consumida' (etiqueta UI "Por aprobar"), con o sin repuestos:
	                  el flujo es uniforme y la OT queda editable hasta la aprobacion.
	                  Sin repuestos, aprobar solo cierra (no hay descuento).

	               3. FnActualizarOrdenMantenimiento acepta el mismo payload (incluido
	                  Consumo) en OTs 'abierta' (legadas) y 'consumida' mientras no
	                  hayan descontado stock (IdRequerimiento IS NULL). Una abierta que
	                  recibe repuestos pasa a 'consumida'.

	               4. FnReconciliarOrdenMantenimiento: APROBAR genera en ese momento el
	                  requerimiento atendido + entrada por compra directa + UNA salida
	                  (Referencia "OT xxx") + T_RequerimientoAtencion, y cierra.
	                  RECHAZAR anula sin tocar el kardex. Las 4 OTs legadas que ya
	                  descontaron stock (IdRequerimiento NOT NULL) conservan el
	                  comportamiento anterior: aprobar solo cierra, rechazar revierte.
	                  Segregacion: quien guardo el borrador no lo aprueba (admin exento).

	               5. FnEliminarOrdenMantenimiento permite eliminar 'abierta' o
	                  'consumida' sin stock descontado (no hay kardex que proteger).

	               6. FnConsumirRepuestosOrdenMantenimiento desaparece (ya no hay
	                  consumo previo a la aprobacion). La ruta /consumir se elimina.

	               7. Vista inv.V_OrdenMantenimientoRepuesto: borrador resuelto con
	                  producto/unidad y costo ESTIMADO (compra: costo declarado; stock:
	                  promedio movil vigente). El costo real queda en el ledger al aprobar.

	             El valor 'consumida' de Situacion se conserva por compatibilidad; su
	             semantica pasa a ser "por aprobar" (repuestos registrados, stock aun
	             sin descontar salvo legadas).
*/

/* ===== 1. Borrador de repuestos ===== */
CREATE TABLE "inv"."T_OrdenMantenimientoRepuesto"
(
	"Id"                   UUID           NOT NULL DEFAULT gen_random_uuid(),
	"IdOrdenMantenimiento" UUID           NOT NULL,
	"IdProducto"           UUID           NOT NULL,
	"Cantidad"             NUMERIC(14,3)  NOT NULL,
	"Modo"                 VARCHAR(10)    NOT NULL DEFAULT 'stock',
	"CostoUnitarioCompra"  NUMERIC(14,4),
	"Estado"               BOOLEAN        NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"      VARCHAR(50)    NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"  VARCHAR(50)    NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
	"FechaModificacion"    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
	"RowVersion"           BIGINT         NOT NULL DEFAULT 0,
	"IdMigracion"          UUID,
	CONSTRAINT "PK_T_OrdenMantenimientoRepuesto" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_OrdenMantenimientoRepuesto_Orden_IdOrdenMantenimiento"
		FOREIGN KEY ("IdOrdenMantenimiento") REFERENCES "inv"."T_OrdenMantenimiento" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_OrdenMantenimientoRepuesto_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "CHK_T_OrdenMantenimientoRepuesto_Cantidad_MayorACero" CHECK ("Cantidad" > 0),
	CONSTRAINT "CHK_T_OrdenMantenimientoRepuesto_Modo_Permitido" CHECK ("Modo" IN ('stock','compra')),
	CONSTRAINT "CHK_T_OrdenMantenimientoRepuesto_CostoCompra"
		CHECK ("Modo" <> 'compra' OR ("CostoUnitarioCompra" IS NOT NULL AND "CostoUnitarioCompra" > 0))
);

COMMENT ON TABLE "inv"."T_OrdenMantenimientoRepuesto" IS 'Borrador de repuestos usados en una OT. Editable mientras la OT esta por aprobar; NO toca el kardex. Al aprobar (FnReconciliarOrdenMantenimiento) se convierte en requerimiento atendido + salida (y entrada si Modo=compra).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimientoRepuesto"."Modo" IS 'stock: sale del almacen. compra: compra directa (entrada al costo declarado y salida inmediata al aprobar).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimientoRepuesto"."CostoUnitarioCompra" IS 'Costo unitario declarado; obligatorio y > 0 solo si Modo = compra.';

CREATE INDEX "IX_T_OrdenMantenimientoRepuesto_IdOrden"
	ON "inv"."T_OrdenMantenimientoRepuesto" ("IdOrdenMantenimiento");

CREATE TRIGGER "TR_T_OrdenMantenimientoRepuesto_Auditoria"
	BEFORE UPDATE ON "inv"."T_OrdenMantenimientoRepuesto"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_OrdenMantenimientoRepuesto" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_OrdenMantenimientoRepuesto"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "OrdenMantenimientoRepuestoEscritura" ON "inv"."T_OrdenMantenimientoRepuesto"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

/* Cabecera del consumo (almacen de origen y datos de la compra directa) */
ALTER TABLE "inv"."T_OrdenMantenimiento"
	ADD COLUMN "IdUbicacionConsumo" UUID,
	ADD COLUMN "IdProveedorCompra"  UUID,
	ADD COLUMN "ComprobanteCompra"  VARCHAR(60),
	ADD CONSTRAINT "FK_T_OrdenMantenimiento_Ubicacion_IdUbicacionConsumo"
		FOREIGN KEY ("IdUbicacionConsumo") REFERENCES "inv"."T_Ubicacion" ("Id"),
	ADD CONSTRAINT "FK_T_OrdenMantenimiento_Proveedor_IdProveedorCompra"
		FOREIGN KEY ("IdProveedorCompra") REFERENCES "inv"."T_Proveedor" ("Id");

COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."IdUbicacionConsumo" IS 'Almacen del que saldran los repuestos del borrador al aprobar.';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."IdProveedorCompra" IS 'Proveedor de las lineas Modo=compra del borrador (compra directa).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."ComprobanteCompra" IS 'Comprobante de la compra directa (F001-123).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."Situacion" IS 'abierta (legado: sin repuestos, editable), consumida (= POR APROBAR: repuestos en borrador, editable, stock sin descontar salvo legadas con IdRequerimiento), cerrada (aprobada: stock descontado si hubo repuestos), anulada (rechazada).';

/* ===== 2. Guardado del borrador (interna, compartida por Registrar y Actualizar) =====
   Reemplaza el borrador completo. Devuelve la cantidad de lineas. Valida lo mismo que
   validaba el consumo: almacen activo, producto activo, cantidad > 0, compra directa
   con proveedor + comprobante + costo. */
CREATE OR REPLACE FUNCTION "inv"."FnGuardarRepuestosOrdenMantenimiento"
(
	"PIdOrden"  UUID,
	"PConsumo"  JSONB,
	"PUsuario"  VARCHAR
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vLinea"       JSONB;
	"vIdProducto"  UUID;
	"vModo"        TEXT;
	"vCant"        NUMERIC;
	"vCosto"       NUMERIC;
	"vNombreProd"  TEXT;
	"vLineas"      INTEGER := 0;
	"vHayCompra"   BOOLEAN := FALSE;
BEGIN
	DELETE FROM "inv"."T_OrdenMantenimientoRepuesto" WHERE "IdOrdenMantenimiento" = "PIdOrden";

	IF "PConsumo" IS NULL OR JSONB_TYPEOF("PConsumo") <> 'object'
	   OR JSONB_ARRAY_LENGTH(COALESCE("PConsumo"->'Lineas','[]'::JSONB)) = 0 THEN
		UPDATE "inv"."T_OrdenMantenimiento"
		SET "IdUbicacionConsumo" = NULL, "IdProveedorCompra" = NULL, "ComprobanteCompra" = NULL
		WHERE "Id" = "PIdOrden";
		RETURN 0;
	END IF;

	"vUbic"        = NULLIF("PConsumo"->>'IdUbicacionOrigen', '')::UUID;
	"vProveedor"   = NULLIF("PConsumo"->>'IdProveedor', '')::UUID;
	"vComprobante" = NULLIF("PConsumo"->>'Comprobante', '');

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PConsumo"->'Lineas')
	LOOP
		"vIdProducto" = ("vLinea"->>'IdProducto')::UUID;
		"vModo"       = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"       = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"      = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		SELECT "Nombre" INTO "vNombreProd" FROM "inv"."T_Producto"
		WHERE "Id" = "vIdProducto" AND "Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Producto invalido o inactivo en una linea de repuestos.';
		END IF;
		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad de % debe ser mayor a cero.', "vNombreProd";
		END IF;
		IF "vModo" NOT IN ('stock','compra') THEN
			RAISE EXCEPTION 'Modo de consumo invalido para %.', "vNombreProd";
		END IF;
		IF "vModo" = 'compra' THEN
			"vHayCompra" = TRUE;
			IF "vCosto" IS NULL OR "vCosto" <= 0 THEN
				RAISE EXCEPTION 'La compra directa de % requiere un costo unitario mayor a cero.', "vNombreProd";
			END IF;
		ELSE
			"vCosto" = NULL;
		END IF;

		INSERT INTO "inv"."T_OrdenMantenimientoRepuesto"
			("IdOrdenMantenimiento","IdProducto","Cantidad","Modo","CostoUnitarioCompra",
			 "UsuarioCreacion","UsuarioModificacion")
		VALUES ("PIdOrden", "vIdProducto", "vCant", "vModo", "vCosto", "PUsuario", "PUsuario");
		"vLineas" = "vLineas" + 1;
	END LOOP;

	IF "vHayCompra" AND ("vProveedor" IS NULL OR "vComprobante" IS NULL) THEN
		RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
	END IF;
	IF "vHayCompra" AND NOT EXISTS (
		SELECT 1 FROM "inv"."T_Proveedor" WHERE "Id" = "vProveedor" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El proveedor de la compra directa no existe o esta inactivo.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "IdUbicacionConsumo" = "vUbic",
		"IdProveedorCompra"  = CASE WHEN "vHayCompra" THEN "vProveedor" ELSE NULL END,
		"ComprobanteCompra"  = CASE WHEN "vHayCompra" THEN "vComprobante" ELSE NULL END
	WHERE "Id" = "PIdOrden";

	RETURN "vLineas";
END;
$$;

COMMENT ON FUNCTION "inv"."FnGuardarRepuestosOrdenMantenimiento"(UUID, JSONB, VARCHAR) IS 'Interna: reemplaza el borrador de repuestos de una OT (T_OrdenMantenimientoRepuesto + almacen/proveedor/comprobante de la cabecera) a partir de POrden.Consumo. Sin impacto en kardex. Devuelve la cantidad de lineas.';

/* ===== 3. FnRegistrarOrdenMantenimiento (base 0067): borrador, nace 'consumida' ===== */
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarOrdenMantenimiento"("POrden" jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	"vId"       UUID;
	"vUsuario"  VARCHAR(50);
	"vTrabajo"  JSONB;
	"vPersonal" TEXT;
	"vIdx"      INT := 0;
	"vNumero"   TEXT;
	"vPrefijo"  TEXT;
	"vFecha"    TEXT;
	"vPlaca"    TEXT;
	"vCorr"     INT := 1;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	IF JSONB_ARRAY_LENGTH(COALESCE("POrden"->'IdsPersonal','[]'::JSONB)) = 0 THEN
		RAISE EXCEPTION 'Asigna al menos un personal a la orden de mantenimiento.';
	END IF;

	/* N° de orden: si viene vacío, se autogenera PREFIJO-DDMMYYYY-PLACA-NN. */
	"vNumero" = NULLIF("POrden"->>'NumeroOrden', '');
	IF "vNumero" IS NULL THEN
		"vPrefijo" = CASE WHEN "POrden"->>'TipoMantenimiento' = 'correctivo'
			THEN 'CORR' ELSE 'PREV' END;
		"vFecha" = to_char(("POrden"->>'FechaOrden')::DATE, 'DDMMYYYY');

		SELECT UPPER(REGEXP_REPLACE(COALESCE("Placa", ''), '[^A-Za-z0-9]', '', 'g'))
		INTO "vPlaca"
		FROM "inv"."T_Vehiculo"
		WHERE "Id" = ("POrden"->>'IdVehiculo')::UUID;

		IF "vPlaca" IS NULL OR "vPlaca" = '' THEN
			RAISE EXCEPTION 'No se pudo resolver la placa del vehículo para el N° de orden.';
		END IF;

		LOOP
			"vNumero" = "vPrefijo" || '-' || "vFecha" || '-' || "vPlaca" || '-' || LPAD("vCorr"::TEXT, 2, '0');
			EXIT WHEN NOT EXISTS (
				SELECT 1 FROM "inv"."T_OrdenMantenimiento"
				WHERE "NumeroOrden" = "vNumero"
			);
			"vCorr" = "vCorr" + 1;
		END LOOP;
	END IF;

	/* Toda OT nueva nace "Por aprobar": editable (cabecera, trabajos, repuestos)
	   hasta que el admin la aprueba. El stock NO se toca aca. */
	INSERT INTO "inv"."T_OrdenMantenimiento"
	(
		"NumeroOrden","TipoMantenimiento","FechaOrden","Turno","Kilometraje","Horometro",
		"IdVehiculo","Observaciones","Situacion","UsuarioCreacion","UsuarioModificacion"
	)
	VALUES
	(
		"vNumero"
		,"POrden"->>'TipoMantenimiento'
		,("POrden"->>'FechaOrden')::DATE
		,"POrden"->>'Turno'
		,NULLIF("POrden"->>'Kilometraje','')::NUMERIC
		,NULLIF("POrden"->>'Horometro','')::NUMERIC
		,("POrden"->>'IdVehiculo')::UUID
		,NULLIF("POrden"->>'Observaciones','')
		,'consumida'
		,"vUsuario","vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vPersonal" IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT("POrden"->'IdsPersonal')
	LOOP
		"vIdx" = "vIdx" + 1;
		INSERT INTO "inv"."T_OrdenMantenimientoPersonal"
			("IdOrdenMantenimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
		VALUES ("vId", "vPersonal"::UUID, "vIdx", "vUsuario","vUsuario");
	END LOOP;

	/* Trabajos con foto opcional de antes/despues por tarea (0067). */
	FOR "vTrabajo" IN SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE("POrden"->'Trabajos','[]'::JSONB))
	LOOP
		INSERT INTO "inv"."T_OrdenMantenimientoTrabajo"
		(
			"IdOrdenMantenimiento","Secuencia","Descripcion","UrlFotoAntes","UrlFotoDespues",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,("vTrabajo"->>'Secuencia')::INT
			,"vTrabajo"->>'Descripcion'
			,NULLIF("vTrabajo"->>'UrlFotoAntes','')
			,NULLIF("vTrabajo"->>'UrlFotoDespues','')
			,"vUsuario","vUsuario"
		);
	END LOOP;

	/* Repuestos: borrador (se descuentan al aprobar). */
	PERFORM "inv"."FnGuardarRepuestosOrdenMantenimiento"("vId", "POrden"->'Consumo', "vUsuario");

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarOrdenMantenimiento"(JSONB) IS 'Alta de OT en un paso: cabecera + personal + trabajos (con fotos por tarea) + Consumo opcional como BORRADOR de repuestos (sin tocar stock). Toda OT nueva nace consumida (= por aprobar) y es editable hasta la aprobacion; el stock se descuenta en FnReconciliarOrdenMantenimiento. N° de orden autogenerado PREFIJO-DDMMYYYY-PLACA-NN si viene vacio.';

/* ===== 4. FnActualizarOrdenMantenimiento: abierta o por aprobar, con repuestos ===== */
CREATE OR REPLACE FUNCTION "inv"."FnActualizarOrdenMantenimiento"("PIdOrden" uuid, "POrden" jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"vOrden"    "inv"."T_OrdenMantenimiento";
	"vUsuario"  VARCHAR(50);
	"vTrabajo"  JSONB;
	"vPersonal" TEXT;
	"vIdx"      INT := 0;
	"vLineas"   INT;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" NOT IN ('abierta','consumida') THEN
		RAISE EXCEPTION 'Solo se edita una orden abierta o por aprobar (situacion actual: %).', "vOrden"."Situacion";
	END IF;
	IF "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Esta orden ya desconto stock (flujo anterior): no se edita. Apruebala o rechazala.';
	END IF;
	IF JSONB_ARRAY_LENGTH(COALESCE("POrden"->'IdsPersonal','[]'::JSONB)) = 0 THEN
		RAISE EXCEPTION 'Asigna al menos un personal a la orden de mantenimiento.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "NumeroOrden"         = NULLIF("POrden"->>'NumeroOrden', ''),
		"TipoMantenimiento"   = "POrden"->>'TipoMantenimiento',
		"FechaOrden"          = ("POrden"->>'FechaOrden')::DATE,
		"Turno"               = "POrden"->>'Turno',
		"Kilometraje"         = NULLIF("POrden"->>'Kilometraje', '')::NUMERIC,
		"Horometro"           = NULLIF("POrden"->>'Horometro', '')::NUMERIC,
		"IdVehiculo"          = ("POrden"->>'IdVehiculo')::UUID,
		"Observaciones"       = NULLIF("POrden"->>'Observaciones', ''),
		"UsuarioModificacion" = "vUsuario"
	WHERE "Id" = "PIdOrden";

	DELETE FROM "inv"."T_OrdenMantenimientoPersonal" WHERE "IdOrdenMantenimiento" = "PIdOrden";
	FOR "vPersonal" IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT("POrden"->'IdsPersonal')
	LOOP
		"vIdx" = "vIdx" + 1;
		INSERT INTO "inv"."T_OrdenMantenimientoPersonal"
			("IdOrdenMantenimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
		VALUES ("PIdOrden", "vPersonal"::UUID, "vIdx", "vUsuario","vUsuario");
	END LOOP;

	DELETE FROM "inv"."T_OrdenMantenimientoTrabajo" WHERE "IdOrdenMantenimiento" = "PIdOrden";
	FOR "vTrabajo" IN SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE("POrden"->'Trabajos', '[]'::JSONB))
	LOOP
		INSERT INTO "inv"."T_OrdenMantenimientoTrabajo"
		(
			"IdOrdenMantenimiento","Secuencia","Descripcion","UrlFotoAntes","UrlFotoDespues",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"PIdOrden"
			,("vTrabajo"->>'Secuencia')::INT
			,"vTrabajo"->>'Descripcion'
			,NULLIF("vTrabajo"->>'UrlFotoAntes','')
			,NULLIF("vTrabajo"->>'UrlFotoDespues','')
			,"vUsuario","vUsuario"
		);
	END LOOP;

	/* Repuestos: se reemplaza el borrador completo (agregar, subir, bajar, quitar).
	   Una OT abierta legada que recibe repuestos pasa a por aprobar; una por aprobar
	   se queda ahi aunque quede sin lineas (aprobar solo cerrara). */
	"vLineas" = "inv"."FnGuardarRepuestosOrdenMantenimiento"("PIdOrden", "POrden"->'Consumo', "vUsuario");
	IF "vOrden"."Situacion" = 'abierta' AND "vLineas" > 0 THEN
		UPDATE "inv"."T_OrdenMantenimiento" SET "Situacion" = 'consumida' WHERE "Id" = "PIdOrden";
	END IF;
END;
$$;

COMMENT ON FUNCTION "inv"."FnActualizarOrdenMantenimiento"(UUID, JSONB) IS 'Edita cabecera, personal, trabajos (con fotos por tarea) y el BORRADOR de repuestos (POrden.Consumo, reemplazo completo) de una OT abierta o por aprobar que aun no desconto stock. Una abierta con repuestos pasa a consumida (por aprobar). Rechaza OTs legadas con IdRequerimiento (ya descontaron).';

/* ===== 5. FnReconciliarOrdenMantenimiento: el descuento de stock ocurre AL APROBAR ===== */
CREATE OR REPLACE FUNCTION "inv"."FnReconciliarOrdenMantenimiento"("PIdOrden" uuid, "PAprobar" boolean, "PMotivo" character varying DEFAULT NULL::character varying)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'inv', 'public' AS $$
DECLARE
	"vOrden"       "inv"."T_OrdenMantenimiento";
	"vRol"         TEXT;
	"vUsuario"     VARCHAR(50);
	"vLegado"      BOOLEAN;
	"vRef"         TEXT;
	"vOrigen"      TEXT;
	"vIdReq"       UUID;
	"vRep"         RECORD;
	"vSalidaDet"   JSONB := '[]'::JSONB;
	"vCompraDet"   JSONB := '[]'::JSONB;
	"vIdSalida"    UUID;
	"vUbicOrigen"  UUID;
	"vReversaDet"  JSONB;
	"vIdReversa"   UUID;
	"vRevertidas"  INTEGER := 0;
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'consumida' THEN
		RAISE EXCEPTION 'Solo se aprueban o rechazan ordenes por aprobar (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	/* Defensa en profundidad: revalida requerimientoAprobar (funcion expuesta por RPC) */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para aprobar ordenes de mantenimiento.';
	END IF;
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	/* Legado (0033..0067): la OT ya desconto stock al registrarse. */
	"vLegado" = "vOrden"."IdRequerimiento" IS NOT NULL;

	/* Segregacion de funciones (admin exento): quien registro los repuestos no los
	   aprueba. Nuevo modelo: quien guardo el borrador (filas del borrador; si no hay,
	   quien creo la OT). Legado: quien registro el consumo (requerimiento). */
	IF auth.uid() IS NOT NULL AND COALESCE("vRol", '') <> 'admin' THEN
		IF "vLegado" THEN
			IF EXISTS (
				SELECT 1 FROM "inv"."T_Requerimiento"
				WHERE "Id" = "vOrden"."IdRequerimiento" AND "UsuarioCreacion" = auth.uid()::TEXT
			) THEN
				RAISE EXCEPTION 'No puedes aprobar una orden cuyo consumo tu mismo registraste.';
			END IF;
		ELSIF EXISTS (
			SELECT 1 FROM "inv"."T_OrdenMantenimientoRepuesto"
			WHERE "IdOrdenMantenimiento" = "PIdOrden" AND "UsuarioCreacion" = auth.uid()::TEXT
		) OR (
			NOT EXISTS (SELECT 1 FROM "inv"."T_OrdenMantenimientoRepuesto" WHERE "IdOrdenMantenimiento" = "PIdOrden")
			AND "vOrden"."UsuarioCreacion" = auth.uid()::TEXT
		) THEN
			RAISE EXCEPTION 'No puedes aprobar una orden cuyos repuestos tu mismo registraste.';
		END IF;
	END IF;

	"vRef" = 'OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8));

	/* ───────── APROBAR ───────── */
	IF "PAprobar" THEN
		IF NOT "vLegado" AND EXISTS (
			SELECT 1 FROM "inv"."T_OrdenMantenimientoRepuesto" WHERE "IdOrdenMantenimiento" = "PIdOrden"
		) THEN
			IF "vOrden"."IdUbicacionConsumo" IS NULL OR NOT EXISTS (
				SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vOrden"."IdUbicacionConsumo" AND "Estado" = TRUE
			) THEN
				RAISE EXCEPTION 'El almacen de origen de los repuestos no existe o esta inactivo.';
			END IF;

			"vOrigen" = CASE WHEN "vOrden"."TipoMantenimiento" = 'correctivo'
				THEN 'desgaste_prematuro' ELSE 'planificado' END;

			/* Requerimiento enlazado (trazabilidad + reportes): nace y se atiende aca. */
			INSERT INTO "inv"."T_Requerimiento"
			(
				"NumeroRequerimiento", "FechaRequerimiento", "Origen", "IdVehiculo",
				"Situacion", "Notas", "UsuarioCreacion", "UsuarioModificacion"
			)
			VALUES
			(
				"vOrden"."NumeroOrden", "vOrden"."FechaOrden", "vOrigen", "vOrden"."IdVehiculo",
				'pendiente', "vRef", "vUsuario", "vUsuario"
			)
			RETURNING "Id" INTO "vIdReq";

			/* Solicitantes = TODOS los personales de la OT. */
			INSERT INTO "inv"."T_RequerimientoPersonal"
				("IdRequerimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
			SELECT "vIdReq", "IdPersonal", "Orden", "vUsuario", "vUsuario"
			FROM "inv"."T_OrdenMantenimientoPersonal"
			WHERE "IdOrdenMantenimiento" = "PIdOrden" AND "Estado" = TRUE;

			FOR "vRep" IN
				SELECT R."IdProducto", R."Cantidad", R."Modo", R."CostoUnitarioCompra", P."Nombre"
				FROM "inv"."T_OrdenMantenimientoRepuesto" R
				JOIN "inv"."T_Producto" P ON P."Id" = R."IdProducto"
				WHERE R."IdOrdenMantenimiento" = "PIdOrden"
				ORDER BY R."FechaCreacion", R."Id"
			LOOP
				INSERT INTO "inv"."T_RequerimientoDetalle"
				(
					"IdRequerimiento", "IdProducto", "Cantidad", "CantidadAtendida", "IdVehiculo",
					"UsuarioCreacion", "UsuarioModificacion"
				)
				VALUES ("vIdReq", "vRep"."IdProducto", "vRep"."Cantidad", "vRep"."Cantidad",
				        "vOrden"."IdVehiculo", "vUsuario", "vUsuario");

				"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT(
					'IdProducto', "vRep"."IdProducto", 'Cantidad', "vRep"."Cantidad",
					'IdVehiculo', "vOrden"."IdVehiculo"
				);

				IF "vRep"."Modo" = 'compra' THEN
					IF "vOrden"."IdProveedorCompra" IS NULL OR "vOrden"."ComprobanteCompra" IS NULL THEN
						RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
					END IF;
					"vCompraDet" = "vCompraDet" || JSONB_BUILD_OBJECT(
						'IdProducto', "vRep"."IdProducto", 'Cantidad', "vRep"."Cantidad",
						'CostoUnitario', "vRep"."CostoUnitarioCompra"
					);
				END IF;
			END LOOP;

			/* Compra directa: entrada primero (recalcula promedio movil) */
			IF JSONB_ARRAY_LENGTH("vCompraDet") > 0 THEN
				PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
					'TipoDocumento',      'entrada',
					'FechaDocumento',     to_char(CURRENT_DATE, 'YYYY-MM-DD'),
					'IdUbicacionDestino', "vOrden"."IdUbicacionConsumo",
					'IdProveedor',        "vOrden"."IdProveedorCompra",
					'Comprobante',        "vOrden"."ComprobanteCompra",
					'Referencia',         LEFT('Compra directa ' || "vRef", 120),
					'Notas',              'Compra inmediata para mantenimiento',
					'Detalle',            "vCompraDet"
				));
			END IF;

			/* Salida del consumo (valorizada al costo promedio movil vigente): ESTE es el
			   descuento de stock que el admin acaba de aprobar. */
			"vIdSalida" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
				'TipoDocumento',     'salida',
				'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
				'IdUbicacionOrigen', "vOrden"."IdUbicacionConsumo",
				'IdVehiculo',        "vOrden"."IdVehiculo",
				'Referencia',        LEFT("vRef", 120),
				'Notas',             'Consumo de repuestos de mantenimiento (aprobado)',
				'Detalle',           "vSalidaDet"
			));

			INSERT INTO "inv"."T_RequerimientoAtencion"
				("IdRequerimiento", "IdDocumentoInventario", "UsuarioCreacion", "UsuarioModificacion")
			VALUES ("vIdReq", "vIdSalida", "vUsuario", "vUsuario");

			UPDATE "inv"."T_Requerimiento"
			SET "Situacion" = 'atendido', "IdDocumentoInventario" = "vIdSalida"
			WHERE "Id" = "vIdReq";

			UPDATE "inv"."T_OrdenMantenimiento"
			SET "IdRequerimiento" = "vIdReq"
			WHERE "Id" = "PIdOrden";
		END IF;

		UPDATE "inv"."T_OrdenMantenimiento"
		SET "Situacion" = 'cerrada',
			"FechaReconciliacion" = NOW(),
			"MotivoReconciliacion" = NULLIF("PMotivo", '')
		WHERE "Id" = "PIdOrden";
		RETURN;
	END IF;

	/* ───────── RECHAZAR ───────── */
	IF NOT "vLegado" THEN
		/* Nuevo modelo: nada salio del almacen; se anula sin tocar el kardex. El
		   borrador se conserva como evidencia de lo que se rechazo. */
		UPDATE "inv"."T_OrdenMantenimiento"
		SET "Situacion" = 'anulada',
			"FechaReconciliacion" = NOW(),
			"MotivoReconciliacion" = NULLIF("PMotivo", '')
		WHERE "Id" = "PIdOrden";
		RETURN;
	END IF;

	/* Legado: una entrada de reversa por almacen de origen, con los egresos de TODAS
	   las salidas del requerimiento al CostoUnitario exacto del ledger (0066). */
	FOR "vUbicOrigen", "vReversaDet" IN
		SELECT D."IdUbicacionOrigen",
		       JSONB_AGG(JSONB_BUILD_OBJECT(
		           'IdProducto',    M."IdProducto",
		           'Cantidad',      M."Cantidad",
		           'CostoUnitario', M."CostoUnitario"
		       ))
		FROM "inv"."T_RequerimientoAtencion" A
		JOIN "inv"."T_DocumentoInventario"   D ON D."Id" = A."IdDocumentoInventario"
		JOIN "inv"."T_MovimientoStock"       M ON M."IdDocumentoInventario" = D."Id" AND M."Direccion" = -1
		WHERE A."IdRequerimiento" = "vOrden"."IdRequerimiento" AND A."Estado" = TRUE
		GROUP BY D."IdUbicacionOrigen"
	LOOP
		"vIdReversa" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			'TipoDocumento',      'entrada',
			'FechaDocumento',     to_char(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionDestino', "vUbicOrigen",
			'IdVehiculo',         "vOrden"."IdVehiculo",
			'Referencia',         LEFT('Reversa ' || "vRef", 120),
			'Notas',              'Reversa contable por rechazo de orden de mantenimiento',
			'Detalle',            "vReversaDet"
		));
		"vRevertidas" = "vRevertidas" + 1;
	END LOOP;

	IF "vRevertidas" = 0 THEN
		RAISE EXCEPTION 'No se encontro ninguna salida de consumo a revertir.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "Situacion" = 'anulada',
		"IdDocumentoInventarioReversa" = "vIdReversa",
		"FechaReconciliacion" = NOW(),
		"MotivoReconciliacion" = NULLIF("PMotivo", '')
	WHERE "Id" = "PIdOrden";

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'anulado',
		"Notas" = CASE
			WHEN "PMotivo" IS NULL OR "PMotivo" = '' THEN "Notas"
			ELSE LEFT(COALESCE("Notas" || ' | ', '') || 'Rechazado: ' || "PMotivo", 500)
		END
	WHERE "Id" = "vOrden"."IdRequerimiento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnReconciliarOrdenMantenimiento"(UUID, BOOLEAN, VARCHAR) IS 'Aprueba o rechaza una OT por aprobar. APROBAR = descontar stock: convierte el borrador (T_OrdenMantenimientoRepuesto) en requerimiento atendido + entrada por compra directa + salida + T_RequerimientoAtencion, y cierra; sin repuestos solo cierra. RECHAZAR anula sin tocar el kardex. OTs legadas (IdRequerimiento ya seteado al registrarse): aprobar solo cierra; rechazar emite reversa(s) al CostoUnitario del ledger. SECURITY DEFINER; quien registro los repuestos no aprueba (admin exento).';

/* ===== 6. FnEliminarOrdenMantenimiento: eliminable mientras no haya kardex ===== */
CREATE OR REPLACE FUNCTION "inv"."FnEliminarOrdenMantenimiento"("PIdOrden" uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'inv', 'public' AS $$
DECLARE
	"vOrden" "inv"."T_OrdenMantenimiento";
	"vRol"   TEXT;
BEGIN
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','almacenero','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para eliminar ordenes de mantenimiento.'
			USING ERRCODE = '42501';
	END IF;

	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;

	IF "vOrden"."Situacion" NOT IN ('abierta','consumida') OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Solo se elimina una orden abierta o por aprobar que no haya descontado stock.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento" SET "Estado" = FALSE WHERE "Id" = "PIdOrden";
END;
$$;

COMMENT ON FUNCTION "inv"."FnEliminarOrdenMantenimiento"(UUID) IS 'Soft-delete atomico de una OT abierta o por aprobar sin stock descontado (IdRequerimiento IS NULL). Las que ya descontaron se rechazan (reversa), no se eliminan. SECURITY DEFINER; revalida requerimientoCrear.';

/* ===== 7. FnCerrarOrdenMantenimiento (legado abiertas): tambien sin borrador ===== */
CREATE OR REPLACE FUNCTION "inv"."FnCerrarOrdenMantenimiento"("PIdOrden" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"vOrden" "inv"."T_OrdenMantenimiento";
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL
	   OR EXISTS (SELECT 1 FROM "inv"."T_OrdenMantenimientoRepuesto" WHERE "IdOrdenMantenimiento" = "PIdOrden") THEN
		RAISE EXCEPTION 'Solo se cierra directamente una orden abierta sin repuestos. Si tiene repuestos, va por aprobacion.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento" SET "Situacion" = 'cerrada' WHERE "Id" = "PIdOrden";
END;
$$;

COMMENT ON FUNCTION "inv"."FnCerrarOrdenMantenimiento"(UUID) IS 'Cierra una OT abierta legada sin repuestos (solo mano de obra). Con repuestos en borrador la OT va por aprobacion.';

/* ===== 8. Fin del consumo previo a la aprobacion ===== */
DROP FUNCTION IF EXISTS "inv"."FnConsumirRepuestosOrdenMantenimiento"(uuid, jsonb);

/* ===== 9. Vista del borrador resuelto (para el detalle/edicion de la OT) ===== */
CREATE OR REPLACE VIEW "inv"."V_OrdenMantenimientoRepuesto" WITH (security_invoker = true) AS
SELECT
	R."Id",
	R."IdOrdenMantenimiento",
	R."IdProducto",
	P."Nombre"                 AS "NombreProducto",
	P."Sku",
	UM."Codigo"                AS "CodigoUnidad",
	R."Cantidad",
	R."Modo",
	R."CostoUnitarioCompra",
	/* Costo ESTIMADO mientras esta por aprobar: compra directa al costo declarado,
	   stock al promedio movil vigente. El costo real lo congela el ledger al aprobar. */
	CASE WHEN R."Modo" = 'compra' THEN R."CostoUnitarioCompra" ELSE P."CostoPromedio" END AS "CostoUnitario",
	R."FechaCreacion"
FROM "inv"."T_OrdenMantenimientoRepuesto" R
	JOIN "inv"."T_Producto" P ON P."Id" = R."IdProducto"
	LEFT JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
WHERE R."Estado" = TRUE;

COMMENT ON VIEW "inv"."V_OrdenMantenimientoRepuesto" IS 'Borrador de repuestos de una OT con producto, unidad y costo estimado (compra: declarado; stock: promedio movil vigente). security_invoker: respeta la RLS del usuario. Para OTs ya aprobadas el costo real esta en el ledger (T_MovimientoStock de las salidas del requerimiento).';
