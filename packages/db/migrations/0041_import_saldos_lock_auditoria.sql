/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnImportarSaldosIniciales (REPLACE)
	Tipo de Cambio: REPLACE - recuento con lock + auditoria atomica (auditoria QA)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: Combina dos hallazgos sobre la misma funcion:
	  - A3 (ALTO): en modo 'recuento' el diff (cantidad contada - saldo vigente) se
	    calculaba en la pasada 1 leyendo T_SaldoStock SIN lock y se aplicaba en la
	    pasada 2. Un movimiento concurrente entre medio dejaba el saldo final distinto
	    al conteo fisico. Ahora el SELECT del saldo toma FOR UPDATE: serializa el
	    recuento contra otros egresos hasta el commit, garantizando que el ajuste lleve
	    el saldo exactamente a la cantidad contada.
	  - C4 (CRITICO): la auditoria en T_Importacion se insertaba en el endpoint despues
	    del commit y sin chequear error (rastro perdido en silencio). Ahora se escribe
	    DENTRO de la funcion (misma transaccion), incluido el intento fallido.

	NOTA: el endpoint debe pasar 'NombreArchivo' dentro de PLote para la auditoria.
*/
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
	"vUsuario"    VARCHAR(50);
	"vNombreArch" TEXT;
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
	"vUsuario"    = COALESCE(auth.uid()::TEXT, 'API');
	"vNombreArch" = COALESCE(NULLIF(TRIM("PLote"->>'NombreArchivo'), ''), 'importacion-saldos.xlsx');
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

			/* A3: saldo vigente del par BAJO LOCK. Serializa el recuento contra otros
			   egresos hasta el commit, para que el diff se aplique sobre el saldo real. */
			SELECT COALESCE("CantidadDisponible", 0) INTO "vSaldoAct"
			FROM "inv"."T_SaldoStock"
			WHERE "IdProducto" = "vIdProd" AND "IdUbicacion" = "vIdUbic"
			FOR UPDATE;
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
		/* C4: auditoria del intento fallido */
		INSERT INTO "inv"."T_Importacion"
			("NombreArchivo","Objetivo","CantidadFilas","CantidadCorrectas","LogErrores","Situacion","UsuarioCreacion","UsuarioModificacion")
		VALUES
			("vNombreArch",'saldos_iniciales',JSONB_ARRAY_LENGTH("vFilas"),0,"vErrores",'fallido',"vUsuario","vUsuario");

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

	/* C4: auditoria de la importacion exitosa (misma transaccion) */
	INSERT INTO "inv"."T_Importacion"
		("NombreArchivo","Objetivo","CantidadFilas","CantidadCorrectas","LogErrores","Situacion","UsuarioCreacion","UsuarioModificacion")
	VALUES
		("vNombreArch",'saldos_iniciales',JSONB_ARRAY_LENGTH("vFilas"),"vCorrectas",'[]'::JSONB,'completado',"vUsuario","vUsuario");

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

COMMENT ON FUNCTION "inv"."FnImportarSaldosIniciales"(JSONB) IS 'Carga masiva de saldos (inicial o recuento). Recuento toma FOR UPDATE del saldo para serializar contra egresos concurrentes (A3). Auditoria en T_Importacion DENTRO de la transaccion, incluido el intento fallido (C4).';
