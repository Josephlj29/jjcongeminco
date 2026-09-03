# Plan de QA de alto nivel — Inventario JJ Congeminco

Pruebas por flujo y casuística (happy / borde / error / RBAC). Cada caso indica el
**método**: `backend` = ejecutable contra la BD (función/constraint/trigger) — ejecutado en vivo, ver
[resultados-ejecucion.md](./resultados-ejecucion.md); `manual` = requiere la app con sesión de un rol
(RLS y guards por rol no son fieles vía service-role).

- **Entorno**: Supabase `iqaqjbluzbbxfntzcrtp`, esquema `inv`/`seg`.
- **Baseline**: 222 productos, 0 movimientos/saldos, 2 almacenes (ALM-AQP, PROY-TAM), 5 tipos de equipo, 5 roles (admin, gerencia, supervision, almacenero, logistica).
- **Convención de datos de prueba**: SKUs/códigos con prefijo `ZZ` y limpieza posterior, o transacciones que revierten (no se contamina el catálogo).

---

## 1. Catálogo — Productos (`inv.FnGuardarProducto`, guard `FnBloquearTipoEnProductoGeneral`)

| ID | Caso | Tipo | Precondición | Acción / Datos | Esperado | Método |
|----|------|------|--------------|----------------|----------|--------|
| PROD-01 | Crear producto general | happy | categoría/unidad existen | EsGeneral=true, IdsTipoEquipo=[] | Crea producto; sin filas en puente | backend |
| PROD-02 | Crear producto con 1 tipo | happy | tipo CAMION existe | EsGeneral=false, IdsTipoEquipo=[CAMION] | Crea producto + 1 fila puente | backend |
| PROD-03 | Crear con varios tipos | happy | — | EsGeneral=false, tipos=[CAMION,GRUA] | Crea + 2 filas puente | backend |
| PROD-04 | Invariante: general con tipos | error | — | EsGeneral=true, tipos=[CAMION] | RAISE `Un producto general no lleva tipos de equipo.` | backend |
| PROD-05 | Invariante: no-general sin tipos | error | — | EsGeneral=false, tipos=[] | RAISE `Elige al menos un tipo de equipo o marca el producto como general.` | backend |
| PROD-06 | Guard puente en general | error | producto general existe | INSERT directo en T_ProductoTipoEquipo | RAISE `Un producto marcado como general no puede tener tipos...` | backend |
| PROD-07 | SKU único | error | SKU existe | INSERT producto con SKU repetido | viola UQ (unique_violation) | backend |
| PROD-08 | Editar: reemplaza compatibilidad | happy | producto con 2 tipos | guardar con tipos=[BUS] | queda solo BUS (reemplazo, no acumula) | backend |
| PROD-09 | Edición cambia general→específico | borde | producto general | EsGeneral=false + tipos=[GRUA] | flip correcto, puente con GRUA | backend |

## 2. Catálogo — Categorías / Familias (`inv.T_Categoria`, `FnContarDependencias`)

| ID | Caso | Tipo | Precondición | Acción | Esperado | Método |
|----|------|------|--------------|--------|----------|--------|
| CAT-01 | Jerarquía familia→categoría | happy | — | crear familia (padre NULL) + hija | hija con IdCategoriaPadre = familia | backend |
| CAT-02 | Código único | error | código existe | crear categoría con código repetido | unique_violation | backend |
| CAT-03 | No duplicar nombre familia=categoría | regресión | — | revisar catálogo actual | 0 nombres de categoría repetidos | backend |
| CAT-04 | Eliminar categoría con productos | error | categoría con productos | DELETE / FnContarDependencias | `puedeEliminar=false` (tiene productos) | backend |
| CAT-05 | Eliminar familia vacía | happy | familia sin hijos/productos | eliminar | permite | manual |

## 3. Importación de Productos (`inv.FnImportarProductos`)

