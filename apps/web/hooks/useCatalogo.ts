import { useQuery } from "@tanstack/react-query";
import type { Categoria, Ubicacion } from "@congeminco/shared";

/* Tipos locales para recursos de catálogo sin modelo en @congeminco/shared */
export interface UnidadMedida {
  Id: string;
  Codigo: string;
  Nombre: string;
}

export interface Proveedor {
  Id: string;
  Codigo: string;
  Nombre: string;
}

async function fetchCatalogo<T>(recurso: string): Promise<T> {
  const res = await fetch(`/api/catalogo/${recurso}`);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar ${recurso}`);
  return res.json();
}

export function useCategorias() {
  return useQuery({
    queryKey: ["catalogo", "categorias"],
    queryFn: () => fetchCatalogo<Categoria[]>("categorias"),
    staleTime: 1000 * 60 * 5, // 5 minutos — catálogos cambian poco
  });
}

export function useUnidades() {
  return useQuery({
    queryKey: ["catalogo", "unidades"],
    queryFn: () => fetchCatalogo<UnidadMedida[]>("unidades"),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUbicaciones() {
  return useQuery({
    queryKey: ["catalogo", "ubicaciones"],
    queryFn: () => fetchCatalogo<Ubicacion[]>("ubicaciones"),
    staleTime: 1000 * 60 * 5,
  });
}

export function useProveedores() {
  return useQuery({
    queryKey: ["catalogo", "proveedores"],
    queryFn: () => fetchCatalogo<Proveedor[]>("proveedores"),
    staleTime: 1000 * 60 * 5,
  });
}
