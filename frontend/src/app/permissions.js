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
  // Solo lectura global: ve todos los módulos operativos pero no puede escribir
  // (el backend bloquea toda escritura para este rol).
  OBSERVADOR: "observador",
});

/** ¿Es un rol de solo lectura (observador)? Para ocultar acciones de escritura. */
export function esObservador(meOrRol) {
  return rolReal(meOrRol) === ROLES.OBSERVADOR;
}

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

/* ── Matriz de permisos dinámica (RBAC por ayuntamiento) ────────────────────
 *
 * El backend (`/auth/me`) devuelve `me.permisos` (funcionalidad → none/read/full)
 * y `me.scope` (casillas de alcance), sembrados y EDITABLES por ayuntamiento.
 *
 * HÍBRIDO A PROPÓSITO: cuando `me` trae `permisos` (app real), mandan los datos
 * del backend. Cuando NO los trae (p.ej. pruebas que pasan solo el rol), se cae
 * a las tablas estáticas de más abajo, que reproducen la matriz por defecto. Así
 * la app es dinámica sin obligar a reescribir toda la batería de pruebas.
 */

/** ¿Tenemos matriz del backend para este `me`? */
export function tieneMatriz(me) {
  return !!(me && typeof me === "object" && me.permisos && typeof me.permisos === "object");
}

/** Nivel ('none'|'read'|'full') de una funcionalidad para `me` (según la matriz). */
export function nivelDe(me, func) {
  return (me?.permisos && me.permisos[func]) || "none";
}

/**
 * ¿Puede `me` usar la funcionalidad `func`? `escribir=true` exige 'full';
 * `escribir=false` (lectura) acepta 'read' o 'full'. superadmin siempre sí.
 */
export function can(me, func, { escribir = true } = {}) {
  if (esSuperadmin(me)) return true;
  const nivel = nivelDe(me, func);
  if (nivel === "full") return true;
  if (nivel === "read" && !escribir) return true;
  return false;
}

/** ¿Puede VER (lectura o más) la funcionalidad? */
export function puedeVer(me, func) {
  return can(me, func, { escribir: false });
}

/** Valor de una casilla de alcance (filtrado de datos) del rol. */
export function tieneAlcance(me, flag) {
  return !!(me?.scope && me.scope[flag]);
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
  ADMIN_ROLES: "/admin/roles",
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
  // Observador: solo lectura, pero ve TODOS los módulos operativos.
  [ROLES.OBSERVADOR]: NAV_ITEMS.map((i) => i.to),
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
    ROUTES.ADMIN_ROLES,
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
  // Observador: alcanza todos los módulos operativos (incl. lotes y vivero),
  // pero no la gestión de usuarios ni la plataforma. Solo lectura.
  [ROLES.OBSERVADOR]: [
    ROUTES.DASHBOARD,
    ROUTES.PRODUCTOS,
    ROUTES.MOVIMIENTOS,
    ROUTES.PEDIDOS,
    ROUTES.APROBACIONES,
    ROUTES.INFORMES,
    ROUTES.LOTES,
    ROUTES.VIVERO,
  ],
});

/** Ruta de aterrizaje por rol cuando la actual no está permitida. */
const DEFAULT_ROUTE_BY_ROLE = Object.freeze({
  [ROLES.ADMIN]: ROUTES.DASHBOARD,
  [ROLES.TECNICO]: ROUTES.DASHBOARD,
  [ROLES.MANAGER]: ROUTES.DASHBOARD,
  [ROLES.GESTOR_VIVERO]: ROUTES.DASHBOARD,
  [ROLES.EMPRESA_EXTERNA]: ROUTES.PRODUCTOS,
  [ROLES.PROVEEDOR]: ROUTES.PEDIDOS,
  [ROLES.OBSERVADOR]: ROUTES.DASHBOARD,
});

/* ── Mapa ruta → funcionalidad (para la matriz dinámica) ─────────────────── */

/** Funcionalidades de informes: la pantalla Informes se ve si hay ALGUNA. */
const INFORMES_FUNCS = [
  "informes.trazabilidad",
  "informes.distribucion",
  "informes.inventario",
  "informes.existencias",
  "informes.caducidad",
  "informes.movimientos_externos",
  "informes.prestamos",
  "informes.abastecimiento",
  "informes.baja",
  "informes.estadisticas",
];

