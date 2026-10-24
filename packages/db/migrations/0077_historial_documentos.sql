/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.V_Historial_DocumentoInventario (CREATE)
	Tipo de Cambio: CREATE - historial de documentos con columnas legibles
	Autor: Equipo Desarrollo
	Fecha: 2026-10-24
	Descripcion: Movimientos solo listaba los 50 documentos mas recientes, sin
	             filtros, y con columnas que no alcanzan para reconocer un
	             documento: fecha, tipo, numero y comprobante. Un documento viejo
	             no aparecia y, por lo tanto, no se podia corregir ni anular.

	             Esta vista arma, por documento, lo que antes habia que
	             reconstruir abriendo el kardex:
	               - Origen/destino, proveedor y placa por NOMBRE, no por Id.
	               - CantidadItems: productos distintos que movio.
	               - ValorTotal: valor al costo del ledger. Una transferencia
	                 cuenta solo su pata de salida; si no, valdria el doble.
	               - FechaRegistro / RegistradoPor: quien y cuando lo cargo.
	               - FechaAnulacion / AnuladoPor: solo en anulados. Un
	                 confirmado no admite UPDATE (TR_..._BloquearEdicion), asi
	                 que en un anulado la auditoria de modificacion ES la
	                 anulacion.

	             Los nombres de usuario salen de seg.FnNombreUsuario (0075): la
	             RLS de seg.T_Usuario no deja hacer el JOIN directo.

	             NO incluye si se puede corregir: eso lo decide
	             inv.FnMotivoBloqueoCorreccionDocumento recorriendo lotes y
	             saldos, y la API lo evalua solo para la pagina visible.
*/
CREATE OR REPLACE VIEW "inv"."V_Historial_DocumentoInventario"
WITH (security_invoker = true) AS
	SELECT
		d."Id"
		,d."TipoDocumento"
		,d."FechaDocumento"
		,d."NumeroDocumento"
		,d."Comprobante"
		,d."Referencia"
		,d."Notas"
		,d."Situacion"
		,d."Estado"
		,d."FechaCreacion"
		,d."UsuarioCreacion"
		,d."IdUbicacionOrigen"
		,uo."Nombre" AS "NombreUbicacionOrigen"
		,d."IdUbicacionDestino"
		,ud."Nombre" AS "NombreUbicacionDestino"
		,d."IdProveedor"
		,pr."Nombre" AS "NombreProveedor"
		,d."IdVehiculo"
		,ve."Placa"
		,COALESCE(mov."CantidadItems", 0) AS "CantidadItems"
		,COALESCE(mov."ValorTotal", 0) AS "ValorTotal"
		,d."FechaCreacion" AS "FechaRegistro"
		,"seg"."FnNombreUsuario"(d."UsuarioCreacion") AS "RegistradoPor"
		,CASE WHEN d."Situacion" = 'anulado' THEN d."FechaModificacion" END AS "FechaAnulacion"
		,CASE WHEN d."Situacion" = 'anulado'
			THEN "seg"."FnNombreUsuario"(d."UsuarioModificacion") END AS "AnuladoPor"
	FROM "inv"."T_DocumentoInventario" d
	LEFT JOIN "inv"."T_Ubicacion" uo ON uo."Id" = d."IdUbicacionOrigen"
	LEFT JOIN "inv"."T_Ubicacion" ud ON ud."Id" = d."IdUbicacionDestino"
	LEFT JOIN "inv"."T_Proveedor" pr ON pr."Id" = d."IdProveedor"
	LEFT JOIN "inv"."T_Vehiculo" ve ON ve."Id" = d."IdVehiculo"
	LEFT JOIN LATERAL (
		SELECT
			COUNT(DISTINCT m."IdProducto") AS "CantidadItems"
			,SUM(m."Cantidad" * COALESCE(m."CostoUnitario", 0)) AS "ValorTotal"
		FROM "inv"."T_MovimientoStock" m
		WHERE m."IdDocumentoInventario" = d."Id"
		  AND (d."TipoDocumento" <> 'transferencia' OR m."Direccion" = -1)
	) mov ON TRUE;

COMMENT ON VIEW "inv"."V_Historial_DocumentoInventario" IS 'Historial de documentos de inventario (pantalla solo admin): una fila por documento con origen/destino, proveedor y placa por nombre, items, valor al costo del ledger, quien lo registro y quien lo anulo.';

GRANT SELECT ON "inv"."V_Historial_DocumentoInventario" TO "authenticated";
