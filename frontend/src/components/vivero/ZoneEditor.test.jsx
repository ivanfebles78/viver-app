/**
 * CONTRATO DE COMPORTAMIENTO — ZoneEditor.
 *
 * Se escribe ANTES de sustituir `window.prompt`, `window.alert` y
 * `window.confirm`, y se ejecuta primero contra la implementación con diálogos
 * nativos para demostrar que describe lo que hoy ocurre.
 *
 * Lo que se fija son INVARIANTES, no el mecanismo: da igual quién pida el
 * identificador, lo que no puede cambiar es qué zona se crea, qué error se
 * muestra en cada rama, y que nada se guarde sin pulsar «Guardar cambios».
 *
 * ZoneEditor es la pieza de más riesgo del grupo: seis ramas de validación
 * cuyo ORDEN forma parte del contrato.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ZoneEditor from "./ZoneEditor";

const ZONAS = [
  { id: "zona-1", apiId: "1", nombre: "Zona 1", color: "#F4E2C1", puntos: "0,0 100,0 100,100 0,100" },
  { id: "zona-9b", apiId: "9b", nombre: "Zona 9 B", color: "#E8D947", puntos: "200,200 300,200 300,300" },
];

let onSave;
let onCancel;

beforeEach(() => {
  onSave = vi.fn();
  onCancel = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = (props = {}) =>
  render(<ZoneEditor zonas={ZONAS} onSave={onSave} onCancel={onCancel} {...props} />);

/**
 * Pide crear una zona y responde con `valor`.
 *
 * Aísla el MECANISMO. Con `valor === null` se cancela.
 */
async function pedirNuevaZona(user, valor) {
  await user.click(screen.getByRole("button", { name: /añadir zona/i }));
  const dlg = await screen.findByRole("dialog");
  if (valor === null) {
    await user.click(within(dlg).getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    return;
  }
  const campo = within(dlg).getByRole("textbox");
  if (valor !== "") await user.type(campo, valor);
  await user.click(within(dlg).getByRole("button", { name: /crear/i }));
}

/** Texto del error visible, o null. */
const textoError = () => screen.queryByRole("alert")?.textContent ?? null;

/* ══ 1. Las seis ramas de creación ══════════════════════════════════════ */

describe("contrato · creación de zona", () => {
  it("6 · un identificador válido crea la zona y la selecciona", async () => {
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "13");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Aparece en el selector de zonas y queda seleccionada.
    const selector = screen.getByLabelText(/zona/i, { selector: "select" });
    expect(within(selector).getByRole("option", { name: /Zona 13/ })).toBeInTheDocument();
    expect(selector).toHaveValue("zona-13");
  });

  it("2 · un identificador vacío no crea nada y avisa", async () => {
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "");
    expect(textoError()).toMatch(/vacío/i);
    expect(screen.queryByRole("option", { name: /Zona 13/ })).not.toBeInTheDocument();
  });

  it("3 · sólo el prefijo es inválido", async () => {
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "zona-");
    expect(textoError()).toMatch(/inválido/i);
  });

  it("4 · un identificador duplicado avisa de que ya existe", async () => {
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "9b");
    expect(textoError()).toMatch(/ya existe/i);
  });

  it("4 · el duplicado se detecta escriba como se escriba", async () => {
    for (const variante of ["zona-9b", "zona9b", "ZONA_9B"]) {
      const user = userEvent.setup();
      const { unmount } = pintar();
      await pedirNuevaZona(user, variante);
      expect(textoError(), variante).toMatch(/ya existe/i);
      unmount();
    }
  });

  it("5 · caracteres no permitidos", async () => {
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "con!simbolo");
    expect(textoError()).toMatch(/letras|guiones/i);
  });

  it("1 · cancelar no crea nada NI muestra ningún error", async () => {
    // Cancelar no es un fallo: avisar sería ruido.
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, null);
    expect(textoError()).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(ZONAS.length + 1); // +1 = placeholder
  });

  it("el prefijo no se duplica: «zona9b» apunta a «zona-9b»", async () => {
    /*
     * Defecto real ya corregido en su día: sin la normalización se creaba
     * «zona-zona9b». Aquí se comprueba a través del mensaje de duplicado, que
     * nombra el id resultante.
     */
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "zona9b");
    expect(textoError()).toContain("zona-9b");
    expect(textoError()).not.toContain("zona-zona9b");
  });
});

/* ══ 2. Borrado de zona ═════════════════════════════════════════════════ */

