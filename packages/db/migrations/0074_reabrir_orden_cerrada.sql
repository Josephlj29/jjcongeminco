/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnReabrirOrdenMantenimiento (REPLACE)
	Tipo de Cambio: REPLACE - el admin puede reabrir una OT cerrada por error
	Autor: Equipo Desarrollo
	Fecha: 2026-09-24
	Descripcion: Hasta 0069 'cerrada' era terminal para TODOS los roles: no habia
	             funcion que la aceptara como entrada, asi que un cierre por error
	             solo se arreglaba con un UPDATE a mano en la base.

	             El agujero esta en el flujo: una OT que se culmina SIN repuestos
	             no pasa por aprobacion, va derecho a 'cerrada'
	             (FnCerrarOrdenMantenimiento). O sea que el camino menos controlado
	             es justo el que deja el estado irreversible, y por eso se acumulan
	             pedidos de correccion manual.

	             Ahora 'cerrada' vuelve a 'abierta', con tres candados:
	               1. Solo el rol admin. Devolver a abierta una OT "por aprobar"
	                  lo sigue haciendo el aprobador (admin/gerencia/supervision),
	                  pero deshacer un CIERRE es otra cosa.
	               2. Solo si la orden nunca desconto stock (IdRequerimiento NULL).
	                  Si movio inventario, ni el admin la reabre: eso se corrige
	                  por el ledger (anular/corregir el documento), no cambiando
	                  la situacion de la orden.
	               3. El borrador de repuestos y los trabajos se conservan: la
	                  orden vuelve tal cual estaba para completarla y culminarla
	                  de nuevo.
*/
CREATE OR REPLACE FUNCTION "inv"."FnReabrirOrdenMantenimiento"(
	"PIdOrden" UUID,
	"PMotivo"  VARCHAR DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'inv', 'public'
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
	IF "vOrden"."Situacion" NOT IN ('consumida', 'cerrada') THEN
		RAISE EXCEPTION 'Solo se devuelve a abierta una orden por aprobar o cerrada (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	/* Defensa en profundidad: la funcion es SECURITY DEFINER y queda expuesta por
	   RPC, asi que revalidamos el rol aunque la API ya lo haya hecho. */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vOrden"."Situacion" = 'cerrada' THEN
		IF "vRol" IS DISTINCT FROM 'admin' THEN
			RAISE EXCEPTION 'Solo un administrador puede reabrir una orden cerrada.'
				USING ERRCODE = '42501';
		END IF;
	ELSIF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para devolver ordenes a abierta.'
			USING ERRCODE = '42501';
	END IF;

	/* El stock ya descontado no vuelve a un estado editable. */
	IF "vOrden"."IdRequerimiento" IS NOT NULL THEN
		IF "vOrden"."Situacion" = 'cerrada' THEN
			RAISE EXCEPTION 'Esta orden ya desconto stock: no se puede reabrir. Corrige o anula su documento de salida desde Movimientos.';
		END IF;
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

COMMENT ON FUNCTION "inv"."FnReabrirOrdenMantenimiento"(UUID, VARCHAR) IS 'Devuelve una OT a abierta conservando su borrador: desde "por aprobar" (admin/gerencia/supervision) o desde "cerrada" (solo admin, deshace un cierre por error). Nunca si la orden ya desconto stock.';
