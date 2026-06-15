/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_ProveedorCuentaBancaria + inv.FnGuardarProveedor + inv.V_Proveedor
	Tipo de Cambio: CREATE - datos bancarios del proveedor (1:N)
	Autor: Equipo Desarrollo
	Fecha: 2026-06-15
	Descripcion: Un proveedor puede tener VARIAS cuentas bancarias (soles, dolares,
	             detracciones...). Se modela en una tabla hija 1:N. FnGuardarProveedor
	             crea/edita el proveedor y reemplaza sus cuentas en una sola
	             transaccion (mismo patron que FnGuardarProducto). V_Proveedor expone
	             cada proveedor con sus cuentas embebidas en un arreglo JSON.
*/

/* 1. Tabla de cuentas bancarias ---------------------------------------- */
CREATE TABLE "inv"."T_ProveedorCuentaBancaria"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"IdProveedor"         UUID         NOT NULL,
	"Banco"               VARCHAR(80)  NOT NULL,
	"TipoCuenta"          VARCHAR(15)  NOT NULL DEFAULT 'corriente',
	"NumeroCuenta"        VARCHAR(40)  NOT NULL,
	"Cci"                 VARCHAR(25),
	"Moneda"              VARCHAR(3)   NOT NULL DEFAULT 'PEN',
	"TitularCuenta"       VARCHAR(150),
	"EsPrincipal"         BOOLEAN      NOT NULL DEFAULT FALSE,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_ProveedorCuentaBancaria" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_ProveedorCuentaBancaria_Proveedor_IdProveedor"
		FOREIGN KEY ("IdProveedor") REFERENCES "inv"."T_Proveedor" ("Id") ON DELETE CASCADE,
	CONSTRAINT "CHK_T_ProveedorCuentaBancaria_TipoCuenta_Permitido"
		CHECK ("TipoCuenta" IN ('corriente','ahorros')),
	CONSTRAINT "CHK_T_ProveedorCuentaBancaria_Moneda_Permitida"
		CHECK ("Moneda" IN ('PEN','USD'))
);

COMMENT ON TABLE "inv"."T_ProveedorCuentaBancaria" IS 'Cuentas bancarias del proveedor (1:N): banco, tipo, numero, CCI, moneda.';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."IdProveedor" IS 'Proveedor dueño de la cuenta.';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."Banco" IS 'Nombre del banco (BCP, BBVA, Interbank...).';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."TipoCuenta" IS 'corriente o ahorros.';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."NumeroCuenta" IS 'Numero de cuenta del banco.';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."Cci" IS 'Codigo de Cuenta Interbancario (20 digitos).';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."Moneda" IS 'PEN o USD.';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."TitularCuenta" IS 'Titular si difiere de la razon social.';
COMMENT ON COLUMN "inv"."T_ProveedorCuentaBancaria"."EsPrincipal" IS 'Cuenta preferida para pagos.';

CREATE INDEX "IX_T_ProveedorCuentaBancaria_IdProveedor" ON "inv"."T_ProveedorCuentaBancaria" ("IdProveedor");

CREATE TRIGGER "TR_T_ProveedorCuentaBancaria_Auditoria"
	BEFORE UPDATE ON "inv"."T_ProveedorCuentaBancaria"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

ALTER TABLE "inv"."T_ProveedorCuentaBancaria" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LecturaAutenticado" ON "inv"."T_ProveedorCuentaBancaria"
	FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

CREATE POLICY "ProveedorCuentaEscritura" ON "inv"."T_ProveedorCuentaBancaria"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/* 2. Alta/edicion atomica del proveedor + sus cuentas ------------------ */
CREATE OR REPLACE FUNCTION "inv"."FnGuardarProveedor"
(
	"PProveedor" JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	"vId"      UUID;
	"vUsuario" VARCHAR(50);
BEGIN
	"vUsuario" = COALESCE(auth.uid()::TEXT, 'API');
	"vId"      = NULLIF("PProveedor"->>'Id', '')::UUID;

	IF "vId" IS NULL THEN
		INSERT INTO "inv"."T_Proveedor"
			("Ruc","Nombre","Contacto","Telefono","UsuarioCreacion","UsuarioModificacion")
		VALUES
		(
			NULLIF("PProveedor"->>'Ruc', ''),
			"PProveedor"->>'Nombre',
			NULLIF("PProveedor"->>'Contacto', ''),
			NULLIF("PProveedor"->>'Telefono', ''),
			"vUsuario", "vUsuario"
		)
		RETURNING "Id" INTO "vId";
	ELSE
		UPDATE "inv"."T_Proveedor"
		SET "Ruc"                 = NULLIF("PProveedor"->>'Ruc', ''),
			"Nombre"              = "PProveedor"->>'Nombre',
			"Contacto"            = NULLIF("PProveedor"->>'Contacto', ''),
			"Telefono"            = NULLIF("PProveedor"->>'Telefono', ''),
			"UsuarioModificacion" = "vUsuario"
		WHERE "Id" = "vId";

		IF NOT FOUND THEN
			RAISE EXCEPTION 'El proveedor no existe.';
		END IF;
	END IF;

	/* Reemplaza las cuentas (delete + insert). Ignora filas sin banco ni numero. */
	DELETE FROM "inv"."T_ProveedorCuentaBancaria" WHERE "IdProveedor" = "vId";

	INSERT INTO "inv"."T_ProveedorCuentaBancaria"
		("IdProveedor","Banco","TipoCuenta","NumeroCuenta","Cci","Moneda","TitularCuenta","EsPrincipal","UsuarioCreacion","UsuarioModificacion")
	SELECT
		"vId",
		TRIM(c->>'Banco'),
		COALESCE(NULLIF(c->>'TipoCuenta',''), 'corriente'),
		TRIM(c->>'NumeroCuenta'),
		NULLIF(TRIM(c->>'Cci'), ''),
		COALESCE(NULLIF(c->>'Moneda',''), 'PEN'),
		NULLIF(TRIM(c->>'TitularCuenta'), ''),
		COALESCE((c->>'EsPrincipal')::BOOLEAN, FALSE),
		"vUsuario", "vUsuario"
	FROM JSONB_ARRAY_ELEMENTS(COALESCE("PProveedor"->'Cuentas', '[]'::JSONB)) AS c
	WHERE NULLIF(TRIM(c->>'Banco'), '') IS NOT NULL
	   OR NULLIF(TRIM(c->>'NumeroCuenta'), '') IS NOT NULL;

	RETURN "vId";
END;
$$;

COMMENT ON FUNCTION "inv"."FnGuardarProveedor"(JSONB) IS 'Crea (sin Id) o edita (con Id) un proveedor y reemplaza sus cuentas bancarias en una transaccion.';

/* 3. Vista del proveedor con sus cuentas embebidas -------------------- */
CREATE OR REPLACE VIEW "inv"."V_Proveedor" AS
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

COMMENT ON VIEW "inv"."V_Proveedor" IS 'Proveedor activo con sus cuentas bancarias embebidas (arreglo JSON).';
