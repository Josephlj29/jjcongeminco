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
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);
