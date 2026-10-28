/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_LineaEquipo (nuevo) + inv.T_TipoEquipo + inv.T_Equipo +
	        inv.T_Vehiculo + inv.T_ProductoTipoEquipo + FnContarDependencias +
	        FnEliminarConDependencias
	Tipo de Cambio: CREATE + ALTER + DATA - reestructuracion de la flota
	Autor: Equipo Desarrollo
	Fecha: 2026-10-28
	Descripcion: Primera de dos migraciones de la reestructuracion de clasificacion.
	             Resuelve los tres problemas de la flota que documenta
	             docs/reestructuracion/plan-reestructuracion-clasificacion.md:

	             1. LA LINEA VIVIA EN EL CODIGO ('LIN AMA - MOTO'). Servia para
	                leer, no para agrupar ni contar, y cada codigo la repetia a
	                mano: por eso habia dos tipos con el guion corrido
	                ('LIN - LIV CAMION CIS'). Se agrega inv.T_LineaEquipo como
	                nivel 1 real y los codigos de tipo pierden el prefijo.

	             2. TRES TIPOS PARA DOS CAMIONES. 'LIN LIV - CAMIONES' tenia las
	                dos placas EX8 y 147 productos; 'CAMION CIS' y 'CAMION GRU'
	                no tenian NINGUN equipo. Como el filtro de compatibilidad va
	                placa -> equipo -> tipo, los productos que solo estaban en
	                los tipos sin equipos no aparecian para ninguna placa (cable
	                de grua, eslingas, filtro separador, pistola de combustible).
	                Se aplica la OPCION A decidida en el Excel: grua y cisterna
	                quedan como tipos distintos, cada EX8 va al suyo, los
	                productos del chasis se asocian a AMBOS y el tipo generico
	                se da de baja. Asi "cable de grua" no se ofrece para la
	                cisterna, y nada queda invisible.

	             3. LA CADENA tipo -> equipo -> placa ERA OPCIONAL. Un equipo sin
	                tipo no filtra productos y una placa sin equipo no se puede
	                reportar. Hoy no hay huecos, asi que se endurece a NOT NULL.
	                Los dos telehandler no tenian placa: reciben su codigo
	                interno como placa para poder atribuirles consumo.

	             Los nombres 'SUPERVISION - EXPLOSIVOS' y 'TRANSPORTE DE PERSONAL'
	             describian el USO de las unidades, no el tipo de vehiculo: pasan
	             a 'Camioneta' y 'Minibus'.

	             El catalogo (familias y categorias) va en la migracion siguiente.
*/

/* =====================================================================
	1. inv.T_LineaEquipo  (nivel 1: agrupacion gruesa de la flota)
	   Mismo patron de auditoria, RLS e indice unico parcial que T_TipoEquipo.
===================================================================== */
CREATE TABLE IF NOT EXISTS "inv"."T_LineaEquipo"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"Codigo"              VARCHAR(20)  NOT NULL,
	"Nombre"              VARCHAR(120) NOT NULL,
	"Descripcion"         VARCHAR(200),
	"Orden"               SMALLINT     NOT NULL DEFAULT 0,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_LineaEquipo" PRIMARY KEY ("Id")
);

COMMENT ON TABLE "inv"."T_LineaEquipo" IS 'Linea de flota (nivel 1): agrupacion gruesa por naturaleza del equipo. Para reportes, filtros y responsables. Antes vivia dentro del codigo del tipo.';
COMMENT ON COLUMN "inv"."T_LineaEquipo"."Codigo" IS 'Codigo corto de la linea (TRACKLESS, LIVIANA).';
COMMENT ON COLUMN "inv"."T_LineaEquipo"."Nombre" IS 'Nombre de la linea.';
COMMENT ON COLUMN "inv"."T_LineaEquipo"."Descripcion" IS 'Que agrupa la linea y como se controla (horometro o kilometraje).';
COMMENT ON COLUMN "inv"."T_LineaEquipo"."Orden" IS 'Orden de presentacion en selectores y reportes.';
COMMENT ON COLUMN "inv"."T_LineaEquipo"."Estado" IS 'Estado de auditoria: activo o inactivo.';

