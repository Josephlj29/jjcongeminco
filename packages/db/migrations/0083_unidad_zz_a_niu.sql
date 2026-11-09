/*
	0083 - ZZ y NIU son la misma unidad: todo pasa a NIU y ZZ deja de ofrecerse.

	- Los productos con unidad ZZ (activos e inactivos) pasan a NIU.
	- ZZ queda con Estado = FALSE: desaparece del selector de unidades
	  (GET /api/catalogo/unidades filtra Estado) y la importacion masiva
	  (inv.FnImportarProductos) la rechaza como unidad inexistente.
	- No se borra la fila: si algun registro historico la referencia, sigue
	  resolviendo.

	Solo cambia inv."T_Producto"."IdUnidadMedida" e inv."T_UnidadMedida"."Estado".
	No toca cantidades, costos ni movimientos: ZZ y NIU son ambas "unidad",
	asi que no hay conversion.
*/

DO $$
DECLARE
	vIdZz  UUID;
	vIdNiu UUID;
	vMovidos INTEGER;
	vRestantes INTEGER;
BEGIN
	SELECT "Id" INTO vIdZz  FROM inv."T_UnidadMedida" WHERE "Codigo" = 'ZZ';
	SELECT "Id" INTO vIdNiu FROM inv."T_UnidadMedida" WHERE "Codigo" = 'NIU' AND "Estado";

	IF vIdNiu IS NULL THEN
		RAISE EXCEPTION 'No existe la unidad NIU activa: no hay destino para ZZ';
	END IF;

	IF vIdZz IS NULL THEN
		RAISE NOTICE '0083: no existe la unidad ZZ, nada que hacer';
		RETURN;
	END IF;

	UPDATE inv."T_Producto"
	SET "IdUnidadMedida" = vIdNiu,
		"UsuarioModificacion" = 'Unidad ZZ a NIU 0083'
	WHERE "IdUnidadMedida" = vIdZz;
	GET DIAGNOSTICS vMovidos = ROW_COUNT;

	SELECT COUNT(*) INTO vRestantes FROM inv."T_Producto" WHERE "IdUnidadMedida" = vIdZz;
	IF vRestantes > 0 THEN
		RAISE EXCEPTION 'Quedaron % productos con ZZ', vRestantes;
	END IF;

	UPDATE inv."T_UnidadMedida"
	SET "Estado" = FALSE,
		"UsuarioModificacion" = 'Unidad ZZ a NIU 0083'
	WHERE "Id" = vIdZz;

	RAISE NOTICE '0083: % productos pasaron de ZZ a NIU; ZZ desactivada', vMovidos;
END $$;
