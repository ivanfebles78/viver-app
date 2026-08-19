/**
 * CONTRATO DE DEVOLUCIÓN DEL FOCO — UF-7.
 *
 * Al cerrar un diálogo, el foco tiene que volver al control que lo abrió. Si no
 * vuelve, quien navega con teclado aparece al principio del documento y tiene
 * que recorrer la pantalla entera para seguir donde estaba. Es el criterio
 * 2.4.3 de la WCAG, y en una tabla de doce filas con un botón por fila la
 * diferencia es entre pulsar Tab una vez o cuarenta.
 *
 * Radix cancela la restauración propia de su `FocusScope` y en su lugar enfoca
 * la referencia de su `DialogTrigger`. ViverApp no usa `DialogTrigger`: abre
 * los diálogos con estado propio, así que esa referencia es `null` y el foco
 * cae a `<body>`. Se corrige en el paquete, no aquí (ver docs/upstream-findings.md).
 *
 * Se comprueba contra el componente REAL del sistema, no contra un doble: lo
 * que se está fijando es precisamente el comportamiento del paquete.
 */

import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dialog, DialogContent } from "./components/overlays";

/** Diálogo controlado por estado, que es como los abre toda la aplicación. */
function Controlado() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      <button type="button">Otro control</button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent title="Título" closeLabel="Cerrar" size="sm">
          <p>Contenido</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("contrato · el foco vuelve al control que abrió el diálogo", () => {
  it("al cerrar con Escape", async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    const abrir = screen.getByRole("button", { name: "Abrir" });

    await user.click(abrir);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(abrir);
  });

  it("al cerrar con el botón de cerrar", async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    const abrir = screen.getByRole("button", { name: "Abrir" });

    await user.click(abrir);
    await user.click(await screen.findByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(abrir);
  });
});
