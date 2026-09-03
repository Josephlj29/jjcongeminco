/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnConsumirRepuestosOrdenMantenimiento (REPLACE),
	        inv.FnReconciliarOrdenMantenimiento (REPLACE),
	        inv.T_RequerimientoAtencion (backfill)
	Tipo de Cambio: REPLACE + DML - agregar repuestos a una OT ya consumida
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Descripcion: CASO DE CAMPO. Al revisar una OT "por aprobar" (situacion consumida)
	             se detecta que faltó cargar algun repuesto. Hasta ahora la unica
	             salida era RECHAZAR (reversa contable + OT anulada) y crear otra OT
	             desde cero. Se habilita el consumo ADICIONAL:

	               1. FnConsumirRepuestosOrdenMantenimiento acepta OTs en situacion
	                  'consumida': reutiliza el requerimiento enlazado, suma las
	                  lineas al detalle (misma fila si el producto ya estaba) y genera
	                  una NUEVA salida (Referencia "OT xxx (adicional)"). El stock se
	                  descuenta al momento, igual que el consumo inicial (Model 2).
	                  En 'abierta' se comporta como antes (crea el requerimiento).

	               2. Cada salida se registra en T_RequerimientoAtencion (la tabla de
	                  0058 que ya modela "varias entregas por requerimiento"). El
	                  consumo de OT nunca la poblaba: se hace backfill de las
	                  requerimientos que solo tenian IdDocumentoInventario.
	                  T_Requerimiento.IdDocumentoInventario sigue apuntando a la
	                  ULTIMA salida (atajo, misma convencion que 0058).

	               3. FnReconciliarOrdenMantenimiento (rechazo) revierte TODAS las
	                  salidas del requerimiento, no solo la ultima: agrupa los
	                  egresos por almacen de origen y emite una entrada de reversa
	                  por almacen al CostoUnitario exacto del ledger.
	                  IdDocumentoInventarioReversa guarda la ultima emitida.

	             La API (GET /api/mantenimiento/:id) lee los repuestos desde todas
	             las salidas de T_RequerimientoAtencion. Sin cambios de esquema.
*/

/* ===== 1. Backfill: salidas de consumo de OT sin fila en T_RequerimientoAtencion ===== */
INSERT INTO "inv"."T_RequerimientoAtencion" ("IdRequerimiento", "IdDocumentoInventario")
SELECT r."Id", r."IdDocumentoInventario"
FROM "inv"."T_Requerimiento" r
WHERE r."IdDocumentoInventario" IS NOT NULL
  AND NOT EXISTS (
	SELECT 1 FROM "inv"."T_RequerimientoAtencion" a
	WHERE a."IdRequerimiento" = r."Id"
	  AND a."IdDocumentoInventario" = r."IdDocumentoInventario"
  );

/* ===== 2. FnConsumirRepuestosOrdenMantenimiento: abierta -> crea; consumida -> agrega ===== */
CREATE OR REPLACE FUNCTION "inv"."FnConsumirRepuestosOrdenMantenimiento"("PIdOrden" uuid, "PConsumo" jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'inv', 'public' AS $$
DECLARE
	"vOrden"       "inv"."T_OrdenMantenimiento";
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vUsuario"     VARCHAR(50);
	"vOrigen"      TEXT;
	"vIdReq"       UUID;
	"vAdicional"   BOOLEAN := FALSE;
	"vLinea"       JSONB;
	"vIdProducto"  UUID;
	"vIdDetalle"   UUID;
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
	   funcion es SECURITY DEFINER y queda expuesta por RPC; revalidamos el rol. */
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

	IF "vOrden"."Situacion" = 'abierta' AND "vOrden"."IdRequerimiento" IS NULL THEN
		"vAdicional" = FALSE;
	ELSIF "vOrden"."Situacion" = 'consumida' AND "vOrden"."IdRequerimiento" IS NOT NULL THEN
		"vAdicional" = TRUE;
	ELSE
		RAISE EXCEPTION 'Solo se consumen repuestos en una orden abierta o por aprobar (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	"vRef" = 'OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8));

	IF "vAdicional" THEN
		/* Consumo adicional: reutiliza el requerimiento enlazado (bloqueado). */
		"vIdReq" = "vOrden"."IdRequerimiento";
		PERFORM 1 FROM "inv"."T_Requerimiento"
		WHERE "Id" = "vIdReq" AND "Estado" = TRUE FOR UPDATE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'El requerimiento enlazado a la orden no existe.';
		END IF;
		"vRef" = "vRef" || ' (adicional)';
	ELSE
		"vOrigen" = CASE WHEN "vOrden"."TipoMantenimiento" = 'correctivo'
			THEN 'desgaste_prematuro' ELSE 'planificado' END;

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
			RAISE EXCEPTION 'Producto invalido o inactivo en una linea de consumo.';
		END IF;

		/* A6: cantidad invalida se RECHAZA (nunca se descarta en silencio) */
		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad a consumir de % debe ser mayor a cero.', "vNombreProd";
		END IF;

		/* Detalle del requerimiento: si el producto ya estaba (consumo adicional del
		   mismo repuesto) se acumula en la misma fila; si no, fila nueva. */
		"vIdDetalle" = NULL;
		IF "vAdicional" THEN
			SELECT "Id" INTO "vIdDetalle" FROM "inv"."T_RequerimientoDetalle"
			WHERE "IdRequerimiento" = "vIdReq" AND "IdProducto" = "vIdProducto" AND "Estado" = TRUE
			ORDER BY "FechaCreacion" LIMIT 1;
		END IF;

		IF "vIdDetalle" IS NOT NULL THEN
			UPDATE "inv"."T_RequerimientoDetalle"
			SET "Cantidad"            = "Cantidad" + "vCant",
				"CantidadAtendida"    = COALESCE("CantidadAtendida", 0) + "vCant",
				"UsuarioModificacion" = "vUsuario"
			WHERE "Id" = "vIdDetalle";
		ELSE
			INSERT INTO "inv"."T_RequerimientoDetalle"
			(
				"IdRequerimiento", "IdProducto", "Cantidad", "CantidadAtendida", "IdVehiculo",
				"UsuarioCreacion", "UsuarioModificacion"
			)
			VALUES ("vIdReq", "vIdProducto", "vCant", "vCant", "vOrden"."IdVehiculo", "vUsuario", "vUsuario");
		END IF;

		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT(
			'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'IdVehiculo', "vOrden"."IdVehiculo"
		);

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
			'Referencia',         LEFT('Compra directa ' || "vRef", 120),
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
		'Referencia',        LEFT("vRef", 120),
		'Notas',             CASE WHEN "vAdicional"
			THEN 'Consumo adicional de repuestos de mantenimiento (agregado antes de aprobar)'
			ELSE 'Consumo de repuestos de mantenimiento' END,
		'Detalle',           "vSalidaDet"
	));

	/* Trazabilidad multi-salida (0058) + atajo a la ultima salida */
	INSERT INTO "inv"."T_RequerimientoAtencion"
		("IdRequerimiento", "IdDocumentoInventario", "UsuarioCreacion", "UsuarioModificacion")
	VALUES ("vIdReq", "vIdSalida", "vUsuario", "vUsuario");

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion"             = 'atendido',
		"IdDocumentoInventario" = "vIdSalida",
		"UsuarioModificacion"   = "vUsuario"
	WHERE "Id" = "vIdReq";

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "IdRequerimiento" = "vIdReq", "Situacion" = 'consumida'
	WHERE "Id" = "PIdOrden";

	RETURN "vIdSalida";