| ID | Caso | Tipo | Datos | Esperado | Método |
|----|------|------|-------|----------|--------|
| IMP-P-01 | Crear lote válido | happy | filas nuevas, modo crear | cantidadCorrectas=N, creados=N, errores=[] | backend |
| IMP-P-02 | Categoría inexistente | error | CodigoCategoria='NO-EXISTE' | error fila `CATEGORIA_NO_EXISTE` | backend |
| IMP-P-03 | Unidad inexistente | error | CodigoUnidad='ZZ' | `UNIDAD_NO_EXISTE` | backend |
| IMP-P-04 | Tipo de equipo inexistente | error | TiposEquipo=[TRACTOR] | `TIPO_EQUIPO_NO_EXISTE` | backend |
| IMP-P-05 | Invariante general+tipos | error | EsGeneral=true + tipos | `INVARIANTE_GENERAL` | backend |
| IMP-P-06 | Campo requerido (Sku vacío) | error | Sku='' | `CAMPO_REQUERIDO` | backend |
| IMP-P-07 | SKU duplicado en archivo | error | dos filas mismo SKU | `SKU_DUPLICADO` (repetido en archivo) | backend |
| IMP-P-08 | SKU existente en modo crear | error | SKU ya en BD, modo crear | `SKU_DUPLICADO` (ya existe) | backend |
| IMP-P-09 | Todo-o-nada | borde | 1 fila válida + 1 con error | NO inserta nada (cantidadCorrectas=0) | backend |
| IMP-P-10 | Upsert actualiza existente | happy | SKU en BD, modo upsert | actualizados≥1, reemplaza datos+tipos | backend |
| IMP-P-11 | SKU case-insensitive (A4) | error | 'zztest' vs 'ZZTEST' en mismo archivo | `SKU_DUPLICADO` (no distingue mayúsculas) | backend |
| IMP-P-12 | Auditoría atómica (C4) | borde | lote con error | fila en T_Importacion con Situacion='fallido' | backend |
| IMP-P-13 | Solo admin importa | RBAC | rol almacenero/logística | 403 en endpoint | manual |

## 4. Importación de Saldos (`inv.FnImportarSaldosIniciales`)

| ID | Caso | Tipo | Datos | Esperado | Método |
|----|------|------|-------|----------|--------|
| IMP-S-01 | Inicial crea existencia | happy | modo inicial, producto sin saldo | saldo=cantidad, costo promedio=costo, documento existencia_inicial | backend |
| IMP-S-02 | No escribe T_SaldoStock directo | invariante | tras IMP-S-01 | existe documento + movimiento +1 (no insert directo) | backend |
| IMP-S-03 | Inicial rechaza saldo previo | error | producto ya con saldo | `SALDO_YA_EXISTE` | backend |
| IMP-S-04 | Recuento ajusta a la baja | happy | saldo 100, recuento 80 | ajuste salida 20, saldo=80 | backend |
| IMP-S-05 | Recuento ajusta al alza | happy | saldo 80, recuento 130 | ajuste entrada 50, saldo=130 | backend |
| IMP-S-06 | SKU inexistente | error | Sku='ZZ' | `SKU_NO_EXISTE` | backend |
| IMP-S-07 | Ubicación inexistente | error | CodigoUbicacion='ZZ' | `UBICACION_NO_EXISTE` | backend |
| IMP-S-08 | Cantidad inválida | error | Cantidad=0 / no numérica | `CANTIDAD_INVALIDA` | backend |
| IMP-S-09 | Costo negativo | error | CostoUnitario=-5 | `COSTO_INVALIDO` | backend |
| IMP-S-10 | Duplicado ubicación+sku | error | par repetido en archivo | `DUPLICADO` | backend |
| IMP-S-11 | Todo-o-nada | borde | 1 ok + 1 error | no aplica nada | backend |

## 5. Movimientos y Documentos (`FnRegistrarDocumentoInventario`, `FnConfirmarDocumentoInventario`, triggers)

| ID | Caso | Tipo | Acción | Esperado | Método |
|----|------|------|--------|----------|--------|
| MOV-01 | Existencia inicial valoriza | happy | doc existencia_inicial +1 | saldo y costo promedio actualizados | backend |
| MOV-02 | Entrada compra recalcula promedio | happy | 2 entradas distinto costo | costo promedio móvil = (q1·c1+q2·c2)/(q1+q2) | backend |
| MOV-03 | Salida valoriza al promedio | happy | salida tras entradas | movimiento -1 con CostoUnitario=promedio vigente | backend |
| MOV-04 | Transferencia mueve costo | happy | transfer A→B | 2 movimientos (−1 origen, +1 destino) mismo costo; promedio NO cambia | backend |
| MOV-05 | Ajuste +/- | happy | ajuste entrada/salida | saldo ajustado por dirección | backend |
| MOV-06 | Stock no-negativo (guard 0019) | error | salida > saldo disponible | RAISE (saldo insuficiente / no negativo) | backend |
| MOV-07 | Ledger inmutable: UPDATE | error | UPDATE T_MovimientoStock | RAISE `T_MovimientoStock es inmutable...` | backend |
| MOV-08 | Ledger inmutable: DELETE | error | DELETE T_MovimientoStock | RAISE inmutable | backend |
| MOV-09 | CHECK ubicaciones por tipo | error | transferencia origen=destino | viola CHK ubicaciones | backend |
| MOV-10 | Salida requiere placa (UI) | error | salida sin IdVehiculo | Zod refine bloquea | manual |
| MOV-11 | Confirmar solo borrador | error | confirmar doc ya confirmado | RAISE `Solo se confirman documentos en borrador...` | backend |

