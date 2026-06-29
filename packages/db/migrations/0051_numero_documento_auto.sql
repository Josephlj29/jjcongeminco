/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRegistrarDocumentoInventario (reescritura)
	Tipo de Cambio: REPLACE - autogeneración del N° de documento en el servidor
	Autor: Equipo Desarrollo
	Fecha: 2026-06-29
	Descripcion: El N° de documento se tipeaba a mano (opcional) y podía quedar vacío.
	             Ahora, si llega vacío, el servidor genera el siguiente correlativo
	             GLOBAL con relleno de ceros: 0001, 0002, 0003, ...

	             Generación robusta: vCorr = MAX(correlativo numérico existente) + 1
	             (si la tabla está vacía → 1), luego un LOOP que busca el primer número
	             libre para no chocar con valores ya usados (incluidos números manuales).
	             Se usa MAX+1 y NO COUNT(*)+1: con bajas/borrados, COUNT reasignaría
	             números ya usados y generaría duplicados que se propagan al kardex.
	             Si el cliente manda un NumeroDocumento no vacío, se respeta tal cual.
*/

CREATE OR REPLACE FUNCTION "inv"."FnRegistrarDocumentoInventario"("PDocumento" jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	"vIdDocumento" UUID;
	"vUsuario"     VARCHAR(50);
	"vDetalle"     JSONB;
	"vNumero"      TEXT;
	"vCorr"        BIGINT;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	/* N° de documento: si viene vacío, se autogenera correlativo global con relleno. */
	"vNumero" = NULLIF("PDocumento"->>'NumeroDocumento', '');
	IF "vNumero" IS NULL THEN
		SELECT COALESCE(MAX(("NumeroDocumento")::BIGINT), 0)
		INTO "vCorr"
		FROM "inv"."T_DocumentoInventario"
		WHERE "NumeroDocumento" ~ '^[0-9]+$';

		"vCorr" = "vCorr" + 1;
		LOOP
			"vNumero" = LPAD("vCorr"::TEXT, 4, '0');
			EXIT WHEN NOT EXISTS (
				SELECT 1 FROM "inv"."T_DocumentoInventario"
				WHERE "NumeroDocumento" = "vNumero"
			);
			"vCorr" = "vCorr" + 1;
		END LOOP;
	END IF;

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
		,"vNumero"
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
