/*
	Prueba de 0085 - control de duplicados al crear productos.
	Corre contra una base con datos reales (verificado en el remoto). Termina con
	RAISE EXCEPTION 'ROLLBACK DE PRUEBA' a proposito: no persiste nada.
*/
DO $$
DECLARE
	vIdCategoria UUID;
	vIdUnidad UUID;
	vCodigoExistente TEXT;
	vSkuExistente TEXT;
	vIdExistente UUID;
	vIdNuevo UUID;
	vBloqueado BOOLEAN;
	vMensaje TEXT;
	vCuenta INT;
BEGIN
	SELECT "IdCategoria", "IdUnidadMedida" INTO vIdCategoria, vIdUnidad
	FROM inv."T_Producto" WHERE "Estado" LIMIT 1;

	-- Un producto activo con codigo real (no marcador).
	SELECT "Id", "Sku"::TEXT, "CodigoProductoProveedor" INTO vIdExistente, vSkuExistente, vCodigoExistente
	FROM inv."T_Producto"
	WHERE "Estado" AND inv."FnNormalizarCodigoProveedor"("CodigoProductoProveedor") IS NOT NULL
	ORDER BY "Sku" LIMIT 1;

	-- 1. Normalizacion: espacios, guiones y mayusculas no importan; S/C no es codigo.
	IF inv."FnNormalizarCodigoProveedor"('90915 yzzd2') <> inv."FnNormalizarCodigoProveedor"('90915-YZZD2') THEN
		RAISE EXCEPTION 'FALLA 1: la normalizacion no unifica variantes del mismo codigo';
	END IF;
	IF inv."FnNormalizarCodigoProveedor"('S/C') IS NOT NULL OR inv."FnNormalizarCodigoProveedor"('  ') IS NOT NULL THEN
		RAISE EXCEPTION 'FALLA 1: S/C o vacio cuentan como codigo';
	END IF;

	-- 2. Crear con un codigo ya usado (escrito distinto) se bloquea con P0409.
	vBloqueado := FALSE;
	BEGIN
		INSERT INTO inv."T_Producto" ("Sku", "Nombre", "IdCategoria", "IdUnidadMedida", "CodigoProductoProveedor", "UsuarioCreacion")
		VALUES ('ZZ-PRUEBA-1', 'Producto de prueba', vIdCategoria, vIdUnidad, lower(' ' || vCodigoExistente || ' '), 'test');
	EXCEPTION WHEN SQLSTATE 'P0409' THEN
		vBloqueado := TRUE;
		GET STACKED DIAGNOSTICS vMensaje = MESSAGE_TEXT;
	END;
	IF NOT vBloqueado THEN
		RAISE EXCEPTION 'FALLA 2: se pudo crear un producto con el codigo de %', vSkuExistente;
	END IF;
	IF position(vSkuExistente IN vMensaje) = 0 THEN
		RAISE EXCEPTION 'FALLA 2: el mensaje no nombra el producto en conflicto: %', vMensaje;
	END IF;

	-- 3. S/C no bloquea aunque haya decenas de productos con S/C.
	INSERT INTO inv."T_Producto" ("Sku", "Nombre", "IdCategoria", "IdUnidadMedida", "CodigoProductoProveedor", "UsuarioCreacion")
	VALUES ('ZZ-PRUEBA-2', 'Producto de prueba', vIdCategoria, vIdUnidad, 'S/C', 'test')
	RETURNING "Id" INTO vIdNuevo;

	-- 4. Editar otro campo de un producto que YA comparte codigo no se traba.
	UPDATE inv."T_Producto" p SET "Nombre" = p."Nombre", "CodigoProductoProveedor" = p."CodigoProductoProveedor"
	WHERE p."Estado" AND inv."FnNormalizarCodigoProveedor"(p."CodigoProductoProveedor") IN (
		SELECT inv."FnNormalizarCodigoProveedor"(x."CodigoProductoProveedor")
		FROM inv."T_Producto" x WHERE x."Estado"
		GROUP BY 1 HAVING count(*) > 1 AND inv."FnNormalizarCodigoProveedor"(x."CodigoProductoProveedor") IS NOT NULL
	);

	-- 5. Cambiar el codigo a uno ajeno si se bloquea.
	vBloqueado := FALSE;
	BEGIN
		UPDATE inv."T_Producto" SET "CodigoProductoProveedor" = vCodigoExistente WHERE "Id" = vIdNuevo;
	EXCEPTION WHEN SQLSTATE 'P0409' THEN
		vBloqueado := TRUE;
	END;
	IF NOT vBloqueado THEN
		RAISE EXCEPTION 'FALLA 5: se pudo cambiar el codigo a uno que ya usa %', vSkuExistente;
	END IF;

	-- 6. Parecidos por nombre: sin tildes, sin importar mayusculas.
	SELECT count(*) INTO vCuenta FROM inv."FnProductosSimilares"('TERMOSTATO') s WHERE s."Motivo" = 'nombre';
	IF vCuenta < 1 THEN
		RAISE EXCEPTION 'FALLA 6: "TERMOSTATO" no encontro parecidos';
	END IF;

	-- 7. Mismo codigo aparece primero y con Motivo codigo; PIdExcluir lo saca.
	IF (SELECT s."Motivo" FROM inv."FnProductosSimilares"('xyz', vCodigoExistente) s LIMIT 1) <> 'codigo' THEN
		RAISE EXCEPTION 'FALLA 7: el mismo codigo no encabeza los parecidos';
	END IF;
	IF EXISTS (SELECT 1 FROM inv."FnProductosSimilares"('xyz', vCodigoExistente, vIdExistente) s WHERE s."Id" = vIdExistente) THEN
		RAISE EXCEPTION 'FALLA 7: PIdExcluir no excluye al propio producto';
	END IF;

	RAISE EXCEPTION 'ROLLBACK DE PRUEBA: 0085 OK';
END $$;
