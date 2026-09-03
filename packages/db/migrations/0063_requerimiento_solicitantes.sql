/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_RequerimientoPersonal (CREATE) + 3 funciones (REPLACE) + DROP columna
	Tipo de Cambio: FK directa -> tabla puente N:M (multi-solicitante)
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Descripcion: El solicitante del requerimiento pasa de 0..1 (columna
	             T_Requerimiento.IdPersonalSolicitante) a N solicitantes via la
	             tabla puente inv.T_RequerimientoPersonal — mismo patron que 0047
	             aplico al mecanico de las OTs (T_OrdenMantenimientoPersonal).
	             Cambios encadenados:
	               1. Tabla puente + backfill desde la columna actual.
	               2. FnRegistrarRequerimiento: lee 'IdsPersonalSolicitante' (array)
	                  e inserta en la puente con Orden incremental.
	               3. FnConsumirRepuestosOrdenMantenimiento: el requerimiento que
	                  genera una OT hereda TODOS los personales de la OT como
	                  solicitantes (antes solo el primero, LIMIT 1).
	               4. FnContarDependencias rama 'personal': cuenta la puente.
	               5. DROP de la columna en ESTA misma migracion: con la puente
	                  creada habria dos rutas de relacion T_Requerimiento->T_Personal
	                  y los embeds de PostgREST se vuelven ambiguos.
*/

/* ===== 1. Tabla puente ===== */
CREATE TABLE "inv"."T_RequerimientoPersonal"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdRequerimiento"     UUID         NOT NULL,
	"IdPersonal"          UUID         NOT NULL,
	"Orden"               SMALLINT     NOT NULL DEFAULT 1,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_RequerimientoPersonal" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_RequerimientoPersonal_Requerimiento_Personal" UNIQUE ("IdRequerimiento","IdPersonal"),
	CONSTRAINT "FK_T_RequerimientoPersonal_Requerimiento_IdRequerimiento"
		FOREIGN KEY ("IdRequerimiento") REFERENCES "inv"."T_Requerimiento" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_RequerimientoPersonal_Personal_IdPersonal"
		FOREIGN KEY ("IdPersonal") REFERENCES "inv"."T_Personal" ("Id")
);

COMMENT ON TABLE "inv"."T_RequerimientoPersonal" IS 'Solicitantes de un requerimiento (N:M). Todos por igual; Orden conserva el orden de seleccion.';

CREATE INDEX "IX_T_RequerimientoPersonal_IdRequerimiento" ON "inv"."T_RequerimientoPersonal" ("IdRequerimiento");
CREATE INDEX "IX_T_RequerimientoPersonal_IdPersonal" ON "inv"."T_RequerimientoPersonal" ("IdPersonal");

CREATE TRIGGER "TR_T_RequerimientoPersonal_Auditoria"
	BEFORE UPDATE ON "inv"."T_RequerimientoPersonal"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_RequerimientoPersonal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_RequerimientoPersonal"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "RequerimientoPersonalEscritura" ON "inv"."T_RequerimientoPersonal"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

