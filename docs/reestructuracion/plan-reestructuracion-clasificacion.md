# Reestructuración de la clasificación: flota y catálogo

Fecha: 2026-09-06. Fuente: **producción** (snapshot de la base tomado ese día). Estado: **propuesta para decidir**, nada aplicado.

Acompañan a este plan dos Excel generados por `pnpm --filter @congeminco/db excel:clasificacion`:

| Archivo | Para qué |
|---|---|
| `Propuesta-clasificacion-equipos.xlsx` | Decidir los niveles de la flota (líneas, tipos, equipos, placas) y el destino de cada una de las 37 categorías actuales |
| `Revision-catalogo-productos.xlsx` | Confirmar o corregir la familia de cada uno de los 348 productos, con su nivel de incertidumbre y sus alertas de calidad |

Los dos tienen una hoja **Léeme** con las instrucciones y columnas grises para completar.

## 1. Lo que hay hoy

| Dato | Cantidad |
|---|---|
| Tipos de equipo | 8 |
| Equipos | 10 (2 telehandler sin placa) |
| Placas | 8, todas con equipo y tipo |
| Categorías | 37 |
| Productos activos | 348 |

La **línea ya existe de hecho**, solo que incrustada en los códigos: 3 tipos, 4 equipos y 2 placas dicen `LIN AMA`; 5 tipos, 6 equipos y 6 placas dicen `LIN LIV`. La flota real no tiene volquetes ni buses grandes: los camiones EX8 y los minibuses County están en liviana, y esa es la decisión de la empresa.

## 2. Qué salió mal, dicho corto

### 2.1 La línea vive en el código

`LIN AMA - MOTO1`, `LIN LIV - CAMION2`. Sirve para leer, no para filtrar ni contar, y cada código la repite a mano: por eso hay dos tipos con el guion corrido (`LIN - LIV CAMION CIS`). Cuando falta un nivel, la gente lo mete en el nombre. Funciona hasta que hay que agrupar.

### 2.2 Tres tipos para dos camiones

`LIN LIV - CAMIONES` tiene las dos placas EX8 y 116 productos. `LIN - LIV CAMION CIS` (9 productos) y `LIN - LIV CAMION GRU` (15 productos) no tienen ningún equipo. Como el filtro de compatibilidad va placa → equipo → tipo, los **13 productos que solo están en los tipos viejos hoy no aparecen para ninguna placa**: cable de grúa, motor de giro, eslingas de izaje, filtro separador de la cisterna, pistola de combustible, rodillo del carrete.

### 2.3 Tres formas de categoría conviviendo

- **Familia con subcategorías**, la forma correcta: `FAM-ELE › CAT-FOCO`, `FAM-CON › CAT-CINTA`.
- **13 categorías sueltas en la raíz**, sin familia: `CAT-FILTRO` (21 productos), `CAT-RETEN` (13), `CAT-RODAMIENTO` (11), `CAT-FRENO` (9), `CAT- CRUCETA` (5, con un espacio en el código), `CAT-FIJACION` (5), `CAT-MOTOR` (3), `CAT-SEGURIDAD` (2) y cinco vacías.
- **7 creadas a mano sin código estándar**: `FARO` (6), `MUELLE` (5), `GOMA` (2), `PRECA` (1), `ROD` (1), `TAPA` (1) y `padre` ("padre 1", una prueba).

### 2.4 Cajones de sastre y nombres engañosos

- `FAM-REP` Repuestos: 50 productos directos, sin subcategorías.
- `FAM-CON` Consumibles: **72 productos colgados directo de la familia**, y la mayoría no son consumibles: turbo, alternador, bomba de agua, muñones, amortiguador, kit de embrague, bombines de freno, barras de dirección.
- `FAM-HER` Herramientas: 15 directos, entre ellos un kit de caliper y un regulador de zapatas.
- Categorías con nombre que engaña: **Terminales** (eléctrico) guarda tres terminales de barra de dirección; **Herramientas** guarda eslingas de izaje, una manguera hidráulica y un kit de caliper; **Fijación** guarda dos amortiguadores, una cremallera de dirección y una eslinga; **Seguridad** guarda seguros de rueda; **Focos** guarda un limpia contacto; **Motor** guarda dos arrancadores.

### 2.5 Calidad de datos

