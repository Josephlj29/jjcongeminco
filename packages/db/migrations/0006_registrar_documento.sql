/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRegistrarDocumentoInventario
	Tipo de Cambio: CREATE - registro atomico de documento + detalle + confirmacion
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Recibe el documento completo en JSONB, crea cabecera y detalle
	             y lo confirma (genera el ledger) en una sola transaccion.
	             SECURITY INVOKER: la insercion de cabecera/detalle respeta RLS;
	             el ledger se escribe via FnConfirmarDocumentoInventario (DEFINER).
*/
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarDocumentoInventario"
(
	"PDocumento" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vIdDocumento" UUID;
	"vUsuario"     VARCHAR(50);
	"vDetalle"     JSONB;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_DocumentoInventario"
	(
		"TipoDocumento"
		,"NumeroDocumento"
		,"FechaDocumento"
		,"IdUbicacionOrigen"
		,"IdUbicacionDestino"
		,"IdProveedor"
		,"Comprobante"
		,"Referencia"
		,"IdVehiculo"
		,"Notas"
		,"Situacion"
		,"UsuarioCreacion"
		,"UsuarioModificacion"
	)
	VALUES
	(
		"PDocumento"->>'TipoDocumento'
		,NULLIF("PDocumento"->>'NumeroDocumento', '')
		,("PDocumento"->>'FechaDocumento')::DATE
		,NULLIF("PDocumento"->>'IdUbicacionOrigen', '')::UUID
		,NULLIF("PDocumento"->>'IdUbicacionDestino', '')::UUID
		,NULLIF("PDocumento"->>'IdProveedor', '')::UUID
		,NULLIF("PDocumento"->>'Comprobante', '')
		,NULLIF("PDocumento"->>'Referencia', '')
		,NULLIF("PDocumento"->>'IdVehiculo', '')::UUID
		,NULLIF("PDocumento"->>'Notas', '')
		,'borrador'
		,"vUsuario"
		,"vUsuario"
	)
	RETURNING "Id" INTO "vIdDocumento";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PDocumento"->'Detalle')
	LOOP
		INSERT INTO "inv"."T_DocumentoInventarioDetalle"
		(
			"IdDocumentoInventario"
			,"IdProducto"
			,"Cantidad"
			,"CostoUnitario"
			,"Notas"
			,"UsuarioCreacion"
			,"UsuarioModificacion"
		)
		VALUES
		(
			"vIdDocumento"
			,("vDetalle"->>'IdProducto')::UUID
			,("vDetalle"->>'Cantidad')::NUMERIC
			,NULLIF("vDetalle"->>'CostoUnitario', '')::NUMERIC
			,NULLIF("vDetalle"->>'Notas', '')
			,"vUsuario"
			,"vUsuario"
		);
	END LOOP;

	PERFORM "inv"."FnConfirmarDocumentoInventario"("vIdDocumento");

	RETURN "vIdDocumento";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarDocumentoInventario"(JSONB) IS 'Crea cabecera + detalle desde JSON y confirma el documento (genera el ledger) en una transaccion.';
