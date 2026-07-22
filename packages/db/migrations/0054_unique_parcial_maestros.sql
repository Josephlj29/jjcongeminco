/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: T_Equipo, T_TipoEquipo, T_Cargo, T_Categoria, T_Ubicacion,
	        T_Producto, T_Proveedor, T_Vehiculo — indices unicos parciales
	Tipo de Cambio: DROP CONSTRAINT + CREATE UNIQUE INDEX (parcial) x 8
	Autor: Equipo Desarrollo
	Fecha: 2026-07-22
	Descripcion: Las constraints UNIQUE planas sobre el codigo/clave de negocio
	             retenian el valor aun con el registro dado de baja (Estado=false),
	             impidiendo recrear con el mismo codigo tras un soft-delete
	             (duplicate key value violates unique constraint). Se reemplazan
	             por indices unicos parciales: la unicidad solo aplica a registros
	             ACTIVOS. Mismo patron que 0031 (T_Personal.IdUsuario).

	Ademas: FnImportarProductos resolvia el Sku existente sin filtrar por Estado,
	        por lo que un producto dado de baja bloqueaba (modo 'crear') o
	        resucitaba sin querer (modo 'upsert') en vez de permitir crear uno
	        nuevo con el mismo Sku. Se agrega el filtro "Estado" = TRUE al lookup.
*/

/* ===== inv.T_Equipo ===== */
ALTER TABLE "inv"."T_Equipo" DROP CONSTRAINT IF EXISTS "UQ_T_Equipo_Codigo";
CREATE UNIQUE INDEX "UQ_T_Equipo_Codigo"
	ON "inv"."T_Equipo" ("Codigo")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_Equipo_Codigo" IS
	'Codigo unico solo entre equipos ACTIVOS. El soft-delete libera el codigo.';

/* ===== inv.T_TipoEquipo ===== */
ALTER TABLE "inv"."T_TipoEquipo" DROP CONSTRAINT IF EXISTS "UQ_T_TipoEquipo_Codigo";
CREATE UNIQUE INDEX "UQ_T_TipoEquipo_Codigo"
	ON "inv"."T_TipoEquipo" ("Codigo")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_TipoEquipo_Codigo" IS
	'Codigo unico solo entre tipos de equipo ACTIVOS. El soft-delete libera el codigo.';

/* ===== inv.T_Cargo ===== */
ALTER TABLE "inv"."T_Cargo" DROP CONSTRAINT IF EXISTS "UQ_T_Cargo_Codigo";
CREATE UNIQUE INDEX "UQ_T_Cargo_Codigo"
	ON "inv"."T_Cargo" ("Codigo")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_Cargo_Codigo" IS
	'Codigo unico solo entre cargos ACTIVOS. El soft-delete libera el codigo.';

/* ===== inv.T_Categoria ===== */
ALTER TABLE "inv"."T_Categoria" DROP CONSTRAINT IF EXISTS "UQ_T_Categoria_Codigo";
CREATE UNIQUE INDEX "UQ_T_Categoria_Codigo"
	ON "inv"."T_Categoria" ("Codigo")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_Categoria_Codigo" IS
	'Codigo unico solo entre categorias ACTIVAS. El soft-delete libera el codigo.';

/* ===== inv.T_Ubicacion ===== */
ALTER TABLE "inv"."T_Ubicacion" DROP CONSTRAINT IF EXISTS "UQ_T_Ubicacion_Codigo";
CREATE UNIQUE INDEX "UQ_T_Ubicacion_Codigo"
	ON "inv"."T_Ubicacion" ("Codigo")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_Ubicacion_Codigo" IS
	'Codigo unico solo entre ubicaciones ACTIVAS. El soft-delete libera el codigo.';

