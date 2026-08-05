// Generador de la Guía de Usuario de ViverApp
// Output: Guia_Usuario_ViverApp.docx

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
  TableOfContents,
  HeadingLevel,
  TabStopType,
  TabStopPosition,
} = require("docx");

// =====================================================
// CONFIG
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
// HELPERS
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

const subBullet = (str) =>
  new Paragraph({
    numbering: { reference: "subBullets", level: 0 },
    children: [new TextRun({ text: str })],
    spacing: { before: 20, after: 20, line: 260 },
    indent: { left: 1080 },
  });

// Callout box (table with single cell, colored background)
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

// Image placeholder block
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
                children: [
                  new TextRun({ text: description, italics: true, size: 20, color: "64748B" }),
                ],
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

// =====================================================
// CONTENT BUILDERS
// =====================================================

function coverPage() {
  return [
    spacer(2400),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "🌱", size: 120 })],
      spacing: { before: 0, after: 400 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "ViverApp",
          bold: true,
          size: 96,
          color: COLORS.primary,
          font: "Arial",
        }),
      ],
      spacing: { before: 0, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Guía de Usuario",
          size: 56,
          color: COLORS.primaryDark,
        }),
      ],
      spacing: { before: 0, after: 600 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Sistema de Gestión del Vivero Municipal",
          size: 32,
          italics: true,
          color: COLORS.textMuted,
        }),
      ],
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Ayuntamiento de Santa Cruz de Tenerife",
          size: 28,
          color: COLORS.textMuted,
        }),
      ],
      spacing: { before: 0, after: 1200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "─── ", size: 28, color: COLORS.primary }),
        new TextRun({ text: "Versión 1.0", size: 24, bold: true, color: COLORS.primary }),
        new TextRun({ text: " ───", size: 28, color: COLORS.primary }),
      ],
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Documento dirigido a personal del ayuntamiento, técnicos del vivero y empresas externas colaboradoras.",
          size: 20,
          italics: true,
          color: COLORS.textMuted,
        }),
      ],
      spacing: { before: 200, after: 200 },
    }),
    pageBreak(),
  ];
}

function tocSection() {
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: "Índice de contenidos", size: 44, bold: true, color: COLORS.primary })],
      spacing: { before: 200, after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Para actualizar este índice, haz clic derecho sobre él en Word y selecciona “Actualizar campos”.",
          italics: true,
          size: 20,
          color: COLORS.textMuted,
        }),
      ],
      spacing: { before: 0, after: 240 },
    }),
    new TableOfContents("Tabla de contenidos", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    pageBreak(),
  ];
}

function introduccion() {
  return [
    h1("1. Introducción"),
    p(
      "ViverApp es la plataforma digital de gestión integral del vivero municipal del Ayuntamiento de Santa Cruz de Tenerife. Centraliza el control de inventario, movimientos, pedidos, trazabilidad y reportes en una única herramienta accesible desde cualquier navegador."
    ),
    h2("¿Qué resuelve ViverApp?"),
    bullet("Conocer en tiempo real cuántas plantas hay disponibles, dónde están y en qué estado."),
    bullet("Trazar el origen y destino de cada lote desde su entrada al vivero hasta su salida."),
    bullet("Coordinar pedidos entre técnicos, managers y empresas externas con un flujo de aprobación claro."),
    bullet("Anticiparse a caducidades y stocks bajos mediante alertas automáticas."),
    bullet("Generar informes operativos sin tener que cruzar Excels manualmente."),
    spacer(160),
    h2("¿A quién va dirigida esta guía?"),
    p("Esta guía está pensada para los cinco perfiles de usuario que operan en el sistema:"),
    bullet("Administradores del sistema."),
    bullet("Managers responsables de aprobaciones e informes."),
    bullet("Gestores del vivero que coordinan la operativa diaria."),
    bullet("Técnicos que registran movimientos en planta."),
    bullet("Empresas externas con acceso limitado al catálogo y sus pedidos."),
    spacer(160),
    h2("Cómo leer esta guía"),
    pRich([
      text("La guía está organizada por "),
      bold("módulos funcionales"),
      text(". Cada sección incluye:"),
    ]),
    bullet("Una explicación breve del propósito del módulo."),
    bullet("Pasos numerados para realizar las tareas más habituales."),
    bullet("Consejos prácticos y advertencias destacadas en cuadros de color."),
    bullet("Sugerencias sobre dónde capturar pantallazos reales para tu propia documentación interna."),
    spacer(120),
    tip("Sugerencia de navegación", [
      "Si lees este documento en Word o en PDF, los títulos del índice son enlaces clicables. Mantén pulsada la tecla Ctrl y haz clic en cualquier entrada para saltar a la sección correspondiente.",
    ]),
    pageBreak(),
  ];
}

