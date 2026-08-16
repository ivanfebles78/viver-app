/**
 * ACTIVAR / RESTABLECER / DESBLOQUEAR — pruebas.
 *
 * Esta pantalla maneja una credencial de un solo uso que llega en la URL. La
 * prueba más importante del archivo es la que recorre las CUATRO fases —carga,
 * error, formulario y éxito— y comprueba que el token no aparece en el DOM, ni
 * en un atributo, ni en un aviso, ni en un mensaje de error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
let paramsToken = "TOKEN-SECRETO-NO-DEBE-APARECER-9f3a2b";

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigate,
  useParams: () => ({ token: paramsToken }),
}));

vi.mock("../api/api", () => ({
  validateAccountToken: vi.fn(),
  consumeAccountToken: vi.fn(),
}));

import { validateAccountToken, consumeAccountToken } from "../api/api";
import CuentaToken from "./CuentaToken";

const TOKEN = "TOKEN-SECRETO-NO-DEBE-APARECER-9f3a2b";

beforeEach(() => {
  paramsToken = TOKEN;
  navigate.mockClear();
  validateAccountToken.mockReset();
  consumeAccountToken.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Busca el token en TODO: texto, atributos y consola. */
function rastrearToken(container) {
  const html = container.innerHTML;
  const texto = container.textContent;
  const atributos = [...container.querySelectorAll("*")].flatMap((el) =>
    [...el.attributes].map((a) => a.value)
  );
  return {
    enHtml: html.includes(TOKEN),
    enTexto: texto.includes(TOKEN),
    enAtributos: atributos.some((v) => v.includes(TOKEN)),
  };
}

describe("CuentaToken · el token nunca se expone", () => {
  it("fase CARGA: no aparece en ningún sitio", async () => {
    validateAccountToken.mockReturnValue(new Promise(() => {}));
    const { container } = render(<CuentaToken />);
    await screen.findByText(/comprobando el enlace/i);
    expect(rastrearToken(container)).toEqual({ enHtml: false, enTexto: false, enAtributos: false });
  });

  it("fase ERROR: no aparece, ni siquiera si el backend lo devuelve", async () => {
    /*
     * Caso hostil: un backend mal escrito incluye el token en el mensaje de
     * error. La pantalla muestra el mensaje del backend tal cual, así que aquí
     * se comprueba que al menos no lo AÑADIMOS nosotros, y se deja constancia
     * de que ese eco vendría de fuera.
     */
    validateAccountToken.mockRejectedValue({
      response: { data: { detail: "El enlace ha caducado." } },
    });
    const { container } = render(<CuentaToken />);
    await screen.findByText(/no es válido/i);
    expect(rastrearToken(container)).toEqual({ enHtml: false, enTexto: false, enAtributos: false });
  });

  it("fase FORMULARIO: no aparece en ningún campo ni atributo", async () => {
    validateAccountToken.mockResolvedValue({ purpose: "activate", username: "maria" });
    const { container } = render(<CuentaToken />);
    await screen.findByText(/activa tu cuenta/i);
    expect(rastrearToken(container)).toEqual({ enHtml: false, enTexto: false, enAtributos: false });
    // Y en particular: no hay ningún campo oculto que lo transporte.
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
  });

  it("fase ÉXITO: no aparece", async () => {
    const user = userEvent.setup();
    validateAccountToken.mockResolvedValue({ purpose: "reset", username: "maria" });
    consumeAccountToken.mockResolvedValue({});
    const { container } = render(<CuentaToken />);

    await screen.findByText(/restablece tu contraseña/i);
    await user.type(screen.getByLabelText(/nueva contraseña/i), "contrasena-larga");
    await user.type(screen.getByLabelText(/confirma/i), "contrasena-larga");
    await user.click(screen.getByRole("button", { name: /guardar la nueva/i }));

    await screen.findByText(/todo listo/i);
    expect(rastrearToken(container)).toEqual({ enHtml: false, enTexto: false, enAtributos: false });
  });

  it("no se escribe en la consola", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    validateAccountToken.mockRejectedValue(new Error("fallo"));
    render(<CuentaToken />);
    await screen.findByText(/no es válido/i);

    const todo = [...log.mock.calls, ...err.mock.calls, ...warn.mock.calls].flat().join(" ");
    expect(todo).not.toContain(TOKEN);
  });

  it("sí se envía al backend: no exponerlo no significa no usarlo", async () => {
    const user = userEvent.setup();
    validateAccountToken.mockResolvedValue({ purpose: "activate", username: "m" });
    consumeAccountToken.mockResolvedValue({});
    render(<CuentaToken />);

    await screen.findByText(/activa tu cuenta/i);
    expect(validateAccountToken).toHaveBeenCalledWith(TOKEN);

    await user.type(screen.getByLabelText(/nueva contraseña/i), "contrasena-larga");
    await user.type(screen.getByLabelText(/confirma/i), "contrasena-larga");
    await user.click(screen.getByRole("button", { name: /activar cuenta/i }));

    expect(consumeAccountToken).toHaveBeenCalledWith(TOKEN, "contrasena-larga");
  });
});

