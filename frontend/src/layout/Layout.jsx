import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sprout } from "lucide-react";

import { clearStoredToken, getMe, getProductos, getPedidos } from "../api/api";
import ClienteSelector from "../components/common/ClienteSelector";
import CambiarPasswordModal from "../components/common/CambiarPasswordModal";
import WelcomeModal from "../components/welcome/WelcomeModal";
import { shouldShowWelcomeOnStart } from "../components/welcome/welcomeStorage";
import NotificationsPanel from "../components/shell/NotificationsPanel";
import ErrorBoundary from "../components/shell/ErrorBoundary";
import { ToastProvider } from "../components/ui/ToastProvider";
import UserMenu from "../components/shell/UserMenu";
import ZonaMapDialog from "../components/shell/ZonaMapDialog";

import { AppShell, Badge, Skeleton } from "../ui";
import AppLink from "../app/AppLink";
import { buildNavSections } from "../app/navigation";
import { shellLabels, pendingLabel, loadingLabels } from "../app/labels.es";
import {
  rolEfectivo,
  rolReal,
  canAccessRoute,
  resolveLandingRoute,
  canSelectCliente,
  canManageUsuarios,
  canSeeNotifications,
  canOpenMapaVivero,
  ROLES,
  ROUTES,
} from "../app/permissions";
import {
  computeBadgeCounts,
  markPedidosSeen,
  loadSeenPedidosFromStorage,
  saveSeenPedidosToStorage,
  getReadNotificationsFromStorage,
  saveReadNotificationsToStorage,
} from "../app/badges";
import { buildAllNotifications } from "../app/notifications";