function rolesYPermisos() {
  const colA = 2200;
  const colB = 1860;
  const colC = 1860;
  const colD = 1860;
  const colE = 1580;

  return [
    h1("2. Roles y permisos"),
    p(
      "El sistema distingue cinco roles. Cada usuario tiene un único rol asignado, definido en la tabla usuarios de la base de datos. El rol determina qué módulos ve y qué acciones puede realizar."
    ),
    spacer(120),
    h2("Visión general de los roles"),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [colA, colB + colC, colD + colE],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Rol", colA),
            headerCell("Misión principal", colB + colC),
            headerCell("Casos de uso típicos", colD + colE),
          ],
        }),
        new TableRow({
          children: [
            cell("Administrador", { width: colA, bold: true, bgColor: COLORS.greyBg }),
            cell("Control total del sistema. Configura usuarios, parámetros y reglas.", {
              width: colB + colC,
            }),
            cell("Alta de usuarios, reglas de caducidad, auditoría completa.", {
              width: colD + colE,
            }),
          ],
        }),
        new TableRow({
          children: [
            cell("Manager", { width: colA, bold: true, bgColor: COLORS.greyBg }),
            cell("Aprueba pedidos, supervisa indicadores y consulta informes.", {
              width: colB + colC,
            }),
            cell("Validación de pedidos, revisión semanal de KPIs.", {
              width: colD + colE,
            }),
          ],
        }),
        new TableRow({
          children: [
            cell("Gestor de vivero", { width: colA, bold: true, bgColor: COLORS.greyBg }),
            cell("Coordina la operativa diaria del vivero. Acceso amplio sin tareas administrativas.", {
              width: colB + colC,
            }),
            cell("Revisión de stock, planificación de salidas, supervisión técnica.", {
              width: colD + colE,
            }),
          ],
        }),
        new TableRow({
          children: [
            cell("Técnico", { width: colA, bold: true, bgColor: COLORS.greyBg }),
            cell("Registra los movimientos físicos en el vivero (entradas, salidas, traslados).", {
              width: colB + colC,
            }),
            cell("Recepción de plantas, traslados entre zonas, sirviendo pedidos.", {
              width: colD + colE,
            }),
          ],
        }),
        new TableRow({
          children: [
            cell("Empresa externa", { width: colA, bold: true, bgColor: COLORS.greyBg }),
            cell("Proveedor o colaborador con acceso limitado al catálogo y sus propios pedidos.", {
              width: colB + colC,
            }),
            cell("Consulta de productos disponibles, creación de pedidos a 15 días.", {
              width: colD + colE,
            }),
          ],
        }),
      ],
    }),
    spacer(200),
    h2("Tabla comparativa de permisos"),
    p(
      "La siguiente tabla resume las acciones más frecuentes y qué rol puede ejecutarlas. Una marca verde (✔) indica permiso; un guion (—) indica que no está disponible."
    ),
    spacer(80),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [3000, 1280, 1280, 1280, 1280, 1240],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Acción", 3000),
            headerCell("Admin", 1280),
            headerCell("Manager", 1280),
            headerCell("Gestor vivero", 1280),
            headerCell("Técnico", 1280),
            headerCell("Empresa ext.", 1240),
          ],
        }),
        ...[
          ["Ver dashboard", "✔", "✔", "✔", "✔", "—"],
          ["Ver inventario completo", "✔", "✔", "✔", "✔", "Limitado"],
          ["Crear/editar productos", "✔", "—", "—", "—", "—"],
          ["Registrar movimientos", "✔", "—", "✔", "✔", "—"],
          ["Crear pedidos propios", "✔", "✔", "✔", "✔", "✔"],
          ["Aprobar/denegar pedidos", "✔", "✔", "—", "—", "—"],
          ["Servir pedidos", "✔", "—", "✔", "✔", "—"],
          ["Gestionar préstamos", "✔", "✔", "✔", "✔", "—"],
          ["Ver trazabilidad por lote", "✔", "✔", "✔", "✔", "—"],
          ["Consultar informes", "✔", "✔", "✔", "Parcial", "—"],
          ["Configurar caducidad", "✔", "—", "—", "—", "—"],
          ["Gestionar usuarios", "✔", "—", "—", "—", "—"],
          ["Ver mapa del vivero", "✔", "✔", "✔", "✔", "—"],
        ].map(
          (row) =>
            new TableRow({
              children: [
                cell(row[0], { width: 3000, bold: true }),
                cell(row[1], { width: 1280, align: AlignmentType.CENTER, bold: row[1] === "✔" }),
                cell(row[2], { width: 1280, align: AlignmentType.CENTER, bold: row[2] === "✔" }),
                cell(row[3], { width: 1280, align: AlignmentType.CENTER, bold: row[3] === "✔" }),
                cell(row[4], { width: 1280, align: AlignmentType.CENTER, bold: row[4] === "✔" }),
                cell(row[5], { width: 1240, align: AlignmentType.CENTER, bold: row[5] === "✔" }),
              ],
            })
        ),
      ],
    }),
    spacer(200),
    warning("Cambio de rol", [
      "Solo el Administrador puede modificar el rol de un usuario. Para hacerlo, accede al módulo de gestión de usuarios. Cualquier cambio entra en vigor en el siguiente inicio de sesión del usuario afectado.",
    ]),
    spacer(120),
    h2("Detalle por rol"),
    h3("2.1 Administrador"),
    pRich([bold("Qué puede ver: "), text("absolutamente todo el sistema, incluyendo configuración técnica.")]),
    pRich([
      bold("Qué puede hacer: "),
      text("crear y desactivar usuarios, asignar roles, definir reglas de caducidad por categoría/subcategoría/tamaño, ajustar parámetros globales y consultar todos los informes."),
    ]),
    pRich([
      bold("Qué NO puede hacer: "),
      text("no realiza tareas operativas del día a día por flujo (aunque técnicamente sí podría)."),
    ]),
    pRich([
      bold("Caso de uso típico: "),
      text("dar de alta a un nuevo técnico, ajustar la caducidad de los semilleros tras un cambio de protocolo, auditar accesos."),
    ]),
    spacer(120),
    h3("2.2 Manager"),
    pRich([bold("Qué puede ver: "), text("dashboard, inventario, movimientos, pedidos, informes y mapa.")]),
    pRich([
      bold("Qué puede hacer: "),
      text("aprobar o denegar pedidos, consultar informes y monitorizar indicadores. Crea pedidos propios cuando es necesario."),
    ]),
    pRich([
      bold("Qué NO puede hacer: "),
      text("no edita el catálogo ni gestiona usuarios. No registra movimientos físicos."),
    ]),
    pRich([
      bold("Caso de uso típico: "),
      text("revisar cada lunes los pedidos pendientes, aprobar los válidos y denegar con motivo aquellos que no procedan."),
    ]),
    spacer(120),
    h3("2.3 Gestor de vivero"),
    pRich([
      bold("Qué puede ver: "),
      text("dashboard, inventario, movimientos, pedidos, mapa, trazabilidad e informes operativos."),
    ]),
    pRich([
      bold("Qué puede hacer: "),
      text("registrar movimientos, servir pedidos aprobados, supervisar zonas, gestionar préstamos."),
    ]),
    pRich([
      bold("Qué NO puede hacer: "),
      text("no aprueba pedidos (esa es función del manager) ni gestiona usuarios."),
    ]),
    pRich([
      bold("Caso de uso típico: "),
      text("planificar la salida semanal de plantas hacia parques municipales, revisar caducidades inminentes y reorganizar el inventario por zonas."),
    ]),
    spacer(120),
    h3("2.4 Técnico"),
    pRich([bold("Qué puede ver: "), text("inventario, movimientos, pedidos asignados y mapa.")]),
    pRich([
      bold("Qué puede hacer: "),
      text("registrar entradas de lotes nuevos, salidas, traslados internos entre zonas y servir pedidos."),
    ]),
    pRich([bold("Qué NO puede hacer: "), text("no aprueba pedidos ni gestiona configuración o usuarios.")]),
    pRich([
      bold("Caso de uso típico: "),
      text("recibir un camión con plantas y registrar la entrada con su UUID; trasladar lotes de la zona 5 a la zona 8."),
    ]),
    spacer(120),
    h3("2.5 Empresa externa"),
    pRich([
      bold("Qué puede ver: "),
      text("solo el catálogo de productos disponibles para empresas externas y sus propios pedidos."),
    ]),
    pRich([
      bold("Qué puede hacer: "),
      text("crear pedidos con caducidad de 15 días, consultar el estado de los suyos."),
    ]),
    pRich([
      bold("Qué NO puede hacer: "),
      text("no ve stock interno completo, no ve pedidos de otros usuarios, no entra al dashboard ni a informes."),
    ]),
    pRich([
      bold("Caso de uso típico: "),
      text("solicitar 50 árboles de tipo X para una obra de jardinería con plazo de 15 días."),
    ]),
    spacer(120),
    imagePlaceholder(
      "Pantalla de login",
      "Captura de la pantalla de acceso con campos usuario/contraseña y el logo del ayuntamiento."
    ),
    pageBreak(),
  ];
}

