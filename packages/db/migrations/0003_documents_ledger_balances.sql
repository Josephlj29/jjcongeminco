/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: documentos, detalle, ledger (T_MovimientoStock) y saldos (T_SaldoStock)
	Tipo de Cambio: CREATE - nucleo transaccional del inventario
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: Patron ERP de 3 capas. El ledger es la unica fuente de verdad
	             (append-only). El saldo se deriva y se cachea por trigger.
*/

/* =====================================================================
	inv.T_DocumentoInventario  (cabecera)
	Situacion = estado del flujo del documento (no confundir con Estado de auditoria).
===================================================================== */
CREATE TABLE "inv"."T_DocumentoInventario"
(
	"Id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	"TipoDocumento"       VARCHAR(25)  NOT NULL,
	"NumeroDocumento"     VARCHAR(40),
	"FechaDocumento"      DATE         NOT NULL,
	"IdUbicacionOrigen"   UUID,
	"IdUbicacionDestino"  UUID,
	"IdProveedor"         UUID,
	"Comprobante"         VARCHAR(60),
	"Referencia"          VARCHAR(120),
	"IdVehiculo"          UUID,
	"Situacion"           VARCHAR(15)  NOT NULL DEFAULT 'borrador',
	"Notas"               VARCHAR(500),
	"RutaPdf"             VARCHAR(500),
	"FechaConfirmacion"   TIMESTAMPTZ,
	"Estado"              BOOLEAN      NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)  NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT       NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_DocumentoInventario" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Ubicacion_IdUbicacionOrigen"
		FOREIGN KEY ("IdUbicacionOrigen") REFERENCES "inv"."T_Ubicacion" ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Ubicacion_IdUbicacionDestino"
		FOREIGN KEY ("IdUbicacionDestino") REFERENCES "inv"."T_Ubicacion" ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Proveedor_IdProveedor"
		FOREIGN KEY ("IdProveedor") REFERENCES "inv"."T_Proveedor" ("Id"),
	CONSTRAINT "FK_T_DocumentoInventario_Vehiculo_IdVehiculo"
		FOREIGN KEY ("IdVehiculo") REFERENCES "inv"."T_Vehiculo" ("Id"),
	CONSTRAINT "CHK_T_DocumentoInventario_TipoDocumento_Permitido"
		CHECK ("TipoDocumento" IN ('existencia_inicial','entrada','salida','transferencia','ajuste')),
	CONSTRAINT "CHK_T_DocumentoInventario_Situacion_Permitida"
		CHECK ("Situacion" IN ('borrador','confirmado','anulado')),
	CONSTRAINT "CHK_T_DocumentoInventario_Ubicaciones_PorTipo"
		CHECK
		(
			CASE "TipoDocumento"
				WHEN 'entrada'            THEN "IdUbicacionDestino" IS NOT NULL
				WHEN 'existencia_inicial' THEN "IdUbicacionDestino" IS NOT NULL
				WHEN 'salida'             THEN "IdUbicacionOrigen" IS NOT NULL
				WHEN 'transferencia'      THEN "IdUbicacionOrigen" IS NOT NULL
				                            AND "IdUbicacionDestino" IS NOT NULL
				                            AND "IdUbicacionOrigen" <> "IdUbicacionDestino"
				WHEN 'ajuste'             THEN "IdUbicacionDestino" IS NOT NULL
				                            OR "IdUbicacionOrigen" IS NOT NULL
			END
		)
);

COMMENT ON TABLE "inv"."T_DocumentoInventario" IS 'Cabecera de documentos de inventario (entrada, salida, transferencia, ajuste, existencia inicial).';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Id" IS 'Identificador unico del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."TipoDocumento" IS 'Tipo: existencia_inicial, entrada, salida, transferencia, ajuste.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."NumeroDocumento" IS 'Correlativo interno del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."FechaDocumento" IS 'Fecha del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdUbicacionOrigen" IS 'Ubicacion de salida (salida, transferencia).';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdUbicacionDestino" IS 'Ubicacion de entrada (entrada, transferencia).';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdProveedor" IS 'Proveedor en caso de compra/entrada.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Comprobante" IS 'Numero de factura, boleta o guia.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Referencia" IS 'Referencia libre: orden de trabajo, guia de remision, placa.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."IdVehiculo" IS 'Vehiculo asociado al traslado.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Situacion" IS 'Estado del flujo: borrador, confirmado, anulado.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Notas" IS 'Observaciones del documento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."RutaPdf" IS 'Ruta del PDF generado en Supabase Storage.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."FechaConfirmacion" IS 'Momento en que el documento fue confirmado.';
COMMENT ON COLUMN "inv"."T_DocumentoInventario"."Estado" IS 'Estado de auditoria: activo o inactivo.';

