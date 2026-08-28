"use client";

/**
 * Combobox — select con búsqueda, único de la app (Popover + Command/cmdk).
 *
 * Unifica los antiguos Combobox / ComboboxBuscable / ProductoCombobox:
 * - filtra por label + codigo + descripcion, insensible a acentos;
 * - `codigo` se muestra en monoespaciado (catálogos tipo SUNAT);
 * - `renderOpcion`/`renderSeleccion` para casos ricos (imagen, stock);
 * - `permitirLimpiar`: re-click en la opción seleccionada => onChange(null).
 */
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface OpcionCombobox {
  value: string;
  label: string;
  /** Segunda línea en muted (también buscable). */
  descripcion?: string;
  /** Código en monoespaciado (también buscable). */
  codigo?: string;
}

interface ComboboxProps {
  opciones: OpcionCombobox[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  buscarPlaceholder?: string;
  vacioTexto?: string;
  /** default true: re-click en la seleccionada deselecciona. */
  permitirLimpiar?: boolean;
  renderOpcion?: (opcion: OpcionCombobox, seleccionada: boolean) => React.ReactNode;
  renderSeleccion?: (opcion: OpcionCombobox) => React.ReactNode;
  className?: string;
}

/** "Cañería" -> "caneria" para búsqueda insensible a acentos. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function Combobox({
  opciones,
  value,
  onChange,
  placeholder = "Seleccionar...",
  buscarPlaceholder = "Buscar...",
  vacioTexto = "Sin resultados.",
  permitirLimpiar = true,
  renderOpcion,
  renderSeleccion,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");

  const seleccionada = React.useMemo(
    () => opciones.find((o) => o.value === value) ?? null,
    [opciones, value],
  );

  const filtradas = React.useMemo(() => {
    if (!busqueda) return opciones;
    const q = normalizar(busqueda);
    return opciones.filter((o) =>
      normalizar(`${o.codigo ?? ""} ${o.label} ${o.descripcion ?? ""}`).includes(q),
    );
  }, [opciones, busqueda]);

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
            renderSeleccion ? (
              renderSeleccion(seleccionada)
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                {seleccionada.codigo && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {seleccionada.codigo}
                  </span>
                )}
                <span className="truncate">{seleccionada.label}</span>
              </span>
            )
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={buscarPlaceholder}
            value={busqueda}
            onValueChange={setBusqueda}
          />
          <CommandList>
            <CommandEmpty>{vacioTexto}</CommandEmpty>
            <CommandGroup>
              {filtradas.map((opcion) => {
                const esSeleccionada = opcion.value === value;
                return (
                  <CommandItem
                    key={opcion.value}
                    value={opcion.value}
                    onSelect={() => {
                      onChange(esSeleccionada && permitirLimpiar ? null : opcion.value);
                      setOpen(false);
                      setBusqueda("");
                    }}
                    className="flex items-center gap-2"
                  >
                    {renderOpcion ? (
                      renderOpcion(opcion, esSeleccionada)
                    ) : (
                      <>
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            esSeleccionada ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {opcion.codigo && (
                          <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                            {opcion.codigo}
                          </span>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm">{opcion.label}</span>
                          {opcion.descripcion && (
                            <span className="truncate text-xs text-muted-foreground">
                              {opcion.descripcion}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
