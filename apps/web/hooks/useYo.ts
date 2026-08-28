import { useQuery } from "@tanstack/react-query";
import { puede, type PERMISOS, type RoleCode } from "@congeminco/shared";

/** Respuesta de GET /api/yo. */
export interface Yo {
  id: string;
  email: string | null;
  rol: RoleCode;
  nombreCompleto: string | null;
  modulos: string[];
}

/**
 * Usuario autenticado (rol + módulos). Reemplaza a los useRolActual() locales.
 * queryKey ["yo"] se mantiene idéntica a las copias históricas para compartir
 * caché durante la migración incremental.
 */
export function useYo() {
  return useQuery({
    queryKey: ["yo"],
    queryFn: async () => {
      const res = await fetch("/api/yo");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar el usuario`);
      return res.json() as Promise<Yo>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Azúcar: puede(rol, permiso). Devuelve false mientras carga. */
export function usePermiso(permiso: keyof typeof PERMISOS): boolean {
  const { data } = useYo();
  return puede(data?.rol ?? null, permiso);
}
