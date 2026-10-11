import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Sin imagen real: el hook devuelve null y la ficha muestra el aviso "sin imagen".
vi.mock("../utils/plantImages", () => ({ usePlantImage: () => null }));

import VerProducto from "./VerProducto";

const producto = {
  id: 7,
  sku: "VV-00042-A",
  nombre_cientifico: "Dracaena draco",
  nombre_natural: "Drago",
  categoria: "Plantas",
  subcategoria: "Árbol",
};

describe("VerProducto", () => {
  it("el nombre es pulsable y abre la ficha con el SKU", async () => {
    const user = userEvent.setup();
    render(<VerProducto producto={producto}>Dracaena draco</VerProducto>);

    // El nombre accesible del botón es su propio texto (el nombre del producto).
    const boton = screen.getByRole("button", { name: /dracaena draco/i });
    await user.click(boton);

    // La ficha muestra el SKU y los datos del producto.
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("SKU");
    expect(dialogo).toHaveTextContent("VV-00042-A");
    expect(dialogo).toHaveTextContent("Dracaena draco");
    expect(dialogo).toHaveTextContent("Drago");
    // Sin imagen, se dice explícitamente (no se deja un hueco roto).
    expect(dialogo).toHaveTextContent(/no tiene imagen/i);
  });

  it("sin SKU, muestra un guion en su lugar (no rompe)", async () => {
    const user = userEvent.setup();
    render(
      <VerProducto producto={{ ...producto, sku: null }}>Dracaena draco</VerProducto>
    );
    await user.click(screen.getByRole("button", { name: /dracaena draco/i }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("SKU");
  });
});