/* ===== inv.T_Producto ===== */
ALTER TABLE "inv"."T_Producto" DROP CONSTRAINT IF EXISTS "UQ_T_Producto_Sku";
CREATE UNIQUE INDEX "UQ_T_Producto_Sku"
	ON "inv"."T_Producto" ("Sku")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_Producto_Sku" IS
	'Sku unico (case-insensitive, CITEXT) solo entre productos ACTIVOS. El soft-delete libera el Sku.';

/* ===== inv.T_Proveedor ===== */
ALTER TABLE "inv"."T_Proveedor" DROP CONSTRAINT IF EXISTS "UQ_T_Proveedor_Ruc";
CREATE UNIQUE INDEX "UQ_T_Proveedor_Ruc"
	ON "inv"."T_Proveedor" ("Ruc")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_Proveedor_Ruc" IS
	'Ruc unico solo entre proveedores ACTIVOS. El soft-delete libera el Ruc.';

/* ===== inv.T_Vehiculo ===== */
ALTER TABLE "inv"."T_Vehiculo" DROP CONSTRAINT IF EXISTS "UQ_T_Vehiculo_Placa";
CREATE UNIQUE INDEX "UQ_T_Vehiculo_Placa"
	ON "inv"."T_Vehiculo" ("Placa")
	WHERE "Estado" = true;
COMMENT ON INDEX "inv"."UQ_T_Vehiculo_Placa" IS
	'Placa unica solo entre vehiculos ACTIVOS. El soft-delete libera la placa.';

/* ===== FnImportarProductos: lookup de Sku debe ignorar productos dados de baja =====
   Copia identica del cuerpo vigente (0040), con un unico cambio: el SELECT de
   vIdProducto ahora filtra "Estado" = TRUE, para no bloquear (modo crear) ni
   resucitar sin querer (modo upsert) un producto que fue soft-deleted. */
