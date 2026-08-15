/**
 * MODELO DE PERMISOS — fuente única de verdad para la visibilidad por rol.
 *
 * Hasta ahora estas decisiones vivían dentro de `layout/Layout.jsx`, mezcladas
 * con el marcado del shell. Eso significaba que cualquier cambio visual en el
 * layout tocaba también la superficie de autorización, y no había forma de
 * probarlo sin renderizar la aplicación entera.
 *
 * Este módulo no importa React, ni el router, ni nada del DOM: son datos de
 * entrada y datos de salida. Por eso puede probarse directamente, y por eso el
 * rediseño del shell no puede alterar en silencio quién ve qué.
 *
 * IMPORTANTE: el comportamiento aquí es EXACTAMENTE el que ya tenía
 * `Layout.jsx`. Este módulo no concede ni retira ningún permiso; solo mueve las
 * mismas reglas a un sitio donde se pueden verificar. Cualquier cambio real de
 * permisos es una decisión de producto y necesita su propio cambio.
 *
 * El aislamiento por ayuntamiento (multi-tenant) lo garantiza el backend; aquí
 * solo se decide qué muestra la interfaz.
 */

/* ── Roles ──────────────────────────────────────────────────────────────── */

/** Roles tal y como los devuelve el backend en `me.rol`. */
export const ROLES = Object.freeze({
  SUPERADMIN: "superadmin",
  ADMIN_VIVERO: "admin_vivero",
  ADMIN: "admin",
  MANAGER: "manager",
  TECNICO: "tecnico",
  GESTOR_VIVERO: "gestor_vivero",
  EMPRESA_EXTERNA: "empresa_externa",
  PROVEEDOR: "proveedor",
});

/** Los roles "efectivos" que usa la interfaz, una vez colapsados los alias. */
export const EFFECTIVE_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.TECNICO,
  ROLES.GESTOR_VIVERO,
  ROLES.EMPRESA_EXTERNA,
  ROLES.PROVEEDOR,
]);

/**
 * Rol EFECTIVO para el control de acceso de la interfaz.
 *
 * `superadmin` (dueño de la plataforma) y `admin_vivero` (admin del vivero de
 * un ayuntamiento) se comportan como `admin` a efectos de qué puede ver/hacer.
 * Cualquier otro rol se devuelve tal cual.
 *
 * Acepta el objeto `me` (con .rol/.role) o directamente una cadena de rol.
 */
export function rolEfectivo(meOrRol) {
  const raw = (
    typeof meOrRol === "string" ? meOrRol : meOrRol?.rol || meOrRol?.role || ""
  )
    .toString()
    .trim()
    .toLowerCase();
  if (raw === ROLES.SUPERADMIN || raw === ROLES.ADMIN_VIVERO) return ROLES.ADMIN;
  return raw;
}

/** Rol REAL, sin colapsar alias. Se muestra al usuario y decide `esSuperadmin`. */
export function rolReal(meOrRol) {
  return (typeof meOrRol === "string" ? meOrRol : meOrRol?.rol || meOrRol?.role || "")
    .toString()
    .trim()
    .toLowerCase();
}

/**
 * Super-admin GLOBAL de la plataforma (no de un ayuntamiento).
 *
 * Se acepta tanto el flag del backend como el rol, igual que hacía Layout.jsx:
 * un usuario marcado `es_superadmin`/`es_admin_global` cuenta aunque su rol sea
 * otro.
 */
export function esSuperadmin(me) {
  return !!(me?.es_superadmin || me?.es_admin_global) || rolReal(me) === ROLES.SUPERADMIN;
}

/* ── Rutas ──────────────────────────────────────────────────────────────── */

export const ROUTES = Object.freeze({
  DASHBOARD: "/dashboard",
  PRODUCTOS: "/productos",
  MOVIMIENTOS: "/movimientos",
  PEDIDOS: "/pedidos",
  APROBACIONES: "/aprobaciones",
  INFORMES: "/informes",
  LOTES: "/lotes",
  VIVERO: "/vivero",
  ADMIN_USUARIOS: "/admin/usuarios",
  PLATAFORMA: "/plataforma",
});

/** Elementos del menú principal, en orden de aparición. */
export const NAV_ITEMS = Object.freeze([
  { to: ROUTES.DASHBOARD, label: "Panel de control" },
  { to: ROUTES.PRODUCTOS, label: "Productos" },
  { to: ROUTES.MOVIMIENTOS, label: "Movimientos" },
  { to: ROUTES.PEDIDOS, label: "Pedidos" },
  { to: ROUTES.APROBACIONES, label: "Aprobaciones" },
  { to: ROUTES.INFORMES, label: "Informes" },
]);

/**
 * Elementos del menú visibles por rol.
 *
 * Se declara como lista explícita por rol (no como "todo menos X") a propósito:
 * una lista de permitidos falla cerrada. Si mañana se añade una ruta nueva y
 * nadie actualiza esta tabla, la ruta queda OCULTA para todos, que es el error
 * seguro. Lo contrario — visible para todos hasta que alguien la restrinja — es
 * el error que filtra pantallas.
 */
const NAV_BY_ROLE = Object.freeze({
  [ROLES.ADMIN]: NAV_ITEMS.map((i) => i.to),
  [ROLES.TECNICO]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.PEDIDOS,
    ROUTES.INFORMES,
  ],
  [ROLES.MANAGER]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.APROBACIONES,
    ROUTES.INFORMES,
  ],
  [ROLES.GESTOR_VIVERO]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.PEDIDOS,
    ROUTES.INFORMES,
  ],
  [ROLES.EMPRESA_EXTERNA]: [ROUTES.PRODUCTOS, ROUTES.PEDIDOS, ROUTES.INFORMES],
  // Proveedor: rol de SOLO CONSULTA. Únicamente ve los pedidos de reposición
  // aprobados y puede imprimirlos. Nada más en el menú.
  [ROLES.PROVEEDOR]: [ROUTES.PEDIDOS],
});

