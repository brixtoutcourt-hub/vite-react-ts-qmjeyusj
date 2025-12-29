import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // Import sans l'extension .tsx pour éviter les conflits
import './index.css' // L'import CRUCIAL pour que Tailwind fonctionne

const rootElement = document.getElementById('root')

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}