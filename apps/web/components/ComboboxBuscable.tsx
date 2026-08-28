"use client";

/**
 * @deprecated Shim de compatibilidad sobre el Combobox unificado.
 * Migrar los call sites a `@/components/Combobox` y borrar este archivo.
 * Diferencias adaptadas: value string (no null) y sin deselección.
 */
import { Combobox, type OpcionCombobox } from "@/components/Combobox";

export type { OpcionCombobox };

interface ComboboxBuscableProps {
  opciones: OpcionCombobox[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  buscarPlaceholder?: string;
  vacioTexto?: string;
  className?: string;
}

export function ComboboxBuscable({ value, onChange, ...props }: ComboboxBuscableProps) {
  return (
    <Combobox
      {...props}
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      permitirLimpiar={false}
    />
  );
}
