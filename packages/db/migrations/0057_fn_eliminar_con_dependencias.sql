/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.FnEliminarConDependencias (CREATE)
	Tipo de Cambio: CREATE - soft-delete atomico generico para los 9 maestros
	Autor: Equipo Desarrollo
	Fecha: 2026-08-28
	Descripcion: HALLAZGO (auditoria UI/QA) — los 9 maestros hacian el soft-delete en
	             DOS llamadas separadas desde la API: FnContarDependencias (check) y
	             luego UPDATE Estado=false (use), sin lock ni transaccion entre medio
	             (TOCTOU). En carrera, se podia crear un vinculo hijo entre el conteo y
	             la baja, dejando datos huerfanos apuntando a un padre inactivo.
	             FnEliminarOrdenMantenimiento (0039) ya resolvio esto para OTs con una
	             RPC atomica; esta funcion generaliza el patron a los maestros:
	             revalida el rol segun entidad, toma FOR UPDATE la fila madre, cuenta
	             dependencias DESPUES del lock y recien ahi da de baja. Todo en una
	             transaccion (check+use atomico).

	             Devuelve JSONB para preservar el contrato del DialogEliminar de la UI:
	               { ok: true }                              -> se elimino
	               { ok: false, dependencias: {...} }        -> bloqueado (la API arma el 409)
	             Los errores de rol/entidad/inexistencia se lanzan como excepcion
	             (42501 / P0001) y la API los mapea con mapearErrorNegocio.

	             Whitelist entidad->tabla con format(%I): PEntidad NUNCA se interpola
	             directo (previene inyeccion via identificador).
	             Idempotente (CREATE OR REPLACE).
*/

CREATE OR REPLACE FUNCTION "inv"."FnEliminarConDependencias"
(
	"PEntidad" TEXT,
	"PId"      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "inv", "public"
AS $$
DECLARE
	"vRol"       TEXT;
	"vTabla"     TEXT;
	"vPermitido" TEXT[];   -- roles que pueden eliminar esta entidad
	"vDeps"      JSONB;
	"vExiste"    BOOLEAN;
BEGIN
	/* 1. Whitelist entidad -> tabla + roles permitidos (espejo de puede() en la API).
	      productoEscritura = admin, almacenero | catalogoAdmin = admin. */
	CASE "PEntidad"
		WHEN 'cargo'      THEN "vTabla" = 'T_Cargo';      "vPermitido" = ARRAY['admin'];
		WHEN 'categoria'  THEN "vTabla" = 'T_Categoria';  "vPermitido" = ARRAY['admin'];
		WHEN 'ubicacion'  THEN "vTabla" = 'T_Ubicacion';  "vPermitido" = ARRAY['admin'];
		WHEN 'personal'   THEN "vTabla" = 'T_Personal';   "vPermitido" = ARRAY['admin'];
		WHEN 'equipo'     THEN "vTabla" = 'T_Equipo';     "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'vehiculo'   THEN "vTabla" = 'T_Vehiculo';   "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'tipoEquipo' THEN "vTabla" = 'T_TipoEquipo'; "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'proveedor'  THEN "vTabla" = 'T_Proveedor';  "vPermitido" = ARRAY['admin','almacenero'];
		WHEN 'producto'   THEN "vTabla" = 'T_Producto';   "vPermitido" = ARRAY['admin','almacenero'];
		ELSE
			RAISE EXCEPTION 'Entidad no soportada para eliminacion: %', "PEntidad";
	END CASE;

	/* 2. Defensa en profundidad: revalida el rol (funcion SECURITY DEFINER via RPC). */
	"vRol" = "seg"."FnRolUsuario"();
	IF "vRol" IS NULL OR NOT ("vRol" = ANY ("vPermitido")) THEN
		RAISE EXCEPTION 'No tienes permiso para eliminar este registro.'
			USING ERRCODE = '42501';
	END IF;

	/* 3. Lock de la fila madre ACTIVA (cierra el TOCTOU: cualquier INSERT de hijo
	      concurrente que lea este padre se serializa contra este lock). */
	EXECUTE FORMAT(
		'SELECT TRUE FROM "inv".%I WHERE "Id" = $1 AND "Estado" = TRUE FOR UPDATE',
		"vTabla"
	) INTO "vExiste" USING "PId";

	IF "vExiste" IS NULL THEN
		RAISE EXCEPTION 'El registro no existe o ya fue eliminado.';
	END IF;

	/* 4. Contar dependencias DESPUES del lock. */
	"vDeps" = "inv"."FnContarDependencias"("PEntidad", "PId");

	IF ("vDeps"->>'puedeEliminar')::BOOLEAN = FALSE THEN
		RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'dependencias', "vDeps");
	END IF;

	/* 5. Soft-delete. */
	EXECUTE FORMAT('UPDATE "inv".%I SET "Estado" = FALSE WHERE "Id" = $1', "vTabla")
		USING "PId";

	RETURN JSONB_BUILD_OBJECT('ok', TRUE);
END;
$$;

COMMENT ON FUNCTION "inv"."FnEliminarConDependencias"(TEXT, UUID) IS
	'Soft-delete atomico generico de un maestro: revalida rol por entidad, FOR UPDATE de la fila madre, cuenta dependencias tras el lock y da de baja. Devuelve {ok} o {ok:false, dependencias}. Cierra el TOCTOU del check+use en dos llamadas de la API.';
