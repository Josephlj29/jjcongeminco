/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnMotivoBloqueoCorreccionDocumento (REPLACE)
	        inv.FnBloquearEdicionDocumentoConfirmado (REPLACE)
	        inv.FnBloquearEdicionDetalleConfirmado (REPLACE)
	Tipo de Cambio: REPLACE - mensajes en espanol neutro, sin voseo
	Autor: Equipo Desarrollo
	Fecha: 2026-10-24
	Descripcion: Los textos que ve el usuario van en espanol neutro/peruano
	             (tuteo), nunca en voseo. Estas funciones de 0072 devolvian
	             "corregilo desde Aprobaciones", "desde aca" y "corrijalo", y
	             varios mensajes sin tildes ("esta anulado", "se consumio").

	             Solo cambian los textos. La logica es identica a 0072, copiada
	             de la definicion viva (verificada igual al repo el 2026-10-24).
*/
CREATE OR REPLACE FUNCTION "inv"."FnMotivoBloqueoCorreccionDocumento"
(
	"PIdDocumento" UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vDocumento" "inv"."T_DocumentoInventario";
	"vFila"      RECORD;
BEGIN
	SELECT * INTO "vDocumento"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = "PIdDocumento";

	IF "vDocumento" IS NULL THEN
		RETURN 'El documento no existe.';
	END IF;

	IF "vDocumento"."Situacion" = 'anulado' THEN
		RETURN 'El documento ya está anulado.';
	END IF;

	IF "vDocumento"."Situacion" <> 'confirmado' THEN
		RETURN 'El documento todavía no está confirmado.';
	END IF;

	IF "vDocumento"."TipoDocumento" = 'transferencia' THEN
		RETURN 'Las transferencias no se corrigen desde aquí: no dejan rastro en el histórico de precios.';
	END IF;

	/* Ligado a un requerimiento: se corrige desde Aprobaciones */
	IF EXISTS (
		SELECT 1 FROM "inv"."T_RequerimientoAtencion"
		WHERE "IdDocumentoInventario" = "PIdDocumento" AND "Estado" = TRUE
	) OR EXISTS (
		SELECT 1 FROM "inv"."T_Requerimiento"
		WHERE "IdDocumentoInventario" = "PIdDocumento"
	) THEN
		RETURN 'Atiende un requerimiento: corrígelo desde Aprobaciones.';
	END IF;

	/* Reversa contable de una orden de trabajo */
	IF EXISTS (
		SELECT 1 FROM "inv"."T_OrdenMantenimiento"
		WHERE "IdDocumentoInventarioReversa" = "PIdDocumento"
	) THEN
		RETURN 'Es la reversa de una orden de trabajo: no se corrige por separado.';
	END IF;

	/* Una pata de ingreso por vez: lote intacto (contable) + saldo (tecnico) */
	FOR "vFila" IN
		SELECT
			M."IdProducto"
			,M."IdUbicacion"
			,SUM(M."Cantidad")                    AS "Cantidad"
			,BOOL_OR(M."CostoUnitario" IS NOT NULL) AS "TieneCosto"
			,P."Nombre"                           AS "NombreProducto"
			,U."Nombre"                           AS "NombreUbicacion"
		FROM "inv"."T_MovimientoStock" M
		INNER JOIN "inv"."T_Producto"  P ON P."Id" = M."IdProducto"
		INNER JOIN "inv"."T_Ubicacion" U ON U."Id" = M."IdUbicacion"
		WHERE M."IdDocumentoInventario" = "PIdDocumento"
		  AND M."Direccion" = 1
		GROUP BY M."IdProducto", M."IdUbicacion", P."Nombre", U."Nombre"
	LOOP
		/* Contable: el lote de esta entrada tiene que seguir entero */
		IF "vFila"."TieneCosto" THEN
			IF NOT EXISTS (
				SELECT 1
				FROM "inv"."FnHistorialPreciosProducto"("vFila"."IdProducto") H
				WHERE H."IdDocumentoInventario" = "PIdDocumento"
				  AND H."CantidadRemanente" >= H."CantidadComprada"
			) THEN
				RETURN FORMAT(
					'Ya se consumió parte de lo que ingresó de %s: corregirlo no revalorizaría las salidas ya emitidas.',
					"vFila"."NombreProducto"
				);
			END IF;
		END IF;

		/* Tecnico: la reversa saca esa cantidad de esa ubicacion */
		IF COALESCE((
			SELECT S."CantidadDisponible"
			FROM "inv"."T_SaldoStock" S
			WHERE S."IdProducto" = "vFila"."IdProducto"
			  AND S."IdUbicacion" = "vFila"."IdUbicacion"
		), 0) < "vFila"."Cantidad" THEN
			RETURN FORMAT(
				'El saldo de %s en %s ya no alcanza para revertir el ingreso.',
				"vFila"."NombreProducto", "vFila"."NombreUbicacion"
			);
		END IF;
	END LOOP;

	RETURN NULL;
END;
$$;

COMMENT ON FUNCTION "inv"."FnMotivoBloqueoCorreccionDocumento"(UUID) IS 'NULL si el documento se puede corregir/anular; si no, el motivo listo para mostrar. Fuente unica de verdad de la regla (la usan la API y las funciones de mutacion).';

CREATE OR REPLACE FUNCTION "inv"."FnBloquearEdicionDocumentoConfirmado"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = "inv", "public"
AS $$
BEGIN
	IF OLD."Situacion" <> 'confirmado' THEN
		RETURN NEW;
	END IF;

	IF NEW."TipoDocumento" <> OLD."TipoDocumento"
		OR NEW."FechaDocumento" <> OLD."FechaDocumento"
		OR COALESCE(NEW."NumeroDocumento", '') <> COALESCE(OLD."NumeroDocumento", '')
		OR COALESCE(NEW."IdUbicacionOrigen"::TEXT, '') <> COALESCE(OLD."IdUbicacionOrigen"::TEXT, '')
		OR COALESCE(NEW."IdUbicacionDestino"::TEXT, '') <> COALESCE(OLD."IdUbicacionDestino"::TEXT, '')
		OR COALESCE(NEW."IdProveedor"::TEXT, '') <> COALESCE(OLD."IdProveedor"::TEXT, '')
		OR COALESCE(NEW."IdVehiculo"::TEXT, '') <> COALESCE(OLD."IdVehiculo"::TEXT, '')
		OR COALESCE(NEW."Comprobante", '') <> COALESCE(OLD."Comprobante", '')
	THEN
		RAISE EXCEPTION 'Un documento confirmado no se edita: corrígelo desde Movimientos o Historial (anula y rehace).'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "inv"."FnBloquearEdicionDetalleConfirmado"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = "inv", "public"
AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "inv"."T_DocumentoInventario"
		WHERE "Id" = OLD."IdDocumentoInventario" AND "Situacion" = 'confirmado'
	) THEN
		RAISE EXCEPTION 'El detalle de un documento confirmado no se edita: corrígelo desde Movimientos o Historial (anula y rehace).'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;
