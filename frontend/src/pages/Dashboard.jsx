import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Monitor, RefreshCw, Wifi, WifiOff, Package, Activity } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../services/api'
import clsx from 'clsx'

// Warna dipetakan ke variant metric-card design system (dashboard-widgets.css)
const METRIC_COLOR = { green:'is-green', red:'is-danger', blue:'is-blue', yellow:'is-warning', purple:'is-indigo' }

function StatCard({ label, value, sub, color, icon: Icon, onClick }) {
  const variant = METRIC_COLOR[color] || 'is-blue'
  return (
    <article onClick={onClick} className={clsx('metric-card card', variant, onClick && 'cursor-pointer')}>
      <span className={clsx('metric-icon', variant)}><Icon /></span>
      <strong className="metric-value text-h3 font-bold">{value ?? '—'}</strong>
      <span className="metric-label text-body-md muted">{label}</span>
      {sub && <span className="text-body-sm muted">{sub}</span>}
    </article>
  )
}

function StatusDot({ status }) {
  const map = {
    online:  { cls: 'bg-[var(--success)] animate-pulse-slow', label: 'Online',  col: 'var(--success)' },
    offline: { cls: 'bg-[var(--danger)]',                     label: 'Offline', col: 'var(--danger)' },
    unknown: { cls: 'bg-[var(--text-muted)]',                 label: 'Unknown', col: 'var(--text-muted)' },
  }
  const c = map[status] || map.unknown
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', c.cls)}/>
      <span style={{ color: c.col }}>{c.label}</span>
    </span>
  )
}

