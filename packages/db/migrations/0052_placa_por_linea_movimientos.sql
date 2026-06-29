/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: placa (IdVehiculo) por LÍNEA en documentos de inventario
	Tipo de Cambio: ALTER + REPLACE - mueve la placa destino del encabezado al detalle
	Autor: Equipo Desarrollo
	Fecha: 2026-06-29
	Descripcion: Una salida apuntaba a UNA placa (encabezado). En la operación real un
	             documento lleva varias placas (cada línea a su placa destino). Se agrega
	             IdVehiculo (FK real, integridad) a:
	               - inv.T_DocumentoInventarioDetalle (placa por ítem)
	               - inv.T_MovimientoStock (placa por movimiento del ledger, para reportes)
	             Se backfillea desde la placa del encabezado. El encabezado conserva su
	             IdVehiculo (default/atajo y compat con flujo OT). El reporte de movimientos
	             pasa a leer la placa del ledger (por línea), no del encabezado.
*/

/* 1. Columnas + FK + índices --------------------------------------------- */
ALTER TABLE "inv"."T_DocumentoInventarioDetalle" ADD COLUMN "IdVehiculo" UUID;
ALTER TABLE "inv"."T_DocumentoInventarioDetalle"
	ADD CONSTRAINT "FK_T_DocInvDetalle_Vehiculo_IdVehiculo"
	FOREIGN KEY ("IdVehiculo") REFERENCES "inv"."T_Vehiculo" ("Id");
CREATE INDEX "IX_T_DocInvDetalle_IdVehiculo"
	ON "inv"."T_DocumentoInventarioDetalle" ("IdVehiculo");

ALTER TABLE "inv"."T_MovimientoStock" ADD COLUMN "IdVehiculo" UUID;
ALTER TABLE "inv"."T_MovimientoStock"
	ADD CONSTRAINT "FK_T_MovimientoStock_Vehiculo_IdVehiculo"
	FOREIGN KEY ("IdVehiculo") REFERENCES "inv"."T_Vehiculo" ("Id");
CREATE INDEX "IX_T_MovimientoStock_IdVehiculo"
	ON "inv"."T_MovimientoStock" ("IdVehiculo");

COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."IdVehiculo" IS 'Placa destino de la línea (salidas). FK a T_Vehiculo.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdVehiculo" IS 'Placa atribuida al movimiento (copiada del detalle al confirmar). Fuente de la placa en reportes.';

/* 2. Backfill desde la placa del encabezado ------------------------------ */
UPDATE "inv"."T_DocumentoInventarioDetalle" "det"
SET "IdVehiculo" = "d"."IdVehiculo"
FROM "inv"."T_DocumentoInventario" "d"
WHERE "d"."Id" = "det"."IdDocumentoInventario" AND "d"."IdVehiculo" IS NOT NULL;

UPDATE "inv"."T_MovimientoStock" "m"
SET "IdVehiculo" = "d"."IdVehiculo"
FROM "inv"."T_DocumentoInventario" "d"
WHERE "d"."Id" = "m"."IdDocumentoInventario" AND "d"."IdVehiculo" IS NOT NULL;

/* 3. RPC de alta: placa por línea (cae al encabezado si la línea no la trae) */
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
		"TipoDocumento","NumeroDocumento","FechaDocumento","IdUbicacionOrigen",
		"IdUbicacionDestino","IdProveedor","Comprobante","Referencia","IdVehiculo",
		"Notas","Situacion","UsuarioCreacion","UsuarioModificacion"
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
		,"vUsuario","vUsuario"
	)
	RETURNING "Id" INTO "vIdDocumento";

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PDocumento"->'Detalle')
	LOOP
		INSERT INTO "inv"."T_DocumentoInventarioDetalle"
		(
			"IdDocumentoInventario","IdProducto","Cantidad","CostoUnitario",
			"IdVehiculo","Notas","UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"vIdDocumento"
			,("vDetalle"->>'IdProducto')::UUID
			,("vDetalle"->>'Cantidad')::NUMERIC
			,NULLIF("vDetalle"->>'CostoUnitario', '')::NUMERIC
			,COALESCE(
				NULLIF("vDetalle"->>'IdVehiculo', ''),
				NULLIF("PDocumento"->>'IdVehiculo', '')
			)::UUID
			,NULLIF("vDetalle"->>'Notas', '')
			,"vUsuario","vUsuario"
		);
	END LOOP;

	PERFORM "inv"."FnConfirmarDocumentoInventario"("vIdDocumento");

	RETURN "vIdDocumento";
END;
$$;