/* La tabla nace en esta migracion, asi que indice, trigger, policies y FK se
   crean directo: no hay version previa que limpiar.
   Unicidad solo entre ACTIVOS: el soft-delete libera el codigo (patron 0054). */
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_T_LineaEquipo_Codigo"
	ON "inv"."T_LineaEquipo" ("Codigo")
	WHERE "Estado" = TRUE;
COMMENT ON INDEX "inv"."UQ_T_LineaEquipo_Codigo" IS
	'Codigo unico solo entre lineas ACTIVAS. El soft-delete libera el codigo.';

CREATE TRIGGER "TR_T_LineaEquipo_Auditoria"
	BEFORE UPDATE ON "inv"."T_LineaEquipo"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_LineaEquipo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_LineaEquipo"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "LineaEquipoEscritura" ON "inv"."T_LineaEquipo"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/* Las dos lineas que la empresa ya usa. 'AMARILLA' era el nombre informal de
   la primera: la empresa la llama TRACKLESS, el termino minero para el equipo
   sobre neumaticos. No se crea una linea pesada vacia:
   el dia que entre un volquete o un bus grande, se agrega en ese momento. */
INSERT INTO "inv"."T_LineaEquipo" ("Codigo","Nombre","Descripcion","Orden","UsuarioCreacion","UsuarioModificacion")
VALUES
	 ('TRACKLESS','Línea trackless','Maquinaria de movimiento de tierras, carga e izaje. Se controla por horómetro.',1,'Migracion 0079','Migracion 0079')
	,('LIVIANA','Línea liviana','Vehículos de rodaje: camionetas, camiones ligeros y transporte de personal. Se controlan por kilometraje.',2,'Migracion 0079','Migracion 0079')
ON CONFLICT DO NOTHING;

/* =====================================================================
	2. inv.T_TipoEquipo.IdLinea  (la linea sale del codigo y pasa a ser dato)
===================================================================== */
ALTER TABLE "inv"."T_TipoEquipo"
	ADD COLUMN IF NOT EXISTS "IdLinea" UUID;

ALTER TABLE "inv"."T_TipoEquipo"
	ADD CONSTRAINT "FK_T_TipoEquipo_LineaEquipo_IdLinea"
		FOREIGN KEY ("IdLinea") REFERENCES "inv"."T_LineaEquipo" ("Id");

COMMENT ON COLUMN "inv"."T_TipoEquipo"."IdLinea" IS 'Linea de flota a la que pertenece el tipo. Antes se leia del prefijo del codigo.';

CREATE INDEX IF NOT EXISTS "IX_T_TipoEquipo_IdLinea" ON "inv"."T_TipoEquipo" ("IdLinea");

/* Backfill por el prefijo del codigo: ANTES de renombrar, que es de donde
   sale el dato. 3 tipos dicen LIN AMA (el prefijo viejo de la linea que ahora
   se llama TRACKLESS) y 5 dicen LIN LIV (uno con el guion
   corrido, 'LIN - LIV ...'). */
UPDATE "inv"."T_TipoEquipo" T
SET "IdLinea" = L."Id", "UsuarioModificacion" = 'Migracion 0079'
FROM "inv"."T_LineaEquipo" L
WHERE L."Codigo" = 'TRACKLESS'
  AND T."IdLinea" IS NULL
  AND T."Codigo" LIKE 'LIN%AMA%';

UPDATE "inv"."T_TipoEquipo" T
SET "IdLinea" = L."Id", "UsuarioModificacion" = 'Migracion 0079'
FROM "inv"."T_LineaEquipo" L
WHERE L."Codigo" = 'LIVIANA'
  AND T."IdLinea" IS NULL
  AND T."Codigo" LIKE 'LIN%LIV%';

/* Si algun tipo no encajo en ningun prefijo, la migracion para aca: dejar un
   tipo sin linea y despues poner NOT NULL fallaria con un error ciego. */
