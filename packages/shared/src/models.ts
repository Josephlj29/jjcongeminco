/* Tipos de fila (reflejan las tablas BSG). Cuando uses supabase gen types,
   podés reemplazar/complementar estos con los generados. */

export interface CamposAuditoria {
  Estado: boolean;
  UsuarioCreacion: string;
  UsuarioModificacion: string;
  FechaCreacion: string;
  FechaModificacion: string;
  RowVersion: number;
  IdMigracion: string | null;
}

export interface Producto extends CamposAuditoria {
  Id: string;
  Sku: string;
  Nombre: string;
  IdCategoria: string;
  IdUnidadMedida: string;
  StockMinimo: number;
  CodigoBarra: string | null;
  CostoPromedio: number;
  UltimoCosto: number | null;
  Atributos: Record<string, unknown>;
}

export interface Equipo extends CamposAuditoria {
  Id: string;
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
}

export interface Vehiculo extends CamposAuditoria {
  Id: string;
  Placa: string;
  Modelo: string | null;
  IdEquipo: string | null;
}

export interface Proveedor extends CamposAuditoria {
  Id: string;
  Ruc: string | null;
  Nombre: string;
  Contacto: string | null;
  Telefono: string | null;
}

export interface ProductoPrecioHistorico {
  Id: string;
  IdProducto: string;
  Costo: number;
  CostoPromedio: number;
  FechaPrecio: string;
  IdProveedor: string | null;
  IdDocumentoInventario: string | null;
  Origen: "compra" | "manual" | "ajuste";
}

export interface Requerimiento extends CamposAuditoria {
  Id: string;
  NumeroRequerimiento: string | null;
  FechaRequerimiento: string;
  Origen: "planificado" | "presupuestado" | "desgaste_prematuro";
  IdEquipo: string | null;
  IdVehiculo: string | null;
  Situacion: "pendiente" | "atendido" | "anulado";
  Notas: string | null;
  IdDocumentoInventario: string | null;
}

export interface ProductoImagen extends CamposAuditoria {
  Id: string;
  IdProducto: string;
  Url: string;
  Orden: number;
  EsPrincipal: boolean;
}

export interface Categoria extends CamposAuditoria {
  Id: string;
  IdCategoriaPadre: string | null;
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
}

export interface Ubicacion extends CamposAuditoria {
  Id: string;
  Codigo: string;
  Nombre: string;
  Tipo: "almacen_central" | "proyecto" | "otro";
  Direccion: string | null;
}

/* Salida de la vista inv.V_Producto_StockConsolidado */
export interface ProductoStockConsolidado {
  IdProducto: string;
  Sku: string;
  NombreProducto: string;
  NombreCategoria: string;
  CodigoUnidad: string;
  StockMinimo: number;
  StockTotal: number;
  BajoMinimo: boolean;
}

/* Salida de la vista inv.V_Producto_Valorizado */
export interface ProductoValorizado {
  IdProducto: string;
  Sku: string;
  NombreProducto: string;
  NombreCategoria: string;
  CodigoUnidad: string;
  StockMinimo: number;
  CostoPromedio: number;
  UltimoCosto: number | null;
  StockTotal: number;
  ValorTotal: number;
  BajoMinimo: boolean;
}

/* Salida de la vista inv.V_Producto_HistorialRequerimiento */
export interface ProductoHistorialRequerimiento {
  IdProducto: string;
  Sku: string;
  NombreProducto: string;
  VecesPedido: number;
  CantidadTotalPedida: number;
  UltimaFechaPedido: string | null;
  VecesDesgastePrematuro: number;
}

/* Salida de la vista inv.V_Reporte_Movimiento */
export interface ReporteMovimiento {
  IdMovimiento: string;
  FechaMovimiento: string;
  TipoDocumento: string;
  NumeroDocumento: string | null;
  Comprobante: string | null;
  IdProducto: string;
  Sku: string;
  NombreProducto: string;
  IdCategoria: string;
  NombreCategoria: string;
  IdUbicacion: string;
  NombreUbicacion: string;
  IdProveedor: string | null;
  NombreProveedor: string | null;
  IdVehiculo: string | null;
  Placa: string | null;
  IdEquipo: string | null;
  NombreEquipo: string | null;
  Direccion: -1 | 1;
  Cantidad: number;
  CantidadConSigno: number;
  CostoUnitario: number | null;
  ValorMovimiento: number;
}

/* Salida de la vista inv.V_MovimientoStock_Kardex */
export interface KardexFila {
  IdMovimientoStock: string;
  IdProducto: string;
  Sku: string;
  NombreProducto: string;
  IdUbicacion: string;
  NombreUbicacion: string;
  FechaMovimiento: string;
  TipoDocumento: string;
  NumeroDocumento: string | null;
  Comprobante: string | null;
  Direccion: -1 | 1;
  Cantidad: number;
  CantidadConSigno: number;
  SaldoCorrido: number;
}
