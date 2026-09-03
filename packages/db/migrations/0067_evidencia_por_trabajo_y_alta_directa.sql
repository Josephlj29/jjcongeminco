/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_OrdenMantenimientoTrabajo (ADD UrlFotoAntes/UrlFotoDespues),
	        inv.FnRegistrarOrdenMantenimiento (REPLACE),
	        inv.FnActualizarOrdenMantenimiento (REPLACE),
	        inv.FnCerrarOrdenMantenimiento (REPLACE),
	        inv.FnReconciliarOrdenMantenimiento (REPLACE),
	        inv.FnExigirEvidenciaMantenimiento (DROP),
	        inv.T_OrdenMantenimientoEvidencia (DROP)
	Tipo de Cambio: ALTER TABLE + REPLACE de 4 funciones + DROP de la evidencia por orden
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Descripcion: CASO DE CAMPO. La OT se registra en el sistema DESPUES de terminar el
	             trabajo, para formalizarlo: nunca hay un "iniciar" y un "culminar" en
	             momentos distintos. El modelo de 0048 (galeria antes/despues por
	             orden, obligatoria para cerrar/aprobar) asumia el flujo inverso y en
	             la practica bloqueaba el cierre. Cambios:

	               1. Evidencia POR TAREA y opcional: cada trabajo lleva su foto de
	                  antes (UrlFotoAntes) y de despues (UrlFotoDespues), ambas
	                  nullables (patron de T_RequerimientoDetalle.UrlFotoLibre, 0062).
	                  El front sube al bucket "mantenimiento" (ruta trabajos/{uuid}-
	                  {archivo}) y manda la URL publica dentro de POrden.Trabajos.
	                  Desaparecen T_OrdenMantenimientoEvidencia (verificada vacia) y
	                  FnExigirEvidenciaMantenimiento; FnCerrar y FnReconciliar dejan
	                  de exigir fotos.

	               2. Alta directa y atomica: FnRegistrarOrdenMantenimiento acepta
	                  POrden.Consumo (mismo contrato que /consumir) y, si trae lineas,
	                  llama a FnConsumirRepuestosOrdenMantenimiento en la MISMA
	                  transaccion: la OT nace 'consumida' ("Por aprobar") y el stock
	                  se descuenta al instante; si el consumo falla no queda una OT a
	                  medias (antes el front encadenaba dos requests). Sin repuestos
	                  no hay descuento que aprobar: la OT nace 'cerrada'.

	             Ninguna OT nueva queda 'abierta'. FnActualizar / FnCerrar / FnAnular /
	             FnEliminar se conservan para las OTs abiertas legadas. Base viva de
	             cada funcion: FnRegistrar y FnActualizar (0056), FnCerrar (0048),
	             FnReconciliar (0066).

	             NOTA (misma fecha): la regla de alta de esta migracion (consumo
	             inmediato via FnConsumir y 'cerrada' sin repuestos) fue reemplazada
	             en 0068 (repuestos en BORRADOR, descuento de stock al APROBAR, toda
	             OT nueva nace 'consumida'). Se conserva tal cual porque 0068 se
	             construye encima: aplicar siempre 0067 -> 0068 juntas. Lo que
	             perdura de esta migracion: fotos por tarea y fin de la evidencia
	             por orden.
*/

/* ===== 1. Fotos por tarea ===== */
ALTER TABLE "inv"."T_OrdenMantenimientoTrabajo"
	ADD COLUMN "UrlFotoAntes"   VARCHAR(500),
	ADD COLUMN "UrlFotoDespues" VARCHAR(500);

COMMENT ON COLUMN "inv"."T_OrdenMantenimientoTrabajo"."UrlFotoAntes" IS 'Foto opcional del estado previo a la tarea: URL publica del bucket "mantenimiento" (ruta trabajos/{uuid}-{archivo}).';
COMMENT ON COLUMN "inv"."T_OrdenMantenimientoTrabajo"."UrlFotoDespues" IS 'Foto opcional del resultado de la tarea: URL publica del bucket "mantenimiento" (ruta trabajos/{uuid}-{archivo}).';

