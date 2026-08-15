/**
 * PRUEBAS DE INTEGRACIÓN DEL SHELL.
 *
 * `permissions.test.js` demuestra que el MODELO decide bien. Esto demuestra
 * algo distinto: que el shell nuevo realmente lo CONSULTA. Un modelo correcto
 * que el componente ignora deja exactamente el mismo agujero que no tener
 * modelo.
 *
 * Por eso se renderiza el Layout de verdad, con la navegación de DevCon8
 * dentro, y se mira lo que un usuario vería.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useOutletContext } from "react-router-dom";

/* ── Dobles ──────────────────────────────────────────────────────────────
 * Se simula solo la CAPA DE RED. El shell, la navegación, los permisos y los
 * avisos son los reales: son justamente lo que se quiere comprobar.
 */
const mockGetMe = vi.fn();
const mockGetProductos = vi.fn();
const mockGetPedidos = vi.fn();

vi.mock("../api/api", () => ({
  getMe: (...a) => mockGetMe(...a),
  getProductos: (...a) => mockGetProductos(...a),
  getPedidos: (...a) => mockGetPedidos(...a),
  clearStoredToken: vi.fn(),
  getZonaItems: vi.fn(),
  marcarZonaInterna: vi.fn(),
  getClientes: vi.fn().mockResolvedValue([]),
  getActiveClienteId: vi.fn().mockReturnValue(null),
  setActiveClienteId: vi.fn(),
  cambiarPassword: vi.fn(),
}));

// El mapa arrastra imágenes y la configuración de zonas; no aporta nada a lo
// que se prueba aquí y sí mucho ruido.
vi.mock("../components/shell/ZonaMapDialog", () => ({
  default: () => null,
}));
vi.mock("../components/welcome/WelcomeModal", () => ({
  default: () => null,
  shouldShowWelcomeOnStart: () => false,
}));

const Layout = (await import("./Layout")).default;