function navegacionGeneral() {
  return [
    h1("3. Navegación general"),
    p(
      "Tras iniciar sesión, ViverApp muestra una barra lateral izquierda con los módulos disponibles según tu rol y un área principal donde se carga el contenido."
    ),
    spacer(120),
    h2("Estructura de la interfaz"),
    bulletRich([
      bold("Cabecera superior: "),
      text("muestra tu nombre de usuario, el rol activo, las notificaciones (campana con badge numérico) y el botón de salir."),
    ]),
    bulletRich([
      bold("Barra lateral: "),
      text("contiene los enlaces a los módulos a los que tienes acceso. Cambia según tu rol."),
    ]),
    bulletRich([
      bold("Área principal: "),
      text("muestra el módulo seleccionado con sus filtros, listados y formularios."),
    ]),
    bulletRich([
      bold("Modal del mapa: "),
      text("se abre desde el botón “Mapa del vivero” situado normalmente en el dashboard."),
    ]),
    spacer(160),
    imagePlaceholder(
      "Vista general de la interfaz",
      "Captura completa con la barra lateral expandida, cabecera con el rol del usuario y el dashboard cargado."
    ),
    spacer(160),
    h2("Iniciar sesión"),
    numbered("Abre el navegador en la URL del sistema."),
    numbered("Introduce tu nombre de usuario y contraseña."),
    numbered("Pulsa “Acceder”. La aplicación te llevará a la pantalla por defecto de tu rol (dashboard para casi todos los roles; productos para empresa externa)."),
    spacer(120),
    warning("Bloqueo por intentos fallidos", [
      "Tras varios intentos fallidos consecutivos, la cuenta se bloquea temporalmente. Si te bloqueas, contacta con un administrador para que la desbloquee desde la gestión de usuarios.",
    ]),
    spacer(120),
    h2("Cerrar sesión"),
    p(
      "Pulsa el botón “Salir” situado en la parte superior derecha. Es importante cerrar sesión al terminar, especialmente si compartes equipo con otros usuarios."
    ),
    spacer(120),
    tip("Sesión y seguridad", [
      "Tu sesión se mantiene mediante un token JWT almacenado en el navegador. Si cierras sesión en una pestaña, las demás también pierden acceso. Cambia tu contraseña al menos una vez al año.",
    ]),
    pageBreak(),
  ];
}

function moduloDashboard() {
  return [
    h1("4. Módulos funcionales"),
    h2("4.1 Dashboard"),
    p(
      "El dashboard es la primera pantalla que ven los roles internos al iniciar sesión. Ofrece una visión global del estado del vivero y permite saltar rápidamente a los módulos más usados."
    ),
    spacer(120),
    h3("Qué muestra"),
    bullet("Total de productos en catálogo y stock real sumado."),
    bullet("Productos por debajo del stock mínimo (badge rojo si hay alguno)."),
    bullet("Pedidos activos: reservas y aprobados que aún no se han servido."),
    bullet("Distribución por categorías (gráfico circular: plantas, ferretería, fitosanitario)."),
    bullet("Distribución por estado de pedidos."),
    bullet("Acceso al modal “Mapa del vivero”."),
    spacer(160),
    imagePlaceholder(
      "Dashboard principal",
      "Captura del dashboard con las cuatro tarjetas superiores (productos, stock total, bajo mínimo, pedidos activos), los dos gráficos circulares y el botón del mapa."
    ),
    spacer(160),
    h3("Cómo interpretarlo"),
    pRich([
      bold("Tarjeta “Bajo mínimo”: "),
      text("indica cuántos productos distintos tienen menos stock del configurado como mínimo. Si el número es alto, conviene priorizar reposiciones."),
    ]),
    pRich([
      bold("Tarjeta “Pedidos activos”: "),
      text("agrupa los pedidos en estado RESERVA (pendientes de aprobación) y APROBADO (pendientes de servir)."),
    ]),
    pRich([
      bold("Gráfico de pedidos: "),
      text("la proporción de cada estado te ayuda a detectar cuellos de botella (por ejemplo, muchos pedidos aprobados sin servir indican falta de capacidad operativa)."),
    ]),
    spacer(120),
    tip("Empezar el día", [
      "Antes de abrir cualquier otro módulo, dedica 30 segundos al dashboard. Te dará el contexto necesario para priorizar.",
    ]),
    pageBreak(),
  ];
}

