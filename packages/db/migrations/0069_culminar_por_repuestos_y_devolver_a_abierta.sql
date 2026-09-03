/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnCerrarOrdenMantenimiento (DROP + CREATE, cambia el tipo de retorno),
	        inv.FnReabrirOrdenMantenimiento (CREATE)
	Tipo de Cambio: REPLACE con cambio de firma + funcion nueva
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Requiere: 0068 aplicada.
	Descripcion: Dos huecos del flujo que aparecieron al usarlo:

	             1. CULMINAR decide segun los repuestos. Antes solo servia para OTs
	                abiertas SIN repuestos y reventaba con un error si tenian: por eso
	                la accion se llamaba "Culminar (sin repuestos)". Ahora una sola
	                accion resuelve los dos casos, que es como lo piensa el usuario:
	                  - sin repuestos  -> 'cerrada'  (no hay stock que aprobar)
	                  - con repuestos  -> 'consumida' (= "Por aprobar")
	                Devuelve la situacion resultante para que la UI avise adonde fue
	                la orden sin tener que releerla.

	             2. DEVOLVER A ABIERTA. Una OT "Por aprobar" es la bandeja del
	                aprobador. Si no esta lista, el aprobador necesita sacarla de esa
	                bandeja y devolverla al estado de trabajo en vez de rechazarla
	                (rechazar es un veredicto: la anula). FnReabrirOrdenMantenimiento
	                la vuelve a 'abierta' conservando el borrador de repuestos, y el
	                motivo queda registrado.

	                Solo para OTs que NO descontaron stock (IdRequerimiento IS NULL).
	                Una legada que ya movio el kardex no puede volver a un estado
	                editable: ahi el camino sigue siendo aprobar o rechazar (reversa).

	             Con esto 'abierta' vuelve a ser un estado de trabajo real. Desde 0068
	             el alta nace 'consumida', asi que a 'abierta' se llega solo por esta
	             devolucion (o por las OTs legadas que ya estaban ahi).
*/

/* ===== 1. Culminar: la situacion destino depende de si hay repuestos ===== */
DROP FUNCTION IF EXISTS "inv"."FnCerrarOrdenMantenimiento"(uuid);

CREATE FUNCTION "inv"."FnCerrarOrdenMantenimiento"("PIdOrden" uuid)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
	"vOrden"    "inv"."T_OrdenMantenimiento";
	"vDestino"  TEXT;
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' THEN
		RAISE EXCEPTION 'Solo se culmina una orden abierta (situacion actual: %).', "vOrden"."Situacion";
	END IF;
	IF "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Esta orden ya desconto stock (flujo anterior): usa aprobar o rechazar.';
	END IF;

	/* Con repuestos en borrador hay un descuento de stock que alguien tiene que
	   aprobar; sin repuestos no hay nada que aprobar y se cierra derecho. */
	"vDestino" = CASE
		WHEN EXISTS (
			SELECT 1 FROM "inv"."T_OrdenMantenimientoRepuesto"
			WHERE "IdOrdenMantenimiento" = "PIdOrden" AND "Estado" = TRUE
		) THEN 'consumida'
		ELSE 'cerrada'
	END;

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "Situacion" = "vDestino",
		"UsuarioModificacion" = COALESCE(auth.uid()::TEXT, 'API')
	WHERE "Id" = "PIdOrden";

	RETURN "vDestino";
END;
$$;

COMMENT ON FUNCTION "inv"."FnCerrarOrdenMantenimiento"(UUID) IS 'Culmina una OT abierta y devuelve la situacion resultante: con repuestos en borrador pasa a consumida (por aprobar, el stock se descuenta al aprobar); sin repuestos pasa a cerrada. Rechaza las OTs legadas que ya descontaron stock.';

/* ===== 2. Devolver a abierta (el aprobador la saca de su bandeja) ===== */
CREATE OR REPLACE FUNCTION "inv"."FnReabrirOrdenMantenimiento"
(
	"PIdOrden" UUID,
	"PMotivo"  VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vOrden" "inv"."T_OrdenMantenimiento";
	"vRol"   TEXT;
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'consumida' THEN
		RAISE EXCEPTION 'Solo se devuelve a abierta una orden por aprobar (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	/* Defensa en profundidad: la funcion es SECURITY DEFINER y queda expuesta por
	   RPC, asi que revalidamos el rol aunque la API ya lo haya hecho. */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para devolver ordenes a abierta.'
			USING ERRCODE = '42501';
	END IF;

	/* El stock ya descontado no vuelve a un estado editable: se aprueba o se
	   rechaza (que emite la reversa contable). */
	IF "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Esta orden ya desconto stock: no se puede devolver a abierta. Apruebala o rechazala.';
	END IF;

	/* El borrador de repuestos se conserva: la orden vuelve al estado de trabajo
	   tal como estaba, para corregirla y volver a culminarla. */
	UPDATE "inv"."T_OrdenMantenimiento"
	SET "Situacion" = 'abierta',
		"FechaReconciliacion" = NULL,
		"MotivoReconciliacion" = NULLIF(LEFT('Devuelta a abierta: ' || COALESCE(NULLIF("PMotivo", ''), 'sin motivo'), 500), ''),
		"UsuarioModificacion" = COALESCE(auth.uid()::TEXT, 'API')
	WHERE "Id" = "PIdOrden";
END;
$$;

COMMENT ON FUNCTION "inv"."FnReabrirOrdenMantenimiento"(UUID, VARCHAR) IS 'Devuelve una OT por aprobar al estado abierta para corregirla, conservando el borrador de repuestos. Solo si no desconto stock (IdRequerimiento IS NULL). SECURITY DEFINER; revalida requerimientoAprobar. El motivo queda en MotivoReconciliacion.';
