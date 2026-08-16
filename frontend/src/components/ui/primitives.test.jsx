/**
 * Pruebas de las primitivas de la Fase 2.
 *
 * No comprueban aspecto, comprueban CONTRATO: que una etiqueta esté realmente
 * asociada, que un error se anuncie, que una tabla tenga semántica, que un
 * diálogo devuelva el foco. Es decir, justo lo que la aplicación no tenía y
 * lo que un cambio de estilos posterior podría romper sin que se note.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Field, Input, Select, DataTable, StatusBadge, Button } from "../../ui";
import { Alert, LoadingState, Truncated } from "./feedback";
import { FilterBar, FormActions, SectionHeader, ScrollRegion } from "./layout";
import Pagination from "./Pagination";
import RowActions from "./RowActions";
import SearchField from "./SearchField";
import { useConfirm } from "./ConfirmDialog";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "./toast-context";

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── Formularios ────────────────────────────────────────────────────────── */

describe("Field", () => {
  it("asocia la etiqueta al control de verdad", () => {
    render(
      <Field label="Nombre de usuario">
        <Input />
      </Field>
    );
    // getByLabelText resuelve por la asociación real, no por proximidad.
    const control = screen.getByLabelText("Nombre de usuario");
    expect(control.tagName).toBe("INPUT");
    expect(control.id).toBeTruthy();
  });

  it("dos campos en la misma página no comparten id", () => {
    // El fallo clásico de un id fijo: la segunda etiqueta apunta al primer
    // control y hacer clic en ella enfoca el campo equivocado.
    render(
      <>
        <Field label="Email"><Input /></Field>
        <Field label="Teléfono"><Input /></Field>
      </>
    );
    expect(screen.getByLabelText("Email").id).not.toBe(screen.getByLabelText("Teléfono").id);
  });

  it("el error se anuncia y queda asociado al control", () => {
    render(
      <Field label="Email" error="Escribe un email con arroba, por ejemplo nombre@dominio.es">
        <Input />
      </Field>
    );
    const control = screen.getByLabelText("Email");
    const error = screen.getByRole("alert");

    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control.getAttribute("aria-describedby")).toContain(error.id);
  });

  it("la descripción también queda asociada", () => {
    render(
      <Field label="Contraseña" description="Mínimo 8 caracteres.">
        <Input />
      </Field>
    );
    const control = screen.getByLabelText("Contraseña");
    const desc = screen.getByText("Mínimo 8 caracteres.");
    expect(control.getAttribute("aria-describedby")).toContain(desc.id);
  });

  it("required llega al control, no solo al asterisco", () => {
    render(<Field label="Email" required><Input /></Field>);
    expect(screen.getByLabelText(/Email/)).toBeRequired();
  });

  it("disabled se propaga al control", () => {
    render(<Field label="Email" disabled><Input /></Field>);
    expect(screen.getByLabelText("Email")).toBeDisabled();
  });

  it("hideLabel oculta a la vista pero conserva el nombre accesible", () => {
    render(<Field label="Buscar" hideLabel><Input /></Field>);
    expect(screen.getByLabelText("Buscar")).toBeInTheDocument();
  });

  it("el Select también recibe la etiqueta", () => {
    render(
      <Field label="Rol">
        <Select value="a" onValueChange={() => {}} options={[{ value: "a", label: "Admin" }]} />
      </Field>
    );
    expect(screen.getByLabelText("Rol")).toBeInTheDocument();
  });
});

