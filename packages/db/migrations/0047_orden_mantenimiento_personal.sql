/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_OrdenMantenimientoPersonal (puente OT <-> personal, N:M) +
	        reescritura de FnRegistrar/FnActualizar/FnConsumir + drop de la FK directa
	Tipo de Cambio: CREATE + ALTER - personales múltiples por orden de mantenimiento
	Autor: Equipo Desarrollo
	Fecha: 2026-06-29
	Descripcion: Una orden de mantenimiento podía tener un solo mecánico responsable
	             (FK directa IdMecanicoResponsable). Se normaliza a una tabla puente
	             1:N: la OT puede tener VARIOS personales (todos por igual). El
	             solicitante del requerimiento que genera el consumo se toma del
	             PRIMER personal por orden de carga (columna Orden). Se elimina la
	             columna IdMecanicoResponsable tras migrar los datos existentes.
*/

/* 1. Tabla puente OT <-> personal -------------------------------------- */
CREATE TABLE "inv"."T_OrdenMantenimientoPersonal"
(
	"Id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdOrdenMantenimiento" UUID         NOT NULL,
	"IdPersonal"           UUID         NOT NULL,
	"Orden"                SMALLINT     NOT NULL DEFAULT 1,
	"Estado"               BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"      VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"  VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"           BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"          UUID,
	CONSTRAINT "PK_T_OrdenMantenimientoPersonal" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_OrdenMantenimientoPersonal_Orden_Personal" UNIQUE ("IdOrdenMantenimiento","IdPersonal"),
	CONSTRAINT "FK_T_OrdenMantenimientoPersonal_Orden_IdOrdenMantenimiento"
		FOREIGN KEY ("IdOrdenMantenimiento") REFERENCES "inv"."T_OrdenMantenimiento" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_OrdenMantenimientoPersonal_Personal_IdPersonal"
		FOREIGN KEY ("IdPersonal") REFERENCES "inv"."T_Personal" ("Id")
);

COMMENT ON TABLE "inv"."T_OrdenMantenimientoPersonal" IS 'Personales asignados a una orden de mantenimiento (N:M). Todos por igual; el de menor Orden es el solicitante del requerimiento de consumo.';

CREATE INDEX "IX_T_OrdenMantenimientoPersonal_IdOrden" ON "inv"."T_OrdenMantenimientoPersonal" ("IdOrdenMantenimiento");

CREATE TRIGGER "TR_T_OrdenMantenimientoPersonal_Auditoria"
	BEFORE UPDATE ON "inv"."T_OrdenMantenimientoPersonal"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_OrdenMantenimientoPersonal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_OrdenMantenimientoPersonal"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "OrdenMantenimientoPersonalEscritura" ON "inv"."T_OrdenMantenimientoPersonal"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

