/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnRecalcularCostoPromedioProducto (CREATE)
	        inv.FnMotivoBloqueoCorreccionDocumento (CREATE)
	        inv.FnAnularDocumentoInventario (CREATE)
	        inv.FnCorregirDocumentoInventario (CREATE)
	        inv.FnBloquearEdicionDocumentoConfirmado (CREATE) + 2 triggers
	Tipo de Cambio: CREATE
	Autor: Equipo Desarrollo
	Fecha: 2026-09-08
	Descripcion: Permite al rol admin corregir o anular un documento de inventario
	             ya confirmado mientras nada de lo que movio se haya consumido.

	             El ledger (T_MovimientoStock) es append-only: "corregir" NO es un
	             UPDATE, es anular el documento (emitiendo un documento inverso) y
	             volver a registrarlo con los valores buenos, todo en la misma
	             transaccion. El rastro queda en el kardex, que es lo correcto.

	             Que se considera "no consumido", por cada pata de ingreso del
	             documento:
	               1. Contable: su lote sigue intacto segun el FIFO de solo lectura
	                  de FnHistorialPreciosProducto (remanente = cantidad ingresada).
	                  Si algo salio despues, esa salida ya se valorizo con el costo
	                  viejo y su costo quedo congelado en el ledger: corregir la
	                  entrada no lo arregla, asi que se bloquea.
	               2. Tecnico: el saldo del producto en esa ubicacion alcanza para
	                  revertirlo (el lote se mide global, el saldo es por ubicacion).

	             Quedan fuera: transferencias (no dejan fila en el historico de
	             precios, no hay con que evaluar el lote) y los documentos ligados a
	             un requerimiento o a la reversa de una orden de trabajo, que tienen
	             su propio flujo de correccion.

	             Ademas cierra un agujero previo: hasta hoy nada impedia un UPDATE
	             directo sobre un documento confirmado o su detalle, lo que dejaba el
	             detalle desincronizado del ledger sin dejar rastro.
*/

/* ---------------------------------------------------------------------
	1. Recalculo determinista del costo promedio movil de un producto.

	Reproduce el mismo algoritmo del trigger FnRecalcularCostoPromedio pero
	releyendo el ledger completo en orden cronologico y salteando los
	documentos anulados. Se necesita porque una reversa (salida) NO revierte
	CostoPromedio ni UltimoCosto: el trigger solo actua en ingresos.

	Tambien reescribe el CostoPromedio de las filas vivas de
	T_ProductoPrecioHistorico, que son la foto del promedio tras cada compra.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnRecalcularCostoPromedioProducto"
(
	"PIdProducto" UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vFila"        RECORD;
	"vCantidad"    NUMERIC(14,3) = 0;
	"vPrevio"      NUMERIC(14,3);
	"vPromedio"    NUMERIC(14,4) = 0;
	"vUltimoCosto" NUMERIC(14,4);
BEGIN
	FOR "vFila" IN
		SELECT
			M."Id"
			,M."Direccion"
			,M."Cantidad"
			,M."CostoUnitario"
			,M."IdDocumentoInventario"
			,D."TipoDocumento"
		FROM "inv"."T_MovimientoStock" M
		INNER JOIN "inv"."T_DocumentoInventario" D ON D."Id" = M."IdDocumentoInventario"
		WHERE M."IdProducto" = "PIdProducto"
		  AND D."Situacion" <> 'anulado'
		ORDER BY M."FechaMovimiento", M."FechaCreacion", M."Id"
	LOOP
		/* Las transferencias mueven costo, no lo crean (igual que el trigger) */
		IF "vFila"."Direccion" = 1
		   AND "vFila"."CostoUnitario" IS NOT NULL
		   AND "vFila"."TipoDocumento" <> 'transferencia'
		THEN
			"vPrevio" = GREATEST("vCantidad", 0);

			IF ("vPrevio" + "vFila"."Cantidad") <= 0 THEN
				"vPromedio" = "vFila"."CostoUnitario";
			ELSE
				"vPromedio" =
					(("vPrevio" * "vPromedio") + ("vFila"."Cantidad" * "vFila"."CostoUnitario"))
					/ ("vPrevio" + "vFila"."Cantidad");
			END IF;

			"vUltimoCosto" = "vFila"."CostoUnitario";

			/* La foto del promedio de esa compra queda coherente con el replay */
			UPDATE "inv"."T_ProductoPrecioHistorico"
			SET "CostoPromedio" = "vPromedio"
			WHERE "IdProducto" = "PIdProducto"
			  AND "IdDocumentoInventario" = "vFila"."IdDocumentoInventario"
			  AND "Estado" = TRUE;
		END IF;

		"vCantidad" = "vCantidad" + ("vFila"."Direccion" * "vFila"."Cantidad");
	END LOOP;

	UPDATE "inv"."T_Producto"
	SET "CostoPromedio" = COALESCE("vPromedio", 0)
		,"UltimoCosto"  = "vUltimoCosto"
	WHERE "Id" = "PIdProducto";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRecalcularCostoPromedioProducto"(UUID) IS 'Recalcula CostoPromedio/UltimoCosto releyendo el ledger (ignora documentos anulados). Necesario tras anular una entrada: la reversa no revierte el promedio.';

