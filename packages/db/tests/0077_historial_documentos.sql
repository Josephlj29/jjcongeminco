/*
	Prueba de integración SQL — migración 0077
	Objeto: inv.V_Historial_DocumentoInventario

	El historial de documentos (solo admin) tiene que dar, por documento, lo que
	antes había que reconstruir abriendo el kardex: de dónde a dónde, cuántos
	productos, cuánto vale, quién lo cargó y, si se anuló, quién y cuándo.

	Cómo correrla (psql o el SQL editor de Supabase). Es de solo lectura salvo por
	el RAISE final, que además hace rollback:

		\i packages/db/tests/0077_historial_documentos.sql

	Resultado esperado: "OK 0077 ... (rollback de la prueba)".
*/
DO $$
DECLARE
	"vFallas"   TEXT[] := ARRAY[]::TEXT[];
	"vCol"      TEXT;
	"vCantidad" BIGINT;
	"vVista"    BIGINT;
BEGIN
	/* ── 1. La vista existe y expone las columnas del historial ────────── */
	FOREACH "vCol" IN ARRAY ARRAY[
		'Id','TipoDocumento','FechaDocumento','NumeroDocumento','Comprobante','Referencia',
		'Notas','Situacion','Estado','FechaCreacion','UsuarioCreacion',
		'IdUbicacionOrigen','NombreUbicacionOrigen','IdUbicacionDestino','NombreUbicacionDestino',
		'IdProveedor','NombreProveedor','IdVehiculo','Placa',
		'CantidadItems','ValorTotal','FechaRegistro','RegistradoPor','FechaAnulacion','AnuladoPor'
	] LOOP
		IF NOT EXISTS (SELECT 1 FROM information_schema.columns
			WHERE table_schema='inv' AND table_name='V_Historial_DocumentoInventario' AND column_name="vCol") THEN
			"vFallas" = "vFallas" || FORMAT('1) El historial no expone %s.', "vCol");
		END IF;
	END LOOP;

	IF array_length("vFallas", 1) > 0 THEN
		RAISE EXCEPTION 'FALLA 0077: %', array_to_string("vFallas", E'\n');
	END IF;

	/* ── 2. Una fila por documento: los JOIN no duplican ni pierden ────── */
	SELECT COUNT(*) INTO "vCantidad" FROM "inv"."T_DocumentoInventario";
	SELECT COUNT(*) INTO "vVista" FROM "inv"."V_Historial_DocumentoInventario";
	IF "vCantidad" <> "vVista" THEN
		"vFallas" = "vFallas" || FORMAT('2) %s documentos y %s filas en el historial.', "vCantidad", "vVista");
	END IF;

	/* ── 3. Ítems = productos distintos movidos por el documento ───────── */
	SELECT COUNT(*) INTO "vCantidad"
	FROM "inv"."V_Historial_DocumentoInventario" H
	WHERE H."CantidadItems" IS DISTINCT FROM (
		SELECT COUNT(DISTINCT M."IdProducto") FROM "inv"."T_MovimientoStock" M
		WHERE M."IdDocumentoInventario" = H."Id");
	IF "vCantidad" > 0 THEN
		"vFallas" = "vFallas" || FORMAT('3) %s documentos con CantidadItems mal contado.', "vCantidad");
	END IF;

	/* ── 4. Valor: una transferencia cuenta solo su pata de salida ─────── */
	SELECT COUNT(*) INTO "vCantidad"
	FROM "inv"."V_Historial_DocumentoInventario" H
	WHERE H."ValorTotal" IS DISTINCT FROM (
		SELECT COALESCE(SUM(M."Cantidad" * COALESCE(M."CostoUnitario", 0)), 0)
		FROM "inv"."T_MovimientoStock" M
		WHERE M."IdDocumentoInventario" = H."Id"
		  AND (H."TipoDocumento" <> 'transferencia' OR M."Direccion" = -1));
	IF "vCantidad" > 0 THEN
		"vFallas" = "vFallas" || FORMAT('4) %s documentos con ValorTotal distinto al del ledger.', "vCantidad");
	END IF;

	/* ── 5. Anulación: solo los anulados dicen quién y cuándo ──────────── */
	SELECT COUNT(*) INTO "vCantidad"
	FROM "inv"."V_Historial_DocumentoInventario"
	WHERE ("Situacion" = 'anulado') <> ("FechaAnulacion" IS NOT NULL);
	IF "vCantidad" > 0 THEN
		"vFallas" = "vFallas" || FORMAT('5) %s documentos con FechaAnulacion incoherente con su Situacion.', "vCantidad");
	END IF;

	/* ── 6. RegistradoPor resuelve nombre, no deja el uid crudo ────────── */
	SELECT COUNT(*) INTO "vCantidad"
	FROM "inv"."V_Historial_DocumentoInventario" H
	JOIN "seg"."T_Usuario" U ON U."Id"::VARCHAR = H."UsuarioCreacion"
	WHERE H."RegistradoPor" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';
	IF "vCantidad" > 0 THEN
		"vFallas" = "vFallas" || FORMAT('6) %s documentos de usuarios existentes muestran el uid.', "vCantidad");
	END IF;

	IF array_length("vFallas", 1) > 0 THEN
		RAISE EXCEPTION 'FALLA 0077: %', array_to_string("vFallas", E'\n');
	END IF;

	RAISE EXCEPTION 'OK 0077 historial de documentos (rollback de la prueba)';
END;
$$;
