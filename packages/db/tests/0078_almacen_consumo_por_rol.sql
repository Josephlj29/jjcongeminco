/*
	Prueba de integración SQL — migración 0078
	Objeto: seg.T_RolUbicacionConsumo + seg.FnUbicacionesConsumoUsuario
	        + inv.FnGuardarRepuestosOrdenMantenimiento (vía alta y edición de OT)

	El rol almacenero solo puede descontar repuestos de una OT desde el almacén
	de Tambomayo. Un rol sin filas en T_RolUbicacionConsumo no tiene restricción.

	Invariantes que se verifican:
	  1. almacenero registra una OT con repuestos desde Tambomayo.
	  2. almacenero NO registra una OT con repuestos desde otro almacén (42501),
	     y el mensaje nombra el almacén permitido.
	  3. almacenero tampoco cambia el almacén al EDITAR una OT existente.
	  4. una OT de almacenero SIN repuestos no exige almacén (sigue igual).
	  5. admin (sin restricción) registra desde cualquier almacén.
	  6. FnUbicacionesConsumoUsuario: almacenero recibe solo Tambomayo; admin NULL.

	Cómo correrla (psql o el SQL editor de Supabase); termina en ROLLBACK, no
	persiste nada:

		\i packages/db/tests/0078_almacen_consumo_por_rol.sql

	Resultado esperado: una única excepción final "OK 0078: ... (rollback de la
	prueba)". Cualquier otra cosa enumera la aserción que falló.
*/
DO $$
DECLARE
	"vIdVehiculo"   UUID;
	"vIdProducto"   UUID;
	"vTambomayo"    UUID;
	"vOtro"         UUID;
	"vIdOrden"      UUID;
	"vPersonal"     JSONB;
	"vPermitidas"   UUID[];
	"vAdmin"        TEXT := '00eb762d-bdd0-4b6c-b243-811b59773e52'; -- rol admin
	"vAlmacenero"   TEXT := 'd44fee21-8fda-4521-a951-0796757a182c'; -- rol almacenero
	"vCodigo"       TEXT;
	"vMensaje"      TEXT;
	"vFallas"       TEXT[] := ARRAY[]::TEXT[];
