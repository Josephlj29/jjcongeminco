/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: seg.T_RolUbicacionConsumo (CREATE), seg.FnUbicacionesConsumoUsuario (CREATE),
	        inv.FnGuardarRepuestosOrdenMantenimiento (REPLACE)
	Tipo de Cambio: CREATE + REPLACE - almacen de consumo de OT restringido por rol
	Autor: Equipo Desarrollo
	Fecha: 2026-10-24
	Descripcion: El rol almacenero solo puede descontar repuestos de una OT desde el
	             almacen de Tambomayo. Hasta 0077 el editor de repuestos ofrecia todos
	             los almacenes activos a cualquier rol.

	             La regla vive en una tabla (mismo patron que T_RolModulo) y no como
	             un codigo fijo en la funcion: el codigo de Tambomayo ya difiere entre
	             el seed ('PROY-TAM') y produccion ('PROY - TAM'), y sumar un almacen
	             o un rol no deberia exigir otra migracion.
	               - T_RolUbicacionConsumo: almacenes de los que cada rol puede
	                 descontar en una OT. Un rol SIN filas no tiene restriccion.
	               - FnUbicacionesConsumoUsuario(): los almacenes permitidos del
	                 usuario autenticado, o NULL si no tiene restriccion. Lo usa el
	                 front para filtrar el selector.
	               - FnGuardarRepuestosOrdenMantenimiento: unico punto por donde el
	                 alta y la edicion guardan el almacen del borrador; rechaza (42501)
	                 un almacen no permitido. El front filtra, pero la regla la
	                 impone la base: la API se puede llamar sin pasar por el front.

	             El aprobador no pasa por aca (aprobar lee IdUbicacionConsumo ya
	             guardado), asi que admin/gerencia/supervision no cambian. Al aplicar,
	             las 60 OTs vivas ya usaban Tambomayo: ninguna queda fuera de regla.
*/

/* 1. Asignacion rol -> almacen de consumo ---------------------------------- */
CREATE TABLE IF NOT EXISTS "seg"."T_RolUbicacionConsumo"
(
	"IdRol"               UUID         NOT NULL,
	"IdUbicacion"         UUID         NOT NULL,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	CONSTRAINT "PK_T_RolUbicacionConsumo" PRIMARY KEY ("IdRol","IdUbicacion"),
	CONSTRAINT "FK_T_RolUbicacionConsumo_Rol_IdRol"
		FOREIGN KEY ("IdRol") REFERENCES "seg"."T_Rol" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_RolUbicacionConsumo_Ubicacion_IdUbicacion"
		FOREIGN KEY ("IdUbicacion") REFERENCES "inv"."T_Ubicacion" ("Id") ON DELETE CASCADE
);

COMMENT ON TABLE "seg"."T_RolUbicacionConsumo" IS 'Almacenes de los que cada rol puede descontar repuestos en una OT. Un rol sin filas no tiene restriccion.';

CREATE INDEX IF NOT EXISTS "IX_T_RolUbicacionConsumo_IdUbicacion" ON "seg"."T_RolUbicacionConsumo" ("IdUbicacion");

GRANT SELECT ON "seg"."T_RolUbicacionConsumo" TO authenticated;

ALTER TABLE "seg"."T_RolUbicacionConsumo" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LecturaAutenticado" ON "seg"."T_RolUbicacionConsumo";
CREATE POLICY "LecturaAutenticado" ON "seg"."T_RolUbicacionConsumo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

DROP POLICY IF EXISTS "RolUbicacionConsumoEscrituraAdmin" ON "seg"."T_RolUbicacionConsumo";
CREATE POLICY "RolUbicacionConsumoEscrituraAdmin" ON "seg"."T_RolUbicacionConsumo"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

