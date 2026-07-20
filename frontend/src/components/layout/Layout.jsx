import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Monitor, Ticket, Rocket, RefreshCw,
  Key, Disc, ScrollText, Settings, LogOut, Radio,
  Menu, ChevronDown
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import api from '../../services/api'
import clsx from 'clsx'

const NAV = [
  { section: true },
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients',    icon: Monitor,         label: 'Semua Client' },
  { to: '/tickets',    icon: Ticket,          label: 'IT Tickets' },
  { section: true },
  { to: '/deploy',     icon: Rocket,          label: 'Deploy Massal' },
  { to: '/update',     icon: RefreshCw,       label: 'Update Control' },
  { to: '/ssh',        icon: Key,             label: 'SSH Key Setup' },
  { to: '/iso',        icon: Disc,            label: 'ISO Builder' },
  { to: '/rustdesk',   icon: Radio,           label: 'RustDesk Server' },
  { section: true },
  { to: '/logs',       icon: ScrollText,      label: 'Audit Log' },
  { to: '/settings',   icon: Settings,        label: 'Pengaturan' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const [stats,     setStats]     = useState(null)

  useEffect(() => {
    const load = () => api.get('/clients/stats')
      .then(r => setStats(r.data))
      .catch(() => {})
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className={clsx('layout-preview dashboard-layout', collapsed && 'is-sidebar-collapsed')}
         style={{ width: '100%', minHeight: '100vh', height: '100vh', border: 0, borderRadius: 0, boxShadow: 'none' }}>

      {/* Sidebar — gradient biru-teal SIMRS */}
      <aside className={clsx('app-sidebar', collapsed && 'compact')}
             style={{ minHeight: '100vh', height: '100vh', maxHeight: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>

        {/* Brand — logo penuh saat expanded, logo icon saat compact (otomatis via CSS) */}
        <div className="sidebar-head">
          <div className="brand-lockup">
            <img className="brand-logo-full" src="/logo.png?v=2" alt="RSMP-IT Platform" />
            <img className="brand-logo-icon" src="/logo2.png?v=2" alt="RSMP-IT" />
          </div>
        </div>

        {/* User card */}
        <div className="sidebar-user-info" role="button" tabIndex={0}>
          <span className="sidebar-user-avatar" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary-blue)', fontWeight: 700, fontSize: 13,
          }}>
            {user?.username?.[0]?.toUpperCase()}
          </span>
          {!collapsed && (
            <span className="sidebar-user-meta">
              <span className="sidebar-user-name">{user?.fullName || user?.username}</span>
              <span className="sidebar-user-role" style={{ textTransform: 'capitalize' }}>{user?.role}</span>
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-section" aria-label="Menu utama RSMP-IT">
          {NAV.map((item, i) => {
            if (item.section) {
              return i === 0 ? null : <div key={i} className="sidebar-separator" />
            }
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => clsx('nav-item', isActive && 'active')}
                data-tooltip={item.label}
                title={collapsed ? item.label : undefined}
              >
                <span className="nav-icon"><Icon /></span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-spacer" />
      </aside>

      {/* Main */}
      <div className="app-main" style={{ minHeight: '100vh', overflow: 'hidden' }}>
        <header className="app-header">
          <button
            className="icon-btn header-menu-btn"
            type="button"
            aria-label={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}
            onClick={() => setCollapsed(v => !v)}
          >
            <Menu size={18} />
          </button>

          {/* Status client */}
          {stats && (
            <div className="flex items-center gap-2">
              <span className="badge badge-success badge-sm">
                <span className="badge-dot" /> {stats.online} online
              </span>
              {stats.offline > 0 && (
                <span className="badge badge-danger badge-sm">
                  <span className="badge-dot" /> {stats.offline} offline
                </span>
              )}
              {stats.total_updates > 0 && (
                <span className="badge badge-warning badge-sm">{stats.total_updates} update</span>
              )}
            </div>
          )}

          <div className="topbar-spacer" />

          <div className="header-actions">
            {/* Profil + logout */}
            <details className="ds-dropdown">
              <summary className="profile-menu" aria-label="Buka menu profil">
                <span className="profile-avatar">
                  {user?.username?.[0]?.toUpperCase()}
                  <span className="profile-status" />
                </span>
                <span className="profile-copy">
                  <span className="profile-name">{user?.fullName || user?.username}</span>
                  <span className="profile-role" style={{ textTransform: 'capitalize' }}>{user?.role}</span>
                </span>
                <ChevronDown size={14} style={{ color: 'var(--slate)' }} />
              </summary>
              <div className="dropdown-panel compact" style={{ right: 0, left: 'auto', width: 220 }} role="menu">
                <div className="dropdown-group-label">Akun</div>
                <button className="dropdown-option" type="button" role="menuitem" onClick={logout}>
                  <span className="option-meta">
                    <strong className="flex items-center gap-2"><LogOut size={13} /> Keluar</strong>
                    <small>Keluar dari RSMP-IT Platform</small>
                  </span>
                </button>
              </div>
            </details>
          </div>
        </header>

        <main className="dashboard-content" style={{ padding: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
