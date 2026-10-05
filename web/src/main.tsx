import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PhoneController from './PhoneController'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.pathname.replace(/\/$/, '') === '/controller' ? <PhoneController /> : <App />}</StrictMode>,
)