END;
$$;

COMMENT ON FUNCTION "inv"."FnConsumirRepuestosOrdenMantenimiento"(UUID, JSONB) IS 'Consumo provisional de repuestos de una OT (Model 2, el admin ratifica al reconciliar). OT abierta: crea el requerimiento atendido (hereda los personales de la OT como solicitantes) + salida. OT consumida: consumo ADICIONAL, suma lineas al mismo requerimiento + nueva salida "(adicional)". Cada salida queda en T_RequerimientoAtencion. SECURITY DEFINER con revalidacion de rol.';

/* ===== 3. FnReconciliarOrdenMantenimiento: la reversa cubre TODAS las salidas ===== */
CREATE OR REPLACE FUNCTION "inv"."FnReconciliarOrdenMantenimiento"("PIdOrden" uuid, "PAprobar" boolean, "PMotivo" character varying DEFAULT NULL::character varying)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'inv', 'public' AS $$
DECLARE
	"vOrden"       "inv"."T_OrdenMantenimiento";
	"vRol"         TEXT;
	"vConsumidor"  TEXT;
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
		RAISE EXCEPTION 'Solo se reconcilian ordenes consumidas (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	/* Defensa en profundidad: revalida requerimientoAprobar (funcion expuesta por RPC) */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para reconciliar ordenes de mantenimiento.';
	END IF;

	/* Segregacion de funciones: quien CONSUMIO no ratifica su propio consumo (admin
	   exento). El consumidor se registra en el requerimiento enlazado. */
	SELECT "UsuarioCreacion" INTO "vConsumidor"
	FROM "inv"."T_Requerimiento" WHERE "Id" = "vOrden"."IdRequerimiento";
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vConsumidor"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes reconciliar una orden cuyo consumo tu mismo registraste.';
	END IF;

	IF "PAprobar" THEN
		PERFORM "inv"."FnExigirEvidenciaMantenimiento"("PIdOrden");

		UPDATE "inv"."T_OrdenMantenimiento"
		SET "Situacion" = 'cerrada',
			"FechaReconciliacion" = NOW(),
			"MotivoReconciliacion" = NULLIF("PMotivo", '')
		WHERE "Id" = "PIdOrden";
		RETURN;
	END IF;

	/* Rechazo: una entrada de reversa por almacen de origen, con los egresos de
	   TODAS las salidas del requerimiento (inicial + adicionales) al CostoUnitario
	   exacto del ledger. */
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
			'Referencia',         LEFT('Reversa OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8)), 120),
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

COMMENT ON FUNCTION "inv"."FnReconciliarOrdenMantenimiento"(UUID, BOOLEAN, VARCHAR) IS 'Reconcilia una OT consumida: aprobar -> cerrada (exige evidencia); rechazar -> anulada + entrada(s) de reversa que cubren TODAS las salidas del requerimiento (inicial y adicionales), una por almacen de origen, al CostoUnitario exacto del ledger (la compra directa NO se revierte). IdDocumentoInventarioReversa guarda la ultima reversa. SECURITY DEFINER; creador != aprobador (admin exento). La reversa es contable, no fisica.';
