/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRegistrarOrdenMantenimiento (REPLACE),
	        inv.FnActualizarOrdenMantenimiento (REPLACE)
	Tipo de Cambio: REPLACE de 2 funciones (sin cambios de esquema)
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Requiere: 0069 aplicada.
	Descripcion: LA ORDEN NACE ABIERTA. Corrige la regla de alta que puso 0068.

	             0068 hizo que toda OT nueva naciera 'consumida' (= "Por aprobar")
	             para que siguiera siendo editable. Pero eso mezcla dos cosas
	             distintas: una orden recien registrada esta EN CURSO, no esperando
	             que alguien la apruebe. En la practica la bandeja del aprobador se
	             llenaba de ordenes a medio cargar.

	             Ahora el paso de un estado al otro es EXPLICITO y lo da la persona
	             que carga, con "Culminar":

	               alta            -> 'abierta'   (en curso, se edita cuanto haga falta)
	               culminar        -> 'consumida' si tiene repuestos (por aprobar)
	                                  'cerrada'   si no tiene (nada que aprobar)
	               aprobar         -> 'cerrada' y recien ahi se descuenta el stock

	             Dos cambios, ninguno de esquema:

	               1. FnRegistrarOrdenMantenimiento inserta 'abierta' en vez de
	                  'consumida'. El borrador de repuestos se guarda igual: cargar
	                  repuestos no adelanta la orden a aprobacion, solo la deja lista
	                  para culminar.

	               2. FnActualizarOrdenMantenimiento deja de promover sola. En 0068,
	                  editar una 'abierta' y agregarle repuestos la pasaba a
	                  'consumida'; eso pisaba la decision del usuario y hacia que la
	                  orden se fuera a la bandeja de aprobacion sin que nadie la
	                  culminara. Editar ya no cambia la situacion: una 'abierta' sigue
	                  abierta y una 'consumida' sigue por aprobar.

	             Sin impacto en las ordenes existentes: las 'abierta' se culminan
	             cuando corresponda y las 'consumida' se aprueban o se devuelven a
	             abierta (0069). El resto del flujo (FnCerrar, FnReconciliar,
	             FnReabrir, FnEliminar) ya contempla ambos estados y no se toca.
*/

/* ===== 1. El alta deja la orden EN CURSO ===== */
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

	/* Nace ABIERTA: en curso. Pasa a por aprobar (o a cerrada) recien al culminar,
	   que es una decision explicita de quien la carga. */
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

	/* Los repuestos se guardan como borrador. Cargarlos NO adelanta la orden a
	   aprobacion: solo la deja lista para culminar. */
	PERFORM "inv"."FnGuardarRepuestosOrdenMantenimiento"("vId", "POrden"->'Consumo', "vUsuario");

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarOrdenMantenimiento"(JSONB) IS 'Alta de OT en un paso: cabecera + personal + trabajos (con fotos por tarea) + Consumo opcional como BORRADOR de repuestos (sin tocar stock). La orden nace ABIERTA (en curso) y pasa a por aprobar o a cerrada recien al culminar (FnCerrarOrdenMantenimiento). N° de orden autogenerado PREFIJO-DDMMYYYY-PLACA-NN si viene vacio.';

/* ===== 2. Editar ya no cambia la situacion ===== */
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

	/* Reemplaza el borrador completo. A diferencia de 0068, NO promueve la orden:
	   pasar de abierta a por aprobar es decision de quien culmina, no un efecto
	   secundario de haber agregado un repuesto. */
	PERFORM "inv"."FnGuardarRepuestosOrdenMantenimiento"("PIdOrden", "POrden"->'Consumo', "vUsuario");
END;
$$;

COMMENT ON FUNCTION "inv"."FnActualizarOrdenMantenimiento"(UUID, JSONB) IS 'Edita cabecera, personal, trabajos (con fotos por tarea) y el BORRADOR de repuestos de una OT abierta o por aprobar que aun no desconto stock. NO cambia la situacion: pasar a por aprobar es decision explicita de culminar.';