function moduloInventario() {
  return [
    h2("4.2 Inventario (Productos)"),
    p(
      "El módulo de Inventario contiene el catálogo maestro de productos del vivero. Cada producto tiene un identificador, nombre científico (obligatorio), nombre natural, categoría, subcategoría y stock mínimo."
    ),
    spacer(120),
    h3("Buscar y filtrar"),
    numbered("Accede al módulo “Productos” desde el menú lateral."),
    numbered("Usa el campo de búsqueda para filtrar por nombre científico o natural."),
    numbered("Filtra por categoría o subcategoría con los desplegables superiores."),
    numbered("Ordena haciendo clic en las cabeceras de la tabla (id, nombre, stock, etc.)."),
    spacer(160),
    imagePlaceholder(
      "Listado de productos",
      "Captura mostrando la tabla de productos con columnas id, nombre científico, nombre natural, categoría, subcategoría, stock y stock mínimo."
    ),
    spacer(160),
    h3("Crear un producto (solo Admin)"),
    numbered("Pulsa el botón “Nuevo producto”."),
    numbered("Rellena los campos obligatorios: nombre científico, categoría y subcategoría."),
    numbered("Opcionalmente añade un nombre natural y un stock mínimo."),
    numbered("Marca la casilla “Es interno” si el producto solo es visible para roles internos."),
    numbered("Guarda. El producto aparecerá inmediatamente en el listado."),
    spacer(120),
    warning("Nombre científico único", [
      "El nombre científico actúa como identificador clave. Evita duplicados con pequeñas variaciones (espacios, mayúsculas, faltas) porque romperán los reportes.",
    ]),
    spacer(120),
    h3("Editar y eliminar"),
    bullet("Edita un producto pulsando el icono de lápiz en su fila."),
    bullet("Elimina solo si estás seguro: si el producto tiene movimientos asociados, considera marcarlo como inactivo en lugar de eliminarlo."),
    spacer(120),
    h3("Importar desde Excel"),
    p(
      "Existe un script de mantenimiento que sincroniza productos con un Excel maestro. Esta tarea se ejecuta puntualmente desde la línea de comandos por un administrador y NO debe lanzarse durante horas de trabajo intensivo."
    ),
    info("¿Y los lotes?", [
      "Un producto representa una especie o referencia. El stock real se contabiliza por lotes, identificados con UUID y ubicados en zonas concretas. Crear un producto no genera stock por sí solo: el stock se incorpora con un movimiento de entrada.",
    ]),
    pageBreak(),
  ];
}

function moduloMovimientos() {
  return [
    h2("4.3 Movimientos"),
    p(
      "Cada cambio físico en el vivero se registra como un movimiento. Hay tres tipos:"
    ),
    bulletRich([
      bold("Entrada: "),
      text("incorporación de plantas al vivero (compra, donación, devolución, etc.)."),
    ]),
    bulletRich([
      bold("Salida: "),
      text("destino externo (parques, empresas, baja por descarte, traslado a Palmetum)."),
    ]),
    bulletRich([
      bold("Traslado interno: "),
      text("cambio de zona o tamaño dentro del propio vivero."),
    ]),
    spacer(160),
    imagePlaceholder(
      "Listado de movimientos",
      "Captura mostrando la tabla de movimientos con filtros por tipo, producto, zona y fecha."
    ),
    spacer(160),
    h3("4.3.1 Registrar una entrada"),
    numbered("Accede a “Movimientos” → “Nuevo”."),
    numbered("Selecciona tipo: Entrada."),
    numbered("Indica origen (Empresa externa, Vivero, Palmetum) y destino (Vivero)."),
    numbered("Selecciona el producto, la zona destino y el tamaño (semillero, M12, M20, M35)."),
    numbered("Introduce la cantidad y, si procede, las observaciones."),
    numbered("El sistema generará automáticamente un UUID de lote y aplicará la regla de caducidad correspondiente."),
    numbered("Guarda."),
    spacer(120),
    success("Trazabilidad desde el primer día", [
      "El UUID generado es la “matrícula” del lote. Se queda con él durante toda su vida en el sistema y permite reconstruir su historia completa.",
    ]),
    spacer(120),
    h3("4.3.2 Registrar una salida"),
    numbered("Pulsa “Nuevo movimiento” y selecciona Salida."),
    numbered("Indica el destino (Externo, Baja Vivero o Palmetum)."),
    numbered("Selecciona el producto y, opcionalmente, el UUID del lote concreto que sale."),
    numbered("Indica zona origen, tamaño y cantidad."),
    numbered("Si el destino es Externo, completa los campos de dirección, distrito, barrio y CP."),
    numbered("Marca “Es préstamo” si el material va a volver al vivero (ver módulo de Préstamos)."),
    numbered("Guarda. El stock se descontará automáticamente del lote indicado."),
    spacer(120),
    warning("Stock insuficiente", [
      "Si intentas registrar una salida superior al stock disponible del lote, el sistema bloqueará la operación. Verifica en Trazabilidad qué cantidad real queda antes de hacer el movimiento.",
    ]),
    spacer(120),
    h3("4.3.3 Traslado interno"),
    numbered("Selecciona Traslado interno como tipo."),
    numbered("Indica zona origen y zona destino."),
    numbered("Indica tamaño origen y tamaño destino (pueden ser el mismo o distintos si se ha trasplantado)."),
    numbered("Indica la cantidad."),
    numbered("Guarda."),
    spacer(120),
    info("Cambio de tamaño", [
      "Cuando una planta crece y pasa de M12 a M20, registra un traslado interno con tamaño origen M12 y tamaño destino M20. El UUID se conserva.",
    ]),
    spacer(120),
    imagePlaceholder(
      "Formulario de nuevo movimiento",
      "Captura mostrando el formulario con todos los campos, en estado válido listo para guardar."
    ),
    pageBreak(),
  ];
}

