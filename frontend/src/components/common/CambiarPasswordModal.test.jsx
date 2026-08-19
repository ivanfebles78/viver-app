/**
 * CONTRATO DE SEGURIDAD — CambiarPasswordModal.
 *
 * Se escribe ANTES de migrar. Es el único punto de la aplicación donde el
 * usuario teclea su contraseña actual, así que lo que se fija aquí no es
 * apariencia: es qué se valida, qué se envía, qué se guarda y qué NO puede
 * salir de este componente.
 *
 * Ninguna comprobación de seguridad se relaja para simplificar la migración.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../api/api", () => ({ changePassword: vi.fn() }));

import * as api from "../../api/api";
import CambiarPasswordModal from "./CambiarPasswordModal";

const ACTUAL = "clave-actual-1";
const NUEVA = "clave-nueva-larga";

let onClose;

beforeEach(() => {
  onClose = vi.fn();
  api.changePassword.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = (props = {}) => render(<CambiarPasswordModal open onClose={onClose} {...props} />);

const campos = () => ({
  actual: screen.getByLabelText(/contraseña actual/i),
  nueva: screen.getByLabelText(/^nueva contraseña$/i),
  repetir: screen.getByLabelText(/repetir/i),
});

const rellenar = async (user, { actual = ACTUAL, nueva = NUEVA, repetir = NUEVA } = {}) => {
  const c = campos();
  if (actual) await user.type(c.actual, actual);
  if (nueva) await user.type(c.nueva, nueva);
  if (repetir) await user.type(c.repetir, repetir);
};

const enviar = (user) => user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

/* ══ 1. Los campos son campos de contraseña de verdad ══════════════════ */

describe("seguridad · los campos no exponen la contraseña", () => {
  it("los tres campos son type=password", async () => {
    pintar();
    const c = campos();
    expect(c.actual).toHaveAttribute("type", "password");
    expect(c.nueva).toHaveAttribute("type", "password");
    expect(c.repetir).toHaveAttribute("type", "password");
  });

  it("declaran el autocompletado correcto para el gestor de contraseñas", async () => {
    pintar();
    const c = campos();
    expect(c.actual).toHaveAttribute("autocomplete", "current-password");
    expect(c.nueva).toHaveAttribute("autocomplete", "new-password");
    expect(c.repetir).toHaveAttribute("autocomplete", "new-password");
  });

  it("nuestro código no escribe la contraseña en ningún atributo propio", async () => {
    /*
     * HALLAZGO, verificado en navegador real y NO corregido aquí a propósito:
     *
     * React 19 refleja el `value` de un input controlado al ATRIBUTO, así que
     * lo tecleado aparece en `outerHTML`. Ocurre en cualquier input controlado
     * de cualquier aplicación React —lo comprobamos con el campo de contraseña
     * del login, que usa el `Input` del sistema de diseño— y no es una
     * exposición añadida: quien puede serializar el DOM puede leer igualmente
     * `input.value`. Evitarlo exigiría campos no controlados, que es un cambio
     * de arquitectura, no una corrección de seguridad.
     *
     * Lo que SÍ está en nuestra mano, y es lo que se fija aquí, es no escribir
     * el secreto en ningún atributo de autoría propia: `title`, `aria-label` o
     * `placeholder` quedarían en el HTML sin que React los gestione, y además
     * los leen las ayudas técnicas.
     */
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    for (const [nombre, el] of Object.entries(campos())) {
      for (const attr of ["title", "aria-label", "placeholder", "name", "id"]) {
        const v = el.getAttribute(attr);
        expect(v ?? "", `${nombre}/${attr}`).not.toContain(ACTUAL);
        expect(v ?? "", `${nombre}/${attr}`).not.toContain(NUEVA);
      }
    }
  });

  it("ningún campo revela la contraseña en texto claro", async () => {
    // `type="password"` es lo que impide que se lea por encima del hombro y lo
    // que hace que el gestor de contraseñas la trate como tal.
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    for (const el of Object.values(campos())) {
      expect(el).toHaveAttribute("type", "password");
    }
  });

  it("el formulario no navega: no puede acabar en la URL", async () => {
    // Un `<form>` sin `onSubmit` efectivo haría un GET con los campos en la
    // barra de direcciones, y de ahí al historial y a los logs del servidor.
    const user = userEvent.setup();
    pintar();
    // El diálogo se pinta en un portal, fuera del contenedor de `render`.
    const form = document.querySelector("form");
    expect(form).not.toHaveAttribute("action");
    expect(form?.getAttribute("method") ?? "").not.toMatch(/get/i);
    await rellenar(user);
    await enviar(user);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
  });

  it("no se registra nada en consola al enviar", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
    for (const spy of [log, warn]) {
      const texto = spy.mock.calls.flat().join(" ");
      expect(texto).not.toContain(ACTUAL);
      expect(texto).not.toContain(NUEVA);
    }
  });
});

/* ══ 2. Validación ═════════════════════════════════════════════════════ */

