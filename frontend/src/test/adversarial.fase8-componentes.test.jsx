/**
 * REVISIÓN ADVERSARIAL — Fase 8.
 *
 * Se ataca lo que estos componentes tocan de verdad: la contraseña del
 * usuario, el ámbito de ayuntamiento del super-admin y la visibilidad de un
 * inventario entero para la empresa externa.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (rel) =>
  readFileSync(resolve(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

const FUENTES = {
  password: leer("src/components/common/CambiarPasswordModal.jsx"),
  cliente: leer("src/components/common/ClienteSelector.jsx"),
  welcome: leer("src/components/welcome/WelcomeModal.jsx"),
  verPlanta: leer("src/components/VerPlanta.jsx"),
  zonaDialog: leer("src/components/shell/ZonaMapDialog.jsx"),
};

vi.mock("../api/api", () => ({
  changePassword: vi.fn(),
  getClientes: vi.fn(),
  getActiveClienteId: vi.fn(() => null),
  setActiveClienteId: vi.fn(),
  getZonaItems: vi.fn(),
  marcarZonaInterna: vi.fn(),
  getZonasConfig: vi.fn(),
  updateZonasConfig: vi.fn(),
}));

vi.mock("../utils/plantImages", () => ({
  usePlantImage: (n) => (n === "Sin imagen" ? null : "data:image/gif;base64,R0lGODlhAQABAAAAACw="),
  usePlantsWithImage: () => new Set(),
}));

import * as api from "../api/api";
import CambiarPasswordModal from "../components/common/CambiarPasswordModal";
import ClienteSelector from "../components/common/ClienteSelector";
import VerPlanta from "../components/VerPlanta";
import WelcomeModal from "../components/welcome/WelcomeModal";
import ZonaMapDialog from "../components/shell/ZonaMapDialog";

beforeEach(() => {
  api.changePassword.mockResolvedValue({});
  api.getClientes.mockResolvedValue([{ id: 1, nombre: "Ayuntamiento de Santa Cruz de Tenerife" }]);
  api.getZonasConfig.mockResolvedValue([]);
  api.getZonaItems.mockResolvedValue({
    items: [{ producto_id: 1, nombre_cientifico: "Dracaena draco", cantidad: 5, tamanos: [] }],
    todos_internos: false,
  });
  api.marcarZonaInterna.mockResolvedValue({});
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ══ 1. Contraseña ══════════════════════════════════════════════════════ */

