/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRegistrarOrdenMantenimiento (reescritura)
	Tipo de Cambio: REPLACE - autogeneración del N° de orden en el servidor
	Autor: Equipo Desarrollo
	Fecha: 2026-06-29
	Descripcion: El N° de orden se tipeaba a mano (opcional) y podía quedar vacío o
	             duplicado. Como ese número se propaga al requerimiento de stock y al
	             movimiento de inventario (FnConsumirRepuestosOrdenMantenimiento), debe
	             ser único y consistente. Ahora, cuando llega vacío, el servidor lo
	             genera con la nomenclatura:

	                 PREFIJO-DDMMYYYY-PLACA-NN

	             PREFIJO = PREV (preventivo) | CORR (correctivo)
	             DDMMYYYY = FechaOrden en día-mes-año
	             PLACA    = placa del vehículo, en mayúsculas y sin separadores
	             NN       = correlativo del día para esa placa+tipo (2 dígitos)

	             El correlativo se resuelve buscando el primer NN libre, así nunca
	             choca con otra OT del mismo día/placa/tipo ni con un número manual.
	             Si el cliente manda un NumeroOrden no vacío, se respeta tal cual.
*/

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

		/* Primer correlativo libre para ese prefijo+fecha+placa. Se compara contra
		   TODA la tabla (incluidas OT dadas de baja) para no reusar un número que
		   ya quedó propagado a un requerimiento o movimiento de stock. */
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
		"NumeroOrden","TipoMantenimiento","FechaOrden","Turno","Kilometraje",
		"IdVehiculo","Observaciones","Situacion","UsuarioCreacion","UsuarioModificacion"
	)
	VALUES
	(
		"vNumero"
		,"POrden"->>'TipoMantenimiento'
		,("POrden"->>'FechaOrden')::DATE
		,"POrden"->>'Turno'
		,NULLIF("POrden"->>'Kilometraje','')::NUMERIC
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
