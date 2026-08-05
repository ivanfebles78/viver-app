// Generador del anexo de la Guía de Usuario de ViverApp
// Cubre las funcionalidades añadidas tras la primera versión:
//   - Gestión completa de usuarios (alta, edición, borrado, filtros, paginado)
//   - Reset de password, desbloqueo, reenvío de invitación
//   - Activación de cuenta por email (flujo del usuario invitado)
//   - "Olvidé mi contraseña" desde el login
//   - Política de seguridad de cuentas (bloqueos, tokens 24h, etc.)
//   - Configuración técnica de email (Brevo)
//   - FAQ ampliado y troubleshooting de deliverability
//
// Output: Addendum_Gestion_Usuarios.docx

const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  LevelFormat,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  PageBreak,
  HeadingLevel,
  TabStopType,
  TabStopPosition,
} = require("docx");

// =====================================================
// CONFIG (igual que la guía principal, para consistencia visual)
// =====================================================
const COLORS = {
  primary: "0F5132",
  primaryDark: "10231A",
  primaryLight: "166534",
  accent: "F59E0B",
  yellowBg: "FEF3C7",
  yellowBorder: "FBBF24",
  greenBg: "DCFCE7",
  greenBorder: "16A34A",
  redBg: "FEE2E2",
  redBorder: "DC2626",
  blueBg: "DBEAFE",
  blueBorder: "2563EB",
  greyBg: "F5F5F4",
  greyBorder: "D6D3D1",
  textMuted: "5F6F66",
  white: "FFFFFF",
  tableHeaderBg: "0F5132",
  tableAltBg: "F8FAF7",
  border: "CCCCCC",
};

const PAGE = {
  width: 12240,
  height: 15840,
  margin: 1440,
  contentWidth: 12240 - 2880,
};

// =====================================================
// HELPERS (mismos que la guía principal)
// =====================================================
const text = (str, opts = {}) => new TextRun({ text: str, ...opts });
const bold = (str, opts = {}) => new TextRun({ text: str, bold: true, ...opts });

const h1 = (str) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: str })],
  });

const h2 = (str) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: str })],
  });

const h3 = (str) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text: str })],
  });

const p = (str, opts = {}) =>
  new Paragraph({
    children: [new TextRun({ text: str, ...opts })],
    spacing: { before: 80, after: 80, line: 300 },
  });

const pRich = (children, opts = {}) =>
  new Paragraph({
    children,
    spacing: { before: 80, after: 80, line: 300 },
    ...opts,
  });

const spacer = (size = 120) =>
  new Paragraph({ children: [new TextRun("")], spacing: { before: size, after: size } });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const bullet = (str) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text: str })],
    spacing: { before: 40, after: 40, line: 280 },
  });

const bulletRich = (children) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children,
    spacing: { before: 40, after: 40, line: 280 },
  });

const numbered = (str) =>
  new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    children: [new TextRun({ text: str })],
    spacing: { before: 40, after: 40, line: 280 },
  });

const numberedRich = (children) =>
  new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    children,
    spacing: { before: 40, after: 40, line: 280 },
  });

// Callout box
const callout = (icon, title, paragraphs, bgColor, borderColor) => {
  const children = [
    new Paragraph({
      children: [
        new TextRun({ text: `${icon}  `, size: 24, bold: true }),
        new TextRun({ text: title, bold: true, size: 24, color: borderColor }),
      ],
      spacing: { before: 0, after: 80 },
    }),
    ...paragraphs.map((str) =>
      typeof str === "string"
        ? new Paragraph({
            children: [new TextRun({ text: str, size: 22 })],
            spacing: { before: 0, after: 40, line: 280 },
          })
        : str
    ),
  ];
  return new Table({
    width: { size: PAGE.contentWidth, type: WidthType.DXA },
    columnWidths: [PAGE.contentWidth],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: PAGE.contentWidth, type: WidthType.DXA },
            shading: { fill: bgColor, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
              left: { style: BorderStyle.SINGLE, size: 16, color: borderColor },
              right: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
            },
            margins: { top: 160, bottom: 160, left: 240, right: 240 },
            children,
          }),
        ],
      }),
    ],
  });
};

const tip = (title, content) =>
  callout("💡", title, Array.isArray(content) ? content : [content], COLORS.yellowBg, "92400E");

const warning = (title, content) =>
  callout("⚠️", title, Array.isArray(content) ? content : [content], COLORS.redBg, "991B1B");

const success = (title, content) =>
  callout("🚀", title, Array.isArray(content) ? content : [content], COLORS.greenBg, "166534");

const info = (title, content) =>
  callout("ℹ️", title, Array.isArray(content) ? content : [content], COLORS.blueBg, "1E40AF");

// Image placeholder
const imagePlaceholder = (label, description) => {
  return new Table({
    width: { size: PAGE.contentWidth, type: WidthType.DXA },
    columnWidths: [PAGE.contentWidth],
    rows: [
      new TableRow({
        height: { value: 2200, rule: "atLeast" },
        children: [
          new TableCell({
            width: { size: PAGE.contentWidth, type: WidthType.DXA },
            shading: { fill: "F8FAF7", type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.DASHED, size: 8, color: "94A3B8" },
              bottom: { style: BorderStyle.DASHED, size: 8, color: "94A3B8" },
              left: { style: BorderStyle.DASHED, size: 8, color: "94A3B8" },
              right: { style: BorderStyle.DASHED, size: 8, color: "94A3B8" },
            },
            margins: { top: 200, bottom: 200, left: 240, right: 240 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "🖼  ", size: 28 }),
                  new TextRun({ text: `[Insertar imagen: ${label}]`, bold: true, size: 24, color: "475569" }),
                ],
                spacing: { before: 40, after: 80 },
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: description, italics: true, size: 20, color: "64748B" })],
                spacing: { before: 40, after: 40 },
              }),
            ],
          }),
        ],
      }),
    ],
  });
};

// Table cell helpers
const cell = (str, opts = {}) => {
  const {
    width,
    bold: isBold = false,
    align = AlignmentType.LEFT,
    bgColor,
    color,
    size = 20,
    valign = VerticalAlign.CENTER,
  } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: bgColor ? { fill: bgColor, type: ShadingType.CLEAR } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
    },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: valign,
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text: str, bold: isBold, color, size })],
      }),
    ],
  });
};

