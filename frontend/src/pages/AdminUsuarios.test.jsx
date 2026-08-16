/**
 * PANTALLA PILOTO — pruebas de que la migración no cambió el comportamiento.
 *
 * La Fase 2 migró la presentación de esta pantalla a las primitivas de
 * DevCon8. Lo que se comprueba aquí es lo que NO debía cambiar: quién ve qué,
 * qué se envía al backend, en qué orden sale la lista, y que ninguna acción
 * con consecuencias ocurra sin confirmar.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  adminListUsers: vi.fn(),
  adminCreateUser: vi.fn(),
  adminUpdateUser: vi.fn(),
  adminDeleteUser: vi.fn(),
  adminResendInvitation: vi.fn(),
  adminResetPassword: vi.fn(),
  adminUnlockUser: vi.fn(),
  descargarBackup: vi.fn(),
  restaurarBackup: vi.fn(),
  adminEmailConfig: vi.fn(),
  adminEmailTest: vi.fn(),
  getClientes: vi.fn(),
};
vi.mock("../api/api", () => api);

const { ToastProvider } = await import("../components/ui/ToastProvider");
const AdminUsuarios = (await import("./AdminUsuarios")).default;

const USUARIOS = [
  { id: 1, username: "ana", email: "ana@sc.es", rol: "admin", status: "activo", cliente_nombre: "Ayuntamiento de Santa Cruz de Tenerife", failed_login_attempts: 0 },
  { id: 2, username: "luis", email: "luis@sc.es", rol: "tecnico", status: "pendiente", cliente_nombre: "Ayuntamiento de Santa Cruz de Tenerife", failed_login_attempts: 0 },
  { id: 3, username: "marta", email: "marta@sc.es", rol: "manager", status: "bloqueado", cliente_nombre: null, failed_login_attempts: 5 },
  { id: 4, username: "pedro", email: "pedro@sc.es", rol: "proveedor", status: "inactivo", cliente_nombre: "Ayuntamiento de La Laguna", failed_login_attempts: 0 },
];

function sesion({ superadmin = false } = {}) {
  window.localStorage.setItem(
    "user",
    JSON.stringify({ rol: superadmin ? "superadmin" : "admin", es_superadmin: superadmin })
  );
}

function montar() {
  return render(
    <ToastProvider>
      <AdminUsuarios />
    </ToastProvider>
  );
}

/**
 * Abre el menú de acciones de la fila indicada.
 *
 * La búsqueda se acota a la <table>: `DataTable` renderiza a la vez el modo
 * tabla (md en adelante) y el modo tarjeta (por debajo de md), y oculta uno
 * con CSS. jsdom no aplica CSS, así que sin acotar aparecen los dos.
 */
async function abrirAcciones(user, username) {
  const tabla = await screen.findByRole("table");
  const boton = within(tabla).getByRole("button", { name: `Acciones para ${username}` });
  await user.click(boton);
  return screen.findByRole("menu");
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.adminListUsers.mockResolvedValue(USUARIOS);
  api.getClientes.mockResolvedValue([
    { id: 1, nombre: "Ayuntamiento de Santa Cruz de Tenerife" },
    { id: 2, nombre: "Ayuntamiento de La Laguna" },
  ]);
});

/* ── Estructura ─────────────────────────────────────────────────────────── */

describe("estructura de la pantalla", () => {
  it("tiene un único h1 con el título de la página", async () => {
    sesion();
    montar();
    const encabezados = await screen.findAllByRole("heading", { level: 1 });
    expect(encabezados).toHaveLength(1);
    expect(encabezados[0]).toHaveTextContent("Gestión de usuarios");
  });

  it("la tabla tiene nombre accesible y cabeceras con scope", async () => {
    sesion();
    montar();
    const tabla = await screen.findByRole("table", { name: /cuentas de usuario/i });
    for (const th of within(tabla).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
  });

  it("los filtros son un landmark de búsqueda", async () => {
    sesion();
    montar();
    expect(await screen.findByRole("search", { name: "Filtros de usuarios" })).toBeInTheDocument();
  });

  it("cada control de filtro tiene etiqueta asociada", async () => {
    sesion();
    montar();
    await screen.findByRole("table");
    expect(screen.getByLabelText("Buscar")).toBeInTheDocument();
    expect(screen.getByLabelText("Rol")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
  });
});

/* ── Visibilidad por rol — lo más importante que NO debe cambiar ────────── */

describe("visibilidad de las herramientas de plataforma", () => {
  it("un admin de ayuntamiento NO ve copia de seguridad ni diagnóstico de correo", async () => {
    sesion({ superadmin: false });
    montar();
    await screen.findByRole("table");
    expect(screen.queryByText("Copia de seguridad")).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico de correo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descargar copia/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restaurar copia/ })).not.toBeInTheDocument();
  });

  it("el superadmin sí las ve", async () => {
    sesion({ superadmin: true });
    montar();
    await screen.findByRole("table");
    expect(screen.getByText("Copia de seguridad")).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico de correo")).toBeInTheDocument();
  });

  it("solo el superadmin puede asignar institución al crear un usuario", async () => {
    const user = userEvent.setup();
    sesion({ superadmin: false });
    montar();
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: /Nuevo usuario/ }));
    await screen.findByRole("dialog");
    expect(screen.queryByLabelText(/Institución/)).not.toBeInTheDocument();
  });

  it("el rol superadmin solo se ofrece a un superadmin", async () => {
    // El desplegable de Radix no se puede abrir en jsdom (aplica
    // `pointer-events: none` al resto del documento), así que se comprueba el
    // contrato en su origen: la lista de roles que recibe el formulario.
    const { rolesParaUsuario, ROLES } = await import("./AdminUsuarios.roles");
    expect(rolesParaUsuario(false).map((r) => r.value)).not.toContain("superadmin");
    expect(rolesParaUsuario(true).map((r) => r.value)).toContain("superadmin");
    // Y que la tabla de roles no ha perdido ninguno por el camino.
    expect(ROLES).toHaveLength(8);
  });
});