function moduloPedidos() {
  return [
    h2("4.4 Pedidos"),
    p(
      "Un pedido es una solicitud formal de salida de material. Pasa por varios estados desde su creación hasta su entrega."
    ),
    spacer(120),
    h3("Ciclo de vida de un pedido"),
    new Table({
      width: { size: PAGE.contentWidth, type: WidthType.DXA },
      columnWidths: [2200, 2300, 4860],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Estado", 2200),
            headerCell("Quién lo provoca", 2300),
            headerCell("Significado", 4860),
          ],
        }),
        new TableRow({
          children: [
            cell("RESERVA", { width: 2200, bold: true, bgColor: COLORS.yellowBg }),
            cell("Solicitante crea el pedido", { width: 2300 }),
            cell(
              "El pedido está pendiente de revisión por un manager. El stock no se descuenta todavía pero queda visible como “reservado”.",
              { width: 4860 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("APROBADO", { width: 2200, bold: true, bgColor: COLORS.blueBg }),
            cell("Manager aprueba", { width: 2300 }),
            cell(
              "El pedido es válido y queda pendiente de servir físicamente. Se asignan lotes concretos en el momento de servirlo.",
              { width: 4860 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("DENEGADO", { width: 2200, bold: true, bgColor: COLORS.redBg }),
            cell("Manager deniega", { width: 2300 }),
            cell(
              "El pedido se rechaza. El campo “motivo de denegación” es obligatorio y queda registrado.",
              { width: 4860 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("SERVIDO", { width: 2200, bold: true, bgColor: COLORS.greenBg }),
            cell("Técnico/Gestor sirve", { width: 2300 }),
            cell(
              "Las plantas han salido del vivero. Se generan los movimientos de salida correspondientes y la trazabilidad queda cerrada para esa partida.",
              { width: 4860 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("CADUCADO", { width: 2200, bold: true, bgColor: COLORS.greyBg }),
            cell("Sistema (automático)", { width: 2300 }),
            cell(
              "Aplicable a empresa externa: si pasan 15 días desde la creación sin servir, el pedido caduca automáticamente.",
              { width: 4860 }
            ),
          ],
        }),
      ],
    }),
    spacer(200),
    imagePlaceholder(
      "Listado de pedidos con filtros por estado",
      "Captura mostrando la tabla con badges de colores por estado (RESERVA, APROBADO, etc.)."
    ),
    spacer(160),
    h3("4.4.1 Crear un pedido"),
    numbered("Accede al módulo “Pedidos” → “Nuevo pedido”."),
    numbered("Para cada línea del pedido: selecciona producto, tamaño y cantidad."),
    numbered("Si necesitas más líneas, pulsa “Añadir producto”."),
    numbered("Añade una nota explicativa si el pedido tiene contexto especial (campaña, evento, urgencia)."),
    numbered("Guarda. El pedido entra en estado RESERVA y se notifica a los managers."),
    spacer(120),
    h3("4.4.2 Aprobar o denegar (Manager)"),
    numbered("Accede al módulo “Aprobaciones”."),
    numbered("Verás los pedidos en estado RESERVA, ordenados por fecha."),
    numbered("Pulsa el icono ✔ para aprobar, ✗ para denegar."),
    numbered("Si denegas, escribe un motivo claro: el solicitante lo verá."),
    numbered("Una vez decidido, el pedido cambia de estado al instante."),
    spacer(120),
    tip("Aprobaciones por lotes", [
      "Si tienes 30 pedidos pendientes los lunes, ordénalos por solicitante o por fecha y procésalos en bloque para no perder contexto.",
    ]),
    spacer(120),
    h3("4.4.3 Servir un pedido (Gestor o Técnico)"),
    numbered("Localiza el pedido en estado APROBADO."),
    numbered("Pulsa “Servir”."),
    numbered("Selecciona la zona origen y los lotes concretos de los que sale el material."),
    numbered("Si la cantidad disponible en una zona es insuficiente, el sistema te permite repartir entre varias."),
    numbered("Confirma. El pedido pasa a SERVIDO y se generan los movimientos de salida automáticamente."),
    spacer(120),
    warning("No se puede deshacer", [
      "Una vez servido un pedido, el stock queda descontado. Si necesitas revertirlo, hay que registrar un movimiento de entrada manual con el motivo correspondiente.",
    ]),
    spacer(120),
    h3("4.4.4 Pedidos de empresa externa"),
    p(
      "Las empresas externas crean sus propios pedidos desde una vista simplificada que solo muestra los productos disponibles para ellas. Sus pedidos tienen una caducidad automática de 15 días: si el manager no los aprueba en ese plazo, pasan a CADUCADO."
    ),
    pageBreak(),
  ];
}

function moduloPrestamos() {
  return [
    h2("4.5 Gestión de préstamos"),
    p(
      "Un préstamo es una salida de material que se espera devolver. Sirve para eventos puntuales (ferias, exposiciones, decoración temporal) en los que el material no se consume sino que regresa al vivero."
    ),
    spacer(120),
    h3("Cómo funciona"),
    numbered("Crea un movimiento de salida normal."),
    numbered("Marca la casilla “Es préstamo”."),
    numbered("Indica una fecha estimada de devolución (opcional pero recomendable)."),
    numbered("Guarda. El movimiento queda etiquetado como préstamo activo."),
    spacer(120),
    h3("Devolver un préstamo"),
    numbered("Accede al módulo “Préstamos activos”."),
    numbered("Localiza el préstamo en cuestión."),
    numbered("Pulsa “Registrar devolución”."),
    numbered("Indica la cantidad devuelta (puede ser parcial) y las observaciones (estado, mermas)."),
    numbered("Confirma. Se generará un movimiento de entrada vinculado al préstamo original."),
    spacer(120),
    imagePlaceholder(
      "Listado de préstamos activos",
      "Captura mostrando la tabla de préstamos pendientes de devolución, con fechas estimadas y botón “Registrar devolución”."
    ),
    spacer(160),
    info("Devoluciones parciales", [
      "Es habitual que vuelva menos cantidad de la que salió (mermas, daños). El sistema soporta devoluciones parciales: registra la cantidad real recuperada y el préstamo continuará abierto hasta cerrarse del todo o marcarse como completado con merma.",
    ]),
    pageBreak(),
  ];
}

function moduloTrazabilidad() {
  return [
    h2("4.6 Trazabilidad por producto y lote"),
    p(
      "Cada lote que entra al vivero recibe un UUID único. Este identificador se conserva durante toda la vida del lote y es la clave para reconstruir su historia: de dónde vino, dónde está ahora, en qué pedidos se ha servido, si tuvo traslados internos, etc."
    ),
    spacer(120),
    h3("Consultar la trazabilidad de un lote"),
    numbered("Accede al módulo “Trazabilidad” o “Lote tracking”."),
    numbered("Introduce el UUID del lote (puedes copiarlo desde un movimiento o desde el inventario)."),
    numbered("El sistema muestra una línea temporal con todos los eventos: entrada inicial, traslados, salidas, devoluciones."),
    spacer(160),
    imagePlaceholder(
      "Vista de trazabilidad de un lote",
      "Captura mostrando la línea temporal de un lote con bloques verticales: entrada, traslados internos, salida parcial, etc."
    ),
    spacer(160),
    h3("Trazabilidad por producto"),
    p(
      "Si en lugar de un lote concreto necesitas ver todos los lotes asociados a un producto, accede al detalle del producto en Inventario y consulta la pestaña “Lotes”. Verás cuántos lotes activos existen, en qué zonas están y cuándo entraron."
    ),
    spacer(120),
    success("Auditorías sin sudor", [
      "Cuando alguien pregunta “¿de dónde salió esa palmera del paseo marítimo?”, no hay que rebuscar en albaranes: el UUID del movimiento de salida apunta al lote, y el lote te lleva hasta el origen exacto.",
    ]),
    pageBreak(),
  ];
}

function moduloCaducidad() {
  return [
    h2("4.7 Caducidad de productos"),
    p(
      "Algunas plantas y consumibles del vivero tienen una vida útil limitada. ViverApp aplica reglas configurables para calcular automáticamente la fecha de caducidad de cada lote."
    ),
    spacer(120),
    h3("Cómo se calcula"),
    p(
      "Al registrar una entrada, el sistema busca la regla de caducidad más específica que coincida con la categoría, subcategoría y tamaño del lote. Si encuentra una, suma esos días a la fecha de entrada y ese valor se guarda como fecha de caducidad."
    ),
    spacer(120),
    h3("Configurar reglas (solo Admin)"),
    numbered("Accede a la configuración de caducidad (módulo administrativo)."),
    numbered("Crea una regla con categoría, subcategoría (opcional), tamaño (opcional) y días de caducidad."),
    numbered("Las reglas con subcategoría/tamaño en blanco actúan como comodín."),
    numbered("Activa o desactiva reglas con el toggle correspondiente."),
    spacer(120),
    h3("Visualizar caducidades"),
    bullet("En el dashboard verás una alerta si hay lotes próximos a caducar o ya caducados."),
    bullet("En el módulo de notificaciones encontrarás el detalle de cada lote afectado."),
    bullet("En cada lote aparece su fecha de caducidad en color rojo si está vencida o naranja si está cerca."),
    spacer(120),
    warning("Caducidad y salidas", [
      "Cuando sirvas un pedido, prioriza siempre los lotes con caducidad más cercana (FEFO: First Expired, First Out). El sistema ordena por defecto los lotes en este orden al servir.",
    ]),
    spacer(120),
    imagePlaceholder(
      "Configuración de reglas de caducidad",
      "Captura mostrando la tabla de reglas con categorías, subcategorías, tamaños y días."
    ),
    pageBreak(),
  ];
}

function moduloAlertas() {
  return [
    h2("4.8 Alertas y notificaciones"),
    p(
      "ViverApp genera automáticamente notificaciones para que no se te escape nada relevante. Las verás en la campana de la cabecera, con un badge numérico que indica cuántas tienes sin leer."
    ),
    spacer(120),
    h3("Tipos de notificaciones"),
    bulletRich([
      bold("Stock bajo: "),
      text("aparece cuando un producto baja de su stock mínimo configurado."),
    ]),
    bulletRich([
      bold("Caducidad próxima o vencida: "),
      text("se genera automáticamente para cada lote afectado."),
    ]),
    bulletRich([
      bold("Pedidos pendientes (managers): "),
      text("recordatorio si llevan demasiado tiempo en estado RESERVA."),
    ]),
    bulletRich([
      bold("Pedidos por servir (gestores/técnicos): "),
      text("aparece cuando un pedido propio o asignado pasa a APROBADO."),
    ]),
    spacer(160),
    imagePlaceholder(
      "Panel de notificaciones desplegado",
      "Captura mostrando la campana abierta con la lista de notificaciones de stock y caducidad."
    ),
    spacer(160),
    h3("Marcar como leídas"),
    p(
      "Pulsa cualquier notificación para marcarla como leída. El estado de leído/no leído se conserva en tu navegador (localStorage), por lo que puede diferir entre dispositivos."
    ),
    spacer(120),
    info("Empresa externa y notificaciones", [
      "Las empresas externas solo reciben notificaciones relativas a sus propios pedidos (caducidad de pedido, cambio de estado). No ven alertas de stock ni de caducidad de lote.",
    ]),
    pageBreak(),
  ];
}

function moduloInformes() {
  return [
    h2("4.9 Informes"),
    p(
      "El módulo Informes recopila los reportes operativos más usados. Sirven para auditar, planificar y rendir cuentas."
    ),
    spacer(120),
    h3("Informes disponibles"),
    bulletRich([
      bold("Trazabilidad de un UUID: "),
      text("historia completa de un lote desde su entrada."),
    ]),
    bulletRich([
      bold("Distribución por producto: "),
      text("muestra cómo se reparte un producto entre zonas y tamaños."),
    ]),
    bulletRich([
      bold("Stock bajo: "),
      text("listado de productos por debajo de un margen configurable."),
    ]),
    bulletRich([
      bold("Movimientos externos: "),
      text("salidas a destinos fuera del vivero, filtrables por fecha y destino."),
    ]),
    bulletRich([
      bold("Préstamos activos: "),
      text("material que aún no ha sido devuelto."),
    ]),
    spacer(160),
    imagePlaceholder(
      "Panel de informes",
      "Captura mostrando los informes disponibles con filtros y opciones de exportación."
    ),
    spacer(160),
    h3("Generar un informe"),
    numbered("Selecciona el informe que necesitas."),
    numbered("Aplica los filtros (fechas, producto, zona, etc.)."),
    numbered("Pulsa “Generar”."),
    numbered("Si lo necesitas en Excel/CSV, usa el botón de exportar (cuando esté disponible)."),
    spacer(120),
    tip("Informes mensuales", [
      "Los managers suelen exportar el informe de movimientos externos al cierre de cada mes para alimentar reportes a la Concejalía. Marca esta tarea en tu calendario.",
    ]),
    pageBreak(),
  ];
}

function moduloMapa() {
  return [
    h2("4.10 Mapa visual del vivero"),
    p(
      "El mapa visual muestra la planimetría del vivero con todas las zonas marcadas y permite consultar el inventario de cada una con un solo clic."
    ),
    spacer(120),
    h3("Cómo abrirlo"),
    p(
      "Desde el dashboard, pulsa el botón “Mapa del vivero”. Se abrirá un modal a pantalla casi completa con la imagen del plano y los polígonos de las zonas superpuestos."
    ),
    spacer(120),
    h3("Consultar el stock de una zona"),
    numbered("Pulsa sobre la zona que te interese."),
    numbered("En el panel lateral derecho aparecerá el listado de productos presentes en esa zona, con sus cantidades por tamaño."),
    numbered("Para cerrar la consulta, pulsa otra zona o cierra el modal."),
    spacer(160),
    imagePlaceholder(
      "Mapa del vivero con zona seleccionada",
      "Captura mostrando el mapa con una zona destacada y el panel lateral con productos y cantidades."
    ),
    spacer(160),
    h3("Editor de zonas"),
    p(
      "Existe un editor interno para reposicionar polígonos y ajustarlos al plano. Esta funcionalidad está oculta por defecto y solo se activa puntualmente cuando hay que recalibrar el mapa. Si necesitas activarla, contacta con el responsable técnico del proyecto."
    ),
    info("Importante", [
      "Los cambios realizados con el editor son personales (se guardan en tu navegador) hasta que se publica una nueva versión del fichero zonasConfig.js. Para que los demás usuarios vean los cambios, hay que desplegar la nueva configuración.",
    ]),
    pageBreak(),
  ];
}

function moduloUsuarios() {
  return [
    h2("4.11 Gestión de usuarios (Admin)"),
    p(
      "Solo el administrador accede a este módulo. Permite dar de alta, editar y desactivar usuarios, así como restablecer contraseñas y desbloquear cuentas."
    ),
    spacer(120),
    h3("Crear un usuario"),
    numbered("Accede a “Usuarios” → “Nuevo usuario”."),
    numbered("Introduce un nombre de usuario único (mínimo 3 caracteres)."),
    numbered("Indica un correo electrónico válido (opcional pero recomendable)."),
    numbered("Asigna una contraseña inicial robusta (mínimo 6 caracteres; usa más en la práctica)."),
    numbered("Selecciona el rol: admin, manager, gestor_vivero, tecnico o empresa_externa."),
    numbered("Marca el estado como “activo”."),
    numbered("Guarda. Comparte la contraseña inicial con el usuario por un canal seguro y pídele que la cambie en su primer acceso."),
    spacer(120),
    h3("Editar, desactivar y restablecer"),
    bullet("Edita un usuario para cambiar su email, rol o estado."),
    bullet("Desactiva un usuario en lugar de eliminarlo: conserva la trazabilidad de sus acciones pasadas."),
    bullet("Restablece la contraseña con el botón “Reset password”. Comunícale la nueva al usuario."),
    bullet("Desbloquea una cuenta tras intentos fallidos cambiando su estado de “bloqueado” a “activo”."),
    spacer(160),
    imagePlaceholder(
      "Listado de usuarios",
      "Captura mostrando la tabla de usuarios con columnas username, email, rol, estado y acciones."
    ),
    spacer(160),
    warning("Buenas prácticas de seguridad", [
      "Nunca compartas usuarios entre personas (cada uno con el suyo). Audita la lista de usuarios al menos una vez al trimestre y desactiva los que ya no procedan. No reutilices nombres de usuario antiguos para personas nuevas.",
    ]),
    pageBreak(),
  ];
}

function buenasPracticas() {
  return [
    h1("5. Buenas prácticas"),
    p(
      "Las siguientes recomendaciones extraen la experiencia operativa del vivero. Aplicarlas mantiene los datos limpios y los procesos fluidos."
    ),
    spacer(120),
    h2("Operativas diarias"),
    bullet("Registra los movimientos en el momento, no al final del día. Cuanto más tiempo pase, más probable es olvidar detalles o atribuirlos al lote equivocado."),
    bullet("Usa siempre el UUID del lote real. Evita inventar identificadores o usar el mismo para varios lotes distintos."),
    bullet("Antes de servir un pedido, comprueba en el mapa que las zonas y cantidades coinciden con la realidad física."),
    bullet("Si detectas una discrepancia entre lo que dice el sistema y lo que ves físicamente, no lo dejes para mañana: registra el ajuste con un motivo claro en observaciones."),
    spacer(120),
    h2("Pedidos y aprobaciones"),
    bullet("Los managers deben revisar las RESERVAS al menos una vez al día."),
    bullet("Al denegar un pedido, escribe motivo concreto: “stock insuficiente” es útil; “no procede” no lo es."),
    bullet("Los pedidos urgentes deben marcarse claramente en la nota."),
    bullet("Sirve siempre por orden FEFO (caducidad más próxima primero)."),
    spacer(120),
    h2("Datos maestros"),
    bullet("Antes de crear un producto nuevo, busca para asegurarte de que no existe con otro nombre."),
    bullet("Mantén el catálogo en un único idioma de nomenclatura científica (latín)."),
    bullet("Las reglas de caducidad se revisan tras cualquier cambio de protocolo técnico."),
    spacer(120),
    h2("Seguridad"),
    bullet("Cambia tu contraseña al menos anualmente."),
    bullet("No la compartas con compañeros."),
    bullet("Cierra sesión al terminar tu turno, especialmente en ordenadores compartidos."),
    bullet("Si crees que tu cuenta ha sido comprometida, avisa al administrador inmediatamente."),
    spacer(120),
    success("Mini-checklist diario", [
      "Al empezar el día: revisa dashboard y notificaciones (1 min). Al cerrar el día: confirma que todos los movimientos del día están registrados (2 min).",
    ]),
    pageBreak(),
  ];
}

function faq() {
  const items = [
    {
      q: "¿Por qué no veo el módulo X en el menú?",
      a: "Tu rol no tiene permiso. Consulta la tabla comparativa de permisos en la sección 2 o pídele al administrador que ajuste tu rol si crees que es un error.",
    },
    {
      q: "He registrado un movimiento incorrecto. ¿Cómo lo corrijo?",
      a: "Los movimientos no se editan ni borran para preservar la trazabilidad. Crea un movimiento contrario (entrada compensatoria si era una salida errónea, por ejemplo) con una observación clara explicando que es una corrección. Avisa al manager.",
    },
    {
      q: "He olvidado mi contraseña.",
      a: "Pide al administrador que la restablezca desde el módulo de gestión de usuarios. Te entregará una nueva contraseña temporal que deberás cambiar.",
    },
    {
      q: "Mi cuenta está bloqueada.",
      a: "Probablemente tras varios intentos fallidos. Pide al administrador que cambie tu estado de “bloqueado” a “activo”.",
    },
    {
      q: "Un pedido aprobado no aparece para servir.",
      a: "Verifica que tu rol tiene permiso para servir y que el pedido no ha cambiado de estado. Refresca la página con Ctrl+F5.",
    },
    {
      q: "El gráfico del dashboard parece desactualizado.",
      a: "Refresca la página. Los gráficos se calculan al cargar la vista; si algún compañero acaba de registrar un movimiento, no se reflejará hasta que recargues.",
    },
    {
      q: "¿Cómo encuentro un lote concreto físicamente?",
      a: "Busca su UUID en Trazabilidad. Verás en qué zona está y en qué cantidad. Confirma visualmente desde el mapa del vivero.",
    },
    {
      q: "Las cantidades en el mapa no cuadran con lo que veo en planta.",
      a: "Es síntoma de que alguien no ha registrado un movimiento. Crea un movimiento de ajuste (entrada o salida) con observación “ajuste de inventario” y comunícalo al gestor.",
    },
    {
      q: "Soy empresa externa y no veo todos los productos.",
      a: "Es correcto: solo ves los productos disponibles para empresas externas. Si necesitas uno que no aparece, contacta con el manager de tu interlocución.",
    },
    {
      q: "He creado un pedido con caducidad de 15 días y se me ha pasado.",
      a: "El pedido habrá pasado a CADUCADO automáticamente. Crea uno nuevo con los mismos productos y comunícate con el manager para acelerarlo.",
    },
    {
      q: "¿Puedo exportar datos a Excel?",
      a: "Sí, en los informes que tienen botón de exportar. Si un informe que necesitas no lo tiene, comunícalo al equipo técnico para incluirlo en la siguiente versión.",
    },
    {
      q: "El mapa del vivero no muestra correctamente una zona.",
      a: "Avisa al equipo técnico para que recalibren los polígonos con el editor interno. Mientras tanto, puedes consultar el inventario de la zona directamente desde el módulo de productos filtrando por zona.",
    },
  ];

  return [
    h1("6. Preguntas frecuentes (FAQ)"),
    p("Las dudas más habituales recogidas durante la puesta en marcha del sistema."),
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
    pageBreak(),
  ];
}

function soporte() {
  return [
    h1("7. Soporte y contacto"),
    p("Si necesitas ayuda, sigue este orden de escalado para encontrar la respuesta lo antes posible."),
    spacer(120),
    h2("1. Consulta esta guía"),
    p("La mayoría de las dudas están resueltas en las secciones anteriores y en la FAQ."),
    spacer(80),
    h2("2. Pregunta al administrador del sistema"),
    bullet("Bloqueos de cuenta y reseteos de contraseña."),
    bullet("Permisos y cambios de rol."),
    bullet("Configuración de reglas de caducidad."),
    bullet("Alta de nuevos productos o usuarios."),
    spacer(80),
    h2("3. Pregunta al manager o gestor del vivero"),
    bullet("Procesos operativos."),
    bullet("Aprobación urgente de pedidos."),
    bullet("Discrepancias de inventario."),
    spacer(80),
    h2("4. Equipo técnico (último recurso)"),
    bullet("Errores que parezcan bugs reproducibles."),
    bullet("Caídas del sistema."),
    bullet("Necesidades de nuevos informes o módulos."),
    spacer(160),
    info("Cómo reportar un error correctamente", [
      "Para que el equipo técnico pueda diagnosticar rápido, incluye en tu mensaje: (1) qué intentabas hacer; (2) qué pasó (mensaje de error si lo hubo); (3) hora aproximada; (4) navegador y, si puedes, captura de pantalla.",
    ]),
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "─────────────",
          size: 28,
          color: COLORS.primary,
        }),
      ],
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Gracias por usar ViverApp.", size: 28, italics: true, color: COLORS.primary }),
      ],
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Tu cuidado en el registro hace posible que el vivero municipal funcione mejor cada día.",
          size: 22,
          italics: true,
          color: COLORS.textMuted,
        }),
      ],
      spacing: { before: 0, after: 200 },
    }),
  ];
}