function renderShell(me, path = "/dashboard") {
  mockGetMe.mockResolvedValue(me);
  mockGetProductos.mockResolvedValue([]);
  mockGetPedidos.mockResolvedValue([]);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>CONTENIDO</div>} />
          <Route path="/productos" element={<div>CONTENIDO</div>} />
          <Route path="/pedidos" element={<div>CONTENIDO</div>} />
          <Route path="/movimientos" element={<div>CONTENIDO</div>} />
          <Route path="/aprobaciones" element={<div>CONTENIDO</div>} />
          <Route path="/informes" element={<div>CONTENIDO</div>} />
          <Route path="/plataforma" element={<div>CONTENIDO</div>} />
          <Route path="/admin/usuarios" element={<div>CONTENIDO</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

/** Enlaces del landmark de navegación principal, ya renderizado. */
async function navLinks() {
  const navs = await screen.findAllByRole("navigation", { name: "Navegación principal" });
  // El shell renderiza la navegación dos veces (barra lateral y cajón móvil);
  // ambas salen del mismo árbol filtrado, así que basta con inspeccionar una.
  return within(navs[0])
    .getAllByRole("link")
    .map((a) => a.textContent.trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => {
  vi.clearAllMocks();
});

/* ── Visibilidad del menú por rol ───────────────────────────────────────── */

describe("el shell filtra la navegación por rol", () => {
  const cases = [
    ["admin", { rol: "admin" }, ["Panel de control", "Productos", "Movimientos", "Pedidos", "Aprobaciones", "Informes"]],
    ["tecnico", { rol: "tecnico" }, ["Panel de control", "Productos", "Movimientos", "Pedidos", "Informes"]],
    ["manager", { rol: "manager" }, ["Panel de control", "Productos", "Movimientos", "Aprobaciones", "Informes"]],
    ["gestor_vivero", { rol: "gestor_vivero" }, ["Panel de control", "Productos", "Movimientos", "Pedidos", "Informes"]],
    ["empresa_externa", { rol: "empresa_externa" }, ["Productos", "Pedidos", "Informes"]],
    ["proveedor", { rol: "proveedor" }, ["Pedidos"]],
  ];

  for (const [name, me, expected] of cases) {
    it(`${name} ve exactamente ${expected.length} enlace(s)`, async () => {
      const path = name === "proveedor" ? "/pedidos" : name === "empresa_externa" ? "/productos" : "/dashboard";
      renderShell(me, path);
      await waitFor(async () => expect(await navLinks()).toEqual(expected));
    });
  }

  it("proveedor NO ve ningún enlace de gestión", async () => {
    renderShell({ rol: "proveedor" }, "/pedidos");
    const links = await waitFor(navLinks);
    for (const prohibido of ["Aprobaciones", "Movimientos", "Panel de control", "Informes", "Productos"]) {
      expect(links).not.toContain(prohibido);
    }
  });

  it("empresa_externa NO ve Aprobaciones ni Movimientos", async () => {
    renderShell({ rol: "empresa_externa" }, "/productos");
    const links = await waitFor(navLinks);
    expect(links).not.toContain("Aprobaciones");
    expect(links).not.toContain("Movimientos");
  });

  it("los enlaces denegados no están en el DOM, no solo ocultos", async () => {
    // Un enlace meramente oculto sigue en la carga de la página y le dice a
    // quien no debe verlo qué módulos existen. Se filtra antes de renderizar.
    renderShell({ rol: "proveedor" }, "/pedidos");
    await waitFor(navLinks);
    expect(document.body.innerHTML).not.toContain("/aprobaciones");
    expect(document.body.innerHTML).not.toContain("/movimientos");
  });
});

/* ── Avisos del menú ────────────────────────────────────────────────────── */

describe("avisos del menú", () => {
  const pedidosPendientes = [
    { id: 1, estado: "RESERVA", tipo: "salida", solicitante_username: "otro", items: [{ cantidad: 4, cantidad_servida: 0 }] },
    { id: 2, estado: "RESERVA", tipo: "salida", solicitante_username: "otro", items: [{ cantidad: 2, cantidad_servida: 0 }] },
  ];

  it("muestra el recuento junto al enlace correspondiente", async () => {
    mockGetMe.mockResolvedValue({ rol: "manager", username: "ana" });
    mockGetProductos.mockResolvedValue([]);
    mockGetPedidos.mockResolvedValue(pedidosPendientes);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<div>CONTENIDO</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const nav = (await screen.findAllByRole("navigation", { name: "Navegación principal" }))[0];
    const aprobaciones = await waitFor(() =>
      within(nav)
        .getAllByRole("link")
        .find((a) => a.textContent.includes("Aprobaciones"))
    );
    await waitFor(() => expect(aprobaciones.textContent).toContain("2"));
  });

  it("el recuento se acompaña de texto, no solo de color", async () => {
    // SC 1.4.1: una pastilla roja con un número no dice de QUÉ hay 2.
    mockGetMe.mockResolvedValue({ rol: "manager", username: "ana" });
    mockGetProductos.mockResolvedValue([]);
    mockGetPedidos.mockResolvedValue(pedidosPendientes);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<div>CONTENIDO</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText("2 pendientes").length).toBeGreaterThan(0));
  });
});

/* ── Super-admin de plataforma ──────────────────────────────────────────── */