- **18 SKU irregulares**: `1`, `Fil`, `Fil 002`, `Fil 01`, `Fil 095`, `Filll`, `Filt003`, `Hdhejehw`, `Hhhnn`, `Hjkkbv`, `Jdjdks`, `Juejjeje`, `Ret 02`, `Ret 03`, `Ret 04`, `Ret01`, `Ret04`, `TAPA-001-001`.
- **15 productos con unidad `ZZ`**, que significa "sin definir".
- **Duplicados por mismo código de proveedor**: kit de caliper `HER-002` = `REP-022`; `CON-024` espárragos = `CON-041` pin de caliper (mismo número Toyota); focos `FOCO-008` = `FOCO-009`; rodamientos `RODAMIENTO-001` = `RODAMIENTO-002`; abrazaderas `REP-024` = `REP-025`.
- **Duplicados por nombre**: correa 7PK1715 dos veces, fusible 15A azul dos veces, fusible 10A rojo tres veces, aflojatodo dos veces.
- Unos 40 nombres con espacios sobrantes, un código de equipo con espacio al final (`LIN LIV - MINIBUS2 `) y la descripción de los equipos usada como área (`OPERACIONES`, `COMPAÑIA`).

## 3. La propuesta

### 3.1 Flota: cuatro niveles, uno nuevo

| Nivel | Nombre | Qué es | Hoy |
|---|---|---|---|
| 1 | **Línea** | Agrupación gruesa por naturaleza del equipo. Para reportes, filtros y responsables | **Nuevo** como dato; hoy va dentro del código |
| 2 | Tipo de equipo | Clase de máquina. Donde vive la **compatibilidad** de productos | Existe; pierde el prefijo de línea |
| 3 | Equipo | La unidad física con código interno | Existe; el tipo pasa a ser obligatorio |
| 4 | Placa | Placa de rodaje o código interno si no tiene. A lo que se atribuye el consumo | Existe; el equipo pasa a ser obligatorio |

**Dos líneas, las que ya se usan**: `AMARILLA` (minicargador, motoniveladora, telehandler) y `LIVIANA` (camioneta, camión EX8, minibús). No se crea una línea pesada vacía: si entra un volquete, se agrega en ese momento.

**Tipos**, sin prefijo: `MINICARGADOR`, `MOTONIVELADORA`, `TELEHANDLER`, `CAMIONETA`, `MINIBUS`, y los camiones según la decisión de abajo. Los nombres actuales "Supervisión - Explosivos" y "Transporte de personal" describen el uso de las unidades, no el tipo: pasan a "Camioneta" y "Minibús".

**Camiones, la decisión más importante del Excel 1:**

- **Opción A (recomendada)**: dos tipos, `CAMION-GRUA` y `CAMION-CISTERNA`. `CAMION1` pasa a grúa, `CAMION2` a cisterna, los 116 productos del chasis se asocian a ambos (la importación lo hace en bloque) y los 13 exclusivos quedan donde están. Así "cable de grúa" no aparece como compatible con la cisterna.
- **Opción B**: un solo tipo `CAMION`; se le pasan los 13 productos y los dos tipos viejos se dan de baja. Más simple, pero el filtro ofrecerá piezas de grúa para la cisterna y viceversa.

**Equipos**: códigos sin prefijo y con número a dos dígitos (`MOTO-01`, `CAMION-02`, `MINIBUS-02`). Si el área importa, va en un campo propio, no en la descripción. Los dos telehandler reciben su código interno como placa para poder atribuirles consumo.

### 3.2 Catálogo: familias por sistema

Catorce familias, cada una con sus categorías. Se reutilizan los 24 códigos que ya existen, se recuelgan las 13 categorías sueltas bajo su familia y se absorben las 7 creadas a mano:

