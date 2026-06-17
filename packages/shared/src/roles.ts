/* Roles del sistema (coinciden con seg.T_Rol.Codigo). */
export const ROLES = {
  ADMIN: "admin",
  GERENCIA: "gerencia",
  SUPERVISION: "supervision",
  ALMACENERO: "almacenero",
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/* Qué roles pueden escribir cada recurso (reflejo de las políticas RLS). */
export const PERMISOS = {
  productoEscritura: [ROLES.ADMIN, ROLES.ALMACENERO],
  documentoEscritura: [ROLES.ADMIN, ROLES.ALMACENERO, ROLES.SUPERVISION],
  catalogoAdmin: [ROLES.ADMIN],
  // Separación de funciones de requerimientos: quien pide ≠ quien aprueba.
  // Crear: el personal de campo/almacén. Aprobar: gerencia/supervisión/admin
  // (el guard "creador ≠ aprobador" lo refuerza la BD, admin exento).
  requerimientoCrear: [ROLES.ADMIN, ROLES.ALMACENERO, ROLES.SUPERVISION],
  requerimientoAprobar: [ROLES.ADMIN, ROLES.GERENCIA, ROLES.SUPERVISION],
} as const;

export function puede(rol: RoleCode | null | undefined, permiso: keyof typeof PERMISOS): boolean {
  if (!rol) return false;
  return (PERMISOS[permiso] as readonly RoleCode[]).includes(rol);
}

/* ---------------------------------------------------------------------
   Control de acceso por MÓDULO (defensa en profundidad sobre la RLS).
   Decide qué secciones ve/usa cada rol. NO reemplaza la RLS: la RLS
   protege el dato; esto mejora la experiencia y agrega una 2ª barrera
   (sidebar + guard de ruta + check en los GET de la API).
--------------------------------------------------------------------- */
export const MODULOS = {
  DASHBOARD: "dashboard",
  SALDOS: "saldos",
  CATALOGO: "catalogo",
  MOVIMIENTOS: "movimientos",
  REQUERIMIENTOS: "requerimientos",
  MANTENIMIENTO: "mantenimiento",
  APROBACIONES: "aprobaciones",
  REPORTES: "reportes",
  IMPORTAR: "importar",
  MAESTROS_PROVEEDORES: "maestros.proveedores",
  MAESTROS_GENERAL: "maestros.general",
} as const;

export type ModuloCode = (typeof MODULOS)[keyof typeof MODULOS];

/*
  La asignación rol→módulo vive en la BASE DE DATOS (seg.T_RolModulo), que es la
  fuente de verdad del RBAC y es configurable sin redeploy. El frontend recibe la
  lista de módulos del usuario (resuelta en obtenerUsuario vía seg.FnModulosUsuario)
  y filtra con este helper. Los CÓDIGOS de módulo (arriba) sí viven en código porque
  mapean a rutas/secciones reales del repo.
*/
export function puedeVerModulo(
  modulos: readonly string[] | null | undefined,
  modulo: ModuloCode
): boolean {
  if (!modulos) return false;
  return modulos.includes(modulo);
}