const headerCell = (str, width) =>
  cell(str, {
    width,
    bold: true,
    align: AlignmentType.CENTER,
    bgColor: COLORS.tableHeaderBg,
    color: COLORS.white,
    size: 22,
  });

// Diagram block: a state in a horizontal flow.
const stateBlock = (label, sublabel, bg, border, color, width) => {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: bg, type: ShadingType.CLEAR },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: border },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: border },
      left: { style: BorderStyle.SINGLE, size: 8, color: border },
      right: { style: BorderStyle.SINGLE, size: 8, color: border },
    },
    margins: { top: 140, bottom: 140, left: 60, right: 60 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: label, bold: true, size: 22, color })],
      }),
      sublabel
        ? new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: sublabel, italics: true, size: 16, color: "475569" })],
            spacing: { before: 40, after: 0 },
          })
        : new Paragraph({ children: [new TextRun("")] }),
    ],
  });
};

const arrowCell = (label, width) => {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "→", size: 36, color: COLORS.primary, bold: true })],
      }),
      label
        ? new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: label, italics: true, size: 14, color: "64748B" })],
          })
        : new Paragraph({ children: [new TextRun("")] }),
    ],
  });
};

// =====================================================
// CONTENT
// =====================================================

function intro() {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Anexo · Gestión de usuarios y onboarding por email",
          bold: true,
          size: 44,
          color: COLORS.primary,
        }),
      ],
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Versión 1.1 · Mayo 2026",
          italics: true,
          size: 22,
          color: COLORS.textMuted,
        }),
      ],
      spacing: { before: 0, after: 400 },
    }),
    p(
      "Este anexo documenta las funcionalidades incorporadas a ViverApp tras la primera versión de la guía: gestión avanzada de usuarios, onboarding por email, política de seguridad de cuentas y configuración del envío de correos transaccionales."
    ),
    spacer(120),
    info("Cómo usar este anexo", [
      "Las secciones siguen la numeración de la guía principal: extienden los módulos 2, 4 y 6, y añaden un nuevo apéndice técnico al final. Los placeholders de imagen indican dónde sustituir por capturas reales del sistema.",
    ]),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 1. Estados de usuario y diagrama de ciclo de vida
// -------------------------------------------------
function ciclos() {
  return [
    h1("A1. Ciclo de vida de un usuario"),
    p(
      "Un usuario en ViverApp pasa por uno de cuatro estados a lo largo de su vida en el sistema. El estado determina si puede iniciar sesión y qué acciones puede realizar el administrador sobre su cuenta."
    ),
    spacer(120),

    h2("Estados disponibles"),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [1700, 4660, 3000],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Estado", 1700),
            headerCell("Significado", 4660),
            headerCell("¿Puede entrar?", 3000),
          ],
        }),
        new TableRow({
          children: [
            cell("Pendiente", { width: 1700, bold: true, bgColor: COLORS.yellowBg, color: "92400E" }),
            cell(
              "El admin ha creado la cuenta pero el usuario aún no ha activado su contraseña desde el email recibido.",
              { width: 4660 }
            ),
            cell("No", { width: 3000, align: AlignmentType.CENTER, bold: true, color: "991B1B" }),
          ],
        }),
        new TableRow({
          children: [
            cell("Activo", { width: 1700, bold: true, bgColor: COLORS.greenBg, color: "166534" }),
            cell("Cuenta plenamente operativa. El usuario puede iniciar sesión y operar según su rol.", {
              width: 4660,
            }),
            cell("Sí", { width: 3000, align: AlignmentType.CENTER, bold: true, color: "166534" }),
          ],
        }),
        new TableRow({
          children: [
            cell("Bloqueado", { width: 1700, bold: true, bgColor: COLORS.redBg, color: "991B1B" }),
            cell(
              "Bloqueada automáticamente tras 3 intentos de login fallidos consecutivos. Requiere acción del administrador para reactivarse.",
              { width: 4660 }
            ),
            cell("No", { width: 3000, align: AlignmentType.CENTER, bold: true, color: "991B1B" }),
          ],
        }),
        new TableRow({
          children: [
            cell("Inactivo", { width: 1700, bold: true, bgColor: COLORS.greyBg, color: "475569" }),
            cell(
              "Acceso revocado por el administrador. Conserva todo su histórico de acciones pasadas. Sustituye a un “borrado lógico”.",
              { width: 4660 }
            ),
            cell("No", { width: 3000, align: AlignmentType.CENTER, bold: true, color: "991B1B" }),
          ],
        }),
      ],
    }),
    spacer(200),

    h2("Diagrama de transiciones"),
    p("Estas son las transiciones posibles entre estados y qué las desencadena:"),
    spacer(80),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [2100, 800, 2100, 800, 2100, 1460],
      rows: [
        new TableRow({
          children: [
            stateBlock("Pendiente", "Recién creado", COLORS.yellowBg, COLORS.yellowBorder, "92400E", 2100),
            arrowCell("activación", 800),
            stateBlock("Activo", "Operativo", COLORS.greenBg, COLORS.greenBorder, "166534", 2100),
            arrowCell("3 fallos", 800),
            stateBlock("Bloqueado", "Auto-lock", COLORS.redBg, COLORS.redBorder, "991B1B", 2100),
            stateBlock("Inactivo", "Acceso revocado", COLORS.greyBg, COLORS.greyBorder, "475569", 1460),
          ],
        }),
      ],
    }),
    spacer(160),

    info("Transiciones manuales (admin)", [
      "Desde el módulo Usuarios, el administrador puede mover a un usuario a cualquier estado mediante Editar. Los cambios entran en vigor inmediatamente: si pasa a Activo, el contador de fallos se resetea a 0.",
    ]),
    spacer(120),

    h2("Reglas de negocio aplicadas"),
    bullet(
      "El sistema NO permite quitar el rol de admin al último administrador activo (evita que el sistema se quede sin administradores)."
    ),
    bullet(
      "El sistema NO permite borrar al último administrador activo, ni borrarte a ti mismo desde tu propia cuenta."
    ),
    bullet(
      "Pasar de Activo a Inactivo se considera el equivalente seguro a “borrar” un usuario: conserva la trazabilidad de movimientos y pedidos pasados."
    ),
    bullet(
      "Tras un cambio manual a Activo o Inactivo, el contador de intentos fallidos vuelve a 0 automáticamente."
    ),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 2. Gestión de usuarios — operaciones del admin
