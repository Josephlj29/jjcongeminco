/*
	0082 - Reclasificacion de productos: 235 movimientos.

	- 189 productos en corral (colgados de una familia) pasan a su categoria real.
	- 46 productos ya clasificados se reubican segun la propuesta confirmada
	  (p. ej. amortiguadores que estaban en Fijacion pasan a Suspension).

	Incertidumbre Media/Alta: se resolvio por el patron mas especifico del
	nombre ("fuel" sobre "manguera", "stabilizer" sobre "barra",
	"freno de motor" sobre "freno", "motor de giro" de grua = hidraulico).

	Fuente: docs/reestructuracion/ReclasificacionProductos_completado.xlsx
	(revisado a mano por el usuario el 2026-11-07, columna "CATEGORIA correcta").

	Solo cambia inv."T_Producto"."IdCategoria". No toca SKU, nombre, unidad,
	EsGeneral, tipos de equipo ni stock.

	Candado: cada fila solo se mueve si HOY sigue colgada de la familia que
	figuraba en el Excel (familia o categoria de origen). Si alguien la reclasifico en la app, se respeta y
	la migracion aborta para revisar (no pisa trabajo manual).

	Reparto del corral por familia de origen: FAM-CON 94, FAM-HER 15, FAM-LUB 2, FAM-NEU 11, FAM-REP 67.
*/

