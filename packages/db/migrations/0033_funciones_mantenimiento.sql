/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: Funciones de Órdenes de Trabajo de Mantenimiento (OT)
	Tipo de Cambio: CREATE/REPLACE - registrar/consumir/reconciliar/cerrar/anular + dependencias
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: Flujo "consumir y reconciliar" (Model 2). FnConsumir genera la salida
	             de inmediato (consumo provisional) creando un requerimiento enlazado;
	             FnReconciliar la ratifica (cerrada) o la rechaza generando una ENTRADA
	             de reversa al CostoUnitario exacto leído del ledger (la entrada de
	             compra directa NO se revierte; los bienes existen). El kardex es
	             inmutable: el rechazo nunca borra movimientos, compensa con una entrada.
*/

/* ============================================================
   FnRegistrarOrdenMantenimiento — crea la OT (abierta) + trabajos
   ============================================================ */
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarOrdenMantenimiento"
(
	"POrden" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"      UUID;
	"vUsuario" VARCHAR(50);
	"vTrabajo" JSONB;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_OrdenMantenimiento"
	(
		"NumeroOrden"
		,"TipoMantenimiento"
		,"FechaOrden"
		,"Turno"
		,"Kilometraje"
		,"IdVehiculo"
		,"IdMecanicoResponsable"
		,"Observaciones"
		,"Situacion"
		,"UsuarioCreacion"
		,"UsuarioModificacion"
	)
	VALUES
	(
		NULLIF("POrden"->>'NumeroOrden', '')
		,"POrden"->>'TipoMantenimiento'
		,("POrden"->>'FechaOrden')::DATE
		,"POrden"->>'Turno'
		,NULLIF("POrden"->>'Kilometraje', '')::NUMERIC
		,("POrden"->>'IdVehiculo')::UUID
		,("POrden"->>'IdMecanicoResponsable')::UUID
		,NULLIF("POrden"->>'Observaciones', '')
		,'abierta'
		,"vUsuario"
		,"vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vTrabajo" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE("POrden"->'Trabajos', '[]'::JSONB))
	LOOP
		INSERT INTO "inv"."T_OrdenMantenimientoTrabajo"
		(
			"IdOrdenMantenimiento"
			,"Secuencia"
			,"Descripcion"
			,"UsuarioCreacion"
			,"UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,("vTrabajo"->>'Secuencia')::INT
			,"vTrabajo"->>'Descripcion'
			,"vUsuario"
			,"vUsuario"
		);
	END LOOP;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarOrdenMantenimiento"(JSONB) IS 'Crea una orden de mantenimiento (abierta) con su lista de trabajos desde JSON.';

/* ============================================================
   FnConsumirRepuestosOrdenMantenimiento — consumo provisional
   Crea el requerimiento enlazado y genera la salida YA (Model 2).
   ============================================================ */
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

		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			CONTINUE;
		END IF;

		SELECT "Nombre" INTO "vNombreProd" FROM "inv"."T_Producto"
		WHERE "Id" = "vIdProducto" AND "Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Producto invalido o inactivo en una linea de consumo.';
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

COMMENT ON FUNCTION "inv"."FnConsumirRepuestosOrdenMantenimiento"(UUID, JSONB) IS 'Consumo provisional (Model 2): crea el requerimiento enlazado y genera la salida de inmediato (modo stock/compra). La OT pasa a consumida (por aprobar). SECURITY DEFINER; el control vive en la API (requerimientoCrear).';

/* ============================================================
   FnReconciliarOrdenMantenimiento — aprobar (cerrar) o rechazar (reversa)
   ============================================================ */
CREATE OR REPLACE FUNCTION "inv"."FnReconciliarOrdenMantenimiento"
(
	"PIdOrden" UUID,
	"PAprobar" BOOLEAN,
	"PMotivo"  VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vOrden"       "inv"."T_OrdenMantenimiento";
	"vRol"         TEXT;
	"vConsumidor"  TEXT;
	"vIdSalida"    UUID;
	"vUbicOrigen"  UUID;
	"vReversaDet"  JSONB;
	"vIdReversa"   UUID;
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'consumida' THEN
		RAISE EXCEPTION 'Solo se reconcilian ordenes consumidas (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	/* Defensa en profundidad: revalida requerimientoAprobar (función expuesta por RPC) */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para reconciliar ordenes de mantenimiento.';
	END IF;

	/* Segregación de funciones: quien CONSUMIÓ no ratifica su propio consumo (admin
	   exento). El consumidor se registra en el requerimiento enlazado, NO en el
	   encabezado de la OT (que pudo crear otra persona). */
	SELECT "UsuarioCreacion" INTO "vConsumidor"
	FROM "inv"."T_Requerimiento" WHERE "Id" = "vOrden"."IdRequerimiento";
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vConsumidor"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes reconciliar una orden cuyo consumo tu mismo registraste.';
	END IF;

	IF "PAprobar" THEN
		UPDATE "inv"."T_OrdenMantenimiento"
		SET "Situacion" = 'cerrada',
			"FechaReconciliacion" = NOW(),
			"MotivoReconciliacion" = NULLIF("PMotivo", '')
		WHERE "Id" = "PIdOrden";
		RETURN;
	END IF;

	/* Rechazo: entrada de reversa al CostoUnitario exacto de la salida original */
	SELECT "IdDocumentoInventario" INTO "vIdSalida"
	FROM "inv"."T_Requerimiento" WHERE "Id" = "vOrden"."IdRequerimiento";
	IF "vIdSalida" IS NULL THEN
		RAISE EXCEPTION 'No se encontro la salida de consumo a revertir.';
	END IF;

	SELECT "IdUbicacionOrigen" INTO "vUbicOrigen"
	FROM "inv"."T_DocumentoInventario" WHERE "Id" = "vIdSalida";

	SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
		'IdProducto', "IdProducto",
		'Cantidad', "Cantidad",
		'CostoUnitario', "CostoUnitario"
	))
	INTO "vReversaDet"
	FROM "inv"."T_MovimientoStock"
	WHERE "IdDocumentoInventario" = "vIdSalida" AND "Direccion" = -1;

	IF "vReversaDet" IS NULL THEN
		RAISE EXCEPTION 'La salida original no tiene movimientos de egreso a revertir.';
	END IF;

	"vIdReversa" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',      'entrada',
		'FechaDocumento',     to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionDestino', "vUbicOrigen",
		'IdVehiculo',         "vOrden"."IdVehiculo",
		'Referencia',         'Reversa OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8)),
		'Notas',              'Reversa contable por rechazo de orden de mantenimiento',
		'Detalle',            "vReversaDet"
	));

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

