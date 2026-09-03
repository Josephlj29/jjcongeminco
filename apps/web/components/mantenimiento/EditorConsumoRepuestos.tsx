"use client";

/**
 * components/mantenimiento/EditorConsumoRepuestos.tsx
 *
 * Editor de líneas de repuestos de una OT (almacén origen + producto/cantidad/
 * modo/costo + proveedor/comprobante si hay compra directa). Es el BORRADOR que
 * viaja con la orden (alta y edición) y se convierte en salida de stock al
 * aprobar. Componente CONTROLADO: el estado vive en el padre; los catálogos
 * (saldos, ubicaciones, proveedores) los carga el editor.
 */
import { toast } from "sonner";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { ConsumirRepuestos } from "@congeminco/shared";
import { useSaldos } from "@/hooks/useSaldos";
import { useUbicaciones } from "@/hooks/useUbicaciones";
import { useProveedores } from "@/hooks/useProveedores";
import { ProductoCombobox } from "@/components/ProductoCombobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LineaConsumoState = {
  idProducto: string | null;
  cantidad: string;
  modo: "stock" | "compra";
  costo: string;
};

export const LINEA_CONSUMO_VACIA: LineaConsumoState = {
  idProducto: null,
  cantidad: "1",
  modo: "stock",
  costo: "",
};

export interface ConsumoState {
  idUbicacion: string;
  idProveedor: string;
  comprobante: string;
  lineas: LineaConsumoState[];
}

export const CONSUMO_INICIAL: ConsumoState = {
  idUbicacion: "",
  idProveedor: "",
  comprobante: "",
  lineas: [{ ...LINEA_CONSUMO_VACIA }],
};

/** true si el usuario no cargó ningún repuesto (consumo opcional en el alta). */
export function consumoVacio(estado: ConsumoState): boolean {
  return !estado.lineas.some((l) => l.idProducto && Number(l.cantidad) > 0);
}

/**
 * Valida el estado y arma el payload de inv.FnConsumirRepuestosOrdenMantenimiento.
 * Devuelve null si hay un error (ya notificado con toast).
 */
export function validarConsumo(estado: ConsumoState): ConsumirRepuestos | null {
  if (!estado.idUbicacion) {
    toast.error("Elige un almacén de origen para el consumo.");
    return null;
  }
  // Una línea con producto elegido pero cantidad inválida es un error visible,
  // no algo que se descarta en silencio (perdería consumo sin que se note).
  const aMedias = estado.lineas.some((l) => l.idProducto && !(Number(l.cantidad) > 0));
  if (aMedias) {
    toast.error("Hay repuestos con cantidad vacía o inválida: complétalos o quítalos.");
    return null;
  }
  const lineasValidas = estado.lineas.filter((l) => l.idProducto && Number(l.cantidad) > 0);
  if (!lineasValidas.length) {
    toast.error("Agrega al menos un repuesto con cantidad.");
    return null;
  }
  const hayCompra = lineasValidas.some((l) => l.modo === "compra");
  if (hayCompra && (!estado.idProveedor || !estado.comprobante.trim())) {
    toast.error("La compra directa requiere proveedor y comprobante.");
    return null;
  }
  for (const l of lineasValidas) {
    if (l.modo === "compra" && !(Number(l.costo) > 0)) {
      toast.error("Las líneas de compra directa necesitan costo.");
      return null;
    }
  }
  return {
    IdUbicacionOrigen: estado.idUbicacion,
    IdProveedor: hayCompra ? estado.idProveedor : undefined,
    Comprobante: hayCompra ? estado.comprobante.trim() : undefined,
    Lineas: lineasValidas.map((l) => ({
      IdProducto: l.idProducto as string,
      Cantidad: Number(l.cantidad),
      Modo: l.modo,
      Costo: l.modo === "compra" ? Number(l.costo) : undefined,
    })),
  };
}