/* ---------------------------------------------------------------------
	2. Por que NO se puede corregir un documento. NULL = se puede.

	Fuente unica de verdad: la usa la API para derivar el flag que habilita
	la accion en la UI, y la usan las dos funciones de mutacion antes de
	tocar nada. STABLE para poder llamarla desde un SELECT.
--------------------------------------------------------------------- */
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
		RETURN 'El documento ya esta anulado.';
	END IF;

	IF "vDocumento"."Situacion" <> 'confirmado' THEN
		RETURN 'El documento todavia no esta confirmado.';
	END IF;

	IF "vDocumento"."TipoDocumento" = 'transferencia' THEN
		RETURN 'Las transferencias no se corrigen desde aca: no dejan rastro en el historico de precios.';
	END IF;

	/* Ligado a un requerimiento: se corrige desde Aprobaciones */
	IF EXISTS (
		SELECT 1 FROM "inv"."T_RequerimientoAtencion"
		WHERE "IdDocumentoInventario" = "PIdDocumento" AND "Estado" = TRUE
	) OR EXISTS (
		SELECT 1 FROM "inv"."T_Requerimiento"
		WHERE "IdDocumentoInventario" = "PIdDocumento"
	) THEN
		RETURN 'Atiende un requerimiento: corregilo desde Aprobaciones.';
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
					'Ya se consumio parte de lo que ingreso de %s: corregirlo no revalorizaria las salidas ya emitidas.',
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

