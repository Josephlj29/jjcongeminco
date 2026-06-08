/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRegistrarRequerimiento
	Tipo de Cambio: CREATE - registro atomico de requerimiento + detalle
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Crea cabecera y detalle de un requerimiento desde JSONB en una
	             transaccion. SECURITY INVOKER: respeta la RLS del usuario.
*/
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarRequerimiento"
(
	"PRequerimiento" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"      UUID;
	"vUsuario" VARCHAR(50);
	"vDetalle" JSONB;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento"
		,"FechaRequerimiento"
		,"Origen"
		,"IdEquipo"
		,"IdVehiculo"
		,"Notas"
		,"Situacion"
		,"UsuarioCreacion"
		,"UsuarioModificacion"
	)
	VALUES
	(
		NULLIF("PRequerimiento"->>'NumeroRequerimiento', '')
		,("PRequerimiento"->>'FechaRequerimiento')::DATE
		,"PRequerimiento"->>'Origen'
		,NULLIF("PRequerimiento"->>'IdEquipo', '')::UUID
		,NULLIF("PRequerimiento"->>'IdVehiculo', '')::UUID
		,NULLIF("PRequerimiento"->>'Notas', '')
		,'pendiente'
		,"vUsuario"
		,"vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PRequerimiento"->'Detalle')
	LOOP
		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento"
			,"IdProducto"
			,"Cantidad"
			,"Notas"
			,"UsuarioCreacion"
			,"UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,("vDetalle"->>'IdProducto')::UUID
			,("vDetalle"->>'Cantidad')::NUMERIC
			,NULLIF("vDetalle"->>'Notas', '')
			,"vUsuario"
			,"vUsuario"
		);
	END LOOP;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarRequerimiento"(JSONB) IS 'Crea un requerimiento con su detalle desde JSON en una transaccion.';
