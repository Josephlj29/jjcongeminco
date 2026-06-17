/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnEliminarOrdenMantenimiento (CREATE)
	Tipo de Cambio: CREATE - corrige TOCTOU del soft-delete de OT (auditoria QA)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: HALLAZGO CRITICO C2 — el DELETE de OT en la API hacia
	             FnContarDependencias (check) y, en una llamada separada, un UPDATE
	             crudo Estado=false (use), sin lock ni transaccion entre medio. Era el
	             unico camino de escritura del modulo que NO pasaba por una RPC: en
	             carrera con /consumir, una OT que ya descontaba stock podia quedar
	             soft-deleted (stock fantasma). Esta funcion encapsula check+use en una
	             sola transaccion con FOR UPDATE, revalida el rol (funcion expuesta por
	             RPC) y solo elimina OTs abiertas sin requerimiento enlazado.
	             Mismo patron que FnCerrarOrdenMantenimiento (0033).
*/

CREATE OR REPLACE FUNCTION "inv"."FnEliminarOrdenMantenimiento"
(
	"PIdOrden" UUID
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
	/* Defensa en profundidad: funcion SECURITY DEFINER expuesta por RPC.
	   Revalida requerimientoCrear (admin, almacenero, supervision). */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','almacenero','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para eliminar ordenes de mantenimiento.'
			USING ERRCODE = '42501';
	END IF;

	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;

	/* check+use atomico: solo OTs abiertas sin consumo. Cierra el TOCTOU:
	   si /consumir gano el lock, aqui veremos Situacion='consumida'/IdRequerimiento. */
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'No se puede eliminar: la orden ya consumio repuestos. Recházala (reconciliar) para revertir.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento" SET "Estado" = FALSE WHERE "Id" = "PIdOrden";
END;
$$;

COMMENT ON FUNCTION "inv"."FnEliminarOrdenMantenimiento"(UUID) IS 'Soft-delete atomico de una OT abierta sin repuestos. FOR UPDATE + check de estado en una transaccion (cierra el TOCTOU del DELETE crudo). SECURITY DEFINER; revalida requerimientoCrear.';
