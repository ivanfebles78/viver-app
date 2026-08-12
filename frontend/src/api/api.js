import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;
const TOKEN_KEY = "token";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// ---------------- TOKEN ----------------

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

export const setStoredToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
};

export const clearStoredToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  // Al cerrar sesión olvidamos también el ayuntamiento activo del admin global.
  localStorage.removeItem("cliente_activo");
};

// ---------------- INTERCEPTOR ----------------

// Ayuntamiento activo elegido por el super-admin global. Se guarda en
// localStorage y se envía en cada petición como cabecera X-Cliente-Id. El
// backend solo la respeta para el rol 'admin'; el resto de roles quedan atados
// a su propio ayuntamiento y esta cabecera se ignora.
const ACTIVE_CLIENTE_KEY = "cliente_activo";

export const getActiveClienteId = () => {
  const v = localStorage.getItem(ACTIVE_CLIENTE_KEY);
  return v ? Number(v) : null;
};

export const setActiveClienteId = (id) => {
  if (id === null || id === undefined || id === "") {
    localStorage.removeItem(ACTIVE_CLIENTE_KEY);
  } else {
    localStorage.setItem(ACTIVE_CLIENTE_KEY, String(id));
  }
};

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const cid = getActiveClienteId();
  if (cid) {
    config.headers["X-Cliente-Id"] = String(cid);
  }
  return config;
});

