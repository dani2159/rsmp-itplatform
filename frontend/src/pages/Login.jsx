import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, User, Lock, ArrowRight, ShieldCheck, MonitorSmartphone, Activity, Ticket } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import toast from 'react-hot-toast'

const FEATURES = [
  { icon: ShieldCheck,        cls: '',       title: 'Akses Aman',       desc: 'Login terproteksi role-based' },
  { icon: MonitorSmartphone,  cls: 'green',  title: 'Monitoring Client', desc: 'Pantau semua PC real-time' },
  { icon: Activity,           cls: 'indigo', title: 'Remote Desktop',    desc: 'VNC & RustDesk dari browser' },
  { icon: Ticket,             cls: '',       title: 'IT Tickets',        desc: 'Kelola keluhan terpusat' },
]

export default function Login() {
  const [form,    setForm]    = useState({ username: '', password: '' })
  const [show,    setShow]    = useState(false)
  const [loading, setLoading] = useState(false)
  const { setUser }           = useAuthStore()
  const navigate              = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) { toast.error('Isi username dan password'); return }
    setLoading(true)
    try {
      const r = await api.post('/auth/login', form)
      setUser(r.data)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login gagal')
    } finally { setLoading(false) }
  }

  return (
    <main className="login-shell" aria-label="Login RSMP-IT Platform">
      {/* Panel hero kiri — gradient brand */}
      <section className="login-hero-panel">
        <div className="login-decor login-decor-one" aria-hidden="true" />
        <div className="login-decor login-decor-two" aria-hidden="true" />
        <div className="login-dot-grid login-dot-grid-top" aria-hidden="true" />
        <div className="login-dot-grid login-dot-grid-bottom" aria-hidden="true" />
        <div className="login-wave" aria-hidden="true" />

        <div className="login-hero-content">
          <div className="login-logo">
            <img src="/logo.png?v=2" alt="RSMP-IT Platform" />
          </div>

          <span className="badge badge-primary badge-md login-trust-badge">
            <ShieldCheck size={14} /> Khusus IT Staff RSMP
          </span>

          <div className="login-heading-stack">
            <h1 className="text-display-md">Kelola IT Rumah Sakit <span>Lebih Cepat &amp; Terpusat.</span></h1>
            <p className="text-body-lg font-medium">
              RSMP-IT Platform membantu tim IT memonitor client, remote desktop,
              deploy massal, dan menangani tiket dari satu dashboard.
            </p>
          </div>

          <div className="login-feature-grid" aria-label="Fitur RSMP-IT">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <article key={f.title} className="card login-feature-card">
                  <span className={`option-icon ${f.cls}`} aria-hidden="true"><Icon size={16} /></span>
                  <div className="option-meta">
                    <strong>{f.title}</strong>
                    <small>{f.desc}</small>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* Panel form kanan */}
      <section className="login-form-panel">
        <div className="login-card auth-card">
          <div className="login-form-head">
            <h2 className="text-h2">Masuk ke RSMP-IT</h2>
            <p className="text-body-md font-medium text-secondary">
              Gunakan username dan password akun IT Anda.
            </p>
          </div>

          <form className="login-form" onSubmit={submit} noValidate>
            <div className="field">
              <span className="label">Username</span>
              <div className="input-wrap">
                <span className="field-icon" aria-hidden="true"><User size={16} /></span>
                <input
                  className="input is-lg with-left"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="admin"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="field">
              <span className="label">Password</span>
              <div className="input-wrap">
                <span className="field-icon" aria-hidden="true"><Lock size={16} /></span>
                <input
                  type={show ? 'text' : 'password'}
                  className="input is-lg with-left with-right"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                />
                <button
                  className="btn btn-ghost btn-icon btn-sm login-password-toggle"
                  type="button"
                  onClick={() => setShow(v => !v)}
                  aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button className="btn btn-primary btn-xl btn-full login-submit" type="submit" disabled={loading}>
              <span className="btn-label">{loading ? 'Masuk...' : 'Masuk'}</span>
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        </div>

        <p className="login-copyright text-body-sm font-semibold">
          © 2026 RSMP-IT Platform · IT Support Management System
        </p>
      </section>
    </main>
  )
}
