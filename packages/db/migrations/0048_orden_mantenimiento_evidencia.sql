/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_OrdenMantenimientoEvidencia + guard de evidencia al culminar
	Tipo de Cambio: CREATE + ALTER - evidencia fotográfica obligatoria al culminar
	Autor: Equipo Desarrollo
	Fecha: 2026-06-29
	Descripcion: Al CULMINAR una orden de mantenimiento se debe registrar evidencia
	             fotográfica de dos tipos: 'estado_actual' (antes) y
	             'post_mantenimiento' (después). Mínimo 1 de cada tipo para poder
	             cerrar; el tope de 10 por tipo se valida en el endpoint (como las
	             imágenes de producto). La tabla solo guarda la URL del archivo
	             (el front sube a Supabase Storage). El guard se aplica en el cierre
	             directo (FnCerrar) y en la aprobación de reconciliación
	             (FnReconciliar con PAprobar = true). El rechazo (anulada) NO exige
	             evidencia.
*/

/* 1. Tabla de evidencia (patrón de T_ProductoImagen + columna Tipo) ----- */
CREATE TABLE "inv"."T_OrdenMantenimientoEvidencia"
(
	"Id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdOrdenMantenimiento" UUID         NOT NULL,
	"Tipo"                 VARCHAR(20)  NOT NULL,
	"Url"                  VARCHAR(500) NOT NULL,
	"Orden"                SMALLINT     NOT NULL DEFAULT 1,
	"Estado"               BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"      VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"  VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"           BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"          UUID,
	CONSTRAINT "PK_T_OrdenMantenimientoEvidencia" PRIMARY KEY ("Id"),
	CONSTRAINT "CK_T_OrdenMantenimientoEvidencia_Tipo"
		CHECK ("Tipo" IN ('estado_actual','post_mantenimiento')),
	CONSTRAINT "CK_T_OrdenMantenimientoEvidencia_Orden" CHECK ("Orden" > 0),
	CONSTRAINT "FK_T_OrdenMantenimientoEvidencia_Orden_IdOrdenMantenimiento"
		FOREIGN KEY ("IdOrdenMantenimiento") REFERENCES "inv"."T_OrdenMantenimiento" ("Id") ON DELETE CASCADE
);

COMMENT ON TABLE "inv"."T_OrdenMantenimientoEvidencia" IS 'Evidencia fotográfica de una orden de mantenimiento: estado_actual (antes) y post_mantenimiento (después). Mín. 1 de cada para culminar; máx. 10 por tipo (validado en el endpoint).';

CREATE INDEX "IX_T_OrdenMantenimientoEvidencia_IdOrden_Tipo"
	ON "inv"."T_OrdenMantenimientoEvidencia" ("IdOrdenMantenimiento","Tipo");

CREATE TRIGGER "TR_T_OrdenMantenimientoEvidencia_Auditoria"
	BEFORE UPDATE ON "inv"."T_OrdenMantenimientoEvidencia"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_OrdenMantenimientoEvidencia" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_OrdenMantenimientoEvidencia"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "OrdenMantenimientoEvidenciaEscritura" ON "inv"."T_OrdenMantenimientoEvidencia"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

