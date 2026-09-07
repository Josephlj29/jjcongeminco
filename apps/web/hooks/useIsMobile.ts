"use client";

/**
 * hooks/useIsMobile.ts
 *
 * Detección de viewport móvil vía matchMedia, para CONTENIDO (cards ↔ tabla).
 *
 * Dos hinges distintos en la app, a propósito:
 *   - Navegación (sidebar / hamburger / bottom-nav): `lg` (1024px), vía clases.
 *   - Contenido (columnas ocultas, cards vs tabla): `md` (768px). Es el que
 *     representa este hook.
 *
 * SSR-safe: durante el render del servidor y el primer render del cliente
 * devuelve `undefined` (no se sabe aún). Quien lo use debe renderizar un
 * skeleton en ese estado; así no hay flash de la vista desktop en celular ni
 * hydration mismatch. Recién tras montar refleja el viewport real.
 *
 * Usar SOLO cuando haga falta branchear en JS (ej. inputs de react-hook-form
 * que no pueden montarse dos veces). Para intercambiar layout puro
 * (cards ↔ tabla de solo lectura) preferir clases Tailwind
 * (`md:hidden` / `hidden md:block`): no dependen de JS y no producen flash.
 */
import { useEffect, useState } from "react";

/** Breakpoint `md` de Tailwind. El móvil es todo lo que quede por debajo. */
const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean | undefined {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