/* 2. Almacenes permitidos del usuario autenticado -------------------------- */
CREATE OR REPLACE FUNCTION "seg"."FnUbicacionesConsumoUsuario"()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "seg", "public"
AS $$
	SELECT ARRAY_AGG(ru."IdUbicacion" ORDER BY ru."IdUbicacion")
	FROM "seg"."T_RolUbicacionConsumo" ru
	JOIN "seg"."T_Usuario" u ON u."IdRol" = ru."IdRol"
	WHERE u."Id" = auth.uid() AND u."Estado" = TRUE;
$$;

COMMENT ON FUNCTION "seg"."FnUbicacionesConsumoUsuario"() IS 'Almacenes de los que el usuario autenticado puede descontar repuestos en una OT, o NULL si su rol no tiene restriccion.';

GRANT EXECUTE ON FUNCTION "seg"."FnUbicacionesConsumoUsuario"() TO authenticated;

/* 3. Seed: almacenero -> Tambomayo ----------------------------------------- */
DO $$
DECLARE
	"vCantidad" INT;
BEGIN
	SELECT COUNT(*) INTO "vCantidad" FROM "inv"."T_Ubicacion"
	WHERE "Nombre" ILIKE '%tambomayo%' AND "Estado" = TRUE;
	-- Sin esta guarda, no encontrar el almacen dejaria al almacenero SIN
	-- restriccion (rol sin filas = todos), que es lo contrario de lo pedido.
	IF "vCantidad" <> 1 THEN
		RAISE EXCEPTION 'Se esperaba un unico almacen activo de Tambomayo y hay %.', "vCantidad";
	END IF;

	INSERT INTO "seg"."T_RolUbicacionConsumo" ("IdRol","IdUbicacion")
	SELECT r."Id", ub."Id"
	FROM "seg"."T_Rol" r
	CROSS JOIN "inv"."T_Ubicacion" ub
	WHERE r."Codigo" = 'almacenero'
	  AND ub."Nombre" ILIKE '%tambomayo%' AND ub."Estado" = TRUE
	ON CONFLICT ("IdRol","IdUbicacion") DO NOTHING;
END $$;

/* 4. FnGuardarRepuestosOrdenMantenimiento (base viva 0068) ----------------- */
CREATE OR REPLACE FUNCTION "inv"."FnGuardarRepuestosOrdenMantenimiento"("PIdOrden" uuid, "PConsumo" jsonb, "PUsuario" character varying)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
	"vUbic"        UUID;
	"vProveedor"   UUID;
	"vComprobante" TEXT;
	"vLinea"       JSONB;
	"vIdProducto"  UUID;
	"vModo"        TEXT;
	"vCant"        NUMERIC;
	"vCosto"       NUMERIC;
	"vNombreProd"  TEXT;
	"vLineas"      INTEGER := 0;
	"vHayCompra"   BOOLEAN := FALSE;
	"vPermitidas"  UUID[];
	"vNombres"     TEXT;
