/*
	Prueba de 0087 - SKU con patron PREFIJO-NNNN por categoria.
	Corre contra una base con datos reales. Termina con
	RAISE EXCEPTION 'ROLLBACK DE PRUEBA' a proposito: no persiste nada.
*/
DO $$
DECLARE
	vMal INT;
	vIdFiltro UUID;
	vIdUnidad UUID;
	vIdCatPrueba UUID;
	vId UUID;
	vSku TEXT;
	vMaxFil INT;
	vFallo BOOLEAN;
BEGIN
	-- 1. Todos los productos activos cumplen el patron.
	SELECT count(*) INTO vMal FROM inv."T_Producto"
	WHERE "Estado" AND "Sku" !~ '^[A-Z]{3}-[0-9]{4,}$';
	IF vMal > 0 THEN RAISE EXCEPTION 'FALLA 1: % productos activos fuera del patron', vMal; END IF;

	-- 2. Las categorias hoja activas con productos tienen PrefijoSku.
	SELECT count(*) INTO vMal FROM inv."T_Categoria" c
	WHERE c."Estado" AND c."PrefijoSku" IS NULL
		AND EXISTS (SELECT 1 FROM inv."T_Producto" p WHERE p."IdCategoria" = c."Id" AND p."Estado");
	IF vMal > 0 THEN RAISE EXCEPTION 'FALLA 2: % categorias con productos sin PrefijoSku', vMal; END IF;

	-- 3. El SKU viejo queda buscable: REP-001 era el Termostato.
	IF NOT EXISTS (SELECT 1 FROM inv."V_Producto_StockConsolidado"
		WHERE "SkuAnterior" = 'REP-001' AND "NombreProducto" = 'Termostato') THEN
		RAISE EXCEPTION 'FALLA 3: la vista no expone SkuAnterior REP-001';
	END IF;

	-- 4. Alta sin SKU en Filtros -> FIL-NNNN con el primer libre.
	SELECT "Id" INTO vIdFiltro FROM inv."T_Categoria" WHERE "Codigo" = 'CAT-FILTRO';
	SELECT "Id" INTO vIdUnidad FROM inv."T_UnidadMedida" WHERE "Codigo" = 'NIU';
	SELECT max(substring("Sku" FROM 5)::INT) INTO vMaxFil FROM inv."T_Producto" WHERE "Sku" ~ '^FIL-[0-9]{4,}$';
	vId := inv."FnGuardarProducto"(jsonb_build_object(
		'Nombre', 'Producto de prueba 0087', 'IdCategoria', vIdFiltro,
		'IdUnidadMedida', vIdUnidad, 'EsGeneral', TRUE));
	SELECT "Sku"::TEXT INTO vSku FROM inv."T_Producto" WHERE "Id" = vId;
	IF vSku !~ '^FIL-[0-9]{4}$' OR substring(vSku FROM 5)::INT > vMaxFil + 1 THEN
		RAISE EXCEPTION 'FALLA 4: SKU generado inesperado %', vSku;
	END IF;

	-- 5. Editar sin mandar SKU lo conserva (no se regenera al reclasificar).
	PERFORM inv."FnGuardarProducto"(jsonb_build_object(
		'Id', vId, 'Nombre', 'Producto de prueba 0087 editado',
		'IdCategoria', (SELECT "Id" FROM inv."T_Categoria" WHERE "Codigo" = 'CAT-FOCO'),
		'IdUnidadMedida', vIdUnidad, 'EsGeneral', TRUE));
	IF (SELECT "Sku"::TEXT FROM inv."T_Producto" WHERE "Id" = vId) <> vSku THEN
		RAISE EXCEPTION 'FALLA 5: editar cambio el SKU';
	END IF;

	-- 6. Categoria sin PrefijoSku -> 3 primeras letras del codigo.
	INSERT INTO inv."T_Categoria" ("Codigo", "Nombre", "IdCategoriaPadre")
	VALUES ('CAT-PRUEBAZ', 'Prueba 0087', (SELECT "IdCategoriaPadre" FROM inv."T_Categoria" WHERE "Id" = vIdFiltro))
	RETURNING "Id" INTO vIdCatPrueba;
	vId := inv."FnGuardarProducto"(jsonb_build_object(
		'Nombre', 'Otro producto de prueba 0087', 'IdCategoria', vIdCatPrueba,
		'IdUnidadMedida', vIdUnidad, 'EsGeneral', TRUE));
	IF (SELECT "Sku"::TEXT FROM inv."T_Producto" WHERE "Id" = vId) <> 'PRU-0001' THEN
		RAISE EXCEPTION 'FALLA 6: fallback de prefijo inesperado';
	END IF;

	-- 7. PrefijoSku repetido entre categorias activas -> rechazo.
	vFallo := FALSE;
	BEGIN
		UPDATE inv."T_Categoria" SET "PrefijoSku" = 'FIL' WHERE "Id" = vIdCatPrueba;
	EXCEPTION WHEN unique_violation THEN vFallo := TRUE;
	END;
	IF NOT vFallo THEN RAISE EXCEPTION 'FALLA 7: se acepto un PrefijoSku repetido'; END IF;

	-- 8. PrefijoSku con formato invalido -> rechazo.
	vFallo := FALSE;
	BEGIN
		UPDATE inv."T_Categoria" SET "PrefijoSku" = 'fi1' WHERE "Id" = vIdCatPrueba;
	EXCEPTION WHEN check_violation THEN vFallo := TRUE;
	END;
	IF NOT vFallo THEN RAISE EXCEPTION 'FALLA 8: se acepto un PrefijoSku invalido'; END IF;

	RAISE EXCEPTION 'ROLLBACK DE PRUEBA: 8 escenarios OK';
END $$;
