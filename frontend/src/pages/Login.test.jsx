/**
 * ENTRADA — pruebas.
 *
 * Lo que se protege aquí es autenticación, así que el peso está en el
 * comportamiento, no en el aspecto: que se llame a `login()` con lo que el
 * usuario escribió, que un fallo no navegue, que el restablecimiento no revele
 * qué cuentas existen, y que el usuario de desarrollo que venía escrito en el
 * código no haya vuelto.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigate,
}));

vi.mock("../api/api", () => ({
  login: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

import { login, requestPasswordReset } from "../api/api";
import Login from "./Login";

const pintar = () => render(<Login />);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  navigate.mockClear();
  login.mockReset();
  requestPasswordReset.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Login · comportamiento de autenticación", () => {
  it("los campos empiezan VACÍOS", async () => {
    /*
     * DEFECTO PREVIO CORREGIDO. `Login.jsx@main` traía
     * `useState("ifebtru")`: el usuario de un desarrollador escrito en el
     * código y desplegado a producción. Cualquiera que abriera la pantalla
     * veía ese nombre de cuenta ya puesto.
     *
     * Esta prueba existe para que no vuelva.
     */
    pintar();
    expect(screen.getByLabelText(/usuario/i)).toHaveValue("");
    expect(screen.getByLabelText(/^contraseña/i)).toHaveValue("");
  });

  it("envía exactamente lo que se ha escrito", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    login.mockResolvedValue({ access_token: "t" });
    pintar();

    await user.type(screen.getByLabelText(/usuario/i), "maria.perez");
    await user.type(screen.getByLabelText(/^contraseña/i), "correcta-horse");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(login).toHaveBeenCalledWith("maria.perez", "correcta-horse");
  });

  it("navega a /dashboard tras 500 ms, igual que antes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    login.mockResolvedValue({ access_token: "t" });
    pintar();

    await user.type(screen.getByLabelText(/usuario/i), "a");
    await user.type(screen.getByLabelText(/^contraseña/i), "b");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    // La espera es deliberada: da tiempo a que el token quede escrito antes de
    // que el guard de ruta lo lea. Si alguien la quita, esto falla.
    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("un fallo de credenciales NO navega y explica el motivo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    login.mockRejectedValue({ response: { data: { detail: "Usuario o contraseña incorrectos" } } });
    pintar();

    await user.type(screen.getByLabelText(/usuario/i), "a");
    await user.type(screen.getByLabelText(/^contraseña/i), "mal");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos");
    await vi.advanceTimersByTimeAsync(2000);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("el error se ANUNCIA, no solo se pinta", async () => {
    // Sin role="alert", quien usa lector de pantalla se queda esperando sin
    // saber que la contraseña estaba mal.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    login.mockRejectedValue(new Error("Sin conexión"));
    pintar();

    await user.type(screen.getByLabelText(/usuario/i), "a");
    await user.type(screen.getByLabelText(/^contraseña/i), "b");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
  });

  it("aplana los errores de validación en lista, como hacía main", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    login.mockRejectedValue({
      response: { data: { detail: [{ msg: "campo requerido" }, "otro fallo"] } },
    });
    pintar();

    await user.type(screen.getByLabelText(/usuario/i), "a");
    await user.type(screen.getByLabelText(/^contraseña/i), "b");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("campo requerido | otro fallo");
  });

  it("no deja pulsar dos veces mientras comprueba", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    login.mockReturnValue(new Promise(() => {}));
    pintar();

    await user.type(screen.getByLabelText(/usuario/i), "a");
    await user.type(screen.getByLabelText(/^contraseña/i), "b");
    const boton = screen.getByRole("button", { name: /^entrar$/i });
    await user.click(boton);

    expect(await screen.findByRole("button", { name: /entrando/i })).toBeDisabled();
    expect(login).toHaveBeenCalledTimes(1);
  });
});

describe("Login · contraseña", () => {
  it("el conmutador de visibilidad dice su estado, no solo su icono", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    pintar();

    const campo = screen.getByLabelText(/^contraseña/i);
    expect(campo).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: /mostrar la contraseña/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /ocultar la contraseña/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("declara autocomplete para que el gestor de contraseñas funcione", () => {
    pintar();
    expect(screen.getByLabelText(/usuario/i)).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("Login · restablecer contraseña", () => {
  /* El formulario de entrada sigue montado detrás del diálogo, así que todas
     las consultas se acotan al diálogo o casarían dos veces. */
  const abrir = async (user) => {
    await user.click(screen.getByRole("button", { name: /olvidado tu contraseña/i }));
    return screen.findByRole("dialog");
  };

  it("responde LO MISMO exista o no la cuenta", async () => {
    /*
     * Comportamiento previo, deliberado y conservado: si el mensaje cambiara
     * según si la cuenta existe, se podría enumerar qué usuarios hay dados de
     * alta en el ayuntamiento.
     */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    pintar();

    // Caso 1: el backend responde bien.
    requestPasswordReset.mockResolvedValue({});
    let dlg = await abrir(user);
    await user.type(within(dlg).getByLabelText(/^usuario/i), "existe");
    await user.type(within(dlg).getByLabelText(/^email/i), "a@b.es");
    await user.click(within(dlg).getByRole("button", { name: /enviar enlace/i }));
    const conExito = (await screen.findByText(/si los datos coinciden/i)).textContent;

    await user.click(screen.getByRole("button", { name: /entendido/i }));

    // Caso 2: el backend falla porque la cuenta no existe.
    requestPasswordReset.mockRejectedValue({ response: { status: 404 } });
    dlg = await abrir(user);
    await user.type(within(dlg).getByLabelText(/^usuario/i), "no-existe");
    await user.type(within(dlg).getByLabelText(/^email/i), "a@b.es");
    await user.click(within(dlg).getByRole("button", { name: /enviar enlace/i }));
    const conFallo = (await screen.findByText(/si los datos coinciden/i)).textContent;

    expect(conFallo).toBe(conExito);
  });

  it("valida antes de llamar al backend", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    pintar();
    const dlg = await abrir(user);

    await user.click(within(dlg).getByRole("button", { name: /enviar enlace/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/rellena ambos campos/i);
    expect(requestPasswordReset).not.toHaveBeenCalled();

    await user.type(within(dlg).getByLabelText(/^usuario/i), "u");
    await user.type(within(dlg).getByLabelText(/^email/i), "sin-arroba");
    await user.click(within(dlg).getByRole("button", { name: /enviar enlace/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/arroba/i);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("recorta los espacios antes de enviar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    requestPasswordReset.mockResolvedValue({});
    pintar();
    const dlg = await abrir(user);

    await user.type(within(dlg).getByLabelText(/^usuario/i), "  maria  ");
    await user.type(within(dlg).getByLabelText(/^email/i), "  m@a.es  ");
    await user.click(within(dlg).getByRole("button", { name: /enviar enlace/i }));

    expect(requestPasswordReset).toHaveBeenCalledWith("maria", "m@a.es");
  });
});

describe("Login · presentación", () => {
  it("la imagen decorativa no ensucia el árbol de accesibilidad", () => {
    // No aporta nada que no esté en el texto: alt vacío y contenedor oculto.
    const { container } = pintar();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("no afirma certificaciones ni conformidades que no tiene", () => {
    // Es una aplicación municipal: insinuar ENS o una certificación sería
    // una afirmación falsa con consecuencias reales.
    const { container } = pintar();
    const texto = container.textContent;
    expect(texto).not.toMatch(/ENS|certificad|conforme al Esquema|ISO \d/i);
  });

  it("un solo h1", () => {
    pintar();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
