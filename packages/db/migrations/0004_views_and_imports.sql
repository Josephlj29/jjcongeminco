/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: vistas de reporte y T_Importacion
	Tipo de Cambio: CREATE - reportes y auditoria de cargas
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Vistas de reconciliacion, kardex y stock; tabla de auditoria de carga masiva.
*/

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Saldo recalculado desde el ledger. Sirve para auditar el cache T_SaldoStock.
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_SaldoReconciliacion" AS
	SELECT
		M."IdProducto"
		,M."IdUbicacion"
		,SUM(M."Direccion" * M."Cantidad") AS "CantidadDisponible"
	FROM
		"inv"."T_MovimientoStock" M
	GROUP BY
		M."IdProducto"
		,M."IdUbicacion";

COMMENT ON VIEW "inv"."V_MovimientoStock_SaldoReconciliacion" IS 'Saldo recalculado desde el ledger para auditar el cache T_SaldoStock.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Kardex detallado con saldo corrido por producto y ubicacion.
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_Kardex" AS
	SELECT
		M."Id" AS "IdMovimientoStock"
		,M."IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,M."IdUbicacion"
		,U."Nombre" AS "NombreUbicacion"
		,M."FechaMovimiento"
		,D."TipoDocumento"
		,D."NumeroDocumento"
		,D."Comprobante"
		,M."Direccion"
		,M."Cantidad"
		,(M."Direccion" * M."Cantidad") AS "CantidadConSigno"
		,SUM(M."Direccion" * M."Cantidad") OVER
			(
				PARTITION BY M."IdProducto", M."IdUbicacion"
				ORDER BY M."FechaMovimiento", M."Id"
				ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
			) AS "SaldoCorrido"
	FROM
		"inv"."T_MovimientoStock" M
	INNER JOIN "inv"."T_Producto" P ON P."Id" = M."IdProducto"
	INNER JOIN "inv"."T_Ubicacion" U ON U."Id" = M."IdUbicacion"
	INNER JOIN "inv"."T_DocumentoInventario" D ON D."Id" = M."IdDocumentoInventario";

COMMENT ON VIEW "inv"."V_MovimientoStock_Kardex" IS 'Kardex con saldo corrido (running balance) por producto y ubicacion.';

-- =============================================
-- Author: Equipo Desarrollo
-- Fecha Creacion: 2026-06-07
-- Descripcion: Saldo total por producto y alerta de stock bajo minimo para el dashboard.
-- =============================================
CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado" AS
	SELECT
		P."Id" AS "IdProducto"
		,P."Sku"
		,P."Nombre" AS "NombreProducto"
		,C."Nombre" AS "NombreCategoria"
		,UM."Codigo" AS "CodigoUnidad"
		,P."StockMinimo"
		,COALESCE(SUM(S."CantidadDisponible"), 0) AS "StockTotal"
		,COALESCE(SUM(S."CantidadDisponible"), 0) < P."StockMinimo" AS "BajoMinimo"
	FROM
		"inv"."T_Producto" P
	INNER JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	INNER JOIN "inv"."T_UnidadMedida" UM ON UM."Id" = P."IdUnidadMedida"
	LEFT JOIN "inv"."T_SaldoStock" S ON S."IdProducto" = P."Id"
	WHERE
		P."Estado" = TRUE
	GROUP BY
		P."Id"
		,P."Sku"
		,P."Nombre"
		,C."Nombre"
		,UM."Codigo"
		,P."StockMinimo";

COMMENT ON VIEW "inv"."V_Producto_StockConsolidado" IS 'Saldo total por producto con alerta BajoMinimo para el dashboard de reorden.';

/* =====================================================================
	inv.T_Importacion  (auditoria de carga masiva Excel/CSV)
===================================================================== */
CREATE TABLE "inv"."T_Importacion"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"NombreArchivo"       VARCHAR(255) NOT NULL,
	"Objetivo"            VARCHAR(20)  NOT NULL,
	"Situacion"           VARCHAR(20)  NOT NULL DEFAULT 'procesando',
	"CantidadFilas"       INTEGER      NOT NULL DEFAULT 0,
	"CantidadCorrectas"   INTEGER      NOT NULL DEFAULT 0,
	"LogErrores"          JSONB        NOT NULL DEFAULT '[]',
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_Importacion" PRIMARY KEY ("Id"),
	CONSTRAINT "CHK_T_Importacion_Objetivo_Permitido"
		CHECK ("Objetivo" IN ('productos','movimientos')),
	CONSTRAINT "CHK_T_Importacion_Situacion_Permitida"
		CHECK ("Situacion" IN ('procesando','completado','con_errores','fallido'))
);

COMMENT ON TABLE "inv"."T_Importacion" IS 'Auditoria de cargas masivas Excel/CSV (productos o movimientos).';
COMMENT ON COLUMN "inv"."T_Importacion"."Id" IS 'Identificador unico de la importacion.';
COMMENT ON COLUMN "inv"."T_Importacion"."NombreArchivo" IS 'Nombre del archivo cargado.';
COMMENT ON COLUMN "inv"."T_Importacion"."Objetivo" IS 'Que se cargo: productos o movimientos.';
COMMENT ON COLUMN "inv"."T_Importacion"."Situacion" IS 'Estado del proceso: procesando, completado, con_errores, fallido.';
COMMENT ON COLUMN "inv"."T_Importacion"."CantidadFilas" IS 'Total de filas leidas del archivo.';
COMMENT ON COLUMN "inv"."T_Importacion"."CantidadCorrectas" IS 'Filas procesadas correctamente.';
COMMENT ON COLUMN "inv"."T_Importacion"."LogErrores" IS 'Detalle de errores por fila en JSON.';

CREATE INDEX "IX_T_Importacion_FechaCreacion" ON "inv"."T_Importacion" ("FechaCreacion" DESC);

CREATE TRIGGER "TR_T_Importacion_Auditoria"
	BEFORE UPDATE ON "inv"."T_Importacion"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();