// -------------------------------------------------
function gestionUsuarios() {
  return [
    h1("A2. Gestión de usuarios (panel admin)"),
    p(
      "El módulo Usuarios es accesible solo para el rol Administrador a través del botón verde “Usuarios” situado en la cabecera, junto a la campana de notificaciones."
    ),
    spacer(120),
    imagePlaceholder(
      "Botón Usuarios en la cabecera",
      "Captura de la cabecera con los botones “Usuarios” (verde) y la campana de alertas, mostrando que ambos coexisten en la barra superior."
    ),
    spacer(160),

    h2("Vista general del módulo"),
    p(
      "Al entrar verás un listado paginado con todos los usuarios y, encima, una barra de filtros y el botón “Nuevo usuario”."
    ),
    bulletRich([bold("Cabecera: "), text("título de la sección y botón verde “+ Nuevo usuario” a la derecha.")]),
    bulletRich([bold("Barra de filtros: "), text("búsqueda por nombre/email + selector de rol + selector de estado.")]),
    bulletRich([
      bold("Tabla: "),
      text("Usuario · Email · Rol · Estado · Fallos · Acciones. Se muestran 10 usuarios por página."),
    ]),
    bulletRich([
      bold("Paginado: "),
      text("controles Anterior / 1 2 3 / Siguiente debajo de la tabla cuando hay más de 10 usuarios."),
    ]),
    spacer(160),
    imagePlaceholder(
      "Pantalla principal de Gestión de usuarios",
      "Captura del listado completo: barra de filtros (con búsqueda, rol y estado), tabla con badges de color por estado, y controles de paginado al pie."
    ),
    spacer(160),

    h3("A2.1 Crear un usuario nuevo"),
    p(
      "El admin define solo cuatro datos. La contraseña la fija el propio usuario al activar su cuenta — el admin nunca la conoce."
    ),
    numbered("Pulsa el botón verde “+ Nuevo usuario” en la esquina superior derecha."),
    numbered("Rellena: Username (mínimo 3 caracteres y único en el sistema)."),
    numbered("Rellena: Email (válido y único). Llegará la invitación a esta dirección."),
    numbered("Selecciona Rol: Administrador, Manager, Gestor de vivero, Técnico o Empresa externa."),
    numbered("Pulsa “Crear y enviar invitación”."),
    numbered(
      "El usuario queda en estado Pendiente y recibe automáticamente un email con asunto “ViverApp · Activa tu cuenta”."
    ),
    spacer(120),
    imagePlaceholder(
      "Modal de Nuevo usuario",
      "Captura del modal con los campos Username, Email, Rol y los botones Cancelar / Crear y enviar invitación."
    ),
    spacer(120),
    tip("Convención de username", [
      "Mantén un patrón consistente para el username (por ejemplo, primera letra del nombre + apellido: `mgomez`, `apovgon`). Facilita el autocompletado y la legibilidad de los logs.",
    ]),
    spacer(120),

    h3("A2.2 Editar un usuario"),
    p("Pulsa el botón “Editar” en la fila correspondiente. Puedes modificar tres campos:"),
    bullet("Email: cualquier dirección válida. Debe ser única en el sistema."),
    bullet("Rol: cualquiera de los cinco disponibles, sujeto a la regla del último admin."),
    bullet("Estado: Activo / Inactivo / Pendiente / Bloqueado. Útil para revocar accesos puntualmente."),
    spacer(120),
    warning("Cambiar el email no manda email", [
      "Editar el email NO dispara una nueva invitación. Si necesitas que el usuario reciba un email a la nueva dirección (por ejemplo, porque se confundió al darlo de alta), edita el email primero y luego usa “Reenviar invitación” o “Reset password”.",
    ]),
    spacer(160),
    imagePlaceholder(
      "Modal de Editar usuario",
      "Captura del modal con los campos Email, Rol y Estado, y los botones Cancelar / Guardar cambios."
    ),
    spacer(160),

    h3("A2.3 Reset de contraseña (Reset password)"),
    p(
      "Disponible para usuarios en estado Activo. Genera un enlace seguro que se envía por email. La contraseña anterior queda invalidada en el momento en que el usuario complete el reset."
    ),
    numbered("Localiza al usuario en la lista (filtra por estado “Activo” si te ayuda)."),
    numbered("Pulsa el botón “Reset password” en su fila."),
    numbered("Confirma la acción en el diálogo."),
    numbered("El sistema genera un token único de 24 horas y envía el email con asunto “Reset Password”."),
    spacer(120),
    info("Por qué se usa email y no se asigna desde el panel", [
      "El admin nunca ve ni define la contraseña del usuario. Toda contraseña la fija el propio interesado siguiendo el enlace seguro. Esto cumple buenas prácticas de seguridad y evita que el admin pueda hacerse pasar por otro usuario.",
    ]),
    spacer(120),

    h3("A2.4 Desbloquear una cuenta"),
    p(
      "Cuando un usuario falla 3 veces el login, el sistema lo bloquea automáticamente. Para reactivarlo, el admin tiene un botón específico:"
    ),
    numbered("Filtra por estado “Bloqueado” en la barra de filtros."),
    numbered("Localiza al usuario y pulsa el botón ámbar “Desbloquear”."),
    numbered("Confirma la acción."),
    numbered("Llega un email al usuario con asunto “Desbloqueo de cuenta”."),
    numbered(
      "Al pulsar el enlace y definir una nueva contraseña, su estado vuelve automáticamente a Activo y el contador de fallos a 0."
    ),
    spacer(120),
    success("Doble efecto del desbloqueo", [
      "El desbloqueo no solo reactiva la cuenta: también obliga a definir una contraseña nueva. Esto es deliberado — si la cuenta se bloqueó es porque alguien intentó acceder sin éxito, así que renovar la contraseña es la respuesta segura.",
    ]),
    spacer(120),

    h3("A2.5 Reenviar invitación"),
    p(
      "Disponible solo para usuarios en estado Pendiente. Útil cuando el primer email no llegó (por filtros, por error en la dirección, etc.) o cuando el token de 24h ha caducado."
    ),
    numbered("Filtra por estado “Pendiente”."),
    numbered("Pulsa el botón “Reenviar invitación”."),
    numbered("Se invalida el token anterior y se genera uno nuevo, también de 24h."),
    numbered("El email vuelve a salir."),
    spacer(120),

    h3("A2.6 Borrar un usuario"),
    p(
      "Disponible en cualquier estado. Esta acción es irreversible: elimina permanentemente al usuario y todos sus tokens pendientes. El histórico de movimientos y pedidos queda con el username “huérfano” como string."
    ),
    numbered("Localiza al usuario en la lista."),
    numbered("Pulsa el botón rojo “Borrar”."),
    numbered("El sistema muestra una confirmación con un texto claro de irreversibilidad."),
    numbered("Si confirmas, el usuario desaparece del listado."),
    spacer(120),
    warning("Solo para limpieza de pruebas", [
      "Para usuarios reales que dejen el ayuntamiento, usa siempre Inactivo en lugar de Borrar. Inactivo revoca el acceso pero conserva la trazabilidad histórica. Borrar solo tiene sentido para usuarios de prueba o duplicados.",
    ]),
    spacer(120),
    warning("El sistema bloquea ciertos borrados", [
      "No puedes borrarte a ti mismo, ni borrar al último administrador activo. En esos casos verás un mensaje de error específico y la operación no se realiza.",
    ]),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 3. Filtros, búsqueda y paginado
// -------------------------------------------------
function filtros() {
  return [
    h1("A3. Filtros, búsqueda y paginado"),
    p(
      "El listado de usuarios incluye una barra de filtros que se aplican simultáneamente con AND lógico (búsqueda + rol + estado)."
    ),
    spacer(120),

    h2("Búsqueda libre"),
    p(
      "Escribe en el campo con icono 🔍 cualquier fragmento del username o del email. La búsqueda no distingue mayúsculas y filtra en vivo según vas escribiendo."
    ),
    bulletRich([
      bold("Ejemplo: "),
      text("escribir “gomez” muestra a todos los usuarios cuyo username o email contenga esa cadena."),
    ]),
    spacer(120),

    h2("Filtro por rol y estado"),
    p(
      "Los dos selectores permiten acotar al listado de usuarios por rol o por estado. La opción “Todos los roles / Todos los estados” desactiva el filtro correspondiente."
    ),
    bulletRich([
      bold("Caso típico: "),
      text("filtrar por estado “Pendiente” para ver de un vistazo qué cuentas aún no se han activado y reenviar las invitaciones que haga falta."),
    ]),
    bulletRich([
      bold("Caso típico: "),
      text("filtrar por estado “Bloqueado” para revisar qué usuarios necesitan intervención del admin."),
    ]),
    spacer(120),

    h2("Limpiar filtros"),
    p(
      "Cuando hay al menos un filtro activo, aparece un botón “Limpiar filtros” que los desactiva todos en un solo clic. A su derecha, un contador muestra cuántos resultados hay tras aplicar los filtros (por ejemplo, “3 de 12 usuarios”)."
    ),
    spacer(120),

    h2("Paginado"),
    p("Si la lista filtrada tiene más de 10 usuarios aparecen los controles de paginación bajo la tabla:"),
    bullet("← Anterior  ·  números de página  ·  Siguiente →"),
    bullet("La página actual queda destacada en verde."),
    bullet("El texto “Mostrando 1–10 de 23” a la izquierda indica el rango visible."),
    bullet("Al cambiar cualquier filtro, vuelves automáticamente a la página 1."),
    spacer(160),
    imagePlaceholder(
      "Filtros activos y paginado en la lista de usuarios",
      "Captura mostrando la barra de filtros con búsqueda, rol y estado seleccionados, badge “2 de 23 usuarios”, y los controles de paginación al pie."
    ),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 4. Onboarding por email — perspectiva del usuario
// -------------------------------------------------
function onboarding() {
  return [
    h1("A4. Onboarding por email — vista del usuario"),
    p(
      "Cuando un administrador da de alta a un usuario, este recibe automáticamente un email de invitación. Este apartado documenta lo que ve el usuario invitado durante todo el proceso."
    ),
    spacer(120),

    h2("Diagrama del flujo de activación"),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [1900, 600, 1900, 600, 1900, 600, 1860],
      rows: [
        new TableRow({
          children: [
            stateBlock("Admin crea usuario", "estado Pendiente", COLORS.blueBg, COLORS.blueBorder, "1E40AF", 1900),
            arrowCell(null, 600),
            stateBlock("Sistema envía email", "asunto “Activa tu cuenta”", COLORS.yellowBg, COLORS.yellowBorder, "92400E", 1900),
            arrowCell(null, 600),
            stateBlock("Usuario pulsa botón", "página de activación", COLORS.greenBg, COLORS.greenBorder, "166534", 1900),
            arrowCell(null, 600),
            stateBlock("Define password", "cuenta Activa", COLORS.primary === "0F5132" ? "DCFCE7" : "DCFCE7", "166534", "166534", 1860),
          ],
        }),
      ],
    }),
    spacer(200),

    h2("A4.1 El email de invitación"),
    p(
      "El usuario recibe un email con remitente “ViverApp” y asunto “ViverApp · Activa tu cuenta”. El cuerpo del email es transaccional: identifica al usuario por su username y contiene un único botón verde “Activar cuenta”."
    ),
    bullet("Asunto: “ViverApp · Activa tu cuenta”."),
    bullet("Remitente: ViverApp (configurado a través de Brevo)."),
    bullet("Cuerpo: explicación breve + botón único + enlace de respaldo en texto plano."),
    bullet("Pie: aviso de caducidad de 24 horas y de uso único del enlace."),
    spacer(160),
    imagePlaceholder(
      "Email de invitación recibido",
      "Captura del email tal como lo ve el usuario en su buzón: cabecera verde con logo ViverApp, mensaje breve y botón “Activar cuenta”."
    ),
    spacer(160),

    h2("A4.2 La pantalla de activación"),
    p(
      "Al pulsar “Activar cuenta”, el usuario llega a una página dedicada (no requiere haber iniciado sesión). El sistema valida automáticamente el enlace y muestra uno de dos resultados:"
    ),
    spacer(80),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [3200, 6160],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [headerCell("Resultado", 3200), headerCell("Qué ve el usuario", 6160)],
        }),
        new TableRow({
          children: [
            cell("Enlace válido ✓", { width: 3200, bold: true, bgColor: COLORS.greenBg, color: "166534" }),
            cell(
              "Pantalla de bienvenida con su username precargado, dos campos para definir y confirmar contraseña, y un botón “Activar cuenta” verde.",
              { width: 6160 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("Enlace inválido ✗", { width: 3200, bold: true, bgColor: COLORS.redBg, color: "991B1B" }),
            cell(
              "Pantalla de error con el motivo concreto: caducado, ya usado o malformado. Un botón conduce de vuelta al login. El usuario debe pedir al administrador una nueva invitación.",
              { width: 6160 }
            ),
          ],
        }),
      ],
    }),
    spacer(160),
    imagePlaceholder(
      "Pantalla de activación válida",
      "Captura de la página /activar con el formulario para definir contraseña, indicador de fortaleza y botón verde de envío."
    ),
    spacer(160),

    h2("A4.3 Requisitos de la contraseña"),
    bullet("Mínimo 8 caracteres."),
    bullet("Sin máximo razonable (hasta 200 caracteres)."),
    bullet("Recomendable: mezcla de mayúsculas, minúsculas, números y al menos un símbolo."),
    bullet("Debe coincidir con el campo “Confirma la contraseña”."),
    spacer(120),

    h2("A4.4 Tras activar"),
    p(
      "Cuando el usuario envía la nueva contraseña, el sistema realiza tres acciones de forma atómica: hashea y guarda la contraseña, marca el token como usado e inactiva el enlace para futuros intentos, y cambia el estado del usuario de Pendiente a Activo. Acto seguido lo redirige al login."
    ),
    success("Trazabilidad", [
      "Desde el momento en que el usuario activa, su cuenta queda con un timestamp updated_at en BD. El admin puede verificar en el panel de Usuarios que ha pasado de Pendiente a Activo.",
    ]),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 5. Reset de contraseña self-service
// -------------------------------------------------
function selfServiceReset() {
  return [
    h1("A5. “Olvidé mi contraseña” — desde el login"),
    p(
      "Además del reset que puede iniciar el admin desde su panel, el propio usuario puede solicitar un reset desde la pantalla de login si ha olvidado su contraseña."
    ),
    spacer(120),

    h2("Cómo solicitarlo"),
    numbered("En la pantalla de login, pulsa el enlace verde “¿Olvidaste tu contraseña?” bajo el botón Entrar."),
    numbered("Se abre un modal pidiendo Username y Email."),
    numbered("Introduce ambos datos exactamente como están registrados en el sistema."),
    numbered("Pulsa “Enviar enlace”."),
    numbered("Verás siempre la misma pantalla de confirmación, sea cual sea el resultado."),
    spacer(120),
    imagePlaceholder(
      "Modal de “¿Olvidaste tu contraseña?”",
      "Captura del modal con los campos Usuario y Email, y los botones Cancelar / Enviar enlace."
    ),
    spacer(160),

    h2("Por qué la confirmación es siempre la misma"),
    p(
      "Aunque introduzcas datos incorrectos, el sistema responde con el mismo mensaje genérico: “Si los datos coinciden con una cuenta válida, recibirás un email con instrucciones”. Esto es deliberado:"
    ),
    bulletRich([
      bold("Evita user enumeration: "),
      text(
        "un atacante podría usar el endpoint para descubrir qué usernames y emails existen en el sistema si la respuesta cambiara según el resultado. La respuesta uniforme cierra esa fuga."
      ),
    ]),
    bulletRich([
      bold("Comportamiento real: "),
      text(
        "internamente, si los datos coinciden con un usuario en estado Activo o Bloqueado, se genera un token y se envía el email. Si no coinciden, no pasa nada. El frontend nunca lo distingue."
      ),
    ]),
    spacer(120),
    info("Estados que no admiten self-service", [
      "Solo se procesan solicitudes para usuarios Activos o Bloqueados. Usuarios Pendientes (que aún no han activado) o Inactivos (revocados) no reciben email aunque introduzcan datos correctos. En esos casos hay que contactar con el admin.",
    ]),
    spacer(120),

    h2("Tras pulsar el enlace del email"),
    p(
      "El flujo es idéntico al de activación: pantalla con dos campos para definir nueva contraseña, validación automática del enlace, y al guardar quedas redirigido al login."
    ),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 6. Política de seguridad de cuentas
// -------------------------------------------------
function seguridad() {
  return [
    h1("A6. Política de seguridad de cuentas"),
    p(
      "Esta sección recoge los controles de seguridad que actúan sobre las cuentas de usuario. Es información útil tanto para administradores como para auditores."
    ),
    spacer(120),

    h2("A6.1 Bloqueo automático tras 3 fallos"),
    p("La constante MAX_FAILED_LOGIN_ATTEMPTS está fijada en 3."),
    bullet("Cada intento fallido incrementa el contador failed_login_attempts del usuario."),
    bullet("Al alcanzar 3, el sistema cambia su estado a Bloqueado. El siguiente intento devuelve un mensaje específico."),
    bullet("Un login correcto resetea el contador a 0 automáticamente."),
    bullet("El admin puede liberar el bloqueo con el botón Desbloquear, que adicionalmente fuerza una nueva contraseña."),
    spacer(120),

    h2("A6.2 Tokens de un solo uso con caducidad"),
    p(
      "Cualquier acción que requiera definir una contraseña (activación, reset, desbloqueo) usa un token con las siguientes propiedades:"
    ),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [3000, 6360],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [headerCell("Propiedad", 3000), headerCell("Implementación", 6360)],
        }),
        new TableRow({
          children: [
            cell("Entropía", { width: 3000, bold: true, bgColor: COLORS.greyBg }),
            cell("256 bits aleatorios (secrets.token_urlsafe(32) en Python).", { width: 6360 }),
          ],
        }),
        new TableRow({
          children: [
            cell("Almacenamiento", { width: 3000, bold: true, bgColor: COLORS.greyBg }),
            cell(
              "En base de datos solo se guarda el SHA-256 del token. El token en claro nunca se persiste; solo viaja al usuario por email.",
              { width: 6360 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("Comparación", { width: 3000, bold: true, bgColor: COLORS.greyBg }),
            cell("Constant-time (secrets.compare_digest) para evitar timing attacks.", { width: 6360 }),
          ],
        }),
        new TableRow({
          children: [
            cell("Caducidad", { width: 3000, bold: true, bgColor: COLORS.greyBg }),
            cell("24 horas desde su emisión. Pasado ese plazo el enlace no funciona.", { width: 6360 }),
          ],
        }),
        new TableRow({
          children: [
            cell("Uso único", { width: 3000, bold: true, bgColor: COLORS.greyBg }),
            cell(
              "Al consumirse se marca el campo used_at antes de aplicar el cambio. Cualquier reintento posterior con el mismo enlace falla.",
              { width: 6360 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("Aislamiento", { width: 3000, bold: true, bgColor: COLORS.greyBg }),
            cell(
              "Estos tokens no sirven para iniciar sesión: van por endpoints distintos a los de autenticación.",
              { width: 6360 }
            ),
          ],
        }),
      ],
    }),
    spacer(160),

    h2("A6.3 Hash de contraseña"),
    p("Las contraseñas se almacenan con bcrypt vía la librería passlib. La verificación es constant-time."),
    spacer(120),

    h2("A6.4 Seguridad del flujo “Olvidé mi contraseña”"),
    bullet("El endpoint público devuelve siempre la misma respuesta independientemente del resultado."),
    bullet("No hay información en logs sobre el éxito o fracaso por usuario en respuestas al cliente."),
    bullet("Los datos requeridos (username + email) deben coincidir simultáneamente; un solo dato no basta."),
    spacer(120),

    h2("A6.5 Salvaguardas para la cuenta de administración"),
    bullet("No se puede quitar el rol admin al último administrador activo."),
    bullet("No se puede desactivar al último administrador activo."),
    bullet("No se puede borrar al último administrador activo."),
    bullet("No te puedes borrar a ti mismo desde tu propia sesión."),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 7. Configuración del envío de emails (Annex técnico)
// -------------------------------------------------
function emailConfig() {
  return [
    h1("A7. Apéndice técnico — Configuración de email"),
    p(
      "Esta sección está dirigida exclusivamente al responsable técnico del despliegue. Resume cómo se envían los emails transaccionales (invitación, reset, desbloqueo) y cómo cambiar el proveedor o configurar un dominio propio."
    ),
    spacer(120),

    h2("A7.1 Variables de entorno relevantes"),
    p(
      "El comportamiento del envío de email se controla mediante variables de entorno definidas en Railway, en el servicio backend. No hay nada en el código que requiera modificación para cambiar de proveedor."
    ),
    spacer(80),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [2400, 6960],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [headerCell("Variable", 2400), headerCell("Descripción y valores típicos", 6960)],
        }),
        new TableRow({
          children: [
            cell("FRONTEND_URL", { width: 2400, bold: true, bgColor: COLORS.greyBg }),
            cell(
              "URL pública del frontend. Se usa para construir los enlaces de los emails (ej. https://...railway.app/activar/TOKEN).",
              { width: 6960 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("EMAIL_DRIVER", { width: 2400, bold: true, bgColor: COLORS.greyBg }),
            cell(
              "Proveedor activo: 'console' (logs en Railway, sin envío real), 'resend' o 'brevo'. Cambiar este valor cambia el proveedor sin redeploy de código.",
              { width: 6960 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("EMAIL_FROM", { width: 2400, bold: true, bgColor: COLORS.greyBg }),
            cell(
              "Remitente con formato 'ViverApp <noreply@dominio.es>'. Para Brevo en modo onboarding: 'ViverApp <ivan.febles@gmail.com>' (debe ser un email verificado).",
              { width: 6960 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("BREVO_API_KEY", { width: 2400, bold: true, bgColor: COLORS.greyBg }),
            cell("API Key REST v3 de Brevo, formato 'xkeysib-…'. Solo necesaria si EMAIL_DRIVER=brevo.", { width: 6960 }),
          ],
        }),
        new TableRow({
          children: [
            cell("RESEND_API_KEY", { width: 2400, bold: true, bgColor: COLORS.greyBg }),
            cell("API Key de Resend, formato 're_…'. Solo necesaria si EMAIL_DRIVER=resend.", { width: 6960 }),
          ],
        }),
      ],
    }),
    spacer(200),

    h2("A7.2 Drivers soportados"),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [1700, 3700, 3960],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Driver", 1700),
            headerCell("Cuándo usarlo", 3700),
            headerCell("Limitaciones", 3960),
          ],
        }),
        new TableRow({
          children: [
            cell("console", { width: 1700, bold: true, bgColor: COLORS.greyBg }),
            cell("Desarrollo y diagnóstico. Imprime el contenido del email en los logs de Railway.", {
              width: 3700,
            }),
            cell("No envía nada. Solo útil para verificar que el flujo de generación de enlace funciona.", {
              width: 3960,
            }),
          ],
        }),
        new TableRow({
          children: [
            cell("resend", { width: 1700, bold: true, bgColor: COLORS.greyBg }),
            cell("Producción si tienes dominio propio verificado. 100/día gratis, 3000/mes.", {
              width: 3700,
            }),
            cell(
              "Sin dominio propio verificado, solo deja enviar al email con el que abriste cuenta en Resend.",
              { width: 3960 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("brevo", { width: 1700, bold: true, bgColor: COLORS.greyBg }),
            cell(
              "Producción incluso sin dominio. Verifica un email único como sender. 300/día gratis (~9.000/mes).",
              { width: 3700 }
            ),
            cell(
              "Mientras envíes desde un email no asociado a un dominio verificado, los gateways corporativos pueden filtrar más agresivamente.",
              { width: 3960 }
            ),
          ],
        }),
      ],
    }),
    spacer(200),

    h2("A7.3 Cambiar de proveedor"),
    numbered("En Railway → backend → Variables, edita EMAIL_DRIVER al valor del nuevo proveedor."),
    numbered("Añade o ajusta las variables del proveedor (BREVO_API_KEY o RESEND_API_KEY)."),
    numbered("Asegúrate de que EMAIL_FROM corresponde a un sender verificado en el nuevo proveedor."),
    numbered("Railway redeploya automáticamente al guardar las variables."),
    numbered("Verifica en los logs el siguiente envío que se realice."),
    spacer(120),

    h2("A7.4 Verificar un dominio (recomendado para producción)"),
    p(
      "Mientras envíes desde un dominio prestado por el proveedor (`*.brevosend.com` o `onboarding@resend.dev`), la deliverability es siempre peor: los gateways corporativos lo tratan como sospechoso y pueden retener emails en cuarentena."
    ),
    p("Para resolverlo de raíz, hay que verificar un dominio:"),
    numbered("Obtén un dominio. Dos vías: solicitar un subdominio al ayuntamiento (p. ej. viverapp.santacruzdetenerife.es) o comprar uno propio (~10€/año en Porkbun, Namecheap)."),
    numbered("En el proveedor (Brevo o Resend), añade el dominio: Settings → Senders / Domains → Add Domain."),
    numbered("El proveedor te dará 3-4 registros DNS (TXT SPF, TXT DKIM, opcionalmente MX y DMARC)."),
    numbered("Los registros se añaden en el panel DNS donde tengas registrado el dominio (no en Railway)."),
    numbered("Verifica desde el proveedor cuando estén propagados (5-30 min)."),
    numbered("Cambia EMAIL_FROM en Railway a 'ViverApp <noreply@tudominio.es>'."),
    spacer(160),
    imagePlaceholder(
      "Panel de verificación de dominio en Brevo",
      "Captura del panel Domains de Brevo mostrando el dominio en estado “Verified” con sus registros DNS."
    ),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 8. Troubleshooting deliverability
// -------------------------------------------------
function troubleshooting() {
  return [
    h1("A8. Troubleshooting: el email no llega"),
    p(
      "Cuando un usuario no recibe el email esperado, hay un orden concreto de comprobaciones. Sigue las cuatro capas de la siguiente tabla en orden, de la más probable a la menos probable."
    ),
    spacer(120),

    h2("Árbol de decisión"),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [800, 2700, 5860],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("#", 800),
            headerCell("Comprobación", 2700),
            headerCell("Cómo y qué buscar", 5860),
          ],
        }),
        new TableRow({
          children: [
            cell("1", { width: 800, bold: true, bgColor: COLORS.tableAltBg, align: AlignmentType.CENTER }),
            cell("Spam y cuarentena del destinatario", { width: 2700, bold: true }),
            cell(
              "Carpeta “Correo no deseado” en Outlook/Gmail. Si la organización tiene cuarentena central (Microsoft Defender, Mimecast, Proofpoint), suele mandar resúmenes diarios. Es la causa más probable.",
              { width: 5860 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("2", { width: 800, bold: true, bgColor: COLORS.tableAltBg, align: AlignmentType.CENTER }),
            cell("Logs de Railway (backend)", { width: 2700, bold: true }),
            cell(
              "Buscar líneas '[email:brevo]' o '[email:resend]'. 'OK 201' significa enviado correctamente. Si ves 'ERROR HTTP 403' o '401', el problema es del lado de la API.",
              { width: 5860 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("3", { width: 800, bold: true, bgColor: COLORS.tableAltBg, align: AlignmentType.CENTER }),
            cell("Dashboard del proveedor", { width: 2700, bold: true }),
            cell(
              "En Brevo: Statistics → Email Activity. En Resend: Emails. Estado “Delivered” significa que el servidor SMTP de destino lo aceptó, pero no garantiza que esté en la bandeja de entrada (puede haber filtrado posterior).",
              { width: 5860 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("4", { width: 800, bold: true, bgColor: COLORS.tableAltBg, align: AlignmentType.CENTER }),
            cell("Variables de entorno y configuración", { width: 2700, bold: true }),
            cell(
              "EMAIL_DRIVER no es 'console' por error, EMAIL_FROM coincide con un sender verificado, RESEND_API_KEY o BREVO_API_KEY válida, FRONTEND_URL apunta a la URL pública correcta.",
              { width: 5860 }
            ),
          ],
        }),
      ],
    }),
    spacer(200),

    h2("Trampas conocidas"),
    h3("“El gateway de seguridad clica el enlace antes que el usuario”"),
    p(
      "Es habitual que los gateways corporativos (Microsoft SafeLinks, Mimecast URL Protect, etc.) visiten automáticamente todos los enlaces que pasan por ellos para detectar phishing. En el dashboard de Brevo verás eventos “Clicked” a los pocos segundos del envío, antes de que el destinatario haya tenido tiempo de abrir el email."
    ),
    bullet("Es un comportamiento normal, no un fallo del sistema."),
    bullet("El token NO se consume con esa visita: solo se valida vía GET, no se ejecuta el cambio de contraseña."),
    bullet("Para reducir el ruido en logs, en Brevo se puede desactivar Click Tracking (Settings → Email Settings)."),
    spacer(120),

    h3("“Brevo dice Delivered pero el usuario no lo ve”"),
    p(
      "“Delivered” en Brevo significa que el servidor SMTP de destino aceptó el mensaje. Tras esa aceptación, el sistema de filtrado interno del destinatario puede colocarlo en spam o cuarentena. La solución es verificar un dominio propio (apartado A7.4) o pedir a IT que añada *@brevosend.com a la lista de remitentes seguros."
    ),
    spacer(120),

    h3("“El enlace ya no funciona pero el usuario no lo ha usado”"),
    p("Tres causas:"),
    bullet("Han pasado más de 24 horas desde el envío del email — el token caducó. El admin debe usar Reenviar invitación o Reset password para generar uno nuevo."),
    bullet("El admin ha generado un segundo token para el mismo propósito (por ejemplo, pulsó Reenviar invitación dos veces) — solo el último es válido. Los anteriores se invalidan automáticamente."),
    bullet(
      "Algún gateway de seguridad ha hecho clic en el enlace y, tras la validación inicial, marca el enlace como “consumido” a nivel de su política. Esto es raro pero puede ocurrir."
    ),
    spacer(160),

    info("Resumen del troubleshooting", [
      "El 80% de los casos se resuelven mirando spam/cuarentena del destinatario o pidiendo a IT que liberen los emails retenidos. Solo si la situación se repite con frecuencia hay que abordar la verificación de dominio.",
    ]),
    pageBreak(),
  ];
}

// -------------------------------------------------
// 9. FAQ ampliado
// -------------------------------------------------
function faqAmpliado() {
  const items = [
    {
      q: "He creado un usuario pero no le ha llegado el email de invitación.",
      a: "Sigue el árbol de decisión del apartado A8. Lo más probable: está en spam o en cuarentena del gateway corporativo. Si tras revisar no aparece, usa “Reenviar invitación” en el panel de Usuarios para generar un token nuevo y volver a intentarlo.",
    },
    {
      q: "Mi cuenta está bloqueada, ¿qué hago?",
      a: "Pídele al administrador que pulse “Desbloquear” en tu fila. Recibirás un email para definir una nueva contraseña. Ese email también caduca en 24 horas, así que actúa cuanto antes.",
    },
    {
      q: "El enlace del email me dice que ha caducado o ya se ha usado.",
      a: "Pídele al admin que vuelva a pulsar el botón correspondiente (Reenviar invitación, Reset password o Desbloquear según tu caso). Se generará un nuevo enlace con 24h de validez.",
    },
    {
      q: "He olvidado mi contraseña pero no quiero molestar al admin.",
      a: "Desde la pantalla de login, pulsa “¿Olvidaste tu contraseña?”. Introduce tu username y email y, si los datos coinciden, te llegará un enlace de reset.",
    },
    {
      q: "He intentado “Olvidé mi contraseña” pero no me llega nada.",
      a: "Comprueba que has escrito correctamente username y email exactamente como están registrados. El sistema NO te dirá si fallaste algún campo (es una medida de seguridad anti-enumeración). Si los datos son correctos y aún no llega, sigue el árbol de decisión del apartado A8.",
    },
    {
      q: "Quiero borrar a un usuario que ya no trabaja en el ayuntamiento.",
      a: "Edítalo y márcalo como Inactivo en lugar de Borrar. Inactivo revoca el acceso pero conserva su histórico (movimientos, pedidos). El botón Borrar es irreversible y elimina al usuario por completo; úsalo solo para limpiar pruebas o duplicados.",
    },
    {
      q: "¿Puedo cambiar mi contraseña cuando yo quiera, sin necesitar al admin?",
      a: "Actualmente el flujo de cambio voluntario de contraseña se canaliza vía “Olvidé mi contraseña”: te mandas a ti mismo un email y la cambias. No hay un módulo dedicado a “Cambiar contraseña desde mi perfil” en esta versión del sistema.",
    },
    {
      q: "¿Por qué el sistema me pide al menos 8 caracteres y no acepta menos?",
      a: "Es la longitud mínima fijada en el backend (el frontend la pide pero la verificación es del lado servidor). Por seguridad no se permite ir por debajo de ese umbral.",
    },
    {
      q: "Soy admin y veo en los logs que un email se entregó correctamente, pero el usuario me dice que no lo ha recibido.",
      a: "“Entregado” en Brevo significa que el servidor SMTP del destinatario aceptó el mensaje, no que lo veas en tu bandeja. Hay un escalón de filtrado interno (cuarentena, spam, reglas internas) que puede retenerlo. Pídele al usuario que mire spam y a IT que revise la cuarentena central.",
    },
    {
      q: "El admin pulsa Reset password dos veces seguidas. ¿Cuál es el enlace válido?",
      a: "El último. Cada vez que se emite un token nuevo del mismo propósito para el mismo usuario, los anteriores no consumidos quedan invalidados automáticamente. Solo hay un enlace activo por motivo y usuario.",
    },
  ];

  return [
    h1("A9. FAQ ampliado"),
    p("Estas preguntas complementan el FAQ original de la guía con dudas específicas de las nuevas funcionalidades."),
    spacer(160),
    ...items.flatMap((item) => [
      pRich(
        [
          new TextRun({ text: "❓  ", size: 24 }),
          new TextRun({ text: item.q, bold: true, size: 24, color: COLORS.primaryDark }),
        ],
        { spacing: { before: 200, after: 80 } }
      ),
      pRich(
        [
          new TextRun({ text: "→  ", size: 22, color: COLORS.primary, bold: true }),
          new TextRun({ text: item.a, size: 22 }),
        ],
        { spacing: { before: 0, after: 160, line: 300 } }
      ),
    ]),
  ];
}

// =====================================================
// BUILD DOCUMENT
// =====================================================

const doc = new Document({
  creator: "ViverApp",
  title: "Guía de Usuario ViverApp · Anexo Gestión de Usuarios",
  description: "Anexo de la guía de usuario. Cubre las funcionalidades incorporadas en la versión 1.1.",
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 40, bold: true, font: "Arial", color: COLORS.primary },
        paragraph: {
          spacing: { before: 480, after: 240 },
          outlineLevel: 0,
          border: {
            bottom: { color: COLORS.primary, space: 6, style: BorderStyle.SINGLE, size: 12 },
          },
        },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: COLORS.primaryDark },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: COLORS.primaryLight },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "ViverApp · Guía de Usuario · Anexo v1.1", size: 18, color: COLORS.textMuted }),
                new TextRun({ text: "\t" }),
                new TextRun({
                  text: "Ayuntamiento de Santa Cruz de Tenerife",
                  size: 18,
                  italics: true,
                  color: COLORS.textMuted,
                }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              border: {
                bottom: { color: COLORS.primary, space: 4, style: BorderStyle.SINGLE, size: 6 },
              },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Anexo v1.1", size: 18, color: COLORS.textMuted }),
                new TextRun({ text: "\t" }),
                new TextRun({ text: "Página ", size: 18, color: COLORS.textMuted }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLORS.textMuted }),
                new TextRun({ text: " de ", size: 18, color: COLORS.textMuted }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: COLORS.textMuted }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              border: {
                top: { color: COLORS.primary, space: 4, style: BorderStyle.SINGLE, size: 6 },
              },
            }),
          ],
        }),
      },
      children: [
        ...intro(),
        ...ciclos(),
        ...gestionUsuarios(),
        ...filtros(),
        ...onboarding(),
        ...selfServiceReset(),
        ...seguridad(),
        ...emailConfig(),
        ...troubleshooting(),
        ...faqAmpliado(),
      ],
    },
  ],
});

const outputPath = path.join(__dirname, "Addendum_Gestion_Usuarios.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Anexo generado: ${outputPath}`);
  console.log(`  Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
});
