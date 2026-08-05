import { Navigate, Outlet } from "react-router-dom";
import { getStoredToken } from "../api/api";

export default function ProtectedRoute() {
  const token = getStoredToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}