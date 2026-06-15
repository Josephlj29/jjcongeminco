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
