/**
 * Catálogo de roles asignables desde la administración de usuarios.
 *
 * Vive fuera del componente por dos razones. La de diseño: es una tabla de
 * DATOS con una regla de autorización dentro —quién puede conceder el rol de
 * plataforma— y esa regla merece poder probarse sin renderizar una pantalla.
 * La práctica: un módulo que exporta componentes y constantes a la vez rompe
 * la recarga en caliente de Vite.
 */

export const ROLES = [
  { value: "superadmin", label: "Superadmin (plataforma)", superadminOnly: true },
  { value: "admin", label: "Administrador del ayuntamiento" },
  { value: "admin_vivero", label: "Admin de vivero" },
  { value: "gestor_vivero", label: "Gestor de vivero" },
  { value: "manager", label: "Manager" },
  { value: "tecnico", label: "Técnico" },
  { value: "empresa_externa", label: "Empresa externa" },
  { value: "proveedor", label: "Proveedor" },
];

/**
 * Roles que este usuario puede ASIGNAR a otro.
 *
 * Solo el super-admin de la plataforma puede crear otro super-admin. Sin esta
 * condición, un administrador de ayuntamiento podría concederse acceso global
 * entre municipios — es una regla de seguridad, no de presentación.
 */
export const rolesParaUsuario = (esSuperadmin) =>
  ROLES.filter((r) => !r.superadminOnly || esSuperadmin);

/** Estados posibles de una cuenta, para filtros y para el formulario de edición. */
export const ESTADOS_USUARIO = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
  { value: "pendiente", label: "Pendiente" },
  { value: "bloqueado", label: "Bloqueado" },
];
