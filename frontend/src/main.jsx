import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'

import Layout        from './components/layout/Layout'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import Clients       from './pages/Clients'
import ClientDetail  from './pages/ClientDetail'
import Terminal      from './pages/Terminal'
import RemoteDesktop from './pages/RemoteDesktop'
import Tickets       from './pages/Tickets'
import Deploy        from './pages/Deploy'
import Update        from './pages/Update'
import SSHSetup      from './pages/SSHSetup'
import ISOBuilder    from './pages/ISOBuilder'
import Logs          from './pages/Logs'
import Settings      from './pages/Settings'
import RustDeskServer from './pages/RustDeskServer'

import { useAuthStore }  from './store/authStore'
import { useThemeStore } from './store/themeStore'

function ThemeInit() {
  const apply = useThemeStore(s => s.apply)
  useEffect(() => { apply() }, [])
  return null
}

function PrivateRoute({ children }) {
  const user    = useAuthStore(s => s.user)
  const checked = useAuthStore(s => s.checked)
  const checkSession = useAuthStore(s => s.checkSession)

  useEffect(() => { if (!checked) checkSession() }, [checked, checkSession])

  if (!checked) return null
  return user ? children : <Navigate to="/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ThemeInit />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(15,31,61,.12)',
          fontSize: '13px',
          fontWeight: 500,
          padding: '12px 14px',
        },
        success: { iconTheme: { primary: 'var(--primary-green)', secondary: '#fff' } },
        error:   { iconTheme: { primary: 'var(--danger)',        secondary: '#fff' } },
      }}
    />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<Dashboard />} />
        <Route path="clients"      element={<Clients />} />
        <Route path="clients/:id"  element={<ClientDetail />} />
        <Route path="terminal/:id" element={<Terminal />} />
        <Route path="remote/:id"   element={<RemoteDesktop />} />
        <Route path="tickets"      element={<Tickets />} />
        <Route path="deploy"       element={<Deploy />} />
        <Route path="update"       element={<Update />} />
        <Route path="ssh"          element={<SSHSetup />} />
        <Route path="iso"          element={<ISOBuilder />} />
        <Route path="rustdesk"     element={<RustDeskServer />} />
        <Route path="logs"         element={<Logs />} />
        <Route path="settings"     element={<Settings />} />
      </Route>
    </Routes>
  </BrowserRouter>
)