/*
 * SHELL DE LA APLICACIÓN.
 *
 * Este fichero pasa de 2.014 líneas a algo que se puede leer de una sentada.
 * Lo que se ha ido no es funcionalidad: son las tres funciones de autorización
 * (a `app/permissions.js`), el motor de avisos (`app/badges.js`), los
 * constructores de notificaciones (`app/notifications.js`), el mapa del vivero
 * y el panel de avisos (`components/shell/`), y unas 86 declaraciones de estilo
 * en línea que ahora las resuelve el sistema de diseño.
 *
 * El shell en sí es `AppShell` de DevCon8: cabecera semántica, landmarks,
 * enlace de salto al contenido, barra lateral contraíble y cajón de navegación
 * en móvil. Lo que ViverApp aporta es el contenido de las ranuras.
 */

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [productos, setProductos] = useState([]);
  const [pedidosUsuario, setPedidosUsuario] = useState([]);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState(() =>
    getReadNotificationsFromStorage()
  );
  const [seenPedidos, setSeenPedidos] = useState(() => loadSeenPedidosFromStorage());

  // Modal de bienvenida: se abre automáticamente al entrar al Dashboard si es
  // la primera vez o si el usuario marcó "Mostrar al iniciar". En cualquier
  // otro caso se abre desde el menú de cuenta.
  useEffect(() => {
    if (location.pathname !== ROUTES.DASHBOARD) return;
    if (!me) return; // espera a tener al usuario para no abrirlo antes de la sesión
    if (shouldShowWelcomeOnStart()) setWelcomeOpen(true);
    // Solo se evalúa al cambiar de ruta o al cargar al usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, me?.id]);

  useEffect(() => {
    const loadMe = async () => {
      try {
        const data = await getMe();
        setMe(data);
        try {
          window.localStorage.setItem("user", JSON.stringify(data));
        } catch {
          // noop
        }
      } catch {
        clearStoredToken();
        navigate("/login");
      }
    };
    loadMe();
  }, [navigate]);

  const userRole = rolEfectivo(me);
  const rolMostrado = rolReal(me);
  const esEmpresaExternaRol = userRole === ROLES.EMPRESA_EXTERNA;

  // Recarga los datos que alimentan los avisos del menú. Reutilizable: al
  // cambiar de ruta, al enfocar la ventana, por intervalo y tras cualquier
  // acción (evento "vivero:data-changed").
  const refreshBadgeData = useCallback(async () => {
    if (!me) return;
    if (esEmpresaExternaRol) {
      setProductos([]);
      try {
        const data = await getPedidos();
        setPedidosUsuario(Array.isArray(data) ? data : []);
      } catch { /* noop */ }
      return;
    }
    try {
      const data = await getProductos();
      setProductos(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
    try {
      const data = await getPedidos();
      setPedidosUsuario(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
  }, [me, esEmpresaExternaRol]);

  useEffect(() => {
    refreshBadgeData();
  }, [location.pathname, refreshBadgeData]);

  // Refresca los avisos sin cambiar de pantalla: tras cualquier acción que
  // modifique datos, al volver a enfocar la ventana y periódicamente.
  useEffect(() => {
    if (!me) return;
    const onChanged = () => { refreshBadgeData(); };
    window.addEventListener("vivero:data-changed", onChanged);
    window.addEventListener("focus", onChanged);
    const intervalId = setInterval(refreshBadgeData, 30000);
    return () => {
      window.removeEventListener("vivero:data-changed", onChanged);
      window.removeEventListener("focus", onChanged);
      clearInterval(intervalId);
    };
  }, [me, refreshBadgeData]);

  useEffect(() => {
    saveReadNotificationsToStorage(readNotificationIds);
  }, [readNotificationIds]);

  useEffect(() => {
    saveSeenPedidosToStorage(seenPedidos);
  }, [seenPedidos]);

  // Al entrar en /pedidos se marcan como vistos todos los pedidos en su estado
  // actual: el aviso del solicitante baja a 0. Los avisos de acción requerida
  // (manager, proveedor, servidor) NO se ven afectados — se recalculan desde
  // datos vivos y solo bajan cuando se realiza la acción.
  useEffect(() => {
    if (location.pathname !== ROUTES.PEDIDOS) return;
    setSeenPedidos((prev) => markPedidosSeen(prev, pedidosUsuario));
  }, [location.pathname, pedidosUsuario]);

  // Al entrar en /aprobaciones se marcan solo los RESERVA — los que generan ese
  // aviso — para no interferir con las señales de /pedidos.
  useEffect(() => {
    if (location.pathname !== ROUTES.APROBACIONES) return;
    setSeenPedidos((prev) => markPedidosSeen(prev, pedidosUsuario, { onlyEstado: "RESERVA" }));
  }, [location.pathname, pedidosUsuario]);

  const navBadgeCounts = useMemo(
    () => computeBadgeCounts(userRole, pedidosUsuario, seenPedidos, me?.username),
    [userRole, pedidosUsuario, seenPedidos, me?.username]
  );

  const allNotifications = useMemo(
    () => buildAllNotifications({ productos, pedidos: pedidosUsuario, esEmpresaExterna: esEmpresaExternaRol }),
    [productos, pedidosUsuario, esEmpresaExternaRol]
  );

  const unreadNotifications = useMemo(() => {
    const readSet = new Set(readNotificationIds);
    return allNotifications.filter((n) => !readSet.has(n.id));
  }, [allNotifications, readNotificationIds]);

  const markNotificationAsRead = (id) =>
    setReadNotificationIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

  /*
   * GUARDA DE RUTA POR ROL.
   *
   * Misma condición que antes, ahora resuelta por `canAccessRoute`, que
   * encapsula el caso especial del super-admin global en /plataforma. Ese caso
   * es el que se pierde con facilidad al reescribir un shell: /plataforma no
   * está en la lista de ningún rol.
   */
  useEffect(() => {
    if (!userRole) return;
    if (canAccessRoute(location.pathname, me)) return;
    navigate(resolveLandingRoute(me), { replace: true });
  }, [location.pathname, userRole, me, navigate]);

  const navSections = useMemo(
    () =>
      buildNavSections(me, navBadgeCounts).map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.badgeCount > 0
            ? {
                ...item,
                /*
                 * El aviso lleva número Y texto: el color por sí solo no
                 * comunica nada a quien no lo distingue (SC 1.4.1).
                 *
                 * El texto va en un <span class="sr-only"> y NO en un
                 * aria-label sobre el <span> del Badge: ARIA no permite
                 * nombrar elementos genéricos (role=generic), así que ese
                 * aria-label lo ignoran bastantes lectores de pantalla y el
                 * usuario solo oiría "3" suelto, sin saber 3 de qué.
                 */
                badge: (
                  <Badge tone="danger">
                    <span aria-hidden="true">
                      {item.badgeCount > 99 ? "99+" : item.badgeCount}
                    </span>
                    <span className="sr-only">{pendingLabel(item.badgeCount)}</span>
                  </Badge>
                ),
              }
            : item
        ),
      })),
    [me, navBadgeCounts]
  );

  if (!me) return <SessionLoading />;

  const logout = () => {
    clearStoredToken();
    try {
      window.localStorage.removeItem("user");
    } catch {
      // noop
    }
    navigate("/login");
  };

  /*
   * MODO OSCURO — construido, no expuesto todavía.
   *
   * Los tokens traen la paleta oscura completa y este shell funciona en ambos
   * modos. Las pantallas que aún no se han migrado, no: llevan los colores en
   * crudo en el marcado, y el titular del Dashboard (#0f172a) sobre el fondo
   * oscuro (#020617) da 1,13:1 frente al 4,5:1 que exige la SC 1.4.3.
   *
   * Por eso no se monta aquí <ThemeProvider> ni <ThemeToggle>: entregar un
   * conmutador que vuelve ilegibles once pantallas sería una regresión de
   * accesibilidad, justo lo que esta fase existe para evitar. Se activan
   * cuando las pantallas migren — ver el comentario en index.html.
   */
  return (
    <ToastProvider>
      <AppShell
        sections={navSections}
        currentPath={location.pathname}
        labels={shellLabels}
        linkComponent={AppLink}
        brand={<Brand />}
        tenantSwitcher={canSelectCliente(me) ? <ClienteSelector visible /> : undefined}
        notifications={
          canSeeNotifications(me) ? (
            <NotificationsPanel
              notifications={unreadNotifications}
              onMarkAsRead={markNotificationAsRead}
            />
          ) : undefined
        }
        userMenu={
          <UserMenu
            username={me?.username}
            rol={rolMostrado}
            canManageUsuarios={canManageUsuarios(me)}
            canOpenMapa={canOpenMapaVivero(me)}
            onChangePassword={() => setPasswordModalOpen(true)}
            onOpenHelp={() => setWelcomeOpen(true)}
            onOpenUsuarios={() => navigate(ROUTES.ADMIN_USUARIOS)}
            onOpenMapa={() => setMapOpen(true)}
            onLogout={logout}
          />
        }
      >
        {/*
          CONTENCIÓN DEL DESBORDAMIENTO DE LAS PANTALLAS AÚN NO MIGRADAS.

          Las pantallas conservan por ahora sus rejillas de píxeles fijos
          (Dashboard: `repeat(4, 1fr)`; Pedidos: seis columnas fijas), así que
          por debajo de ~900px su contenido no cabe. Su migración es de una
          fase posterior.

          El shell antiguo tapaba esto con `overflowX: hidden`, que no lo
          arreglaba: recortaba el contenido y lo dejaba inalcanzable. Aquí el
          desbordamiento se confina a la región de contenido, de modo que
          desplaza ESA zona y no el documento entero. Es la regla del sistema
          de diseño para las tablas anchas — que desplace el contenedor, nunca
          la página — y evita que la cabecera y la navegación se salgan de la
          pantalla al desplazarse en horizontal.

          Cuando cada pantalla se migre en su fase, dejará de hacer falta.
        */}
        <div className="min-w-0 overflow-x-auto">
          {/*
            El límite de error envuelve SOLO el contenido de la página, nunca el
            shell. Un fallo de render en una pantalla dejaba antes la ventana en
            blanco con la navegación incluida; ahora la pantalla se sustituye por
            un estado de error y el usuario conserva el menú para irse a otra
            parte. `resetKey` lo limpia al cambiar de ruta.
          */}
          <ErrorBoundary resetKey={location.pathname}>
            {/* El contrato del contexto se conserva intacto: cuatro pantallas
                llaman a useOutletContext() y todas desestructuran `me`. */}
            <Outlet context={{ me, isAdmin: userRole === ROLES.ADMIN, collapsed: false }} />
          </ErrorBoundary>
        </div>
      </AppShell>

      <CambiarPasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
      <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
      {canOpenMapaVivero(me) && (
        <ZonaMapDialog
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          isAdmin={userRole === ROLES.ADMIN}
        />
      )}
    </ToastProvider>
  );
}

/** Marca del producto en la barra lateral. Un logotipo pequeño, no un héroe. */
function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Sprout aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-body-sm font-[var(--font-weight-semibold)]">ViverApp</span>
        <span className="truncate text-caption text-muted-foreground">Gestión del vivero</span>
      </span>
    </span>
  );
}

/**
 * Pantalla de carga de sesión.
 *
 * Sustituye a la anterior: una tarjeta de radio 34 al 82% de opacidad, con
 * `backdrop-filter: blur(18px)`, dos degradados radiales, una sombra de 110px,
 * el logotipo flotando en bucle infinito y el nombre a peso 950. Ahora es la
 * silueta de lo que va a aparecer, que es lo que una carga debe comunicar.
 */
function SessionLoading() {
  return (
    <div className="min-h-dvh bg-background p-6" aria-busy="true">
      <p className="sr-only" role="status">
        {loadingLabels.session}
      </p>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-[var(--radius-md)]" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}
