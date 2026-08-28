import { useQuery } from "@tanstack/react-query";
import type { ResumenDashboard } from "@congeminco/shared";

/** Resumen agregado del dashboard (server-side). Ver GET /api/dashboard. */
export function useDashboard(desde: string, hasta: string) {
  return useQuery({
    queryKey: ["dashboard", desde, hasta],
    queryFn: async () => {
      const params = new URLSearchParams({ desde, hasta });
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar el dashboard`);
      return res.json() as Promise<ResumenDashboard>;
    },
    staleTime: 1000 * 60,
  });
}