/* ── Orden y filtrado — lógica de negocio intacta ───────────────────────── */

describe("orden y filtrado", () => {
  it("ordena pendientes, bloqueados, activos e inactivos, en ese orden", async () => {
    sesion();
    montar();
    const tabla = await screen.findByRole("table");
    const filas = within(tabla).getAllByRole("row").slice(1); // sin la cabecera
    const nombres = filas.map((f) => within(f).getAllByRole("cell")[0].textContent);
    expect(nombres).toEqual(["luis", "marta", "ana", "pedro"]);
  });

  it("filtra por término de búsqueda sobre usuario y email", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    await user.type(screen.getByLabelText("Buscar"), "marta");
    await waitFor(() => {
      const filas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(filas).toHaveLength(1);
    });
  });

  it("filtra también por email, no solo por nombre de usuario", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    await user.type(screen.getByLabelText("Buscar"), "pedro@sc.es");
    await waitFor(() => {
      const filas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toHaveTextContent("pedro");
    });
  });

  it("muestra un estado vacío explicativo cuando el filtro no casa", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    await user.type(screen.getByLabelText("Buscar"), "zzzzz");
    // Aparece en el modo tabla y en el modo tarjeta (ambos en el DOM sin CSS),
    // y además en la barra de filtros: basta con que exista al menos uno.
    expect((await screen.findAllByText("Ningún usuario coincide con los filtros")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Limpiar filtros" }).length).toBeGreaterThan(0);
  });

  it("el recuento se anuncia en región viva", async () => {
    sesion();
    montar();
    await screen.findByRole("table");
    const estado = screen.getAllByRole("status").find((n) => /usuarios?/.test(n.textContent));
    expect(estado).toHaveAttribute("aria-live", "polite");
    expect(estado).toHaveTextContent("4");
  });
});

/* ── Acciones condicionales por estado ──────────────────────────────────── */

describe("acciones de fila según el estado de la cuenta", () => {
  it("una cuenta PENDIENTE ofrece reenviar invitación, no restablecer ni desbloquear", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    const menu = await abrirAcciones(user, "luis");
    const items = within(menu).getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toContain("Reenviar invitación");
    expect(items).not.toContain("Restablecer contraseña");
    expect(items).not.toContain("Desbloquear");
  });

  it("una cuenta ACTIVA ofrece restablecer contraseña", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    const menu = await abrirAcciones(user, "ana");
    const items = within(menu).getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toContain("Restablecer contraseña");
    expect(items).not.toContain("Desbloquear");
  });

  it("una cuenta BLOQUEADA ofrece desbloquear", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    const menu = await abrirAcciones(user, "marta");
    const items = within(menu).getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toContain("Desbloquear");
    expect(items).not.toContain("Restablecer contraseña");
  });

  it("editar y borrar están siempre disponibles", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    for (const nombre of ["ana", "luis", "marta", "pedro"]) {
      const menu = await abrirAcciones(user, nombre);
      const items = within(menu).getAllByRole("menuitem").map((i) => i.textContent);
      expect(items, nombre).toContain("Editar");
      expect(items, nombre).toContain("Borrar");
      await user.keyboard("{Escape}");
    }
  });
});

/* ── Confirmaciones — el riesgo crítico de la migración ─────────────────── */