DO $$
DECLARE
	"vHuerfanos" TEXT;
BEGIN
	SELECT STRING_AGG("Codigo", ', ' ORDER BY "Codigo") INTO "vHuerfanos"
	FROM "inv"."T_TipoEquipo" WHERE "IdLinea" IS NULL;

	IF "vHuerfanos" IS NOT NULL THEN
		RAISE EXCEPTION 'Hay tipos de equipo sin linea asignable por prefijo: %. Asignalos a mano antes de seguir.', "vHuerfanos";
	END IF;
END;
$$;

ALTER TABLE "inv"."T_TipoEquipo" ALTER COLUMN "IdLinea" SET NOT NULL;

/* =====================================================================
	3. Codigos y nombres de tipo, sin el prefijo de linea
	   El nombre pasa a describir el TIPO, no el uso de las unidades.
===================================================================== */
UPDATE "inv"."T_TipoEquipo" T
SET "Codigo" = M."nuevo"
  , "Nombre" = M."nombre"
  , "UsuarioModificacion" = 'Migracion 0079'
FROM (VALUES
	 ('LIN AMA - MINI'      ,'MINICARGADOR'   ,'Minicargador')
	,('LIN AMA - MOTO'      ,'MOTONIVELADORA' ,'Motoniveladora')
	,('LIN AMA - TELE'      ,'TELEHANDLER'    ,'Telehandler (manipulador telescópico)')
	,('LIN LIV - CAMIONETA' ,'CAMIONETA'      ,'Camioneta')
	,('LIN LIV - MINIBUS'   ,'MINIBUS'        ,'Minibús')
	,('LIN - LIV CAMION GRU','CAMION-GRUA'    ,'Camión grúa')
	,('LIN - LIV CAMION CIS','CAMION-CISTERNA','Camión cisterna')
) AS M("viejo","nuevo","nombre")
WHERE TRIM(T."Codigo") = M."viejo";

/* =====================================================================
	4. Camiones, OPCION A
	   Cada EX8 a su tipo (el nombre y la placa de cada equipo no dejan duda:
	   CAMION1 = 'EX8 - CAMION GRUA' / VDS927, CAMION2 = 'EX8 - CAMION CISTERNA'
	   / VCZ891), los productos del chasis a los DOS, y el tipo generico de baja.
===================================================================== */
UPDATE "inv"."T_Equipo" E
SET "IdTipoEquipo" = T."Id", "UsuarioModificacion" = 'Migracion 0079'
FROM "inv"."T_TipoEquipo" T
WHERE T."Codigo" = 'CAMION-GRUA' AND TRIM(E."Codigo") = 'LIN LIV - CAMION1';

UPDATE "inv"."T_Equipo" E
SET "IdTipoEquipo" = T."Id", "UsuarioModificacion" = 'Migracion 0079'
FROM "inv"."T_TipoEquipo" T
WHERE T."Codigo" = 'CAMION-CISTERNA' AND TRIM(E."Codigo") = 'LIN LIV - CAMION2';

/* Los 147 productos del chasis pasan a ser compatibles con grua Y cisterna.
   Las filas que ya existian en el tipo destino quedan como estan. */
INSERT INTO "inv"."T_ProductoTipoEquipo" ("IdProducto","IdTipoEquipo","UsuarioCreacion","UsuarioModificacion")
SELECT PTE."IdProducto", TDest."Id", 'Migracion 0079', 'Migracion 0079'
FROM "inv"."T_ProductoTipoEquipo" PTE
JOIN "inv"."T_TipoEquipo" TOrig ON TOrig."Id" = PTE."IdTipoEquipo"
CROSS JOIN "inv"."T_TipoEquipo" TDest
WHERE TOrig."Codigo" = 'LIN LIV - CAMIONES'
  AND PTE."Estado"
  AND TDest."Codigo" IN ('CAMION-GRUA','CAMION-CISTERNA')
ON CONFLICT ("IdProducto","IdTipoEquipo") DO NOTHING;

