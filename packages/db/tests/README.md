# Pruebas de integración SQL

La lógica de negocio crítica vive en funciones plpgsql (`SECURITY DEFINER`), no en TS.
Estas pruebas se ejecutan **contra una base Postgres real** (Supabase local o una rama),
no en el runner de unit tests, porque dependen de RLS, triggers del ledger y del JWT
del usuario.

## Cómo correrlas localmente

```bash
supabase start                 # Postgres local con las migraciones aplicadas
# o: docker compose up + aplicar packages/db/migrations en orden
```

Luego, en el SQL editor / psql, cada escenario corre dentro de un bloque `DO`
transaccional que **hace ROLLBACK al final** (vía `RAISE EXCEPTION`), así no persiste
datos. Para simular la sesión de un rol se setea el claim del JWT:

```sql
PERFORM set_config('request.jwt.claims',
  json_build_object('sub', '<uuid-de-un-usuario-con-rol-X>', 'role','authenticated')::text, true);
```

`seg.FnRolUsuario()` resuelve el rol leyendo `auth.uid()` (el claim `sub`).

## Escenarios cubiertos (verificados en el remoto el 2026-08-28)

### 1. Atención parcial de requerimientos (migración 0058)

Requerimiento de 10 uds, admin aprobador, otro usuario como creador:

1. Atender 4 → `Situacion = 'parcial'`, `CantidadAtendida = 4`.
2. Intentar atender 7 (pendiente = 6) → **rechazado** ("No puedes entregar mas de lo pendiente").
3. Atender 6 → `Situacion = 'atendido'`, `CantidadAtendida = 10`,
   `T_RequerimientoAtencion` con 2 filas (una por entrega).

Invariantes probadas: acumulación (no sobreescritura), validación contra el saldo
pendiente (no la cantidad total), transición `pendiente → parcial → atendido`,
trazabilidad de múltiples salidas.

### 2. Guard de stock no-negativo (migración 0019)

Una salida (`Direccion = -1`) que dejaría el saldo < 0 lanza `check_violation` (23514).
Vía `/api/documentos` la API la mapea a **409** (antes 500) con `mapearErrorNegocio`.

### 3. Soft-delete atómico (migración 0057)

`inv.FnEliminarConDependencias(entidad, id)`: con dependencias activas devuelve
`{ok:false, dependencias}`; sin dependencias, da de baja (`Estado=false`) y devuelve
`{ok:true}`. El `FOR UPDATE` sobre la fila madre cierra el TOCTOU del check+use.

### 4. Evidencia obligatoria en OTs (migración 0048)

`FnCerrarOrdenMantenimiento` y la rama "aprobar" de `FnReconciliarOrdenMantenimiento`
llaman a `FnExigirEvidenciaMantenimiento`: cerrar sin ≥1 foto `estado_actual` y ≥1
`post_mantenimiento` → excepción.

### 5. Segregación de funciones

El creador de un requerimiento no puede aprobarlo/rechazarlo (admin exento);
quien consume una OT no la reconcilia (admin exento).

> Nota: estos escenarios están listos para portarse a un runner (vitest + `pg`)
> cuando el equipo disponga de Supabase local en CI. El unit-test suite
> (`pnpm turbo test`) cubre la lógica pura en TS (zod, RBAC, mapeo de errores,
> formato) y sí corre en CI.
