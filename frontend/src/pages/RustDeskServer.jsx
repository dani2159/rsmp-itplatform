import React, { useState, useEffect } from 'react'
import { Radio, RefreshCw, Play, Square, Copy, Download, Server, Eye, EyeOff, CheckCircle, XCircle, Terminal } from 'lucide-react'
import api from '../services/api'
import { copyText } from '../services/clipboard'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function SvcCard({ name, port, running, onRestart }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server size={14} style={{ color: 'var(--accent)' }}/>
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{name}</span>
        </div>
        <span className={clsx('badge text-[10px]', running ? 'badge-green' : 'badge-red')}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', running ? 'bg-[var(--success)] animate-pulse-slow' : 'bg-[var(--danger)]')}/>
          {running ? 'Running' : 'Stopped'}
        </span>
      </div>
      <div className="text-[10px] font-mono mb-3" style={{ color: 'var(--text-muted)' }}>Port: {port}</div>
      <button onClick={onRestart} className="btn btn-ghost btn-sm w-full justify-center">
        <RefreshCw size={12}/> Restart
      </button>
    </div>
  )
}

export default function RustDeskServer() {
  const [status,    setStatus]    = useState(null)
  const [config,    setConfig]    = useState(null)
  const [logs,      setLogs]      = useState({ hbbs: '', hbbr: '' })
  const [logSvc,    setLogSvc]    = useState('hbbs')
  const [showKey,   setShowKey]   = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [clients,   setClients]   = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const [s, c, cl] = await Promise.all([
        api.get('/rustdesk/status'),
        api.get('/rustdesk/config-string'),
        api.get('/clients?os_type=linux'),
      ])
      setStatus(s.data)
      setConfig(c.data)
      setClients(cl.data)
    } catch(e) { toast.error('Gagal memuat data RustDesk') }
    setLoading(false)
  }

  const loadLogs = async (svc = logSvc) => {
    try {
      const r = await api.get(`/rustdesk/logs?service=${svc}&lines=80`)
      setLogs(prev => ({ ...prev, [svc]: r.data.logs }))
    } catch(e) {}
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadLogs(logSvc) }, [logSvc])

  const restart = async (svc) => {
    try {
      await api.post('/rustdesk/restart', { service: svc })
      toast.success(`${svc} restarted`)
      setTimeout(load, 1500)
    } catch(e) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  const deployAll = async () => {
    if (!clients.length) { toast.error('Belum ada Linux client'); return }
    setDeploying(true)
    try {
      const ids = clients.map(c => c.id)
      const r = await api.post('/rustdesk/deploy-config-bulk', { clientIds: ids })
      const ok = r.data.results.filter(x => x.ok).length
      toast.success(`Config RustDesk berhasil dikirim ke ${ok}/${r.data.results.length} client`)
      const failed = r.data.results.filter(x => !x.ok)
      failed.forEach(f => toast.error(`${f.name}: ${f.error}`))
    } catch(e) { toast.error(e.response?.data?.error || 'Gagal') }
    setDeploying(false)
  }

  const copy = (text, label) => {
    copyText(text).then(() => toast.success(`${label} disalin`)).catch(() => toast.error('Gagal menyalin'))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-muted)' }}>
      <RefreshCw size={20} className="animate-spin mr-2"/> Memuat...
    </div>
  )

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 page-title">RustDesk Server</h1>
          <p className="text-body-sm muted">
            Self-hosted standalone — hbbs + hbbr
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-ghost btn-sm">
            <RefreshCw size={12}/> Refresh
          </button>
          <button onClick={deployAll} disabled={deploying} className="btn btn-primary btn-sm">
            {deploying
              ? <><RefreshCw size={12} className="animate-spin"/> Deploying...</>
              : <><Radio size={12}/> Deploy Config ke Semua Client</>}
          </button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-4">
        <SvcCard
          name="hbbs — Signal/Rendezvous Server"
          port="21115, 21116 TCP/UDP, 21118 WS"
          running={status?.hbbs?.running}
          onRestart={() => restart('hbbs')}
        />
        <SvcCard
          name="hbbr — Relay Server"
          port="21117 TCP, 21119 WS"
          running={status?.hbbr?.running}
          onRestart={() => restart('hbbr')}
        />
      </div>

      <div className="grid grid-cols-2 gap-5 items-start">
        {/* Kiri: Config */}
        <div className="space-y-4">

          {/* Server info */}
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Konfigurasi Server</span>
              <span className={clsx('badge text-[10px]', status?.overall ? 'badge-green' : 'badge-red')}>
                {status?.overall ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: 'ID Server (hbbs)', value: config?.host, copy: true },
                { label: 'Relay Server (hbbr)', value: config?.relay, copy: true },
              ].map(item => (
                <div key={item.label}>
                  <div className="text-[10px] font-mono uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
                    {item.label}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded px-3 py-2 font-mono text-xs"
                         style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                      {item.value || '—'}
                    </div>
                    {item.copy && item.value && (
                      <button onClick={() => copy(item.value, item.label)} className="btn btn-ghost btn-sm">
                        <Copy size={12}/>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Public Key — hidden */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
                    Public Key (Encryption Key)
                  </span>
                  <button onClick={() => setShowKey(v => !v)}
                    className="flex items-center gap-1 text-[10px]"
                    style={{ color: 'var(--text-muted)' }}>
                    {showKey ? <EyeOff size={11}/> : <Eye size={11}/>}
                    {showKey ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 rounded px-3 py-2 font-mono text-[10px] break-all"
                       style={{ background: 'var(--terminal-bg)', border: '1px solid var(--border)' }}>
                    <span className={clsx('transition-all',
                      showKey ? 'text-[var(--success)]' : 'tracking-[0.2em]'
                    )} style={{ color: showKey ? 'var(--success)' : 'var(--text-muted)' }}>
                      {showKey ? (config?.pubKey || '—') : '••••••••••••••••••••••••••••••••••••••••••'}
                    </span>
                  </div>
                  {config?.pubKey && (
                    <button onClick={() => copy(config.pubKey, 'Public Key')} className="btn btn-ghost btn-sm">
                      <Copy size={12}/>
                    </button>
                  )}
                </div>
              </div>

              {/* Config string untuk client */}
              {config?.configStr && (
                <div>
                  <div className="text-[10px] font-mono uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
                    Config String (untuk input ke RustDesk Client)
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded px-3 py-2 font-mono text-[10px] break-all"
                         style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                      {config.configStr}
                    </div>
                    <button onClick={() => copy(config.configStr, 'Config string')} className="btn btn-ghost btn-sm">
                      <Copy size={12}/>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Panduan setup client */}
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Cara Konfigurasi Client</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs space-y-2" style={{ color: 'var(--text2)' }}>
                <div className="font-semibold" style={{ color: 'var(--text)' }}>Di PC client (Windows/Linux):</div>
                <div className="flex items-start gap-2">
                  <span className="badge badge-blue text-[10px] flex-shrink-0 mt-0.5">1</span>
                  <span>Buka RustDesk → klik ikon ⋮ di kanan atas → <b>Network</b></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="badge badge-blue text-[10px] flex-shrink-0 mt-0.5">2</span>
                  <span>Unlock settings → isi <b>ID Server</b>: <code className="font-mono text-[var(--accent)]">{config?.host || 'IP_SERVER'}</code></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="badge badge-blue text-[10px] flex-shrink-0 mt-0.5">3</span>
                  <span>Isi <b>Relay Server</b>: <code className="font-mono text-[var(--accent)]">{config?.relay || 'IP_SERVER:21117'}</code></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="badge badge-blue text-[10px] flex-shrink-0 mt-0.5">4</span>
                  <span>Isi <b>Key</b> dengan public key di atas → klik OK</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="badge badge-green text-[10px] flex-shrink-0 mt-0.5">5</span>
                  <span>RustDesk akan menampilkan ID baru dari server RS ini</span>
                </div>
              </div>

              <div className="rounded p-3 text-[10px] font-mono space-y-1"
                   style={{ background: 'var(--terminal-bg)', color: 'var(--text-muted)' }}>
                <div style={{ color: 'var(--text2)' }}># Linux client — otomatis via deploy:</div>
                <div style={{ color: 'var(--success)' }}>
                  mkdir -p ~/.config/rustdesk && cat &gt; ~/.config/rustdesk/RustDesk2.toml &lt;&lt; EOF
                </div>
                <div>[options]</div>
                <div>custom-rendezvous-server = "{config?.host}"</div>
                <div>relay-server = "{config?.relay}"</div>
                <div>key = "{showKey ? config?.pubKey : '***'}"</div>
                <div style={{ color: 'var(--success)' }}>EOF</div>
              </div>

              <button onClick={deployAll} disabled={deploying}
                className="btn btn-success btn-sm w-full justify-center">
                {deploying
                  ? <><RefreshCw size={12} className="animate-spin"/> Deploying...</>
                  : <><Radio size={12}/> Auto Deploy ke {clients.length} Linux Client</>}
              </button>
            </div>
          </div>
        </div>

        {/* Kanan: Logs */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Server Logs</span>
              <div className="flex gap-2">
                <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {['hbbs', 'hbbr'].map(s => (
                    <button key={s} onClick={() => { setLogSvc(s); loadLogs(s) }}
                      className="px-3 py-1 text-xs font-mono transition-colors"
                      style={{
                        background: logSvc === s ? 'var(--accent)' : 'var(--bg3)',
                        color: logSvc === s ? '#fff' : 'var(--text2)'
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
                <button onClick={() => loadLogs(logSvc)} className="btn btn-ghost btn-sm btn-icon">
                  <RefreshCw size={12}/>
                </button>
              </div>
            </div>
            <div className="terminal-box m-3 h-80 text-[11px] whitespace-pre-wrap overflow-auto">
              {logs[logSvc] || <span style={{ color: 'var(--text-muted)' }}>Log kosong atau service belum berjalan...</span>}
            </div>
          </div>

          {/* Client list dengan RustDesk ID */}
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Client dengan RustDesk ID ({clients.filter(c => c.rustdesk_id).length}/{clients.length})
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {clients.length === 0 ? (
                <div className="p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  Belum ada Linux client terdaftar
                </div>
              ) : clients.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b"
                     style={{ borderColor: 'var(--border)' }}>
                  <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                    c.status === 'online' ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]')}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{c.ip_address}</div>
                  </div>
                  {c.rustdesk_id ? (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>
                        {c.rustdesk_id}
                      </span>
                      <button onClick={() => copy(c.rustdesk_id, 'RustDesk ID')}
                        className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                        <Copy size={10}/>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No ID</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