## 6. Valorización (`FnRecalcularCostoPromedio`, `FnHistorialPreciosProducto`)

| ID | Caso | Tipo | Acción | Esperado | Método |
|----|------|------|--------|----------|--------|
| VAL-01 | Promedio móvil correcto | happy | entradas 100@22, 200@24 | promedio=23.33 | backend |
| VAL-02 | Transferencia no contamina promedio | invariante | transfer | promedio del producto sin cambio | backend |
| VAL-03 | Histórico de precios por lote (FIFO) | happy | varias entradas | FnHistorialPreciosProducto retorna lotes con remanente FIFO | backend |
| VAL-04 | Histórico excluye anulados | borde | documento anulado | no figura como lote vigente | backend |

## 7. Requerimientos y Aprobaciones (`FnAtenderRequerimiento`, `FnAnularRequerimiento`)

| ID | Caso | Tipo | Acción | Esperado | Método |
|----|------|------|--------|----------|--------|
| REQ-01 | Crear requerimiento (equipo o placa) | happy | crear con IdVehiculo | crea pendiente con detalle | backend |
| REQ-02 | Aprobar genera salida valorizada | happy | atender con líneas stock | doc salida, req atendido, saldo baja | backend |
| REQ-03 | Solo pendientes se aprueban | error | atender req atendido | RAISE `Solo se aprueban requerimientos pendientes...` | backend |
| REQ-04 | Entrega parcial | happy | cantidad < solicitada | atiende parcial, CantidadAtendida correcta | backend |
| REQ-05 | No entregar más de lo solicitado | error | cantidad > solicitada | RAISE `No puedes entregar mas de lo solicitado...` | backend |
| REQ-06 | Líneas duplicadas | error | dos IdDetalle iguales | RAISE `Hay lineas de entrega duplicadas...` | backend |
| REQ-07 | Cantidad ≤ 0 (A6) | error | Cantidad=0 en todas | RAISE `...debe ser mayor a cero` / `No se especifico ninguna cantidad` | backend |
| REQ-08 | Compra directa requiere prov+comprobante | error | modo compra sin proveedor | RAISE `La compra directa requiere proveedor y comprobante.` | backend |
| REQ-09 | Compra directa requiere costo>0 | error | modo compra costo=0 | RAISE `...requiere un costo unitario mayor a cero.` | backend |
| REQ-10 | Stock insuficiente al aprobar | error | aprobar sin stock | guard de saldo no-negativo (RAISE) | backend |
| REQ-11 | Segregación creador≠aprobador | RBAC | aprobador = creador (no admin) | RAISE `No puedes aprobar un requerimiento que tu mismo creaste.` | manual |
| REQ-12 | Rol no autorizado aprueba | RBAC | rol almacenero/logística | RAISE `No tienes permiso para aprobar...` (42501) | manual |
| REQ-13 | Rechazar pendiente | happy | anular pendiente | Situacion=anulado, motivo en notas | backend |

## 8. Mantenimiento — Órdenes de Trabajo (`FnRegistrar/Consumir/Reconciliar/Cerrar/Anular/Eliminar OrdenMantenimiento`)

