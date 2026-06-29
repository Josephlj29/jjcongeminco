/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: placa (IdVehiculo) por LÍNEA en requerimientos
	Tipo de Cambio: ALTER + REPLACE - mueve el destino del encabezado al detalle
	Autor: Equipo Desarrollo
	Fecha: 2026-06-29
	Descripcion: Un requerimiento apuntaba a un único destino (IdEquipo o IdVehiculo en
	             el encabezado, con CHECK que obligaba a uno). Ahora cada línea lleva su
	             propia placa destino (FK real). Cambios:
	               - inv.T_RequerimientoDetalle gana IdVehiculo (FK a T_Vehiculo), backfill
	                 desde la placa del encabezado.
	               - Se relaja el CHECK de destino obligatorio del encabezado (el destino
	                 vive en la línea; se valida en la RPC/UI).
	               - FnRegistrarRequerimiento lee la placa por línea (cae al encabezado).
	               - FnConsumirRepuestosOrdenMantenimiento setea la placa de la OT en cada
	                 línea del requerimiento y de la salida generada (consistencia con
	                 la placa por línea de movimientos).
	               - V_Recambio_Producto detecta desgaste prematuro por placa de LÍNEA.
	             El encabezado conserva IdEquipo/IdVehiculo (agrupación y compat).
*/

/* 1. Columna + FK + índice + backfill ------------------------------------ */
ALTER TABLE "inv"."T_RequerimientoDetalle" ADD COLUMN "IdVehiculo" UUID;
ALTER TABLE "inv"."T_RequerimientoDetalle"
	ADD CONSTRAINT "FK_T_RequerimientoDetalle_Vehiculo_IdVehiculo"
	FOREIGN KEY ("IdVehiculo") REFERENCES "inv"."T_Vehiculo" ("Id");
CREATE INDEX "IX_T_RequerimientoDetalle_IdVehiculo"
	ON "inv"."T_RequerimientoDetalle" ("IdVehiculo");
COMMENT ON COLUMN "inv"."T_RequerimientoDetalle"."IdVehiculo" IS 'Placa destino de la línea. FK a T_Vehiculo. El encabezado IdEquipo/IdVehiculo queda como agrupador.';

UPDATE "inv"."T_RequerimientoDetalle" "rd"
SET "IdVehiculo" = "rq"."IdVehiculo"
FROM "inv"."T_Requerimiento" "rq"
WHERE "rq"."Id" = "rd"."IdRequerimiento" AND "rq"."IdVehiculo" IS NOT NULL;

/* 2. El destino deja de ser obligatorio en el encabezado (vive en la línea) */
ALTER TABLE "inv"."T_Requerimiento" DROP CONSTRAINT "CHK_T_Requerimiento_Destino_Obligatorio";

/* 3. Alta de requerimiento: placa por línea (cae al encabezado si no la trae) */
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarRequerimiento"("PRequerimiento" jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	"vId"      UUID;
	"vUsuario" VARCHAR(50);
	"vDetalle" JSONB;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento","FechaRequerimiento","Origen","IdEquipo","IdVehiculo",
		"IdPersonalSolicitante","Notas","Situacion","UsuarioCreacion","UsuarioModificacion"
	)
	VALUES
	(
		NULLIF("PRequerimiento"->>'NumeroRequerimiento', '')
		,("PRequerimiento"->>'FechaRequerimiento')::DATE
		,"PRequerimiento"->>'Origen'
		,NULLIF("PRequerimiento"->>'IdEquipo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdVehiculo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdPersonalSolicitante', '')::UUID
		,NULLIF("PRequerimiento"->>'Notas', '')
		,'pendiente'
		,"vUsuario","vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PRequerimiento"->'Detalle')
	LOOP
		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento","IdProducto","Cantidad","IdVehiculo","Notas",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,("vDetalle"->>'IdProducto')::UUID
			,("vDetalle"->>'Cantidad')::NUMERIC
			,COALESCE(
				NULLIF("vDetalle"->>'IdVehiculo', ''),
				NULLIF("PRequerimiento"->>'IdVehiculo', '')
			)::UUID
			,NULLIF("vDetalle"->>'Notas', '')
			,"vUsuario","vUsuario"
		);
	END LOOP;

	RETURN "vId";
END;
$$;