| Familia | Contiene | Categorías |
|---|---|---|
| FAM-FIL Filtros | aceite, aire, combustible, hidráulico, cabina | CAT-FILTRO |
| FAM-LUB Lubricantes y fluidos | aceites, grasas, refrigerante, hidrolina, líquido de frenos | CAT-LUBRICANTE, CAT-FLUIDO |
| FAM-ELE Sistema eléctrico | focos y faros, fusibles, relays, terminales y cables, alternador, arranque, batería, bocinas, alarmas | CAT-FOCO (absorbe FARO), CAT-FUSIBLE, CAT-RELAY, CAT-TERMINAL, CAT-ELECTRICO |
| FAM-FRE Sistema de frenos | zapatas, pastillas, fajas, bombines, cañerías, gomas | CAT-FRENO (absorbe GOMA) |
| FAM-SUS Suspensión y dirección | muelles, amortiguadores, bujes, barras y dirección | CAT-MUELLE (absorbe MUELLE), CAT-SUSPENSION, CAT-DIRECCION |
| FAM-MOT Motor y transmisión | turbo, termostato, bomba de agua, radiador, correas, embrague, cardán, crucetas | CAT-MOTOR (absorbe TAPA y PRECA), CAT-TRANSMISION (absorbe CAT- CRUCETA), CAT-CORREA, CAT-COMBUSTIBLE |
| FAM-ROD Rodamientos y retenes | rodamientos, bocamazas, retenes | CAT-RODAMIENTO, CAT-RETEN |
| FAM-NEU Neumáticos | neumáticos, aros, parches, válvulas | CAT-LLANTA, CAT-NEUMATICO |
| FAM-IZA Izaje y remolque | eslingas, grilletes, cable de grúa | CAT-ESLINGA |
| FAM-HID Sistema hidráulico | mangueras, válvulas, motores hidráulicos | CAT-HIDRAULICO |
| FAM-HER Herramientas | manuales, medición y diagnóstico, equipos de taller | CAT-HERRAMIENTA, CAT-MEDICION, CAT-EQUIPO-TALLER |
| FAM-CON Consumibles | cintas, sellantes, químicos, limpieza | CAT-CINTA, CAT-SELLANTE, CAT-QUIMICO, CAT-LIMPIEZA |
| FAM-SEG Seguridad y emergencia | extintor, kit antiderrame, caja de bloqueo, guantes | CAT-EMERGENCIA, CAT-EPP |
| FAM-ACC Accesorios, fijación y carrocería | pernos, tuercas, espárragos, abrazaderas, seguros de tuerca, espejos, piezas de implemento | CAT-FIJACION (absorbe CAT-SEGURIDAD), CAT-CARROCERIA, CAT-IMPLEMENTO (absorbe ROD) |

Catorce parece mucho contra las seis de hoy, pero de esas seis dos son cajones de sastre y trece categorías más viven sueltas en la raíz. La hoja "Familias propuestas" permite fusionar las que sobren.

Regla de oro para el que carga: **la familia dice qué es la pieza, no para qué máquina es.** Para qué máquina es se marca en la compatibilidad por tipo de equipo.

### 3.3 Cómo se propone la familia de cada producto

El generador aplica reglas por palabra clave sobre el nombre y asigna un nivel de incertidumbre. **La incertidumbre mide confianza en la propuesta, no si el producto se mueve**: "Turbo EX8", que hoy cuelga de Consumibles, es incertidumbre baja porque es motor sin discusión, y a la vez cambia de familia. Las dos cosas van en columnas separadas.

| Nivel | Cuándo | Qué hace el usuario |
|---|---|---|
| **Baja** (verde) | Una sola palabra clave, sin ambigüedad | Marca "Confirmado OK". Si no está de acuerdo, elige la familia correcta y eso manda |
| **Media** (amarillo) | Dos lecturas posibles, o el nombre no dice nada y se mantiene donde está | Mira el motivo, acepta o corrige |
| **Alta** (rojo) | El nombre no dice nada y hoy está en un cajón de sastre | Elige la familia del desplegable, obligatorio |

Cada renglón lleva **Motivo** con la razón exacta, **Cambia de familia** con Sí o No, y **Alertas de calidad** con lo que hay que arreglar además de la familia: SKU irregular, unidad sin definir, compatible solo con tipos sin equipos, posible duplicado, espacios sobrantes.

Las reglas nacieron de productos reales del catálogo y están documentadas en el generador con su orden: "estractor de filtro" es herramienta y no filtro; "líquido de freno" es fluido y no freno; "hidrolina para gata" es fluido y no herramienta; "terminal de barra larga de dirección" es dirección y no terminal eléctrico; "grillete para muelle" es suspensión y no izaje; "rodamiento polea guía" es rodamiento y no correa; "juego de cámara de retroceso" es eléctrico y no cámara de llanta. Lo ambiguo de verdad ("freno de motor", "motor de giro de grúa", "electroválvula", "acople 1/2", "engrasador de motoniveladora", "precalentador de motor") queda en Media a propósito.

## 4. Plan de actualización

Cinco fases. Las dos primeras son decisiones; las tres siguientes son trabajo técnico que depende de ellas.

### Fase 1. Decidir la flota (Excel 1)

Completar las hojas Líneas, Tipos de equipo, Equipos y Vehículos. Lo que sale de acá:

- La opción A o B para los camiones.
- Los códigos y nombres finales de tipos y equipos.
- Si los telehandler reciben código interno como placa.

### Fase 2. Decidir el catálogo (Excel 2 y hoja "Familias propuestas")

Confirmar las familias y completar la revisión de productos. Lo que sale de acá:

- La taxonomía final: familias y categorías con código y nombre.
- La familia y categoría correcta de cada producto.
- Qué hacer con cada duplicado (cuál queda), cada unidad ZZ y cada SKU irregular.
- De paso, la compatibilidad con los códigos nuevos de tipo.

### Fase 3. Base de datos

Una migración nueva, numerada después de la última aplicada:

1. **`inv.T_LineaEquipo`**: Codigo, Nombre, Descripcion, Orden, más auditoría y RLS iguales a T_TipoEquipo. Seed con AMARILLA y LIVIANA.
2. **`inv.T_TipoEquipo.IdLinea`**: FK, backfill según el prefijo de cada código, después `NOT NULL`. Renombrar código y nombre de cada tipo según la hoja.
3. **Camiones** según la opción elegida. A: actualizar el tipo de los dos equipos, asociar los 116 productos del chasis a los dos tipos nuevos, dar de baja `LIN LIV - CAMIONES`. B: mover los 13 productos exclusivos a `CAMION`, dar de baja los dos tipos viejos.
4. **Equipos**: renombrar códigos (quitar prefijo, número a dos dígitos), limpiar espacios. Si se decide, columna `Area` y mover ahí lo que hoy está en Descripcion.
5. **Endurecer la cadena**: `T_Equipo.IdTipoEquipo NOT NULL` y `T_Vehiculo.IdEquipo NOT NULL`. Hoy no hay huecos, así que se aplica directo.
6. **Categorías**: alta de las familias y categorías nuevas con `INSERT ... ON CONFLICT`; recolgar las 13 sueltas bajo su familia (`UPDATE IdCategoriaPadre`); las 7 sin código se vacían por la recarga de la fase 4 y se dan de baja; `padre` y `CAT-VARIOS` se dan de baja. Trigger que limite la jerarquía a dos niveles y evite ciclos, que hoy no existe.
7. **`FnContarDependencias`** y **`FnEliminarConDependencias`**: rama nueva `lineaEquipo`.
8. **Vistas**: la línea se expone donde se muestra el tipo (embed de equipos, `V_Reporte_Movimiento`).

### Fase 4. Recarga del catálogo

No hace falta código nuevo para mover los productos: la importación de productos ya existe en modo **actualizar** y acepta `Sku`, `CodigoCategoria`, `EsGeneral` y `TiposEquipo`. Un script convierte el Excel 2 devuelto en la planilla de importación de nueve columnas. Orden obligatorio:

1. **SKU irregulares primero**: la importación identifica por SKU, así que los 18 se renombran con un `UPDATE` directo al SKU que genera la categoría final, antes de importar. Los movimientos referencian el Id, no el SKU: renombrar no rompe historial.
2. **Duplicados**: por cada par se decide cuál queda; el otro se da de baja. Si el que se va tiene movimientos o stock, hace falta un script que los traslade antes de la baja. No es un caso de importación.
3. **Importar** la planilla: categoría final, compatibilidad con los códigos nuevos de tipo, unidad corregida donde había ZZ.
4. Las familias y categorías viejas quedan vacías y se dan de baja.

Los SKU regulares no cambian. `CON-013 Turbo` puede terminar en Motor y sigue siendo el mismo producto; el prefijo del SKU refleja la categoría con la que nació, no con la que vive. Eso es cosmético y no se corrige.

### Fase 5. Aplicación

- Maestro de tipos de equipo: campo Línea obligatorio.
- Grillas de equipos y vehículos: columna Línea.
- Filtro por línea en saldos y reportes.
- Normalización al guardar: recortar espacios en códigos y nombres de producto, equipo y tipo (hoy entran con espacios al final).
- Unidad `ZZ`: ocultarla del selector o marcarla como "sin definir" para que no se siga eligiendo.
- El filtro "Solo productos compatibles" no cambia: sigue por tipo.

## 5. Riesgos y decisiones abiertas

- **Camiones A o B.** Es la única decisión que cambia el modelo de datos. A es más fiel; B es más simple.
- **Renombrar códigos de tipo y equipo.** Si algún papel de campo o etiqueta física usa `LIN LIV - CAMION1`, conviene convivir un tiempo con el código anterior visible en la descripción.
- **Grúa y cisterna en liviana.** Son EX8 de 4 a 5 toneladas; para esta flota es correcto. El día que entre un volquete o un bus grande, se crea la línea pesada.
- **Catorce familias.** Si al usarlo resulta mucho, se fusionan después con la misma importación en modo actualizar. Es más barato separar ahora y fusionar después que al revés.
- **Herramientas en el inventario.** Hay 67 herramientas que no se consumen: su "salida" es un préstamo, no un consumo. No se toca en esta reestructuración, pero conviene saberlo.

## 6. Cómo regenerar los Excel

```
pnpm --filter @congeminco/db excel:clasificacion
```

Lee la base con `DATABASE_URL` del `.env` de la raíz. Sin credenciales a mano, acepta un snapshot JSON con `--datos`, armado con las mismas consultas del script. Los archivos salen a esta carpeta.