CREATE INDEX "IX_T_DocumentoInventario_TipoFecha" ON "inv"."T_DocumentoInventario" ("TipoDocumento","FechaDocumento");
CREATE INDEX "IX_T_DocumentoInventario_IdUbicacionOrigen" ON "inv"."T_DocumentoInventario" ("IdUbicacionOrigen");
CREATE INDEX "IX_T_DocumentoInventario_IdUbicacionDestino" ON "inv"."T_DocumentoInventario" ("IdUbicacionDestino");
CREATE INDEX "IX_T_DocumentoInventario_Situacion" ON "inv"."T_DocumentoInventario" ("Situacion");

CREATE TRIGGER "TR_T_DocumentoInventario_Auditoria"
	BEFORE UPDATE ON "inv"."T_DocumentoInventario"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_DocumentoInventarioDetalle  (lineas)
===================================================================== */
CREATE TABLE "inv"."T_DocumentoInventarioDetalle"
(
	"Id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdDocumentoInventario" UUID          NOT NULL,
	"IdProducto"            UUID          NOT NULL,
	"Cantidad"              NUMERIC(14,3) NOT NULL,
	"CostoUnitario"         NUMERIC(14,4),
	"Notas"                 VARCHAR(300),
	"Estado"                BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"       VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"   VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"            BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"           UUID,
	CONSTRAINT "PK_T_DocumentoInventarioDetalle" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_DocumentoInventarioDetalle_DocumentoInventario_IdDocumentoInventario"
		FOREIGN KEY ("IdDocumentoInventario") REFERENCES "inv"."T_DocumentoInventario" ("Id") ON DELETE CASCADE,
	CONSTRAINT "FK_T_DocumentoInventarioDetalle_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "CHK_T_DocumentoInventarioDetalle_Cantidad_MayorACero"
		CHECK ("Cantidad" > 0)
);

COMMENT ON TABLE "inv"."T_DocumentoInventarioDetalle" IS 'Lineas de un documento de inventario.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."Id" IS 'Identificador unico de la linea.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."IdDocumentoInventario" IS 'Documento al que pertenece la linea.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."IdProducto" IS 'Producto movido.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."Cantidad" IS 'Cantidad positiva del movimiento.';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."CostoUnitario" IS 'Costo unitario opcional (valorizacion futura).';
COMMENT ON COLUMN "inv"."T_DocumentoInventarioDetalle"."Notas" IS 'Observaciones de la linea.';

CREATE INDEX "IX_T_DocumentoInventarioDetalle_IdDocumentoInventario" ON "inv"."T_DocumentoInventarioDetalle" ("IdDocumentoInventario");
CREATE INDEX "IX_T_DocumentoInventarioDetalle_IdProducto" ON "inv"."T_DocumentoInventarioDetalle" ("IdProducto");

CREATE TRIGGER "TR_T_DocumentoInventarioDetalle_Auditoria"
	BEFORE UPDATE ON "inv"."T_DocumentoInventarioDetalle"
	FOR EACH ROW EXECUTE FUNCTION "comun"."FnAuditoriaActualizacion"();

/* =====================================================================
	inv.T_MovimientoStock  (LEDGER inmutable, append-only)
	Direccion: +1 entra, -1 sale. Una transferencia genera 2 filas.
===================================================================== */
CREATE TABLE "inv"."T_MovimientoStock"
(
	"Id"                          UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdDocumentoInventarioDetalle" UUID         NOT NULL,
	"IdDocumentoInventario"       UUID          NOT NULL,
	"IdProducto"                  UUID          NOT NULL,
	"IdUbicacion"                 UUID          NOT NULL,
	"Direccion"                   SMALLINT      NOT NULL,
	"Cantidad"                    NUMERIC(14,3) NOT NULL,
	"CostoUnitario"               NUMERIC(14,4),
	"FechaMovimiento"             DATE          NOT NULL,
	"Estado"                      BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"             VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion"         VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"                  BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"                 UUID,
	CONSTRAINT "PK_T_MovimientoStock" PRIMARY KEY ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_DocumentoInventarioDetalle_IdDocumentoInventarioDetalle"
		FOREIGN KEY ("IdDocumentoInventarioDetalle") REFERENCES "inv"."T_DocumentoInventarioDetalle" ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_DocumentoInventario_IdDocumentoInventario"
		FOREIGN KEY ("IdDocumentoInventario") REFERENCES "inv"."T_DocumentoInventario" ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "FK_T_MovimientoStock_Ubicacion_IdUbicacion"
		FOREIGN KEY ("IdUbicacion") REFERENCES "inv"."T_Ubicacion" ("Id"),
	CONSTRAINT "CHK_T_MovimientoStock_Direccion_Permitida"
		CHECK ("Direccion" IN (-1, 1)),
	CONSTRAINT "CHK_T_MovimientoStock_Cantidad_MayorACero"
		CHECK ("Cantidad" > 0)
);

