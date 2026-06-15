/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnActualizarOrdenMantenimiento
	Tipo de Cambio: CREATE - edición atómica de cabecera + trabajos (solo OT abierta)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: Reemplaza la cabecera y la lista de trabajos de una OT en una sola
	             transacción (delete + reinsert). Solo permitido mientras la OT esté
	             'abierta' (sin consumo de repuestos). INVOKER: respeta la RLS de
	             escritura (admin/almacenero/supervision).
*/
CREATE OR REPLACE FUNCTION "inv"."FnActualizarOrdenMantenimiento"
(
	"PIdOrden" UUID,
	"POrden"   JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	"vOrden"   "inv"."T_OrdenMantenimiento";
	"vUsuario" VARCHAR(50);
	"vTrabajo" JSONB;
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

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "NumeroOrden"           = NULLIF("POrden"->>'NumeroOrden', ''),
		"TipoMantenimiento"     = "POrden"->>'TipoMantenimiento',
		"FechaOrden"            = ("POrden"->>'FechaOrden')::DATE,
		"Turno"                 = "POrden"->>'Turno',
		"Kilometraje"           = NULLIF("POrden"->>'Kilometraje', '')::NUMERIC,
		"IdVehiculo"            = ("POrden"->>'IdVehiculo')::UUID,
		"IdMecanicoResponsable" = ("POrden"->>'IdMecanicoResponsable')::UUID,
		"Observaciones"         = NULLIF("POrden"->>'Observaciones', ''),
		"UsuarioModificacion"   = "vUsuario"
	WHERE "Id" = "PIdOrden";

	DELETE FROM "inv"."T_OrdenMantenimientoTrabajo" WHERE "IdOrdenMantenimiento" = "PIdOrden";

	FOR "vTrabajo" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE("POrden"->'Trabajos', '[]'::JSONB))
	LOOP
		INSERT INTO "inv"."T_OrdenMantenimientoTrabajo"
		("IdOrdenMantenimiento", "Secuencia", "Descripcion", "UsuarioCreacion", "UsuarioModificacion")
		VALUES ("PIdOrden", ("vTrabajo"->>'Secuencia')::INT, "vTrabajo"->>'Descripcion', "vUsuario", "vUsuario");
	END LOOP;
END;
$$;

COMMENT ON FUNCTION "inv"."FnActualizarOrdenMantenimiento"(UUID, JSONB) IS 'Edita cabecera + reemplaza trabajos de una OT abierta, en una transaccion.';
