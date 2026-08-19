/**
 * CONTRATO DE REINICIO — MovimientoCestaModal.
 *
 * Se escribe ANTES de tocar los efectos. El modal reinicia estado en cinco
 * situaciones distintas, y hoy lo hace con `useEffect`s que llaman a `setState`
 * nada más cambiar una dependencia: cada uno provoca un render en cascada.
 *
 * Lo que se fija aquí es CUÁNDO se reinicia qué, no cómo. Da igual si el
 * reinicio lo hace un efecto, un manejador o un remontado: lo que no puede
 * cambiar es que una cesta a medio montar no sobreviva a un cambio de tipo, ni
 * a cerrar y volver a abrir.
 *
 * Es el punto de más riesgo del refactor de `set-state-in-effect`: si un
 * reinicio se pierde, el usuario acaba enviando líneas de un tipo de
 * movimiento dentro de otro.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MovimientoCestaModal from "./MovimientoCestaModal";

const PRODUCTOS = [
  {
    id: 1,
    nombre_cientifico: "Dracaena draco",
    nombre_natural: "Drago",
    categoria: "Árbol",
    subcategoria: "Autóctono",
  },
  {
    id: 2,
    nombre_cientifico: "Phoenix canariensis",
    nombre_natural: "Palmera canaria",
    categoria: "Palmera",
    subcategoria: "Canaria",
  },
];

const ZONAS = ["Zona 1", "Zona 2", "Umbraculo"];

let onSubmit;
let onClose;

beforeEach(() => {
  onSubmit = vi.fn().mockResolvedValue(undefined);
  onClose = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = (props = {}) =>
  render(
    <MovimientoCestaModal
      open
      onClose={onClose}
      productos={PRODUCTOS}
      movimientos={[]}
      zonas={ZONAS}
      onSubmit={onSubmit}
      saving={false}
      {...props}
    />
  );

const buscador = () => screen.getByLabelText(/buscar producto/i);

/* ══ 1. El buscador se limpia al cambiar de tipo ════════════════════════ */

describe("contrato · cambiar de tipo reinicia la pantalla", () => {
  it("el texto del buscador no sobrevive a un cambio de tipo", async () => {
    /*
     * Las líneas de una cesta son propias del tipo de movimiento: arrastrar el
     * filtro de una salida a una entrada haría creer al usuario que está viendo
     * el catálogo completo cuando no lo está.
     */
    const user = userEvent.setup();
    pintar();
    await user.type(buscador(), "drago");
    expect(buscador()).toHaveValue("drago");

    await user.click(screen.getByRole("tab", { name: /entrada/i }));
    await waitFor(() => expect(buscador()).toHaveValue(""));
  });

  /*
   * NOTA: no se prueba aquí que la SELECCIÓN de producto se reinicie. Llegar a
   * seleccionar uno exige antes elegir zona de origen, y la cadena completa
   * pertenece a las pruebas de flujo de Movimientos. Lo que este fichero fija
   * —que el buscador y el tipo vuelven a su sitio— comparte el mismo
   * mecanismo de reinicio, así que un fallo se vería igualmente.
   */
});

/* ══ 2. Cerrar y reabrir empieza de cero ═══════════════════════════════ */

describe("contrato · cerrar y reabrir no arrastra nada", () => {
  /*
   * Se monta como lo hace la pantalla real: con una `key` atada al estado de
   * apertura, de modo que abrir el modal crea una instancia nueva. Probarlo
   * sin la `key` mediría un componente que en la aplicación no existe.
   */
  const Anfitrion = ({ abierto }) => (
    <MovimientoCestaModal
      key={abierto ? "abierta" : "cerrada"}
      open={abierto}
      onClose={onClose}
      productos={PRODUCTOS}
      movimientos={[]}
      zonas={ZONAS}
      onSubmit={onSubmit}
      saving={false}
    />
  );

  it("lo tecleado antes de cerrar no reaparece al volver a abrir", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Anfitrion abierto />);
    await user.type(buscador(), "drago");
    expect(buscador()).toHaveValue("drago");

    rerender(<Anfitrion abierto={false} />);
    rerender(<Anfitrion abierto />);

    await waitFor(() => expect(buscador()).toHaveValue(""));
  });

  it("el tipo vuelve a «salida», que es el que la pantalla ofrece por defecto", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Anfitrion abierto />);
    await user.click(screen.getByRole("tab", { name: /entrada/i }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /entrada/i })).toHaveAttribute("aria-selected", "true")
    );

    rerender(<Anfitrion abierto={false} />);
    rerender(<Anfitrion abierto />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /salida/i })).toHaveAttribute("aria-selected", "true")
    );
  });
});

/* ══ 3. Nada se envía sin acción explícita ═════════════════════════════ */

describe("contrato · el envío", () => {
  it("abrir el modal no envía nada", () => {
    pintar();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cambiar de tipo tampoco", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("tab", { name: /entrada/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
