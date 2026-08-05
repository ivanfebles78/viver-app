import React from "react";
import MapaVivero from "../components/vivero/MapaVivero";

export default function ViveroPage() {
  return (
    <div className="vivero-page">
      <h1 className="vivero-title">Mapa del vivero</h1>
      <MapaVivero />
    </div>
  );
}