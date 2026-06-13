/**
 * lib/supabase/admin.ts
 *
 * Cliente Supabase con service-role key.
 *
 * USO RESTRINGIDO: solo para operaciones que necesitan bypassear RLS.
 * En este proyecto, se usa exclusivamente para importaciones masivas de productos.
 *
 * NUNCA expongas este cliente al navegador ni lo importes desde Client Components.
 *
 * GOTCHA: sigue requiriendo .schema("inv") para tablas fuera de "public".
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let clienteAdmin: SupabaseClient | null = null;

/**
 * Crea (o reutiliza) el cliente service-role de forma LAZY.
 *
 * No se construye al importar el módulo: si se hiciera, el build de Next
 * (al "collect page data") lo evaluaría sin tener la SERVICE_ROLE_KEY
 * disponible y fallaría con "supabaseUrl/supabaseKey is required".
 * Aquí se crea recién al ejecutar el handler, donde el runtime ya tiene las env.
 */
export function crearClienteAdmin(): SupabaseClient {
  if (clienteAdmin) return clienteAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno."
    );
  }

  clienteAdmin = createClient(url, key, { auth: { persistSession: false } });
  return clienteAdmin;
}
