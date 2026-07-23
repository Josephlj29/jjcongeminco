/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnContarDependencias (REPLACE)
	Tipo de Cambio: REPLACE - contar solo dependencias ACTIVAS en tablas soft-deletables
	Autor: Equipo Desarrollo
	Fecha: 2026-07-22
	Descripcion: Las ramas equipo/vehiculo/tipoEquipo/personal contaban filas SIN
	             filtrar por "Estado", asi que un equipo cuyo unico vehiculo ya
	             estaba dado de baja (Estado=false) seguia bloqueando su propia
	             eliminacion ("tiene datos enlazados" con conteo de un registro
	             que ya no existe para el usuario). Se agrega "Estado" = TRUE en
	             los conteos de tablas que soportan soft-delete. Las tablas de
	             historial inmutable (T_MovimientoStock, T_DocumentoInventario,
	             T_DocumentoInventarioDetalle, T_RequerimientoDetalle,
	             T_ProductoPrecioHistorico) NO tienen columna Estado y deben
	             seguir bloqueando siempre: no se tocan.
*/
CREATE OR REPLACE FUNCTION "inv"."FnContarDependencias"("PEntidad" text, "PId" uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'inv', 'public'
AS $function$
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
			'vehiculos', (SELECT COUNT(*) FROM "inv"."T_Vehiculo" WHERE "IdEquipo" = "PId" AND "Estado" = TRUE),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdEquipo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'vehiculo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'documentos', (SELECT COUNT(*) FROM "inv"."T_DocumentoInventario" WHERE "IdVehiculo" = "PId"),
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdVehiculo" = "PId" AND "Estado" = TRUE),
			'ordenesMantenimiento', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "IdVehiculo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'tipoEquipo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'equipos', (SELECT COUNT(*) FROM "inv"."T_Equipo" WHERE "IdTipoEquipo" = "PId" AND "Estado" = TRUE),
			'productosAsociados', (
				SELECT COUNT(*) FROM "inv"."T_ProductoTipoEquipo" pte
				JOIN "inv"."T_Producto" p ON p."Id" = pte."IdProducto" AND p."Estado" = TRUE
				WHERE pte."IdTipoEquipo" = "PId" AND pte."Estado" = TRUE
			)
		);
	ELSIF "PEntidad" = 'categoria' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'productos', (SELECT COUNT(*) FROM "inv"."T_Producto" WHERE "IdCategoria" = "PId" AND "Estado" = TRUE),
			'subcategorias', (SELECT COUNT(*) FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'cargo' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'personal', (SELECT COUNT(*) FROM "inv"."T_Personal" WHERE "IdCargo" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'personal' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'requerimientos', (SELECT COUNT(*) FROM "inv"."T_Requerimiento" WHERE "IdPersonalSolicitante" = "PId" AND "Estado" = TRUE),
			'ordenesComoMecanico', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimientoPersonal" WHERE "IdPersonal" = "PId" AND "Estado" = TRUE)
		);
	ELSIF "PEntidad" = 'ordenMantenimiento' THEN
		"vResultado" = JSONB_BUILD_OBJECT(
			'requerimiento', (SELECT COUNT(*) FROM "inv"."T_OrdenMantenimiento" WHERE "Id" = "PId" AND "IdRequerimiento" IS NOT NULL)
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
$function$;

COMMENT ON FUNCTION "inv"."FnContarDependencias"(text, uuid) IS 'Cuenta dependencias enlazadas a una entidad para bloquear su eliminacion. Las tablas soft-deletables (equipo/vehiculo/tipoEquipo/personal) solo cuentan registros ACTIVOS: un vinculo dado de baja no debe impedir eliminar la entidad padre. Las tablas de historial inmutable (movimientos, documentos, precios) no tienen Estado y siguen bloqueando siempre.';
