"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Package } from "lucide-react";
import type { ProductoStockConsolidado } from "@congeminco/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
        className="rounded object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded bg-muted shrink-0"
      style={{ width: size, height: size }}
    >
      <Package className="text-muted-foreground" style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

export function ProductoCombobox({
  productos,
  value,
  onChange,
  placeholder = "Seleccionar producto...",
}: ProductoComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");

  const productoSeleccionado = React.useMemo(
    () => productos.find((p) => p.IdProducto === value) ?? null,
    [productos, value]
  );

  const filtrados = React.useMemo(() => {
    if (!busqueda) return productos;
    const q = busqueda.toLowerCase();
    return productos.filter(
      (p) =>
        p.NombreProducto.toLowerCase().includes(q) ||
        p.Sku.toLowerCase().includes(q)
    );
  }, [productos, busqueda]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10 px-3 py-2"
        >
          {productoSeleccionado ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <ImagenProducto url={productoSeleccionado.UrlImagenPrincipal} size={40} />
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-sm truncate">{productoSeleccionado.NombreProducto}</span>
                <span className="text-xs text-muted-foreground">{productoSeleccionado.Sku}</span>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre o SKU..."
            value={busqueda}
            onValueChange={setBusqueda}
          />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {filtrados.map((producto) => (
                <CommandItem
                  key={producto.IdProducto}
                  value={producto.IdProducto}
                  onSelect={() => {
                    onChange(producto.IdProducto === value ? null : producto.IdProducto);
                    setOpen(false);
                    setBusqueda("");
                  }}
                  className="flex items-center gap-2"
                >
                  <ImagenProducto url={producto.UrlImagenPrincipal} size={32} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm truncate">{producto.NombreProducto}</span>
                    <span className="text-xs text-muted-foreground">{producto.Sku}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">
                    {producto.StockTotal}
                  </span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === producto.IdProducto ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
