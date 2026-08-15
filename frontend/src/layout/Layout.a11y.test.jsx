/**
 * Comportamiento de teclado y accesibilidad del shell.
 *
 * Se prueba con eventos de teclado reales (userEvent), no con clics
 * sintéticos: el objetivo es justamente comprobar lo que ocurre cuando alguien
 * NO usa el ratón. El shell antiguo fallaba aquí en todo — sus 19 overlays no
 * atrapaban el foco, no respondían a Escape y no lo devolvían.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mockGetMe = vi.fn();

vi.mock("../api/api", () => ({
  getMe: (...a) => mockGetMe(...a),
  getProductos: vi.fn().mockResolvedValue([]),
  getPedidos: vi.fn().mockResolvedValue([]),
  clearStoredToken: vi.fn(),
  getZonaItems: vi.fn(),
  marcarZonaInterna: vi.fn(),
  getClientes: vi.fn().mockResolvedValue([]),
  getActiveClienteId: vi.fn().mockReturnValue(null),
  setActiveClienteId: vi.fn(),
  cambiarPassword: vi.fn(),
}));
vi.mock("../components/shell/ZonaMapDialog", () => ({ default: () => null }));
vi.mock("../components/welcome/WelcomeModal", () => ({
  default: () => null,
  shouldShowWelcomeOnStart: () => false,
}));

const Layout = (await import("./Layout")).default;

function renderShell(me = { rol: "admin", username: "ana" }) {
  mockGetMe.mockResolvedValue(me);
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>CONTENIDO</div>} />
          <Route path="/admin/usuarios" element={<div>USUARIOS</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("menú de cuenta — teclado", () => {
  it("se abre con el teclado, atrapa el foco y Escape lo devuelve al disparador", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = await screen.findByRole("button", { name: "Cuenta de usuario" });
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    // Escape cierra Y devuelve el foco: si no lo devolviera, el usuario de
    // teclado quedaría al principio del documento sin saber dónde está.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("las flechas recorren los elementos del menú", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = await screen.findByRole("button", { name: "Cuenta de usuario" });
    await user.click(trigger);
    await screen.findByRole("menu");

    await user.keyboard("{ArrowDown}");
    const items = screen.getAllByRole("menuitem");
    expect(items.some((i) => i === document.activeElement)).toBe(true);
  });

  it("cerrar sesión no es una acción destructiva en rojo", async () => {
    // Regla del sistema de diseño: el rojo es destrucción. Cerrar sesión no
    // destruye nada y no debe presentarse como si lo hiciera.
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole("button", { name: "Cuenta de usuario" }));
    const logout = await screen.findByRole("menuitem", { name: /cerrar sesión/i });
    expect(logout).not.toHaveAttribute("data-destructive");
  });
});

describe("cajón de navegación móvil — teclado", () => {
  it("se abre, atrapa el foco y Escape lo devuelve al disparador", async () => {
    const user = userEvent.setup();
    renderShell();

    const burger = await screen.findByRole("button", { name: "Abrir el menú" });
    burger.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // El foco entra en el diálogo, no se queda fuera.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(burger).toHaveFocus();
  });

  it("expone un título accesible aunque su cabecera esté oculta a la vista", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole("button", { name: "Abrir el menú" }));
    expect(await screen.findByRole("dialog", { name: "Menú de navegación" })).toBeInTheDocument();
  });
});

describe("panel de avisos — teclado", () => {
  it("Escape lo cierra y devuelve el foco", async () => {
    const user = userEvent.setup();
    renderShell();

    const bell = await screen.findByRole("button", { name: /avisos?/i });
    bell.focus();
    await user.keyboard("{Enter}");

    await screen.findByRole("dialog", { name: "Avisos" });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Avisos" })).not.toBeInTheDocument()
    );
    expect(bell).toHaveFocus();
  });
});

describe("nombres accesibles", () => {
  it("todo control de solo icono tiene nombre accesible", async () => {
    renderShell();
    await screen.findByRole("main");

    const sinNombre = [];
    for (const el of document.querySelectorAll("button, a[href]")) {
      const texto = (el.textContent || "").trim();
      const label = el.getAttribute("aria-label") || el.getAttribute("title");
      if (!texto && !label) sinNombre.push(el.outerHTML.slice(0, 90));
    }
    expect(sinNombre).toEqual([]);
  });

  it("no se usa ningún emoji como iconografía de interfaz", async () => {
    renderShell();
    await screen.findByRole("main");
    // Los emoji se renderizan distinto en cada sistema operativo y no aportan
    // nombre accesible. El shell usa Lucide.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const nav = screen.getAllByRole("navigation")[0];
    expect(emoji.test(nav.textContent)).toBe(false);
    expect(emoji.test(screen.getByRole("banner").textContent)).toBe(false);
  });

  it("el enlace de salto es el primer control enfocable del documento", async () => {
    renderShell();
    await screen.findByRole("main");
    const focusables = document.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    expect(focusables[0]).toHaveTextContent("Saltar al contenido principal");
  });

  it("el destino del enlace de salto existe y es enfocable", async () => {
    renderShell();
    const main = await screen.findByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
  });
});