BEGIN
	SELECT "Id" INTO "vIdVehiculo" FROM "inv"."T_Vehiculo" WHERE "Estado" LIMIT 1;
	SELECT "Id" INTO "vIdProducto" FROM "inv"."T_Producto" WHERE "Estado" LIMIT 1;
	SELECT JSONB_BUILD_ARRAY("Id") INTO "vPersonal" FROM "inv"."T_Personal" WHERE "Estado" LIMIT 1;
	SELECT "Id" INTO "vTambomayo" FROM "inv"."T_Ubicacion"
	WHERE "Nombre" ILIKE '%tambomayo%' AND "Estado";
	SELECT "Id" INTO "vOtro" FROM "inv"."T_Ubicacion"
	WHERE "Id" <> "vTambomayo" AND "Estado" LIMIT 1;

	/* ── 1. almacenero registra desde Tambomayo ────────────────────────── */
	PERFORM set_config('request.jwt.claims',
		json_build_object('sub', "vAlmacenero", 'role', 'authenticated')::text, true);
	BEGIN
		"vIdOrden" = "inv"."FnRegistrarOrdenMantenimiento"(JSONB_BUILD_OBJECT(
			'NumeroOrden', 'TEST-0078-TAM', 'TipoMantenimiento', 'correctivo',
			'FechaOrden', CURRENT_DATE, 'Turno', 'dia', 'IdVehiculo', "vIdVehiculo",
			'Trabajos', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('Secuencia', 1, 'Descripcion', 'prueba 0078')), 'IdsPersonal', "vPersonal",
			'Consumo', JSONB_BUILD_OBJECT('IdUbicacionOrigen', "vTambomayo",
				'Lineas', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', 1, 'Modo', 'stock')))
		));
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
		"vFallas" = "vFallas" || FORMAT('1) almacenero no pudo registrar desde Tambomayo: %s', "vMensaje");
	END;

	/* ── 2. almacenero NO registra desde otro almacén ──────────────────── */
	BEGIN
		PERFORM "inv"."FnRegistrarOrdenMantenimiento"(JSONB_BUILD_OBJECT(
			'NumeroOrden', 'TEST-0078-OTRO', 'TipoMantenimiento', 'correctivo',
			'FechaOrden', CURRENT_DATE, 'Turno', 'dia', 'IdVehiculo', "vIdVehiculo",
			'Trabajos', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('Secuencia', 1, 'Descripcion', 'prueba 0078')), 'IdsPersonal', "vPersonal",
			'Consumo', JSONB_BUILD_OBJECT('IdUbicacionOrigen', "vOtro",
				'Lineas', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', 1, 'Modo', 'stock')))
		));
		"vFallas" = "vFallas" || '2) almacenero registró una OT desde un almacén que no es Tambomayo.'::TEXT;
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT, "vCodigo" = RETURNED_SQLSTATE;
		IF "vCodigo" <> '42501' OR POSITION('tambomayo' IN LOWER("vMensaje")) = 0 THEN
			"vFallas" = "vFallas" || FORMAT('2) Rechazada, pero no por permiso o sin nombrar Tambomayo: [%s] %s', "vCodigo", "vMensaje");
		END IF;
	END;

	/* ── 3. almacenero no cambia el almacén al editar ──────────────────── */
	IF "vIdOrden" IS NOT NULL THEN
		BEGIN
			PERFORM "inv"."FnActualizarOrdenMantenimiento"("vIdOrden", JSONB_BUILD_OBJECT(
				'NumeroOrden', 'TEST-0078-TAM', 'TipoMantenimiento', 'correctivo',
				'FechaOrden', CURRENT_DATE, 'Turno', 'dia', 'IdVehiculo', "vIdVehiculo",
				'Trabajos', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('Secuencia', 1, 'Descripcion', 'prueba 0078')), 'IdsPersonal', "vPersonal",
				'Consumo', JSONB_BUILD_OBJECT('IdUbicacionOrigen', "vOtro",
					'Lineas', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', 1, 'Modo', 'stock')))
			));
			"vFallas" = "vFallas" || '3) almacenero cambió el almacén de una OT a uno que no es Tambomayo.'::TEXT;
		EXCEPTION WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS "vCodigo" = RETURNED_SQLSTATE, "vMensaje" = MESSAGE_TEXT;
			IF "vCodigo" <> '42501' THEN
				"vFallas" = "vFallas" || FORMAT('3) Rechazada, pero no por permiso: [%s] %s', "vCodigo", "vMensaje");
			END IF;
		END;
	END IF;

	/* ── 4. sin repuestos no se exige almacén ──────────────────────────── */
	BEGIN
		PERFORM "inv"."FnRegistrarOrdenMantenimiento"(JSONB_BUILD_OBJECT(
			'NumeroOrden', 'TEST-0078-SINREP', 'TipoMantenimiento', 'correctivo',
			'FechaOrden', CURRENT_DATE, 'Turno', 'dia', 'IdVehiculo', "vIdVehiculo",
			'Trabajos', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('Secuencia', 1, 'Descripcion', 'prueba 0078')), 'IdsPersonal', "vPersonal"
		));
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
		"vFallas" = "vFallas" || FORMAT('4) almacenero no pudo registrar una OT sin repuestos: %s', "vMensaje");
	END;

	/* ── 6a. almacenero ve solo Tambomayo ──────────────────────────────── */
	BEGIN
		"vPermitidas" = "seg"."FnUbicacionesConsumoUsuario"();
		IF "vPermitidas" IS DISTINCT FROM ARRAY["vTambomayo"] THEN
			"vFallas" = "vFallas" || FORMAT('6) almacenero debería recibir solo Tambomayo y recibió %s', "vPermitidas");
		END IF;
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
		"vFallas" = "vFallas" || FORMAT('6) FnUbicacionesConsumoUsuario falló para almacenero: %s', "vMensaje");
	END;

	/* ── 5. admin registra desde cualquier almacén ─────────────────────── */
	PERFORM set_config('request.jwt.claims',
		json_build_object('sub', "vAdmin", 'role', 'authenticated')::text, true);
	BEGIN
		PERFORM "inv"."FnRegistrarOrdenMantenimiento"(JSONB_BUILD_OBJECT(
			'NumeroOrden', 'TEST-0078-ADMIN', 'TipoMantenimiento', 'correctivo',
			'FechaOrden', CURRENT_DATE, 'Turno', 'dia', 'IdVehiculo', "vIdVehiculo",
			'Trabajos', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('Secuencia', 1, 'Descripcion', 'prueba 0078')), 'IdsPersonal', "vPersonal",
			'Consumo', JSONB_BUILD_OBJECT('IdUbicacionOrigen', "vOtro",
				'Lineas', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', 1, 'Modo', 'stock')))
		));
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
		"vFallas" = "vFallas" || FORMAT('5) admin no pudo registrar desde otro almacén: %s', "vMensaje");
	END;

	/* ── 6b. admin no tiene restricción ────────────────────────────────── */
	BEGIN
		IF "seg"."FnUbicacionesConsumoUsuario"() IS NOT NULL THEN
			"vFallas" = "vFallas" || '6) admin debería recibir NULL (sin restricción).'::TEXT;
		END IF;
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
		"vFallas" = "vFallas" || FORMAT('6) FnUbicacionesConsumoUsuario falló para admin: %s', "vMensaje");
	END;

	IF ARRAY_LENGTH("vFallas", 1) > 0 THEN
		RAISE EXCEPTION E'FALLA 0078:\n  - %', ARRAY_TO_STRING("vFallas", E'\n  - ');
	END IF;

	RAISE EXCEPTION 'OK 0078: las 6 invariantes se cumplen (rollback de la prueba)';
END $$;