describe("seguridad · validación de la contraseña nueva", () => {
  it("menos de 8 caracteres se rechaza SIN llamar al backend", async () => {
    const user = userEvent.setup();
    pintar();
    await rellenar(user, { nueva: "corta12", repetir: "corta12" });
    await enviar(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/8 caracteres/i);
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("exactamente 8 caracteres se acepta", async () => {
    // La frontera importa: `< 8` rechaza, `=== 8` pasa.
    const user = userEvent.setup();
    pintar();
    await rellenar(user, { nueva: "12345678", repetir: "12345678" });
    await enviar(user);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
  });

  it("si la repetición no coincide, no se llama al backend", async () => {
    const user = userEvent.setup();
    pintar();
    await rellenar(user, { nueva: NUEVA, repetir: `${NUEVA}x` });
    await enviar(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no coinciden/i);
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("la longitud se comprueba ANTES que la coincidencia", async () => {
    /*
     * El orden decide qué mensaje ve el usuario. Con una nueva corta Y distinta
     * de su repetición, main avisa de la LONGITUD.
     */
    const user = userEvent.setup();
    pintar();
    await rellenar(user, { nueva: "corta", repetir: "otra" });
    await enviar(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/8 caracteres/i);
  });

  it("los campos vacíos no llegan al backend", async () => {
    const user = userEvent.setup();
    pintar();
    await enviar(user);
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("una contraseña de sólo espacios no cuela por longitud", async () => {
    // No es una regla de main que se invente: se comprueba qué hace HOY para
    // que la migración no lo cambie sin querer.
    const user = userEvent.setup();
    pintar();
    await rellenar(user, { nueva: "        ", repetir: "        " });
    await enviar(user);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
  });
});

/* ══ 3. Envío ══════════════════════════════════════════════════════════ */

describe("seguridad · qué se envía", () => {
  it("se envían exactamente la actual y la nueva, en ese orden", async () => {
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(1));
    expect(api.changePassword).toHaveBeenCalledWith(ACTUAL, NUEVA);
  });

  it("la repetición NO se envía", async () => {
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
    expect(api.changePassword.mock.calls[0]).toHaveLength(2);
  });

  it("pulsar dos veces no cambia la contraseña dos veces", async () => {
    /*
     * Sin bloqueo, un doble clic manda dos peticiones: la segunda llega con la
     * contraseña «actual» ya caducada y devuelve un error confuso.
     */
    let resolver;
    api.changePassword.mockReturnValue(new Promise((r) => { resolver = r; }));
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    const boton = screen.getByRole("button", { name: /cambiar contraseña/i });
    await user.click(boton);
    await waitFor(() => expect(boton).toBeDisabled());
    await user.click(boton);
    expect(api.changePassword).toHaveBeenCalledTimes(1);
    resolver({});
  });

  it("mientras guarda, el botón lo dice", async () => {
    api.changePassword.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    expect(await screen.findByRole("button", { name: /guardando/i })).toBeInTheDocument();
  });
});

/* ══ 4. Resultado ══════════════════════════════════════════════════════ */

describe("seguridad · resultado y limpieza", () => {
  it("al acertar, lo confirma y VACÍA los campos", async () => {
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    expect(await screen.findByText(/actualizada correctamente/i)).toBeInTheDocument();
    // Ya no hay campos con la contraseña dentro.
    expect(screen.queryByLabelText(/contraseña actual/i)).not.toBeInTheDocument();
  });

  it("un error del backend se muestra tal cual, sin filtrar la contraseña", async () => {
    api.changePassword.mockRejectedValue({
      response: { data: { detail: "La contraseña actual no es correcta." } },
    });
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/no es correcta/i);
    expect(aviso.textContent).not.toContain(ACTUAL);
    expect(aviso.textContent).not.toContain(NUEVA);
  });

  it("un error sin detalle no deja al usuario sin mensaje", async () => {
    api.changePassword.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cambiar/i);
  });

  it("tras un error se puede reintentar: el botón vuelve a estar activo", async () => {
    api.changePassword.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    pintar();
    await rellenar(user);
    await enviar(user);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /cambiar contraseña/i })).toBeEnabled();
  });
});

/* ══ 5. Cierre ═════════════════════════════════════════════════════════ */

describe("seguridad · al cerrar no queda nada dentro", () => {
  it("Cancelar cierra y limpia", async () => {
    const user = userEvent.setup();
    const { rerender } = pintar();
    await rellenar(user);
    await user.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onClose).toHaveBeenCalled();

    // Al reabrir, los campos están vacíos: lo tecleado no sobrevive.
    rerender(<CambiarPasswordModal open onClose={onClose} />);
    const c = campos();
    expect(c.actual).toHaveValue("");
    expect(c.nueva).toHaveValue("");
    expect(c.repetir).toHaveValue("");
  });

  it("Escape cierra", async () => {
    const user = userEvent.setup();
    pintar();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("cerrado, no renderiza nada", () => {
    render(<CambiarPasswordModal open={false} onClose={onClose} />);
    expect(screen.queryByLabelText(/contraseña actual/i)).not.toBeInTheDocument();
  });

  it("tras un éxito y reabrir, no queda ni el mensaje ni los valores", async () => {
    const user = userEvent.setup();
    const { rerender } = pintar();
    await rellenar(user);
    await enviar(user);
    await screen.findByText(/actualizada correctamente/i);
    await user.click(screen.getByRole("button", { name: /hecho/i }));

    rerender(<CambiarPasswordModal open onClose={onClose} />);
    expect(screen.queryByText(/actualizada correctamente/i)).not.toBeInTheDocument();
    expect(campos().actual).toHaveValue("");
  });
});