/* Las compatibilidades del tipo generico se dan de baja junto con el tipo: una
   compatibilidad activa contra un tipo de baja es exactamente el estado que
   escondia productos de todas las placas. */
UPDATE "inv"."T_ProductoTipoEquipo" PTE
SET "Estado" = FALSE, "UsuarioModificacion" = 'Migracion 0079'
FROM "inv"."T_TipoEquipo" T
WHERE T."Id" = PTE."IdTipoEquipo" AND T."Codigo" = 'LIN LIV - CAMIONES' AND PTE."Estado";

/* El tipo generico se conserva de baja, no se borra: los movimientos viejos y
   el Excel de la reestructuracion lo nombran. */
UPDATE "inv"."T_TipoEquipo"
SET "Estado" = FALSE, "UsuarioModificacion" = 'Migracion 0079'
WHERE "Codigo" = 'LIN LIV - CAMIONES';

/* =====================================================================
	5. Equipos: codigo sin prefijo, numero a dos digitos, sin espacios
===================================================================== */
UPDATE "inv"."T_Equipo" E
SET "Codigo" = M."nuevo"
  , "Nombre" = TRIM(E."Nombre")
  , "UsuarioModificacion" = 'Migracion 0079'
FROM (VALUES
	 ('LIN AMA - MINI1'     ,'MINI-01')
	,('LIN AMA - MOTO1'     ,'MOTO-01')
	,('LIN AMA - TELE1'     ,'TELE-01')
	,('LIN AMA - TELE2'     ,'TELE-02')
	,('LIN LIV - CAMION1'   ,'CAMION-01')
	,('LIN LIV - CAMION2'   ,'CAMION-02')
	,('LIN LIV - CAMIONETA1','CAMIONETA-01')
	,('LIN LIV - CAMIONETA2','CAMIONETA-02')
	,('LIN LIV - MINIBUS1'  ,'MINIBUS-01')
	,('LIN LIV - MINIBUS2'  ,'MINIBUS-02')
) AS M("viejo","nuevo")
WHERE TRIM(E."Codigo") = M."viejo";

/* =====================================================================
	6. La cadena tipo -> equipo -> placa pasa a ser obligatoria
===================================================================== */

/* Los dos telehandler no tienen placa de rodaje. Sin placa no se les puede
   atribuir consumo, asi que se registra su codigo interno como placa. */
INSERT INTO "inv"."T_Vehiculo" ("Placa","Modelo","IdEquipo","UsuarioCreacion","UsuarioModificacion")
SELECT E."Codigo", TRIM(E."Nombre"), E."Id", 'Migracion 0079', 'Migracion 0079'
FROM "inv"."T_Equipo" E
WHERE E."Estado"
  AND E."Codigo" IN ('TELE-01','TELE-02')
  AND NOT EXISTS (
		SELECT 1 FROM "inv"."T_Vehiculo" V WHERE V."IdEquipo" = E."Id" AND V."Estado"
	);

DO $$
DECLARE
	"vEquipos"   INTEGER;
	"vVehiculos" INTEGER;
BEGIN
	SELECT COUNT(*) INTO "vEquipos"   FROM "inv"."T_Equipo"   WHERE "IdTipoEquipo" IS NULL;
	SELECT COUNT(*) INTO "vVehiculos" FROM "inv"."T_Vehiculo" WHERE "IdEquipo" IS NULL;

	IF "vEquipos" > 0 OR "vVehiculos" > 0 THEN
		RAISE EXCEPTION 'No se puede endurecer la cadena: % equipos sin tipo y % placas sin equipo. Completalos antes de seguir.', "vEquipos", "vVehiculos";
	END IF;
END;
$$;

ALTER TABLE "inv"."T_Equipo"   ALTER COLUMN "IdTipoEquipo" SET NOT NULL;
ALTER TABLE "inv"."T_Vehiculo" ALTER COLUMN "IdEquipo"     SET NOT NULL;