function moneda(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function EditorConsumoRepuestos({
  estado,
  onChange,
}: {
  estado: ConsumoState;
  onChange: (estado: ConsumoState) => void;
}) {
  const { data: productos } = useSaldos();
  const { data: ubicaciones } = useUbicaciones();
  const { data: proveedores } = useProveedores();

  const { lineas, idUbicacion, idProveedor, comprobante } = estado;
  const hayCompra = lineas.some((l) => l.modo === "compra");

  const patch = (p: Partial<ConsumoState>) => onChange({ ...estado, ...p });
  const setLinea = (i: number, p: Partial<LineaConsumoState>) =>
    patch({ lineas: lineas.map((l, idx) => (idx === i ? { ...l, ...p } : l)) });

  const total = lineas.reduce((acc, l) => {
    const cant = Number(l.cantidad) || 0;
    if (l.modo === "compra") return acc + cant * (Number(l.costo) || 0);
    const prod = productos?.find((p) => p.IdProducto === l.idProducto);
    return acc + cant * (prod?.CostoPromedio ?? 0);
  }, 0);

  return (
    <div
      className="space-y-4"
      // Dentro del form del alta de OT, Enter en un input dispararía el
      // submit completo (crear la orden). Acá Enter no envía nada.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
        }
      }}
    >
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-xs leading-tight">
          El stock se descuenta al <strong>aprobar</strong> la orden; hasta entonces esta lista
          es un borrador editable. Si el repuesto no está en almacén, usa{" "}
          <strong>compra directa</strong> en la línea.
        </p>
      </div>

      <div className="space-y-1">
        <Label>Almacén de origen *</Label>
        <Select value={idUbicacion} onValueChange={(v) => patch({ idUbicacion: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar almacén..." />
          </SelectTrigger>
          <SelectContent>
            {ubicaciones?.map((u) => (
              <SelectItem key={u.Id} value={u.Id}>
                {u.Codigo} — {u.Nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        {/* min-w: la tabla tiene 5 columnas y no entra en un celular. El contenedor
            de Table ya desborda con scroll, pero sin un ancho mínimo el navegador
            comprime las celdas en vez de desbordar, y la cantidad se queda sin
            lugar. Con el mínimo, en pantalla chica se arrastra de costado y cada
            campo conserva su ancho útil. */}
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="w-28">Cantidad</TableHead>
              <TableHead className="w-32">Modo</TableHead>
              <TableHead className="w-28">Costo (compra)</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="min-w-64 align-top">
                  <ProductoCombobox
                    productos={productos ?? []}
                    value={l.idProducto}
                    onChange={(v) => setLinea(i, { idProducto: v })}
                  />
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      className="h-9"
                      value={l.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: e.target.value })}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {productos?.find((p) => p.IdProducto === l.idProducto)?.CodigoUnidad ?? ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Select
                    value={l.modo}
                    onValueChange={(v) => setLinea(i, { modo: v as LineaConsumoState["modo"] })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stock">Stock</SelectItem>
                      <SelectItem value="compra">Compra directa</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    className="h-9"
                    placeholder="—"
                    disabled={l.modo !== "compra"}
                    value={l.costo}
                    onChange={(e) => setLinea(i, { costo: e.target.value })}
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      patch({
                        lineas: lineas.length > 1 ? lineas.filter((_, idx) => idx !== i) : lineas,
                      })
                    }
                    disabled={lineas.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patch({ lineas: [...lineas, { ...LINEA_CONSUMO_VACIA }] })}
        >
          <Plus className="mr-1 h-3 w-3" />
          Agregar repuesto
        </Button>
        <span className="text-sm text-muted-foreground">
          Valor estimado: <strong className="text-foreground">{moneda(total)}</strong>
        </span>
      </div>

      {hayCompra && (
        <div className="grid grid-cols-2 gap-4 rounded-md border border-dashed p-3">
          <div className="space-y-1">
            <Label>Proveedor (compra directa) *</Label>
            <Select value={idProveedor} onValueChange={(v) => patch({ idProveedor: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar proveedor..." />
              </SelectTrigger>
              <SelectContent>
                {proveedores?.map((p) => (
                  <SelectItem key={p.Id} value={p.Id}>
                    {p.Nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ComprobanteConsumo">Comprobante *</Label>
            <Input
              id="ComprobanteConsumo"
              placeholder="F001-123"
              value={comprobante}
              onChange={(e) => patch({ comprobante: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
