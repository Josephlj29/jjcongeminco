/*
	Prueba de integración SQL — migración 0074
	Objeto: inv.FnReabrirOrdenMantenimiento (devolver a abierta)

	0074 suma un caso: una OT ya CERRADA que nunca descontó stock puede volver a
	abierta, pero SOLO para el rol admin. Antes 'cerrada' era terminal para todos
	y el único arreglo de un cierre por error era un UPDATE a mano en la base.

	Invariantes que se verifican:
	  1. admin reabre una cerrada SIN stock descontado.
	  2. un rol que no es admin NO reabre una cerrada (aunque pueda aprobar).
	  3. NADIE reabre una cerrada que YA descontó stock, ni el admin: eso se
	     corrige por el ledger, no cambiando la situación.
	  4. no se rompe lo que ya existía: admin sigue devolviendo a abierta una OT
	     "por aprobar" (consumida).

	Cómo correrla (psql o el SQL editor de Supabase); termina en ROLLBACK, no
	persiste nada:

		\i packages/db/tests/0074_reabrir_orden_cerrada.sql

	Resultado esperado: una única excepción final "OK 0074: ... (rollback de la
	prueba)". Cualquier otra cosa enumera la aserción que falló.
*/
DO $$
DECLARE
	"vIdVehiculo"   UUID;
	"vIdCerrada"    UUID;
	"vIdConsumida"  UUID;
	"vIdConStock"   UUID;
	"vAdmin"        TEXT := '00eb762d-bdd0-4b6c-b243-811b59773e52'; -- rol admin
	"vNoAdmin"      TEXT := 'd44fee21-8fda-4521-a951-0796757a182c'; -- rol almacenero
	"vSituacion"    TEXT;
	"vMensaje"      TEXT;
	"vFallas"       TEXT[] := ARRAY[]::TEXT[];
BEGIN
	SELECT "Id" INTO "vIdVehiculo" FROM "inv"."T_Vehiculo" WHERE "Estado" LIMIT 1;

	/* Una OT cerrada que nunca movió inventario (IdRequerimiento NULL). */
	INSERT INTO "inv"."T_OrdenMantenimiento"
		("NumeroOrden","TipoMantenimiento","FechaOrden","Turno","IdVehiculo","Situacion")
	VALUES ('TEST-0074-CERRADA','correctivo',CURRENT_DATE,'dia',"vIdVehiculo",'cerrada')
	RETURNING "Id" INTO "vIdCerrada";

	INSERT INTO "inv"."T_OrdenMantenimiento"
		("NumeroOrden","TipoMantenimiento","FechaOrden","Turno","IdVehiculo","Situacion")
	VALUES ('TEST-0074-CONSUMIDA','correctivo',CURRENT_DATE,'dia',"vIdVehiculo",'consumida')
	RETURNING "Id" INTO "vIdConsumida";

	/* Caso 3: una cerrada REAL que sí descontó stock (no se toca, solo se usa
	   como entrada; el rollback deshace cualquier efecto). */
	SELECT "Id" INTO "vIdConStock"
	FROM "inv"."T_OrdenMantenimiento"
	WHERE "IdRequerimiento" IS NOT NULL AND "Situacion" = 'cerrada' AND "Estado"
	LIMIT 1;

	/* ── 1. admin reabre una cerrada sin stock ─────────────────────────── */
	PERFORM set_config('request.jwt.claims',
		json_build_object('sub', "vAdmin", 'role', 'authenticated')::text, true);
	BEGIN
		PERFORM "inv"."FnReabrirOrdenMantenimiento"("vIdCerrada", 'prueba 0074');
		SELECT "Situacion" INTO "vSituacion" FROM "inv"."T_OrdenMantenimiento" WHERE "Id" = "vIdCerrada";
		IF "vSituacion" <> 'abierta' THEN
			"vFallas" = "vFallas" || FORMAT('1) La cerrada quedó en %s en vez de abierta.', "vSituacion");
		END IF;
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
		"vFallas" = "vFallas" || FORMAT('1) admin no pudo reabrir una cerrada sin stock: %s', "vMensaje");
	END;

	/* ── 2. un no-admin NO reabre una cerrada ──────────────────────────── */
	UPDATE "inv"."T_OrdenMantenimiento" SET "Situacion" = 'cerrada' WHERE "Id" = "vIdCerrada";
	PERFORM set_config('request.jwt.claims',
		json_build_object('sub', "vNoAdmin", 'role', 'authenticated')::text, true);
	BEGIN
		PERFORM "inv"."FnReabrirOrdenMantenimiento"("vIdCerrada", 'prueba 0074');
		"vFallas" = "vFallas" || '2) Un rol que no es admin pudo reabrir una orden cerrada.'::TEXT;
	EXCEPTION WHEN OTHERS THEN
		NULL; -- esperado
	END;

	/* ── 3. ni el admin reabre una cerrada que ya descontó stock ───────── */
	PERFORM set_config('request.jwt.claims',
		json_build_object('sub', "vAdmin", 'role', 'authenticated')::text, true);
	IF "vIdConStock" IS NOT NULL THEN
		BEGIN
			PERFORM "inv"."FnReabrirOrdenMantenimiento"("vIdConStock", 'prueba 0074');
			"vFallas" = "vFallas" || '3) Se reabrió una orden cerrada que YA descontó stock.'::TEXT;
		EXCEPTION WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
			IF POSITION('stock' IN LOWER("vMensaje")) = 0 THEN
				"vFallas" = "vFallas" || FORMAT('3) Rechazada, pero el motivo no habla del stock: %s', "vMensaje");
			END IF;
		END;
	END IF;

	/* ── 4. no se rompe el caso que ya funcionaba ──────────────────────── */
	BEGIN
		PERFORM "inv"."FnReabrirOrdenMantenimiento"("vIdConsumida", 'prueba 0074');
		SELECT "Situacion" INTO "vSituacion" FROM "inv"."T_OrdenMantenimiento" WHERE "Id" = "vIdConsumida";
		IF "vSituacion" <> 'abierta' THEN
			"vFallas" = "vFallas" || FORMAT('4) La consumida quedó en %s en vez de abierta.', "vSituacion");
		END IF;
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS "vMensaje" = MESSAGE_TEXT;
		"vFallas" = "vFallas" || FORMAT('4) Se rompió el flujo existente (consumida -> abierta): %s', "vMensaje");
	END;

	IF ARRAY_LENGTH("vFallas", 1) > 0 THEN
		RAISE EXCEPTION E'FALLA 0074:\n  - %', ARRAY_TO_STRING("vFallas", E'\n  - ');
	END IF;

	RAISE EXCEPTION 'OK 0074: las 4 invariantes se cumplen (rollback de la prueba)';
END $$;