/* 4. Consumo OT: setea la placa de la OT en cada línea del requerimiento y
      de la salida generada (consistencia con placa por línea de movimientos). */
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
	"vSolicitante" UUID;
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

	SELECT "IdPersonal" INTO "vSolicitante"
	FROM "inv"."T_OrdenMantenimientoPersonal"
	WHERE "IdOrdenMantenimiento" = "PIdOrden" AND "Estado" = TRUE
	ORDER BY "Orden", "FechaCreacion"
	LIMIT 1;

	"vOrigen" = CASE WHEN "vOrden"."TipoMantenimiento" = 'correctivo'
		THEN 'desgaste_prematuro' ELSE 'planificado' END;
	"vRef" = 'OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8));

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento", "FechaRequerimiento", "Origen", "IdVehiculo",
		"IdPersonalSolicitante", "Situacion", "Notas", "UsuarioCreacion", "UsuarioModificacion"
	)
	VALUES
	(
		"vOrden"."NumeroOrden", "vOrden"."FechaOrden", "vOrigen", "vOrden"."IdVehiculo",
		"vSolicitante", 'pendiente', "vRef", "vUsuario", "vUsuario"
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

		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad a consumir de % debe ser mayor a cero.', "vNombreProd";
		END IF;

		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento", "IdProducto", "Cantidad", "CantidadAtendida", "IdVehiculo",
			"UsuarioCreacion", "UsuarioModificacion"
		)
		VALUES ("vIdReq", "vIdProducto", "vCant", "vCant", "vOrden"."IdVehiculo", "vUsuario", "vUsuario");

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

/* 5. Recambios: desgaste prematuro por placa de LÍNEA (cae al destino del encabezado) */
CREATE OR REPLACE VIEW "inv"."V_Recambio_Producto" WITH (security_invoker = true) AS
	WITH "base" AS (
		SELECT
			rq."Id" AS "IdRequerimiento",
			rq."NumeroRequerimiento",
			rq."FechaRequerimiento",
			rq."Origen",
			COALESCE(rd."IdVehiculo", rq."IdVehiculo", rq."IdEquipo") AS "TargetId",
			CASE
				WHEN COALESCE(rd."IdVehiculo", rq."IdVehiculo") IS NOT NULL THEN 'placa'::text
				ELSE 'equipo'::text
			END AS "TargetTipo",
			COALESCE(v."Placa", ((e."Codigo"::text || ' — '::text) || e."Nombre"::text)::character varying) AS "TargetNombre",
			rd."IdProducto",
			p."Sku",
			p."Nombre" AS "NombreProducto",
			rd."Cantidad",
			rq."FechaRequerimiento" - lag(rq."FechaRequerimiento") OVER (
				PARTITION BY COALESCE(rd."IdVehiculo", rq."IdVehiculo", rq."IdEquipo"), rd."IdProducto"
				ORDER BY rq."FechaRequerimiento", rq."Id"
			) AS "DiasDesdeAnterior"
		FROM "inv"."T_Requerimiento" rq
			JOIN "inv"."T_RequerimientoDetalle" rd ON rd."IdRequerimiento" = rq."Id" AND rd."Estado" = true
			JOIN "inv"."T_Producto" p ON p."Id" = rd."IdProducto"
			LEFT JOIN "inv"."T_Vehiculo" v ON v."Id" = COALESCE(rd."IdVehiculo", rq."IdVehiculo")
			LEFT JOIN "inv"."T_Equipo" e ON e."Id" = rq."IdEquipo"
		WHERE rq."Estado" = true AND rq."Situacion"::text <> 'anulado'::text
	), "conprom" AS (
		SELECT
			"base".*,
			avg("base"."DiasDesdeAnterior") OVER (PARTITION BY "base"."TargetId", "base"."IdProducto") AS "PromedioDiasPar"
		FROM "base"
	)
	SELECT
		"IdRequerimiento",
		"NumeroRequerimiento",
		"FechaRequerimiento",
		"Origen",
		"TargetId",
		"TargetTipo",
		"TargetNombre",
		"IdProducto",
		"Sku",
		"NombreProducto",
		"Cantidad",
		"DiasDesdeAnterior",
		round("PromedioDiasPar", 1) AS "PromedioDiasPar",
		"Origen"::text = 'desgaste_prematuro'::text
			OR "DiasDesdeAnterior" IS NOT NULL AND "PromedioDiasPar" IS NOT NULL
			   AND "PromedioDiasPar" > 0::numeric
			   AND "DiasDesdeAnterior"::numeric < ("PromedioDiasPar" * 0.5) AS "Acelerado"
	FROM "conprom";
