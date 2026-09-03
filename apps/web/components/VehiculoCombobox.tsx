"use client";

/**
 * VehiculoCombobox — selector de placa con búsqueda (wrapper fino del Combobox
 * unificado). Cada opción muestra la placa + el nombre del vehículo (modelo y
 * equipo asignado), y el filtro busca por los tres. Carga sus propios catálogos
 * (useVehiculos/useEquipos, deduplicados por react-query).
 *
 * `detallado`: el trigger muestra "PLACA — modelo" (para anchos completos);
 * sin él muestra solo la placa (celdas angostas de tabla). El dropdown lleva
 * un min-w propio para que la descripción se lea aunque el trigger sea chico.
 */
import * as React from "react";
import { useVehiculos, useEquipos } from "@/hooks/useEquipos";
import { Combobox, type OpcionCombobox } from "@/components/Combobox";

interface VehiculoComboboxProps {
  value: string | null;
  onChange: (idVehiculo: string | null) => void;
  placeholder?: string;
  /** Trigger con placa + modelo (usar solo con ancho completo). */
  detallado?: boolean;
  className?: string;
}

export function VehiculoCombobox({
  value,
  onChange,
  placeholder = "Placa...",
  detallado = false,
  className,
}: VehiculoComboboxProps) {
  const { data: vehiculos } = useVehiculos();
  const { data: equipos } = useEquipos();

  const opciones = React.useMemo<OpcionCombobox[]>(
    () =>
      (vehiculos ?? []).map((v) => {
        const equipo = equipos?.find((e) => e.Id === v.IdEquipo);
        return {
          value: v.Id,
          label: v.Placa,
          descripcion:
            [v.Modelo, equipo?.Nombre].filter(Boolean).join(" · ") || undefined,
        };
      }),
    [vehiculos, equipos],
  );

  return (
    <Combobox
      opciones={opciones}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      buscarPlaceholder="Buscar por placa, modelo o equipo..."
      vacioTexto="Sin vehículos."
      className={className}
      popoverClassName="min-w-[280px]"
      renderSeleccion={
        detallado
          ? (o) => (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono">{o.label}</span>
                {o.descripcion && (
                  <span className="truncate text-xs text-muted-foreground">{o.descripcion}</span>
                )}
              </span>
            )
          : (o) => <span className="truncate font-mono">{o.label}</span>
      }
    />
  );
}
