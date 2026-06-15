"use client";

/**
 * components/mantenimiento/DialogConsumirRepuestos.tsx
 *
 * Registra los repuestos USADOS en una OT. Genera la salida de inmediato
 * (consumo provisional, Model 2): DESCUENTA STOCK YA. El admin lo ratifica luego.
 * Por línea: producto, cantidad, modo stock/compra (compra directa = entrada +
 * salida, requiere proveedor + comprobante + costo).
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { ConsumirRepuestos } from "@congeminco/shared";
import { useConsumirRepuestos } from "@/hooks/useOrdenesMantenimiento";
import { useSaldos } from "@/hooks/useSaldos";
import { useUbicaciones } from "@/hooks/useUbicaciones";
import { useProveedores } from "@/hooks/useProveedores";
import { ProductoCombobox } from "@/components/ProductoCombobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

type LineaState = {
  idProducto: string | null;
  cantidad: string;
  modo: "stock" | "compra";
  costo: string;
};

const LINEA_VACIA: LineaState = { idProducto: null, cantidad: "1", modo: "stock", costo: "" };

function moneda(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function DialogConsumirRepuestos({
  idOrden,
  numeroOrden,
  onClose,
}: {
  idOrden: string;
  numeroOrden: string | null;
  onClose: () => void;
}) {
  const { mutateAsync, isPending } = useConsumirRepuestos();
  const { data: productos } = useSaldos();
  const { data: ubicaciones } = useUbicaciones();
  const { data: proveedores } = useProveedores();

  const [idUbicacion, setIdUbicacion] = useState<string>("");
  const [idProveedor, setIdProveedor] = useState<string>("");
  const [comprobante, setComprobante] = useState<string>("");
  const [lineas, setLineas] = useState<LineaState[]>([{ ...LINEA_VACIA }]);

  const hayCompra = lineas.some((l) => l.modo === "compra");

  const setLinea = (i: number, patch: Partial<LineaState>) =>
    setLineas((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const total = lineas.reduce((acc, l) => {
    const cant = Number(l.cantidad) || 0;
    if (l.modo === "compra") return acc + cant * (Number(l.costo) || 0);
    const prod = productos?.find((p) => p.IdProducto === l.idProducto);
    return acc + cant * (prod?.CostoPromedio ?? 0);
  }, 0);

  const onSubmit = async () => {
    if (!idUbicacion) {
      toast.error("Elige un almacén de origen.");
      return;
    }
    const lineasValidas = lineas.filter((l) => l.idProducto && Number(l.cantidad) > 0);
    if (!lineasValidas.length) {
      toast.error("Agrega al menos un repuesto con cantidad.");
      return;
    }
    if (hayCompra && (!idProveedor || !comprobante.trim())) {
      toast.error("La compra directa requiere proveedor y comprobante.");
      return;
    }
    for (const l of lineasValidas) {
      if (l.modo === "compra" && !(Number(l.costo) > 0)) {
        toast.error("Las líneas de compra directa necesitan costo.");
        return;
      }
    }

    const data: ConsumirRepuestos = {
      IdUbicacionOrigen: idUbicacion,
      IdProveedor: hayCompra ? idProveedor : undefined,
      Comprobante: hayCompra ? comprobante.trim() : undefined,
      Lineas: lineasValidas.map((l) => ({
        IdProducto: l.idProducto as string,
        Cantidad: Number(l.cantidad),
        Modo: l.modo,
        Costo: l.modo === "compra" ? Number(l.costo) : undefined,
      })),
    };

    try {
      await mutateAsync({ id: idOrden, data });
      toast.success("Repuestos consumidos. Pendiente de aprobación.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Consumir repuestos {numeroOrden ? `· OT ${numeroOrden}` : ""}
          </DialogTitle>
          <DialogDescription>
            Esto descuenta stock de inmediato. El admin lo ratifica después.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-xs leading-tight">
            El stock se descuenta al guardar (consumo provisional). Si el repuesto no está en
            almacén, usa <strong>compra directa</strong> en la línea.
          </p>
        </div>

        <div className="space-y-1">
          <Label>Almacén de origen *</Label>
          <Select value={idUbicacion} onValueChange={setIdUbicacion}>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="w-24">Cantidad</TableHead>
                <TableHead className="w-32">Modo</TableHead>
                <TableHead className="w-28">Costo (compra)</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="align-top min-w-64">
                    <ProductoCombobox
                      productos={productos ?? []}
                      value={l.idProducto}
                      onChange={(v) => setLinea(i, { idProducto: v })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      className="h-9"
                      value={l.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Select
                      value={l.modo}
                      onValueChange={(v) => setLinea(i, { modo: v as LineaState["modo"] })}
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
                        setLineas((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr))
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
            onClick={() => setLineas((arr) => [...arr, { ...LINEA_VACIA }])}
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
              <Select value={idProveedor} onValueChange={setIdProveedor}>
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
              <Label htmlFor="Comprobante">Comprobante *</Label>
              <Input
                id="Comprobante"
                placeholder="F001-123"
                value={comprobante}
                onChange={(e) => setComprobante(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending}>
            {isPending ? "Consumiendo..." : "Consumir y descontar stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