COMMENT ON TABLE "inv"."T_MovimientoStock" IS 'Ledger append-only. Unica fuente de verdad. Para revertir se anula el documento (movimientos inversos).';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."Id" IS 'Identificador unico del movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdDocumentoInventarioDetalle" IS 'Linea de documento que origino el movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdDocumentoInventario" IS 'Documento que origino el movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdProducto" IS 'Producto movido.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."IdUbicacion" IS 'Ubicacion afectada por el movimiento.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."Direccion" IS 'Sentido del movimiento: 1 entra, -1 sale.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."Cantidad" IS 'Cantidad positiva movida.';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."CostoUnitario" IS 'Costo unitario opcional (valorizacion futura).';
COMMENT ON COLUMN "inv"."T_MovimientoStock"."FechaMovimiento" IS 'Fecha contable del movimiento.';

CREATE INDEX "IX_T_MovimientoStock_ProductoUbicacionFecha" ON "inv"."T_MovimientoStock" ("IdProducto","IdUbicacion","FechaMovimiento");
CREATE INDEX "IX_T_MovimientoStock_UbicacionFecha" ON "inv"."T_MovimientoStock" ("IdUbicacion","FechaMovimiento");
CREATE INDEX "IX_T_MovimientoStock_IdDocumentoInventario" ON "inv"."T_MovimientoStock" ("IdDocumentoInventario");

/* =====================================================================
	inv.T_SaldoStock  (cache de saldos por producto + ubicacion)
	PK surrogate "Id" + clave natural unica (BSG: PK Id + UQ del par natural).
===================================================================== */
CREATE TABLE "inv"."T_SaldoStock"
(
	"Id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
	"IdProducto"          UUID          NOT NULL,
	"IdUbicacion"         UUID          NOT NULL,
	"CantidadDisponible"  NUMERIC(14,3) NOT NULL DEFAULT 0,
	"Estado"              BOOLEAN       NOT NULL DEFAULT TRUE,
	"UsuarioCreacion"     VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"UsuarioModificacion" VARCHAR(50)   NOT NULL DEFAULT 'Sistema',
	"FechaCreacion"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"FechaModificacion"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	"RowVersion"          BIGINT        NOT NULL DEFAULT 0,
	"IdMigracion"         UUID,
	CONSTRAINT "PK_T_SaldoStock" PRIMARY KEY ("Id"),
	CONSTRAINT "UQ_T_SaldoStock_IdProducto_IdUbicacion" UNIQUE ("IdProducto","IdUbicacion"),
	CONSTRAINT "FK_T_SaldoStock_Producto_IdProducto"
		FOREIGN KEY ("IdProducto") REFERENCES "inv"."T_Producto" ("Id"),
	CONSTRAINT "FK_T_SaldoStock_Ubicacion_IdUbicacion"
		FOREIGN KEY ("IdUbicacion") REFERENCES "inv"."T_Ubicacion" ("Id")
);

COMMENT ON TABLE "inv"."T_SaldoStock" IS 'Cache de saldo por producto y ubicacion. Mantenido por trigger desde el ledger.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."Id" IS 'Identificador unico del saldo.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."IdProducto" IS 'Producto del saldo.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."IdUbicacion" IS 'Ubicacion del saldo.';
COMMENT ON COLUMN "inv"."T_SaldoStock"."CantidadDisponible" IS 'Cantidad disponible cacheada (derivada del ledger).';