// Si el backend responde 401 (token caducado/ inválido) en cualquier llamada
// con sesión activa, limpiamos la sesión y mandamos al login con un aviso, en
// vez de fallar silenciosamente en segundo plano.
api.interceptors.response.use(
  (response) => {
    // Tras cualquier acción que MODIFIQUE datos (POST/PUT/PATCH/DELETE) avisamos
    // a la app para que refresque los badges del menú sin cambiar de pantalla.
    try {
      const method = String(response?.config?.method || "get").toLowerCase();
      if (method !== "get" && typeof window !== "undefined") {
        window.dispatchEvent(new Event("vivero:data-changed"));
      }
    } catch { /* noop */ }
    return response;
  },
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || "");
    const esLogin = url.includes("/auth/login");
    if (status === 401 && !esLogin && getStoredToken()) {
      clearStoredToken();
      try { localStorage.removeItem("user"); } catch { /* noop */ }
      try { sessionStorage.setItem("session_expired", "1"); } catch { /* noop */ }
      if (!window.location.pathname.toLowerCase().includes("/login")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

// ---------------- AUTH ----------------

export const login = async (payloadOrUsername, maybePassword) => {
  const payload =
    typeof payloadOrUsername === "string"
      ? {
          username: payloadOrUsername,
          password: maybePassword || "",
        }
      : {
          username: payloadOrUsername?.username || "",
          password: payloadOrUsername?.password || "",
        };

  const { data } = await api.post("/auth/login", payload, {
    headers: { "Content-Type": "application/json" },
  });

  if (data?.access_token) {
    setStoredToken(data.access_token);
    // Nueva sesión → sin ayuntamiento preseleccionado (el admin global elige,
    // el resto de roles lo ignoran).
    localStorage.removeItem("cliente_activo");
  }

  return data;
};

export const authLogin = login;

export const getMe = async () => {
  const { data } = await api.get("/auth/me");
  return data;
};

// Cambio de contraseña self-service del usuario logueado.
export const changePassword = async (currentPassword, newPassword) => {
  const { data } = await api.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
};

// ---------------- PRODUCTOS ----------------

export const getProductos = async () => {
  const { data } = await api.get("/productos");
  return data;
};

export const updateProductoInterno = async (productoId, esInterno) => {
  const { data } = await api.patch(`/productos/${productoId}/es-interno`, {
    es_interno: !!esInterno,
  });
  return data;
};

export const createProducto = async (payload) => {
  const { data } = await api.post("/productos", payload);
  return data;
};

export const updateProducto = async (productoId, payload) => {
  const { data } = await api.put(`/productos/${productoId}`, payload);
  return data;
};

export const deleteProducto = async (productoId) => {
  const { data } = await api.delete(`/productos/${productoId}`);
  return data;
};

export const importarProductos = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/productos/import", form);
  return data;
};

// ---------------- MOVIMIENTOS ----------------

export const getMovimientos = async () => {
  const { data } = await api.get("/movimientos");
  return data;
};

export const createMovimiento = async (payload) => {
  const normalizedPayload = {
    ...payload,

    // 🔥 CLAVE PARA UUID (no rompe nada existente)
    uuid_lote: payload?.uuid_lote || null,
  };

  const { data } = await api.post("/movimientos", normalizedPayload);
  return data;
};

// ---------------- ZONAS ----------------

export const getZonaItems = async (zonaId) => {
  const { data } = await api.get(`/zonas/${encodeURIComponent(zonaId)}/items`);
  return data;
};

// Marca/desmarca como internos TODOS los productos con stock en la zona (admin).
export const marcarZonaInterna = async (zonaId, interno) => {
  const { data } = await api.post(
    `/zonas/${encodeURIComponent(zonaId)}/marcar-interna`,
    { interno: !!interno }
  );
  return data;
};

// ---------------- PEDIDOS ----------------

export const getPedidos = async () => {
  const { data } = await api.get("/pedidos");
  return data;
};

export const createPedido = async (payload) => {
  const { data } = await api.post("/pedidos", payload);
  return data;
};

export const createPedidoReposicion = async ({ producto_id, tamano, cantidad, nota }) => {
  const { data } = await api.post("/pedidos", {
    tipo: "reposicion",
    items: [{ producto_id, tamano, cantidad }],
    nota: nota || null,
  });
  return data;
};

export const updatePedido = async (id, payload) => {
  const { data } = await api.put(`/pedidos/${id}`, payload);
  return data;
};

export const cancelarPedido = async (id) => {
  const { data } = await api.post(`/pedidos/${id}/cancelar`);
  return data;
};

export const aprobarPedido = async (id, payload = {}) => {
  const { data } = await api.post(`/pedidos/${id}/aprobar`, payload);
  return data;
};

export const denegarPedido = async (id, payload = {}) => {
  const { data } = await api.post(`/pedidos/${id}/denegar`, payload);
  return data;
};

// Atomic per-item decision: payload = { approved_item_ids, denied_item_ids,
// motivo_denegacion? }.  The union of both id lists must cover ALL items
// currently in RESERVA — the backend rejects partial decisions.
export const decidirPedido = async (id, payload) => {
  const { data } = await api.post(`/pedidos/${id}/decidir`, payload);
  return data;
};

// Descarga el PDF imprimible del pedido (solo disponible si está APROBADO
// o SERVIDO). Disparamos la descarga creando un blob y un enlace temporal.
export const descargarPedidoPdf = async (id) => {
  const resp = await api.get(`/pedidos/${id}/pdf`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `pedido_${id}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// ---------------- LOTES / TRAZABILIDAD ----------------

export const getLote = async (uuid) => {
  const { data } = await api.get(`/lotes/${uuid}`);
  return data;
};

export const getTrazabilidadReporte = async (uuid) => {
  const { data } = await api.get(
    `/reportes/trazabilidad/${encodeURIComponent(uuid)}`
  );
  return data;
};

export const getDistribucionReporte = async (producto) => {
  const { data } = await api.get("/reportes/distribucion", {
    params: { producto },
  });
  return data;
};

export const getStockBajoReporte = async (margenPct = 20) => {
  const { data } = await api.get("/reportes/stock-bajo", {
    params: { margen_pct: margenPct },
  });
  return data;
};

export const getMovimientosExternosReporte = async (params = {}) => {
  const { data } = await api.get("/reportes/movimientos-externos", {
    params,
  });
  return data;
};

// =========================
// COPIA DE SEGURIDAD (SOLO ADMIN)
// =========================

// Descarga toda la BD como fichero JSON. Si el navegador soporta la File
// System Access API, muestra un diálogo "Guardar como" para elegir carpeta y
// nombre; si no, cae a la descarga clásica. Devuelve el nombre guardado, o null
// si el usuario cancela el diálogo.
export const descargarBackup = async () => {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const sugerido = `viverapp_backup_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;

  // 1) Pedimos el destino ANTES de descargar (para conservar el gesto del clic).
  let handle = null;
  if (typeof window !== "undefined" && window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: sugerido,
        types: [{ description: "Copia de seguridad ViverApp", accept: { "application/json": [".json"] } }],
      });
    } catch (err) {
      if (err && err.name === "AbortError") return null; // usuario canceló
      handle = null; // otro error → descarga clásica
    }
  }

  // 2) Descargamos los datos.
  const res = await api.get("/admin/backup", { responseType: "blob" });
  const blob = res.data;

  // 3a) Guardar en la ubicación elegida.
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return handle.name || sugerido;
  }

  // 3b) Fallback: descarga clásica (carpeta por defecto del navegador).
  const cd = res.headers?.["content-disposition"] || "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  const filename = m ? m[1] : sugerido;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
};

