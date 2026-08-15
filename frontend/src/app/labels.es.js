/**
 * Cadenas visibles del shell.
 *
 * `@devcon8/ui` no traduce nada internamente: recibe cada etiqueta como prop.
 * Es una decisión del sistema de diseño — un componente que lleva "Cancel"
 * escrito dentro no sirve para un producto del sector público español.
 *
 * Tenerlas aquí es también el primer paso hacia el requisito multilingüe de
 * DevCon8 §17.3 (ES/CA/EU/GL sin rediseñar la maquetación).
 */

export const shellLabels = {
  navigation: "Navegación principal",
  skipToContent: "Saltar al contenido principal",
  collapseSidebar: "Contraer el menú lateral",
  expandSidebar: "Expandir el menú lateral",
  openMenu: "Abrir el menú",
  closeMenu: "Cerrar el menú",
  mobileNavTitle: "Menú de navegación",
};

export const themeLabels = {
  toggle: "Cambiar el tema",
  light: "Claro",
  dark: "Oscuro",
  system: "Automático (sistema)",
};

export const accountLabels = {
  menu: "Cuenta de usuario",
  signedInAs: "Sesión iniciada como",
  changePassword: "Cambiar contraseña",
  help: "Guía de bienvenida",
  usuarios: "Gestión de usuarios",
  mapa: "Mapa del vivero",
  logout: "Cerrar sesión",
};

export const notificationLabels = {
  open: "Abrir avisos",
  title: "Avisos",
  /** @param {number} n */
  unreadCount: (n) => `${n} aviso${n === 1 ? "" : "s"} sin leer`,
  none: "No hay avisos",
  noneDescription: "Cuando haya stock agotado o productos próximos a caducar, aparecerán aquí.",
  markRead: "Marcar como leído",
  close: "Cerrar",
};

/** @param {number} n */
export const pendingLabel = (n) => `${n} pendiente${n === 1 ? "" : "s"}`;

export const loadingLabels = {
  session: "Cargando la sesión y los permisos…",
};