/* 2. Backfill: el mecánico actual de cada orden pasa a ser el personal Orden=1 */
INSERT INTO "inv"."T_OrdenMantenimientoPersonal" ("IdOrdenMantenimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
SELECT "Id", "IdMecanicoResponsable", 1, 'ETL', 'ETL'
FROM "inv"."T_OrdenMantenimiento"
WHERE "IdMecanicoResponsable" IS NOT NULL;

/* 3. Reescribir funciones que tocaban IdMecanicoResponsable ------------- */

CREATE OR REPLACE FUNCTION "inv"."FnRegistrarOrdenMantenimiento"("POrden" jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	"vId"       UUID;
	"vUsuario"  VARCHAR(50);
	"vTrabajo"  JSONB;
	"vPersonal" TEXT;
	"vIdx"      INT := 0;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	IF JSONB_ARRAY_LENGTH(COALESCE("POrden"->'IdsPersonal','[]'::JSONB)) = 0 THEN
		RAISE EXCEPTION 'Asigna al menos un personal a la orden de mantenimiento.';
	END IF;

	INSERT INTO "inv"."T_OrdenMantenimiento"
	(
		"NumeroOrden","TipoMantenimiento","FechaOrden","Turno","Kilometraje",
		"IdVehiculo","Observaciones","Situacion","UsuarioCreacion","UsuarioModificacion"
	)
	VALUES
	(
		NULLIF("POrden"->>'NumeroOrden','')
		,"POrden"->>'TipoMantenimiento'
		,("POrden"->>'FechaOrden')::DATE
		,"POrden"->>'Turno'
		,NULLIF("POrden"->>'Kilometraje','')::NUMERIC
		,("POrden"->>'IdVehiculo')::UUID
		,NULLIF("POrden"->>'Observaciones','')
		,'abierta'
		,"vUsuario","vUsuario"
	)
	RETURNING "Id" INTO "vId";

	FOR "vPersonal" IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT("POrden"->'IdsPersonal')
	LOOP
		"vIdx" = "vIdx" + 1;
		INSERT INTO "inv"."T_OrdenMantenimientoPersonal"
			("IdOrdenMantenimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
		VALUES ("vId", "vPersonal"::UUID, "vIdx", "vUsuario","vUsuario");
	END LOOP;

	FOR "vTrabajo" IN SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE("POrden"->'Trabajos','[]'::JSONB))
	LOOP
		INSERT INTO "inv"."T_OrdenMantenimientoTrabajo"
			("IdOrdenMantenimiento","Secuencia","Descripcion","UsuarioCreacion","UsuarioModificacion")
		VALUES ("vId", ("vTrabajo"->>'Secuencia')::INT, "vTrabajo"->>'Descripcion', "vUsuario","vUsuario");
	END LOOP;

	RETURN "vId";
END;
$$;

CREATE OR REPLACE FUNCTION "inv"."FnActualizarOrdenMantenimiento"("PIdOrden" uuid, "POrden" jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"vOrden"    "inv"."T_OrdenMantenimiento";
	"vUsuario"  VARCHAR(50);
	"vTrabajo"  JSONB;
	"vPersonal" TEXT;
	"vIdx"      INT := 0;
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
	IF JSONB_ARRAY_LENGTH(COALESCE("POrden"->'IdsPersonal','[]'::JSONB)) = 0 THEN
		RAISE EXCEPTION 'Asigna al menos un personal a la orden de mantenimiento.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "NumeroOrden"         = NULLIF("POrden"->>'NumeroOrden', ''),
		"TipoMantenimiento"   = "POrden"->>'TipoMantenimiento',
		"FechaOrden"          = ("POrden"->>'FechaOrden')::DATE,
		"Turno"               = "POrden"->>'Turno',
		"Kilometraje"         = NULLIF("POrden"->>'Kilometraje', '')::NUMERIC,
		"IdVehiculo"          = ("POrden"->>'IdVehiculo')::UUID,
		"Observaciones"       = NULLIF("POrden"->>'Observaciones', ''),
		"UsuarioModificacion" = "vUsuario"
	WHERE "Id" = "PIdOrden";

	DELETE FROM "inv"."T_OrdenMantenimientoPersonal" WHERE "IdOrdenMantenimiento" = "PIdOrden";
	FOR "vPersonal" IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT("POrden"->'IdsPersonal')
	LOOP
		"vIdx" = "vIdx" + 1;
		INSERT INTO "inv"."T_OrdenMantenimientoPersonal"
			("IdOrdenMantenimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
		VALUES ("PIdOrden", "vPersonal"::UUID, "vIdx", "vUsuario","vUsuario");
	END LOOP;

	DELETE FROM "inv"."T_OrdenMantenimientoTrabajo" WHERE "IdOrdenMantenimiento" = "PIdOrden";
	FOR "vTrabajo" IN SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE("POrden"->'Trabajos', '[]'::JSONB))
	LOOP
		INSERT INTO "inv"."T_OrdenMantenimientoTrabajo"
			("IdOrdenMantenimiento","Secuencia","Descripcion","UsuarioCreacion","UsuarioModificacion")
		VALUES ("PIdOrden", ("vTrabajo"->>'Secuencia')::INT, "vTrabajo"->>'Descripcion', "vUsuario","vUsuario");
	END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "inv"."FnConsumirRepuestosOrdenMantenimiento"("PIdOrden" uuid, "PConsumo" jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'inv', 'public' AS $$
DECLARE
	"vOrden"       "inv"."T_OrdenMantenimiento";
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vUsuario"     VARCHAR(50);
	"vOrigen"      TEXT;
	"vIdReq"       UUID;
	"vSolicitante" UUID;
	"vLinea"       JSONB;
	"vIdProducto"  UUID;
	"vModo"        TEXT;
	"vCant"        NUMERIC;
	"vCosto"       NUMERIC;
	"vNombreProd"  TEXT;
	"vSalidaDet"   JSONB := '[]'::JSONB;
	"vCompraDet"   JSONB := '[]'::JSONB;
	"vIdSalida"    UUID;
	"vRef"         TEXT;
	"vRol"         TEXT;
BEGIN
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR "vRol" NOT IN ('admin','almacenero','supervision') THEN
		RAISE EXCEPTION 'No tienes permiso para consumir repuestos de mantenimiento.';
	END IF;

	"vUsuario"     = COALESCE(auth.uid()::TEXT, 'API');
	"vUbic"        = NULLIF("PConsumo"->>'IdUbicacionOrigen', '')::UUID;
	"vProveedor"   = NULLIF("PConsumo"->>'IdProveedor', '')::UUID;
	"vComprobante" = NULLIF("PConsumo"->>'Comprobante', '');

	SELECT * INTO "vOrden" FROM "inv"."T_OrdenMantenimiento"
	WHERE "Id" = "PIdOrden" AND "Estado" = TRUE FOR UPDATE;
	IF "vOrden" IS NULL THEN
		RAISE EXCEPTION 'La orden de mantenimiento no existe.';
	END IF;
	IF "vOrden"."Situacion" <> 'abierta' OR "vOrden"."IdRequerimiento" IS NOT NULL THEN
		RAISE EXCEPTION 'Solo se consumen repuestos en una orden abierta sin requerimiento (situacion actual: %).', "vOrden"."Situacion";
	END IF;

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	/* Solicitante = primer personal asignado (menor Orden). */
	SELECT "IdPersonal" INTO "vSolicitante"
	FROM "inv"."T_OrdenMantenimientoPersonal"
	WHERE "IdOrdenMantenimiento" = "PIdOrden" AND "Estado" = TRUE
	ORDER BY "Orden", "FechaCreacion"
	LIMIT 1;

	"vOrigen" = CASE WHEN "vOrden"."TipoMantenimiento" = 'correctivo'
		THEN 'desgaste_prematuro' ELSE 'planificado' END;
	"vRef" = 'OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8));

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento", "FechaRequerimiento", "Origen", "IdVehiculo",
		"IdPersonalSolicitante", "Situacion", "Notas", "UsuarioCreacion", "UsuarioModificacion"
	)
	VALUES
	(
		"vOrden"."NumeroOrden", "vOrden"."FechaOrden", "vOrigen", "vOrden"."IdVehiculo",
		"vSolicitante", 'pendiente', "vRef", "vUsuario", "vUsuario"
	)
	RETURNING "Id" INTO "vIdReq";

	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PConsumo"->'Lineas')
	LOOP
		"vIdProducto" = ("vLinea"->>'IdProducto')::UUID;
		"vModo"       = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"       = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"      = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		SELECT "Nombre" INTO "vNombreProd" FROM "inv"."T_Producto"
		WHERE "Id" = "vIdProducto" AND "Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Producto invalido o inactivo en una linea de consumo.';
		END IF;

		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad a consumir de % debe ser mayor a cero.', "vNombreProd";
		END IF;

		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento", "IdProducto", "Cantidad", "CantidadAtendida",
			"UsuarioCreacion", "UsuarioModificacion"
		)
		VALUES ("vIdReq", "vIdProducto", "vCant", "vCant", "vUsuario", "vUsuario");

		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT('IdProducto', "vIdProducto", 'Cantidad', "vCant");

		IF "vModo" = 'compra' THEN
			IF "vProveedor" IS NULL OR "vComprobante" IS NULL THEN
				RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
			END IF;
			IF "vCosto" IS NULL OR "vCosto" <= 0 THEN
				RAISE EXCEPTION 'La compra directa de % requiere un costo unitario mayor a cero.', "vNombreProd";
			END IF;
			"vCompraDet" = "vCompraDet" || JSONB_BUILD_OBJECT(
				'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'CostoUnitario', "vCosto"
			);
		END IF;
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vSalidaDet") = 0 THEN
		RAISE EXCEPTION 'No se especifico ningun repuesto a consumir.';
	END IF;

	IF JSONB_ARRAY_LENGTH("vCompraDet") > 0 THEN
		PERFORM "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
			'TipoDocumento',      'entrada',
			'FechaDocumento',     to_char(CURRENT_DATE, 'YYYY-MM-DD'),
			'IdUbicacionDestino', "vUbic",
			'IdProveedor',        "vProveedor",
			'Comprobante',        "vComprobante",
			'Referencia',         'Compra directa ' || "vRef",
			'Notas',              'Compra inmediata para mantenimiento',
			'Detalle',            "vCompraDet"
		));
	END IF;

	"vIdSalida" = "inv"."FnRegistrarDocumentoInventario"(JSONB_BUILD_OBJECT(
		'TipoDocumento',     'salida',
		'FechaDocumento',    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
		'IdUbicacionOrigen', "vUbic",
		'IdVehiculo',        "vOrden"."IdVehiculo",
		'Referencia',        "vRef",
		'Notas',             'Consumo de repuestos de mantenimiento',
		'Detalle',           "vSalidaDet"
	));

	UPDATE "inv"."T_Requerimiento"
	SET "Situacion" = 'atendido', "IdDocumentoInventario" = "vIdSalida"
	WHERE "Id" = "vIdReq";

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "IdRequerimiento" = "vIdReq", "Situacion" = 'consumida'
	WHERE "Id" = "PIdOrden";

	RETURN "vIdSalida";