describe("adversarial · la contraseña", () => {
  const campos = () => ({
    actual: screen.getByLabelText(/contraseña actual/i),
    nueva: screen.getByLabelText(/^nueva contraseña$/i),
    repetir: screen.getByLabelText(/repetir/i),
  });

  it("no se puede enviar con la validación saltada por Enter", async () => {
    // Enter envía el formulario: la validación tiene que correr igual.
    const user = userEvent.setup();
    render(<CambiarPasswordModal open onClose={vi.fn()} />);
    const c = campos();
    await user.type(c.actual, "actual-1234");
    await user.type(c.nueva, "corta");
    await user.type(c.repetir, "corta{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/8 caracteres/i);
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("una contraseña con espacios al principio y al final se envía TAL CUAL", async () => {
    /*
     * No se recorta a propósito: un espacio puede ser parte de la contraseña, y
     * recortarla en el cliente haría que el usuario no pudiera entrar con la
     * que cree que ha puesto.
     */
    const user = userEvent.setup();
    render(<CambiarPasswordModal open onClose={vi.fn()} />);
    const c = campos();
    await user.type(c.actual, "  actual  ");
    await user.type(c.nueva, "  nueva-clave  ");
    await user.type(c.repetir, "  nueva-clave  ");
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
    expect(api.changePassword).toHaveBeenCalledWith("  actual  ", "  nueva-clave  ");
  });

  it("caracteres especiales no se escapan ni se pierden", async () => {
    const rara = "a<>&\"'ñ€%25#?/\\|`~";
    const user = userEvent.setup();
    render(<CambiarPasswordModal open onClose={vi.fn()} />);
    const c = campos();
    await user.type(c.actual, "actual-1234");
    await user.type(c.nueva, rara);
    await user.type(c.repetir, rara);
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
    expect(api.changePassword.mock.calls[0][1]).toBe(rara);
  });

  it("el mensaje de error del servidor no se interpreta como HTML", async () => {
    api.changePassword.mockRejectedValue({
      response: { data: { detail: "<img src=x onerror=alert(1)>Fallo" } },
    });
    const user = userEvent.setup();
    render(<CambiarPasswordModal open onClose={vi.fn()} />);
    const c = campos();
    await user.type(c.actual, "actual-1234");
    await user.type(c.nueva, "nueva-12345");
    await user.type(c.repetir, "nueva-12345");
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));
    const aviso = await screen.findByRole("alert");
    // React escapa el texto: no hay `img` inyectada.
    expect(aviso.querySelector("img")).toBeNull();
    expect(aviso.textContent).toContain("Fallo");
  });

  it("no hay ningún `dangerouslySetInnerHTML` en el componente", () => {
    expect(FUENTES.password).not.toContain("dangerouslySetInnerHTML");
  });

  it("no se guarda nada en localStorage ni sessionStorage", () => {
    // Una contraseña persistida sobreviviría al cierre del navegador.
    expect(FUENTES.password).not.toMatch(/localStorage|sessionStorage/);
  });

  it("no se construye ninguna URL con las contraseñas", () => {
    expect(FUENTES.password).not.toMatch(/\?.*(actual|nueva)/);
    expect(FUENTES.password).not.toMatch(/URLSearchParams/);
  });
});

/* ══ 2. Ámbito de ayuntamiento ══════════════════════════════════════════ */

describe("adversarial · el selector de ayuntamiento", () => {
  it("no se renderiza si no es visible: no hay control oculto que forzar", () => {
    const { container } = render(<ClienteSelector visible={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(api.getClientes).not.toHaveBeenCalled();
  });

  it("«Todos» limpia el ámbito en vez de mandar cadena vacía", async () => {
    /*
     * `null` significa «sin ayuntamiento activo»; una cadena vacía viajaría
     * como cabecera `X-Cliente-Id: ` y el backend podría interpretarla.
     */
    const user = userEvent.setup();
    render(<ClienteSelector visible />);
    await screen.findByRole("option", { name: /Santa Cruz/i });
    const sel = screen.getByLabelText(/ayuntamiento/i);
    await user.selectOptions(sel, "1");
    expect(api.setActiveClienteId).toHaveBeenLastCalledWith("1");
    await user.selectOptions(sel, "");
    expect(api.setActiveClienteId).toHaveBeenLastCalledWith(null);
  });

  it("un fallo al cargar no deja el desplegable mudo", async () => {
    api.getClientes.mockRejectedValue(new Error("boom"));
    render(<ClienteSelector visible />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
  });

  it("una respuesta que no es lista no rompe el selector", async () => {
    api.getClientes.mockResolvedValue({ no: "soy una lista" });
    render(<ClienteSelector visible />);
    // Sólo queda la opción «Todos».
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  });
});

/* ══ 3. VerPlanta ═══════════════════════════════════════════════════════ */

describe("adversarial · VerPlanta", () => {
  it("sin imagen no ofrece nada que pulsar", () => {
    const { container } = render(<VerPlanta nombreCientifico="Sin imagen" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sin imagen, el modo enlace devuelve el texto sin adornos", () => {
    render(
      <VerPlanta nombreCientifico="Sin imagen" variant="link">
        Texto llano
      </VerPlanta>
    );
    expect(screen.getByText("Texto llano")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("el modo enlace es un botón real, alcanzable con teclado", async () => {
    const user = userEvent.setup();
    render(
      <VerPlanta nombreCientifico="Dracaena draco" variant="link">
        Dracaena draco
      </VerPlanta>
    );
    const b = screen.getByRole("button", { name: /Dracaena draco/ });
    b.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("la imagen tiene texto alternativo que nombra la planta", async () => {
    const user = userEvent.setup();
    render(<VerPlanta nombreCientifico="Dracaena draco" variant="button" />);
    await user.click(screen.getByRole("button", { name: /ver imagen/i }));
    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("alt", expect.stringContaining("Dracaena draco"));
  });

  it("Escape cierra la imagen", async () => {
    const user = userEvent.setup();
    render(<VerPlanta nombreCientifico="Dracaena draco" variant="button" />);
    await user.click(screen.getByRole("button", { name: /ver imagen/i }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

/* ══ 4. WelcomeModal ════════════════════════════════════════════════════ */

describe("adversarial · WelcomeModal", () => {
  it("los enlaces externos no exponen la ventana de origen", () => {
    // Sin `rel="noopener"`, la página destino puede manipular `window.opener`.
    render(<WelcomeModal open onClose={vi.fn()} />);
    for (const a of screen.getAllByRole("link")) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel") || "").toMatch(/noopener/);
      expect(a.getAttribute("rel") || "").toMatch(/noreferrer/);
    }
  });

  it("al cerrar, recuerda la preferencia y marca como visto", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal open onClose={vi.fn()} />);
    await user.click(screen.getByLabelText(/mostrar al iniciar/i));
    await user.click(screen.getByRole("button", { name: /empezar a usar/i }));
    expect(window.localStorage.getItem("viverapp_welcome_seen")).toBe("true");
    expect(window.localStorage.getItem("viverapp_welcome_show_on_start")).toBe("true");
  });

  it("un localStorage que lanza no impide cerrar el modal", async () => {
    const onClose = vi.fn();
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const user = userEvent.setup();
    render(<WelcomeModal open onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /empezar a usar/i }));
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/* ══ 5. Zona interna ════════════════════════════════════════════════════ */

describe("adversarial · marcar zona como interna", () => {
  const elegirZona = async (user) => {
    const zonas = await screen.findAllByRole("button", { name: /consultar inventario/i });
    await user.click(zonas[0]);
    await screen.findByText("Dracaena draco");
  };

  it("un usuario que no es admin no tiene el control ni oculto", async () => {
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin={false} />);
    await elegirZona(user);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("Escape en la confirmación NO cambia la visibilidad", async () => {
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);
    await elegirZona(user);
    await user.click(screen.getByRole("checkbox", { name: /interna/i }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.marcarZonaInterna).not.toHaveBeenCalled();
  });

  it("dos clics seguidos no abren dos confirmaciones", async () => {
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);
    await elegirZona(user);
    const c = screen.getByRole("checkbox", { name: /interna/i });
    await user.click(c);
    await screen.findByRole("alertdialog");
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  it("sin zona resuelta no se llama al backend", async () => {
    // `_resolvedZone` ausente: el guardarraíl corta antes de pedir confirmación.
    api.getZonaItems.mockResolvedValue({ items: [{ nombre_cientifico: "X", cantidad: 1 }] });
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);
    const zonas = await screen.findAllByRole("button", { name: /consultar inventario/i });
    await user.click(zonas[0]);
    await screen.findByText("X");
    expect(api.marcarZonaInterna).not.toHaveBeenCalled();
  });
});

/* ══ 6. Regresión del sistema de diseño ════════════════════════════════ */

describe("adversarial · ningún componente bifurca el sistema", () => {
  it("no queda ningún diálogo nativo en los cinco componentes", () => {
    for (const [nombre, fuente] of Object.entries(FUENTES)) {
      for (const nativo of ["window.confirm", "window.alert", "window.prompt"]) {
        expect(fuente, `${nombre}/${nativo}`).not.toContain(nativo);
      }
      expect(fuente, nombre).not.toMatch(/(^|[^.\w])(alert|confirm|prompt)\s*\(/m);
    }
  });

  it("no quedan colores en crudo ni degradados", () => {
    for (const [nombre, fuente] of Object.entries(FUENTES)) {
      expect(fuente, `${nombre}/hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(fuente, `${nombre}/rgb`).not.toMatch(/rgba?\(/);
      expect(fuente, `${nombre}/gradiente`).not.toMatch(/linear-gradient/);
    }
  });

  it("los cuatro modales usan el Dialog del sistema", () => {
    for (const nombre of ["password", "welcome", "verPlanta", "zonaDialog"]) {
      expect(FUENTES[nombre], nombre).toMatch(/<DialogContent/);
    }
  });

  it("la acción de zona interna espera la confirmación", () => {
    expect(FUENTES.zonaDialog).toMatch(/const ok = await confirmar\(/);
    expect(FUENTES.zonaDialog).toMatch(/if \(!ok\) return;/);
  });
});