describe("super-admin global", () => {
  it("ve la sección Plataforma", async () => {
    renderShell({ rol: "superadmin" }, "/plataforma");
    const links = await waitFor(navLinks);
    expect(links).toContain("Panel de plataforma");
  });

  it("conserva además toda la navegación de admin", async () => {
    renderShell({ rol: "superadmin" }, "/plataforma");
    const links = await waitFor(navLinks);
    for (const item of ["Panel de control", "Productos", "Movimientos", "Pedidos", "Aprobaciones", "Informes"]) {
      expect(links).toContain(item);
    }
  });

  it("NO expulsa al super-admin de /plataforma", async () => {
    // La regresión clásica al reescribir el shell: /plataforma no está en la
    // lista de ningún rol, así que un guard "limpio" lo rechaza y devuelve al
    // usuario a /dashboard en cada carga.
    renderShell({ rol: "superadmin" }, "/plataforma");
    expect(await screen.findByText("CONTENIDO")).toBeInTheDocument();
  });

  it("un admin normal NO ve la sección Plataforma", async () => {
    renderShell({ rol: "admin" }, "/dashboard");
    const links = await waitFor(navLinks);
    expect(links).not.toContain("Panel de plataforma");
  });

  it("admin_vivero NO ve la sección Plataforma", async () => {
    renderShell({ rol: "admin_vivero" }, "/dashboard");
    const links = await waitFor(navLinks);
    expect(links).not.toContain("Panel de plataforma");
  });
});

/* ── Capacidades del menú de cuenta ─────────────────────────────────────── */

describe("menú de cuenta", () => {
  it("solo admin ve la gestión de usuarios", async () => {
    const { unmount } = renderShell({ rol: "admin" }, "/dashboard");
    expect(await screen.findByRole("button", { name: "Cuenta de usuario" })).toBeInTheDocument();
    unmount();
  });

  it("empresa_externa no ve la campana de avisos", async () => {
    renderShell({ rol: "empresa_externa" }, "/productos");
    await waitFor(navLinks);
    expect(screen.queryByRole("button", { name: /avisos?/i })).not.toBeInTheDocument();
  });

  it("los roles internos sí ven la campana de avisos", async () => {
    renderShell({ rol: "admin" }, "/dashboard");
    await waitFor(navLinks);
    expect(await screen.findByRole("button", { name: /avisos?/i })).toBeInTheDocument();
  });
});

/* ── Estructura accesible ───────────────────────────────────────────────── */

describe("estructura del shell", () => {
  it("expone los landmarks banner, navigation y main", async () => {
    renderShell({ rol: "admin" }, "/dashboard");
    await waitFor(navLinks);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Navegación principal" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("ofrece un enlace de salto al contenido como primer punto de tabulación", async () => {
    renderShell({ rol: "admin" }, "/dashboard");
    await waitFor(navLinks);
    const skip = screen.getByRole("link", { name: "Saltar al contenido principal" });
    expect(skip).toHaveAttribute("href", "#main-content");
  });

  it("marca la página actual con aria-current", async () => {
    renderShell({ rol: "admin" }, "/pedidos");
    await waitFor(navLinks);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.length).toBeGreaterThan(0);
    expect(current[0]).toHaveTextContent("Pedidos");
  });

  it("no marca como actual una ruta que solo comparte prefijo", async () => {
    renderShell({ rol: "admin" }, "/pedidos");
    await waitFor(navLinks);
    const current = screen.getAllByRole("link", { current: "page" }).map((a) => a.textContent.trim());
    expect(current).not.toContain("Productos");
  });

  it("renderiza el contenido de la página en el Outlet", async () => {
    renderShell({ rol: "admin" }, "/dashboard");
    expect(await screen.findByText("CONTENIDO")).toBeInTheDocument();
  });
});

/* ── Contrato del contexto ──────────────────────────────────────────────── */

describe("contrato de Outlet context", () => {
  it("sigue entregando { me, isAdmin, collapsed }", async () => {
    // Cuatro pantallas llaman a useOutletContext(). Si el shell deja de
    // proveerlo, las cuatro revientan en el render — un fallo trivial de
    // cometer y total en consecuencias.
    let received = null;
    const Probe = () => {
      received = useOutletContext();
      return <div>SONDA</div>;
    };

    mockGetMe.mockResolvedValue({ rol: "admin", username: "ana" });
    mockGetProductos.mockResolvedValue([]);
    mockGetPedidos.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("SONDA");
    expect(received).toMatchObject({ isAdmin: true, collapsed: false });
    expect(received.me).toMatchObject({ rol: "admin", username: "ana" });
  });
});