// Restaura la BD desde un fichero de copia de seguridad.
export const restaurarBackup = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/admin/restore", form);
  return data;
};

// =========================
// ZONAS (MAPA VIVERO)
// =========================

export const getPrestamosActivos = async () => {
  const { data } = await api.get("/prestamos-activos");
  return data;
};

// =========================
// CONFIGURACIÓN DE ZONAS DEL MAPA
// =========================

export const getZonasConfig = async () => {
  const { data } = await api.get("/zonas-config");
  return data;
};

export const updateZonasConfig = async (zonas) => {
  const { data } = await api.put("/zonas-config", zonas);
  return data;
};

// =========================
// ADMIN USERS
// =========================

export const adminListUsers = async () => {
  const { data } = await api.get("/admin/users");
  return data;
};

export const adminCreateUser = async (payload) => {
  const { data } = await api.post("/admin/users", payload);
  return data;
};

export const adminUpdateUser = async (userId, payload) => {
  const { data } = await api.patch(`/admin/users/${userId}`, payload);
  return data;
};

export const adminDeleteUser = async (userId) => {
  const { data } = await api.delete(`/admin/users/${userId}`);
  return data;
};

export const adminResendInvitation = async (userId) => {
  const { data } = await api.post(`/admin/users/${userId}/resend-invitation`);
  return data;
};

export const adminResetPassword = async (userId) => {
  const { data } = await api.post(`/admin/users/${userId}/reset-password`);
  return data;
};

export const adminUnlockUser = async (userId) => {
  const { data } = await api.post(`/admin/users/${userId}/unlock`);
  return data;
};

// Diagnóstico de correo (solo admin).
export const adminEmailConfig = async () => {
  const { data } = await api.get("/admin/email-config");
  return data;
};

export const adminEmailTest = async (to) => {
  const { data } = await api.post(`/admin/email-test?to=${encodeURIComponent(to)}`);
  return data;
};

// =========================
// ACCOUNT TOKENS (public, no auth)
// =========================

export const requestPasswordReset = async (username, email) => {
  const { data } = await api.post("/auth/forgot-password", {
    username,
    email,
  });
  return data;
};

export const validateAccountToken = async (token) => {
  const { data } = await api.get(`/auth/token/${encodeURIComponent(token)}`);
  return data;
};

export const consumeAccountToken = async (token, newPassword) => {
  const { data } = await api.post(
    `/auth/token/${encodeURIComponent(token)}/consume`,
    { new_password: newPassword }
  );
  return data;
};

// =========================
// CLIENTES (AYUNTAMIENTOS) — multi-tenant
// =========================

export const getClientes = async () => {
  const { data } = await api.get("/clientes");
  return data;
};

export const createCliente = async (payload) => {
  const { data } = await api.post("/clientes", payload);
  return data;
};

export const updateCliente = async (id, payload) => {
  const { data } = await api.patch(`/clientes/${id}`, payload);
  return data;
};

// =========================
// SUPERADMIN — plataforma SaaS
// =========================

export const getSuperadminStats = async () => {
  const { data } = await api.get("/superadmin/stats");
  return data;
};

// Alta (enrollment) de un ayuntamiento nuevo + su administrador inicial.
export const enrollAyuntamiento = async (payload) => {
  const { data } = await api.post("/superadmin/enroll", payload);
  return data;
};

// =========================
// MAPA DEL VIVERO (imagen por ayuntamiento)
// =========================

// URL para pintar la imagen del mapa del ayuntamiento activo. Como necesita el
// header de auth, se descarga como blob y se devuelve un objectURL.
export const fetchMapaImagenUrl = async () => {
  try {
    const resp = await api.get("/mapa-imagen", { responseType: "blob" });
    return URL.createObjectURL(resp.data);
  } catch (err) {
    if (err?.response?.status === 404) return null; // aún sin mapa
    throw err;
  }
};

export const uploadMapaImagen = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/mapa-imagen", form);
  return data;
};

export const deleteMapaImagen = async () => {
  const { data } = await api.delete("/mapa-imagen");
  return data;
};

export default api;

