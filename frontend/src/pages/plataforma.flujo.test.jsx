/**
 * CONTRATO DEL FLUJO DE CONTROL — Plataforma.
 *
 * Se escribe ANTES de sustituir los diálogos nativos, y se ejecuta contra la
 * implementación actual para demostrar que describe lo que hoy ocurre.
 *
 * Lo que se fija son INVARIANTES, no el mecanismo: da igual si el «¿seguro?» lo
 * pinta el navegador o un `AlertDialog`, lo que no puede cambiar es que
 * **nada llegue al backend hasta que el usuario diga que sí**.
 *
 * Es justo donde se rompen las cosas al pasar de `window.confirm` —que bloquea
 * y devuelve un booleano— a un diálogo de React, que devuelve una promesa.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api/api", () => ({
  getSuperadminStats: vi.fn(),
  enrollAyuntamiento: vi.fn(),
  setActiveClienteId: vi.fn(),
  updateCliente: vi.fn(),
  importClienteData: vi.fn(),
}));

import * as api from "../api/api";
import Plataforma from "./Plataforma";

const STATS = {
  resumen: {
    ayuntamientos_total: 2,
    ayuntamientos_activos: 2,
    usuarios_total: 35,
    productos_total: 120,
    pedidos_total: 40,
    movimientos_total: 900,
  },
  facturacion: {
    ingreso_mensual_estimado: 398,
    ingreso_anual_estimado: 4776,
    ayuntamientos_facturables: 2,
    cuota_mensual_por_defecto: 199,
  },
  evolucion_altas: [
    { mes: "2026-01", acumulado: 1 },
    { mes: "2026-02", acumulado: 2 },
  ],
  por_cliente: [
    {
      id: 1,
      nombre: "Ayuntamiento de Santa Cruz de Tenerife",
      slug: "santa-cruz",
      activo: true,
      usuarios: 24,
      productos: 100,
      pedidos: 30,
      movimientos: 700,
      cuota_mensual: 199,
      cuota_personalizada: false,
    },
    {
      id: 2,
      nombre: "Ayuntamiento de La Laguna",
      slug: "la-laguna",
      activo: false,
      usuarios: 11,
      productos: 20,
      pedidos: 10,
      movimientos: 200,
      cuota_mensual: 150,
      cuota_personalizada: true,
    },
  ],
};

const ficheroCopia = () =>
  new File([JSON.stringify({ productos: [] })], "copia.json", { type: "application/json" });

beforeEach(() => {
  api.getSuperadminStats.mockResolvedValue(STATS);
  api.importClienteData.mockResolvedValue({ importado: { productos: 12, movimientos: 3 } });
  api.updateCliente.mockResolvedValue({});
  api.enrollAyuntamiento.mockResolvedValue({
    cliente: { id: 9, nombre: "Ayuntamiento de Arico" },
    admin: { email: "admin@arico.es" },
    email_invitacion_enviado: true,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = () => render(<Plataforma />);
const esperarTabla = () => screen.findByText(/Santa Cruz de Tenerife/);

/** Input de fichero de la fila del ayuntamiento indicado. */
const inputImportarDe = async (nombre) => {
  const fila = (await screen.findByText(nombre)).closest("tr");
  return within(fila).getByLabelText(/importar/i);
};

/* ══ 1. La importación NO puede ejecutarse sin confirmación ═════════════ */

describe("contrato · importar copia de seguridad", () => {
  it("elegir un fichero NO importa nada por sí solo", async () => {
    /*
     * Es el invariante central. La importación puede sobrescribir los datos de
     * un ayuntamiento entero: tiene que mediar una decisión explícita.
     */
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const input = await inputImportarDe("Ayuntamiento de La Laguna");
    await user.upload(input, ficheroCopia());

    // Se ha pedido confirmación y NO se ha llamado al backend.
    expect(api.importClienteData).not.toHaveBeenCalled();
  });

  it("al cancelar, no se importa", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const input = await inputImportarDe("Ayuntamiento de La Laguna");
    await user.upload(input, ficheroCopia());

    await responder(user, false);
    expect(api.importClienteData).not.toHaveBeenCalled();
  });

  it("al confirmar, se importa CON el fichero elegido y en el ayuntamiento correcto", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const fichero = ficheroCopia();
    const input = await inputImportarDe("Ayuntamiento de La Laguna");
    await user.upload(input, fichero);

    await responder(user, true);

    await waitFor(() => expect(api.importClienteData).toHaveBeenCalledTimes(1));
    const [clienteId, enviado] = api.importClienteData.mock.calls[0];
    // El id es el de la fila, no el de la primera del listado.
    expect(clienteId).toBe(2);
    // El fichero sobrevive al await: si se leyera del input después de vaciarlo,
    // aquí llegaría `undefined`.
    expect(enviado).toBeInstanceOf(File);
    expect(enviado.name).toBe("copia.json");
  });

  it("el input queda vacío, para poder reelegir el MISMO fichero", async () => {
    /*
     * Si el input conservara el valor, volver a elegir el mismo fichero no
     * dispararía `change` y el botón parecería muerto.
     */
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const input = await inputImportarDe("Ayuntamiento de La Laguna");
    await user.upload(input, ficheroCopia());
    await responder(user, false);

    expect(input.value).toBe("");
  });

  it("el diálogo identifica el ayuntamiento afectado", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const input = await inputImportarDe("Ayuntamiento de La Laguna");
    await user.upload(input, ficheroCopia());

    const texto = await textoDelAviso();
    expect(texto).toMatch(/La Laguna/);
  });

  it("un fallo del backend se comunica y no deja la fila colgada", async () => {
    api.importClienteData.mockRejectedValue({ response: { data: { detail: "copia corrupta" } } });
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const input = await inputImportarDe("Ayuntamiento de La Laguna");
    await user.upload(input, ficheroCopia());
    await responder(user, true);

    expect(await screen.findByText(/copia corrupta/)).toBeInTheDocument();
  });

  it("tras importar bien, se informa de lo importado", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const input = await inputImportarDe("Ayuntamiento de La Laguna");
    await user.upload(input, ficheroCopia());
    await responder(user, true);

    // El informe llega en un aviso con rol ARIA, no en un `alert()` nativo.
    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent(/Importación completada/i);
    expect(aviso).toHaveTextContent(/productos: 12/i);
  });
});

