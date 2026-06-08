# Sistema de Inventario — JJ Congeminco

Monorepo (pnpm + Turborepo) del sistema de inventario para JJ Contratistas Generales
Minería y Construcción. Backend Node.js (Fastify) + frontend React, sobre Supabase
(PostgreSQL + Auth + Storage). Base de datos normalizada bajo el **estándar BSG**.

## Estructura

```
apps/
  web/        React + Tailwind + shadcn (Vite)
  api/        Fastify + @supabase/supabase-js
packages/
  shared/     contrato de tipos: roles, DTOs (zod), modelos
  db/         migraciones SQL, seed y ETL (estándar BSG)
RecursosExcel/  los 6 KARDEX originales (fuente del catálogo)
```

## Arquitectura de datos (resumen)

Patrón ERP de 3 capas — el ledger es la única fuente de verdad:

```
inv.T_DocumentoInventario → inv.T_DocumentoInventarioDetalle
        → inv.FnRegistrarDocumentoInventario() / FnConfirmarDocumentoInventario()
        → inv.T_MovimientoStock (LEDGER append-only, inmutable)
        → trigger → inv.T_SaldoStock (cache de saldos)
```

Detalle del esquema en [packages/db/README.md](packages/db/README.md).

## Puesta en marcha

### 1. Dependencias
```bash
pnpm install
```

### 2. Variables de entorno
Creá `/.env` (raíz) y `apps/web/.env.local` con tus credenciales de Supabase
(ver plantillas más abajo). Valores en **Supabase → Project Settings → API** y
**→ Database → Connection string**.

`.env` (raíz):
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
SUPABASE_URL=https://[REF].supabase.co
SUPABASE_ANON_KEY=[ANON]
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE]
API_PORT=3001
```

`apps/web/.env.local`:
```
VITE_SUPABASE_URL=https://[REF].supabase.co
VITE_SUPABASE_ANON_KEY=[ANON]
VITE_API_URL=http://localhost:3001
```

### 3. Base de datos
```bash
pnpm db:migrate    # crea esquemas comun/seg/inv, tablas, ledger, vistas, RLS
pnpm db:seed       # roles, unidades, categorías/familias, ubicaciones
pnpm db:etl        # carga el catálogo de productos desde los 6 Excel
```

### 4. Exponer esquemas a la Data API (PASO OBLIGATORIO)
Las tablas viven en los esquemas `inv` y `seg`, no en `public`. En
**Supabase → Project Settings → API → Exposed schemas** agregá `inv` y `seg`.
Sin esto, supabase-js falla con "relation does not exist".

### 5. Crear el primer usuario administrador
Un usuario de Supabase Auth no puede operar hasta tener fila en `seg.T_Usuario`.
Tras crear el usuario en **Supabase → Authentication → Users**, ejecutá en el SQL Editor:

```sql
INSERT INTO "seg"."T_Usuario" ("Id","NombreCompleto","IdRol")
SELECT
    U."id"
    ,'Administrador'
    ,(SELECT "Id" FROM "seg"."T_Rol" WHERE "Codigo" = 'admin')
FROM "auth"."users" U
WHERE U."email" = 'admin@congeminco.com';
```

### 6. Levantar todo
```bash
pnpm dev    # turbo: API (3001) + web (5173)
```

## Roles
`admin` (todo) · `gerencia` (lectura + reportes) · `supervision` (salidas/transferencias)
· `almacenero` (entradas/salidas/transferencias + productos). Aplicados por **RLS**
en la BD y reforzados en la API.

## Alcance Fase 1
Catálogo de productos, entradas/salidas/transferencias, saldos multi-almacén,
dashboard, kardex, carga masiva CSV. Valorización, mantenimiento y guía de
remisión electrónica quedan para fases siguientes (estructura ya preparada).
