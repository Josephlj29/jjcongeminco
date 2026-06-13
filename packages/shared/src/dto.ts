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
  Atributos: z.record(z.unknown()).default({}),
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
export const CrearProveedorSchema = z.object({
  Ruc: z.string().max(15).optional(),
  Nombre: z.string().min(1).max(150),
  Contacto: z.string().max(120).optional(),
  Telefono: z.string().max(20).optional(),
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

/* Asignar el conjunto de tipos compatibles de un producto (replace-set; vacío = general) */
export const AsignarTiposEquipoProductoSchema = z.object({
  IdsTipoEquipo: z.array(z.string().uuid()),
});
export type AsignarTiposEquipoProducto = z.infer<typeof AsignarTiposEquipoProductoSchema>;

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
    Notas: z.string().max(500).optional(),
    Detalle: z.array(DetalleRequerimientoSchema).min(1),
  })
  .refine((r) => !!r.IdEquipo || !!r.IdVehiculo, {
    message: "El requerimiento debe apuntar a un equipo o a una placa.",
  });
export type CrearRequerimiento = z.infer<typeof CrearRequerimientoSchema>;

/* Aprobar un requerimiento: genera la salida desde el almacén origen elegido. */
export const AtenderRequerimientoSchema = z.object({
  IdUbicacionOrigen: z.string().uuid({ message: "Elegí un almacén de origen." }),
  Notas: z.string().max(500).optional(),
});
export type AtenderRequerimiento = z.infer<typeof AtenderRequerimientoSchema>;

/* Rechazar un requerimiento pendiente, con motivo opcional. */
export const AnularRequerimientoSchema = z.object({
  Motivo: z.string().max(500).optional(),
});
export type AnularRequerimiento = z.infer<typeof AnularRequerimientoSchema>;
