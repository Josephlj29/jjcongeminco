"use client";

/**
 * components/requerimientos/DialogCatalogarProducto.tsx
 *
 * Registra en el catálogo el producto de una línea NO catalogada de un
 * requerimiento, al momento de entregar. La BD (FnCatalogarLineaRequerimiento)
 * hace todo atómico: alta con SKU autogenerado, StockMinimo autocalculado por
 * flota, la foto de la solicitud como imagen principal y el link de la línea.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { RequerimientoDetalleLinea } from "@congeminco/shared";
import { useCatalogarLinea } from "@/hooks/useRequerimientos";
import { useCategorias, useUnidades } from "@/hooks/useCatalogo";
import { useTiposEquipo } from "@/hooks/useTiposEquipo";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { Combobox } from "@/components/Combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DialogCatalogarProducto({
  linea,
  idRequerimiento,
  onClose,
  onCatalogado,
}: {
  linea: RequerimientoDetalleLinea | null;
  idRequerimiento: string | null;
  onClose: () => void;
  onCatalogado?: (idProducto: string) => void;
}) {
  const { data: categorias } = useCategorias();
  const { data: unidades } = useUnidades();
  const { data: tipos } = useTiposEquipo();
  const { mutateAsync: catalogar, isPending } = useCatalogarLinea();

  const [nombre, setNombre] = useState("");
  const [idCategoria, setIdCategoria] = useState<string | null>(null);
  const [idUnidad, setIdUnidad] = useState<string | null>(null);
  const [esGeneral, setEsGeneral] = useState(false);
  const [idsTipo, setIdsTipo] = useState<string[]>([]);

  // Re-sembrar al abrir con otra línea (prefill = lo pedido).
  useEffect(() => {
    if (linea) {
      setNombre(linea.DescripcionLibre ?? "");
      setIdCategoria(null);
      setIdUnidad(null);
      setEsGeneral(false);
      setIdsTipo([]);
    }
  }, [linea?.Id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTipo = (id: string) =>
    setIdsTipo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onRegistrar = async () => {
    if (!linea || !idRequerimiento) return;
    if (!nombre.trim() || !idCategoria || !idUnidad) {
      toast.error("Completa nombre, categoría y unidad de medida.");
      return;
    }
    if (!esGeneral && idsTipo.length === 0) {
      toast.error("Elige al menos un tipo de equipo o marca el producto como general.");
      return;
    }
    try {
      const { IdProducto } = await catalogar({
        idRequerimiento,
        idDetalle: linea.Id,
        data: {
          Nombre: nombre.trim(),
          IdCategoria: idCategoria,
          IdUnidadMedida: idUnidad,
          StockMinimo: 0, // 0 = la BD lo autocalcula según la flota
          EsGeneral: esGeneral,
          IdsTipoEquipo: esGeneral ? [] : idsTipo,
          Atributos: {},
        },
      });
      toast.success("Producto registrado en el catálogo — ya puedes entregarlo.");
      onCatalogado?.(IdProducto);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={!!linea} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar producto en el catálogo</DialogTitle>
          <DialogDescription>
            El producto pedido de urgencia se registra para poder entregarlo y quedar en el kardex.
          </DialogDescription>
        </DialogHeader>

        {linea && (
          <div className="space-y-4">
            {linea.UrlFotoLibre && (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                <ImagenAmpliable
                  url={linea.UrlFotoLibre}
                  size={72}
                  nombre={linea.DescripcionLibre ?? undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Esta foto quedará como imagen principal del producto.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="nombreProducto">Nombre *</Label>
              <Input
                id="nombreProducto"
                maxLength={200}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>SKU</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted px-3 font-mono text-sm text-muted-foreground">
                Se genera automáticamente
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Categoría *</Label>
                <Combobox
                  opciones={(categorias ?? []).map((c) => ({ value: c.Id, label: c.Nombre }))}
                  value={idCategoria}
                  onChange={setIdCategoria}
                  placeholder="Seleccionar..."
                  buscarPlaceholder="Buscar categoría..."
                />
              </div>
              <div className="space-y-1">
                <Label>Unidad de medida *</Label>
                <Combobox
                  opciones={(unidades ?? []).map((u) => ({
                    value: u.Id,
                    label: u.Nombre,
                    codigo: u.Codigo,
                  }))}
                  value={idUnidad}
                  onChange={setIdUnidad}
                  placeholder="Seleccionar..."
                  buscarPlaceholder="Buscar por código o nombre..."
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={esGeneral}
                  onCheckedChange={(c) => setEsGeneral(c === true)}
                />
                Producto general (compatible con cualquier equipo)
              </label>
              {!esGeneral && (
                <div className="max-h-40 space-y-1 overflow-y-auto pt-1">
                  {(tipos ?? []).map((t) => (
                    <label key={t.Id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={idsTipo.includes(t.Id)}
                        onCheckedChange={() => toggleTipo(t.Id)}
                      />
                      {t.Nombre}
                    </label>
                  ))}
                  {!tipos?.length && (
                    <p className="text-xs text-muted-foreground">No hay tipos de equipo.</p>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              El stock mínimo se calcula automáticamente según la flota (equipos compatibles).
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => void onRegistrar()}
            disabled={isPending || !nombre.trim() || !idCategoria || !idUnidad}
          >
            {isPending ? "Registrando..." : "Registrar producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
