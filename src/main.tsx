import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('No se ha encontrado el contenedor #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
