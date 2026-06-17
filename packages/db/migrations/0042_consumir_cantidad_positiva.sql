/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnConsumirRepuestosOrdenMantenimiento (REPLACE)
	Tipo de Cambio: REPLACE - rechazar cantidad <= 0 (auditoria QA)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: HALLAZGO A6 — una linea de consumo con Cantidad <= 0 se descartaba en
	             silencio (CONTINUE). La funcion es SECURITY DEFINER expuesta por RPC
	             (Zod no aplica si se invoca directo), por lo que un payload con 0 se
	             ignoraba sin avisar, generando un requerimiento posiblemente vacio.
	             Ahora se rechaza con error explicito por producto. Se reordena para
	             obtener el nombre del producto antes de validar la cantidad.
	             (Resto de la funcion identico a 0033.)
*/
CREATE OR REPLACE FUNCTION "inv"."FnConsumirRepuestosOrdenMantenimiento"
(
	"PIdOrden"  UUID,
	"PConsumo"  JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vOrden"       "inv"."T_OrdenMantenimiento";
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vUsuario"     VARCHAR(50);
	"vOrigen"      TEXT;
	"vIdReq"       UUID;
	"vLinea"       JSONB;
	"vIdProducto"  UUID;
	"vModo"        TEXT;
	"vCant"        NUMERIC;
	"vCosto"       NUMERIC;
	"vNombreProd"  TEXT;
	"vSalidaDet"   JSONB := '[]'::JSONB;
	"vCompraDet"   JSONB := '[]'::JSONB;
	"vIdSalida"    UUID;
	"vRef"         TEXT;
	"vRol"         TEXT;
BEGIN
	/* Defensa en profundidad: la API ya valida requerimientoCrear, pero esta
	   función es SECURITY DEFINER y queda expuesta por RPC; revalidamos el rol. */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','almacenero','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para consumir repuestos de mantenimiento.';
	END IF;

	"vUsuario"     = COALESCE(auth.uid()::TEXT, 'API');
	"vUbic"        = NULLIF("PConsumo"->>'IdUbicacionOrigen', '')::UUID;
	"vProveedor"   = NULLIF("PConsumo"->>'IdProveedor', '')::UUID;
	"vComprobante" = NULLIF("PConsumo"->>'Comprobante', '');

	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Solo se consumen repuestos en una orden abierta sin requerimiento (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	"vOrigen" = CASE WHEN "vOrden"."TipoMantenimiento" = 'correctivo'
		THEN 'desgaste_prematuro' ELSE 'planificado' END;
	"vRef" = 'OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8));

	/* Cabecera del requerimiento (pendiente; pasa a atendido al final) */
	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento", "FechaRequerimiento", "Origen", "IdVehiculo",
		"IdPersonalSolicitante", "Situacion", "Notas", "UsuarioCreacion", "UsuarioModificacion"
	)
	VALUES
	(
		"vOrden"."NumeroOrden", "vOrden"."FechaOrden", "vOrigen", "vOrden"."IdVehiculo",
		"vOrden"."IdMecanicoResponsable", 'pendiente', "vRef", "vUsuario", "vUsuario"
	)
	RETURNING "Id" INTO "vIdReq";

	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PConsumo"->'Lineas')
	LOOP
		"vIdProducto" = ("vLinea"->>'IdProducto')::UUID;
		"vModo"       = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"       = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"      = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		SELECT "Nombre" INTO "vNombreProd" FROM "inv"."T_Producto"
		WHERE "Id" = "vIdProducto" AND "Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Producto invalido o inactivo en una linea de consumo.';
		END IF;

		/* A6: cantidad invalida se RECHAZA (antes se descartaba con CONTINUE) */
		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad a consumir de % debe ser mayor a cero.', "vNombreProd";
		END IF;

		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento", "IdProducto", "Cantidad", "CantidadAtendida",
			"UsuarioCreacion", "UsuarioModificacion"
		)
		VALUES ("vIdReq", "vIdProducto", "vCant", "vCant", "vUsuario", "vUsuario");

		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', "vCant");

		IF "vModo" = 'compra' THEN
			IF "vProveedor" IS NULL OR "vComprobante" IS NULL THEN
				RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
			END IF;
			IF "vCosto" IS NULL OR "vCosto" <= 0 THEN
				RAISE EXCEPTION 'La compra directa de % requiere un costo unitario mayor a cero.', "vNombreProd";
			END IF;
			"vCompraDet" = "vCompraDet" || JSONB_BUILD_OBJECT(
				'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'CostoUnitario', "vCosto"
			);
		END IF;
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vSalidaDet") = 0 THEN
		RAISE EXCEPTION 'No se especifico ningun repuesto a consumir.';
	END IF;

	/* Compra directa: entrada primero (recalcula promedio movil) */
	IF JSONB_ARRAY_LENGTH("vCompraDet") > 0 THEN
		PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			'TipoDocumento',      'entrada',
			'FechaDocumento',     to_char(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionDestino', "vUbic",
			'IdProveedor',        "vProveedor",
			'Comprobante',        "vComprobante",
			'Referencia',         'Compra directa ' || "vRef",
			'Notas',              'Compra inmediata para mantenimiento',
			'Detalle',            "vCompraDet"
		));
	END IF;

	/* Salida del consumo (valorizada al costo promedio movil vigente) */
	"vIdSalida" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "vUbic",
		'IdVehiculo',        "vOrden"."IdVehiculo",
		'Referencia',        "vRef",
		'Notas',             'Consumo de repuestos de mantenimiento',
		'Detalle',           "vSalidaDet"
	));

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido', "IdDocumentoInventario" = "vIdSalida"
	WHERE "Id" = "vIdReq";

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "IdRequerimiento" = "vIdReq", "Situacion" = 'consumida'
	WHERE "Id" = "PIdOrden";

	RETURN "vIdSalida";
END;
$$;

COMMENT ON FUNCTION "inv"."FnConsumirRepuestosOrdenMantenimiento"(UUID, JSONB) IS 'Consumo provisional (Model 2): crea el requerimiento enlazado y genera la salida de inmediato. Cantidad <= 0 se rechaza (A6). SECURITY DEFINER; revalida requerimientoCrear. La OT pasa a consumida (por aprobar).';
