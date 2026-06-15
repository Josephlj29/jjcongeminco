/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnImportarSaldosIniciales + fix CHECK de inv.T_Importacion
	Tipo de Cambio: CREATE + ALTER - carga masiva de saldos desde Excel/JSON
	Autor: Equipo Desarrollo
	Fecha: 2026-06-15
	Descripcion: "Saldo" = cantidad de un producto en una ubicacion. NUNCA se
	             escribe T_SaldoStock directo (es cache derivado del ledger). Se
	             generan DOCUMENTOS que al confirmarse alimentan el ledger ->
	             trigger -> saldo + costo promedio. Dos modos:
	               - 'inicial'  : documentos 'existencia_inicial' (+1). Rechaza la
	                              fila si ese producto+ubicacion YA tiene saldo<>0.
	               - 'recuento' : compara contra el saldo vigente y genera 'ajuste'
	                              por la DIFERENCIA (entrada si sobra, salida si
	                              falta). Sirve para tomas de inventario.
	             Agrupa por ubicacion -> un documento por ubicacion (dos en
	             recuento: uno de entradas, otro de salidas). Reusa
	             FnRegistrarDocumentoInventario (cabecera+detalle+confirmacion).
	             Atomico todo-o-nada: valida TODO primero; si hay >=1 error no
	             escribe nada y devuelve el reporte por fila.

	Entrada (PLote JSONB):
	  { "Modo":"inicial"|"recuento", "FechaDocumento":"2026-06-14",
	    "Filas":[ {"Fila":2,"CodigoUbicacion":"AREQUIPA","Sku":"ACE-001",
	               "Cantidad":100,"CostoUnitario":25.50} ] }

	Salida (JSONB): mismo contrato que FnImportarProductos
	  { cantidadFilas, cantidadCorrectas, cantidadErrores, creados,
	    actualizados, errores:[{fila,columna,codigo,error}] }
	  (creados = documentos generados; actualizados = lineas con movimiento)
*/

/* 1. T_Importacion: permitir el objetivo 'saldos_iniciales' --------------- */
ALTER TABLE "inv"."T_Importacion"
	DROP CONSTRAINT IF EXISTS "CHK_T_Importacion_Objetivo_Permitido";
ALTER TABLE "inv"."T_Importacion"
	ADD CONSTRAINT "CHK_T_Importacion_Objetivo_Permitido"
	CHECK ("Objetivo" IN ('productos','movimientos','saldos_iniciales'));

