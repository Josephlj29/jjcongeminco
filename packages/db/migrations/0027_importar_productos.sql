/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnImportarProductos (carga masiva de catalogo desde Excel/JSON)
	Tipo de Cambio: CREATE - importacion masiva alineada al modelo EsGeneral/tipos
	Autor: Equipo Desarrollo
	Fecha: 2026-06-15
	Descripcion: Reemplaza el INSERT directo del endpoint (que ignoraba EsGeneral y
	             la puente T_ProductoTipoEquipo, dejando productos huerfanos de
	             compatibilidad). Recibe el lote completo en JSONB con CODIGOS
	             naturales (no UUIDs) y, por cada fila:
	               - resuelve CodigoCategoria / CodigoUnidad / TiposEquipo a IDs,
	               - aplica la invariante general XOR >=1 tipo,
	               - segun Modo: 'crear' (salta SKU existente) o 'upsert' (actualiza),
	               - reemplaza la compatibilidad del producto.
	             Atomico todo-o-nada: valida TODAS las filas en una primera pasada
	             SIN escribir; si hay >=1 error devuelve solo el reporte y no toca la
	             BD; si no hay errores, ejecuta la pasada de escritura.
	             SECURITY INVOKER: respeta RLS (productoEscritura) y registra
	             auth.uid() como UsuarioCreacion/Modificacion.

	Entrada (PLote JSONB):
	  {
	    "Modo": "crear" | "upsert",
	    "Filas": [
	      { "Fila": 2, "Sku": "ACE-001", "Nombre": "Aceite 15W40",
	        "CodigoCategoria": "CAT-ACEITE", "CodigoUnidad": "LT",
	        "EsGeneral": false, "TiposEquipo": ["CAMION","GRUA"],
	        "StockMinimo": 0, "CodigoBarra": "", "CodigoProductoProveedor": "" }
	    ]
	  }

	Salida (JSONB):
	  { "cantidadFilas": N, "cantidadCorrectas": M, "cantidadErrores": K,
	    "creados": X, "actualizados": Y,
	    "errores": [ { "fila": 2, "columna": "CodigoCategoria",
	                   "codigo": "CATEGORIA_NO_EXISTE", "error": "..." } ] }
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

	/* helper para empujar un error y marcar la fila */
	"vCol"         TEXT;
	"vCodErr"      TEXT;
	"vMsg"         TEXT;
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');
	"vModo"    = LOWER(COALESCE("PLote"->>'Modo', 'crear'));
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

		/* --- Duplicado dentro del mismo archivo --- */
		IF "vSku" IS NOT NULL THEN
			IF "vSku" = ANY("vSkusVistos") THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_DUPLICADO','error',FORMAT('El Sku "%s" esta repetido en el archivo.', "vSku"));
				"vErrorFila" = TRUE;
			ELSE
				"vSkusVistos" = "vSkusVistos" || "vSku";
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
	============================================================ */
	IF JSONB_ARRAY_LENGTH("vErrores") > 0 THEN
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

COMMENT ON FUNCTION "inv"."FnImportarProductos"(JSONB) IS 'Importacion masiva de productos desde JSON con codigos naturales. Valida todo-o-nada, resuelve categoria/unidad/tipos, aplica invariante general XOR tipos, modo crear|upsert. Devuelve reporte con errores por fila.';