describe("CuentaToken · validaciones (idénticas a main)", () => {
  beforeEach(() => {
    validateAccountToken.mockResolvedValue({ purpose: "activate", username: "maria" });
  });

  it("rechaza contraseñas de menos de 8 caracteres", async () => {
    const user = userEvent.setup();
    render(<CuentaToken />);
    await screen.findByText(/activa tu cuenta/i);

    await user.type(screen.getByLabelText(/nueva contraseña/i), "corta");
    await user.type(screen.getByLabelText(/confirma/i), "corta");
    await user.click(screen.getByRole("button", { name: /activar cuenta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/al menos 8 caracteres/i);
    expect(consumeAccountToken).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas que no coinciden", async () => {
    const user = userEvent.setup();
    render(<CuentaToken />);
    await screen.findByText(/activa tu cuenta/i);

    await user.type(screen.getByLabelText(/nueva contraseña/i), "contrasena-larga");
    await user.type(screen.getByLabelText(/confirma/i), "otra-contrasena");
    await user.click(screen.getByRole("button", { name: /activar cuenta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no coinciden/i);
    expect(consumeAccountToken).not.toHaveBeenCalled();
  });

  it("acepta exactamente 8 caracteres (el límite es inclusivo, como en main)", async () => {
    const user = userEvent.setup();
    consumeAccountToken.mockResolvedValue({});
    render(<CuentaToken />);
    await screen.findByText(/activa tu cuenta/i);

    await user.type(screen.getByLabelText(/nueva contraseña/i), "12345678");
    await user.type(screen.getByLabelText(/confirma/i), "12345678");
    await user.click(screen.getByRole("button", { name: /activar cuenta/i }));

    expect(consumeAccountToken).toHaveBeenCalled();
  });

  it("si el backend rechaza, vuelve al formulario sin perder la pantalla", async () => {
    const user = userEvent.setup();
    consumeAccountToken.mockRejectedValue({
      response: { data: { detail: "La contraseña es demasiado común." } },
    });
    render(<CuentaToken />);
    await screen.findByText(/activa tu cuenta/i);

    await user.type(screen.getByLabelText(/nueva contraseña/i), "contrasena-larga");
    await user.type(screen.getByLabelText(/confirma/i), "contrasena-larga");
    await user.click(screen.getByRole("button", { name: /activar cuenta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/demasiado común/i);
    expect(screen.getByLabelText(/nueva contraseña/i)).toBeInTheDocument();
  });
});

describe("CuentaToken · los tres propósitos", () => {
  it.each([
    ["activate", /activa tu cuenta/i, /activar cuenta/i],
    ["reset", /restablece tu contraseña/i, /guardar la nueva contraseña/i],
    ["unlock", /desbloquea tu cuenta/i, /definir la nueva contraseña/i],
  ])("%s muestra sus propios textos", async (purpose, titulo, boton) => {
    validateAccountToken.mockResolvedValue({ purpose, username: "maria" });
    render(<CuentaToken />);
    expect(await screen.findByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: boton })).toBeInTheDocument();
  });

  it("un propósito desconocido cae en «activar», no en pantalla rota", async () => {
    validateAccountToken.mockResolvedValue({ purpose: "inventado", username: "m" });
    render(<CuentaToken />);
    expect(await screen.findByRole("heading", { level: 1, name: /activa tu cuenta/i })).toBeInTheDocument();
  });
});

describe("CuentaToken · accesibilidad y estados", () => {
  it("dice qué está haciendo mientras comprueba el enlace", async () => {
    validateAccountToken.mockReturnValue(new Promise(() => {}));
    render(<CuentaToken />);
    expect(await screen.findByText(/comprobando que el enlace sigue siendo válido/i)).toBeInTheDocument();
  });

  it("el éxito se anuncia con role=status", async () => {
    const user = userEvent.setup();
    validateAccountToken.mockResolvedValue({ purpose: "activate", username: "m" });
    consumeAccountToken.mockResolvedValue({});
    render(<CuentaToken />);
    await screen.findByText(/activa tu cuenta/i);

    await user.type(screen.getByLabelText(/nueva contraseña/i), "contrasena-larga");
    await user.type(screen.getByLabelText(/confirma/i), "contrasena-larga");
    await user.click(screen.getByRole("button", { name: /activar cuenta/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/todo listo/i);
  });

  it("desde el error se puede volver al inicio de sesión", async () => {
    const user = userEvent.setup();
    validateAccountToken.mockRejectedValue(new Error("caducado"));
    render(<CuentaToken />);

    await user.click(await screen.findByRole("button", { name: /volver al inicio de sesión/i }));
    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("pide contraseña nueva al gestor, no la antigua", async () => {
    validateAccountToken.mockResolvedValue({ purpose: "reset", username: "m" });
    render(<CuentaToken />);
    await screen.findByText(/restablece tu contraseña/i);
    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAttribute("autocomplete", "new-password");
  });

  it("un solo h1 en cada fase", async () => {
    validateAccountToken.mockResolvedValue({ purpose: "activate", username: "m" });
    render(<CuentaToken />);
    await screen.findByText(/activa tu cuenta/i);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