// =====================================================
// BUILD DOCUMENT
// =====================================================

const doc = new Document({
  creator: "ViverApp",
  title: "Guía de Usuario ViverApp",
  description: "Guía oficial de usuario del sistema de gestión del vivero municipal de Santa Cruz de Tenerife",
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
        reference: "subBullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "◦",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
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
    // Cover page (no header/footer)
    {
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
        },
      },
      children: coverPage(),
    },
    // Main content (with header/footer)
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
                new TextRun({ text: "ViverApp · Guía de Usuario", size: 18, color: COLORS.textMuted }),
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
                new TextRun({ text: "Versión 1.0", size: 18, color: COLORS.textMuted }),
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
        ...tocSection(),
        ...introduccion(),
        ...rolesYPermisos(),
        ...navegacionGeneral(),
        ...moduloDashboard(),
        ...moduloInventario(),
        ...moduloMovimientos(),
        ...moduloPedidos(),
        ...moduloPrestamos(),
        ...moduloTrazabilidad(),
        ...moduloCaducidad(),
        ...moduloAlertas(),
        ...moduloInformes(),
        ...moduloMapa(),
        ...moduloUsuarios(),
        ...buenasPracticas(),
        ...faq(),
        ...soporte(),
      ],
    },
  ],
});

const outputPath = path.join(__dirname, "Guia_Usuario_ViverApp.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Documento generado: ${outputPath}`);
  console.log(`  Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
});
