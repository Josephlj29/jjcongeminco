/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Cargo + inv.T_Personal + T_Requerimiento.IdPersonalSolicitante
	Tipo de Cambio: CREATE + ALTER + REPLACE - maestro de personal y solicitante
	Autor: Equipo Desarrollo
	Fecha: 2026-06-15
	Descripcion: Personal (gente que solicita materiales) separado del usuario de
	             acceso. Cada personal tiene un CARGO (catálogo) y, opcionalmente, un
	             USUARIO de login (seg.T_Usuario) — el rol de acceso sale del usuario,
	             no se duplica en el personal. El requerimiento referencia al
	             SOLICITANTE por FK (distinto de UsuarioCreacion = quien lo cargó).
*/

/* ===== T_Cargo (catálogo) ===== */
CREATE TABLE "inv"."T_Cargo"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Codigo"              VARCHAR(20)  NOT NULL,
	"Nombre"              VARCHAR(80)  NOT NULL,
	"Descripcion"         VARCHAR(200),
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Cargo" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_Cargo_Codigo" UNIQUE ("Codigo")
);
COMMENT ON TABLE "inv"."T_Cargo" IS 'Catálogo de cargos del personal (mecánico, operador, jefe de taller...).';

CREATE TRIGGER "TR_T_Cargo_Auditoria"
	BEFORE UPDATE ON "inv"."T_Cargo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_Cargo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Cargo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "CargoEscrituraAdmin" ON "inv"."T_Cargo"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

/* ===== T_Personal (maestro) ===== */
CREATE TABLE "inv"."T_Personal"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"NombreCompleto"      VARCHAR(150) NOT NULL,
	"Dni"                 VARCHAR(15),
	"Telefono"            VARCHAR(20),
	"IdCargo"             UUID         NOT NULL,
	"IdUsuario"           UUID,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Personal" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_Personal_Cargo_IdCargo"
		FOREIGN KEY ("IdCargo") REFERENCES "inv"."T_Cargo" ("Id"),
	CONSTRAINT "FK_T_Personal_Usuario_IdUsuario"
		FOREIGN KEY ("IdUsuario") REFERENCES "seg"."T_Usuario" ("Id"),
	CONSTRAINT "UQ_T_Personal_IdUsuario" UNIQUE ("IdUsuario")
);
COMMENT ON TABLE "inv"."T_Personal" IS 'Personal de la obra (solicitantes). Cargo por FK; usuario de login opcional (el rol de acceso vive en el usuario, no acá).';
COMMENT ON COLUMN "inv"."T_Personal"."IdUsuario" IS 'Usuario de acceso vinculado (opcional). El personal sin usuario solo puede ser solicitante.';

CREATE INDEX "IX_T_Personal_IdCargo" ON "inv"."T_Personal" ("IdCargo");

CREATE TRIGGER "TR_T_Personal_Auditoria"
	BEFORE UPDATE ON "inv"."T_Personal"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_Personal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Personal"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "PersonalEscrituraAdmin" ON "inv"."T_Personal"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

/* ===== Requerimiento: solicitante (FK) ===== */
ALTER TABLE "inv"."T_Requerimiento"
	ADD COLUMN IF NOT EXISTS "IdPersonalSolicitante" UUID;
ALTER TABLE "inv"."T_Requerimiento"
	ADD CONSTRAINT "FK_T_Requerimiento_Personal_IdPersonalSolicitante"
		FOREIGN KEY ("IdPersonalSolicitante") REFERENCES "inv"."T_Personal" ("Id");
COMMENT ON COLUMN "inv"."T_Requerimiento"."IdPersonalSolicitante" IS 'Persona que solicita (FK a T_Personal). Distinto de UsuarioCreacion (quien lo cargó).';
CREATE INDEX "IX_T_Requerimiento_IdPersonalSolicitante" ON "inv"."T_Requerimiento" ("IdPersonalSolicitante");

/* ===== FnRegistrarRequerimiento: incluir solicitante ===== */
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
		,"IdPersonalSolicitante"
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
		,NULLIF("PRequerimiento"->>'IdPersonalSolicitante', '')::UUID
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

COMMENT ON FUNCTION "inv"."FnRegistrarRequerimiento"(JSONB) IS 'Crea un requerimiento con su detalle (incluye solicitante) desde JSON en una transaccion.';

/* ===== FnContarDependencias: ramas 'cargo' y 'personal' ===== */
CREATE OR REPLACE FUNCTION "inv"."FnContarDependencias"
(
	"PEntidad" TEXT
	,"PId"     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
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
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdVehiculo" = "PId")
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
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdPersonalSolicitante" = "PId")
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
$$;

COMMENT ON FUNCTION "inv"."FnContarDependencias"(TEXT, UUID) IS 'Cuenta datos enlazados de una entidad (incluye categoria, cargo, personal). puedeEliminar=true solo si total=0.';