/* ===== 2. FnRegistrarOrdenMantenimiento: fotos por tarea + alta directa ===== */
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarOrdenMantenimiento"("POrden" jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	"vId"       UUID;
	"vUsuario"  VARCHAR(50);
	"vTrabajo"  JSONB;
	"vConsumo"  JSONB;
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

	/* Nace 'abierta' solo dentro de esta transaccion: FnConsumir exige ese estado
	   para el consumo inicial; al final de la funcion queda 'consumida' o 'cerrada'. */
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
		,'abierta'
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

	/* Trabajos con foto opcional de antes/despues por tarea. */
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

	/* Alta directa. Con repuestos: consumo en la MISMA transaccion (FnConsumir deja la
	   OT 'consumida' y descuenta stock; un RAISE ahi revierte tambien la OT). Sin
	   repuestos no hay descuento que aprobar: nace 'cerrada'. */
	"vConsumo" = "POrden"->'Consumo';
	IF "vConsumo" IS NOT NULL AND JSONB_TYPEOF("vConsumo") = 'object'
	   AND JSONB_ARRAY_LENGTH(COALESCE("vConsumo"->'Lineas','[]'::JSONB)) > 0 THEN
		PERFORM "inv"."FnConsumirRepuestosOrdenMantenimiento"("vId", "vConsumo");
	ELSE
		UPDATE "inv"."T_OrdenMantenimiento" SET "Situacion" = 'cerrada' WHERE "Id" = "vId";
	END IF;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarOrdenMantenimiento"(JSONB) IS 'Alta de OT en un paso (se registra al terminar el trabajo): cabecera + personal + trabajos con foto opcional de antes/despues por tarea + Consumo opcional. Con Consumo llama a FnConsumirRepuestosOrdenMantenimiento en la misma transaccion (nace consumida = por aprobar); sin repuestos nace cerrada. N° de orden autogenerado PREFIJO-DDMMYYYY-PLACA-NN si viene vacio.';

/* ===== 3. FnActualizarOrdenMantenimiento (solo OTs abiertas legadas): fotos por tarea ===== */
CREATE OR REPLACE FUNCTION "inv"."FnActualizarOrdenMantenimiento"("PIdOrden" uuid, "POrden" jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"vOrden"    "inv"."T_OrdenMantenimiento";
	"vUsuario"  VARCHAR(50);
	"vTrabajo"  JSONB;
	"vPersonal" TEXT;
	"vIdx"      INT := 0;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' THEN
		RAISE EXCEPTION 'Solo se edita una orden abierta (situacion actual: %).', "vOrden"."Situacion";
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
END;
$$;

COMMENT ON FUNCTION "inv"."FnActualizarOrdenMantenimiento"(UUID, JSONB) IS 'Edita cabecera, personal y trabajos (con sus fotos por tarea) de una OT abierta. Solo aplica a OTs abiertas legadas: desde 0067 el alta nace consumida o cerrada.';

/* ===== 4. FnCerrarOrdenMantenimiento: sin guard de evidencia ===== */
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
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Solo se cierra directamente una orden abierta sin repuestos. Si tiene consumo, usa reconciliar.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento" SET "Situacion" = 'cerrada' WHERE "Id" = "PIdOrden";
END;
$$;

COMMENT ON FUNCTION "inv"."FnCerrarOrdenMantenimiento"(UUID) IS 'Cierra una OT abierta sin repuestos (solo mano de obra). Solo aplica a OTs abiertas legadas: desde 0067 el alta nace cerrada o consumida. Ya no exige evidencia fotografica.';

/* ===== 5. FnReconciliarOrdenMantenimiento (base viva 0066): sin guard de evidencia ===== */
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

	/* Aprobar: cierra. La evidencia fotografica es por tarea y opcional (0067), asi
	   que ya no hay guard de fotos. */
	IF "PAprobar" THEN
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

COMMENT ON FUNCTION "inv"."FnReconciliarOrdenMantenimiento"(UUID, BOOLEAN, VARCHAR) IS 'Reconcilia una OT consumida: aprobar -> cerrada (sin guard de evidencia: las fotos son por tarea y opcionales); rechazar -> anulada + entrada(s) de reversa que cubren TODAS las salidas del requerimiento (inicial y adicionales), una por almacen de origen, al CostoUnitario exacto del ledger (la compra directa NO se revierte). IdDocumentoInventarioReversa guarda la ultima reversa. SECURITY DEFINER; creador != aprobador (admin exento). La reversa es contable, no fisica.';

/* ===== 6. Evidencia por orden: fuera ===== */
DO $$
BEGIN
	/* Cinturon de seguridad: la tabla debe estar vacia (lo estaba al aplicar en el
	   remoto). Si alguna vez tuviera filas, migrarlas a las columnas por tarea antes. */
	IF EXISTS (SELECT 1 FROM "inv"."T_OrdenMantenimientoEvidencia") THEN
		RAISE EXCEPTION 'inv.T_OrdenMantenimientoEvidencia tiene filas: migrar la evidencia por tarea antes de eliminarla.';
	END IF;
END;
$$;

DROP FUNCTION IF EXISTS "inv"."FnExigirEvidenciaMantenimiento"(uuid);
DROP TABLE IF EXISTS "inv"."T_OrdenMantenimientoEvidencia";
