import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./layout/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Productos from "./pages/Productos";
import Movimientos from "./pages/Movimientos";
import Pedidos from "./pages/Pedidos";
import Aprobaciones from "./pages/Aprobaciones";
import Informes from "./pages/Informes";
import Lotetracking from "./pages/Lotetracking";
import ViveroPage from "./pages/ViveroPage";
import AdminUsuarios from "./pages/AdminUsuarios";// force rebuild
import CuentaToken from "./pages/CuentaToken";



export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login onLoggedIn={() => {}} />} />
        <Route path="/activar/:token" element={<CuentaToken purposeOverride="activate" />} />
        <Route path="/reset-password/:token" element={<CuentaToken purposeOverride="reset" />} />
        <Route path="/desbloquear/:token" element={<CuentaToken purposeOverride="unlock" />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/productos" element={<Productos />} />
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/aprobaciones" element={<Aprobaciones />} />
            <Route path="/informes" element={<Informes />} />
			<Route path="/lotes" element={<Lotetracking />} />
			<Route path="/vivero" element={<ViveroPage />} />
			<Route path="/admin/usuarios" element={<AdminUsuarios />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
