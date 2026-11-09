/*
	Prueba de 0086 - dar de baja productos con historial.
	Corre contra una base con datos reales (verificado en el remoto). Termina con
	RAISE EXCEPTION 'ROLLBACK DE PRUEBA' a proposito: no persiste nada.
*/
DO $$
DECLARE
	vAdmin UUID;
	vAlmacenero UUID;
	vConSaldo UUID;
	vSinSaldo UUID;
	vOtroSinSaldo UUID;
	vSkuSinSaldo TEXT;
	vNombreSinSaldo TEXT;
	vIdRequerimiento UUID;
	vFallo BOOLEAN;
	vMensaje TEXT;
BEGIN
	SELECT u."Id" INTO vAdmin FROM seg."T_Usuario" u JOIN seg."T_Rol" r ON r."Id" = u."IdRol"
	WHERE r."Codigo" = 'admin' AND u."Estado" LIMIT 1;
	SELECT u."Id" INTO vAlmacenero FROM seg."T_Usuario" u JOIN seg."T_Rol" r ON r."Id" = u."IdRol"
	WHERE r."Codigo" = 'almacenero' AND u."Estado" LIMIT 1;

	SELECT v."IdProducto" INTO vConSaldo FROM inv."V_Producto_StockConsolidado" v WHERE v."StockTotal" > 0 LIMIT 1;

	-- Dos productos con saldo 0 que no esten en requerimientos ni OT abiertas.
	SELECT v."IdProducto", v."Sku"::TEXT, v."NombreProducto" INTO vSinSaldo, vSkuSinSaldo, vNombreSinSaldo
	FROM inv."V_Producto_StockConsolidado" v
	WHERE NOT EXISTS (SELECT 1 FROM inv."T_SaldoStock" s WHERE s."IdProducto" = v."IdProducto" AND s."CantidadDisponible" <> 0)
		AND NOT EXISTS (SELECT 1 FROM inv."T_RequerimientoDetalle" d JOIN inv."T_Requerimiento" r ON r."Id" = d."IdRequerimiento"
			WHERE d."IdProducto" = v."IdProducto" AND r."Situacion" IN ('pendiente', 'parcial'))
		AND NOT EXISTS (SELECT 1 FROM inv."T_OrdenMantenimientoRepuesto" rp JOIN inv."T_OrdenMantenimiento" o ON o."Id" = rp."IdOrdenMantenimiento"
			WHERE rp."IdProducto" = v."IdProducto" AND o."Situacion" = 'abierta')
	ORDER BY v."Sku" LIMIT 1;
	SELECT v."IdProducto" INTO vOtroSinSaldo
	FROM inv."V_Producto_StockConsolidado" v
	WHERE v."IdProducto" <> vSinSaldo
		AND NOT EXISTS (SELECT 1 FROM inv."T_SaldoStock" s WHERE s."IdProducto" = v."IdProducto" AND s."CantidadDisponible" <> 0)
	ORDER BY v."Sku" LIMIT 1;

	SELECT r."Id" INTO vIdRequerimiento FROM inv."T_Requerimiento" r WHERE r."Estado" LIMIT 1;

	-- 1. Almacenero no puede dar de baja.
	PERFORM set_config('request.jwt.claims', json_build_object('sub', vAlmacenero, 'role', 'authenticated')::TEXT, TRUE);
	vFallo := FALSE;
	BEGIN
		PERFORM inv."FnDarDeBajaProducto"(vSinSaldo);
	EXCEPTION WHEN insufficient_privilege THEN vFallo := TRUE;
	END;
	IF NOT vFallo THEN RAISE EXCEPTION 'FALLA 1: un almacenero dio de baja un producto'; END IF;

	PERFORM set_config('request.jwt.claims', json_build_object('sub', vAdmin, 'role', 'authenticated')::TEXT, TRUE);

	-- 2. Con saldo no se puede.
	vFallo := FALSE;
	BEGIN
		PERFORM inv."FnDarDeBajaProducto"(vConSaldo);
	EXCEPTION WHEN raise_exception THEN
		vFallo := TRUE; GET STACKED DIAGNOSTICS vMensaje = MESSAGE_TEXT;
	END;
	IF NOT vFallo OR position('saldo' IN vMensaje) = 0 THEN RAISE EXCEPTION 'FALLA 2: se dio de baja con saldo (%)', vMensaje; END IF;

	-- 3. No puede unificarse en si mismo.
	vFallo := FALSE;
	BEGIN
		PERFORM inv."FnDarDeBajaProducto"(vSinSaldo, vSinSaldo);
	EXCEPTION WHEN raise_exception THEN vFallo := TRUE;
	END;
	IF NOT vFallo THEN RAISE EXCEPTION 'FALLA 3: se unifico en si mismo'; END IF;

	-- 4. Baja valida, unificado en otro producto.
	PERFORM inv."FnDarDeBajaProducto"(vSinSaldo, vOtroSinSaldo, 'Duplicado de prueba');

	IF EXISTS (SELECT 1 FROM inv."V_Producto_StockConsolidado" WHERE "IdProducto" = vSinSaldo) THEN
		RAISE EXCEPTION 'FALLA 4a: sigue visible en la vista de todos los roles';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM inv."V_Producto_StockConsolidadoTodos" WHERE "IdProducto" = vSinSaldo
		AND "DadoDeBaja" AND "IdProductoUnificado" = vOtroSinSaldo AND "MotivoBaja" = 'Duplicado de prueba') THEN
		RAISE EXCEPTION 'FALLA 4b: la vista del admin no lo muestra con su trazabilidad';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM inv."T_Producto" WHERE "Id" = vSinSaldo AND "Estado") THEN
		RAISE EXCEPTION 'FALLA 4c: la baja elimino el producto (Estado) en vez de conservarlo';
	END IF;
	IF EXISTS (SELECT 1 FROM inv."FnProductosSimilares"(vNombreSinSaldo) s WHERE s."Id" = vSinSaldo) THEN
		RAISE EXCEPTION 'FALLA 4d: el control de duplicados sigue sugiriendo un producto dado de baja';
	END IF;

	-- 5. No se puede dar de baja dos veces ni unificar en uno dado de baja.
	vFallo := FALSE;
	BEGIN
		PERFORM inv."FnDarDeBajaProducto"(vOtroSinSaldo, vSinSaldo);
	EXCEPTION WHEN raise_exception THEN vFallo := TRUE;
	END;
	IF NOT vFallo THEN RAISE EXCEPTION 'FALLA 5: se unifico en un producto dado de baja'; END IF;

	-- 6. Un producto dado de baja no entra en requerimientos nuevos.
	vFallo := FALSE;
	BEGIN
		INSERT INTO inv."T_RequerimientoDetalle" ("IdRequerimiento", "IdProducto", "Cantidad", "UsuarioCreacion")
		VALUES (vIdRequerimiento, vSinSaldo, 1, 'test');
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS vMensaje = MESSAGE_TEXT;
		vFallo := position('dado de baja' IN vMensaje) > 0;
	END;
	IF NOT vFallo THEN RAISE EXCEPTION 'FALLA 6: se cargo un producto dado de baja en un requerimiento (%)', vMensaje; END IF;

	-- 7. Reactivar lo devuelve a la vista de todos.
	PERFORM inv."FnReactivarProducto"(vSinSaldo);
	IF NOT EXISTS (SELECT 1 FROM inv."V_Producto_StockConsolidado" WHERE "IdProducto" = vSinSaldo AND NOT "DadoDeBaja") THEN
		RAISE EXCEPTION 'FALLA 7: reactivar no lo devolvio a la vista';
	END IF;

	RAISE EXCEPTION 'ROLLBACK DE PRUEBA: 0086 OK (probado con %)', vSkuSinSaldo;
END $$;