/* ---------------------------------------------------------------------
	3. Anular un documento confirmado emitiendo su documento inverso.

	Devuelve el Id del documento de reversa. Copia el CostoUnitario exacto
	leido del ledger para no contaminar el promedio (mismo criterio que la
	reversa por rechazo de una orden de trabajo).
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnAnularDocumentoInventario"
(
	"PIdDocumento" UUID
	,"PMotivo"     VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vDocumento" "inv"."T_DocumentoInventario";
	"vMotivoBloqueo" TEXT;
	"vRol"        TEXT;
	"vUsuario"    VARCHAR(50);
	"vIdReversa"  UUID;
	"vGrupo"      RECORD;
	"vProducto"   UUID;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');
	"vRol"     = "seg"."FnRolUsuario"();

	/* Defensa en profundidad: la API ya valido el permiso documentoCorregir */
	IF auth.uid() IS NOT NULL AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'Solo un administrador corrige o anula un documento confirmado.'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	/* Cierra el TOCTOU: nadie consume entre la validacion y la reversa */
	SELECT * INTO "vDocumento"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = "PIdDocumento"
	FOR UPDATE;

	"vMotivoBloqueo" = "inv"."FnMotivoBloqueoCorreccionDocumento"("PIdDocumento");
	IF "vMotivoBloqueo" IS NOT NULL THEN
		RAISE EXCEPTION '%', "vMotivoBloqueo";
	END IF;

	/* Un documento inverso por ubicacion y sentido, con el costo del ledger */
	FOR "vGrupo" IN
		SELECT
			M."Direccion"
			,M."IdUbicacion"
			,JSONB_AGG(JSONB_BUILD_OBJECT(
				'IdProducto',    M."IdProducto",
				'Cantidad',      M."Cantidad",
				'CostoUnitario', M."CostoUnitario",
				'IdVehiculo',    M."IdVehiculo"
			)) AS "Detalle"
		FROM "inv"."T_MovimientoStock" M
		WHERE M."IdDocumentoInventario" = "PIdDocumento"
		GROUP BY M."Direccion", M."IdUbicacion"
	LOOP
		"vIdReversa" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			/* Direccion 1 entro: la reversa lo saca. Direccion -1 salio: lo devuelve */
			'TipoDocumento',      CASE WHEN "vGrupo"."Direccion" = 1 THEN 'salida' ELSE 'entrada' END,
			'FechaDocumento',     TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionOrigen',  CASE WHEN "vGrupo"."Direccion" = 1 THEN "vGrupo"."IdUbicacion" ELSE NULL END,
			'IdUbicacionDestino', CASE WHEN "vGrupo"."Direccion" = 1 THEN NULL ELSE "vGrupo"."IdUbicacion" END,
			'Referencia',         LEFT('Reversa doc ' || COALESCE("vDocumento"."NumeroDocumento", ''), 120),
			'Notas',              LEFT(COALESCE("PMotivo", 'Anulacion de documento confirmado'), 500),
			'Detalle',            "vGrupo"."Detalle"
		));
	END LOOP;

	UPDATE "inv"."T_DocumentoInventario"
	SET "Situacion"           = 'anulado'
		,"Notas"              = LEFT(
			COALESCE("Notas" || ' | ', '') || 'ANULADO: ' || COALESCE("PMotivo", 'sin motivo'), 500)
		,"UsuarioModificacion" = "vUsuario"
	WHERE "Id" = "PIdDocumento";

	/* El lote deja de respaldar stock: FnHistorialPreciosProducto filtra Estado */
	UPDATE "inv"."T_ProductoPrecioHistorico"
	SET "Estado" = FALSE
		,"UsuarioModificacion" = "vUsuario"
	WHERE "IdDocumentoInventario" = "PIdDocumento";

	/* La reversa no revierte el promedio: hay que recalcularlo */
	FOR "vProducto" IN
		SELECT DISTINCT "IdProducto"
		FROM "inv"."T_MovimientoStock"
		WHERE "IdDocumentoInventario" = "PIdDocumento"
	LOOP
		PERFORM "inv"."FnRecalcularCostoPromedioProducto"("vProducto");
	END LOOP;

	RETURN "vIdReversa";
END;
$$;

COMMENT ON FUNCTION "inv"."FnAnularDocumentoInventario"(UUID, VARCHAR) IS 'Anula un documento confirmado no consumido: emite el documento inverso, lo marca anulado, baja su lote del historico de precios y recalcula el costo promedio. Solo admin.';

/* ---------------------------------------------------------------------
	4. Corregir = anular + volver a registrar, en una sola transaccion.

	Devuelve el Id del documento NUEVO (el corregido). El tipo no se puede
	cambiar: una entrada mal cargada sigue siendo una entrada.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnCorregirDocumentoInventario"
(
	"PIdDocumento" UUID
	,"PDocumento"  JSONB
	,"PMotivo"     VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vTipoOriginal" TEXT;
	"vNumero"       TEXT;
	"vIdNuevo"      UUID;
	"vProducto"     UUID;
BEGIN
	SELECT "TipoDocumento", "NumeroDocumento"
	INTO "vTipoOriginal", "vNumero"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = "PIdDocumento";

	IF "vTipoOriginal" IS NULL THEN
		RAISE EXCEPTION 'El documento no existe.';
	END IF;

	IF "PDocumento"->>'TipoDocumento' <> "vTipoOriginal" THEN
		RAISE EXCEPTION 'La correccion no puede cambiar el tipo de documento (%).', "vTipoOriginal";
	END IF;

	/* Anula primero: libera el stock que despues vuelve a tomar el corregido,
	   asi una correccion que solo baja la cantidad nunca choca con el saldo */
	PERFORM "inv"."FnAnularDocumentoInventario"("PIdDocumento", "PMotivo");

	"vIdNuevo" = "inv"."FnRegistrarDocumentoInventario"(
		"PDocumento"
		|| JSONB_BUILD_OBJECT(
			'NumeroDocumento', NULL,
			'Referencia', LEFT(
				COALESCE(NULLIF("PDocumento"->>'Referencia', ''), '')
				|| CASE WHEN COALESCE("PDocumento"->>'Referencia', '') = '' THEN '' ELSE ' | ' END
				|| 'Corrige doc ' || COALESCE("vNumero", ''), 120),
			'Notas', LEFT(
				COALESCE(NULLIF("PDocumento"->>'Notas', '') || ' | ', '')
				|| 'CORRECCION: ' || COALESCE("PMotivo", 'sin motivo'), 500)
		)
	);

	/* El corregido entra con su propio costo: recalcular deja todo coherente */
	FOR "vProducto" IN
		SELECT DISTINCT "IdProducto"
		FROM "inv"."T_MovimientoStock"
		WHERE "IdDocumentoInventario" = "vIdNuevo"
	LOOP
		PERFORM "inv"."FnRecalcularCostoPromedioProducto"("vProducto");
	END LOOP;

	RETURN "vIdNuevo";