/**
 * Rutas alcanzables por rol, incluidas las que no aparecen en el menú
 * (`/lotes`, `/vivero`, `/admin/usuarios`).
 *
 * `/plataforma` NO está aquí: es exclusiva del super-admin global y se resuelve
 * aparte en `canAccessRoute`, porque no depende del rol efectivo sino del flag
 * de plataforma.
 */
const ROUTES_BY_ROLE = Object.freeze({
  [ROLES.ADMIN]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.PEDIDOS,
    ROUTES.APROBACIONES,
    ROUTES.INFORMES,
    ROUTES.LOTES,
    ROUTES.VIVERO,
    ROUTES.ADMIN_USUARIOS,
  ],
  [ROLES.TECNICO]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.PEDIDOS,
    ROUTES.INFORMES,
    ROUTES.LOTES,
    ROUTES.VIVERO,
  ],
  [ROLES.MANAGER]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.APROBACIONES,
    ROUTES.INFORMES,
    ROUTES.LOTES,
    ROUTES.VIVERO,
  ],
  [ROLES.GESTOR_VIVERO]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.PEDIDOS,
    ROUTES.INFORMES,
    ROUTES.LOTES,
    ROUTES.VIVERO,
  ],
  [ROLES.EMPRESA_EXTERNA]: [ROUTES.PRODUCTOS, ROUTES.PEDIDOS, ROUTES.INFORMES],
  [ROLES.PROVEEDOR]: [ROUTES.PEDIDOS],
});

/** Ruta de aterrizaje por rol cuando la actual no está permitida. */
const DEFAULT_ROUTE_BY_ROLE = Object.freeze({
  [ROLES.ADMIN]: ROUTES.DASHBOARD,
  [ROLES.TECNICO]: ROUTES.DASHBOARD,
  [ROLES.MANAGER]: ROUTES.DASHBOARD,
  [ROLES.GESTOR_VIVERO]: ROUTES.DASHBOARD,
  [ROLES.EMPRESA_EXTERNA]: ROUTES.PRODUCTOS,
  [ROLES.PROVEEDOR]: ROUTES.PEDIDOS,
});

/* ── Consultas ──────────────────────────────────────────────────────────── */

/** Elementos del menú principal que este rol efectivo puede ver. */
export function getVisibleNavItems(role) {
  if (!role) return [];
  const allowed = NAV_BY_ROLE[role];
  if (!allowed) return [];
  return NAV_ITEMS.filter((item) => allowed.includes(item.to));
}

/** Ruta a la que enviar a este rol cuando la actual no está permitida. */
export function getDefaultRouteForRole(role) {
  return DEFAULT_ROUTE_BY_ROLE[role] || ROUTES.DASHBOARD;
}

/**
 * ¿Puede este rol efectivo estar en esta ruta?
 *
 * `/` siempre se permite: es la ruta que redirige a `/dashboard`, y bloquearla
 * provocaría un bucle de redirección.
 */
export function isPathAllowedForRole(pathname, role) {
  if (!role) return false;
  if (pathname === "/") return true;
  const allowed = ROUTES_BY_ROLE[role];
  if (!allowed) return false;
  return allowed.includes(pathname);
}

/**
 * Comprobación completa a partir del usuario, incluido el caso especial del
 * super-admin global en `/plataforma`.
 *
 * Este caso especial es fácil de perder en una reescritura del shell —
 * `/plataforma` no está en la lista de ningún rol — y perderlo expulsa al
 * super-admin de su propia pantalla en cada carga.
 */
export function canAccessRoute(pathname, me) {
  const role = rolEfectivo(me);
  if (esSuperadmin(me) && pathname === ROUTES.PLATAFORMA) return true;
  return isPathAllowedForRole(pathname, role);
}

/** Ruta de aterrizaje real del usuario: el super-admin global aterriza en /plataforma. */
export function resolveLandingRoute(me) {
  if (esSuperadmin(me)) return ROUTES.PLATAFORMA;
  return getDefaultRouteForRole(rolEfectivo(me));
}

/* ── Capacidades de la interfaz ─────────────────────────────────────────────
 * Las mismas condiciones que Layout.jsx aplicaba en línea. Extraerlas les da
 * nombre y las hace verificables; los valores son idénticos.
 */

/** Enlace "Plataforma" en el menú: solo super-admin global. */
export function canSeePlataforma(me) {
  return esSuperadmin(me);
}

/** Selector de ayuntamiento: solo super-admin global. */
export function canSelectCliente(me) {
  return esSuperadmin(me);
}

/** Acceso a la gestión de usuarios (`/admin/usuarios`). */
export function canManageUsuarios(me) {
  return rolEfectivo(me) === ROLES.ADMIN;
}

/** Campana de notificaciones: todos menos empresa externa. */
export function canSeeNotifications(me) {
  const role = rolEfectivo(me);
  return !!role && role !== ROLES.EMPRESA_EXTERNA;
}

/** Botón "Mapa del vivero": roles internos del vivero. */
export function canOpenMapaVivero(me) {
  const role = rolEfectivo(me);
  return (
    role === ROLES.ADMIN ||
    role === ROLES.TECNICO ||
    role === ROLES.MANAGER ||
    role === ROLES.GESTOR_VIVERO
  );
}
