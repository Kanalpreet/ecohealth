import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable font (bundled woff2, no Google Fonts requests).
import '@fontsource-variable/plus-jakarta-sans'
import './styles/index.css'
import { App } from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