/* ---------------------------------------------------------------------
	Al insertar un movimiento, actualiza el saldo cacheado (upsert).
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnAplicarMovimientoSaldo"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO "inv"."T_SaldoStock"
	(
		"IdProducto"
		,"IdUbicacion"
		,"CantidadDisponible"
	)
	VALUES
	(
		NEW."IdProducto"
		,NEW."IdUbicacion"
		,NEW."Direccion" * NEW."Cantidad"
	)
	ON CONFLICT ("IdProducto","IdUbicacion") DO UPDATE
		SET "CantidadDisponible" = "inv"."T_SaldoStock"."CantidadDisponible" + (NEW."Direccion" * NEW."Cantidad")
			,"FechaModificacion" = NOW()
			,"RowVersion" = "inv"."T_SaldoStock"."RowVersion" + 1;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "TR_T_MovimientoStock_AplicarSaldo"
	AFTER INSERT ON "inv"."T_MovimientoStock"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnAplicarMovimientoSaldo"();

/* ---------------------------------------------------------------------
	Bloquea UPDATE/DELETE del ledger (inmutabilidad real).
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnRechazarMutacionLedger"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'T_MovimientoStock es inmutable (append-only). Para revertir, anule el documento.';
END;
$$;

CREATE TRIGGER "TR_T_MovimientoStock_BloquearUpdate"
	BEFORE UPDATE ON "inv"."T_MovimientoStock"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnRechazarMutacionLedger"();

CREATE TRIGGER "TR_T_MovimientoStock_BloquearDelete"
	BEFORE DELETE ON "inv"."T_MovimientoStock"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnRechazarMutacionLedger"();

/* ---------------------------------------------------------------------
	Confirma un documento en borrador: explota sus lineas en el ledger.
--------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION "inv"."FnConfirmarDocumentoInventario"
(
	"PIdDocumentoInventario" UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vDocumento" "inv"."T_DocumentoInventario";
	"vDetalle"   "inv"."T_DocumentoInventarioDetalle";
BEGIN
	SELECT * INTO "vDocumento"
	FROM "inv"."T_DocumentoInventario"
	WHERE "Id" = "PIdDocumentoInventario"
	FOR UPDATE;

	IF "vDocumento" IS NULL THEN
		RAISE EXCEPTION 'El documento % no existe.', "PIdDocumentoInventario";
	END IF;

	IF "vDocumento"."Situacion" <> 'borrador' THEN
		RAISE EXCEPTION 'Solo se confirman documentos en borrador (situacion actual: %).', "vDocumento"."Situacion";
	END IF;

	FOR "vDetalle" IN
		SELECT * FROM "inv"."T_DocumentoInventarioDetalle"
		WHERE "IdDocumentoInventario" = "PIdDocumentoInventario"
	LOOP
		IF "vDocumento"."IdUbicacionOrigen" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('salida','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle"
				,"IdDocumentoInventario"
				,"IdProducto"
				,"IdUbicacion"
				,"Direccion"
				,"Cantidad"
				,"CostoUnitario"
				,"FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id"
				,"vDocumento"."Id"
				,"vDetalle"."IdProducto"
				,"vDocumento"."IdUbicacionOrigen"
				,-1
				,"vDetalle"."Cantidad"
				,"vDetalle"."CostoUnitario"
				,"vDocumento"."FechaDocumento"
			);
		END IF;

		IF "vDocumento"."IdUbicacionDestino" IS NOT NULL
		   AND "vDocumento"."TipoDocumento" IN ('entrada','existencia_inicial','transferencia','ajuste') THEN
			INSERT INTO "inv"."T_MovimientoStock"
			(
				"IdDocumentoInventarioDetalle"
				,"IdDocumentoInventario"
				,"IdProducto"
				,"IdUbicacion"
				,"Direccion"
				,"Cantidad"
				,"CostoUnitario"
				,"FechaMovimiento"
			)
			VALUES
			(
				"vDetalle"."Id"
				,"vDocumento"."Id"
				,"vDetalle"."IdProducto"
				,"vDocumento"."IdUbicacionDestino"
				,1
				,"vDetalle"."Cantidad"
				,"vDetalle"."CostoUnitario"
				,"vDocumento"."FechaDocumento"
			);
		END IF;
	END LOOP;

	UPDATE "inv"."T_DocumentoInventario"
	SET "Situacion" = 'confirmado'
		,"FechaConfirmacion" = NOW()
	WHERE "Id" = "PIdDocumentoInventario";
END;
$$;

COMMENT ON FUNCTION "inv"."FnConfirmarDocumentoInventario"(UUID) IS 'Confirma un documento borrador: genera el ledger desde sus lineas y lo marca confirmado.';