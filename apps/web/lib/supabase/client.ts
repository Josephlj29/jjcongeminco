/**
 * lib/supabase/client.ts
 *
 * Cliente Supabase para componentes del lado del cliente (Client Components).
 * Usa @supabase/ssr para mantener la sesión sincronizada con cookies.
 */
import { createBrowserClient } from "@supabase/ssr";

export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
