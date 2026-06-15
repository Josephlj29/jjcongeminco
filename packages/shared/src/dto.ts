import { z } from "zod";

/* Tipos de documento de inventario (coinciden con CHK_T_DocumentoInventario_TipoDocumento_Permitido). */
export const TIPO_DOCUMENTO = [
  "existencia_inicial",
  "entrada",
  "salida",
  "transferencia",
  "ajuste",
] as const;
export type TipoDocumento = (typeof TIPO_DOCUMENTO)[number];

/* Máximo de imágenes por producto (regla de aplicación, no de BD). */
export const MAX_IMAGENES_PRODUCTO = 3;

/* ─── Producto ─── */
export const CrearProductoSchema = z.object({
  Sku: z.string().min(1).max(50),
  Nombre: z.string().min(1).max(200),
  IdCategoria: z.string().uuid(),
  IdUnidadMedida: z.string().uuid(),
  StockMinimo: z.number().nonnegative().default(0),
  CodigoBarra: z.string().max(50).optional(),
  // Código del producto en el proveedor (el que se brinda al comprar). Distinto
  // del código de barras.
  CodigoProductoProveedor: z.string().max(60).optional(),
  Atributos: z.record(z.unknown()).default({}),
  // Compatibilidad por tipo de equipo (fitment del producto).
  // EsGeneral = aplica a todos los tipos; en ese caso IdsTipoEquipo va vacío.
  // La invariante (general XOR ≥1 tipo) la valida la BD (FnGuardarProducto).
  EsGeneral: z.boolean().default(false),
  IdsTipoEquipo: z.array(z.string().uuid()).default([]),
});
export type CrearProducto = z.infer<typeof CrearProductoSchema>;

/* ─── Imagen de producto ─── */
export const CrearImagenProductoSchema = z.object({
  Url: z.string().url().max(500),
  Orden: z.number().int().positive().max(MAX_IMAGENES_PRODUCTO).default(1),
  EsPrincipal: z.boolean().default(false),
});
export type CrearImagenProducto = z.infer<typeof CrearImagenProductoSchema>;

export const ActualizarProductoSchema = CrearProductoSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarProducto = z.infer<typeof ActualizarProductoSchema>;

/* ─── Documento de inventario (cabecera + detalle) ─── */
export const DetalleDocumentoSchema = z.object({
  IdProducto: z.string().uuid(),
  Cantidad: z.number().positive(),
  CostoUnitario: z.number().nonnegative().optional(),
  Notas: z.string().max(300).optional(),
});

export const CrearDocumentoSchema = z
  .object({
    TipoDocumento: z.enum(TIPO_DOCUMENTO),
    FechaDocumento: z.string().date(),
    NumeroDocumento: z.string().max(40).optional(),
    IdUbicacionOrigen: z.string().uuid().optional(),
    IdUbicacionDestino: z.string().uuid().optional(),
    IdProveedor: z.string().uuid().optional(),
    Comprobante: z.string().max(60).optional(),
    Referencia: z.string().max(120).optional(),
    IdVehiculo: z.string().uuid().optional(),
    Notas: z.string().max(500).optional(),
    Detalle: z.array(DetalleDocumentoSchema).min(1),
  })
  .refine(
    (d) =>
      d.TipoDocumento === "transferencia"
        ? d.IdUbicacionOrigen && d.IdUbicacionDestino && d.IdUbicacionOrigen !== d.IdUbicacionDestino
        : true,
    { message: "Una transferencia requiere origen y destino distintos." },
  )
  .refine((d) => (d.TipoDocumento === "salida" ? !!d.IdVehiculo : true), {
    message: "Una salida debe registrarse contra una placa exacta (IdVehiculo).",
  });
export type CrearDocumento = z.infer<typeof CrearDocumentoSchema>;

/* ─── Proveedor ─── */
export const TIPO_CUENTA = ["corriente", "ahorros"] as const;
export type TipoCuenta = (typeof TIPO_CUENTA)[number];
export const MONEDA_CUENTA = ["PEN", "USD"] as const;
export type MonedaCuenta = (typeof MONEDA_CUENTA)[number];

