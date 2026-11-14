import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const outletContext = { me: { username: "jefa", rol: "admin", permisos: { "admin.pack_complementos": "full" } } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getPackComplementos: vi.fn(),
  getProductos: vi.fn(),
  crearPackLinea: vi.fn(),
  actualizarPackLinea: vi.fn(),
  eliminarPackLinea: vi.fn(),
}));

import * as api from "../api/api";
import PackComplementos from "./PackComplementos";

const PRODUCTOS = [
  { id: 10, nombre_cientifico: "Tutor 2,4", subcategoria: "Tutores", sku: "FT-01" },
  { id: 11, nombre_cientifico: "Cinta entutorar", subcategoria: "Cintas", sku: "FT-02" },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.getProductos.mockResolvedValue(PRODUCTOS);
  api.getPackComplementos.mockResolvedValue({
    lineas: [
      { id: 1, producto_id: 10, producto_nombre: "Tutor 2,4", producto_sku: "FT-01", producto_subcategoria: "Tutores", cantidad_por_arbol: 3, tamano: "2,4", orden: 1 },
    ],
  });
});

describe("PackComplementos", () => {
  it("pinta las líneas del pack con su cantidad por árbol", async () => {
    render(<PackComplementos />);
    expect(await screen.findByText("Tutor 2,4")).toBeInTheDocument();
    // cantidad editable preрellenada
    expect(screen.getByLabelText(/Cantidad por árbol de Tutor 2,4/i)).toHaveValue(3);
  });

  it("añade un complemento con la forma correcta", async () => {
    const user = userEvent.setup();
    api.crearPackLinea.mockResolvedValue({});
    render(<PackComplementos />);
    await screen.findByText("Tutor 2,4");

    await user.selectOptions(screen.getByLabelText("Producto complemento a añadir"), "11");
    await user.type(screen.getByLabelText("Cantidad por árbol"), "1");
    await user.type(screen.getByLabelText("Tamaño del complemento"), "5");
    await user.click(screen.getByRole("button", { name: /^añadir$/i }));

    await waitFor(() => expect(api.crearPackLinea).toHaveBeenCalled());
    expect(api.crearPackLinea.mock.calls[0][0]).toEqual({ producto_id: 11, cantidad_por_arbol: 1, tamano: "5" });
  });

  it("guarda un cambio de cantidad de una línea", async () => {
    const user = userEvent.setup();
    api.actualizarPackLinea.mockResolvedValue({});
    render(<PackComplementos />);
    await screen.findByText("Tutor 2,4");

    const inp = screen.getByLabelText(/Cantidad por árbol de Tutor 2,4/i);
    await user.clear(inp);
    await user.type(inp, "5");
    await user.click(screen.getAllByRole("button", { name: /guardar/i })[0]);

    await waitFor(() => expect(api.actualizarPackLinea).toHaveBeenCalledWith(1, { cantidad_por_arbol: 5, tamano: "2,4" }));
  });
});