COMMENT ON COLUMN "inv"."T_Equipo"."IdTipoEquipo" IS 'Tipo al que pertenece el equipo. Obligatorio desde 0079: sin tipo el equipo no filtra productos compatibles.';
COMMENT ON COLUMN "inv"."T_Vehiculo"."IdEquipo" IS 'Equipo al que pertenece la placa. Obligatorio desde 0079: sin equipo no se puede atribuir el consumo ni derivar el tipo.';

/* =====================================================================
	7. FnContarDependencias: rama 'lineaEquipo'
	   Se repite el cuerpo completo porque es CREATE OR REPLACE.
===================================================================== */
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
	ELSIF "PEntidad" = 'lineaEquipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'tipos', (SELECT COUNT(*) FROM "inv"."T_TipoEquipo" WHERE "IdLinea" = "PId" AND "Estado" = TRUE)
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
$$;

COMMENT ON FUNCTION "inv"."FnContarDependencias"(TEXT, UUID) IS 'Cuenta datos enlazados de una entidad. puedeEliminar=true solo si total=0.';

/* =====================================================================
	8. FnEliminarConDependencias: rama 'lineaEquipo'
===================================================================== */
CREATE OR REPLACE FUNCTION "inv"."FnEliminarConDependencias"
(
	"PEntidad" TEXT
	,"PId"     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vRol"       TEXT;
	"vTabla"     TEXT;
	"vPermitido" TEXT[];
	"vDeps"      JSONB;
	"vExiste"    BOOLEAN;
BEGIN
	CASE "PEntidad"
		WHEN 'cargo'       THEN "vTabla" = 'T_Cargo';       "vPermitido" = ARRAY['admin'];
		WHEN 'categoria'   THEN "vTabla" = 'T_Categoria';   "vPermitido" = ARRAY['admin'];
		WHEN 'ubicacion'   THEN "vTabla" = 'T_Ubicacion';   "vPermitido" = ARRAY['admin'];
		WHEN 'personal'    THEN "vTabla" = 'T_Personal';    "vPermitido" = ARRAY['admin'];
		WHEN 'equipo'      THEN "vTabla" = 'T_Equipo';      "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'vehiculo'    THEN "vTabla" = 'T_Vehiculo';    "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'tipoEquipo'  THEN "vTabla" = 'T_TipoEquipo';  "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'lineaEquipo' THEN "vTabla" = 'T_LineaEquipo'; "vPermitido" = ARRAY['admin'];
		WHEN 'proveedor'   THEN "vTabla" = 'T_Proveedor';   "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'producto'    THEN "vTabla" = 'T_Producto';    "vPermitido" = ARRAY['admin','almacenero'];
		ELSE
			RAISE EXCEPTION 'Entidad no soportada para eliminacion: %', "PEntidad";
	END CASE;

	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR NOT ("vRol" = ANY ("vPermitido")) THEN
		RAISE EXCEPTION 'No tienes permiso para eliminar este registro.'
			USING ERRCODE = '42501';
	END IF;

	EXECUTE FORMAT(
		'SELECT TRUE FROM "inv".%I WHERE "Id" = $1 AND "Estado" = TRUE FOR UPDATE',
		"vTabla"
	) INTO "vExiste" USING "PId";

	IF "vExiste" IS NULL THEN
		RAISE EXCEPTION 'El registro no existe o ya fue eliminado.';
	END IF;

	"vDeps" = "inv"."FnContarDependencias"("PEntidad", "PId");

	IF ("vDeps"->>'puedeEliminar')::BOOLEAN = FALSE THEN
		RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'dependencias', "vDeps");
	END IF;

	EXECUTE FORMAT('UPDATE "inv".%I SET "Estado" = FALSE WHERE "Id" = $1', "vTabla")
		USING "PId";

	RETURN JSONB_BUILD_OBJECT('ok', TRUE);
END;
$$;

COMMENT ON FUNCTION "inv"."FnEliminarConDependencias"(TEXT, UUID) IS 'Baja logica con verificacion de dependencias y permiso por rol. Devuelve ok=false con el detalle si hay datos enlazados.';
