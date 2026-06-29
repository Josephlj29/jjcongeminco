/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: storage bucket 'mantenimiento' + policies (evidencia fotográfica de OT)
	Tipo de Cambio: storage - bucket público de lectura, escritura autenticada
	Autor: Equipo Desarrollo
	Fecha: 2026-06-29
	Descripcion: Bucket dedicado para la evidencia fotográfica de las órdenes de
	             mantenimiento (estado_actual / post_mantenimiento). Mismo esquema
	             de policies que el bucket 'productos': lectura pública, escritura
	             para usuarios autenticados. La URL pública se registra en
	             inv.T_OrdenMantenimientoEvidencia vía el endpoint.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('mantenimiento', 'mantenimiento', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "mantenimiento_lectura_publica" ON storage.objects
	FOR SELECT TO public USING (bucket_id = 'mantenimiento');

CREATE POLICY "mantenimiento_subida_auth" ON storage.objects
	FOR INSERT TO authenticated WITH CHECK (bucket_id = 'mantenimiento');

CREATE POLICY "mantenimiento_actualizar_auth" ON storage.objects
	FOR UPDATE TO authenticated USING (bucket_id = 'mantenimiento');

CREATE POLICY "mantenimiento_eliminar_auth" ON storage.objects
	FOR DELETE TO authenticated USING (bucket_id = 'mantenimiento');
