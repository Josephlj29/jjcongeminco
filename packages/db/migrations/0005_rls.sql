/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: politicas Row Level Security por rol
	Tipo de Cambio: CREATE - seguridad a nivel de fila
	Autor: Equipo Desarrollo
	Fecha: 2026-06-07
	Descripcion: RLS por rol (admin, gerencia, supervision, almacenero) usando seg.FnRolUsuario().
	             El ledger se escribe solo via FnConfirmarDocumentoInventario (SECURITY DEFINER).
*/

ALTER TABLE "seg"."T_Rol"                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seg"."T_Usuario"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_UnidadMedida"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Categoria"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Producto"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Ubicacion"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Proveedor"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Vehiculo"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_DocumentoInventario"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_DocumentoInventarioDetalle"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_MovimientoStock"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_SaldoStock"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inv"."T_Importacion"                 ENABLE ROW LEVEL SECURITY;

/* ---------------------------------------------------------------------
	Lectura: todo usuario autenticado y activo lee catalogo, saldos y movimientos.
--------------------------------------------------------------------- */
CREATE POLICY "LecturaAutenticado" ON "inv"."T_UnidadMedida"               FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Categoria"                  FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Producto"                   FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Ubicacion"                  FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Proveedor"                  FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Vehiculo"                   FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_DocumentoInventario"        FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_DocumentoInventarioDetalle" FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_MovimientoStock"            FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_SaldoStock"                 FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);
CREATE POLICY "LecturaAutenticado" ON "inv"."T_Importacion"                FOR SELECT USING ("seg"."FnRolUsuario"() IS NOT NULL);

/* ---------------------------------------------------------------------
	Seguridad: cada usuario ve su perfil; admin gestiona usuarios y roles.
--------------------------------------------------------------------- */
CREATE POLICY "UsuarioLecturaPropia" ON "seg"."T_Usuario"
	FOR SELECT USING ("Id" = auth.uid() OR "seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "UsuarioEscrituraAdmin" ON "seg"."T_Usuario"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "RolAdministracion" ON "seg"."T_Rol"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

/* ---------------------------------------------------------------------
	Catalogo: admin y almacenero crean/editan productos; admin el resto.
--------------------------------------------------------------------- */
CREATE POLICY "ProductoEscritura" ON "inv"."T_Producto"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

CREATE POLICY "CategoriaEscrituraAdmin" ON "inv"."T_Categoria"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "UnidadMedidaEscrituraAdmin" ON "inv"."T_UnidadMedida"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "UbicacionEscrituraAdmin" ON "inv"."T_Ubicacion"
	FOR ALL USING ("seg"."FnRolUsuario"() = 'admin')
	WITH CHECK ("seg"."FnRolUsuario"() = 'admin');

CREATE POLICY "ProveedorEscritura" ON "inv"."T_Proveedor"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

CREATE POLICY "VehiculoEscritura" ON "inv"."T_Vehiculo"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/* ---------------------------------------------------------------------
	Documentos e items: admin, almacenero y supervision crean y editan borradores.
--------------------------------------------------------------------- */
CREATE POLICY "DocumentoEscritura" ON "inv"."T_DocumentoInventario"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

CREATE POLICY "DetalleEscritura" ON "inv"."T_DocumentoInventarioDetalle"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero','supervision'));

CREATE POLICY "ImportacionEscritura" ON "inv"."T_Importacion"
	FOR ALL USING ("seg"."FnRolUsuario"() IN ('admin','almacenero'))
	WITH CHECK ("seg"."FnRolUsuario"() IN ('admin','almacenero'));

/*
	Ledger y saldos: sin politicas de escritura a proposito.
	Con RLS activo y sin policy INSERT/UPDATE/DELETE, queda denegada toda
	escritura directa de cliente. El ledger se escribe via la funcion
	FnConfirmarDocumentoInventario (SECURITY DEFINER) y el saldo via trigger.
*/