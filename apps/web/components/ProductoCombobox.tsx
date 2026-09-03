"use client";

/**
 * ProductoCombobox — wrapper fino sobre el Combobox unificado con render
 * rico de producto (imagen, SKU, stock). API pública sin cambios.
 */
import * as React from "react";
import { Check, Package } from "lucide-react";
import type { ProductoStockConsolidado } from "@congeminco/shared";
import { cn } from "@/lib/utils";
import { Combobox, type OpcionCombobox } from "@/components/Combobox";

interface ProductoComboboxProps {
  productos: ProductoStockConsolidado[];
  value: string | null;
  onChange: (idProducto: string | null) => void;
  placeholder?: string;
}

function ImagenProducto({ url, size }: { url: string | null; size: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="shrink-0 rounded object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded bg-muted"
      style={{ width: size, height: size }}
    >
      <Package
        className="text-muted-foreground"
        style={{ width: size * 0.5, height: size * 0.5 }}
      />
    </div>
  );
}

export function ProductoCombobox({
  productos,
  value,
  onChange,
  placeholder = "Seleccionar producto...",
}: ProductoComboboxProps) {
  const porId = React.useMemo(() => new Map(productos.map((p) => [p.IdProducto, p])), [productos]);

  const opciones = React.useMemo<OpcionCombobox[]>(
    () =>
      productos.map((p) => ({
        value: p.IdProducto,
        label: p.NombreProducto,
        codigo: p.Sku,
        // El filtro del Combobox busca sobre codigo+label+descripcion:
        // poner acá el código de proveedor lo hace buscable.
        descripcion: p.CodigoProductoProveedor ?? undefined,
      })),
    [productos],
  );

  return (
    <Combobox
      opciones={opciones}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      buscarPlaceholder="Buscar por nombre, SKU o cód. proveedor..."
      className="h-auto min-h-10 px-3 py-2"
      renderSeleccion={(o) => {
        const p = porId.get(o.value);
        return (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ImagenProducto url={p?.UrlImagenPrincipal ?? null} size={40} />
            <div className="flex min-w-0 flex-1 flex-col items-start">
              <span className="truncate text-sm">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.codigo}</span>
            </div>
          </div>
        );
      }}
      renderOpcion={(o, seleccionada) => {
        const p = porId.get(o.value);
        return (
          <>
            <ImagenProducto url={p?.UrlImagenPrincipal ?? null} size={32} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{o.label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {o.codigo}
                {o.descripcion ? ` · Prov: ${o.descripcion}` : ""}
              </span>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {p?.StockTotal} {p?.CodigoUnidad}
            </span>
            <Check className={cn("h-4 w-4 shrink-0", seleccionada ? "opacity-100" : "opacity-0")} />
          </>
        );
      }}
    />
  );
}
