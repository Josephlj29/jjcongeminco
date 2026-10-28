/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Categoria + inv.T_Producto + inv.FnValidarJerarquiaCategoria
	Tipo de Cambio: DATA + CREATE - reestructuracion del catalogo
	Autor: Equipo Desarrollo
	Fecha: 2026-10-28
	Descripcion: Segunda de dos migraciones de la reestructuracion de
	             clasificacion (la primera, 0079, ordeno la flota).

	             EL PROBLEMA: convivian TRES formas de categoria distintas.
	             1. La correcta, familia con subcategorias: FAM-ELE > CAT-FOCO.
	             2. Categorias SUELTAS en la raiz, sin familia: CAT-FILTRO (23
	                productos), CAT-RETEN (14), CAT-RODAMIENTO (17), CAT-FRENO
	                (9), 'CAT- CRUCETA' (5, con un espacio dentro del codigo),
	                CAT-FIJACION (5), CAT-MOTOR (3), CAT-SEGURIDAD (2) y cuatro
	                vacias. Una categoria suelta no agrupa: es una familia de
	                una sola rama que el usuario ve al mismo nivel que
	                "Sistema electrico".
	             3. Siete creadas a mano sin codigo estandar: FARO (12), MUELLE
	                (6), GOMA (2), PRECA (1), ROD (1), TAPA (1) y 'padre'
	                ("padre 1", una prueba que quedo en produccion).

	             LA SOLUCION: catorce familias por SISTEMA, cada una con sus
	             categorias, y dos niveles fijos. Se reutilizan los codigos que
	             ya existen, se recuelgan las diez sueltas bajo su familia y se
	             absorben las siete de a mano.

	             SOBRE LOS NOMBRES: la hoja "Familias propuestas" del Excel usa
	             la columna Nombre para listar el CONTENIDO de cada categoria
	             ("Turbo, termostato, bomba de agua, radiador, tapas,
	             precalentador"). Eso no es un nombre: ademas T_Categoria.Nombre
	             es VARCHAR(80) y el de CAT-IMPLEMENTO tiene 90 caracteres, o
	             sea que no entra. Cada categoria recibe un nombre corto y esa
	             lista va a Descripcion (VARCHAR(200)), que es su lugar. No se
	             pierde nada de lo aprobado.

	             FUERA DE ALCANCE A PROPOSITO: los 94 productos colgados directo
	             de FAM-CON y los 67 de FAM-REP se reparten UNO POR UNO, con
	             Revision-catalogo-productos.xlsx, que todavia no esta llenado.
	             Hasta entonces FAM-REP sigue activa: darla de baja ahora
	             dejaria 67 productos en una categoria inactiva.
*/

/* =====================================================================
	1. Familias
	   FAM-LUB pasa a cubrir tambien los fluidos (refrigerante, hidrolina,
	   liquido de frenos), que hoy no tenian donde ir.
===================================================================== */
UPDATE "inv"."T_Categoria"
SET "Nombre" = 'Lubricantes y fluidos'
  , "Descripcion" = 'Aceites, grasas, refrigerante, hidrolina, líquido de frenos.'
  , "UsuarioModificacion" = 'Migracion 0080'
WHERE "Codigo" = 'FAM-LUB' AND "Estado";

INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","Descripcion","UsuarioCreacion","UsuarioModificacion")
VALUES
	 ('FAM-FIL','Filtros','Todo filtro, del sistema que sea: aceite, aire, combustible, hidráulico, cabina.','Migracion 0080','Migracion 0080')
	,('FAM-FRE','Sistema de frenos','Zapatas, pastillas, fajas, bombines, cañerías, gomas y todo componente del circuito de freno.','Migracion 0080','Migracion 0080')
	,('FAM-SUS','Suspensión y dirección','Muelles, amortiguadores, bujes, barras y todo el sistema de dirección.','Migracion 0080','Migracion 0080')
	,('FAM-MOT','Motor y transmisión','Refrigeración y componentes de motor, correas, embrague, cardán y transmisión.','Migracion 0080','Migracion 0080')
	,('FAM-ROD','Rodamientos y retenes','Rodamientos, rodajes, bocamazas, retenes y sellos.','Migracion 0080','Migracion 0080')
	,('FAM-IZA','Izaje y remolque','Eslingas, grilletes, cables de grúa, ganchos y cadenas.','Migracion 0080','Migracion 0080')
	,('FAM-HID','Sistema hidráulico','Mangueras, válvulas, motores y cilindros hidráulicos (grúa, telehandler, minicargador).','Migracion 0080','Migracion 0080')
	,('FAM-SEG','Seguridad y emergencia','Extintores, kits antiderrame, bloqueo, protección personal.','Migracion 0080','Migracion 0080')
	,('FAM-ACC','Accesorios, fijación y carrocería','Pernos, tuercas, espárragos, abrazaderas, seguros de tuerca, piezas de cabina y de implemento.','Migracion 0080','Migracion 0080')
ON CONFLICT DO NOTHING;

/* =====================================================================
	2. Categorias nuevas, cada una bajo su familia
	   Trece huecos que el catalogo no cubria: fluidos, muelles, correas,
	   llantas, eslingas, hidraulico, medicion, equipos de taller, limpieza,
	   emergencia, EPP, carroceria e implemento.
===================================================================== */
INSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","Descripcion","IdCategoriaPadre","UsuarioCreacion","UsuarioModificacion")
SELECT M."cod", M."nom", M."detalle", F."Id", 'Migracion 0080', 'Migracion 0080'
FROM (VALUES
	 ('CAT-FLUIDO'       ,'Fluidos'                 ,'Refrigerante, hidrolina y líquido de frenos.'                     ,'FAM-LUB')
	,('CAT-MUELLE'       ,'Muelles'                 ,'Muelles, paquetes, abrazaderas y bujes de muelle.'                 ,'FAM-SUS')
	,('CAT-CORREA'       ,'Correas y poleas'        ,'Correas, poleas y tensores.'                                      ,'FAM-MOT')
	,('CAT-LLANTA'       ,'Neumáticos y aros'       ,'Neumáticos y aros.'                                               ,'FAM-NEU')
	,('CAT-ESLINGA'      ,'Eslingas y grilletes'    ,'Eslingas, grilletes y cables de izaje.'                           ,'FAM-IZA')
	,('CAT-HIDRAULICO'   ,'Componentes hidráulicos' ,'Mangueras, válvulas, motores y cilindros hidráulicos.'            ,'FAM-HID')
	,('CAT-MEDICION'     ,'Medición y diagnóstico'  ,'Torquímetro, vernier, multímetro, scanner.'                       ,'FAM-HER')
	,('CAT-EQUIPO-TALLER','Equipos de taller'       ,'Gatas, caballetes, engrasadoras, herramientas eléctricas.'        ,'FAM-HER')
	,('CAT-LIMPIEZA'     ,'Limpieza y abrasivos'    ,'Trapos, lijas, piedras.'                                          ,'FAM-CON')
	,('CAT-EMERGENCIA'   ,'Emergencia'              ,'Extintores, kit antiderrame, cajas de bloqueo.'                   ,'FAM-SEG')
	,('CAT-EPP'          ,'Protección personal'     ,'Guantes, lentes y demás protección personal.'                     ,'FAM-SEG')
	,('CAT-CARROCERIA'   ,'Carrocería y cabina'     ,'Espejos, plumillas y piezas de cabina.'                           ,'FAM-ACC')
	,('CAT-IMPLEMENTO'   ,'Piezas de implemento'    ,'Carrete de cisterna, pistola de combustible, uñas de motoniveladora.','FAM-ACC')
) AS M("cod","nom","detalle","fam")
JOIN "inv"."T_Categoria" F ON F."Codigo" = M."fam" AND F."Estado"
ON CONFLICT DO NOTHING;

/* =====================================================================
	3. Las 21 categorias que ya existian: nombre corto, detalle en
	   Descripcion y, sobre todo, SU FAMILIA.
	   Diez de estas estaban sueltas en la raiz; para las otras once el padre
	   ya era el correcto y el UPDATE lo deja igual.
===================================================================== */
UPDATE "inv"."T_Categoria" C
SET "Nombre" = M."nom"
  , "Descripcion" = M."detalle"
  , "IdCategoriaPadre" = F."Id"
  , "UsuarioModificacion" = 'Migracion 0080'
FROM (VALUES
	 ('CAT-FILTRO'     ,'Filtros'                  ,'Aceite, aire, combustible, hidráulico y cabina.'                        ,'FAM-FIL')
	,('CAT-LUBRICANTE' ,'Aceites y grasas'         ,'Aceites de motor, transmisión y grasas.'                                ,'FAM-LUB')
	,('CAT-FOCO'       ,'Focos y faros'            ,'Focos, faros y neblineros.'                                             ,'FAM-ELE')
	,('CAT-FUSIBLE'    ,'Fusibles y portafusibles' ,'Fusibles y portafusibles.'                                              ,'FAM-ELE')
	,('CAT-RELAY'      ,'Relays y portarelays'     ,'Relays y portarelays.'                                                  ,'FAM-ELE')
	,('CAT-TERMINAL'   ,'Terminales y cableado'    ,'Terminales, conectores y cables eléctricos.'                            ,'FAM-ELE')
	,('CAT-ELECTRICO'  ,'Componentes eléctricos'   ,'Alternador, arranque, batería, bocinas, alarmas, switches.'             ,'FAM-ELE')
	,('CAT-FRENO'      ,'Frenos'                   ,'Zapatas, pastillas, fajas, bombines, cañerías y gomas de freno.'        ,'FAM-FRE')
	,('CAT-SUSPENSION' ,'Suspensión'               ,'Amortiguadores, barras estabilizadoras y bujes.'                        ,'FAM-SUS')
	,('CAT-DIRECCION'  ,'Dirección'                ,'Barras, terminales de dirección, muñones, servo, cremallera.'           ,'FAM-SUS')
	,('CAT-MOTOR'      ,'Motor'                    ,'Turbo, termostato, bomba de agua, radiador, tapas, precalentador.'      ,'FAM-MOT')
	,('CAT-TRANSMISION','Transmisión'              ,'Embrague, cardán, crucetas, palier.'                                    ,'FAM-MOT')
	,('CAT-COMBUSTIBLE','Sistema de combustible'   ,'Bomba, inyectores y líneas de combustible.'                             ,'FAM-MOT')
	,('CAT-RODAMIENTO' ,'Rodamientos'              ,'Rodamientos, rodajes y bocamazas.'                                      ,'FAM-ROD')
	,('CAT-RETEN'      ,'Retenes y sellos'         ,'Retenes y sellos.'                                                      ,'FAM-ROD')
	,('CAT-NEUMATICO'  ,'Reparación de neumáticos' ,'Parches, válvulas, o-rings.'                                            ,'FAM-NEU')
	,('CAT-HERRAMIENTA','Herramientas manuales'    ,'Herramientas manuales del taller.'                                      ,'FAM-HER')
	,('CAT-CINTA'      ,'Cintas'                   ,'Cintas aislantes, de embalaje y teflón.'                                ,'FAM-CON')
	,('CAT-SELLANTE'   ,'Sellantes y adhesivos'    ,'Sellantes, siliconas y adhesivos.'                                      ,'FAM-CON')
	,('CAT-QUIMICO'    ,'Químicos'                 ,'Aflojatodo, limpia contacto, auxiliar de arranque.'                     ,'FAM-CON')
	,('CAT-FIJACION'   ,'Fijación y sujeción'      ,'Pernos, tuercas, arandelas, espárragos, abrazaderas, seguros de tuerca.','FAM-ACC')
) AS M("cod","nom","detalle","fam")
JOIN "inv"."T_Categoria" F ON F."Codigo" = M."fam" AND F."Estado"
WHERE TRIM(C."Codigo") = M."cod" AND C."Estado";

/* =====================================================================
	4. Fusiones: PRIMERO se mueven los productos, DESPUES se da de baja el
	   origen. Al reves quedarian productos activos en una categoria
	   inactiva, que es justo el estado que no queremos.
===================================================================== */
UPDATE "inv"."T_Producto" P
SET "IdCategoria" = D."Id", "UsuarioModificacion" = 'Migracion 0080'
FROM (VALUES
	 ('CAT- CRUCETA' ,'CAT-TRANSMISION')
	,('CAT-SEGURIDAD','CAT-FIJACION')
	,('FARO'         ,'CAT-FOCO')
	,('GOMA'         ,'CAT-FRENO')
	,('MUELLE'       ,'CAT-MUELLE')
	,('PRECA'        ,'CAT-MOTOR')
	,('ROD'          ,'CAT-IMPLEMENTO')
	,('TAPA'         ,'CAT-MOTOR')
) AS M("origen","destino")
JOIN "inv"."T_Categoria" O ON TRIM(O."Codigo") = M."origen"
JOIN "inv"."T_Categoria" D ON D."Codigo" = M."destino" AND D."Estado"
WHERE P."IdCategoria" = O."Id";

/* Las ocho fusionadas mas las dos que se van por vacias: CAT-VARIOS (cajon de
   sastre sin un solo producto) y 'padre' (la prueba que quedo en produccion).
   Se conservan de baja, no se borran: los productos viejos las nombran. */
UPDATE "inv"."T_Categoria" C
SET "Estado" = FALSE, "UsuarioModificacion" = 'Migracion 0080'
FROM (VALUES
	 ('CAT- CRUCETA'),('CAT-SEGURIDAD'),('FARO'),('GOMA'),('MUELLE')
	,('PRECA'),('ROD'),('TAPA'),('CAT-VARIOS'),('padre')
) AS M("cod")
WHERE TRIM(C."Codigo") = M."cod" AND C."Estado";

/* =====================================================================
	5. El trigger que faltaba: dos niveles y sin ciclos.
	   Hasta hoy nada impedia un tercer nivel ni que una categoria fuera su
	   propio padre; de ahi salio el 'padre > hijo' de prueba. Va AL FINAL
	   para no estorbar los movimientos de arriba.
===================================================================== */
CREATE OR REPLACE FUNCTION "inv"."FnValidarJerarquiaCategoria"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
	"vAbuelo" UUID;
	"vHijas"  INTEGER;
BEGIN
	/* Una familia (sin padre) siempre es valida. */
	IF NEW."IdCategoriaPadre" IS NULL THEN
		RETURN NEW;
	END IF;

	IF NEW."IdCategoriaPadre" = NEW."Id" THEN
		RAISE EXCEPTION 'Una categoria no puede ser su propio padre.'
			USING ERRCODE = 'check_violation';
	END IF;

	SELECT "IdCategoriaPadre" INTO "vAbuelo"
	FROM "inv"."T_Categoria" WHERE "Id" = NEW."IdCategoriaPadre";

	IF "vAbuelo" IS NOT NULL THEN
		RAISE EXCEPTION 'El catalogo tiene dos niveles: familia y categoria. Lo que elegiste como padre ya cuelga de una familia.'
			USING ERRCODE = 'check_violation';
	END IF;

	SELECT COUNT(*) INTO "vHijas"
	FROM "inv"."T_Categoria"
	WHERE "IdCategoriaPadre" = NEW."Id" AND "Estado" = TRUE;

	IF "vHijas" > 0 THEN
		RAISE EXCEPTION 'Esta categoria tiene % subcategorias: si la cuelgas de una familia quedarian tres niveles.', "vHijas"
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "inv"."FnValidarJerarquiaCategoria"() IS 'Limita el catalogo a dos niveles (familia > categoria) y evita que una categoria sea su propio padre.';

CREATE TRIGGER "TR_T_Categoria_Jerarquia"
	BEFORE INSERT OR UPDATE OF "IdCategoriaPadre" ON "inv"."T_Categoria"
	FOR EACH ROW EXECUTE FUNCTION "inv"."FnValidarJerarquiaCategoria"();

/* =====================================================================
	6. Guardas: si algo de arriba no cerro, la migracion aborta entera
	   en vez de dejar el catalogo a medio camino.
===================================================================== */
DO $$
DECLARE
	"vSueltas"   TEXT;
	"vRaras"     TEXT;
	"vNivel3"    INTEGER;
	"vHuerfanos" INTEGER;
	"vPerdidos"  INTEGER;
BEGIN
	SELECT STRING_AGG("Codigo", ', ' ORDER BY "Codigo") INTO "vSueltas"
	FROM "inv"."T_Categoria"
	WHERE "Estado" AND "Codigo" LIKE 'CAT-%' AND "IdCategoriaPadre" IS NULL;
	IF "vSueltas" IS NOT NULL THEN
		RAISE EXCEPTION 'Quedaron categorias sueltas en la raiz: %', "vSueltas";
	END IF;

	SELECT STRING_AGG("Codigo", ', ' ORDER BY "Codigo") INTO "vRaras"
	FROM "inv"."T_Categoria"
	WHERE "Estado" AND "Codigo" NOT LIKE 'FAM-%' AND "Codigo" NOT LIKE 'CAT-%';
	IF "vRaras" IS NOT NULL THEN
		RAISE EXCEPTION 'Quedaron categorias con codigo fuera del estandar: %', "vRaras";
	END IF;

	SELECT COUNT(*) INTO "vNivel3"
	FROM "inv"."T_Categoria" N
	JOIN "inv"."T_Categoria" P ON P."Id" = N."IdCategoriaPadre"
	WHERE N."Estado" AND P."IdCategoriaPadre" IS NOT NULL;
	IF "vNivel3" > 0 THEN
		RAISE EXCEPTION 'Quedaron % categorias activas en un tercer nivel', "vNivel3";
	END IF;

	SELECT COUNT(*) INTO "vHuerfanos"
	FROM "inv"."T_Producto" P
	JOIN "inv"."T_Categoria" C ON C."Id" = P."IdCategoria"
	WHERE P."Estado" AND NOT C."Estado";
	IF "vHuerfanos" > 0 THEN
		RAISE EXCEPTION 'Quedaron % productos activos en una categoria dada de baja', "vHuerfanos";
	END IF;

	SELECT COUNT(*) INTO "vPerdidos"
	FROM "inv"."T_Producto" WHERE "Estado" AND "IdCategoria" IS NULL;
	IF "vPerdidos" > 0 THEN
		RAISE EXCEPTION 'Quedaron % productos activos sin categoria', "vPerdidos";
	END IF;
END;
$$;