/* Cuenta bancaria de un proveedor (1:N). Id presente = cuenta existente. */
export const CuentaBancariaSchema = z.object({
  Id: z.string().uuid().optional(),
  Banco: z.string().trim().min(1, "Indica el banco.").max(80),
  TipoCuenta: z.enum(TIPO_CUENTA).default("corriente"),
  NumeroCuenta: z.string().trim().min(1, "Indica el número de cuenta.").max(40),
  Cci: z.string().trim().max(25).optional(),
  Moneda: z.enum(MONEDA_CUENTA).default("PEN"),
  TitularCuenta: z.string().trim().max(150).optional(),
  EsPrincipal: z.boolean().default(false),
});
export type CuentaBancariaForm = z.infer<typeof CuentaBancariaSchema>;

export const CrearProveedorSchema = z.object({
  Ruc: z.string().max(15).optional(),
  Nombre: z.string().min(1).max(150),
  Contacto: z.string().max(120).optional(),
  Telefono: z.string().max(20).optional(),
  Cuentas: z.array(CuentaBancariaSchema).default([]),
});
export type CrearProveedor = z.infer<typeof CrearProveedorSchema>;
export const ActualizarProveedorSchema = CrearProveedorSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarProveedor = z.infer<typeof ActualizarProveedorSchema>;

/* ─── Ubicación / Almacén ─── */
export const TIPO_UBICACION = ["almacen_central", "proyecto", "otro"] as const;
export type TipoUbicacion = (typeof TIPO_UBICACION)[number];

export const CrearUbicacionSchema = z.object({
  Codigo: z.string().min(1).max(20),
  Nombre: z.string().min(1).max(120),
  Tipo: z.enum(TIPO_UBICACION).default("proyecto"),
  Direccion: z.string().max(200).optional(),
});
export type CrearUbicacion = z.infer<typeof CrearUbicacionSchema>;
export const ActualizarUbicacionSchema = CrearUbicacionSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarUbicacion = z.infer<typeof ActualizarUbicacionSchema>;

/* ─── Categoría / familia (jerárquica: IdCategoriaPadre opcional) ─── */
export const CrearCategoriaSchema = z.object({
  Codigo: z.string().min(1).max(20),
  Nombre: z.string().min(1).max(80),
  Descripcion: z.string().max(200).optional(),
  // Padre opcional: sin padre = familia raíz. Referencia por Id (FK).
  IdCategoriaPadre: z.string().uuid().optional(),
});
export type CrearCategoria = z.infer<typeof CrearCategoriaSchema>;
export const ActualizarCategoriaSchema = CrearCategoriaSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarCategoria = z.infer<typeof ActualizarCategoriaSchema>;

/* ─── Cargo (catálogo de cargos del personal) ─── */
export const CrearCargoSchema = z.object({
  Codigo: z.string().min(1).max(20),
  Nombre: z.string().min(1).max(80),
  Descripcion: z.string().max(200).optional(),
});
export type CrearCargo = z.infer<typeof CrearCargoSchema>;
export const ActualizarCargoSchema = CrearCargoSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarCargo = z.infer<typeof ActualizarCargoSchema>;

/* ─── Personal (solicitantes; login opcional vía IdUsuario) ─── */
export const CrearPersonalSchema = z.object({
  NombreCompleto: z.string().min(1).max(150),
  Dni: z.string().max(15).optional(),
  Telefono: z.string().max(20).optional(),
  IdCargo: z.string().uuid({ message: "Elige un cargo." }),
  // null = desvincular (en edición); undefined = no tocar; uuid = vincular.
  IdUsuario: z.string().uuid().nullable().optional(),
});
export type CrearPersonal = z.infer<typeof CrearPersonalSchema>;
export const ActualizarPersonalSchema = CrearPersonalSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarPersonal = z.infer<typeof ActualizarPersonalSchema>;

/* ─── Tipo de equipo ─── */
export const CrearTipoEquipoSchema = z.object({
  Codigo: z.string().min(1).max(20),
  Nombre: z.string().min(1).max(120),
  Descripcion: z.string().max(200).optional(),
});
export type CrearTipoEquipo = z.infer<typeof CrearTipoEquipoSchema>;
export const ActualizarTipoEquipoSchema = CrearTipoEquipoSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarTipoEquipo = z.infer<typeof ActualizarTipoEquipoSchema>;