/** Qué funcionalidad gobierna la VISIBILIDAD de cada ruta. */
const ROUTE_FUNC = Object.freeze({
  [ROUTES.DASHBOARD]: "general.panel",
  [ROUTES.PRODUCTOS]: "productos.ver",
  [ROUTES.MOVIMIENTOS]: "movimientos.ver",
  [ROUTES.PEDIDOS]: "pedidos.ver",
  [ROUTES.APROBACIONES]: "aprobaciones.ver",
  [ROUTES.INFORMES]: "__informes__",
  [ROUTES.LOTES]: "general.lotes",
  [ROUTES.VIVERO]: "general.mapa",
  [ROUTES.ADMIN_USUARIOS]: "admin.usuarios",
  [ROUTES.ADMIN_ROLES]: "admin.usuarios",
});

/** ¿La matriz de `me` concede ver esta ruta? (solo cuando hay matriz). */
function _rutaVisibleMatriz(me, route) {
  if (route === ROUTES.INFORMES) return INFORMES_FUNCS.some((f) => puedeVer(me, f));
  const func = ROUTE_FUNC[route];
  if (!func) return false;
  return puedeVer(me, func);
}

/* ── Consultas ──────────────────────────────────────────────────────────── */

/**
 * Elementos del menú principal visibles.
 *
 * Acepta el `me` completo (con matriz del backend) o, por compatibilidad con
 * las pruebas, un rol efectivo en cadena (cae a la tabla estática).
 */
export function getVisibleNavItems(meOrRole) {
  if (tieneMatriz(meOrRole) || esSuperadmin(meOrRole)) {
    return NAV_ITEMS.filter((item) => _rutaVisibleMatriz(meOrRole, item.to));
  }
  const role = typeof meOrRole === "string" ? meOrRole : rolEfectivo(meOrRole);
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
  if (esSuperadmin(me) && pathname === ROUTES.PLATAFORMA) return true;
  if (pathname === "/") return true;
  if (tieneMatriz(me) || esSuperadmin(me)) {
    // Ruta conocida → la gobierna su funcionalidad en la matriz; ruta
    // desconocida → no permitida (falla cerrada, igual que la tabla estática).
    if (ROUTE_FUNC[pathname] !== undefined) return _rutaVisibleMatriz(me, pathname);
    return false;
  }
  return isPathAllowedForRole(pathname, rolEfectivo(me));
}

/** Ruta de aterrizaje real del usuario: el super-admin global aterriza en /plataforma. */
export function resolveLandingRoute(me) {
  if (esSuperadmin(me)) return ROUTES.PLATAFORMA;
  if (tieneMatriz(me)) {
    const nav = getVisibleNavItems(me);
    return nav.length ? nav[0].to : ROUTES.DASHBOARD;
  }
  return getDefaultRouteForRole(rolEfectivo(me));
}

/* ── Capacidades de la interfaz ─────────────────────────────────────────────
 * Las mismas condiciones que Layout.jsx aplicaba en línea. Extraerlas les da
 * nombre y las hace verificables; los valores son idénticos.
 */

/**
 * Ayudante HÍBRIDO: con matriz del backend decide por `func`; sin ella, cae a la
 * regla estática `estatico()` (para las pruebas basadas solo en el rol).
 */
function _cap(me, func, estatico, escribir = true) {
  if (tieneMatriz(me) || esSuperadmin(me)) return can(me, func, { escribir });
  return estatico();
}

/**
 * Gate de ACCIÓN de una pantalla, híbrido: con matriz manda `func`; sin matriz
 * (pruebas por rol) cae a si el rol efectivo está en `rolesFallback`. Pensado
 * para botones de página (crear pedido, registrar movimiento, decidir, etc.).
 */
export function puedeAccion(me, func, rolesFallback = [], { escribir = true } = {}) {
  if (tieneMatriz(me) || esSuperadmin(me)) return can(me, func, { escribir });
  const role = rolEfectivo(me);
  return rolesFallback.includes(role);
}

/** Enlace "Plataforma" en el menú: solo super-admin global. */
export function canSeePlataforma(me) {
  return esSuperadmin(me);
}

