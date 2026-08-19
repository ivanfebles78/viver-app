/**
 * CONTRATO DE BOTÓN OCUPADO — UF-8.
 *
 * Un botón `loading` se renderizaba como `disabled` nativo. Un elemento
 * deshabilitado no admite foco, así que cuando el disparador de un diálogo se
 * quedaba ocupado al cerrarse, la devolución del foco no tenía a dónde ir y el
 * usuario aparecía en `<body>` — al principio del documento, justo después de
 * actuar. Criterio 2.4.3 de la WCAG.
 *
 * Se corrigió en el paquete (PR #7). Esto lo fija desde el lado del consumidor:
 * si una sincronización futura lo reintrodujera, falla aquí y no en producción.
 *
 * Las dos mitades del contrato tiran una contra otra y las dos tienen que
 * cumplirse a la vez:
 *
 *   1. Un botón ocupado SIGUE ADMITIENDO FOCO.
 *   2. Un botón ocupado NO HACE NADA al activarlo, por ninguna vía.
 *
 * La segunda es la que hace que la primera sea segura. Se comprueba contra el
 * componente REAL del sistema, no contra un doble: lo que se fija es el
 * comportamiento del paquete.
 */

import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button, Dialog, DialogContent } from "./index";

/**
 * Diálogo controlado cuyo disparador queda ocupado al cerrarse.
 *
 * Es la forma de casi todo flujo de «confirmar y luego trabajar», y la que
 * rompía: en ViverApp es el botón «Exportar» de Informes.
 */
function ConfirmarYTrabajar({ onAccion }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  return (
    <>
      <button type="button">Antes</button>
      <Button
        loading={ocupado}
        onClick={() => {
          onAccion();
          setAbierto(true);
          setOcupado(true);
        }}
      >
        Publicar
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent title="Publicar" closeLabel="Cerrar" size="sm">
          <p>Se publicará al cerrar.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Deja el disparador ocupado y el diálogo ya cerrado. */
async function dejarOcupado(user, onAccion = vi.fn()) {
  render(<ConfirmarYTrabajar onAccion={onAccion} />);
  const boton = screen.getByRole("button", { name: /publicar/i });

  await user.click(boton);
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  return { boton, onAccion };
}

describe("UF-8 · un botón ocupado conserva el foco", () => {
  it("el foco vuelve al disparador aunque se haya quedado ocupado", async () => {
    const user = userEvent.setup();
    const { boton } = await dejarOcupado(user);

    expect(boton).toHaveAttribute("aria-busy", "true");
    expect(document.activeElement).toBe(boton);
  });

  it("sigue admitiendo foco: no es `disabled` nativo", async () => {
    const user = userEvent.setup();
    const { boton } = await dejarOcupado(user);

    expect(boton.disabled).toBe(false);
    expect(boton).toHaveAttribute("aria-disabled", "true");
  });
});

describe("UF-8 · un botón ocupado no se puede volver a activar", () => {
  it("ni con el puntero", async () => {
    const user = userEvent.setup();
    const { boton, onAccion } = await dejarOcupado(user);

    // `pointerEventsCheck: 0`: sin esto userEvent se negaría a pulsar un control
    // que considera inaccionable, que es justo lo que se está comprobando.
    await user.click(boton, undefined, { pointerEventsCheck: 0 });
    await user.click(boton, undefined, { pointerEventsCheck: 0 });

    expect(onAccion).toHaveBeenCalledTimes(1);
  });

  it("ni con Enter", async () => {
    const user = userEvent.setup();
    const { boton, onAccion } = await dejarOcupado(user);

    boton.focus();
    await user.keyboard("{Enter}{Enter}");

    expect(onAccion).toHaveBeenCalledTimes(1);
  });

  it("ni con Espacio", async () => {
    const user = userEvent.setup();
    const { boton, onAccion } = await dejarOcupado(user);

    boton.focus();
    await user.keyboard("[Space][Space]");

    expect(onAccion).toHaveBeenCalledTimes(1);
  });

  it("ni combinando las tres vías varias veces", async () => {
    const user = userEvent.setup();
    const { boton, onAccion } = await dejarOcupado(user);

    for (let i = 0; i < 3; i += 1) {
      await user.click(boton, undefined, { pointerEventsCheck: 0 });
      boton.focus();
      await user.keyboard("{Enter}[Space]");
    }

    expect(onAccion).toHaveBeenCalledTimes(1);
  });
});

describe("UF-8 · un botón realmente deshabilitado no cambia", () => {
  it("conserva la semántica nativa y sale del orden de tabulación", async () => {
    /*
     * No disponible y ocupado son cosas distintas. Un control que no está a tu
     * alcance no tiene por qué estarlo tampoco para el tabulador: sería una
     * parada que no lleva a ninguna parte.
     */
    render(
      <>
        <button type="button">Antes</button>
        <Button disabled>Guardar</Button>
        <button type="button">Después</button>
      </>
    );

    const boton = screen.getByRole("button", { name: /guardar/i });
    expect(boton.disabled).toBe(true);
    expect(boton).not.toHaveAttribute("aria-disabled", "true");
    expect(boton).not.toHaveAttribute("aria-busy");

    const user = userEvent.setup();
    screen.getByRole("button", { name: /antes/i }).focus();
    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: /después/i }));
  });
});