/* 4. Confirmación: copia la placa de la línea a cada movimiento del ledger */
CREATE OR REPLACE FUNCTION "inv"."FnConfirmarDocumentoInventario"("PIdDocumentoInventario" uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'inv', 'public' AS $$
DECLARE
	"vDocumento"      "inv"."T_DocumentoInventario";
	"vDetalle"        "inv"."T_DocumentoInventarioDetalle";
	"vCostoPromedio"  NUMERIC(14,4);
	"vCostoEgreso"    NUMERIC(14,4);
	"vPlaca"          UUID;
BEGIN
	SELECT * INTO "vDocumento"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = "PIdDocumentoInventario"
	FOR UPDATE;

	IF "vDocumento" IS NULL THEN
		RAISE EXCEPTION 'El documento % no existe.', "PIdDocumentoInventario";
	END IF;

	IF "vDocumento"."Situacion" <> 'borrador' THEN
		RAISE EXCEPTION 'Solo se confirman documentos en borrador (situacion actual: %).', "vDocumento"."Situacion";
	END IF;

	FOR "vDetalle" IN
		SELECT * FROM "inv"."T_DocumentoInventarioDetalle"
		WHERE "IdDocumentoInventario" = "PIdDocumentoInventario"
	LOOP
		SELECT "CostoPromedio" INTO "vCostoPromedio"
		FROM "inv"."T_Producto" WHERE "Id" = "vDetalle"."IdProducto";
		"vCostoEgreso" = COALESCE("vDetalle"."CostoUnitario", "vCostoPromedio", 0);
		"vPlaca" = COALESCE("vDetalle"."IdVehiculo", "vDocumento"."IdVehiculo");

		IF "vDocumento"."IdUbicacionOrigen" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('salida','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle","IdDocumentoInventario","IdProducto","IdUbicacion",
				"Direccion","Cantidad","CostoUnitario","IdVehiculo","FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id","vDocumento"."Id","vDetalle"."IdProducto","vDocumento"."IdUbicacionOrigen",
				-1,"vDetalle"."Cantidad","vCostoEgreso","vPlaca","vDocumento"."FechaDocumento"
			);
		END IF;

		IF "vDocumento"."IdUbicacionDestino" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('entrada','existencia_inicial','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle","IdDocumentoInventario","IdProducto","IdUbicacion",
				"Direccion","Cantidad","CostoUnitario","IdVehiculo","FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id","vDocumento"."Id","vDetalle"."IdProducto","vDocumento"."IdUbicacionDestino",
				1,"vDetalle"."Cantidad",
				CASE WHEN "vDocumento"."TipoDocumento" = 'transferencia' THEN "vCostoEgreso" ELSE "vDetalle"."CostoUnitario" END,
				"vPlaca","vDocumento"."FechaDocumento"
			);
		END IF;
	END LOOP;

	UPDATE "inv"."T_DocumentoInventario"
	SET "Situacion" = 'confirmado', "FechaConfirmacion" = NOW()
	WHERE "Id" = "PIdDocumentoInventario";
END;
$$;

/* 5. Reporte de movimientos: placa por movimiento (ledger), no por encabezado */
CREATE OR REPLACE VIEW "inv"."V_Reporte_Movimiento" WITH (security_invoker = true) AS
	SELECT
		m."Id" AS "IdMovimiento",
		m."FechaMovimiento",
		d."TipoDocumento",
		d."NumeroDocumento",
		d."Comprobante",
		p."Id" AS "IdProducto",
		p."Sku",
		p."Nombre" AS "NombreProducto",
		c."Id" AS "IdCategoria",
		c."Nombre" AS "NombreCategoria",
		ub."Id" AS "IdUbicacion",
		ub."Nombre" AS "NombreUbicacion",
		pr."Id" AS "IdProveedor",
		pr."Nombre" AS "NombreProveedor",
		ve."Id" AS "IdVehiculo",
		ve."Placa",
		eq."Id" AS "IdEquipo",
		eq."Nombre" AS "NombreEquipo",
		m."Direccion",
		m."Cantidad",
		m."Direccion"::numeric * m."Cantidad" AS "CantidadConSigno",
		m."CostoUnitario",
		m."Cantidad" * COALESCE(m."CostoUnitario", 0::numeric) AS "ValorMovimiento"
	FROM "inv"."T_MovimientoStock" m
		JOIN "inv"."T_Producto" p ON p."Id" = m."IdProducto"
		JOIN "inv"."T_Categoria" c ON c."Id" = p."IdCategoria"
		JOIN "inv"."T_Ubicacion" ub ON ub."Id" = m."IdUbicacion"
		JOIN "inv"."T_DocumentoInventario" d ON d."Id" = m."IdDocumentoInventario"
		LEFT JOIN "inv"."T_Proveedor" pr ON pr."Id" = d."IdProveedor"
		LEFT JOIN "inv"."T_Vehiculo" ve ON ve."Id" = m."IdVehiculo"
		LEFT JOIN "inv"."T_Equipo" eq ON eq."Id" = ve."IdEquipo";