CREATE OR REPLACE FUNCTION "inv"."FnImportarProductos"
(
	"PLote" JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
	"vModo"        TEXT;
	"vUsuario"     VARCHAR(50);
	"vNombreArch"  TEXT;
	"vFilas"       JSONB;
	"vFila"        JSONB;
	"vErrores"     JSONB := '[]'::JSONB;
	"vOps"         JSONB := '[]'::JSONB;   -- operaciones resueltas (2da pasada)
	"vSkusVistos"  TEXT[] := ARRAY[]::TEXT[];

	"vNumFila"     INT;
	"vSku"         TEXT;
	"vNombre"      TEXT;
	"vCodCat"      TEXT;
	"vCodUni"      TEXT;
	"vEsGeneral"   BOOLEAN;
	"vTipos"       JSONB;
	"vCantTipos"   INT;
	"vStockMin"    NUMERIC;

	"vIdCategoria" UUID;
	"vIdUnidad"    UUID;
	"vIdProducto"  UUID;
	"vIdsTipos"    UUID[];
	"vCodTipo"     TEXT;
	"vIdTipo"      UUID;
	"vCodsFaltan"  TEXT[];

	"vCreados"     INT := 0;
	"vActualiza"   INT := 0;
	"vErrorFila"   BOOLEAN;
BEGIN
	"vUsuario"    = COALESCE(auth.uid()::TEXT, 'API');
	"vNombreArch" = COALESCE(NULLIF(TRIM("PLote"->>'NombreArchivo'), ''), 'importacion-productos.xlsx');
	"vModo"       = LOWER(COALESCE("PLote"->>'Modo', 'crear'));
	IF "vModo" NOT IN ('crear', 'upsert') THEN
		RAISE EXCEPTION 'Modo invalido: % (use crear o upsert).', "vModo";
	END IF;

	"vFilas" = COALESCE("PLote"->'Filas', '[]'::JSONB);

	/* ============================================================
		PASADA 1 — Validacion pura (no escribe). Resuelve a vOps.
	============================================================ */
	FOR "vFila" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("vFilas")
	LOOP
		"vErrorFila" = FALSE;
		"vNumFila"   = COALESCE(NULLIF("vFila"->>'Fila','')::INT, 0);
		"vSku"       = NULLIF(TRIM("vFila"->>'Sku'), '');
		"vNombre"    = NULLIF(TRIM("vFila"->>'Nombre'), '');
		"vCodCat"    = NULLIF(TRIM("vFila"->>'CodigoCategoria'), '');
		"vCodUni"    = NULLIF(TRIM("vFila"->>'CodigoUnidad'), '');
		"vEsGeneral" = COALESCE(("vFila"->>'EsGeneral')::BOOLEAN, FALSE);
		"vTipos"     = COALESCE("vFila"->'TiposEquipo', '[]'::JSONB);
		"vCantTipos" = JSONB_ARRAY_LENGTH("vTipos");
		"vIdCategoria" = NULL;
		"vIdUnidad"    = NULL;
		"vIdProducto"  = NULL;
		"vIdsTipos"    = ARRAY[]::UUID[];

		/* --- Campos requeridos --- */
		IF "vSku" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','CAMPO_REQUERIDO','error','El Sku es obligatorio.');
			"vErrorFila" = TRUE;
		END IF;
		IF "vNombre" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Nombre','codigo','CAMPO_REQUERIDO','error','El Nombre es obligatorio.');
			"vErrorFila" = TRUE;
		END IF;

		/* --- StockMinimo numerico >= 0 --- */
		BEGIN
			"vStockMin" = COALESCE(NULLIF("vFila"->>'StockMinimo','')::NUMERIC, 0);
			IF "vStockMin" < 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','StockMinimo','codigo','CAMPO_INVALIDO','error','StockMinimo no puede ser negativo.');
				"vErrorFila" = TRUE;
			END IF;
		EXCEPTION WHEN others THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','StockMinimo','codigo','CAMPO_INVALIDO','error','StockMinimo debe ser numerico.');
			"vErrorFila" = TRUE;
			"vStockMin" = 0;
		END;

		/* --- Resolver categoria --- */
		IF "vCodCat" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoCategoria','codigo','CAMPO_REQUERIDO','error','El CodigoCategoria es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdCategoria" FROM "inv"."T_Categoria" WHERE "Codigo" = "vCodCat" AND "Estado" = TRUE;
			IF "vIdCategoria" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoCategoria','codigo','CATEGORIA_NO_EXISTE','error',FORMAT('La categoria "%s" no existe.', "vCodCat"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		/* --- Resolver unidad --- */
		IF "vCodUni" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUnidad','codigo','CAMPO_REQUERIDO','error','El CodigoUnidad es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdUnidad" FROM "inv"."T_UnidadMedida" WHERE "Codigo" = "vCodUni" AND "Estado" = TRUE;
			IF "vIdUnidad" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUnidad','codigo','UNIDAD_NO_EXISTE','error',FORMAT('La unidad "%s" no existe.', "vCodUni"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		/* --- Invariante general XOR tipos --- */
		IF "vEsGeneral" AND "vCantTipos" > 0 THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','EsGeneral','codigo','INVARIANTE_GENERAL','error','Un producto general no lleva tipos de equipo.');
			"vErrorFila" = TRUE;
		ELSIF NOT "vEsGeneral" AND "vCantTipos" = 0 THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','TiposEquipo','codigo','INVARIANTE_GENERAL','error','Indique al menos un tipo de equipo o marque EsGeneral.');
			"vErrorFila" = TRUE;
		END IF;

		/* --- Resolver tipos de equipo (si no es general) --- */
		IF NOT "vEsGeneral" AND "vCantTipos" > 0 THEN
			"vCodsFaltan" = ARRAY[]::TEXT[];
			FOR "vCodTipo" IN SELECT JSONB_ARRAY_ELEMENTS_TEXT("vTipos")
			LOOP
				"vCodTipo" = TRIM("vCodTipo");
				SELECT "Id" INTO "vIdTipo" FROM "inv"."T_TipoEquipo" WHERE "Codigo" = "vCodTipo" AND "Estado" = TRUE;
				IF "vIdTipo" IS NULL THEN
					"vCodsFaltan" = "vCodsFaltan" || "vCodTipo";
				ELSE
					"vIdsTipos" = "vIdsTipos" || "vIdTipo";
				END IF;
			END LOOP;
			IF ARRAY_LENGTH("vCodsFaltan", 1) > 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','TiposEquipo','codigo','TIPO_EQUIPO_NO_EXISTE','error',FORMAT('Tipos de equipo inexistentes: %s', ARRAY_TO_STRING("vCodsFaltan", ', ')));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		/* --- Duplicado dentro del mismo archivo (case-insensitive, Sku es CITEXT) --- */
		IF "vSku" IS NOT NULL THEN
			IF LOWER("vSku") = ANY("vSkusVistos") THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_DUPLICADO','error',FORMAT('El Sku "%s" esta repetido en el archivo (no distingue mayusculas).', "vSku"));
				"vErrorFila" = TRUE;
			ELSE
				"vSkusVistos" = "vSkusVistos" || LOWER("vSku");
			END IF;

			/* --- Existencia en BD vs Modo (solo cuenta si esta ACTIVO; un Sku de un
			       producto dado de baja debe poder reutilizarse) --- */
			SELECT "Id" INTO "vIdProducto" FROM "inv"."T_Producto" WHERE "Sku" = "vSku" AND "Estado" = TRUE;
			IF "vIdProducto" IS NOT NULL AND "vModo" = 'crear' THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_DUPLICADO','error',FORMAT('El Sku "%s" ya existe (modo crear).', "vSku"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		/* --- Si la fila valida, acumular operacion para la 2da pasada --- */
		IF NOT "vErrorFila" THEN
			"vOps" = "vOps" || JSONB_BUILD_OBJECT(
				'idProducto', "vIdProducto",
				'sku', "vSku",
				'nombre', "vNombre",
				'idCategoria', "vIdCategoria",
				'idUnidad', "vIdUnidad",
				'esGeneral', "vEsGeneral",
				'idsTipos', TO_JSONB("vIdsTipos"),
				'stockMin', "vStockMin",
				'codigoBarra', NULLIF(TRIM("vFila"->>'CodigoBarra'), ''),
				'codigoProv', NULLIF(TRIM("vFila"->>'CodigoProductoProveedor'), '')
			);
		END IF;
	END LOOP;

	/* ============================================================
		Si hubo errores: no se escribe nada (todo-o-nada).
		Registrar la auditoria del intento fallido.
	============================================================ */
	IF JSONB_ARRAY_LENGTH("vErrores") > 0 THEN
		INSERT INTO "inv"."T_Importacion"
			("NombreArchivo","Objetivo","CantidadFilas","CantidadCorrectas","LogErrores","Situacion","UsuarioCreacion","UsuarioModificacion")
		VALUES
			("vNombreArch",'productos',JSONB_ARRAY_LENGTH("vFilas"),0,"vErrores",'fallido',"vUsuario","vUsuario");

		RETURN JSONB_BUILD_OBJECT(
			'cantidadFilas',    JSONB_ARRAY_LENGTH("vFilas"),
			'cantidadCorrectas',0,
			'cantidadErrores',  JSONB_ARRAY_LENGTH("vErrores"),
			'creados',          0,
			'actualizados',     0,
			'errores',          "vErrores"
		);
	END IF;

	/* ============================================================
		PASADA 2 — Escritura (todas las filas ya validaron).
	============================================================ */
	FOR "vFila" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("vOps")
	LOOP
		"vSku"         = "vFila"->>'sku';
		"vIdProducto"  = NULLIF("vFila"->>'idProducto','')::UUID;
		"vEsGeneral"   = ("vFila"->>'esGeneral')::BOOLEAN;
		"vIdsTipos"    = ARRAY(SELECT JSONB_ARRAY_ELEMENTS_TEXT("vFila"->'idsTipos'))::UUID[];

		IF "vIdProducto" IS NULL THEN
			/* Capturar choque con UQ_T_Producto_Sku por carrera concurrente */
			BEGIN
				INSERT INTO "inv"."T_Producto"
				(
					"Sku","Nombre","IdCategoria","IdUnidadMedida","StockMinimo",
					"CodigoBarra","CodigoProductoProveedor","EsGeneral",
					"UsuarioCreacion","UsuarioModificacion"
				)
				VALUES
				(
					"vSku",
					"vFila"->>'nombre',
					("vFila"->>'idCategoria')::UUID,
					("vFila"->>'idUnidad')::UUID,
					COALESCE(("vFila"->>'stockMin')::NUMERIC, 0),
					NULLIF("vFila"->>'codigoBarra',''),
					NULLIF("vFila"->>'codigoProv',''),
					"vEsGeneral",
					"vUsuario","vUsuario"
				)
				RETURNING "Id" INTO "vIdProducto";
			EXCEPTION WHEN unique_violation THEN
				RAISE EXCEPTION 'El Sku "%" ya existe en el catalogo (conflicto de unicidad, no distingue mayusculas).', "vSku";
			END;
			"vCreados" = "vCreados" + 1;
		ELSE
			UPDATE "inv"."T_Producto"
			SET "Nombre"                  = "vFila"->>'nombre',
				"IdCategoria"             = ("vFila"->>'idCategoria')::UUID,
				"IdUnidadMedida"          = ("vFila"->>'idUnidad')::UUID,
				"StockMinimo"             = COALESCE(("vFila"->>'stockMin')::NUMERIC, "StockMinimo"),
				"CodigoBarra"             = NULLIF("vFila"->>'codigoBarra',''),
				"CodigoProductoProveedor" = NULLIF("vFila"->>'codigoProv',''),
				"EsGeneral"               = "vEsGeneral",
				"UsuarioModificacion"     = "vUsuario"
			WHERE "Id" = "vIdProducto";
			"vActualiza" = "vActualiza" + 1;
		END IF;

		/* Reemplaza compatibilidad. General => sin filas (lo respalda el guard). */
		DELETE FROM "inv"."T_ProductoTipoEquipo" WHERE "IdProducto" = "vIdProducto";
		IF NOT "vEsGeneral" THEN
			INSERT INTO "inv"."T_ProductoTipoEquipo"
				("IdProducto","IdTipoEquipo","UsuarioCreacion","UsuarioModificacion")
			SELECT "vIdProducto", t.elem, "vUsuario", "vUsuario"
			FROM UNNEST("vIdsTipos") AS t(elem);
		END IF;
	END LOOP;

	/* Auditoria de la importacion exitosa (misma transaccion que la escritura) */
	INSERT INTO "inv"."T_Importacion"
		("NombreArchivo","Objetivo","CantidadFilas","CantidadCorrectas","LogErrores","Situacion","UsuarioCreacion","UsuarioModificacion")
	VALUES
		("vNombreArch",'productos',JSONB_ARRAY_LENGTH("vFilas"),"vCreados" + "vActualiza",'[]'::JSONB,'completado',"vUsuario","vUsuario");

	RETURN JSONB_BUILD_OBJECT(
		'cantidadFilas',    JSONB_ARRAY_LENGTH("vFilas"),
		'cantidadCorrectas',"vCreados" + "vActualiza",
		'cantidadErrores',  0,
		'creados',          "vCreados",
		'actualizados',     "vActualiza",
		'errores',          '[]'::JSONB
	);
END;
$$;

COMMENT ON FUNCTION "inv"."FnImportarProductos"(JSONB) IS 'Importacion masiva de productos. Valida todo-o-nada; auditoria en T_Importacion dentro de la transaccion; deteccion de SKU duplicado case-insensitive; el lookup de Sku existente ignora productos dados de baja (Estado=TRUE) para permitir reutilizar el Sku tras soft-delete.';