describe("contrato · borrado de zona", () => {
  const seleccionar = async (user, valor) =>
    user.selectOptions(screen.getByLabelText(/zona/i, { selector: "select" }), valor);

  it("no borra nada hasta confirmar", async () => {
    const user = userEvent.setup();
    pintar();
    await seleccionar(user, "zona-9b");
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    await screen.findByRole("alertdialog");
    /*
     * Con el diálogo modal abierto, Radix marca el resto de la página como
     * `aria-hidden`, así que aquí se consulta el DOM directamente en vez de por
     * rol: lo que se comprueba es que la zona SIGUE en la lista.
     */
    const opciones = [...document.getElementById("zone-editor-zona").options].map((o) => o.value);
    expect(opciones).toContain("zona-9b");
  });

  it("al cancelar, la zona sigue ahí", async () => {
    const user = userEvent.setup();
    pintar();
    await seleccionar(user, "zona-9b");
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /cancelar/i }));
    expect(screen.getByRole("option", { name: /Zona 9 B/ })).toBeInTheDocument();
  });

  it("al confirmar, desaparece del listado", async () => {
    const user = userEvent.setup();
    pintar();
    await seleccionar(user, "zona-9b");
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /eliminar/i }));
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /Zona 9 B/ })).not.toBeInTheDocument()
    );
  });

  it("el aviso identifica la zona y explica que el inventario NO se borra", async () => {
    const user = userEvent.setup();
    pintar();
    await seleccionar(user, "zona-9b");
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toMatch(/Zona 9 B/);
    expect(dlg.textContent).toMatch(/no se borran|NO se borran/i);
  });

  it("tras borrar, se selecciona la primera zona restante", async () => {
    const user = userEvent.setup();
    pintar();
    await seleccionar(user, "zona-9b");
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /eliminar/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/zona/i, { selector: "select" })).toHaveValue("zona-1")
    );
  });

  it("el borrado NO se persiste hasta guardar", async () => {
    const user = userEvent.setup();
    pintar();
    await seleccionar(user, "zona-9b");
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /eliminar/i }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

/* ══ 3. Guardado y cancelación ══════════════════════════════════════════ */

describe("contrato · guardado", () => {
  it("guarda todas las zonas con sus puntos en cadena", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const guardadas = onSave.mock.calls[0][0];
    expect(guardadas).toHaveLength(2);
    expect(guardadas[0]).toMatchObject({ id: "zona-1", apiId: "1", nombre: "Zona 1" });
    // Los puntos vuelven a cadena, redondeados.
    expect(guardadas[0].puntos).toBe("0,0 100,0 100,100 0,100");
    // El estado interno no viaja.
    expect(guardadas[0]).not.toHaveProperty("_points");
  });

  it("una zona nueva se guarda con su id, apiId y nombre derivados", async () => {
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "13");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    const guardadas = onSave.mock.calls[0][0];
    const nueva = guardadas.find((z) => z.id === "zona-13");
    expect(nueva).toMatchObject({ id: "zona-13", apiId: "13", nombre: "Zona 13" });
    expect(nueva.puntos).toBe("950,600 1100,600 1100,750 950,750");
    expect(nueva.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("mientras guarda, los botones se deshabilitan", () => {
    pintar({ saving: true });
    expect(screen.getByRole("button", { name: /guardando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^cancelar$/i })).toBeDisabled();
  });

  it("Escape cancela la edición", async () => {
    const user = userEvent.setup();
    pintar();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("el botón Cancelar cancela", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});

/* ══ 4. Metadatos de la zona seleccionada ══════════════════════════════ */

describe("contrato · nombre y color", () => {
  it("cambiar el nombre se refleja en el guardado", async () => {
    const user = userEvent.setup();
    pintar();
    const campo = screen.getByLabelText(/nombre/i);
    await user.clear(campo);
    await user.type(campo, "Umbráculo norte");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    const guardadas = onSave.mock.calls[0][0];
    expect(guardadas.find((z) => z.id === "zona-1").nombre).toBe("Umbráculo norte");
  });

  it("el color de zona es un DATO editable, no un token de estilo", async () => {
    /*
     * Cada zona lleva su color en la configuración y se persiste en el
     * servidor. Es lo que hace reconocible el plano frente al impreso que
     * maneja el personal, así que el editor tiene que seguir ofreciéndolo.
     */
    pintar();
    const color = screen.getByLabelText(/color/i);
    expect(color).toHaveAttribute("type", "color");
    expect(color).toHaveValue("#f4e2c1");
  });

  it("restaurar zona vuelve a los puntos originales recibidos", async () => {
    const user = userEvent.setup();
    pintar();
    // Sin manipular puntos, restaurar debe ser inocuo y no romper.
    await user.click(screen.getByRole("button", { name: /restaurar zona/i }));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(onSave.mock.calls[0][0][0].puntos).toBe("0,0 100,0 100,100 0,100");
  });
});

/* ══ 5. Sin diálogos nativos ═══════════════════════════════════════════ */

describe("contrato · no quedan diálogos nativos", () => {
  it("crear una zona no llama a window.prompt", async () => {
    const spy = vi.spyOn(window, "prompt").mockReturnValue("13");
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /añadir zona/i }));
    await screen.findByRole("dialog");
    expect(spy).not.toHaveBeenCalled();
  });

  it("un identificador inválido no llama a window.alert", async () => {
    const spy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();
    pintar();
    await pedirNuevaZona(user, "con!simbolo");
    expect(spy).not.toHaveBeenCalled();
  });

  it("borrar una zona no llama a window.confirm", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    await screen.findByRole("alertdialog");
    expect(spy).not.toHaveBeenCalled();
  });
});
