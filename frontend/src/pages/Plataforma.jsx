import React, { useEffect, useMemo, useState } from "react";
import { getSuperadminStats, enrollAyuntamiento, setActiveClienteId, updateCliente } from "../api/api";

// ── estilos base (inline, como el resto de la app) ──────────────────────────
const card = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 10px 24px rgba(2,6,23,0.05)",
};
const label = { fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 };
const kpiNum = { fontSize: 30, fontWeight: 900, color: "#0f172a", lineHeight: 1.1 };

const money = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);

// ── Gráfica SVG (línea de ayuntamientos acumulados por mes) ─────────────────
function EvolucionChart({ data }) {
  const W = 640, H = 220, P = 34;
  if (!data || data.length === 0) {
    return <div style={{ color: "#94a3b8", padding: 20 }}>Aún no hay altas registradas.</div>;
  }
  const pts = data.map((d) => ({ x: d.mes, y: d.acumulado }));
  const maxY = Math.max(1, ...pts.map((p) => p.y));
  const stepX = pts.length > 1 ? (W - 2 * P) / (pts.length - 1) : 0;
  const px = (i) => P + i * stepX;
  const py = (v) => H - P - (v / maxY) * (H - 2 * P);
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(p.y)}`).join(" ");
  const areaPath = `${linePath} L ${px(pts.length - 1)} ${H - P} L ${px(0)} ${H - P} Z`;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, minWidth: 360 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* rejilla horizontal */}
        {[0, 0.5, 1].map((f, i) => {
          const y = H - P - f * (H - 2 * P);
          return (
            <g key={i}>
              <line x1={P} y1={y} x2={W - P} y2={y} stroke="#eef2f7" strokeWidth="1" />
              <text x={8} y={y + 4} fontSize="11" fill="#94a3b8">{Math.round(f * maxY)}</text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={linePath} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={px(i)} cy={py(p.y)} r="4" fill="#059669" />
            <text x={px(i)} y={H - P + 16} fontSize="10" fill="#64748b" textAnchor="middle">{p.x}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const EMPTY_FORM = {
  nombre: "", slug: "", cif: "", direccion: "", email_contacto: "", telefono: "",
  admin_username: "", admin_email: "", admin_rol: "admin",
};

export default function Plataforma() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState(null);
  // Edición de la cuota de un ayuntamiento: {id, value} o null.
  const [editCuota, setEditCuota] = useState(null);
  const [cuotaBusy, setCuotaBusy] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getSuperadminStats();
      setStats(data);
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudieron cargar las estadísticas.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  // Autocompletar slug a partir del nombre si el usuario no lo ha tocado.
  const onNombre = (v) => {
    setForm((f) => {
      const autoSlug = v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const slugTouched = f.slug && f.slug !== f._autoSlug;
      return { ...f, nombre: v, slug: slugTouched ? f.slug : autoSlug, _autoSlug: autoSlug };
    });
  };

  const submitEnroll = async (e) => {
    e.preventDefault();
    setEnrollBusy(true);
    setEnrollMsg(null);
    try {
      const payload = {
        nombre: form.nombre, slug: form.slug, cif: form.cif || null,
        direccion: form.direccion || null, email_contacto: form.email_contacto || null,
        telefono: form.telefono || null, admin_username: form.admin_username,
        admin_email: form.admin_email, admin_rol: form.admin_rol,
      };
      const res = await enrollAyuntamiento(payload);
      setEnrollMsg({
        ok: true,
        text: `Ayuntamiento "${res.cliente.nombre}" (id ${res.cliente.id}) creado. ` +
          (res.email_invitacion_enviado
            ? `Se envió invitación a ${res.admin.email}.`
            : `Aviso: no se pudo enviar el email de invitación a ${res.admin.email} (revisa la config de correo).`),
      });
      setForm(EMPTY_FORM);
      cargar();
    } catch (err) {
      setEnrollMsg({ ok: false, text: err?.response?.data?.detail || "No se pudo crear el ayuntamiento." });
    } finally {
      setEnrollBusy(false);
    }
  };

  const resumen = stats?.resumen;
  const fact = stats?.facturacion;

  const kpis = useMemo(() => ([
    { k: "Ayuntamientos", v: resumen?.ayuntamientos_total, sub: `${resumen?.ayuntamientos_activos ?? 0} activos` },
    { k: "Usuarios", v: resumen?.usuarios_total },
    { k: "Productos", v: resumen?.productos_total },
    { k: "Pedidos", v: resumen?.pedidos_total },
    { k: "Movimientos", v: resumen?.movimientos_total },
  ]), [resumen]);

  const entrarComo = (cid) => {
    // El superadmin "entra" en un ayuntamiento: fija el X-Cliente-Id y va al panel.
    setActiveClienteId(cid);
    window.location.assign("/dashboard");
  };

  // Guarda la cuota de un ayuntamiento. value === "" o null => quita el
  // descuento (vuelve a la cuota por defecto de la plataforma).
  const guardarCuota = async (clienteId, value) => {
    setCuotaBusy(true);
    try {
      const raw = String(value ?? "").trim().replace(",", ".");
      const num = raw === "" ? null : Number(raw);
      if (num !== null && (Number.isNaN(num) || num < 0)) {
        alert("Introduce una cuota válida (número ≥ 0) o vacío para la cuota por defecto.");
        setCuotaBusy(false);
        return;
      }
      await updateCliente(clienteId, { set_cuota: true, cuota_mensual: num });
      setEditCuota(null);
      cargar();
    } catch (err) {
      alert(err?.response?.data?.detail || "No se pudo actualizar la cuota.");
    } finally {
      setCuotaBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: 0 }}>
          Panel de plataforma
        </h1>
        <p style={{ color: "#64748b", marginTop: 4 }}>
          Gestión SaaS de ViverApp — ayuntamientos, uso y facturación.
        </p>
      </div>

      {error && <div style={{ ...card, borderColor: "#fecaca", color: "#b91c1c" }}>{error}</div>}
      {loading && <div style={{ color: "#94a3b8" }}>Cargando estadísticas…</div>}

      {stats && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            {kpis.map((k) => (
              <div key={k.k} style={card}>
                <div style={label}>{k.k}</div>
                <div style={kpiNum}>{k.v ?? 0}</div>
                {k.sub && <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Facturación + gráfica */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 14 }}>
            <div style={{ ...card, background: "linear-gradient(135deg,#065f46,#047857)", color: "#ecfdf5", border: "none" }}>
              <div style={{ ...label, color: "#a7f3d0" }}>Facturación estimada</div>
              <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{money(fact?.ingreso_mensual_estimado)}<span style={{ fontSize: 15, fontWeight: 700 }}>/mes</span></div>
              <div style={{ marginTop: 4, color: "#d1fae5" }}>{money(fact?.ingreso_anual_estimado)} / año</div>
              <div style={{ marginTop: 12, fontSize: 13, color: "#d1fae5" }}>
                {fact?.ayuntamientos_facturables} ayuntamientos facturables · cuota por defecto {money(fact?.cuota_mensual_por_defecto)}/mes
              </div>
            </div>
            <div style={card}>
              <div style={{ ...label, marginBottom: 8 }}>Evolución de altas (acumulado)</div>
              <EvolucionChart data={stats.evolucion_altas} />
            </div>
          </div>

          {/* Tabla por ayuntamiento */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 10 }}>Uso por ayuntamiento</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "8px 10px" }}>Ayuntamiento</th>
                    <th style={{ padding: "8px 10px" }}>Estado</th>
                    <th style={{ padding: "8px 10px" }}>Usuarios</th>
                    <th style={{ padding: "8px 10px" }}>Productos</th>
                    <th style={{ padding: "8px 10px" }}>Pedidos</th>
                    <th style={{ padding: "8px 10px" }}>Movimientos</th>
                    <th style={{ padding: "8px 10px" }}>Cuota</th>
                    <th style={{ padding: "8px 10px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.por_cliente.map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: "#0f172a" }}>{c.nombre}<div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{c.slug} · id {c.id}</div></td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: c.activo ? "#dcfce7" : "#fee2e2", color: c.activo ? "#166534" : "#991b1b" }}>
                          {c.activo ? "activo" : "inactivo"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px" }}>{c.usuarios}</td>
                      <td style={{ padding: "8px 10px" }}>{c.productos}</td>
                      <td style={{ padding: "8px 10px" }}>{c.pedidos}</td>
                      <td style={{ padding: "8px 10px" }}>{c.movimientos}</td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {editCuota && editCuota.id === c.id ? (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="number" min="0" step="1" autoFocus
                              value={editCuota.value}
                              onChange={(e) => setEditCuota({ id: c.id, value: e.target.value })}
                              placeholder="por defecto"
                              style={{ width: 90, padding: "5px 8px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                            />
                            <button onClick={() => guardarCuota(c.id, editCuota.value)} disabled={cuotaBusy}
                              style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, cursor: "pointer" }}>✓</button>
                            <button onClick={() => setEditCuota(null)} disabled={cuotaBusy}
                              style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}>✕</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setEditCuota({ id: c.id, value: c.cuota_personalizada ? c.cuota_mensual : "" })}
                            title="Editar cuota (vacío = cuota por defecto)"
                            style={{ padding: "5px 10px", borderRadius: 8, border: "1px dashed #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, color: "#0f172a" }}
                          >
                            {money(c.cuota_mensual)}{c.cuota_personalizada && <span style={{ color: "#059669", fontSize: 11, marginLeft: 4 }} title="Cuota personalizada">●</span>}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <button onClick={() => entrarComo(c.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontWeight: 700, cursor: "pointer", color: "#0f172a" }}>
                          Entrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Enrollment */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 10 }}>Dar de alta un ayuntamiento (enrollment)</div>
            <form onSubmit={submitEnroll} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                <Field label="Nombre del ayuntamiento *" value={form.nombre} onChange={onNombre} placeholder="Ayuntamiento de La Laguna" />
                <Field label="Slug (identificador) *" value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} placeholder="la-laguna" />
                <Field label="CIF" value={form.cif} onChange={(v) => setForm((f) => ({ ...f, cif: v }))} />
                <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm((f) => ({ ...f, telefono: v }))} />
                <Field label="Email de contacto" value={form.email_contacto} onChange={(v) => setForm((f) => ({ ...f, email_contacto: v }))} />
                <Field label="Dirección" value={form.direccion} onChange={(v) => setForm((f) => ({ ...f, direccion: v }))} />
              </div>
              <div style={{ ...label, marginTop: 4 }}>Administrador inicial de ese ayuntamiento</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                <Field label="Usuario admin *" value={form.admin_username} onChange={(v) => setForm((f) => ({ ...f, admin_username: v }))} placeholder="admin_laguna" />
                <Field label="Email del admin *" value={form.admin_email} onChange={(v) => setForm((f) => ({ ...f, admin_email: v }))} placeholder="admin@laguna.es" />
                <div>
                  <div style={{ ...label, marginBottom: 4 }}>Rol</div>
                  <select value={form.admin_rol} onChange={(e) => setForm((f) => ({ ...f, admin_rol: e.target.value }))}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
                    <option value="admin">admin (administrador del ayuntamiento)</option>
                    <option value="admin_vivero">admin_vivero (admin del vivero)</option>
                  </select>
                </div>
              </div>
              {enrollMsg && (
                <div style={{ padding: "10px 12px", borderRadius: 10, fontWeight: 600, background: enrollMsg.ok ? "#ecfdf5" : "#fef2f2", color: enrollMsg.ok ? "#065f46" : "#b91c1c", border: `1px solid ${enrollMsg.ok ? "#a7f3d0" : "#fecaca"}` }}>
                  {enrollMsg.text}
                </div>
              )}
              <div>
                <button type="submit" disabled={enrollBusy}
                  style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: "#059669", color: "#fff", fontWeight: 800, cursor: enrollBusy ? "default" : "pointer", opacity: enrollBusy ? 0.7 : 1 }}>
                  {enrollBusy ? "Creando…" : "Dar de alta ayuntamiento"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label: lb, value, onChange, placeholder }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>{lb}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
      />
    </label>
  );
}