| ID | Caso | Tipo | Acción | Esperado | Método |
|----|------|------|--------|----------|--------|
| MNT-01 | Registrar OT abierta | happy | tipo correctivo, turno, vehículo, mecánico, trabajos | OT 'abierta', IdRequerimiento NULL, trabajos insertados | backend |
| MNT-02 | Consumir repuestos genera salida | happy | consumo stock en OT abierta | crea requerimiento + salida valorizada; OT 'consumida' | backend |
| MNT-03 | Consumir cantidad ≤ 0 (0042) | error | línea Cantidad=0 | RAISE `La cantidad a consumir de % debe ser mayor a cero.` | backend |
| MNT-04 | Consumir en OT no abierta | error | OT consumida/cerrada | RAISE `Solo se consumen repuestos en una orden abierta...` | backend |
| MNT-05 | Consumir sin líneas | error | array vacío | RAISE `No se especifico ningun repuesto a consumir.` | backend |
| MNT-06 | Compra directa en consumo | borde | modo compra sin proveedor | RAISE `La compra directa requiere proveedor y comprobante.` | backend |
| MNT-07 | Reconciliar aprobar | happy | reconciliar(true) OT consumida | OT 'cerrada', FechaReconciliacion | backend |
| MNT-08 | Reconciliar rechazar crea reversa | happy | reconciliar(false) | entrada de reversa con costo exacto del ledger; OT 'anulada'; req 'anulado' | backend |
| MNT-09 | Reconciliar solo consumidas | error | OT abierta | RAISE `Solo se reconcilian ordenes consumidas...` | backend |
| MNT-10 | Cerrar OT abierta sin repuestos | happy | cerrar OT abierta sin req | OT 'cerrada' | backend |
| MNT-11 | Cerrar OT con consumo | error | OT consumida | RAISE `Solo se cierra directamente una orden abierta sin repuestos...` | backend |
| MNT-12 | Anular OT abierta | happy | anular OT abierta | OT 'anulada' | backend |
| MNT-13 | Eliminar OT con consumo (C2) | error | OT consumida | RAISE `No se puede eliminar: la orden ya consumio repuestos...` | backend |
| MNT-14 | Segregación reconciliar | RBAC | reconciliador = quien consumió (no admin) | RAISE `No puedes reconciliar una orden cuyo consumo tu mismo registraste.` | manual |

## 9. Proveedores y Cuentas Bancarias (`FnGuardarProveedor`, `V_Proveedor`)

| ID | Caso | Tipo | Acción | Esperado | Método |
|----|------|------|--------|----------|--------|
| PROV-01 | Crear proveedor + cuentas 1:N | happy | guardar con 2 cuentas (PEN/USD) | proveedor + 2 cuentas; V_Proveedor embebe | backend |
| PROV-02 | Reemplazo de cuentas | happy | guardar con Id + cuentas distintas | reemplaza (delete+insert) | backend |
| PROV-03 | Ignora cuentas vacías | borde | cuenta con banco y número vacíos | se ignora | backend |
| PROV-04 | TipoCuenta inválido | error | TipoCuenta='x' | viola CHK corriente/ahorros | backend |
| PROV-05 | Moneda inválida | error | Moneda='EUR' | viola CHK PEN/USD | backend |
| PROV-06 | Datos bancarios solo admin/gerencia (A1) | RBAC | rol almacenero lee cuentas | V_Proveedor no expone Cuentas (RLS) | manual |

## 10. Personal y Cargos

| ID | Caso | Tipo | Acción | Esperado | Método |
|----|------|------|--------|----------|--------|
| PER-01 | Crear cargo | happy | código+nombre | crea | manual |
| PER-02 | Crear personal con cargo | happy | nombre, cargo | crea; cargo requerido | manual |
| PER-03 | Vincular usuario de acceso | borde | IdUsuario opcional | vincula; rol sale del usuario | manual |

## 11. RBAC / RLS (matriz por rol)

> Método **manual** (vía app con sesión de cada rol): el MCP service-role bypassa RLS y deja `auth.uid()` nulo, no es fiel.

| ID | Caso | Rol | Esperado |
|----|------|-----|----------|
| RBAC-01 | Escribir producto | admin, almacenero | permitido |
| RBAC-02 | Escribir producto | gerencia, supervision, logistica | denegado |
| RBAC-03 | Importar (catalogoAdmin) | solo admin | resto 403 |
| RBAC-04 | Aprobar requerimiento | admin, gerencia, supervision | resto denegado |
| RBAC-05 | Documentos/movimientos | admin, almacenero, supervision | resto denegado |
| RBAC-06 | Logística es solo lectura | logistica | ve dashboard/saldos/catálogo/movimientos/reportes; 0 escritura |
| RBAC-07 | Cuentas bancarias visibles | admin, gerencia | resto no las ve |
| RBAC-08 | Módulos visibles por rol | cada rol | coincide con seg.T_RolModulo |
| RBAC-09 | Login de rol no-admin (0046) | cualquiera | entra (lee su rol) |

## 12. UI / Documentos / Importación (pantalla)

| ID | Caso | Tipo | Esperado | Método |
|----|------|------|----------|--------|
| UI-01 | Importar .xlsx productos | happy | parsea, POST JSON, muestra reporte | manual |
| UI-02 | Reporte de errores por fila | error | tabla fila/columna/código/error | manual |
| UI-03 | Aprobaciones: pestañas pendientes/histórico | happy | separa por situación | manual |
| UI-04 | PDF de solicitud | happy | abre documento imprimible con líneas | manual |
| UI-05 | Logo sin fondo en login/sidebar/PDF | happy | se ve correcto | manual |
| UI-06 | Maestro categorías sin duplicados | regресión | jerarquía limpia | manual |
