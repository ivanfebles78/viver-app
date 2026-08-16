/**
 * SEGUIMIENTO DE LOTE — pruebas.
 *
 * La consulta no cambia respecto a main: mismo `getLote()`, mismo trato del
 * 404 frente al resto de errores, mismos campos. Lo que se prueba además es que
 * la pantalla distingue «todavía no has buscado» de «no hay resultados», que la
 * tecla Intro funciona, y que el historial es una tabla accesible.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api/api", () => ({ getLote: vi.fn() }));

import { getLote } from "../api/api";
import Lotetracking from "./Lotetracking";

const LOTE = {
  uuid: "3f2a91c4-8b17-4e5d-9a2f-71c6e0d4b8aa",
  cantidad_inicial: 1200,
  movimientos: [
    {
      fecha: "2026-01-15T10:00:00Z",
      origen: "Semillero", destino: "Zona A",
      zona_origen: "S1", zona_destino: "A3",
      tamano_origen: "C7", tamano_destino: "C14",
      cantidad: 500,
    },
    {
      fecha: "2026-02-20T09:30:00Z",
      origen: "Zona A", destino: "Salida",
      zona_origen: "A3", zona_destino: "—",
      tamano_origen: "C14", tamano_destino: "C14",
      cantidad: 300,
    },
  ],
};

beforeEach(() => {
  getLote.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const buscar = async (user, termino) => {
  await user.type(screen.getByLabelText(/identificador del lote/i), termino);
  await user.click(screen.getByRole("button", { name: /buscar/i }));
};

describe("Lotes · consulta", () => {
  it("llama a getLote con el UUID escrito", async () => {
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    render(<Lotetracking />);

    await buscar(user, LOTE.uuid);
    expect(getLote).toHaveBeenCalledWith(LOTE.uuid);
  });

  it("recorta los espacios: pegar un UUID suele traerlos", async () => {
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    render(<Lotetracking />);

    await buscar(user, `  ${LOTE.uuid}  `);
    expect(getLote).toHaveBeenCalledWith(LOTE.uuid);
  });

  it("la tecla Intro busca", async () => {
    /*
     * En main el campo era un input suelto junto a un botón, sin formulario:
     * pulsar Intro no hacía nada, que es justo lo que uno hace después de pegar
     * un identificador.
     */
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    render(<Lotetracking />);

    await user.type(screen.getByLabelText(/identificador del lote/i), `${LOTE.uuid}{Enter}`);
    expect(getLote).toHaveBeenCalledWith(LOTE.uuid);
  });

  it("no consulta con el campo vacío y lo explica", async () => {
    const user = userEvent.setup();
    render(<Lotetracking />);

    await user.click(screen.getByRole("button", { name: /buscar/i }));
    expect(await screen.findByText(/introduce el uuid/i)).toBeInTheDocument();
    expect(getLote).not.toHaveBeenCalled();
  });
});

describe("Lotes · resultados", () => {
  it("muestra el histórico como tabla, con una fila por movimiento", async () => {
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    render(<Lotetracking />);
    await buscar(user, LOTE.uuid);

    const tabla = await screen.findByRole("table");
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain("Semillero");
    expect(filas[1].textContent).toContain("Salida");
  });

  it("la tabla tiene caption y cabeceras con scope", async () => {
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    render(<Lotetracking />);
    await buscar(user, LOTE.uuid);

    const tabla = await screen.findByRole("table");
    expect(within(tabla).getByText(/movimientos del lote/i)).toBeInTheDocument();
    const cabeceras = within(tabla).getAllByRole("columnheader");
    expect(cabeceras.length).toBeGreaterThan(0);
    for (const th of cabeceras) expect(th).toHaveAttribute("scope", "col");
  });

  it("muestra el UUID y la cantidad inicial", async () => {
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    render(<Lotetracking />);
    await buscar(user, LOTE.uuid);

    expect(await screen.findByText(/cantidad inicial/i)).toBeInTheDocument();
    // es-ES no agrupa los millares de cuatro cifras (minimumGroupingDigits=2 en
    // CLDR): 1200 se escribe «1200» y 12000, «12.000». Se compara con el mismo
    // formateador para no fijar una convención equivocada.
    const esperado = new Intl.NumberFormat("es-ES").format(1200);
    expect(screen.getByText(esperado)).toBeInTheDocument();
  });

  it("un lote existente pero sin movimientos lo dice, no queda en blanco", async () => {
    const user = userEvent.setup();
    getLote.mockResolvedValue({ ...LOTE, movimientos: [] });
    render(<Lotetracking />);
    await buscar(user, LOTE.uuid);

    expect(await screen.findByText(/no tiene movimientos registrados/i)).toBeInTheDocument();
  });

  it("dos movimientos idénticos siguen siendo dos filas", async () => {
    // La clave de fila se construye por posición justo para esto: una
    // traslación partida en dos asientos coincide en todos los campos.
    const user = userEvent.setup();
    const mov = LOTE.movimientos[0];
    getLote.mockResolvedValue({ ...LOTE, movimientos: [mov, { ...mov }] });
    render(<Lotetracking />);
    await buscar(user, LOTE.uuid);

    const tabla = await screen.findByRole("table");
    expect(within(tabla).getAllByRole("row").slice(1)).toHaveLength(2);
  });
});

