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

### 2. Guard de stock no-negativo (migraciones 0019 + 0073)

Una salida (`Direccion = -1`) que dejaría el saldo < 0 lanza `check_violation` (23514).
Vía `/api/documentos` la API la mapea a **409** (antes 500) con `mapearErrorNegocio`.

Desde 0073 el mensaje además tiene que ser legible para quien está en almacén. El
texto del `RAISE` viaja sin tocarse hasta el toast del navegador
(`body.error` → `throw new Error` → `toast.error`), así que es interfaz de usuario,
no solo un log. Escenario ejecutable, verificado en el remoto el 2026-09-23 (rojo
contra 0019, verde con 0073 aplicada):

```bash
psql "$DATABASE_URL" -f packages/db/tests/0073_stock_insuficiente_legible.sql
```

Crea producto y almacén de prueba, ingresa 1 unidad, intenta sacar 4 y verifica
sobre el mensaje capturado: SQLSTATE `23514`, que aparezcan nombre y SKU del
producto, el nombre de la ubicación, `disponible 1` / `sacar 4` / `faltan 3`, y que
**no** aparezca ningún UUID. Todo dentro de un bloque `DO` que termina en
`RAISE EXCEPTION` (rollback): no persiste nada. Salida esperada: una excepción
`OK 0073: ...`; si algo falla, el mensaje enumera qué aserción se rompió.

### 3. Soft-delete atómico (migración 0057)

`inv.FnEliminarConDependencias(entidad, id)`: con dependencias activas devuelve
`{ok:false, dependencias}`; sin dependencias, da de baja (`Estado=false`) y devuelve
`{ok:true}`. El `FOR UPDATE` sobre la fila madre cierra el TOCTOU del check+use.

### 4. OT con fotos por tarea y repuestos en borrador (migraciones 0067 + 0068)

`FnRegistrarOrdenMantenimiento` recibe los trabajos con `UrlFotoAntes`/`UrlFotoDespues`
opcionales y un `Consumo` opcional que se guarda como **borrador** en
`T_OrdenMantenimientoRepuesto` (+ almacén/proveedor/comprobante en la cabecera).
El stock se descuenta **al aprobar**, no al registrar (decisión de negocio 2026-09-03).

1. El alta NO genera ningún documento de inventario (se verifica que no exista
   documento con la referencia `OT <NumeroOrden>`). Desde 0070 toda OT nueva nace
   `abierta`; con 0068 nacía `consumida` (ver escenario 4c).
2. `V_OrdenMantenimientoRepuesto` expone el borrador con costo estimado: compra directa
   al costo declarado, stock al `CostoPromedio` vigente.
3. `FnActualizarOrdenMantenimiento` acepta el mismo payload con `Consumo` y reemplaza el
   borrador completo (agregar, subir, bajar, quitar). Quitar todas las líneas deja la
   cabecera de consumo en NULL. Desde 0070 editar NO cambia la situación (ver 4c).
