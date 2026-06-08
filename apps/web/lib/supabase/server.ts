/**
 * lib/supabase/server.ts
 *
 * Cliente Supabase para Server Components y Route Handlers.
 * Usa @supabase/ssr para persistir la sesión en cookies (patrón oficial).
 *
 * GOTCHA: las tablas viven en los esquemas "inv" y "seg", NO en "public".
 * Siempre usá .schema("inv") o .schema("seg") antes de .from() / .rpc().
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieParaSetear = { name: string; value: string; options: CookieOptions };

export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieParaSetear[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll puede fallar en Server Components de solo lectura;
            // es seguro ignorarlo si el middleware refresca la sesión.
          }
        },
      },
    }
  );
}

/**
 * obtenerUsuario()
 *
 * Valida la sesión del usuario y carga su rol desde seg.T_Usuario JOIN seg.T_Rol.
 * Lanza un error si no hay sesión o si el usuario está inactivo.
 *
 * GOTCHA: usar .schema("seg") porque T_Usuario y T_Rol viven en ese esquema.
 */
export async function obtenerUsuario() {
  const supabase = await crearClienteServidor();

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error("Sin sesión activa");
  }

  const { data: usuarioData, error: usuarioError } = await supabase
    .schema("seg")
    .from("T_Usuario")
    .select(`Id, NombreCompleto, Estado, T_Rol!inner(Codigo)`)
    .eq("Id", authData.user.id)
    .eq("Estado", true)
    .single();

  if (usuarioError || !usuarioData) {
    throw new Error("Usuario no encontrado o inactivo");
  }

  return {
    id: authData.user.id,
    email: authData.user.email ?? null,
    nombreCompleto: usuarioData.NombreCompleto as string | null,
    rol: (usuarioData.T_Rol as unknown as { Codigo: string }).Codigo as import("@congeminco/shared").RoleCode,
  };
}