/* ══ 2. La cuota inválida no llega al backend ═══════════════════════════ */

describe("contrato · edición de cuota", () => {
  const abrirEditor = async (user, nombre) => {
    const fila = (await screen.findByText(nombre)).closest("tr");
    await user.click(within(fila).getByRole("button", { name: /cuota/i }));
    return fila;
  };

  it("una cuota negativa NO llega al backend", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const fila = await abrirEditor(user, "Ayuntamiento de La Laguna");
    const campo = within(fila).getByRole("spinbutton");
    await user.clear(campo);
    await user.type(campo, "-5");
    await user.click(within(fila).getByRole("button", { name: /guardar/i }));

    expect(api.updateCliente).not.toHaveBeenCalled();
  });

  it("una cuota inválida deja el editor abierto con lo escrito", async () => {
    // Cerrarlo perdería lo que el usuario tecleó.
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const fila = await abrirEditor(user, "Ayuntamiento de La Laguna");
    const campo = within(fila).getByRole("spinbutton");
    await user.clear(campo);
    await user.type(campo, "-5");
    await user.click(within(fila).getByRole("button", { name: /guardar/i }));

    expect(within(fila).getByRole("spinbutton")).toBeInTheDocument();
  });

  it("una cuota vacía SÍ se guarda, como «cuota por defecto»", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const fila = await abrirEditor(user, "Ayuntamiento de La Laguna");
    await user.clear(within(fila).getByRole("spinbutton"));
    await user.click(within(fila).getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(api.updateCliente).toHaveBeenCalled());
    expect(api.updateCliente).toHaveBeenCalledWith(2, { set_cuota: true, cuota_mensual: null });
  });

  it("una cuota válida se guarda tal cual", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const fila = await abrirEditor(user, "Ayuntamiento de La Laguna");
    const campo = within(fila).getByRole("spinbutton");
    await user.clear(campo);
    await user.type(campo, "250");
    await user.click(within(fila).getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(api.updateCliente).toHaveBeenCalled());
    expect(api.updateCliente).toHaveBeenCalledWith(2, { set_cuota: true, cuota_mensual: 250 });
  });

  it("cancelar la edición no guarda nada", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const fila = await abrirEditor(user, "Ayuntamiento de La Laguna");
    await user.click(within(fila).getByRole("button", { name: /cancelar/i }));
    expect(api.updateCliente).not.toHaveBeenCalled();
  });
});

/* ══ 3. Alta de ayuntamiento ═══════════════════════════════════════════ */

describe("contrato · alta de ayuntamiento", () => {
  it("el slug se autocompleta desde el nombre", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/nombre del ayuntamiento/i), "Villa de Arico");
    expect(screen.getByLabelText(/slug/i)).toHaveValue("villa-de-arico");
  });

  it("una vez tocado el slug, el nombre ya no lo pisa", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    const nombre = screen.getByLabelText(/nombre del ayuntamiento/i);
    const slug = screen.getByLabelText(/slug/i);
    await user.type(nombre, "Arico");
    await user.clear(slug);
    await user.type(slug, "arico-2026");
    await user.type(nombre, " del Norte");

    expect(slug).toHaveValue("arico-2026");
  });

  it("el alta envía el payload sin estado interno", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/nombre del ayuntamiento/i), "Arico");
    await user.type(screen.getByLabelText(/usuario admin/i), "admin_arico");
    await user.type(screen.getByLabelText(/email del admin/i), "admin@arico.es");
    await user.click(screen.getByRole("button", { name: /dar de alta/i }));

    await waitFor(() => expect(api.enrollAyuntamiento).toHaveBeenCalled());
    const payload = api.enrollAyuntamiento.mock.calls[0][0];
    expect(Object.keys(payload)).not.toContain("_autoSlug");
    expect(payload.slug).toBe("arico");
    expect(payload.cif).toBeNull();
  });
});

/* ══ Utilidades del contrato ═══════════════════════════════════════════ */

/**
 * Responde a la confirmación pendiente.
 *
 * Aísla el MECANISMO: hoy es un `AlertDialog`; si volviera a ser
 * `window.confirm`, solo cambiaría esta función y los invariantes de arriba
 * seguirían valiendo.
 */
async function responder(user, aceptar) {
  const dlg = await screen.findByRole("alertdialog");
  const boton = aceptar
    ? within(dlg).getByRole("button", { name: /importar/i })
    : within(dlg).getByRole("button", { name: /cancelar/i });
  await user.click(boton);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
}

async function textoDelAviso() {
  const dlg = await screen.findByRole("alertdialog");
  return dlg.textContent || "";
}