describe("acciones con consecuencias", () => {
  it("borrar PIDE confirmación y no llama al backend hasta obtenerla", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");

    const menu = await abrirAcciones(user, "ana");
    await user.click(within(menu).getByRole("menuitem", { name: "Borrar" }));

    // El diálogo está abierto y el backend NO se ha tocado.
    await screen.findByRole("alertdialog");
    expect(api.adminDeleteUser).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Borrar definitivamente" }));
    await waitFor(() => expect(api.adminDeleteUser).toHaveBeenCalledWith(1));
  });

  it("cancelar el borrado NO borra", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");

    const menu = await abrirAcciones(user, "ana");
    await user.click(within(menu).getByRole("menuitem", { name: "Borrar" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("Escape en la confirmación NO borra", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");

    const menu = await abrirAcciones(user, "ana");
    await user.click(within(menu).getByRole("menuitem", { name: "Borrar" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("restablecer contraseña pide confirmación", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");

    const menu = await abrirAcciones(user, "ana");
    await user.click(within(menu).getByRole("menuitem", { name: "Restablecer contraseña" }));
    await screen.findByRole("alertdialog");
    expect(api.adminResetPassword).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Enviar email" }));
    await waitFor(() => expect(api.adminResetPassword).toHaveBeenCalledWith(1));
  });

  it("reenviar invitación NO pide confirmación (no tiene consecuencias)", async () => {
    // Preservar el comportamiento original importa en las dos direcciones: no
    // añadir fricción donde no la había.
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");

    const menu = await abrirAcciones(user, "luis");
    await user.click(within(menu).getByRole("menuitem", { name: "Reenviar invitación" }));
    await waitFor(() => expect(api.adminResendInvitation).toHaveBeenCalledWith(2));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("no queda ningún alert()/confirm() nativo en la pantalla", async () => {
    // Los diálogos nativos bloquean el hilo, no se pueden traducir ni estilar,
    // y rompen las pruebas de navegador.
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);

    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    const menu = await abrirAcciones(user, "ana");
    await user.click(within(menu).getByRole("menuitem", { name: "Borrar" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Borrar definitivamente" }));
    await waitFor(() => expect(api.adminDeleteUser).toHaveBeenCalled());

    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    confirmSpy.mockRestore();
  });
});

/* ── Formularios — el payload no cambia ─────────────────────────────────── */

describe("creación de usuario", () => {
  it("envía el mismo payload que antes de la migración", async () => {
    const user = userEvent.setup();
    api.adminCreateUser.mockResolvedValue({});
    sesion({ superadmin: false });
    montar();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /Nuevo usuario/ }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/Nombre de usuario/), "nuevo.user");
    await user.type(screen.getByLabelText(/^Email/), "nuevo@sc.es");
    await user.click(screen.getByRole("button", { name: /Crear y enviar invitación/ }));

    await waitFor(() =>
      expect(api.adminCreateUser).toHaveBeenCalledWith({
        username: "nuevo.user",
        email: "nuevo@sc.es",
        rol: "tecnico",
        // Sin contraseña ⇒ pendiente de activar por email. Regla de negocio.
        status: "pendiente",
      })
    );
  });

  it("rechaza un usuario de menos de 3 caracteres sin llamar al backend", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: /Nuevo usuario/ }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/Nombre de usuario/), "ab");
    await user.type(screen.getByLabelText(/^Email/), "ab@sc.es");
    await user.click(screen.getByRole("button", { name: /Crear y enviar invitación/ }));

    expect(api.adminCreateUser).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/al menos 3 caracteres/);
  });

  it("rechaza una contraseña de menos de 8 caracteres", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: /Nuevo usuario/ }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/Nombre de usuario/), "valido");
    await user.type(screen.getByLabelText(/^Email/), "v@sc.es");
    await user.type(screen.getByLabelText(/Contraseña/), "corta");
    await user.click(screen.getByRole("button", { name: /Crear usuario/ }));

    expect(api.adminCreateUser).not.toHaveBeenCalled();
  });
});

/* ── Diálogos ───────────────────────────────────────────────────────────── */

describe("diálogos", () => {
  it("el diálogo de nuevo usuario tiene título accesible y devuelve el foco", async () => {
    const user = userEvent.setup();
    sesion();
    montar();
    await screen.findByRole("table");

    const disparador = screen.getByRole("button", { name: /Nuevo usuario/ });
    await user.click(disparador);
    expect(await screen.findByRole("dialog", { name: "Nuevo usuario" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Radix devuelve el foco de forma asíncrona tras desmontar el diálogo, así
    // que se espera al foco en lugar de asumir que ya ha ocurrido.
    await waitFor(() => expect(disparador).toHaveFocus());
  });
});
