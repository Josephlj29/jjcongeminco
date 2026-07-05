"use client";

/**
 * hooks/useIsMobile.ts
 *
 * Detección de viewport móvil (< md, 768px) vía matchMedia.
 *
 * SSR-safe: durante el render del servidor y el primer render del cliente
 * devuelve `false` para evitar hydration mismatch (mismo criterio que
 * AppSidebar con su flag `mounted`). Recién tras montar refleja el viewport real.
 *
 * Usar SOLO cuando haga falta branchear en JS (ej. la prop `side` de un Sheet).
 * Para intercambiar layout puro (cards ↔ tabla) preferir clases Tailwind
 * (`md:hidden` / `hidden md:block`): no dependen de JS y no producen flash.
 */
import { useEffect, useState } from "react";

/** Breakpoint `md` de Tailwind. El móvil es todo lo que quede por debajo. */
const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}