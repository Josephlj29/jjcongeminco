/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: seg.FnNombreUsuario (CREATE)
	        inv.V_MovimientoStock_Kardex (REPLACE)
	        inv.V_Reporte_Movimiento (REPLACE)
	Tipo de Cambio: CREATE + REPLACE - quien y cuando cargo cada movimiento
	Autor: Equipo Desarrollo
	Fecha: 2026-10-21
	Descripcion: El kardex mostraba una sola fecha, la del DOCUMENTO, que es el dia
	             contable y puede fecharse hacia atras (y debe poder: la fecha del
	             movimiento es la del hecho economico, no la de digitacion).

	             El efecto colateral es que dos cargas muy distintas se ven iguales.
	             Caso real (CON-011, Polea guia HYUNDAI): la carga inicial del
	             02/09 08:41 y una entrada hecha el 04/09 23:37 pero fechada al
	             02/09 aparecian como "dos ingresos del mismo dia", sin forma de
	             distinguirlas ni de saber quien las hizo.

	             El dato ya existia: T_DocumentoInventario guarda FechaCreacion y
	             UsuarioCreacion. Lo que faltaba era exponerlo. Ahora las vistas
	             devuelven, ademas de la fecha contable:
	               - FechaRegistro: TIMESTAMPTZ real de carga (con hora).
	               - RegistradoPor: nombre del usuario que la registro.

	             seg.FnNombreUsuario resuelve el nombre SIN abrir la tabla de
	             usuarios: la RLS de seg.T_Usuario solo deja leer la fila propia
	             (salvo admin), asi que un JOIN directo desde una vista
	             security_invoker le mostraria el nombre al admin y NULL al resto.
	             La funcion es SECURITY DEFINER y devuelve solo el nombre: no
	             expone DNI, telefono ni rol. Mismo patron que seg.FnRolUsuario.
*/
CREATE OR REPLACE FUNCTION "seg"."FnNombreUsuario"("PUsuario" VARCHAR)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'seg', 'public'
AS $$
DECLARE
	"vNombre" TEXT;
BEGIN
	IF "PUsuario" IS NULL OR "PUsuario" = '' THEN
		RETURN NULL;
	END IF;

	/* Los campos de auditoria guardan el uid de la sesion, pero tambien 'API',
	   'Sistema' o un correo cuando el cambio no vino de una sesion de usuario.
	   Lo que no es un uid se devuelve tal cual: es mas util que un hueco. */
	IF "PUsuario" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
		RETURN "PUsuario";
	END IF;

	SELECT U."NombreCompleto" INTO "vNombre"
	FROM "seg"."T_Usuario" U
	WHERE U."Id" = "PUsuario"::UUID;

	RETURN COALESCE("vNombre", "PUsuario");
END;
$$;

COMMENT ON FUNCTION "seg"."FnNombreUsuario"(VARCHAR) IS 'Nombre legible del usuario de un campo de auditoria, sin abrir seg.T_Usuario (su RLS solo deja ver la fila propia). Devuelve el valor tal cual si no es un uid (API, Sistema, un correo) o si el uid ya no existe.';

/* ── Kardex del producto ──────────────────────────────────────────────── */
CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_Kardex"
WITH (security_invoker = true) AS
	SELECT
		m."Id" AS "IdMovimientoStock"
		,m."IdProducto"
		,p."Sku"
		,p."Nombre" AS "NombreProducto"
		,m."IdUbicacion"
		,u."Nombre" AS "NombreUbicacion"
		,m."FechaMovimiento"
		,d."TipoDocumento"
		,d."NumeroDocumento"
		,d."Comprobante"
		,m."Direccion"
		,m."Cantidad"
		,m."Direccion"::NUMERIC * m."Cantidad" AS "CantidadConSigno"
		,SUM(m."Direccion"::NUMERIC * m."Cantidad") OVER (
			PARTITION BY m."IdProducto", m."IdUbicacion"
			ORDER BY m."FechaMovimiento", m."Id"
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		) AS "SaldoCorrido"
		/* Trazabilidad de la carga: cuando y quien, contra la fecha contable. */
		,d."FechaCreacion" AS "FechaRegistro"
		,"seg"."FnNombreUsuario"(d."UsuarioCreacion") AS "RegistradoPor"
	FROM "inv"."T_MovimientoStock" m
	JOIN "inv"."T_Producto" p ON p."Id" = m."IdProducto"
	JOIN "inv"."T_Ubicacion" u ON u."Id" = m."IdUbicacion"
	JOIN "inv"."T_DocumentoInventario" d ON d."Id" = m."IdDocumentoInventario";

/* ── Reporte de movimientos ───────────────────────────────────────────── */
CREATE OR REPLACE VIEW "inv"."V_Reporte_Movimiento"
WITH (security_invoker = true) AS
	SELECT
		m."Id" AS "IdMovimiento"
		,m."FechaMovimiento"
		,d."TipoDocumento"
		,d."NumeroDocumento"
		,d."Comprobante"
		,p."Id" AS "IdProducto"
		,p."Sku"
		,p."Nombre" AS "NombreProducto"
		,c."Id" AS "IdCategoria"
		,c."Nombre" AS "NombreCategoria"
		,ub."Id" AS "IdUbicacion"
		,ub."Nombre" AS "NombreUbicacion"
		,pr."Id" AS "IdProveedor"
		,pr."Nombre" AS "NombreProveedor"
		,ve."Id" AS "IdVehiculo"
		,ve."Placa"
		,eq."Id" AS "IdEquipo"
		,eq."Nombre" AS "NombreEquipo"
		,m."Direccion"
		,m."Cantidad"
		,m."Direccion"::NUMERIC * m."Cantidad" AS "CantidadConSigno"
		,m."CostoUnitario"
		,m."Cantidad" * COALESCE(m."CostoUnitario", 0::NUMERIC) AS "ValorMovimiento"
		,d."FechaCreacion" AS "FechaRegistro"
		,"seg"."FnNombreUsuario"(d."UsuarioCreacion") AS "RegistradoPor"
	FROM "inv"."T_MovimientoStock" m
	JOIN "inv"."T_Producto" p ON p."Id" = m."IdProducto"
	JOIN "inv"."T_Categoria" c ON c."Id" = p."IdCategoria"
	JOIN "inv"."T_Ubicacion" ub ON ub."Id" = m."IdUbicacion"
	JOIN "inv"."T_DocumentoInventario" d ON d."Id" = m."IdDocumentoInventario"
	LEFT JOIN "inv"."T_Proveedor" pr ON pr."Id" = d."IdProveedor"
	LEFT JOIN "inv"."T_Vehiculo" ve ON ve."Id" = m."IdVehiculo"
	LEFT JOIN "inv"."T_Equipo" eq ON eq."Id" = ve."IdEquipo";