/* Asociación masiva: todos los productos de una categoría a un tipo */
export const AsociarCategoriaTipoEquipoSchema = z.object({
  IdCategoria: z.string().uuid(),
});
export type AsociarCategoriaTipoEquipo = z.infer<typeof AsociarCategoriaTipoEquipoSchema>;

/* ─── Equipo ─── */
export const CrearEquipoSchema = z.object({
  Codigo: z.string().min(1).max(20),
  Nombre: z.string().min(1).max(120),
  Descripcion: z.string().max(200).optional(),
  IdTipoEquipo: z.string().uuid().optional(),
});
export type CrearEquipo = z.infer<typeof CrearEquipoSchema>;
export const ActualizarEquipoSchema = CrearEquipoSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarEquipo = z.infer<typeof ActualizarEquipoSchema>;

/* ─── Vehículo (placa) ─── */
export const CrearVehiculoSchema = z.object({
  Placa: z.string().min(1).max(15),
  Modelo: z.string().max(80).optional(),
  IdEquipo: z.string().uuid().optional(),
});
export type CrearVehiculo = z.infer<typeof CrearVehiculoSchema>;
export const ActualizarVehiculoSchema = CrearVehiculoSchema.partial().extend({
  Estado: z.boolean().optional(),
});
export type ActualizarVehiculo = z.infer<typeof ActualizarVehiculoSchema>;

/* ─── Requerimiento ─── */
export const ORIGEN_REQUERIMIENTO = [
  "planificado",
  "presupuestado",
  "desgaste_prematuro",
] as const;
export type OrigenRequerimiento = (typeof ORIGEN_REQUERIMIENTO)[number];

export const DetalleRequerimientoSchema = z.object({
  IdProducto: z.string().uuid(),
  Cantidad: z.number().positive(),
  Notas: z.string().max(300).optional(),
});

export const CrearRequerimientoSchema = z
  .object({
    FechaRequerimiento: z.string().date(),
    Origen: z.enum(ORIGEN_REQUERIMIENTO),
    NumeroRequerimiento: z.string().max(40).optional(),
    IdEquipo: z.string().uuid().optional(),
    IdVehiculo: z.string().uuid().optional(),
    IdPersonalSolicitante: z.string().uuid().optional(),
    Notas: z.string().max(500).optional(),
    Detalle: z.array(DetalleRequerimientoSchema).min(1),
  })
  .refine((r) => !!r.IdEquipo || !!r.IdVehiculo, {
    message: "El requerimiento debe apuntar a un equipo o a una placa.",
  });
export type CrearRequerimiento = z.infer<typeof CrearRequerimientoSchema>;

/* Aprobar un requerimiento: entrega por línea desde el almacén origen.
   Modo 'stock' = sale del almacén; 'compra' = compra directa (entrada+salida),
   exige proveedor + comprobante (batch) y costo por línea. Cantidad 0 = no se
   entrega esa línea (entrega parcial). La invariante final la valida la BD. */
export const MODO_ENTREGA = ["stock", "compra"] as const;

export const LineaEntregaSchema = z.object({
  IdDetalle: z.string().uuid(),
  Cantidad: z.number().nonnegative(),
  Modo: z.enum(MODO_ENTREGA).default("stock"),
  Costo: z.number().positive().optional(),
});

export const AtenderRequerimientoSchema = z
  .object({
    IdUbicacionOrigen: z.string().uuid({ message: "Elige un almacén de origen." }),
    Notas: z.string().max(500).optional(),
    IdProveedor: z.string().uuid().optional(),
    Comprobante: z.string().max(60).optional(),
    Lineas: z.array(LineaEntregaSchema).min(1),
  })
  .refine((d) => d.Lineas.some((l) => l.Cantidad > 0), {
    message: "Indica al menos una cantidad a entregar.",
    path: ["Lineas"],
  })
  .refine(
    (d) =>
      !d.Lineas.some((l) => l.Modo === "compra" && l.Cantidad > 0) ||
      (!!d.IdProveedor && !!d.Comprobante),
    {
      message: "La compra directa requiere proveedor y comprobante.",
      path: ["IdProveedor"],
    }
  );