/* ===== 2. Backfill desde la columna actual ===== */
INSERT INTO "inv"."T_RequerimientoPersonal"
	("IdRequerimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
SELECT "Id", "IdPersonalSolicitante", 1, 'ETL', 'ETL'
FROM "inv"."T_Requerimiento"
WHERE "IdPersonalSolicitante" IS NOT NULL;

/* ===== 3. FnRegistrarRequerimiento (base viva 0062 + puente) ===== */
CREATE OR REPLACE FUNCTION "inv"."FnRegistrarRequerimiento"("PRequerimiento" jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	"vId"          UUID;
	"vUsuario"     VARCHAR(50);
	"vDetalle"     JSONB;
	"vIdProducto"  UUID;
	"vDescripcion" TEXT;
	"vPersonal"    TEXT;
	"vIdx"         INT := 0;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento","FechaRequerimiento","Origen","IdEquipo","IdVehiculo",
		"Notas","Situacion","UsuarioCreacion","UsuarioModificacion"
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
		,"vUsuario","vUsuario"
	)
	RETURNING "Id" INTO "vId";

	/* Solicitantes (0..N), en el orden en que se seleccionaron. */
	FOR "vPersonal" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE("PRequerimiento"->'IdsPersonalSolicitante','[]'::JSONB))
	LOOP
		"vIdx" = "vIdx" + 1;
		INSERT INTO "inv"."T_RequerimientoPersonal"
			("IdRequerimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
		VALUES ("vId", "vPersonal"::UUID, "vIdx", "vUsuario","vUsuario");
	END LOOP;

	FOR "vDetalle" IN
		SELECT * FROM JSONB_ARRAY_ELEMENTS("PRequerimiento"->'Detalle')
	LOOP
		"vIdProducto"  = NULLIF("vDetalle"->>'IdProducto', '')::UUID;
		"vDescripcion" = NULLIF(TRIM("vDetalle"->>'DescripcionLibre'), '');

		IF "vIdProducto" IS NULL AND "vDescripcion" IS NULL THEN
			RAISE EXCEPTION 'Cada linea debe tener un producto del catalogo o la descripcion del producto nuevo.';
		END IF;
		IF "vIdProducto" IS NOT NULL AND "vDescripcion" IS NOT NULL THEN
			RAISE EXCEPTION 'Una linea no puede tener producto del catalogo y descripcion libre a la vez.';
		END IF;

		INSERT INTO "inv"."T_RequerimientoDetalle"
		(
			"IdRequerimiento","IdProducto","Cantidad","IdVehiculo","Notas",
			"DescripcionLibre","UrlFotoLibre",
			"UsuarioCreacion","UsuarioModificacion"
		)
		VALUES
		(
			"vId"
			,"vIdProducto"
			,("vDetalle"->>'Cantidad')::NUMERIC
			,COALESCE(
				NULLIF("vDetalle"->>'IdVehiculo', ''),
				NULLIF("PRequerimiento"->>'IdVehiculo', '')
			)::UUID
			,NULLIF("vDetalle"->>'Notas', '')
			,"vDescripcion"
			,CASE WHEN "vDescripcion" IS NOT NULL
				THEN NULLIF("vDetalle"->>'UrlFotoLibre', '') END
			,"vUsuario","vUsuario"
		);
	END LOOP;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnRegistrarRequerimiento"(JSONB) IS 'Alta de requerimiento con detalle (producto de catalogo o descripcion libre) y solicitantes multiples (IdsPersonalSolicitante -> T_RequerimientoPersonal, Orden incremental). Placa por linea con fallback a cabecera.';

/* ===== 4. FnConsumirRepuestosOrdenMantenimiento (base viva 0053):
        el requerimiento hereda TODOS los personales de la OT ===== */
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

	"vOrigen" = CASE WHEN "vOrden"."TipoMantenimiento" = 'correctivo'
		THEN 'desgaste_prematuro' ELSE 'planificado' END;
	"vRef" = 'OT ' || COALESCE("vOrden"."NumeroOrden", LEFT("PIdOrden"::TEXT, 8));

	INSERT INTO "inv"."T_Requerimiento"
	(
		"NumeroRequerimiento", "FechaRequerimiento", "Origen", "IdVehiculo",
		"Situacion", "Notas", "UsuarioCreacion", "UsuarioModificacion"
	)
	VALUES
	(
		"vOrden"."NumeroOrden", "vOrden"."FechaOrden", "vOrigen", "vOrden"."IdVehiculo",
		'pendiente', "vRef", "vUsuario", "vUsuario"
	)
	RETURNING "Id" INTO "vIdReq";

	/* Solicitantes = TODOS los personales de la OT (antes solo el primero). */
	INSERT INTO "inv"."T_RequerimientoPersonal"
		("IdRequerimiento","IdPersonal","Orden","UsuarioCreacion","UsuarioModificacion")
	SELECT "vIdReq", "IdPersonal", "Orden", "vUsuario", "vUsuario"
	FROM "inv"."T_OrdenMantenimientoPersonal"
	WHERE "IdOrdenMantenimiento" = "PIdOrden" AND "Estado" = TRUE;

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
			"IdRequerimiento", "IdProducto", "Cantidad", "CantidadAtendida", "IdVehiculo",
			"UsuarioCreacion", "UsuarioModificacion"
		)
		VALUES ("vIdReq", "vIdProducto", "vCant", "vCant", "vOrden"."IdVehiculo", "vUsuario", "vUsuario");

		"vSalidaDet" = "vSalidaDet" || JSONB_BUILD_OBJECT(
			'IdProducto', "vIdProducto", 'Cantidad', "vCant", 'IdVehiculo', "vOrden"."IdVehiculo"
		);

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

COMMENT ON FUNCTION "inv"."FnConsumirRepuestosOrdenMantenimiento"(UUID, JSONB) IS 'Consumo provisional de repuestos de una OT: crea requerimiento atendido + salida que descuenta stock (Model 2, el admin ratifica al reconciliar). El requerimiento hereda TODOS los personales de la OT como solicitantes (T_RequerimientoPersonal) y la placa de la OT por linea. SECURITY DEFINER con revalidacion de rol.';

/* ===== 5. FnContarDependencias: rama personal cuenta la puente ===== */
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
			'vehiculos', (SELECT COUNT(*) FROM "inv"."T_Vehiculo" WHERE "IdEquipo" = "PId" AND "Estado" = TRUE),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdEquipo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'vehiculo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdVehiculo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdVehiculo" = "PId" AND "Estado" = TRUE),
			'ordenesMantenimiento', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "IdVehiculo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'tipoEquipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'equipos', (SELECT COUNT(*) FROM "inv"."T_Equipo" WHERE "IdTipoEquipo" = "PId" AND "Estado" = TRUE),
			'productosAsociados', (
				SELECT COUNT(*) FROM "inv"."T_ProductoTipoEquipo" pte
				JOIN "inv"."T_Producto" p ON p."Id" = pte."IdProducto" AND p."Estado" = TRUE
				WHERE pte."IdTipoEquipo" = "PId" AND pte."Estado" = TRUE
			)
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
			'requerimientos', (
				SELECT COUNT(*) FROM "inv"."T_RequerimientoPersonal" rp
				JOIN "inv"."T_Requerimiento" r ON r."Id" = rp."IdRequerimiento" AND r."Estado" = TRUE
				WHERE rp."IdPersonal" = "PId" AND rp."Estado" = TRUE
			),
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

/* ===== 6. Drop de la columna vieja (misma migracion: evita el embed
        ambiguo de PostgREST con dos rutas T_Requerimiento->T_Personal) ===== */
ALTER TABLE "inv"."T_Requerimiento" DROP CONSTRAINT IF EXISTS "FK_T_Requerimiento_Personal_IdPersonalSolicitante";
DROP INDEX IF EXISTS "inv"."IX_T_Requerimiento_IdPersonalSolicitante";
ALTER TABLE "inv"."T_Requerimiento" DROP COLUMN "IdPersonalSolicitante";
