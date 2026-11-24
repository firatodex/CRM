import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import AlertTest from './components/AlertTest.jsx'
import './index.css'
import './revenue-chart-fix.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <AlertTest />
      <App />
    </AuthGate>
  </React.StrictMode>
)