/** Selector de ayuntamiento: solo super-admin global. */
export function canSelectCliente(me) {
  return esSuperadmin(me);
}

/** Acceso a la gestión de usuarios y roles (`/admin/usuarios`). */
export function canManageUsuarios(me) {
  return _cap(me, "admin.usuarios", () => rolEfectivo(me) === ROLES.ADMIN);
}

/** Campana de notificaciones. */
export function canSeeNotifications(me) {
  return _cap(
    me,
    "general.notificaciones",
    () => {
      const role = rolEfectivo(me);
      return !!role && role !== ROLES.EMPRESA_EXTERNA;
    },
    false
  );
}

/** Botón "Mapa del vivero". */
export function canOpenMapaVivero(me) {
  return _cap(
    me,
    "general.mapa",
    () => {
      const role = rolEfectivo(me);
      return (
        role === ROLES.ADMIN ||
        role === ROLES.TECNICO ||
        role === ROLES.MANAGER ||
        role === ROLES.GESTOR_VIVERO ||
        role === ROLES.OBSERVADOR
      );
    },
    false
  );
}

/**
 * Subir / cambiar / eliminar la IMAGEN del mapa del vivero del ayuntamiento.
 *
 * Cada ayuntamiento sube la foto de SU propio vivero (se guarda por `cliente_id`
 * en el backend). Debe coincidir con `require_roles(["admin", "manager"])` de
 * `POST/DELETE /mapa-imagen` en main.py — `admin_vivero` y `superadmin` colapsan
 * en `admin` vía `rolEfectivo`.
 */
export function canManageMapaImagen(me) {
  return _cap(
    me,
    "general.mapa_editar_zonas",
    () => {
      const role = rolEfectivo(me);
      return role === ROLES.ADMIN || role === ROLES.MANAGER;
    }
  );
}

/**
 * Crear / editar / eliminar las ZONAS del mapa (editor visual).
 *
 * Solo administración del vivero: `admin` (y por colapso `admin_vivero` y
 * `superadmin`). Debe coincidir con `require_roles(["admin"])` de
 * `PUT /zonas-config` en main.py.
 */
export function canEditZonas(me) {
  return _cap(me, "general.mapa_editar_zonas", () => rolEfectivo(me) === ROLES.ADMIN);
}

/**
 * Ajustes del ayuntamiento: logo y nombre usados en los informes.
 *
 * Solo administración: `admin` (y por colapso `admin_vivero` y `superadmin`).
 * Debe coincidir con `require_roles(["admin"])` de `POST/DELETE /logo-imagen` y
 * `PATCH /mi-ayuntamiento` en main.py.
 */
export function canManageAjustes(me) {
  return rolEfectivo(me) === ROLES.ADMIN;
}

/**
 * Gestionar el catálogo de categorías y subcategorías de productos.
 *
 * Solo administración: `admin` (y por colapso `admin_vivero` y `superadmin`).
 * Debe coincidir con `require_roles(["admin"])` de los endpoints /categorias y
 * /subcategorias en main.py.
 */
export function canManageCategorias(me) {
  return rolEfectivo(me) === ROLES.ADMIN;
}

/**
 * Analítica agregada del panel (productos más demandados, destinos más
 * frecuentes y pedidos por día).
 *
 * NO es una elección estética: `GET /pedidos` recorta las FILAS que ven la
 * empresa externa —solo sus pedidos y las reposiciones servibles— y el
 * proveedor —solo reposiciones servibles—. Un ranking calculado sobre el
 * histórico COMPLETO del ayuntamiento les permitiría deducir qué se pide y a
 * qué barrios se sirve a partir de datos que no tienen permiso para consultar.
 *
 * Esta lista debe coincidir con `require_roles` de `GET /dashboard/analytics`
 * en main.py; el backend es quien manda y aquí solo se evita pedir algo que
 * devolvería 403.
 */
export function canSeeAnalitica(me) {
  return _cap(
    me,
    "general.panel",
    () => {
      const role = rolEfectivo(me);
      return (
        role === ROLES.ADMIN ||
        role === ROLES.MANAGER ||
        role === ROLES.TECNICO ||
        role === ROLES.GESTOR_VIVERO
      );
    },
    false
  );
}
