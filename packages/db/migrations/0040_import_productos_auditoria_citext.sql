/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnImportarProductos (REPLACE)
	Tipo de Cambio: REPLACE - auditoria atomica + SKU case-insensitive (auditoria QA)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: Combina dos hallazgos sobre la misma funcion:
	  - C4 (CRITICO): la auditoria en T_Importacion se insertaba en el ENDPOINT, en una
	    llamada separada despues de que la RPC ya commiteo, sin chequear su error -> la
	    pista de auditoria podia perderse en silencio (200 OK sin rastro), y las
	    importaciones rechazadas no dejaban registro. Ahora la auditoria se escribe
	    DENTRO de la funcion (misma transaccion) antes de CADA return, incluido el de
	    error (Situacion='fallido'). El endpoint deja de insertar.
	  - A4 (ALTO): el SKU es CITEXT (UNIQUE case-insensitive) pero la deteccion de
	    duplicados in-archivo comparaba TEXT case-sensitive, dejando pasar 'ACE-001' y
	    'ace-001' que luego reventaban con 500 opaco en el INSERT. Ahora la deteccion es
	    case-insensitive y el INSERT captura unique_violation con mensaje claro.

	NOTA: el endpoint debe pasar 'NombreArchivo' dentro de PLote para la auditoria.
*/
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

		/* --- Duplicado dentro del mismo archivo (A4: case-insensitive, SKU es CITEXT) --- */
		IF "vSku" IS NOT NULL THEN
			IF LOWER("vSku") = ANY("vSkusVistos") THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_DUPLICADO','error',FORMAT('El Sku "%s" esta repetido en el archivo (no distingue mayusculas).', "vSku"));
				"vErrorFila" = TRUE;
			ELSE
				"vSkusVistos" = "vSkusVistos" || LOWER("vSku");
			END IF;

			/* --- Existencia en BD vs Modo --- */
			SELECT "Id" INTO "vIdProducto" FROM "inv"."T_Producto" WHERE "Sku" = "vSku";
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
		C4: registrar la auditoria del intento fallido (antes no dejaba rastro).
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
			/* A4: capturar choque con UQ_T_Producto_Sku (CITEXT) por carrera concurrente */
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

	/* C4: auditoria de la importacion exitosa (misma transaccion que la escritura) */
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

COMMENT ON FUNCTION "inv"."FnImportarProductos"(JSONB) IS 'Importacion masiva de productos. Valida todo-o-nada; auditoria en T_Importacion DENTRO de la transaccion (C4, incluye intentos fallidos); deteccion de SKU duplicado case-insensitive y captura de unique_violation (A4).';
