/*
	0084 - Nombres de producto en formato oracion + MARCA.

	Criterio (elegido por el usuario el 2026-11-07):
	- Primera letra en mayuscula, el resto de la descripcion en minuscula.
	- Marcas, modelos y siglas en MAYUSCULA (HYUNDAI, TOYOTA, COUNTY, EX8, ABS, LED).
	- Codigos intactos: toda palabra con digitos se deja como esta (PY21W, 85W140, EX8).
	- Espacios dobles y espacios al inicio o al final se eliminan.

	131 productos cambian: los que estaban TODO EN MAYUSCULA, los que
	empezaban en minuscula, marcas escritas en minuscula y espacios sobrantes.
	El resto ya seguia este patron.

	Candado: solo se actualiza si el nombre HOY es exactamente el que se
	reviso. Si alguien lo edito en la app despues, se respeta y se informa.
	Solo cambia inv."T_Producto"."Nombre".
*/

DO $$
DECLARE
	vCambiados INTEGER;
	vOmitidos TEXT;
	vDatos JSONB := $json$[
		{"Sku": "CARROCERIA-001", "Antes": "Espejo con porta espejo retrovisor COUNTY ", "Despues": "Espejo con porta espejo retrovisor COUNTY"},
		{"Sku": "CINTA-005", "Antes": "Cinta amarilla ", "Despues": "Cinta amarilla"},
		{"Sku": "CINTA-008", "Antes": "Cinta verde ", "Despues": "Cinta verde"},
		{"Sku": "CON-005", "Antes": "Claxon alarma de retroceso 12-24v  - ECCO 520", "Despues": "Claxon alarma de retroceso 12-24v - ECCO 520"},
		{"Sku": "CON-007", "Antes": " Switches Corta corriente ", "Despues": "Switches Corta corriente"},
		{"Sku": "CON-013", "Antes": "Turbo ", "Despues": "Turbo"},
		{"Sku": "CON-016", "Antes": "Seguro de tuerca color anaranjado INROCA N21 ", "Despues": "Seguro de tuerca color anaranjado INROCA N21"},
		{"Sku": "CON-017", "Antes": "Pines y bujes de dirección  diametro 30x180 NKT", "Despues": "Pines y bujes de dirección diametro 30x180 NKT"},
		{"Sku": "CON-021", "Antes": "Soporte de cardán  HYUNDAI COUNTY -  49720 5L010", "Despues": "Soporte de cardán HYUNDAI COUNTY - 49720 5L010"},
		{"Sku": "CON-024", "Antes": "ESPÁRRAGOS PARA TOYOTA ", "Despues": "Espárragos para TOYOTA"},
		{"Sku": "CON-025", "Antes": "CLIP O PASADO DE SUJECIÓN PARA PASTILLAS DE FRENO DELANTERO ", "Despues": "Clip o pasado de sujeción para pastillas de freno delantero"},
		{"Sku": "CON-026", "Antes": "KIT DE RODAMIENTO PARA RUEDA ", "Despues": "Kit de rodamiento para rueda"},
		{"Sku": "CON-035", "Antes": "Amortiguador delantero  KYB PREMIUM", "Despues": "Amortiguador delantero KYB PREMIUM"},
		{"Sku": "CON-038", "Antes": "Barra corta de dirección ex8", "Despues": "Barra corta de dirección EX8"},
		{"Sku": "CON-039", "Antes": "Barra corta de direccion county", "Despues": "Barra corta de direccion COUNTY"},
		{"Sku": "CON-050", "Antes": "Kit antiderrame ", "Despues": "Kit antiderrame"},
		{"Sku": "CON-051", "Antes": "Portafusible  600v TAIWAN", "Despues": "Portafusible 600v TAIWAN"},
		{"Sku": "CON-054", "Antes": "Terminal macho ", "Despues": "Terminal macho"},
		{"Sku": "CON-060", "Antes": "Silicona  MEGA GREY", "Despues": "Silicona MEGA GREY"},
		{"Sku": "CON-062", "Antes": "Sellador  de silicona REINZOSIL", "Despues": "Sellador de silicona REINZOSIL"},
		{"Sku": "CON-069", "Antes": "PARCHE PARA CÁMARA DE AIRE V-2", "Despues": "Parche para cámara de aire V-2"},
		{"Sku": "CON-070", "Antes": "PARCHE PARA CÁMARA DE AIRE V-1", "Despues": "Parche para cámara de aire V-1"},
		{"Sku": "CON-071", "Antes": "BOCAMAZA - BOOTTELLI ", "Despues": "Bocamaza - BOOTTELLI"},
		{"Sku": "CON-075", "Antes": "GOMA PARA GRILLETE DE MUELLE - BAQUELITA OJO DE MUELLE", "Despues": "Goma para grillete de muelle - baquelita ojo de muelle"},
		{"Sku": "CON-076", "Antes": "GOMA VERDE - BAQUELITA GRILLETE", "Despues": "Goma verde - baquelita grillete"},
		{"Sku": "CON-077", "Antes": "ABRAZADERA POSTERIOR  COUNTY", "Despues": "Abrazadera posterior COUNTY"},
		{"Sku": "CON-078", "Antes": "ABRAZADERA DELANTERA COUNTY ", "Despues": "Abrazadera delantera COUNTY"},
		{"Sku": "CON-079", "Antes": "PERNO CENTRAL DE MUELLE", "Despues": "Perno central de muelle"},
		{"Sku": "CON-082", "Antes": "ROTULA DE TRAPECIO INFERIOR SUPERIOR", "Despues": "Rotula de trapecio inferior superior"},
		{"Sku": "CON-083", "Antes": "GRILLETE NUMERO 16", "Despues": "Grillete numero 16"},
		{"Sku": "CON-088", "Antes": "Pegamento vulzanizante / VIPAL ", "Despues": "Pegamento vulzanizante / VIPAL"},
		{"Sku": "CON-089", "Antes": "Cable de freno de mano posición 4 ", "Despues": "Cable de freno de mano posición 4"},
		{"Sku": "CON-091", "Antes": "Cortacorriente 12V 24V - MONARK  I/083856001", "Despues": "Cortacorriente 12V 24V - MONARK I/083856001"},
		{"Sku": "CON-095", "Antes": "Manguera fuel oil hose ID 1/2 (12.5MM) ", "Despues": "Manguera fuel oil hose ID 1/2 (12.5MM)"},
		{"Sku": "ELECTRICO-003", "Antes": "SENSOR ABS", "Despues": "Sensor ABS"},
		{"Sku": "FARO-004", "Antes": "Faro 2\" c/jebe ambar  multivoltaje ELILED", "Despues": "Faro 2\" c/jebe ambar multivoltaje ELILED"},
		{"Sku": "FARO-008", "Antes": "FARO LAMPARA LED LUZ DE PLACA MULTIVOLTAJE ", "Despues": "Faro lampara LED luz de placa multivoltaje"},
		{"Sku": "FARO-011", "Antes": "Faro posterior derecho Toyota ", "Despues": "Faro posterior derecho TOYOTA"},
		{"Sku": "FIJACION-002", "Antes": "Amortiguador delantero  TOKICO", "Despues": "Amortiguador delantero TOKICO"},
		{"Sku": "FILTRO-001", "Antes": "Filtro de aire acondicionado  IHP", "Despues": "Filtro de aire acondicionado IHP"},
		{"Sku": "FILTRO-005", "Antes": "Filtro de aire CTP ", "Despues": "Filtro de aire CTP"},
		{"Sku": "FILTRO-015", "Antes": "Filtro de aire acondicionado  de cabina / IHP 97133-4H000", "Despues": "Filtro de aire acondicionado de cabina / IHP 97133-4H000"},
		{"Sku": "FOCO-001", "Antes": "Foco H4 24v75/70W P43t-38  NARVA", "Despues": "Foco H4 24v75/70W P43t-38 NARVA"},
		{"Sku": "FOCO-004", "Antes": "Foco P21/5W  BAY 15d NARVA", "Despues": "Foco P21/5W BAY 15d NARVA"},
		{"Sku": "FOCO-006", "Antes": "Foco PY21W  12V 21W BAU15sPHILIPS", "Despues": "Foco PY21W 12V 21W BAU15sPHILIPS"},
		{"Sku": "FOCO-008", "Antes": "Foco PY21W 24V BAU15s ", "Despues": "Foco PY21W 24V BAU15s"},
		{"Sku": "FOCO-011", "Antes": "Foco  largo 12V60W MICHIBA", "Despues": "Foco largo 12V60W MICHIBA"},
		{"Sku": "FOCO-012", "Antes": "Foco  H11 12V  55W PGJ19-2 NARVA", "Despues": "Foco H11 12V 55W PGJ19-2 NARVA"},
		{"Sku": "FOCO-013", "Antes": "Foco H3 24V 70W PK22As NARVA ", "Despues": "Foco H3 24V 70W PK22As NARVA"},
		{"Sku": "FOCO-014", "Antes": "Foco  H1 24V 70W NARVA", "Despues": "Foco H1 24V 70W NARVA"},
		{"Sku": "FOCO-022", "Antes": "Fluorecentes de salon - Hyundai ", "Despues": "Fluorecentes de salon - HYUNDAI"},
		{"Sku": "FRENO-001", "Antes": "Cañería  de freno izquierdo HYUNDAI", "Despues": "Cañería de freno izquierdo HYUNDAI"},
		{"Sku": "FRENO-003", "Antes": "Zapata de freno integrado posterior SET - SHP  ", "Despues": "Zapata de freno integrado posterior SET - SHP"},
		{"Sku": "FRENO-004", "Antes": "Zapata de freno standar SET - CAMIONETA ", "Despues": "Zapata de freno standar SET - CAMIONETA"},
		{"Sku": "FRENO-006", "Antes": "Fajas de freno  XX FRENOSA kit 4pz", "Despues": "Fajas de freno XX FRENOSA kit 4pz"},
		{"Sku": "FRENO-008", "Antes": "Faja de freno  PREMIUM kit 4pz", "Despues": "Faja de freno PREMIUM kit 4pz"},
		{"Sku": "FUSIBLE-004", "Antes": "Fusible 5 amarillo ", "Despues": "Fusible 5 amarillo"},
		{"Sku": "FUSIBLE-006", "Antes": "Fusible 20 amarillo ", "Despues": "Fusible 20 amarillo"},
		{"Sku": "FUSIBLE-009", "Antes": "Fusible  10 A rojo ", "Despues": "Fusible 10 A rojo"},
		{"Sku": "Fil 01", "Antes": "FIltro de combustible SAKURA", "Despues": "Filtro de combustible SAKURA"},
		{"Sku": "HER-003", "Antes": "Torquimetro 1/4  TOPTUL", "Despues": "Torquimetro 1/4 TOPTUL"},
		{"Sku": "HER-005", "Antes": "Juego de dados hexagonal  4-13 mm 24 pz 1/4\" TOPTUL", "Despues": "Juego de dados hexagonal 4-13 mm 24 pz 1/4\" TOPTUL"},
		{"Sku": "HERRAMIENTA-004", "Antes": "Juego de dados punta hexagonal  1/4\" 8pz", "Despues": "Juego de dados punta hexagonal 1/4\" 8pz"},
		{"Sku": "HERRAMIENTA-032", "Antes": "Caballete 4tn ", "Despues": "Caballete 4tn"},
		{"Sku": "HERRAMIENTA-036", "Antes": "Pistola inhalambrica 20v ", "Despues": "Pistola inhalambrica 20v"},
		{"Sku": "HERRAMIENTA-037", "Antes": "Gata de 24 tn  TRUPPER", "Despues": "Gata de 24 tn TRUPPER"},
		{"Sku": "HERRAMIENTA-038", "Antes": "Gata de tn TRUPER ", "Despues": "Gata de tn TRUPER"},
		{"Sku": "HERRAMIENTA-042", "Antes": "Multimetro  TRUPER", "Despues": "Multimetro TRUPER"},
		{"Sku": "HERRAMIENTA-051", "Antes": "Eslinga verde plana.  3tn 3m izaje", "Despues": "Eslinga verde plana. 3tn 3m izaje"},
		{"Sku": "HERRAMIENTA-054", "Antes": "Llave allen 12mm / TRUPER ", "Despues": "Llave allen 12mm / TRUPER"},
		{"Sku": "HERRAMIENTA-055", "Antes": "Rodillo para parches de cámara y neumaticos ", "Despues": "Rodillo para parches de cámara y neumaticos"},
		{"Sku": "HERRAMIENTA-057", "Antes": "Gata hidráulica tipo botella de 4 TNS ", "Despues": "Gata hidráulica tipo botella de 4 TNS"},
		{"Sku": "Jdjdks", "Antes": "Reten de piñon de ataque D/L  WB", "Despues": "Reten de piñon de ataque D/L WB"},
		{"Sku": "Juejjeje", "Antes": "Filtro  de aceite hidráulico", "Despues": "Filtro de aceite hidráulico"},
		{"Sku": "LUB-001", "Antes": "HIDROLINA (1/4 DE GALÓN) ", "Despues": "Hidrolina (1/4 de galón)"},
		{"Sku": "LUB-002", "Antes": "Aceite diferencial  85W140 / MOBIL", "Despues": "Aceite diferencial 85W140 / MOBIL"},
		{"Sku": "LUBRICANTE-003", "Antes": "hidrolina ATF 220 MOBIL ", "Despues": "Hidrolina ATF 220 MOBIL"},
		{"Sku": "LUBRICANTE-011", "Antes": "aceite de motor motoniveladora CAT15W40", "Despues": "Aceite de motor motoniveladora CAT15W40"},
		{"Sku": "LUBRICANTE-012", "Antes": "AFLOJATODO", "Despues": "Aflojatodo"},
		{"Sku": "MUELLE-001", "Antes": "Paquete de muelle posterior county HY SP. ELEFANTE ", "Despues": "Paquete de muelle posterior COUNTY HY SP. ELEFANTE"},
		{"Sku": "MUELLE-002", "Antes": "Paquete de muelle delantero county TO CP ELEFANTE", "Despues": "Paquete de muelle delantero COUNTY TO CP ELEFANTE"},
		{"Sku": "MUELLE-003", "Antes": " Muelle posteriores ex8 MI CP ELEFANTE", "Despues": "Muelle posteriores EX8 MI CP ELEFANTE"},
		{"Sku": "MUELLE-004", "Antes": "Muelle   delantero EX8 MI CD ELEFANTE ", "Despues": "Muelle delantero EX8 MI CD ELEFANTE"},
		{"Sku": "MUELLE-005", "Antes": "Muelle  posterior ELEFANTE", "Despues": "Muelle posterior ELEFANTE"},
		{"Sku": "MUELLE-006", "Antes": "Topes de goma de muelle posterior flotante EX8 ", "Despues": "Topes de goma de muelle posterior flotante EX8"},
		{"Sku": "NEU-005", "Antes": "Aro de neumatico de hylux", "Despues": "Aro de neumatico de HYLUX"},
		{"Sku": "NEU-008", "Antes": "LLANTA POSTERIOR JK", "Despues": "Llanta posterior JK"},
		{"Sku": "NEU-009", "Antes": "LLANTA DELANTERA VIKRANT", "Despues": "Llanta delantera VIKRANT"},
		{"Sku": "NEU-010", "Antes": "LLANTA DELANTERA / POSTERIOR SAHARA", "Despues": "Llanta delantera / posterior SAHARA"},
		{"Sku": "NEU-011", "Antes": "Aro con pestaña 16 con pestaña ", "Despues": "Aro con pestaña 16 con pestaña"},
		{"Sku": "NEU-012", "Antes": "Pestaña de aro 16 ", "Despues": "Pestaña de aro 16"},
		{"Sku": "NEUMATICO-003", "Antes": "Parche de camara de llanta / VIPAL-  REMENDO R-02", "Despues": "Parche de camara de llanta / VIPAL- REMENDO R-02"},
		{"Sku": "NEUMATICO-007", "Antes": "Resorte de zapata de freno ROJO - hyundai", "Despues": "Resorte de zapata de freno ROJO - HYUNDAI"},
		{"Sku": "RELAY-005", "Antes": "Porta relay 9 polos s/cable para armar - taiwan", "Despues": "Porta relay 9 polos s/cable para armar - TAIWAN"},
		{"Sku": "RELAY-006", "Antes": "Relay tablero universal 24v 5t 10/20amp doble platino (r905v1) (0332209203) (0986332203) (i/tra216211r) (4120/5p/24v) (i/020024) bosch", "Despues": "Relay tablero universal 24v 5t 10/20amp doble platino (r905v1) (0332209203) (0986332203) (i/tra216211r) (4120/5p/24v) (i/020024) BOSCH"},
		{"Sku": "REP-001", "Antes": "TERMOSTATO ", "Despues": "Termostato"},
		{"Sku": "REP-002", "Antes": "ALTERNADOR - TOYOTA VOLTEC/ VTAP104E", "Despues": "Alternador - TOYOTA VOLTEC/ VTAP104E"},
		{"Sku": "REP-005", "Antes": "Esparragos c/tuerca  12x15 para hylux", "Despues": "Esparragos c/tuerca 12x15 para HYLUX"},
		{"Sku": "REP-015", "Antes": "Esparragos c/tuerca SW27 county", "Despues": "Esparragos c/tuerca SW27 COUNTY"},
		{"Sku": "REP-017", "Antes": "Bujes ex8 DINA", "Despues": "Bujes EX8 DINA"},
		{"Sku": "REP-026", "Antes": "Abrazadera de muelle delantero county  5/8\" UNF X 2 3/4X6 DINA", "Despues": "Abrazadera de muelle delantero COUNTY 5/8\" UNF X 2 3/4X6 DINA"},
		{"Sku": "REP-027", "Antes": "Abrazadera N17  de grua o cisterna", "Despues": "Abrazadera N17 de grua o cisterna"},
		{"Sku": "REP-028", "Antes": "Resorte de balata de la faja de frenos NEGRO ", "Despues": "Resorte de balata de la faja de frenos NEGRO"},
		{"Sku": "REP-029", "Antes": "Abrazadera del muelle rojo pequeño ", "Despues": "Abrazadera del muelle rojo pequeño"},
		{"Sku": "REP-030", "Antes": "Bocina para muelle county", "Despues": "Bocina para muelle COUNTY"},
		{"Sku": "REP-036", "Antes": "Buje compensador para muelle  verde grande EX8", "Despues": "Buje compensador para muelle verde grande EX8"},
		{"Sku": "REP-037", "Antes": "Buje compensador azul largo county", "Despues": "Buje compensador azul largo COUNTY"},
		{"Sku": "REP-039", "Antes": "Kit de seguro de balata ", "Despues": "Kit de seguro de balata"},
		{"Sku": "REP-040", "Antes": "Limpia parabrisa county", "Despues": "Limpia parabrisa COUNTY"},
		{"Sku": "REP-042", "Antes": "Servo dirección  EX8", "Despues": "Servo dirección EX8"},
		{"Sku": "REP-044", "Antes": "Pastilla de freno FRENOSA ", "Despues": "Pastilla de freno FRENOSA"},
		{"Sku": "REP-045", "Antes": "Eslinga de remolque con grillete  CAMIONETA", "Despues": "Eslinga de remolque con grillete CAMIONETA"},
		{"Sku": "REP-048", "Antes": "Hidrostático COUNTY ", "Despues": "Hidrostático COUNTY"},
		{"Sku": "REP-049", "Antes": "TENSOR DE FAJA DE POLEA HYUNDAI ", "Despues": "Tensor de faja de polea HYUNDAI"},
		{"Sku": "REP-050", "Antes": "ESPEJOS ALTERNATIVO", "Despues": "Espejos alternativo"},
		{"Sku": "REP-051", "Antes": "DISCO DE FRENO DELANTERO ", "Despues": "Disco de freno delantero"},
		{"Sku": "REP-052", "Antes": "Cinturon de seguridad ", "Despues": "Cinturon de seguridad"},
		{"Sku": "REP-053", "Antes": "MANIJA HYUNDAI", "Despues": "Manija HYUNDAI"},
		{"Sku": "REP-056", "Antes": "Abrazadera ", "Despues": "Abrazadera"},
		{"Sku": "REP-061", "Antes": "Bateria COUNTY - ENERJET LMS 4BVQ55 ", "Despues": "Bateria COUNTY - ENERJET LMS 4BVQ55"},
		{"Sku": "REP-063", "Antes": "Perno m6 de 1/2 pulgada ", "Despues": "Perno m6 de 1/2 pulgada"},
		{"Sku": "REP-064", "Antes": "Polea local  - COUNTY 2525848000", "Despues": "Polea local - COUNTY 2525848000"},
		{"Sku": "REP-068", "Antes": "CILINDRO AMORTIGUADOR DE LA CONSOLA DEL OPERADOR DE 106 mM DE CARRERA", "Despues": "Cilindro amortiguador de la consola del operador de 106 mm de carrera"},
		{"Sku": "RETEN-004", "Antes": "RETÉN DE PUNTA DE PALIER ", "Despues": "Retén de punta de palier"},
		{"Sku": "RETEN-006", "Antes": "RETÉN DE RUEDA DELANTERA ", "Despues": "Retén de rueda delantera"},
		{"Sku": "RODAMIENTO-006", "Antes": "Rodamiento posterior - NSK 42KWD11CA ", "Despues": "Rodamiento posterior - NSK 42KWD11CA"},
		{"Sku": "RODAMIENTO-012", "Antes": "RODAJE JTEK 62032RSC3", "Despues": "Rodaje JTEK 62032RSC3"},
		{"Sku": "SUSPENSION-001", "Antes": "Bocina de trapecio Superior chico  - HILUX 486320K0403", "Despues": "Bocina de trapecio Superior chico - HILUX 486320K0403"},
		{"Sku": "TERMINAL-001", "Antes": "Terminal de barra larga de dirección IZQUIERDO  HYUNDAI", "Despues": "Terminal de barra larga de dirección IZQUIERDO HYUNDAI"},
		{"Sku": "TERMINAL-002", "Antes": "Terminal de barra larga de dirección derecho  HYUNDAI", "Despues": "Terminal de barra larga de dirección derecho HYUNDAI"},
		{"Sku": "TERMINAL-005", "Antes": "Terminal totalmente aislado macho rojo nylon (cable 22-16 awg) mdfn1 - 250 -  cnhowder", "Despues": "Terminal totalmente aislado macho rojo nylon (cable 22-16 awg) mdfn1 - 250 - cnhowder"}
	]$json$;
BEGIN
	SELECT string_agg(t."Sku", ', ') INTO vOmitidos
	FROM jsonb_to_recordset(vDatos) AS t("Sku" TEXT, "Antes" TEXT, "Despues" TEXT)
	LEFT JOIN inv."T_Producto" p ON p."Sku"::TEXT = t."Sku" AND p."Estado" AND p."Nombre" = t."Antes"
	WHERE p."Id" IS NULL;

	UPDATE inv."T_Producto" p
	SET "Nombre" = t."Despues",
		"UsuarioModificacion" = 'Formato nombres 0084'
	FROM jsonb_to_recordset(vDatos) AS t("Sku" TEXT, "Antes" TEXT, "Despues" TEXT)
	WHERE p."Sku"::TEXT = t."Sku" AND p."Estado" AND p."Nombre" = t."Antes";
	GET DIAGNOSTICS vCambiados = ROW_COUNT;

	RAISE NOTICE '0084: % nombres normalizados. Omitidos (cambiaron desde la revision): %', vCambiados, COALESCE(vOmitidos, 'ninguno');
END $$;
