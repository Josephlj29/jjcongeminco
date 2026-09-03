/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.T_Requerimiento (CHECK de Origen)
	Tipo de Cambio: ALTER - unificar 'planificado' + 'presupuestado' en un solo origen
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Descripcion: El origen del requerimiento pasa de 3 opciones a 2. En la practica
	             "planificado" y "presupuestado" describian lo mismo desde la vista
	             del negocio (consumo previsto) y confundian al solicitante; la
	             distincion que SI importa es contra "desgaste_prematuro", que es la
	             que alimenta el reporte de recambios acelerados
	             (V_Recambio_Producto: Origen = 'desgaste_prematuro' -> Acelerado).

	             Se conserva 'planificado' como CODIGO almacenado (la etiqueta en la
	             UI pasa a "Planificado / Presupuestado"). No se introduce un codigo
	             nuevo 'planificado_presupuestado' porque mide exactamente 25 chars y
	             la columna es VARCHAR(25): quedaria sin margen alguno. Ademas asi
	             las filas historicas 'planificado' no se tocan.

	             Backfill: 'presupuestado' -> 'planificado' (hoy 0 filas; queda como
	             red de seguridad e idempotente). Orden importante: primero migrar
	             los datos, despues endurecer el CHECK.
*/

/* 1. Backfill: el origen viejo pasa al unificado. */
UPDATE "inv"."T_Requerimiento"
SET "Origen" = 'planificado'
WHERE "Origen" = 'presupuestado';

/* 2. CHECK con las 2 opciones vigentes. */
ALTER TABLE "inv"."T_Requerimiento"
	DROP CONSTRAINT IF EXISTS "CHK_T_Requerimiento_Origen_Permitido";
ALTER TABLE "inv"."T_Requerimiento"
	ADD CONSTRAINT "CHK_T_Requerimiento_Origen_Permitido"
	CHECK ("Origen" IN ('planificado','desgaste_prematuro'));

COMMENT ON COLUMN "inv"."T_Requerimiento"."Origen" IS 'Origen: planificado (incluye presupuestado; etiqueta UI "Planificado / Presupuestado") o desgaste_prematuro.';