DO $$
DECLARE
	vEsperadas INTEGER;
	vMovidas   INTEGER;
	vDestinoMalo TEXT;
	vYaMovidos TEXT;
	vDatos JSONB := $json$[
		{"Sku": "CON-001", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-002", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-003", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-004", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-005", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-006", "Origen": "FAM-CON", "Destino": "CAT-HIDRAULICO"},
		{"Sku": "CON-007", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-008", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-009", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-010", "Origen": "FAM-CON", "Destino": "CAT-FILTRO"},
		{"Sku": "CON-011", "Origen": "FAM-CON", "Destino": "CAT-CORREA"},
		{"Sku": "CON-012", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-013", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-014", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-015", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-016", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-017", "Origen": "FAM-CON", "Destino": "CAT-DIRECCION"},
		{"Sku": "CON-018", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-019", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-020", "Origen": "FAM-CON", "Destino": "CAT-TRANSMISION"},
		{"Sku": "CON-021", "Origen": "FAM-CON", "Destino": "CAT-TRANSMISION"},
		{"Sku": "CON-022", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-023", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-024", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-025", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-026", "Origen": "FAM-CON", "Destino": "CAT-RODAMIENTO"},
		{"Sku": "CON-027", "Origen": "FAM-CON", "Destino": "CAT-NEUMATICO"},
		{"Sku": "CON-028", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-029", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-030", "Origen": "FAM-CON", "Destino": "CAT-DIRECCION"},
		{"Sku": "CON-031", "Origen": "FAM-CON", "Destino": "CAT-DIRECCION"},
		{"Sku": "CON-032", "Origen": "FAM-CON", "Destino": "CAT-LUBRICANTE"},
		{"Sku": "CON-033", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-034", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-035", "Origen": "FAM-CON", "Destino": "CAT-SUSPENSION"},
		{"Sku": "CON-036", "Origen": "FAM-CON", "Destino": "CAT-ESLINGA"},
		{"Sku": "CON-037", "Origen": "FAM-CON", "Destino": "CAT-LIMPIEZA"},
		{"Sku": "CON-038", "Origen": "FAM-CON", "Destino": "CAT-DIRECCION"},
		{"Sku": "CON-039", "Origen": "FAM-CON", "Destino": "CAT-DIRECCION"},
		{"Sku": "CON-040", "Origen": "FAM-CON", "Destino": "CAT-DIRECCION"},
		{"Sku": "CON-041", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-042", "Origen": "FAM-CON", "Destino": "CAT-TRANSMISION"},
		{"Sku": "CON-043", "Origen": "FAM-CON", "Destino": "CAT-TRANSMISION"},
		{"Sku": "CON-044", "Origen": "FAM-CON", "Destino": "CAT-EMERGENCIA"},
		{"Sku": "CON-045", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-046", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-047", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-048", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-049", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-050", "Origen": "FAM-CON", "Destino": "CAT-EMERGENCIA"},
		{"Sku": "CON-052", "Origen": "FAM-CON", "Destino": "CAT-FUSIBLE"},
		{"Sku": "CON-053", "Origen": "FAM-CON", "Destino": "CAT-TERMINAL"},
		{"Sku": "CON-054", "Origen": "FAM-CON", "Destino": "CAT-TERMINAL"},
		{"Sku": "CON-055", "Origen": "FAM-CON", "Destino": "CAT-FUSIBLE"},
		{"Sku": "CON-057", "Origen": "FAM-CON", "Destino": "CAT-TERMINAL"},
		{"Sku": "CON-058", "Origen": "FAM-CON", "Destino": "CAT-TERMINAL"},
		{"Sku": "CON-059", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-060", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-061", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-062", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-063", "Origen": "FAM-CON", "Destino": "CAT-LIMPIEZA"},
		{"Sku": "CON-064", "Origen": "FAM-CON", "Destino": "CAT-QUIMICO"},
		{"Sku": "CON-066", "Origen": "FAM-CON", "Destino": "CAT-QUIMICO"},
		{"Sku": "CON-067", "Origen": "FAM-CON", "Destino": "CAT-TERMINAL"},
		{"Sku": "CON-068", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-069", "Origen": "FAM-CON", "Destino": "CAT-NEUMATICO"},
		{"Sku": "CON-070", "Origen": "FAM-CON", "Destino": "CAT-NEUMATICO"},
		{"Sku": "CON-071", "Origen": "FAM-CON", "Destino": "CAT-RODAMIENTO"},
		{"Sku": "CON-072", "Origen": "FAM-CON", "Destino": "CAT-TERMINAL"},
		{"Sku": "CON-073", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-074", "Origen": "FAM-CON", "Destino": "CAT-EPP"},
		{"Sku": "CON-075", "Origen": "FAM-CON", "Destino": "CAT-MUELLE"},
		{"Sku": "CON-076", "Origen": "FAM-CON", "Destino": "CAT-ESLINGA"},
		{"Sku": "CON-077", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-078", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-079", "Origen": "FAM-CON", "Destino": "CAT-MUELLE"},
		{"Sku": "CON-080", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-081", "Origen": "FAM-CON", "Destino": "CAT-MOTOR"},
		{"Sku": "CON-082", "Origen": "FAM-CON", "Destino": "CAT-DIRECCION"},
		{"Sku": "CON-083", "Origen": "FAM-CON", "Destino": "CAT-ESLINGA"},
		{"Sku": "CON-084", "Origen": "FAM-CON", "Destino": "CAT-IMPLEMENTO"},
		{"Sku": "CON-085", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-086", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-087", "Origen": "FAM-CON", "Destino": "CAT-TERMINAL"},
		{"Sku": "CON-088", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-089", "Origen": "FAM-CON", "Destino": "CAT-FRENO"},
		{"Sku": "CON-090", "Origen": "FAM-CON", "Destino": "CAT-TRANSMISION"},
		{"Sku": "CON-091", "Origen": "FAM-CON", "Destino": "CAT-ELECTRICO"},
		{"Sku": "CON-092", "Origen": "FAM-CON", "Destino": "CAT-QUIMICO"},
		{"Sku": "CON-093", "Origen": "FAM-CON", "Destino": "CAT-SELLANTE"},
		{"Sku": "CON-094", "Origen": "FAM-CON", "Destino": "CAT-COMBUSTIBLE"},
		{"Sku": "CON-095", "Origen": "FAM-CON", "Destino": "CAT-COMBUSTIBLE"},
		{"Sku": "CON-096", "Origen": "FAM-CON", "Destino": "CAT-FIJACION"},
		{"Sku": "CON-097", "Origen": "FAM-CON", "Destino": "CAT-ESLINGA"},
		{"Sku": "FIJACION-001", "Origen": "CAT-FIJACION", "Destino": "CAT-DIRECCION"},
		{"Sku": "FIJACION-002", "Origen": "CAT-FIJACION", "Destino": "CAT-SUSPENSION"},
		{"Sku": "FIJACION-003", "Origen": "CAT-FIJACION", "Destino": "CAT-SUSPENSION"},
		{"Sku": "FIJACION-004", "Origen": "CAT-FIJACION", "Destino": "CAT-MUELLE"},
		{"Sku": "FIJACION-005", "Origen": "CAT-FIJACION", "Destino": "CAT-ESLINGA"},
		{"Sku": "FOCO-018", "Origen": "CAT-FOCO", "Destino": "CAT-QUIMICO"},
		{"Sku": "FRENO-005", "Origen": "CAT-FRENO", "Destino": "CAT-MOTOR"},
		{"Sku": "HER-001", "Origen": "FAM-HER", "Destino": "CAT-FRENO"},
		{"Sku": "HER-002", "Origen": "FAM-HER", "Destino": "CAT-FRENO"},
		{"Sku": "HER-003", "Origen": "FAM-HER", "Destino": "CAT-MEDICION"},
		{"Sku": "HER-004", "Origen": "FAM-HER", "Destino": "CAT-HERRAMIENTA"},
		{"Sku": "HER-005", "Origen": "FAM-HER", "Destino": "CAT-HERRAMIENTA"},
		{"Sku": "HER-006", "Origen": "FAM-HER", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HER-007", "Origen": "FAM-HER", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HER-008", "Origen": "FAM-HER", "Destino": "CAT-NEUMATICO"},
		{"Sku": "HER-009", "Origen": "FAM-HER", "Destino": "CAT-HERRAMIENTA"},
		{"Sku": "HER-010", "Origen": "FAM-HER", "Destino": "CAT-MEDICION"},
		{"Sku": "HER-011", "Origen": "FAM-HER", "Destino": "CAT-MEDICION"},
		{"Sku": "HER-012", "Origen": "FAM-HER", "Destino": "CAT-HERRAMIENTA"},
		{"Sku": "HER-013", "Origen": "FAM-HER", "Destino": "CAT-HERRAMIENTA"},
		{"Sku": "HER-014", "Origen": "FAM-HER", "Destino": "CAT-HERRAMIENTA"},
		{"Sku": "HER-015", "Origen": "FAM-HER", "Destino": "CAT-HERRAMIENTA"},
		{"Sku": "HERRAMIENTA-002", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-MEDICION"},
		{"Sku": "HERRAMIENTA-003", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-MEDICION"},
		{"Sku": "HERRAMIENTA-005", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EMERGENCIA"},
		{"Sku": "HERRAMIENTA-006", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-031", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-032", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-035", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-MEDICION"},
		{"Sku": "HERRAMIENTA-036", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-037", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-038", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-039", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-040", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-041", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-MEDICION"},
		{"Sku": "HERRAMIENTA-042", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-MEDICION"},
		{"Sku": "HERRAMIENTA-044", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-HIDRAULICO"},
		{"Sku": "HERRAMIENTA-048", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-049", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-050", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-ESLINGA"},
		{"Sku": "HERRAMIENTA-051", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-ESLINGA"},
		{"Sku": "HERRAMIENTA-052", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-ESLINGA"},
		{"Sku": "HERRAMIENTA-055", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-NEUMATICO"},
		{"Sku": "HERRAMIENTA-056", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "HERRAMIENTA-057", "Origen": "CAT-HERRAMIENTA", "Destino": "CAT-EQUIPO-TALLER"},
		{"Sku": "LUB-001", "Origen": "FAM-LUB", "Destino": "CAT-FLUIDO"},
		{"Sku": "LUB-002", "Origen": "FAM-LUB", "Destino": "CAT-LUBRICANTE"},
		{"Sku": "LUBRICANTE-002", "Origen": "CAT-LUBRICANTE", "Destino": "CAT-FLUIDO"},
		{"Sku": "LUBRICANTE-003", "Origen": "CAT-LUBRICANTE", "Destino": "CAT-FLUIDO"},
		{"Sku": "LUBRICANTE-005", "Origen": "CAT-LUBRICANTE", "Destino": "CAT-FLUIDO"},
		{"Sku": "LUBRICANTE-009", "Origen": "CAT-LUBRICANTE", "Destino": "CAT-FLUIDO"},
		{"Sku": "LUBRICANTE-012", "Origen": "CAT-LUBRICANTE", "Destino": "CAT-QUIMICO"},
		{"Sku": "LUBRICANTE-013", "Origen": "CAT-LUBRICANTE", "Destino": "CAT-FLUIDO"},
		{"Sku": "MOTOR-001", "Origen": "CAT-MOTOR", "Destino": "CAT-ELECTRICO"},
		{"Sku": "MOTOR-002", "Origen": "CAT-MOTOR", "Destino": "CAT-ELECTRICO"},
		{"Sku": "MOTOR-003", "Origen": "CAT-MOTOR", "Destino": "CAT-HIDRAULICO"},
		{"Sku": "NEU-001", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-002", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-003", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-005", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-006", "Origen": "FAM-NEU", "Destino": "CAT-NEUMATICO"},
		{"Sku": "NEU-007", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-008", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-009", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-010", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-011", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEU-012", "Origen": "FAM-NEU", "Destino": "CAT-LLANTA"},
		{"Sku": "NEUMATICO-005", "Origen": "CAT-NEUMATICO", "Destino": "CAT-SUSPENSION"},
		{"Sku": "NEUMATICO-006", "Origen": "CAT-NEUMATICO", "Destino": "CAT-MUELLE"},
		{"Sku": "NEUMATICO-007", "Origen": "CAT-NEUMATICO", "Destino": "CAT-FRENO"},
		{"Sku": "REP-001", "Origen": "FAM-REP", "Destino": "CAT-MOTOR"},
		{"Sku": "REP-002", "Origen": "FAM-REP", "Destino": "CAT-ELECTRICO"},
		{"Sku": "REP-003", "Origen": "FAM-REP", "Destino": "CAT-ELECTRICO"},
		{"Sku": "REP-004", "Origen": "FAM-REP", "Destino": "CAT-ELECTRICO"},
		{"Sku": "REP-005", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-006", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-007", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-008", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-009", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-011", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-012", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-013", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-014", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-015", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-016", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-017", "Origen": "FAM-REP", "Destino": "CAT-SUSPENSION"},
		{"Sku": "REP-018", "Origen": "FAM-REP", "Destino": "CAT-ESLINGA"},
		{"Sku": "REP-019", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-020", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-021", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-022", "Origen": "FAM-REP", "Destino": "CAT-FRENO"},
		{"Sku": "REP-023", "Origen": "FAM-REP", "Destino": "CAT-FRENO"},
		{"Sku": "REP-024", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-025", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-026", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-027", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-028", "Origen": "FAM-REP", "Destino": "CAT-FRENO"},
		{"Sku": "REP-029", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-030", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-031", "Origen": "FAM-REP", "Destino": "CAT-DIRECCION"},
		{"Sku": "REP-032", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-033", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-034", "Origen": "FAM-REP", "Destino": "CAT-MOTOR"},
		{"Sku": "REP-035", "Origen": "FAM-REP", "Destino": "CAT-SUSPENSION"},
		{"Sku": "REP-036", "Origen": "FAM-REP", "Destino": "CAT-MUELLE"},
		{"Sku": "REP-037", "Origen": "FAM-REP", "Destino": "CAT-SUSPENSION"},
		{"Sku": "REP-038", "Origen": "FAM-REP", "Destino": "CAT-SUSPENSION"},
		{"Sku": "REP-039", "Origen": "FAM-REP", "Destino": "CAT-FRENO"},
		{"Sku": "REP-040", "Origen": "FAM-REP", "Destino": "CAT-CARROCERIA"},
		{"Sku": "REP-041", "Origen": "FAM-REP", "Destino": "CAT-IMPLEMENTO"},
		{"Sku": "REP-042", "Origen": "FAM-REP", "Destino": "CAT-DIRECCION"},
		{"Sku": "REP-043", "Origen": "FAM-REP", "Destino": "CAT-TRANSMISION"},
		{"Sku": "REP-044", "Origen": "FAM-REP", "Destino": "CAT-FRENO"},
		{"Sku": "REP-045", "Origen": "FAM-REP", "Destino": "CAT-ESLINGA"},
		{"Sku": "REP-046", "Origen": "FAM-REP", "Destino": "CAT-IMPLEMENTO"},
		{"Sku": "REP-047", "Origen": "FAM-REP", "Destino": "CAT-FRENO"},
		{"Sku": "REP-048", "Origen": "FAM-REP", "Destino": "CAT-MOTOR"},
		{"Sku": "REP-049", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-050", "Origen": "FAM-REP", "Destino": "CAT-CARROCERIA"},
		{"Sku": "REP-051", "Origen": "FAM-REP", "Destino": "CAT-FRENO"},
		{"Sku": "REP-052", "Origen": "FAM-REP", "Destino": "CAT-CARROCERIA"},
		{"Sku": "REP-053", "Origen": "FAM-REP", "Destino": "CAT-CARROCERIA"},
		{"Sku": "REP-054", "Origen": "FAM-REP", "Destino": "CAT-MOTOR"},
		{"Sku": "REP-055", "Origen": "FAM-REP", "Destino": "CAT-MOTOR"},
		{"Sku": "REP-056", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-057", "Origen": "FAM-REP", "Destino": "CAT-CINTA"},
		{"Sku": "REP-058", "Origen": "FAM-REP", "Destino": "CAT-SUSPENSION"},
		{"Sku": "REP-059", "Origen": "FAM-REP", "Destino": "CAT-SUSPENSION"},
		{"Sku": "REP-060", "Origen": "FAM-REP", "Destino": "CAT-DIRECCION"},
		{"Sku": "REP-061", "Origen": "FAM-REP", "Destino": "CAT-ELECTRICO"},
		{"Sku": "REP-062", "Origen": "FAM-REP", "Destino": "CAT-ELECTRICO"},
		{"Sku": "REP-063", "Origen": "FAM-REP", "Destino": "CAT-FIJACION"},
		{"Sku": "REP-064", "Origen": "FAM-REP", "Destino": "CAT-CORREA"},
		{"Sku": "REP-065", "Origen": "FAM-REP", "Destino": "CAT-CARROCERIA"},
		{"Sku": "REP-066", "Origen": "FAM-REP", "Destino": "CAT-TRANSMISION"},
		{"Sku": "REP-067", "Origen": "FAM-REP", "Destino": "CAT-MOTOR"},
		{"Sku": "REP-068", "Origen": "FAM-REP", "Destino": "CAT-SUSPENSION"},
		{"Sku": "RETEN-007", "Origen": "CAT-RETEN", "Destino": "CAT-TERMINAL"},
		{"Sku": "TERMINAL-001", "Origen": "CAT-TERMINAL", "Destino": "CAT-DIRECCION"},
		{"Sku": "TERMINAL-002", "Origen": "CAT-TERMINAL", "Destino": "CAT-DIRECCION"},
		{"Sku": "TERMINAL-003", "Origen": "CAT-TERMINAL", "Destino": "CAT-DIRECCION"}
	]$json$;
BEGIN
vEsperadas := jsonb_array_length(vDatos);

	-- Todo destino debe ser una categoria real (nivel 2) y activa.
	SELECT string_agg(t."Destino", ', ') INTO vDestinoMalo
	FROM jsonb_to_recordset(vDatos) AS t("Sku" TEXT, "Origen" TEXT, "Destino" TEXT)
	LEFT JOIN inv."T_Categoria" c ON c."Codigo" = t."Destino" AND c."Estado" AND c."IdCategoriaPadre" IS NOT NULL
	WHERE c."Id" IS NULL;
	IF vDestinoMalo IS NOT NULL THEN
		RAISE EXCEPTION 'Destinos que no son categoria real activa: %', vDestinoMalo;
	END IF;

	-- Candado: el producto sigue donde lo dejo el Excel.
	SELECT string_agg(t."Sku", ', ') INTO vYaMovidos
	FROM jsonb_to_recordset(vDatos) AS t("Sku" TEXT, "Origen" TEXT, "Destino" TEXT)
	LEFT JOIN inv."T_Producto" p ON p."Sku"::TEXT = t."Sku" AND p."Estado"
	LEFT JOIN inv."T_Categoria" c ON c."Id" = p."IdCategoria"
	WHERE c."Codigo" IS DISTINCT FROM t."Origen";
	IF vYaMovidos IS NOT NULL THEN
		RAISE EXCEPTION 'Productos que ya no estan donde decia el Excel (revisar a mano): %', vYaMovidos;
	END IF;

	UPDATE inv."T_Producto" p
	SET "IdCategoria" = d."Id",
		"UsuarioModificacion" = 'Reclasificacion 0082'
	FROM jsonb_to_recordset(vDatos) AS t("Sku" TEXT, "Origen" TEXT, "Destino" TEXT)
	JOIN inv."T_Categoria" d ON d."Codigo" = t."Destino"
	WHERE p."Sku"::TEXT = t."Sku" AND p."Estado";
	GET DIAGNOSTICS vMovidas = ROW_COUNT;

	IF vMovidas <> vEsperadas THEN
		RAISE EXCEPTION 'Se esperaban % productos y se movieron %', vEsperadas, vMovidas;
	END IF;

	RAISE NOTICE '0082: % productos reclasificados', vMovidas;
END $$;
