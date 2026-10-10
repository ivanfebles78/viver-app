/**
 * ROLES Y PERMISOS — pruebas de la pantalla del editor de matriz por ayuntamiento.
 *
 * Verifica que la pantalla pinta la matriz (funcionalidades × roles), que guarda
 * un cambio de nivel con la forma correcta, y que crea un rol nuevo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const outletContext = { me: { username: "jefa", rol: "admin", permisos: { "admin.usuarios": "full" } } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getRoles: vi.fn(),
  crearRol: vi.fn(),
  actualizarRol: vi.fn(),
  eliminarRol: vi.fn(),
}));

import * as api from "../api/api";
import RolesPermisos from "./RolesPermisos";

const CATALOGO = {
  grupos: [
    { clave: "MOVIMIENTOS", etiqueta: "Movimientos" },
    { clave: "PEDIDOS", etiqueta: "Pedidos" },
  ],
  funcionalidades: [
    { clave: "movimientos.ver", grupo: "MOVIMIENTOS", etiqueta: "Ver movimientos", soporta_lectura: true, solo_superadmin: false },
    { clave: "movimientos.registrar", grupo: "MOVIMIENTOS", etiqueta: "Registrar movimiento", soporta_lectura: false, solo_superadmin: false },
    { clave: "pedidos.ver", grupo: "PEDIDOS", etiqueta: "Ver pedidos", soporta_lectura: true, solo_superadmin: false },
  ],
  niveles: ["none", "read", "full"],
  scope_flags: [
    { clave: "solo_sus_pedidos", etiqueta: "Solo ve sus propios pedidos", descripcion: "…" },
  ],
};

const rol = (id, clave, nombre, permisos, scope = {}, extra = {}) => ({
  id, clave, nombre, es_sistema: true, permisos,
  scope: { solo_sus_pedidos: false, solo_reposiciones_aprobadas: false, ocultar_internos: false, ...scope },
  usuarios_asignados: 0, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getRoles.mockResolvedValue({
    catalogo: CATALOGO,
    roles: [
      rol(1, "tecnico", "Técnico", { "movimientos.ver": "full", "movimientos.registrar": "full", "pedidos.ver": "full" }),
      rol(2, "empresa_externa", "Empresa externa", { "movimientos.ver": "none", "movimientos.registrar": "none", "pedidos.ver": "full" }, { solo_sus_pedidos: true }),
    ],
  });
});

describe("RolesPermisos", () => {
  it("pinta la matriz: funcionalidades y columnas de rol", async () => {
    render(<RolesPermisos />);
    expect(await screen.findByText("Registrar movimiento")).toBeInTheDocument();
    // nombres de rol como inputs editables
    expect(screen.getByDisplayValue("Técnico")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Empresa externa")).toBeInTheDocument();
    // casilla de alcance marcada para empresa externa
    const chk = screen.getByLabelText(/Solo ve sus propios pedidos para Empresa externa/i);
    expect(chk).toBeChecked();
  });

  it("guarda un cambio de nivel con la forma correcta", async () => {
    const user = userEvent.setup();
    api.actualizarRol.mockResolvedValue({});
    render(<RolesPermisos />);
    await screen.findByText("Registrar movimiento");

    // Cambia "Registrar movimiento" del Técnico a "No".
    const sel = screen.getByLabelText("Registrar movimiento para Técnico");
    await user.selectOptions(sel, "none");

    // El botón Guardar del Técnico se habilita y al pulsarlo manda la matriz completa.
    const guardar = screen.getAllByRole("button", { name: /guardar/i })[0];
    await user.click(guardar);

    await waitFor(() => expect(api.actualizarRol).toHaveBeenCalled());
    const [id, payload] = api.actualizarRol.mock.calls[0];
    expect(id).toBe(1);
    expect(payload.permisos["movimientos.registrar"]).toBe("none");
    expect(payload.permisos["movimientos.ver"]).toBe("full");
    expect(payload.nombre).toBe("Técnico");
  });

  it("crea un rol nuevo", async () => {
    const user = userEvent.setup();
    api.crearRol.mockResolvedValue({});
    render(<RolesPermisos />);
    await screen.findByText("Registrar movimiento");

    await user.type(screen.getByLabelText(/Nuevo rol/i), "Jardinero");
    await user.click(screen.getByRole("button", { name: /crear rol/i }));

    await waitFor(() => expect(api.crearRol).toHaveBeenCalledWith({ nombre: "Jardinero" }));
  });
});