export default function Dashboard() {
  const [stats,   setStats]   = useState(null)
  const [clients, setClients] = useState([])
  const [tickets, setTickets] = useState(null)
  const [rdStatus, setRdStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [uptimeSummary, setUptimeSummary] = useState(null)
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [s, c, t, rd, u, al] = await Promise.all([
        api.get('/clients/stats'),
        api.get('/clients'),
        api.get('/tickets/stats/summary'),
        api.get('/rustdesk/status').catch(() => ({ data: null })),
        api.get('/clients/uptime-summary?range=7d').catch(() => ({ data: null })),
        api.get('/system/alerts').catch(() => ({ data: [] })),
      ])
      setStats(s.data)
      setClients(c.data.slice(0, 15))
      setTickets(t.data)
      setRdStatus(rd.data)
      setUptimeSummary(u.data)
      setAlerts(al.data)
      setHistory(prev => [...prev.slice(-19), {
        time: new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
        online: s.data.online,
        offline: s.data.offline,
      }])
      setLoadError(false)
    } catch(e) { setLoadError(true) }
    setLoading(false)
  }

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [])

  return (
    <div className="p-6 space-y-5">
      {/* Header — pola dashboard-hero-head design system */}
      <div className="dashboard-hero-head">
        <div>
          <h1 className="text-h2 page-title">Dashboard</h1>
          <p className="text-body-md muted">RSMP-IT Platform · {new Date().toLocaleString('id-ID')}</p>
        </div>
        <div className="flex items-center gap-2">
          {loadError && (
            <span className="badge badge-red text-[10px]">Gagal memuat data terbaru</span>
          )}
          <button onClick={load} className="btn btn-ghost btn-sm">
            <RefreshCw size={13}/> Refresh
          </button>
        </div>
      </div>

      {/* Stats — metric-grid design system */}
      <div className="metric-grid grid-cols-2 lg:grid-cols-5">
        <StatCard label="Online"   value={stats?.online}        color="green"  icon={Wifi}      onClick={() => navigate('/clients?status=online')}/>
        <StatCard label="Offline"  value={stats?.offline}       color="red"    icon={WifiOff}   onClick={() => navigate('/clients?status=offline')}/>
        <StatCard label="Linux"    value={stats?.linux}         color="blue"   icon={Monitor}   onClick={() => navigate('/clients?os=linux')}/>
        <StatCard label="Windows"  value={stats?.windows}       color="purple" icon={Monitor}   onClick={() => navigate('/clients?os=windows')}/>
        <StatCard label="Updates"  value={stats?.total_updates} color="yellow" icon={Package}   sub="paket pending"/>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Client table */}
        <div className="col-span-2 card">
          <div className="card-header">
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Status Client Terkini</span>
            <button onClick={() => navigate('/clients')} className="btn btn-ghost btn-sm">Semua →</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Nama</th><th>IP</th><th>OS</th><th>Status</th><th>CPU</th><th>RAM</th><th>Update</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Memuat...</td></tr>
                ) : clients.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Belum ada client</td></tr>
                ) : clients.map(c => (
                  <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="cursor-pointer">
                    <td>
                      <div className="font-medium text-xs" style={{ color: 'var(--text)' }}>{c.name}</div>
                      {c.hostname && <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{c.hostname}</div>}
                    </td>
                    <td className="font-mono text-xs">{c.ip_address}</td>
                    <td>
                      <span className={clsx('badge text-[10px]', c.os_type==='linux'?'badge-blue':'badge-purple')}>
                        {c.os_type}
                      </span>
                    </td>
                    <td><StatusDot status={c.status}/></td>
                    <td className="font-mono text-xs">{c.cpu_usage != null ? `${c.cpu_usage.toFixed(0)}%` : '—'}</td>
                    <td className="font-mono text-xs">{c.ram_usage != null ? `${c.ram_usage.toFixed(0)}%` : '—'}</td>
                    <td>
                      {c.packages_pending > 0
                        ? <span className="badge badge-yellow text-[10px]">{c.packages_pending}</span>
                        : <span style={{ color: 'var(--text-muted)' }} className="text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          {/* Alert terakhir */}
          <div className="dashboard-widget card p-4">
            <div className="dashboard-widget-head">
              <h2 className="text-h4">Alert Terakhir</h2>
            </div>
            {alerts.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Belum ada alert</div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {alerts.slice(0, 10).map(a => (
                  <div key={a.id}
                    onClick={() => a.client_id && navigate(`/clients/${a.client_id}`)}
                    className={clsx('flex items-start justify-between gap-2 text-[11px] py-0.5', a.client_id && 'cursor-pointer')}>
                    <span style={{ color:
                      a.type === 'offline' ? 'var(--danger)' :
                      a.type === 'online'  ? 'var(--success)' :
                      a.type.endsWith('-ok') ? 'var(--success)' : 'var(--warn)' }}>
                      {a.message}
                    </span>
                    <span className="font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {new Date(a.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tickets */}
          <div className="dashboard-widget card p-4">
            <div className="dashboard-widget-head">
              <h2 className="text-h4">IT Tickets</h2>
            </div>
            <div className="space-y-2">
              {[
                { label:'Open',         val:tickets?.open,         color:'var(--danger)' },
                { label:'In Progress',  val:tickets?.in_progress,  color:'var(--warn)' },
                { label:'Closed',       val:tickets?.closed,       color:'var(--success)' },
                { label:'High Priority',val:tickets?.high_priority,color:'var(--danger)' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text2)' }}>{item.label}</span>
                  <span className="font-mono font-semibold text-sm" style={{ color: item.color }}>
                    {item.val ?? '—'}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/tickets')} className="btn btn-ghost btn-sm w-full justify-center mt-3">
              Kelola Tickets
            </button>
          </div>

          {/* Online trend chart */}
          <div className="dashboard-widget card p-4">
            <div className="dashboard-widget-head">
              <h2 className="text-h4">Online Trend</h2>
            </div>
            <ResponsiveContainer width="100%" height={70}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="online" stroke="var(--accent)" strokeWidth={1.5} fill="url(#cg)" dot={false}/>
                <Tooltip
                  contentStyle={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                  labelStyle={{ color:'var(--text2)' }}
                  itemStyle={{ color:'var(--accent)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Fleet uptime (7d) */}
          <div className="dashboard-widget card p-4">
            <div className="dashboard-widget-head">
              <h2 className="text-h4">Fleet Uptime · 7 Hari</h2>
            </div>
            {uptimeSummary ? (
              <>
                <div className="text-2xl font-mono font-semibold mb-2"
                  style={{ color: uptimeSummary.fleetAveragePercent >= 99 ? 'var(--success)' : uptimeSummary.fleetAveragePercent >= 95 ? 'var(--warn)' : 'var(--danger)' }}>
                  {uptimeSummary.fleetAveragePercent.toFixed(2)}%
                </div>
                {uptimeSummary.worst.filter(w => w.uptimePercent < 100).length > 0 && (
                  <div className="space-y-1">
                    <div className="text-body-xs muted uppercase tracking-wide mb-1">
                      Paling Bermasalah
                    </div>
                    {uptimeSummary.worst.filter(w => w.uptimePercent < 100).map(w => (
                      <div key={w.clientId} onClick={() => navigate(`/clients/${w.clientId}`)}
                        className="flex items-center justify-between cursor-pointer text-[11px] py-0.5">
                        <span style={{ color: 'var(--text2)' }}>{w.name}</span>
                        <span className="font-mono" style={{ color: 'var(--danger)' }}>{w.uptimePercent.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Tidak ada data</div>
            )}
          </div>

          {/* RustDesk server status */}
          <div className="dashboard-widget card p-4">
            <div className="dashboard-widget-head">
              <h2 className="text-h4">RustDesk Server</h2>
            </div>
            {rdStatus ? (
              <div className="space-y-1.5">
                {[
                  { label:'hbbs (signal)', running: rdStatus.hbbs?.running },
                  { label:'hbbr (relay)',  running: rdStatus.hbbr?.running },
                ].map(svc => (
                  <div key={svc.label} className="flex items-center justify-between">
                    <span className="text-xs font-mono" style={{ color: 'var(--text2)' }}>{svc.label}</span>
                    <span className={clsx('badge text-[10px]', svc.running ? 'badge-green' : 'badge-red')}>
                      {svc.running ? 'Running' : 'Stopped'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Tidak terdeteksi</div>
            )}
            <button onClick={() => navigate('/rustdesk')} className="btn btn-ghost btn-sm w-full justify-center mt-3">
              Kelola RustDesk
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
