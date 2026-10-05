import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AssociatePortal } from './components/AssociatePortal'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.startsWith('/associado') ? (
      <AssociatePortal />
    ) : (
      <App />
    )}
  </StrictMode>,
)