END;
$$;

COMMENT ON FUNCTION "inv"."FnCorregirDocumentoInventario"(UUID, JSONB, VARCHAR) IS 'Corrige un documento confirmado no consumido: lo anula (con reversa) y registra el corregido en la misma transaccion. Devuelve el Id del nuevo. Solo admin.';

/* ---------------------------------------------------------------------
	5. Un documento confirmado no se edita a mano.

	Hasta hoy la politica DocumentoEscritura era FOR ALL y los grants incluian
	UPDATE, asi que un UPDATE directo sobre la cabecera o el detalle de un
	documento confirmado pasaba sin ruido y dejaba el detalle desincronizado
	del ledger (que si esta blindado). Estos triggers lo cierran.

	La cabecera si admite cambios de flujo y de texto: Situacion (para anular),
	Notas, Referencia, RutaPdf y las columnas de auditoria.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnBloquearEdicionDocumentoConfirmado"()
RETURNS TRIGGER
LANGUAGE plpgsql
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
		RAISE EXCEPTION 'Un documento confirmado no se edita: corrijalo desde Movimientos (anula y rehace).'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "inv"."FnBloquearEdicionDetalleConfirmado"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "inv"."T_DocumentoInventario"
		WHERE "Id" = OLD."IdDocumentoInventario" AND "Situacion" = 'confirmado'
	) THEN
		RAISE EXCEPTION 'El detalle de un documento confirmado no se edita: corrijalo desde Movimientos (anula y rehace).'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "TR_T_DocumentoInventario_BloquearEdicion" ON "inv"."T_DocumentoInventario";
CREATE TRIGGER "TR_T_DocumentoInventario_BloquearEdicion"
	BEFORE UPDATE ON "inv"."T_DocumentoInventario"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnBloquearEdicionDocumentoConfirmado"();

DROP TRIGGER IF EXISTS "TR_T_DocumentoInventarioDetalle_BloquearEdicion" ON "inv"."T_DocumentoInventarioDetalle";
CREATE TRIGGER "TR_T_DocumentoInventarioDetalle_BloquearEdicion"
	BEFORE UPDATE ON "inv"."T_DocumentoInventarioDetalle"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnBloquearEdicionDetalleConfirmado"();

/* ---------------------------------------------------------------------
	6. Grants (mismo criterio que el resto de RPCs del esquema).
--------------------------------------------------------------------- */
GRANT EXECUTE ON FUNCTION "inv"."FnRecalcularCostoPromedioProducto"(UUID) TO "authenticated";
GRANT EXECUTE ON FUNCTION "inv"."FnMotivoBloqueoCorreccionDocumento"(UUID) TO "authenticated";
GRANT EXECUTE ON FUNCTION "inv"."FnAnularDocumentoInventario"(UUID, VARCHAR) TO "authenticated";
GRANT EXECUTE ON FUNCTION "inv"."FnCorregirDocumentoInventario"(UUID, JSONB, VARCHAR) TO "authenticated";
