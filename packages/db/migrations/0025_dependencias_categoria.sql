/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnContarDependencias (REPLACE) - rama 'categoria'
	Tipo de Cambio: REPLACE - borrado seguro de categorías
	Autor: Equipo Desarrollo
	Fecha: 2026-06-14
	Descripcion: Agrega la rama 'categoria': cuenta dependientes por FK (productos
	             con esa IdCategoria + subcategorías con esa IdCategoriaPadre) para
	             bloquear el borrado de una categoría/familia en uso.
*/
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
			'vehiculos', (SELECT COUNT(*) FROM "inv"."T_Vehiculo" WHERE "IdEquipo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdEquipo" = "PId")
		);
	ELSIF "PEntidad" = 'vehiculo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdVehiculo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdVehiculo" = "PId")
		);
	ELSIF "PEntidad" = 'tipoEquipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'equipos', (SELECT COUNT(*) FROM "inv"."T_Equipo" WHERE "IdTipoEquipo" = "PId"),
			'productosAsociados', (SELECT COUNT(*) FROM "inv"."T_ProductoTipoEquipo" WHERE "IdTipoEquipo" = "PId")
		);
	ELSIF "PEntidad" = 'categoria' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'productos', (SELECT COUNT(*) FROM "inv"."T_Producto" WHERE "IdCategoria" = "PId" AND "Estado" = TRUE),
			'subcategorias', (SELECT COUNT(*) FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" = "PId" AND "Estado" = TRUE)
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

COMMENT ON FUNCTION "inv"."FnContarDependencias"(TEXT, UUID) IS 'Cuenta datos enlazados de una entidad (incluye categoria: productos + subcategorias). puedeEliminar=true solo si total=0.';