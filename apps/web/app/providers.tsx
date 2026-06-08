"use client";

/**
 * app/providers.tsx
 *
 * Providers del lado del cliente: TanStack Query.
 * Se monta en el root layout para que todas las páginas tengan acceso al QueryClient.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // Crear QueryClient una sola vez por ciclo de vida del cliente
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60, // 1 minuto
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
