# @congeminco/web — Next.js App Router + Cloudflare Workers

Sistema de inventario JJ Congeminco. App Next.js 15 (App Router) con Route Handlers que reemplazan a la API Fastify, deployable a Cloudflare Workers vía `@opennextjs/cloudflare`.

## Variables de entorno requeridas

Crear `.env.local` (desarrollo local):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

En Cloudflare Workers (producción), configurar vía Wrangler o dashboard:

```bash
# Variables públicas (se leen en runtime en Workers)
wrangler secret put NEXT_PUBLIC_SUPABASE_URL
wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY

# Clave secreta — nunca en el cliente
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

## Desarrollo local

```bash
pnpm dev
```

El middleware de `@supabase/ssr` refresca la sesión automáticamente en cada request.

## Build y deploy a Cloudflare Workers

```bash
# 1. Build Next.js
pnpm build

# 2. Build OpenNext para Workers
pnpm cf:build

# 3. Preview local con Miniflare
pnpm cf:preview

# 4. Deploy
pnpm cf:deploy
```

## Supabase — configuración requerida

### Esquemas expuestos en PostgREST

En el dashboard de Supabase → Settings → API → "Exposed schemas", agregar:
- `inv`
- `seg`

Sin esto, todas las consultas a tablas fuera de `public` fallarán con 404.

### Storage bucket "productos"

Crear un bucket llamado `productos` (público) para las imágenes de productos.
Configurar políticas RLS que permitan a usuarios autenticados subir a la carpeta `{idProducto}/*`.

## Arquitectura

```
apps/web/
├── app/
│   ├── (auth)/login/       # Página de login (Client Component)
│   ├── (app)/              # Zona protegida (layout verifica sesión server-side)
│   │   ├── page.tsx        # Dashboard
│   │   ├── productos/
│   │   ├── movimientos/
│   │   ├── requerimientos/
│   │   ├── reportes/
│   │   └── importar/
│   └── api/                # Route Handlers (reemplazan apps/api Fastify)
│       ├── yo/
│       ├── catalogo/{categorias,unidades,ubicaciones,proveedores}/
│       ├── productos/[id]/{imagenes,historial-requerimientos}/
│       ├── saldos/
│       ├── kardex/[idProducto]/
│       ├── documentos/
│       ├── requerimientos/
│       ├── equipos/
│       ├── vehiculos/
│       ├── importaciones/productos/
│       └── reportes/{movimientos,valorizado}/
├── components/
│   ├── layout/AppSidebar   # Client Component
│   └── ui/                 # Shadcn components
├── hooks/                  # TanStack Query hooks
├── lib/
│   ├── supabase/
│   │   ├── server.ts       # createServerClient + obtenerUsuario()
│   │   ├── client.ts       # createBrowserClient
│   │   └── admin.ts        # service-role (solo importaciones masivas)
│   ├── api-auth.ts         # Helper de auth para Route Handlers
│   └── utils.ts
└── middleware.ts            # Refresca sesión @supabase/ssr
```

## GOTCHA crítico: esquemas PostgREST

Todas las tablas del sistema viven en esquemas `inv` o `seg`, **NO en `public`**.
Siempre usar `.schema("inv")` o `.schema("seg")` antes de `.from()` o `.rpc()`.

```typescript
// CORRECTO
supabase.schema("inv").from("T_Producto").select("*")
supabase.schema("inv").rpc("FnRegistrarDocumentoInventario", { ... })

// INCORRECTO — busca en "public"
supabase.from("T_Producto").select("*")
```

## Runtime de Route Handlers

Todos los Route Handlers declaran `export const runtime = "nodejs"` porque:
1. `@supabase/ssr` usa APIs de Node (cookies, crypto) no disponibles en Edge
2. El parseo de `multipart/form-data` en importaciones requiere Node

En Cloudflare Workers, el flag `nodejs_compat` en `wrangler.jsonc` habilita estas APIs.