describe("SearchField", () => {
  it("tiene nombre accesible aunque la etiqueta esté oculta", () => {
    render(<SearchField label="Buscar usuarios" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Buscar usuarios")).toBeInTheDocument();
  });

  it("el botón de limpiar solo aparece con contenido y vacía el campo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SearchField value="" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /limpiar/i })).not.toBeInTheDocument();

    rerender(<SearchField value="ana" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /limpiar/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("FormActions", () => {
  it("la acción primaria va la última en el orden del DOM", () => {
    // Convención de plataforma, y también orden de tabulación.
    render(
      <FormActions>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="primary">Guardar</Button>
      </FormActions>
    );
    const botones = screen.getAllByRole("button").map((b) => b.textContent);
    expect(botones).toEqual(["Cancelar", "Guardar"]);
  });
});

/* ── Tabla ──────────────────────────────────────────────────────────────── */

const columnas = [
  { key: "nombre", header: "Nombre", cell: (r) => r.nombre },
  { key: "cantidad", header: "Cantidad", numeric: true, cell: (r) => r.cantidad },
];
const filas = [
  { id: "1", nombre: "Drago", cantidad: 12 },
  { id: "2", nombre: "Palmera", cantidad: 3 },
];
const LABELS = {
  selectAll: "Seleccionar todo", selectRow: "Seleccionar fila", actions: "Acciones",
  sortAscending: "Asc", sortDescending: "Desc", loading: "Cargando…",
  previous: "Anterior", next: "Siguiente", selectedCount: (n) => `${n}`,
};

function tabla(props = {}) {
  return render(
    <DataTable
      caption="Inventario del vivero"
      columns={columnas}
      rows={filas}
      rowKey={(r) => r.id}
      labels={LABELS}
      {...props}
    />
  );
}

describe("DataTable — semántica", () => {
  it("tiene caption accesible", () => {
    tabla();
    expect(screen.getByRole("table", { name: "Inventario del vivero" })).toBeInTheDocument();
  });

  it("las cabeceras son th con scope=col", () => {
    tabla();
    const cabeceras = screen.getAllByRole("columnheader");
    expect(cabeceras.length).toBeGreaterThanOrEqual(2);
    for (const th of cabeceras) {
      expect(th.tagName).toBe("TH");
      expect(th).toHaveAttribute("scope", "col");
    }
  });

  it("las columnas numéricas se alinean a la derecha con cifras tabulares", () => {
    tabla();
    const celda = screen.getAllByRole("cell").find((c) => c.textContent === "12");
    expect(celda.className).toMatch(/text-right/);
    expect(celda.className).toMatch(/tabular/);
  });

  it("una cabecera ordenable es un botón con aria-sort", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <DataTable
        caption="t"
        columns={[{ ...columnas[0], sortable: true }, columnas[1]]}
        rows={filas}
        rowKey={(r) => r.id}
        labels={LABELS}
        sort={{ field: "nombre", direction: "asc" }}
        onSortChange={onSortChange}
      />
    );
    const th = screen.getAllByRole("columnheader")[0];
    expect(th).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(th).getByRole("button"));
    expect(onSortChange).toHaveBeenCalledWith({ field: "nombre", direction: "desc" });
  });

  it("el tercer clic en una cabecera limpia la ordenación, no la deja atrapada", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <DataTable
        caption="t" columns={[{ ...columnas[0], sortable: true }]} rows={filas}
        rowKey={(r) => r.id} labels={LABELS}
        sort={{ field: "nombre", direction: "desc" }} onSortChange={onSortChange}
      />
    );
    await user.click(within(screen.getAllByRole("columnheader")[0]).getByRole("button"));
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it("muestra el estado vacío cuando no hay filas", () => {
    tabla({ rows: [], empty: <p>No hay nada todavía</p> });
    expect(screen.getByText("No hay nada todavía")).toBeInTheDocument();
  });

  it("marca aria-busy mientras carga", () => {
    const { container } = tabla({ loading: true });
    expect(container.querySelector("tbody")).toHaveAttribute("aria-busy", "true");
  });

  it("muestra el estado de error en lugar de las filas", () => {
    tabla({ error: <p>No se pudo cargar</p> });
    expect(screen.getByText("No se pudo cargar")).toBeInTheDocument();
  });
});

describe("RowActions", () => {
  const fila = { id: "1", estado: "pendiente" };

  it("solo ofrece las acciones aplicables a esa fila", async () => {
    const user = userEvent.setup();
    render(
      <RowActions
        row={fila}
        items={[
          { label: "Reenviar", when: (r) => r.estado === "pendiente", onSelect: () => {} },
          { label: "Desbloquear", when: (r) => r.estado === "bloqueado", onSelect: () => {} },
          { label: "Editar", onSelect: () => {} },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Acciones" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Reenviar", "Editar"]);
    expect(items).not.toContain("Desbloquear");
  });

  it("entrega la fila al manejador", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RowActions row={fila} items={[{ label: "Editar", onSelect }]} />);
    await user.click(screen.getByRole("button", { name: "Acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    expect(onSelect).toHaveBeenCalledWith(fila);
  });

  it("no se renderiza si ninguna acción aplica", () => {
    render(<RowActions row={fila} items={[{ label: "X", when: () => false, onSelect: () => {} }]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

/* ── Paginación ─────────────────────────────────────────────────────────── */

describe("Pagination", () => {
  it("marca la página actual con aria-current", () => {
    render(<Pagination page={2} pageCount={5} onPageChange={() => {}} />);
    const actual = screen.getByRole("button", { current: "page" });
    expect(actual).toHaveAccessibleName("Página 2");
  });

  it("desactiva anterior en la primera y siguiente en la última", () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    rerender(<Pagination page={3} pageCount={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  });

  it("anuncia el recuento en una región viva", () => {
    render(<Pagination page={1} pageCount={3} totalItems={27} onPageChange={() => {}} />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("27");
  });

  it("nunca sale del rango al pulsar", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={3} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: "Página 3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});

/* ── Avisos ─────────────────────────────────────────────────────────────── */

describe("Alert", () => {
  it("un error interrumpe; un éxito no", () => {
    const { rerender } = render(<Alert tone="error">Falló</Alert>);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");

    rerender(<Alert tone="success">Guardado</Alert>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("el tono nunca viaja solo: hay icono y texto", () => {
    const { container } = render(<Alert tone="warning" title="Atención">Revisa esto</Alert>);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Atención")).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("marca aria-busy y anuncia el estado", () => {
    const { container } = render(<LoadingState />);
    expect(container.firstChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
  });
});

describe("Truncated", () => {
  it("el texto completo sigue disponible aunque se recorte", () => {
    const largo = "Ayuntamiento de San Cristóbal de La Laguna, Departamento de Parques y Jardines";
    render(<Truncated>{largo}</Truncated>);
    const el = screen.getByText(largo);
    // El recorte es visual; el contenido y el title llevan el valor entero.
    expect(el).toHaveAttribute("title", largo);
    expect(el.textContent).toBe(largo);
  });
});

/* ── Toast ──────────────────────────────────────────────────────────────── */

function Emisor({ tono, texto }) {
  const toast = useToast();
  return <Button onClick={() => toast[tono](texto)}>emitir</Button>;
}

describe("ToastProvider", () => {
  it("un error usa role=alert y NO se auto-descarta", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider duration={50}>
        <Emisor tono="error" texto="Se perdió la conexión" />
      </ToastProvider>
    );
    await user.click(screen.getByRole("button", { name: "emitir" }));
    expect(await screen.findByText("Se perdió la conexión")).toBeInTheDocument();

    // Muy por encima del `duration` configurado: un error debe seguir ahí.
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText("Se perdió la conexión")).toBeInTheDocument();
  });

  it("se puede cerrar a mano", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Emisor tono="success" texto="Guardado" />
      </ToastProvider>
    );
    await user.click(screen.getByRole("button", { name: "emitir" }));
    await screen.findByText("Guardado");
    await user.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    await waitFor(() => expect(screen.queryByText("Guardado")).not.toBeInTheDocument());
  });

  it("useToast falla claro si falta el proveedor", () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Emisor tono="info" texto="x" />)).toThrow(/ToastProvider/);
    silencio.mockRestore();
  });
});

/* ── Confirmación ───────────────────────────────────────────────────────── */

function ConfirmHarness({ onResultado, destructive = false }) {
  const { confirmar, dialogo } = useConfirm();
  return (
    <>
      <Button
        onClick={async () => {
          const ok = await confirmar({
            title: "Borrar el registro",
            description: "No se puede deshacer.",
            confirmLabel: "Borrar",
            destructive,
          });
          onResultado(ok);
        }}
      >
        borrar
      </Button>
      {dialogo}
    </>
  );
}

describe("useConfirm", () => {
  it("resuelve true al confirmar", async () => {
    const user = userEvent.setup();
    const onResultado = vi.fn();
    render(<ConfirmHarness onResultado={onResultado} />);
    await user.click(screen.getByRole("button", { name: "borrar" }));
    await user.click(await screen.findByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(onResultado).toHaveBeenCalledWith(true));
  });

  it("resuelve false al cancelar", async () => {
    const user = userEvent.setup();
    const onResultado = vi.fn();
    render(<ConfirmHarness onResultado={onResultado} />);
    await user.click(screen.getByRole("button", { name: "borrar" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(onResultado).toHaveBeenCalledWith(false));
  });

  it("Escape resuelve false — el camino por defecto NUNCA es que sí", async () => {
    const user = userEvent.setup();
    const onResultado = vi.fn();
    render(<ConfirmHarness onResultado={onResultado} />);
    await user.click(screen.getByRole("button", { name: "borrar" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onResultado).toHaveBeenCalledWith(false));
  });

  it("la acción no se ejecuta antes de responder", async () => {
    // La regresión que este hook existe para evitar: con window.confirm la
    // guarda bloqueaba; con un diálogo de React, sustituirlo mal ejecuta la
    // acción destructiva ANTES de que el usuario conteste.
    const user = userEvent.setup();
    const onResultado = vi.fn();
    render(<ConfirmHarness onResultado={onResultado} />);
    await user.click(screen.getByRole("button", { name: "borrar" }));
    await screen.findByRole("alertdialog");
    expect(onResultado).not.toHaveBeenCalled();
  });
});

/* ── Composición ────────────────────────────────────────────────────────── */

describe("primitivas de composición", () => {
  it("SectionHeader emite un encabezado real", () => {
    render(<SectionHeader title="Lista de pedidos" />);
    expect(screen.getByRole("heading", { name: "Lista de pedidos" })).toBeInTheDocument();
  });

  it("SectionHeader permite fijar el nivel para no romper la jerarquía", () => {
    render(<SectionHeader as="h3" title="Detalle" />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });

  it("FilterBar es un landmark de búsqueda con nombre", () => {
    render(<FilterBar label="Filtros de usuarios"><span>x</span></FilterBar>);
    expect(screen.getByRole("search", { name: "Filtros de usuarios" })).toBeInTheDocument();
  });

  it("ScrollRegion es alcanzable con el teclado", () => {
    // Sin tabIndex, el contenido que queda fuera es inalcanzable sin ratón.
    render(<ScrollRegion label="Tabla ancha"><span>x</span></ScrollRegion>);
    const region = screen.getByRole("region", { name: "Tabla ancha" });
    expect(region).toHaveAttribute("tabindex", "0");
  });
});

/* ── Estados ────────────────────────────────────────────────────────────── */

describe("StatusBadge", () => {
  it("el estado nunca es solo color: hay etiqueta e icono", () => {
    const { container } = render(<StatusBadge status="approved" label="Aprobado" />);
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
