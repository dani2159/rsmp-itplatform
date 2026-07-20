// ══════════════════════════════════════════════════
//  RSMP-IT — Logs.jsx
// ══════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import api from '../services/api'
import clsx from 'clsx'

export default function Logs() {
  const [tab,     setTab]     = useState('audit')
  const [audit,   setAudit]   = useState([])
  const [cmds,    setCmds]    = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    if (tab === 'audit') {
      const r = await api.get('/logs/audit').catch(()=>({data:[]}))
      setAudit(r.data)
    } else {
      const r = await api.get('/logs/commands').catch(()=>({data:[]}))
      setCmds(r.data)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [tab])

  const exportCSV = () => {
    const data = tab === 'audit' ? audit : cmds
    if (!data.length) return
    const csv = Object.keys(data[0]).join(',') + '\n' +
      data.map(r => Object.values(r).map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = `rsmp-log-${tab}-${Date.now()}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 page-title">Log & Audit</h1>
          <p className="text-body-sm muted">Riwayat semua aktivitas sistem</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCw size={12}/></button>
          <button onClick={exportCSV} className="btn btn-ghost btn-sm">Export CSV</button>
        </div>
      </div>

      <div className="flex gap-0 border-b" style={{ borderColor:'var(--border)' }}>
        {[{id:'audit',label:'Audit Log'},{id:'commands',label:'Command Log'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm border-b-2 -mb-px transition-colors"
            style={{
              borderBottomColor: tab===t.id ? 'var(--accent)' : 'transparent',
              color: tab===t.id ? 'var(--accent)' : 'var(--text2)'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          {tab === 'audit' ? (
            <table>
              <thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Target</th><th>IP</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-8" style={{ color:'var(--text-muted)' }}>Memuat...</td></tr>
                ) : audit.map(a => (
                  <tr key={a.id}>
                    <td className="font-mono text-[10px]">{new Date(a.created_at).toLocaleString('id-ID')}</td>
                    <td className="text-xs">{a.full_name||a.username||'—'}</td>
                    <td><span className="badge badge-blue text-[10px]">{a.action}</span></td>
                    <td className="text-xs max-w-[150px] truncate">{a.target||'—'}</td>
                    <td className="font-mono text-[10px]" style={{ color:'var(--text-muted)' }}>{a.ip_address||'—'}</td>
                  </tr>
                ))}
                {!loading && !audit.length && (
                  <tr><td colSpan={5} className="text-center py-8" style={{ color:'var(--text-muted)' }}>Belum ada log</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Waktu</th><th>Client</th><th>User</th><th>Perintah</th><th>Exit</th><th>Durasi</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color:'var(--text-muted)' }}>Memuat...</td></tr>
                ) : cmds.map(c => (
                  <tr key={c.id}>
                    <td className="font-mono text-[10px]">{new Date(c.created_at).toLocaleString('id-ID')}</td>
                    <td className="text-xs">{c.client_name||'—'}</td>
                    <td className="text-xs">{c.full_name||'—'}</td>
                    <td className="font-mono text-xs max-w-[200px] truncate" style={{ color:'var(--accent)' }} title={c.command}>{c.command}</td>
                    <td><span className={clsx('badge text-[10px]',(c.exit_code||0)===0?'badge-green':'badge-red')}>{c.exit_code??'—'}</span></td>
                    <td className="font-mono text-[10px]" style={{ color:'var(--text-muted)' }}>{c.duration_ms?`${c.duration_ms}ms`:'—'}</td>
                  </tr>
                ))}
                {!loading && !cmds.length && (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color:'var(--text-muted)' }}>Belum ada log</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
