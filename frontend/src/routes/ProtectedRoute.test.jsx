/**
 * Pruebas de la guarda de autenticación.
 *
 * Cubren tanto el camino feliz como los tokens basura que dejaban pasar a un
 * usuario a una sesión que el backend rechazaba en la primera llamada.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

function renderAt(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>PANTALLA DE LOGIN</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>CONTENIDO PROTEGIDO</div>} />
          <Route path="/pedidos" element={<div>PEDIDOS</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("deja pasar con un token válido", () => {
    window.localStorage.setItem("token", "un.jwt.valido");
    renderAt();
    expect(screen.getByText("CONTENIDO PROTEGIDO")).toBeInTheDocument();
  });

  it("redirige al login sin token", () => {
    renderAt();
    expect(screen.getByText("PANTALLA DE LOGIN")).toBeInTheDocument();
    expect(screen.queryByText("CONTENIDO PROTEGIDO")).not.toBeInTheDocument();
  });

  it("redirige con un token vacío", () => {
    window.localStorage.setItem("token", "");
    renderAt();
    expect(screen.getByText("PANTALLA DE LOGIN")).toBeInTheDocument();
  });

  it("redirige con un token de solo espacios", () => {
    window.localStorage.setItem("token", "   ");
    renderAt();
    expect(screen.getByText("PANTALLA DE LOGIN")).toBeInTheDocument();
  });

  it('redirige con el token literal "undefined"', () => {
    // Lo que deja `localStorage.setItem("token", String(undefined))`.
    window.localStorage.setItem("token", "undefined");
    renderAt();
    expect(screen.getByText("PANTALLA DE LOGIN")).toBeInTheDocument();
  });

  it('redirige con el token literal "null"', () => {
    window.localStorage.setItem("token", "null");
    renderAt();
    expect(screen.getByText("PANTALLA DE LOGIN")).toBeInTheDocument();
  });

  it("protege todas las rutas anidadas, no solo la primera", () => {
    renderAt("/pedidos");
    expect(screen.getByText("PANTALLA DE LOGIN")).toBeInTheDocument();
    expect(screen.queryByText("PEDIDOS")).not.toBeInTheDocument();
  });

  it("la navegación directa por URL a una ruta protegida se bloquea igual", () => {
    // Escribir la URL a mano no debe eludir la guarda.
    renderAt("/dashboard");
    expect(screen.getByText("PANTALLA DE LOGIN")).toBeInTheDocument();
  });
});