/* 2. Helper: exige evidencia mínima (1 de cada tipo) para culminar ----- */
CREATE OR REPLACE FUNCTION "inv"."FnExigirEvidenciaMantenimiento"("PIdOrden" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"vEstadoActual" INT;
	"vPost"         INT;
BEGIN
	SELECT
		COUNT(*) FILTER (WHERE "Tipo" = 'estado_actual'),
		COUNT(*) FILTER (WHERE "Tipo" = 'post_mantenimiento')
	INTO "vEstadoActual", "vPost"
	FROM "inv"."T_OrdenMantenimientoEvidencia"
	WHERE "IdOrdenMantenimiento" = "PIdOrden" AND "Estado" = TRUE;

	IF "vEstadoActual" = 0 OR "vPost" = 0 THEN
		RAISE EXCEPTION 'Para culminar la orden sube al menos una foto del estado actual y una de post-mantenimiento.';
	END IF;
END;
$$;

/* 3. Exigir evidencia en el cierre directo ----------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnCerrarOrdenMantenimiento"("PIdOrden" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"vOrden" "inv"."T_OrdenMantenimiento";
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Solo se cierra directamente una orden abierta sin repuestos. Si tiene consumo, usa reconciliar.';
	END IF;

	PERFORM "inv"."FnExigirEvidenciaMantenimiento"("PIdOrden");

	UPDATE "inv"."T_OrdenMantenimiento" SET "Situacion" = 'cerrada' WHERE "Id" = "PIdOrden";
END;
$$;

/* 4. Exigir evidencia al aprobar reconciliación (consumida -> cerrada) -- */
CREATE OR REPLACE FUNCTION "inv"."FnReconciliarOrdenMantenimiento"("PIdOrden" uuid, "PAprobar" boolean, "PMotivo" character varying DEFAULT NULL::character varying)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'inv', 'public' AS $$
DECLARE
	"vOrden"       "inv"."T_OrdenMantenimiento";
	"vRol"         TEXT;
	"vConsumidor"  TEXT;
	"vIdSalida"    UUID;
	"vUbicOrigen"  UUID;
	"vReversaDet"  JSONB;
	"vIdReversa"   UUID;
BEGIN
	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'consumida' THEN
		RAISE EXCEPTION 'Solo se reconcilian ordenes consumidas (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','gerencia','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para reconciliar ordenes de mantenimiento.';
	END IF;

	/* Segregación de funciones: quien CONSUMIÓ no ratifica su propio consumo (admin
	   exento). El consumidor se registra en el requerimiento enlazado, NO en el
	   encabezado de la OT (que pudo crear otra persona). */
	SELECT "UsuarioCreacion" INTO "vConsumidor"
	FROM "inv"."T_Requerimiento" WHERE "Id" = "vOrden"."IdRequerimiento";
	IF auth.uid() IS NOT NULL
	   AND auth.uid()::TEXT = "vConsumidor"
	   AND COALESCE("vRol", '') <> 'admin' THEN
		RAISE EXCEPTION 'No puedes reconciliar una orden cuyo consumo tu mismo registraste.';
	END IF;

	IF "PAprobar" THEN
		PERFORM "inv"."FnExigirEvidenciaMantenimiento"("PIdOrden");

		UPDATE "inv"."T_OrdenMantenimiento"
		SET "Situacion" = 'cerrada',
			"FechaReconciliacion" = NOW(),
			"MotivoReconciliacion" = NULLIF("PMotivo", '')
		WHERE "Id" = "PIdOrden";
		RETURN;
	END IF;

	SELECT "IdDocumentoInventario" INTO "vIdSalida"
	FROM "inv"."T_Requerimiento" WHERE "Id" = "vOrden"."IdRequerimiento";
	IF "vIdSalida" IS NULL THEN
		RAISE EXCEPTION 'No se encontro la salida de consumo a revertir.';
	END IF;

	SELECT "IdUbicacionOrigen" INTO "vUbicOrigen"
	FROM "inv"."T_DocumentoInventario" WHERE "Id" = "vIdSalida";

	SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
		'IdProducto', "IdProducto",
		'Cantidad', "Cantidad",
		'CostoUnitario', "CostoUnitario"
	))
	INTO "vReversaDet"
	FROM "inv"."T_MovimientoStock"
	WHERE "IdDocumentoInventario" = "vIdSalida" AND "Direccion" = -1;

	IF "vReversaDet" IS NULL THEN
		RAISE EXCEPTION 'La salida original no tiene movimientos de egreso a revertir.';
	END IF;

	"vIdReversa" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',      'entrada',
		'FechaDocumento',     to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionDestino', "vUbicOrigen",
		'IdVehiculo',         "vOrden"."IdVehiculo",
		'Referencia',         'Reversa OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8)),
		'Notas',              'Reversa contable por rechazo de orden de mantenimiento',
		'Detalle',            "vReversaDet"
	));

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "Situacion" = 'anulada',
		"IdDocumentoInventarioReversa" = "vIdReversa",
		"FechaReconciliacion" = NOW(),
		"MotivoReconciliacion" = NULLIF("PMotivo", '')
	WHERE "Id" = "PIdOrden";

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'anulado',
		"Notas" = CASE
			WHEN "PMotivo" IS NULL OR "PMotivo" = '' THEN "Notas"
			ELSE LEFT(COALESCE("Notas" || ' | ', '') || 'Rechazado: ' || "PMotivo", 500)
		END
	WHERE "Id" = "vOrden"."IdRequerimiento";
END;
$$;
