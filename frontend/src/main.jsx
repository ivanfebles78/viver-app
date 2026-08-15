import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// El puente de Tailwind, que a su vez importa los tokens de DevCon8. Es la
// única hoja global de la aplicación: sustituye a index.css y App.css, que eran
// el andamiaje de Vite sin tocar.
import './styles/theme.css'
// Capa propia de ViverApp: se importa DESPUÉS del puente para poder corregir
// lo que venga de aguas arriba sin editar el código vendorizado.
import './styles/app.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
