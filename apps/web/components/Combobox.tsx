"use client";

import * as React from "react";
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

interface OpcionCombobox {
  value: string;
  label: string;
  descripcion?: string;
}

interface ComboboxProps {
  opciones: OpcionCombobox[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
}

export function Combobox({
  opciones,
  value,
  onChange,
  placeholder = "Seleccionar...",
  emptyText = "Sin resultados.",
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");

  const seleccionado = opciones.find((o) => o.value === value) ?? null;

  const filtradas = React.useMemo(() => {
    if (!busqueda) return opciones;
    const q = busqueda.toLowerCase();
    return opciones.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.descripcion ?? "").toLowerCase().includes(q)
    );
  }, [opciones, busqueda]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {seleccionado ? seleccionado.label : <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={busqueda}
            onValueChange={setBusqueda}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtradas.map((opcion) => (
                <CommandItem
                  key={opcion.value}
                  value={opcion.value}
                  onSelect={() => {
                    onChange(opcion.value === value ? null : opcion.value);
                    setOpen(false);
                    setBusqueda("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opcion.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">{opcion.label}</span>
                    {opcion.descripcion && (
                      <span className="text-xs text-muted-foreground">{opcion.descripcion}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