4. Validaciones del borrador: almacén activo, producto activo, cantidad > 0, compra
   directa exige costo > 0 y proveedor + comprobante ("La compra directa requiere
   proveedor y comprobante.").
5. Una OT legada con `IdRequerimiento` (ya descontó stock con el flujo anterior) NO se
   edita: "Esta orden ya desconto stock".
6. `FnReconciliarOrdenMantenimiento(aprobar = true)` convierte el borrador en
   requerimiento atendido + entrada por compra directa + UNA salida + fila en
   `T_RequerimientoAtencion`, y cierra. Sin repuestos solo cierra. Legadas: solo cierra.
7. `FnReconciliarOrdenMantenimiento(aprobar = false)` anula sin tocar el kardex;
   legadas: reversa(s) al `CostoUnitario` exacto del ledger (0066).
8. `FnConsumirRepuestosOrdenMantenimiento` ya no existe; la evidencia por orden
   (`T_OrdenMantenimientoEvidencia`, `FnExigirEvidenciaMantenimiento`) se eliminó en 0067.

Los puntos 1 a 5 están cubiertos por el bloque `DO` de prueba que acompaña a 0068
(corrido con ROLLBACK contra el remoto el 2026-09-03). Los puntos 6 y 7 requieren el
claim JWT de un aprobador y quedan para el runner.

### 4b. Culminar por repuestos y devolver a abierta (migración 0069)

Verificado en el remoto el 2026-09-03, en transacción con ROLLBACK y con la sesión
simulada de un usuario `admin` (`set_config('request.jwt.claims', ...)`), que es lo
que exige la revalidación de rol de las funciones `SECURITY DEFINER`:

1. `FnCerrarOrdenMantenimiento` devuelve la situación destino: `cerrada` si la OT
   no tiene repuestos en borrador, `consumida` si los tiene. Culminar NO mueve el
   saldo en ninguno de los dos casos.
2. `FnReabrirOrdenMantenimiento` devuelve una OT `consumida` a `abierta`
   conservando el borrador de repuestos y dejando el motivo en
   `MotivoReconciliacion` con el prefijo "Devuelta a abierta:".
3. Ida y vuelta completa: devolver a abierta → editar (reemplaza el borrador) →
   la OT vuelve a `consumida`.
4. **Aprobar descuenta el stock recién ahí**: tras `FnReconciliarOrdenMantenimiento`
   con `PAprobar = true`, la OT queda `cerrada` con requerimiento enlazado, hay una
   fila en `T_RequerimientoAtencion` y `T_SaldoStock.CantidadDisponible` bajó
   exactamente la cantidad del borrador. Este es el escenario que quedó pendiente
   al aplicar 0068 y se cubrió acá.
5. Se rechaza devolver a abierta una OT `cerrada`, y devolver a abierta o culminar
   una OT legada que ya descontó stock ("ya desconto stock").

### 4c. La orden nace abierta y solo culminar la mueve (migración 0070)

Verificado en el remoto el 2026-09-03, en transacción con ROLLBACK y sesión de `admin`
simulada. Corrige la regla de alta de 0068, que mandaba toda orden nueva a la bandeja
del aprobador aunque estuviera a medio cargar:

1. El alta deja la OT en `abierta`, tenga o no repuestos en el borrador.
2. Editar y AGREGAR repuestos a una `abierta` NO la promueve: sigue `abierta`. En 0068
   la promovía sola a `consumida`, pisando la decisión de quien carga.
3. `FnCerrarOrdenMantenimiento` (culminar) es el único paso que la mueve: `consumida`
   si tiene repuestos, `cerrada` si no. No toca el saldo en ninguno de los dos casos.
4. Quitar todos los repuestos y culminar la deja `cerrada`.
5. Aprobar la que quedó `consumida` la cierra y recién ahí baja `T_SaldoStock`,
   exactamente en la cantidad del borrador.

### 4d. El admin reabre una OT cerrada por error (migración 0074)

Verificado en el remoto el 2026-09-24 (rojo contra 0069, verde con 0074 aplicada):

```bash
psql "$DATABASE_URL" -f packages/db/tests/0074_reabrir_orden_cerrada.sql
```

Hasta 0069 `cerrada` era terminal para todos los roles y un cierre por error solo se
arreglaba con un UPDATE a mano. El agujero está en el flujo: una OT que se culmina
**sin repuestos** no pasa por aprobación, va derecho a `cerrada` (ver 4c, punto 3),
o sea que el camino menos controlado es el que deja el estado irreversible.

1. `admin` devuelve a `abierta` una OT `cerrada` que nunca descontó stock.
2. Un rol que no es admin NO puede: la función responde `42501`.
3. Nadie reabre una `cerrada` que ya descontó stock, ni el admin. Eso se corrige por
   el ledger (anular o corregir el documento de salida), no cambiando la situación.
4. No se rompe el caso previo: `consumida` → `abierta` sigue disponible para
   admin, gerencia y supervisión.

El escenario simula la sesión de cada rol con `set_config('request.jwt.claims', ...)`.
Ojo: hoy la base solo tiene usuarios con rol `admin`, `almacenero` y `logistica`, así
que el caso negativo usa `almacenero`.

### 6. Trazabilidad de la carga y saldo corrido del kardex (migraciones 0075 + 0076)

Verificado en el remoto el 2026-10-21 (rojo antes de aplicar, verde después):

```bash
psql "$DATABASE_URL" -f packages/db/tests/0075_0076_trazabilidad_y_saldo_corrido.sql
```

Un documento se fecha con el **día contable**, que puede ser anterior al día en que
se cargó y debe poder serlo. El efecto colateral es que dos cargas muy distintas se
ven iguales en el kardex. Caso real (`CON-011`): la carga inicial del 02/09 08:41 y
una entrada hecha el 04/09 23:37 pero fechada al 02/09 aparecían como "dos ingresos
del mismo día".

1. `V_MovimientoStock_Kardex` y `V_Reporte_Movimiento` exponen `FechaRegistro`
   (TIMESTAMPTZ real de carga) y `RegistradoPor`.
2. `seg.FnNombreUsuario` resuelve el nombre **sin abrir `seg.T_Usuario`**, cuya RLS
   solo deja leer la fila propia salvo para admin: un JOIN directo desde una vista
   `security_invoker` le mostraría el nombre al admin y NULL al resto. Devuelve el
   valor tal cual si no es un uid (`API`, `Sistema`, un correo) o si el uid ya no
   existe, y NULL solo para NULL o cadena vacía.
3. El `SaldoCorrido` acumula en el orden en que se lee el kardex: fecha contable,
   luego fecha real de carga. Antes desempataba por el UUID del movimiento, que es
   **aleatorio**: con dos movimientos en la misma fecha el acumulado salía en
   cualquier orden (`FILTRO-015` mostraba 10 → 7 → 8 → 9 → 6 con tres salidas de 1).
   El total final nunca estuvo mal, porque la suma no depende del orden; lo que
   fallaba era el camino, que es justo lo que se audita. Al aplicar 0076 había 33
   movimientos afectados sobre 29 productos.

### 7. Almacén de consumo de OT restringido por rol (migración 0078)

> ⚠️ **La migración 0078 NO está aplicada en el remoto** (verificado el
> 2026-10-28: no existen `seg.T_RolUbicacionConsumo` ni
> `seg.FnUbicacionesConsumoUsuario`, y no figura en `schema_migrations`).
> `apps/web/lib/supabase/server.ts` llama a esa RPC y cae a `?? null`, o sea
> "sin restricción": **hoy el almacenero puede elegir cualquier almacén**. Este
> escenario no se puede correr hasta aplicarla.

Verificado en el remoto el 2026-10-24 (rojo antes de aplicar; verde corriendo la
migración y la prueba en una sola transacción, sin persistir):

```bash
psql "$DATABASE_URL" -f packages/db/tests/0078_almacen_consumo_por_rol.sql
```

`seg.T_RolUbicacionConsumo` define de qué almacenes descuenta cada rol en una OT
(rol sin filas = sin restricción). Hoy: almacenero → Tambomayo.

1. almacenero registra una OT con repuestos desde Tambomayo.
2. almacenero NO la registra desde otro almacén: `42501` y el mensaje nombra Tambomayo.
3. almacenero tampoco cambia el almacén al editar.
4. una OT sin repuestos no exige almacén.
5. admin registra desde cualquier almacén.
6. `seg.FnUbicacionesConsumoUsuario()`: almacenero recibe solo Tambomayo; admin `NULL`.

### 8. Flota de tres niveles y camiones opción A (migración 0079)

```bash
psql "$DATABASE_URL" -f packages/db/tests/0079_flota_lineas_tipos_equipos.sql
```

Solo LEE, así que no necesita rollback. Verificado en el remoto el 2026-10-28
(rojo antes de 0079 con `FALLA 1a`, verde después). 24 aserciones sobre:

1. `inv.T_LineaEquipo` existe con `TRACKLESS` y `LIVIANA`, y `T_TipoEquipo.IdLinea`
   es `NOT NULL`: la línea dejó de vivir dentro del código del tipo.
2. Ningún tipo activo conserva el prefijo `LIN`; cada línea agrupa los tipos que
   le tocan; `CAMIONETA` y `MINIBUS` ya no se llaman por el USO de las unidades.
3. **Opción A de camiones**: `CAMION-GRUA` tiene solo `CAMION-01/VDS927` y
   `CAMION-CISTERNA` solo `CAMION-02/VCZ891`; cada producto del chasis quedó
   compatible con AMBOS; **ninguna compatibilidad activa apunta a un tipo dado de
   baja** y **ningún producto activo queda invisible para todas las placas** —
   ese era el bug de fondo: el filtro va placa → equipo → tipo, y los tipos sin
   equipos escondían sus productos.
4. Los códigos de equipo son los 10 esperados, sin espacios sobrantes.
5. `T_Equipo.IdTipoEquipo` y `T_Vehiculo.IdEquipo` son `NOT NULL`, los dos
   telehandler tienen placa (su código interno) y ningún equipo queda sin placa.
6. `FnContarDependencias('lineaEquipo', …)` cuenta los tipos colgados y bloquea
   la baja de una línea en uso.

### 9. Catálogo de dos niveles (migración 0080)

```bash
psql "$DATABASE_URL" -f packages/db/tests/0080_familias_categorias.sql
```

Dos bloques. El primero solo lee. El segundo prueba el trigger: si el trigger
funciona los INSERT se rechazan y no escriben nada, y el `RAISE` del final
deshace lo único que sí se inserta (el caso válido). Verificado en el remoto el
2026-10-28 (rojo antes con `FALLA 1a`: solo había 6 familias).

Bloque 1 — estructura: 15 familias activas (las 14 del plan **más FAM-REP**, que
sigue en pie a propósito), todas en la raíz; las 34 categorías colgadas de la
familia exacta que les toca; ninguna categoría suelta ni con código fuera del
estándar; ningún tercer nivel; las 8 fusionadas y las 2 vacías dadas de baja sin
dejar productos activos detrás; los destinos de fusión con la cantidad exacta
(`CAT-FOCO=34`, `CAT-FRENO=11`, …) y **436 productos activos**, los mismos de
antes: la fusión mueve, no borra.

> `T_Producto` tiene 443 **filas** y 436 **activas**. No confundirlas: el Excel de
> la reestructuración se generó con los 436 activos.

Bloque 2 — el trigger `TR_T_Categoria_Jerarquia`: rechaza colgar una categoría de
otra categoría (tercer nivel), **permite** colgarla de una familia, rechaza que
sea su propio padre y rechaza que una familia con hijas pase a ser categoría.

> Pendiente fuera de alcance: los 94 productos colgados directo de `FAM-CON` y los
> 67 de `FAM-REP` se reparten uno por uno con `Revision-catalogo-productos.xlsx`.
> El test lo fija como aserción (`FALLA 7a`) para que nadie los "limpie" sin esa
> decisión.

### 5. Segregación de funciones

El creador de un requerimiento no puede aprobarlo/rechazarlo (admin exento);
quien registró el borrador de repuestos de una OT no la aprueba (admin exento).

> Nota: estos escenarios están listos para portarse a un runner (vitest + `pg`)
> cuando el equipo disponga de Supabase local en CI. El unit-test suite
> (`pnpm turbo test`) cubre la lógica pura en TS (zod, RBAC, mapeo de errores,
> formato) y sí corre en CI.