COMMENT ON FUNCTION "inv"."FnReconciliarOrdenMantenimiento"(UUID, BOOLEAN, VARCHAR) IS 'Reconcilia una OT consumida: aprobar -> cerrada; rechazar -> anulada + entrada de reversa al CostoUnitario exacto del ledger (la entrada de compra directa NO se revierte). SECURITY DEFINER; control en la API (requerimientoAprobar); creador != aprobador (admin exento). La reversa es contable, no fisica.';

/* ============================================================
   FnCerrarOrdenMantenimiento / FnAnularOrdenMantenimiento
   Para OTs abiertas SIN repuestos (cierre directo o cancelacion).
   ============================================================ */
CREATE OR REPLACE FUNCTION "inv"."FnCerrarOrdenMantenimiento"
(
	"PIdOrden" UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	"vOrden" "inv"."T_OrdenMantenimiento";
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Solo se cierra directamente una orden abierta sin repuestos. Si tiene consumo, usa reconciliar.';
	END IF;
	UPDATE "inv"."T_OrdenMantenimiento" SET "Situacion" = 'cerrada' WHERE "Id" = "PIdOrden";
END;
$$;

COMMENT ON FUNCTION "inv"."FnCerrarOrdenMantenimiento"(UUID) IS 'Cierra una OT abierta sin repuestos (solo mano de obra).';

CREATE OR REPLACE FUNCTION "inv"."FnAnularOrdenMantenimiento"
(
	"PIdOrden" UUID,
	"PMotivo"  VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	"vOrden" "inv"."T_OrdenMantenimiento";
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Solo se anula una orden abierta sin repuestos. Si tiene consumo, usa reconciliar (rechazar).';
	END IF;
	UPDATE "inv"."T_OrdenMantenimiento"
	SET "Situacion" = 'anulada',
		"MotivoReconciliacion" = NULLIF("PMotivo", '')
	WHERE "Id" = "PIdOrden";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAnularOrdenMantenimiento"(UUID, VARCHAR) IS 'Anula una OT abierta sin repuestos (cancelacion sin impacto en stock).';

/* ============================================================
   FnContarDependencias — + ordenMantenimiento; extiende vehiculo y personal
   ============================================================ */
CREATE OR REPLACE FUNCTION "inv"."FnContarDependencias"
(
	"PEntidad" TEXT
	,"PId"     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vResultado" JSONB;
	"vTotal"     NUMERIC;
BEGIN
	IF "PEntidad" = 'producto' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'movimientos', (SELECT COUNT(*) FROM "inv"."T_MovimientoStock" WHERE "IdProducto" = "PId"),
			'detalleDocumentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventarioDetalle" WHERE "IdProducto" = "PId"),
			'detalleRequerimientos', (SELECT COUNT(*) FROM "inv"."T_RequerimientoDetalle" WHERE "IdProducto" = "PId"),
			'stockDisponible', (SELECT COALESCE(SUM("CantidadDisponible"), 0) FROM "inv"."T_SaldoStock" WHERE "IdProducto" = "PId")
		);
	ELSIF "PEntidad" = 'proveedor' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdProveedor" = "PId"),
			'precios', (SELECT COUNT(*) FROM "inv"."T_ProductoPrecioHistorico" WHERE "IdProveedor" = "PId")
		);
	ELSIF "PEntidad" = 'ubicacion' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdUbicacionOrigen" = "PId" OR "IdUbicacionDestino" = "PId"),
			'movimientos', (SELECT COUNT(*) FROM "inv"."T_MovimientoStock" WHERE "IdUbicacion" = "PId"),
			'stockDisponible', (SELECT COALESCE(SUM("CantidadDisponible"), 0) FROM "inv"."T_SaldoStock" WHERE "IdUbicacion" = "PId")
		);
	ELSIF "PEntidad" = 'equipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'vehiculos', (SELECT COUNT(*) FROM "inv"."T_Vehiculo" WHERE "IdEquipo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdEquipo" = "PId")
		);
	ELSIF "PEntidad" = 'vehiculo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdVehiculo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdVehiculo" = "PId"),
			'ordenesMantenimiento', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "IdVehiculo" = "PId")
		);
	ELSIF "PEntidad" = 'tipoEquipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'equipos', (SELECT COUNT(*) FROM "inv"."T_Equipo" WHERE "IdTipoEquipo" = "PId"),
			'productosAsociados', (SELECT COUNT(*) FROM "inv"."T_ProductoTipoEquipo" WHERE "IdTipoEquipo" = "PId")
		);
	ELSIF "PEntidad" = 'categoria' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'productos', (SELECT COUNT(*) FROM "inv"."T_Producto" WHERE "IdCategoria" = "PId" AND "Estado" = TRUE),
			'subcategorias', (SELECT COUNT(*) FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'cargo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'personal', (SELECT COUNT(*) FROM "inv"."T_Personal" WHERE "IdCargo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'personal' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdPersonalSolicitante" = "PId"),
			'ordenesComoMecanico', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "IdMecanicoResponsable" = "PId")
		);
	ELSIF "PEntidad" = 'ordenMantenimiento' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'requerimiento', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "Id" = "PId" AND "IdRequerimiento" IS NOT NULL)
		);
	ELSE
		RAISE EXCEPTION 'Entidad no soportada para verificacion de dependencias: %', "PEntidad";
	END IF;

	SELECT COALESCE(SUM(value::NUMERIC), 0) INTO "vTotal"
	FROM JSONB_EACH_TEXT("vResultado");

	RETURN "vResultado"
		|| JSONB_BUILD_OBJECT('total', "vTotal")
		|| JSONB_BUILD_OBJECT('puedeEliminar', "vTotal" = 0);
END;
$$;

COMMENT ON FUNCTION "inv"."FnContarDependencias"(TEXT, UUID) IS 'Cuenta datos enlazados de una entidad (incluye ordenMantenimiento; vehiculo y personal cuentan OTs). puedeEliminar=true solo si total=0.';