/* 2. Funcion de importacion de saldos ------------------------------------ */
CREATE OR REPLACE FUNCTION "inv"."FnImportarSaldosIniciales"
(
	"PLote" JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
	"vModo"       TEXT;
	"vFecha"      DATE;
	"vFilas"      JSONB;
	"vFila"       JSONB;
	"vErrores"    JSONB := '[]'::JSONB;
	"vOps"        JSONB := '[]'::JSONB;
	"vParesVistos" TEXT[] := ARRAY[]::TEXT[];

	"vNumFila"    INT;
	"vCodUbic"    TEXT;
	"vSku"        TEXT;
	"vCantidad"   NUMERIC;
	"vCosto"      NUMERIC;
	"vIdUbic"     UUID;
	"vIdProd"     UUID;
	"vSaldoAct"   NUMERIC;
	"vDiff"       NUMERIC;
	"vErrorFila"  BOOLEAN;
	"vPar"        TEXT;

	"vCreados"    INT := 0;
	"vLineas"     INT := 0;
	"vCorrectas"  INT := 0;
	"vIdUbicLoop" UUID;
	"vDetalle"    JSONB;
	"vDoc"        JSONB;
BEGIN
	"vModo"  = LOWER(COALESCE("PLote"->>'Modo', 'inicial'));
	IF "vModo" NOT IN ('inicial', 'recuento') THEN
		RAISE EXCEPTION 'Modo invalido: % (use inicial o recuento).', "vModo";
	END IF;

	BEGIN
		"vFecha" = ("PLote"->>'FechaDocumento')::DATE;
	EXCEPTION WHEN others THEN
		RAISE EXCEPTION 'FechaDocumento invalida o ausente (formato YYYY-MM-DD).';
	END;
	IF "vFecha" IS NULL THEN
		RAISE EXCEPTION 'FechaDocumento es obligatoria.';
	END IF;

	"vFilas" = COALESCE("PLote"->'Filas', '[]'::JSONB);

	/* ===================== PASADA 1 — Validacion ===================== */
	FOR "vFila" IN SELECT * FROM JSONB_ARRAY_ELEMENTS("vFilas")
	LOOP
		"vErrorFila" = FALSE;
		"vNumFila"   = COALESCE(NULLIF("vFila"->>'Fila','')::INT, 0);
		"vCodUbic"   = NULLIF(TRIM("vFila"->>'CodigoUbicacion'), '');
		"vSku"       = NULLIF(TRIM("vFila"->>'Sku'), '');
		"vIdUbic"    = NULL;
		"vIdProd"    = NULL;
		"vCosto"     = NULL;

		/* Cantidad numerica > 0 */
		BEGIN
			"vCantidad" = NULLIF("vFila"->>'Cantidad','')::NUMERIC;
		EXCEPTION WHEN others THEN
			"vCantidad" = NULL;
		END;
		IF "vCantidad" IS NULL OR "vCantidad" <= 0 THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Cantidad','codigo','CANTIDAD_INVALIDA','error','La cantidad debe ser un numero mayor a 0.');
			"vErrorFila" = TRUE;
		END IF;

		/* Costo opcional, >= 0 si viene */
		IF NULLIF("vFila"->>'CostoUnitario','') IS NOT NULL THEN
			BEGIN
				"vCosto" = ("vFila"->>'CostoUnitario')::NUMERIC;
			EXCEPTION WHEN others THEN
				"vCosto" = NULL;
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CostoUnitario','codigo','COSTO_INVALIDO','error','El costo unitario debe ser numerico.');
				"vErrorFila" = TRUE;
			END;
			IF "vCosto" IS NOT NULL AND "vCosto" < 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CostoUnitario','codigo','COSTO_INVALIDO','error','El costo unitario no puede ser negativo.');
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		/* Resolver ubicacion */
		IF "vCodUbic" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUbicacion','codigo','CAMPO_REQUERIDO','error','El CodigoUbicacion es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdUbic" FROM "inv"."T_Ubicacion" WHERE "Codigo" = "vCodUbic";
			IF "vIdUbic" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','CodigoUbicacion','codigo','UBICACION_NO_EXISTE','error',FORMAT('La ubicacion "%s" no existe.', "vCodUbic"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		/* Resolver producto */
		IF "vSku" IS NULL THEN
			"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','CAMPO_REQUERIDO','error','El Sku es obligatorio.');
			"vErrorFila" = TRUE;
		ELSE
			SELECT "Id" INTO "vIdProd" FROM "inv"."T_Producto" WHERE "Sku" = "vSku" AND "Estado" = TRUE;
			IF "vIdProd" IS NULL THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','SKU_NO_EXISTE','error',FORMAT('El Sku "%s" no existe en el catalogo.', "vSku"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		/* Duplicado ubicacion+sku dentro del archivo */
		IF "vIdUbic" IS NOT NULL AND "vIdProd" IS NOT NULL THEN
			"vPar" = "vIdUbic"::TEXT || '|' || "vIdProd"::TEXT;
			IF "vPar" = ANY("vParesVistos") THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Sku','codigo','DUPLICADO','error',FORMAT('El producto "%s" esta repetido para la ubicacion "%s".', "vSku", "vCodUbic"));
				"vErrorFila" = TRUE;
			ELSE
				"vParesVistos" = "vParesVistos" || "vPar";
			END IF;

			/* Saldo vigente del par */
			SELECT COALESCE("CantidadDisponible", 0) INTO "vSaldoAct"
			FROM "inv"."T_SaldoStock"
			WHERE "IdProducto" = "vIdProd" AND "IdUbicacion" = "vIdUbic";
			"vSaldoAct" = COALESCE("vSaldoAct", 0);

			/* Modo inicial: el par no debe tener saldo previo */
			IF "vModo" = 'inicial' AND "vSaldoAct" <> 0 THEN
				"vErrores" = "vErrores" || JSONB_BUILD_OBJECT('fila',"vNumFila",'columna','Cantidad','codigo','SALDO_YA_EXISTE','error',FORMAT('El producto "%s" ya tiene saldo (%s) en "%s". Use modo recuento para ajustar.', "vSku", "vSaldoAct", "vCodUbic"));
				"vErrorFila" = TRUE;
			END IF;
		END IF;

		IF NOT "vErrorFila" THEN
			"vDiff" = CASE WHEN "vModo" = 'recuento' THEN "vCantidad" - "vSaldoAct" ELSE "vCantidad" END;
			"vOps" = "vOps" || JSONB_BUILD_OBJECT(
				'idUbic', "vIdUbic",
				'idProd', "vIdProd",
				'cantidad', "vCantidad",
				'diff', "vDiff",
				'costo', "vCosto"
			);
		END IF;
	END LOOP;

	IF JSONB_ARRAY_LENGTH("vErrores") > 0 THEN
		RETURN JSONB_BUILD_OBJECT(
			'cantidadFilas',     JSONB_ARRAY_LENGTH("vFilas"),
			'cantidadCorrectas', 0, 'cantidadErrores', JSONB_ARRAY_LENGTH("vErrores"),
			'creados', 0, 'actualizados', 0, 'errores', "vErrores"
		);
	END IF;

	"vCorrectas" = JSONB_ARRAY_LENGTH("vOps");

	/* ===================== PASADA 2 — Escritura ===================== */
	IF "vModo" = 'inicial' THEN
		FOR "vIdUbicLoop" IN
			SELECT DISTINCT (op->>'idUbic')::UUID FROM JSONB_ARRAY_ELEMENTS("vOps") op
		LOOP
			"vDetalle" = (
				SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
					'IdProducto', op->>'idProd',
					'Cantidad',   (op->>'cantidad')::NUMERIC,
					'CostoUnitario', op->>'costo'
				))
				FROM JSONB_ARRAY_ELEMENTS("vOps") op
				WHERE (op->>'idUbic')::UUID = "vIdUbicLoop"
			);
			"vDoc" = JSONB_BUILD_OBJECT(
				'TipoDocumento', 'existencia_inicial',
				'FechaDocumento', "vFecha"::TEXT,
				'IdUbicacionDestino', "vIdUbicLoop"::TEXT,
				'Notas', 'Importacion de existencia inicial',
				'Detalle', "vDetalle"
			);
			PERFORM "inv"."FnRegistrarDocumentoInventario"("vDoc");
			"vCreados" = "vCreados" + 1;
			"vLineas"  = "vLineas" + JSONB_ARRAY_LENGTH("vDetalle");
		END LOOP;

	ELSE  /* recuento */
		FOR "vIdUbicLoop" IN
			SELECT DISTINCT (op->>'idUbic')::UUID FROM JSONB_ARRAY_ELEMENTS("vOps") op
		LOOP
			/* Entradas: diff > 0 (sobra stock) -> ajuste +1 con costo */
			"vDetalle" = (
				SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
					'IdProducto', op->>'idProd',
					'Cantidad',   (op->>'diff')::NUMERIC,
					'CostoUnitario', op->>'costo'
				))
				FROM JSONB_ARRAY_ELEMENTS("vOps") op
				WHERE (op->>'idUbic')::UUID = "vIdUbicLoop" AND (op->>'diff')::NUMERIC > 0
			);
			IF "vDetalle" IS NOT NULL THEN
				"vDoc" = JSONB_BUILD_OBJECT(
					'TipoDocumento', 'ajuste',
					'FechaDocumento', "vFecha"::TEXT,
					'IdUbicacionDestino', "vIdUbicLoop"::TEXT,
					'Notas', 'Ajuste por recuento (entrada)',
					'Detalle', "vDetalle"
				);
				PERFORM "inv"."FnRegistrarDocumentoInventario"("vDoc");
				"vCreados" = "vCreados" + 1;
				"vLineas"  = "vLineas" + JSONB_ARRAY_LENGTH("vDetalle");
			END IF;

			/* Salidas: diff < 0 (falta stock) -> ajuste -1, costo al promedio */
			"vDetalle" = (
				SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
					'IdProducto', op->>'idProd',
					'Cantidad',   (-1 * (op->>'diff')::NUMERIC)
				))
				FROM JSONB_ARRAY_ELEMENTS("vOps") op
				WHERE (op->>'idUbic')::UUID = "vIdUbicLoop" AND (op->>'diff')::NUMERIC < 0
			);
			IF "vDetalle" IS NOT NULL THEN
				"vDoc" = JSONB_BUILD_OBJECT(
					'TipoDocumento', 'ajuste',
					'FechaDocumento', "vFecha"::TEXT,
					'IdUbicacionOrigen', "vIdUbicLoop"::TEXT,
					'Notas', 'Ajuste por recuento (salida)',
					'Detalle', "vDetalle"
				);
				PERFORM "inv"."FnRegistrarDocumentoInventario"("vDoc");
				"vCreados" = "vCreados" + 1;
				"vLineas"  = "vLineas" + JSONB_ARRAY_LENGTH("vDetalle");
			END IF;
		END LOOP;
	END IF;

	RETURN JSONB_BUILD_OBJECT(
		'cantidadFilas',     JSONB_ARRAY_LENGTH("vFilas"),
		'cantidadCorrectas', "vCorrectas",
		'cantidadErrores',   0,
		'creados',           "vCreados",
		'actualizados',      "vLineas",
		'errores',           '[]'::JSONB
	);
END;
$$;

COMMENT ON FUNCTION "inv"."FnImportarSaldosIniciales"(JSONB) IS 'Carga masiva de saldos desde JSON. Modo inicial (documentos existencia_inicial) o recuento (ajuste por diferencia). No escribe T_SaldoStock directo: genera documentos y reusa el ledger. Todo-o-nada, errores por fila.';