BEGIN
	DELETE FROM "inv"."T_OrdenMantenimientoRepuesto" WHERE "IdOrdenMantenimiento" = "PIdOrden";

	IF "PConsumo" IS NULL OR JSONB_TYPEOF("PConsumo") <> 'object'
	   OR JSONB_ARRAY_LENGTH(COALESCE("PConsumo"->'Lineas','[]'::JSONB)) = 0 THEN
		UPDATE "inv"."T_OrdenMantenimiento"
		SET "IdUbicacionConsumo" = NULL, "IdProveedorCompra" = NULL, "ComprobanteCompra" = NULL
		WHERE "Id" = "PIdOrden";
		RETURN 0;
	END IF;

	"vUbic"        = NULLIF("PConsumo"->>'IdUbicacionOrigen', '')::UUID;
	"vProveedor"   = NULLIF("PConsumo"->>'IdProveedor', '')::UUID;
	"vComprobante" = NULLIF("PConsumo"->>'Comprobante', '');

	IF "vUbic" IS NULL OR NOT EXISTS (
		SELECT 1 FROM "inv"."T_Ubicacion" WHERE "Id" = "vUbic" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El almacen de origen no existe o esta inactivo.';
	END IF;

	/* Almacen restringido por rol (0078). NULL = el rol no tiene restriccion. */
	"vPermitidas" = "seg"."FnUbicacionesConsumoUsuario"();
	IF "vPermitidas" IS NOT NULL AND NOT ("vUbic" = ANY ("vPermitidas")) THEN
		SELECT STRING_AGG("Nombre", ', ' ORDER BY "Nombre") INTO "vNombres"
		FROM "inv"."T_Ubicacion" WHERE "Id" = ANY ("vPermitidas");
		RAISE EXCEPTION 'Tu rol solo puede descontar repuestos de: %.', "vNombres"
			USING ERRCODE = '42501';
	END IF;

	FOR "vLinea" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("PConsumo"->'Lineas')
	LOOP
		"vIdProducto" = ("vLinea"->>'IdProducto')::UUID;
		"vModo"       = COALESCE("vLinea"->>'Modo', 'stock');
		"vCant"       = ("vLinea"->>'Cantidad')::NUMERIC;
		"vCosto"      = NULLIF("vLinea"->>'Costo', '')::NUMERIC;

		SELECT "Nombre" INTO "vNombreProd" FROM "inv"."T_Producto"
		WHERE "Id" = "vIdProducto" AND "Estado" = TRUE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Producto invalido o inactivo en una linea de repuestos.';
		END IF;
		IF "vCant" IS NULL OR "vCant" <= 0 THEN
			RAISE EXCEPTION 'La cantidad de % debe ser mayor a cero.', "vNombreProd";
		END IF;
		IF "vModo" NOT IN ('stock','compra') THEN
			RAISE EXCEPTION 'Modo de consumo invalido para %.', "vNombreProd";
		END IF;
		IF "vModo" = 'compra' THEN
			"vHayCompra" = TRUE;
			IF "vCosto" IS NULL OR "vCosto" <= 0 THEN
				RAISE EXCEPTION 'La compra directa de % requiere un costo unitario mayor a cero.', "vNombreProd";
			END IF;
		ELSE
			"vCosto" = NULL;
		END IF;

		INSERT INTO "inv"."T_OrdenMantenimientoRepuesto"
			("IdOrdenMantenimiento","IdProducto","Cantidad","Modo","CostoUnitarioCompra",
			 "UsuarioCreacion","UsuarioModificacion")
		VALUES ("PIdOrden", "vIdProducto", "vCant", "vModo", "vCosto", "PUsuario", "PUsuario");
		"vLineas" = "vLineas" + 1;
	END LOOP;

	IF "vHayCompra" AND ("vProveedor" IS NULL OR "vComprobante" IS NULL) THEN
		RAISE EXCEPTION 'La compra directa requiere proveedor y comprobante.';
	END IF;
	IF "vHayCompra" AND NOT EXISTS (
		SELECT 1 FROM "inv"."T_Proveedor" WHERE "Id" = "vProveedor" AND "Estado" = TRUE
	) THEN
		RAISE EXCEPTION 'El proveedor de la compra directa no existe o esta inactivo.';
	END IF;

	UPDATE "inv"."T_OrdenMantenimiento"
	SET "IdUbicacionConsumo" = "vUbic",
		"IdProveedorCompra"  = CASE WHEN "vHayCompra" THEN "vProveedor" ELSE NULL END,
		"ComprobanteCompra"  = CASE WHEN "vHayCompra" THEN "vComprobante" ELSE NULL END
	WHERE "Id" = "PIdOrden";

	RETURN "vLineas";
END;
$$;

COMMENT ON FUNCTION "inv"."FnGuardarRepuestosOrdenMantenimiento"(UUID, JSONB, VARCHAR) IS 'Interna: reemplaza el borrador de repuestos de una OT (T_OrdenMantenimientoRepuesto + almacen/proveedor/comprobante de la cabecera) a partir de POrden.Consumo. Sin impacto en kardex. Rechaza (42501) un almacen fuera de seg.T_RolUbicacionConsumo del rol (0078). Devuelve la cantidad de lineas.';
