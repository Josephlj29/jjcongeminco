"use client";

/**
 * ComboboxBuscable — select con búsqueda (Popover + Command / cmdk).
 *
 * Reemplaza al <Select> plano cuando la lista es larga y conviene filtrar
 * escribiendo. Filtra por `label` y, si existe, por `codigo` (útil para
 * catálogos con códigos como unidades de medida SUNAT).
 */
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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

export interface OpcionCombobox {
  value: string;
  label: string;
  /** Código opcional (se muestra en monoespaciado y también es buscable). */
  codigo?: string;
}

interface ComboboxBuscableProps {
  opciones: OpcionCombobox[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  buscarPlaceholder?: string;
  vacioTexto?: string;
  className?: string;
}

export function ComboboxBuscable({
  opciones,
  value,
  onChange,
  placeholder = "Seleccionar...",
  buscarPlaceholder = "Buscar...",
  vacioTexto = "Sin resultados.",
  className,
}: ComboboxBuscableProps) {
  const [open, setOpen] = useState(false);
  const seleccionada = opciones.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          {seleccionada ? (
            <span className="flex min-w-0 items-center gap-2">
              {seleccionada.codigo && (
                <span className="font-mono text-xs text-muted-foreground">
                  {seleccionada.codigo}
                </span>
              )}
              <span className="truncate">{seleccionada.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder={buscarPlaceholder} />
          <CommandList>
            <CommandEmpty>{vacioTexto}</CommandEmpty>
            <CommandGroup>
              {opciones.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.codigo ?? ""} ${o.label}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === o.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {o.codigo && (
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                      {o.codigo}
                    </span>
                  )}
                  <span className="flex-1">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