describe("Lotes · estados", () => {
  it("antes de buscar invita a hacerlo, no muestra un error", async () => {
    render(<Lotetracking />);
    expect(screen.getByText(/busca un lote para ver su trazabilidad/i)).toBeInTheDocument();
    expect(screen.queryByText(/no se ha podido/i)).not.toBeInTheDocument();
  });

  it("un 404 dice que el lote no existe, no «error»", async () => {
    const user = userEvent.setup();
    getLote.mockRejectedValue({ response: { status: 404 } });
    render(<Lotetracking />);
    await buscar(user, "no-existe");

    expect(await screen.findByText(/no se encontró ningún lote/i)).toBeInTheDocument();
  });

  it("otros errores muestran el detalle del backend", async () => {
    const user = userEvent.setup();
    getLote.mockRejectedValue({ response: { status: 500, data: { detail: "Base de datos no disponible" } } });
    render(<Lotetracking />);
    await buscar(user, "x");

    expect(await screen.findByText(/base de datos no disponible/i)).toBeInTheDocument();
  });

  it("un error sin detalle no deja al usuario sin explicación", async () => {
    const user = userEvent.setup();
    getLote.mockRejectedValue(new Error("boom"));
    render(<Lotetracking />);
    await buscar(user, "x");

    expect(await screen.findByText(/no se pudo consultar el lote/i)).toBeInTheDocument();
  });

  it("una búsqueda fallida borra el resultado anterior", async () => {
    // Si no, se quedaría en pantalla el lote antiguo bajo un mensaje de error:
    // el usuario creería estar viendo el lote que acaba de pedir.
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    render(<Lotetracking />);
    await buscar(user, LOTE.uuid);
    await screen.findByRole("table");

    getLote.mockRejectedValue({ response: { status: 404 } });
    await user.clear(screen.getByLabelText(/identificador del lote/i));
    await buscar(user, "otro");

    expect(await screen.findByText(/no se encontró/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("desactiva el botón mientras consulta", async () => {
    const user = userEvent.setup();
    getLote.mockReturnValue(new Promise(() => {}));
    render(<Lotetracking />);
    await buscar(user, "x");

    expect(screen.getByRole("button", { name: /buscar/i })).toBeDisabled();
  });
});

describe("Lotes · presentación", () => {
  it("el campo tiene etiqueta visible, no solo placeholder", async () => {
    // Un placeholder desaparece al escribir; en un campo donde se pega un UUID
    // de 36 caracteres, perder el rótulo es perder el contexto.
    render(<Lotetracking />);
    const campo = screen.getByLabelText(/identificador del lote/i);
    expect(campo).toBeInTheDocument();
    expect(campo.getAttribute("placeholder")).not.toBeNull();
  });

  it("el UUID se muestra en monoespaciada", async () => {
    const user = userEvent.setup();
    getLote.mockResolvedValue(LOTE);
    const { container } = render(<Lotetracking />);
    await buscar(user, LOTE.uuid);
    await screen.findByRole("table");

    const mono = [...container.querySelectorAll(".mono")];
    expect(mono.some((el) => el.textContent.includes(LOTE.uuid))).toBe(true);
  });

  it("un solo h1", () => {
    render(<Lotetracking />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
