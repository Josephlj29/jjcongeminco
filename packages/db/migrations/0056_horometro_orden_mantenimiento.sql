/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_OrdenMantenimiento.Horometro (ADD) + funciones de registro/actualizacion
	Tipo de Cambio: ALTER TABLE + REPLACE de 2 funciones
	Autor: Equipo Desarrollo
	Fecha: 2026-07-28
	Descripcion: Algunos equipos (gruas, motoniveladoras, equipo pesado estatico)
	             no se miden por kilometraje sino por horas de uso (horometro).
	             Se agrega "Horometro" como campo opcional independiente, en
	             paralelo a "Kilometraje" (mismo patron: ambos NULL-ables, sin
	             cruce de validacion entre si). El operador llena el que
	             corresponda segun el equipo, a su criterio, en cada OT.
*/

/* ===== Columna ===== */
ALTER TABLE "inv"."T_OrdenMantenimiento"
	ADD COLUMN "Horometro" NUMERIC(10,2);

ALTER TABLE "inv"."T_OrdenMantenimiento"
	ADD CONSTRAINT "CHK_T_OrdenMantenimiento_Horometro_NoNegativo"
	CHECK ("Horometro" IS NULL OR "Horometro" >= 0);

COMMENT ON COLUMN "inv"."T_OrdenMantenimiento"."Horometro" IS 'Lectura de horometro (horas de uso) al momento del servicio. Alternativa a Kilometraje para equipo que no se mide por distancia recorrida; ambos son opcionales e independientes.';

/* ===== inv.FnRegistrarOrdenMantenimiento (REPLACE, agrega Horometro) ===== */
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

	FOR "vTrabajo" IN SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE("POrden"->'Trabajos','[]'::JSONB))
	LOOP
		INSERT INTO "inv"."T_OrdenMantenimientoTrabajo"
			("IdOrdenMantenimiento","Secuencia","Descripcion","UsuarioCreacion","UsuarioModificacion")
		VALUES ("vId", ("vTrabajo"->>'Secuencia')::INT, "vTrabajo"->>'Descripcion', "vUsuario","vUsuario");
	END LOOP;

	RETURN "vId";
END;
$$;

/* ===== inv.FnActualizarOrdenMantenimiento (REPLACE, agrega Horometro) ===== */
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
			("IdOrdenMantenimiento","Secuencia","Descripcion","UsuarioCreacion","UsuarioModificacion")
		VALUES ("PIdOrden", ("vTrabajo"->>'Secuencia')::INT, "vTrabajo"->>'Descripcion', "vUsuario","vUsuario");
	END LOOP;
END;
$$;