export type AtenderRequerimiento = z.infer<typeof AtenderRequerimientoSchema>;
export type LineaEntrega = z.infer<typeof LineaEntregaSchema>;

/* Rechazar un requerimiento pendiente, con motivo opcional. */
export const AnularRequerimientoSchema = z.object({
  Motivo: z.string().max(500).optional(),
});
export type AnularRequerimiento = z.infer<typeof AnularRequerimientoSchema>;

/* ─── Importación masiva ─── */

/* Modo ante un registro que ya existe: solo crear, o crear y actualizar. */
export const MODO_IMPORTACION = ["crear", "upsert"] as const;
export type ModoImportacion = (typeof MODO_IMPORTACION)[number];

/* Reporte que devuelven las funciones de importación (errores por fila). */
export interface ErrorImportacion {
  fila: number;
  columna: string;
  codigo: string;
  error: string;
}
export interface ReporteImportacion {
  cantidadFilas: number;
  cantidadCorrectas: number;
  cantidadErrores: number;
  creados: number;
  actualizados: number;
  errores: ErrorImportacion[];
}

/* Importación de productos (Excel → JSON → inv.FnImportarProductos).
   La fila es LAXA a propósito: la validación de negocio (requeridos, códigos,
   invariante general XOR tipos) la hace la BD y vuelve como errores por fila.
   Zod sólo garantiza la FORMA para no abortar todo el lote por una celda. */
export const ImportarProductoFilaSchema = z.object({
  // Línea real del Excel (para reportar el error donde el usuario lo ve).
  Fila: z.number().int().positive().optional(),
  Sku: z.string().trim().default(""),
  Nombre: z.string().trim().default(""),
  CodigoCategoria: z.string().trim().default(""),
  CodigoUnidad: z.string().trim().default(""),
  EsGeneral: z.boolean().default(false),
  TiposEquipo: z.array(z.string().trim()).default([]),
  StockMinimo: z.number().nonnegative().optional(),
  CodigoBarra: z.string().trim().optional(),
  CodigoProductoProveedor: z.string().trim().optional(),
});
export type ImportarProductoFila = z.infer<typeof ImportarProductoFilaSchema>;

export const ImportarProductosSchema = z.object({
  Modo: z.enum(MODO_IMPORTACION).default("crear"),
  Filas: z
    .array(ImportarProductoFilaSchema)
    .min(1, "El archivo no tiene filas.")
    .max(5000, "Máximo 5000 filas por archivo."),
});
export type ImportarProductos = z.infer<typeof ImportarProductosSchema>;

/* Importación de saldos (Excel → JSON → inv.FnImportarSaldosIniciales).
   - inicial : crea existencias (rechaza filas con saldo previo).
   - recuento: ajusta contra el saldo vigente (toma de inventario). */
export const MODO_IMPORTACION_SALDO = ["inicial", "recuento"] as const;
export type ModoImportacionSaldo = (typeof MODO_IMPORTACION_SALDO)[number];

export const ImportarSaldoFilaSchema = z.object({
  Fila: z.number().int().positive().optional(),
  CodigoUbicacion: z.string().trim().default(""),
  Sku: z.string().trim().default(""),
  // Laxo: la BD valida (>0, numérico) y reporta por fila.
  Cantidad: z.number().nullish(),
  CostoUnitario: z.number().nullish(),
});
export type ImportarSaldoFila = z.infer<typeof ImportarSaldoFilaSchema>;

export const ImportarSaldosSchema = z.object({
  Modo: z.enum(MODO_IMPORTACION_SALDO).default("inicial"),
  FechaDocumento: z.string().date("Fecha de corte inválida (YYYY-MM-DD)."),
  Filas: z
    .array(ImportarSaldoFilaSchema)
    .min(1, "El archivo no tiene filas.")
    .max(5000, "Máximo 5000 filas por archivo."),
});
export type ImportarSaldos = z.infer<typeof ImportarSaldosSchema>;
