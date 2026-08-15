import {
  LayoutDashboard,
  Sprout,
  ArrowLeftRight,
  ClipboardList,
  BadgeCheck,
  FileBarChart,
  Building2,
} from "lucide-react";

import {
  NAV_ITEMS,
  ROUTES,
  getVisibleNavItems,
  canSeePlataforma,
  rolEfectivo,
} from "./permissions";

/**
 * NAVEGACIÓN COMO DATOS.
 *
 * `@devcon8/ui` renderiza un árbol `NavSection[]`; no se le pasa JSX. Eso
 * permite filtrar por permisos ANTES de renderizar en lugar de ocultar con CSS
 * — un enlace que solo está oculto sigue estando en la carga de la página y le
 * dice a quien no debería verlo qué módulos existen y dónde viven.
 *
 * Los iconos ACOMPAÑAN a la etiqueta, nunca la sustituyen. Los emoji que había
 * antes (🛰️ Plataforma, 🔒 Cambiar contraseña) se renderizan distinto en cada
 * sistema operativo y no tienen nombre accesible.
 */

/** Icono por ruta. Las rutas y sus etiquetas siguen viviendo en permissions.js. */
const ICONS = {
  [ROUTES.DASHBOARD]: LayoutDashboard,
  [ROUTES.PRODUCTOS]: Sprout,
  [ROUTES.MOVIMIENTOS]: ArrowLeftRight,
  [ROUTES.PEDIDOS]: ClipboardList,
  [ROUTES.APROBACIONES]: BadgeCheck,
  [ROUTES.INFORMES]: FileBarChart,
  [ROUTES.PLATAFORMA]: Building2,
};

/**
 * Construye las secciones de navegación para un usuario concreto.
 *
 * El filtrado por rol se delega íntegramente en `permissions.js`: aquí no se
 * decide ningún permiso, solo se le pone forma e iconos al resultado. Si esta
 * función tomara sus propias decisiones habría dos modelos de autorización que
 * se desincronizarían.
 *
 * @param {object|null} me                 Usuario devuelto por /me.
 * @param {Record<string, number>} badges  Contadores por ruta, p. ej. { "/pedidos": 3 }.
 */
export function buildNavSections(me, badges = {}) {
  const sections = [];

  // El super-admin global entra por su propia sección: no es "una pantalla más
  // del vivero", es el panel de la plataforma que hay por encima.
  if (canSeePlataforma(me)) {
    sections.push({
      key: "plataforma",
      label: "Plataforma",
      items: [
        {
          key: "plataforma",
          label: "Panel de plataforma",
          href: ROUTES.PLATAFORMA,
          icon: ICONS[ROUTES.PLATAFORMA],
        },
      ],
    });
  }

  const items = getVisibleNavItems(rolEfectivo(me)).map((item) => ({
    key: item.to,
    label: item.label,
    href: item.to,
    icon: ICONS[item.to],
    badgeCount: badges[item.to] || 0,
  }));

  if (items.length > 0) {
    sections.push({
      key: "vivero",
      // La sección principal va sin encabezado: es la lista por defecto y
      // ponerle un título solo añade ruido sobre el propio menú.
      items,
    });
  }

  return sections;
}

/** Solo para pruebas: el mapa de iconos y los elementos base. */
export const __testing = { ICONS, NAV_ITEMS };
