# @congeminco/db — Esquema, seed y ETL del inventario

Base de datos PostgreSQL (Supabase) del sistema de inventario JJ Congeminco.
Diseño normalizado con patrón ERP de 3 capas: **Documento → Detalle → Ledger inmutable → Saldos (cache)**.
Nomenclatura y estructura siguen el **estándar BSG** adaptado a PostgreSQL.

## Convenciones BSG aplicadas

- Objetos en **PascalCase español**, identificadores **citados** (`"T_Producto"`, `"Id"`) para preservar mayúsculas en Postgres.
- Tablas con prefijo `T_`, vistas `V_`. Nada en `public`/`dbo`: esquemas por área **`comun`**, **`seg`**, **`inv`**.
- PK llamada `"Id"` (este proyecto usa **UUID en todas las PK** por Supabase Auth).
- Constraints nombradas: `PK_`, `FK_<Tabla>_<Ref>_<CampoFK>`, `CHK_`, `UQ_`. (Los `DEFAULT` no se nombran: Postgres no lo soporta como objeto.)
- **Campos de auditoría** en cada tabla: `Estado`, `UsuarioCreacion`, `UsuarioModificacion`, `FechaCreacion`, `FechaModificacion`, `RowVersion` (bigint vía trigger), `IdMigracion`.
- Comentarios internos con `/* */`; bloque header de vistas/funciones con la plantilla `-- ===`. Todos los campos documentados.
- Palabras reservadas, tipos y funciones built-in en MAYÚSCULAS; identación con tabs.

## Modelo (resumen)

```
inv.T_DocumentoInventario (cabecera)
        │
        ▼
inv.T_DocumentoInventarioDetalle (líneas)
        │  inv.FnConfirmarDocumentoInventario()
        ▼
inv.T_MovimientoStock (LEDGER append-only ← fuente de verdad)
        │  trigger
        ▼
inv.T_SaldoStock (cache O(1) por producto+ubicación)
```

- El **ledger** nunca se edita ni borra (triggers lo bloquean). Para revertir → anular el documento.
- El **saldo se deriva**; el cache se reconcilia contra `inv.V_MovimientoStock_SaldoReconciliacion`.
- **Multi-almacén** desde el inicio (`inv.T_Ubicacion`).
- `CostoUnitario` presente pero nullable → valorización futura sin migración.

## Variables de entorno

`.env` en la raíz del monorepo:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

(Supabase local: `supabase start` expone Postgres en el puerto 54322.)

## Comandos

```bash
pnpm db:migrate    # aplica migrations/*.sql en orden (idempotente)
pnpm db:seed       # roles, unidades, categorías/familias, ubicaciones
pnpm db:etl        # migra SOLO el catálogo (productos) de los 6 Excel
pnpm --filter @congeminco/db reconcile   # verifica cache de saldos vs ledger
```

Orden: `migrate` → `seed` → `etl`.

## Alcance del ETL

- **Solo catálogo**: inserta `inv.T_Producto` desde la hoja `Productos` de cada Excel.
- **NO** migra movimientos ni saldos: entradas, salidas y existencias se configuran/registran desde cero en el sistema.
- Familias y categorías vienen del **seed**.
- Dedupe de `Sku` global (el prefijo `AF` se repite entre Filtros y Aceites). Cada producto migrado lleva `IdMigracion` y `UsuarioCreacion = 'ETL'`.

## Migraciones

| Archivo | Contenido |
|---|---|
| `0001_extensions_and_roles.sql` | esquemas, extensiones, `seg.T_Rol`, `seg.T_Usuario`, `seg.FnRolUsuario()`, auditoría |
| `0002_catalog.sql` | `T_UnidadMedida`, `T_Categoria`, `T_Producto` (con `UrlImagen`), `T_Ubicacion`, `T_Proveedor`, `T_Vehiculo` |
| `0003_documents_ledger_balances.sql` | `T_DocumentoInventario`, `T_DocumentoInventarioDetalle`, `T_MovimientoStock`, `T_SaldoStock`, triggers, `FnConfirmarDocumentoInventario()` |
| `0004_views_and_imports.sql` | vistas `V_` + `T_Importacion` |
| `0005_rls.sql` | políticas RLS por rol |
