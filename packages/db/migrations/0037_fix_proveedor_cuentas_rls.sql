/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: RLS de inv.T_ProveedorCuentaBancaria + inv.V_Proveedor (REPLACE)
	Tipo de Cambio: REPLACE - seguridad de datos sensibles (auditoria QA)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-16
	Descripcion: HALLAZGO A1 — los datos bancarios de los proveedores (Banco, CCI,
	             NumeroCuenta, Titular) eran legibles por CUALQUIER usuario autenticado
	             (policy LecturaAutenticado = FnRolUsuario() IS NOT NULL) y la vista
	             V_Proveedor NO tenia security_invoker, por lo que servia las cuentas
	             saltandose la RLS de la tabla. Con los esquemas expuestos en PostgREST,
	             un almacenero podia leer todas las cuentas con su JWT.
	             Decision de negocio: solo 'admin' y 'gerencia' ven y gestionan datos
	             bancarios. Se alinean lectura y escritura, y la vista pasa a
	             security_invoker para respetar la RLS de la tabla en el campo Cuentas.
*/

/* 1. Lectura: solo roles financieros ----------------------------------- */
DROP POLICY IF EXISTS "LecturaAutenticado" ON "inv"."T_ProveedorCuentaBancaria";

CREATE POLICY "LecturaFinanciera" ON "inv"."T_ProveedorCuentaBancaria"
	FOR SELECT USING ("seg"."FnRolUsuario"() IN ('admin','gerencia'));

/* 2. Escritura: sale 'almacenero', queda admin/gerencia ---------------- */
DROP POLICY IF EXISTS "ProveedorCuentaEscritura" ON "inv"."T_ProveedorCuentaBancaria";

CREATE POLICY "ProveedorCuentaEscritura" ON "inv"."T_ProveedorCuentaBancaria"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','gerencia'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','gerencia'));

/* 3. V_Proveedor con security_invoker: el campo Cuentas respeta la RLS -- */
CREATE OR REPLACE VIEW "inv"."V_Proveedor"
WITH (security_invoker = true) AS
SELECT
	p."Id",
	p."Ruc",
	p."Nombre",
	p."Contacto",
	p."Telefono",
	p."Estado",
	COALESCE(
		(
			SELECT JSONB_AGG(
				JSONB_BUILD_OBJECT(
					'Id', c."Id",
					'Banco', c."Banco",
					'TipoCuenta', c."TipoCuenta",
					'NumeroCuenta', c."NumeroCuenta",
					'Cci', c."Cci",
					'Moneda', c."Moneda",
					'TitularCuenta', c."TitularCuenta",
					'EsPrincipal', c."EsPrincipal"
				)
				ORDER BY c."EsPrincipal" DESC, c."Banco"
			)
			FROM "inv"."T_ProveedorCuentaBancaria" c
			WHERE c."IdProveedor" = p."Id" AND c."Estado" = TRUE
		),
		'[]'::JSONB
	) AS "Cuentas"
FROM "inv"."T_Proveedor" p
WHERE p."Estado" = TRUE;

COMMENT ON VIEW "inv"."V_Proveedor" IS 'Proveedor activo con sus cuentas bancarias embebidas. security_invoker: el campo Cuentas respeta la RLS de T_ProveedorCuentaBancaria (solo admin/gerencia ven datos bancarios).';