END;
$$;

/* 4. FnContarDependencias: contar OTs de un personal vía el puente ------ */
CREATE OR REPLACE FUNCTION "inv"."FnContarDependencias"("PEntidad" text, "PId" uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'inv', 'public'
AS $function$
DECLARE
	"vResultado" JSONB;
	"vTotal"     NUMERIC;
BEGIN
	IF "PEntidad" = 'producto' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'movimientos', (SELECT COUNT(*) FROM "inv"."T_MovimientoStock" WHERE "IdProducto" = "PId"),
			'detalleDocumentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventarioDetalle" WHERE "IdProducto" = "PId"),
			'detalleRequerimientos', (SELECT COUNT(*) FROM "inv"."T_RequerimientoDetalle" WHERE "IdProducto" = "PId"),
			'stockDisponible', (SELECT COALESCE(SUM("CantidadDisponible"), 0) FROM "inv"."T_SaldoStock" WHERE "IdProducto" = "PId")
		);
	ELSIF "PEntidad" = 'proveedor' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdProveedor" = "PId"),
			'precios', (SELECT COUNT(*) FROM "inv"."T_ProductoPrecioHistorico" WHERE "IdProveedor" = "PId")
		);
	ELSIF "PEntidad" = 'ubicacion' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdUbicacionOrigen" = "PId" OR "IdUbicacionDestino" = "PId"),
			'movimientos', (SELECT COUNT(*) FROM "inv"."T_MovimientoStock" WHERE "IdUbicacion" = "PId"),
			'stockDisponible', (SELECT COALESCE(SUM("CantidadDisponible"), 0) FROM "inv"."T_SaldoStock" WHERE "IdUbicacion" = "PId")
		);
	ELSIF "PEntidad" = 'equipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'vehiculos', (SELECT COUNT(*) FROM "inv"."T_Vehiculo" WHERE "IdEquipo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdEquipo" = "PId")
		);
	ELSIF "PEntidad" = 'vehiculo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdVehiculo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdVehiculo" = "PId"),
			'ordenesMantenimiento', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "IdVehiculo" = "PId")
		);
	ELSIF "PEntidad" = 'tipoEquipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'equipos', (SELECT COUNT(*) FROM "inv"."T_Equipo" WHERE "IdTipoEquipo" = "PId"),
			'productosAsociados', (SELECT COUNT(*) FROM "inv"."T_ProductoTipoEquipo" WHERE "IdTipoEquipo" = "PId")
		);
	ELSIF "PEntidad" = 'categoria' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'productos', (SELECT COUNT(*) FROM "inv"."T_Producto" WHERE "IdCategoria" = "PId" AND "Estado" = TRUE),
			'subcategorias', (SELECT COUNT(*) FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'cargo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'personal', (SELECT COUNT(*) FROM "inv"."T_Personal" WHERE "IdCargo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'personal' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdPersonalSolicitante" = "PId"),
			'ordenesComoMecanico', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimientoPersonal" WHERE "IdPersonal" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'ordenMantenimiento' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'requerimiento', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "Id" = "PId" AND "IdRequerimiento" IS NOT NULL)
		);
	ELSE
		RAISE EXCEPTION 'Entidad no soportada para verificacion de dependencias: %', "PEntidad";
	END IF;

	SELECT COALESCE(SUM(value::NUMERIC), 0) INTO "vTotal"
	FROM JSONB_EACH_TEXT("vResultado");

	RETURN "vResultado"
		|| JSONB_BUILD_OBJECT('total', "vTotal")
		|| JSONB_BUILD_OBJECT('puedeEliminar', "vTotal" = 0);
END;
$function$;

/* 5. Eliminar la FK directa (ya migrada al puente) --------------------- */
ALTER TABLE "inv"."T_OrdenMantenimiento" DROP COLUMN "IdMecanicoResponsable";
