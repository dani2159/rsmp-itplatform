import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Rocket, CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const SCRIPTS = [
  { id:'01', name:'01 — Install Aplikasi RS',     desc:'Pilih aplikasi yang mau dipasang' },
  { id:'02', name:'02 — Setup Auto-Update',       desc:'Silent update 02:00 WIB, tanpa notif, tanpa restart' },
  { id:'03', name:'03 — Hardening & Config',      desc:'Matikan sleep, notif update/monitor, welcome Mint, firewall UFW' },
  { id:'all', name:'ALL — Semua Script (01+02+03)', desc:'Setup lengkap fresh install', highlight:true },
]

// App yang bisa dipilih di script 01. Desktop XFCE selalu dipasang (tak di sini).
const APPS = [
  { id:'libreoffice', label:'LibreOffice' },
  { id:'firefox',     label:'Firefox' },
  { id:'rustdesk',    label:'RustDesk' },
  { id:'anydesk',     label:'AnyDesk' },
  { id:'pdf',         label:'PDF Reader (Okular)' },
  { id:'foxit',       label:'Foxit PDF Reader (best-effort)' },
  { id:'archive',     label:'Archive (7zip, unrar, zip)' },
  { id:'printer',     label:'Printer & Scanner (CUPS, simple-scan)' },
  { id:'media',       label:'Media Player (VLC)' },
  { id:'extras',      label:'Extras (screenshot, timeshift, htop, gparted)' },
]

export default function Deploy() {
  const location  = useLocation()
  const logRef    = useRef(null)
  const [clients,  setClients]  = useState([])
  const [selected, setSelected] = useState(new Set(location.state?.clientIds || []))
  const [script,   setScript]   = useState('all')
  const [running,  setRunning]  = useState(false)
  const [jobId,    setJobId]    = useState(null)
  const [logs,     setLogs]     = useState([])
  const [filter,   setFilter]   = useState('all')
  const [history,  setHistory]  = useState([])
  const [progress, setProgress] = useState({})
  const [apps,     setApps]     = useState(new Set(APPS.map(a=>a.id)))  // default: semua

  useEffect(() => {
    api.get('/clients?os_type=linux').then(r => setClients(r.data)).catch(()=>{})
    api.get('/deploy/jobs').then(r => setHistory(r.data)).catch(()=>{})
  }, [])

  // Poll job status
  useEffect(() => {
    if (!jobId) return
    let pollErrorLogged = false
    const iv = setInterval(async () => {
      try {
        const r = await api.get(`/deploy/jobs/${jobId}`)
        pollErrorLogged = false
        if (r.data.status === 'finished') {
          clearInterval(iv)
          setRunning(false)
          setJobId(null)
          api.get('/deploy/jobs').then(r2=>setHistory(r2.data)).catch(()=>{})
          const results = r.data.results?.results || {}
          Object.entries(results).forEach(([id, res]) => {
            setProgress(p => ({ ...p, [id]: res.ok ? 'ok' : 'err' }))
            addLog(`${res.ok?'✓':'✗'} ${res.name} (${res.ip}) — ${res.ok?'Berhasil':res.error}`, res.ok?'ok':'err')
          })
          const sum = r.data.results?.summary
          if (sum) {
            addLog(`Selesai: ${sum.success} berhasil, ${sum.failed} gagal dari ${sum.total} client`, sum.failed ? 'err' : 'ok')
            sum.failed ? toast.error(`Deploy: ${sum.success} ok, ${sum.failed} gagal`)
                       : toast.success(`Deploy selesai — ${sum.success} client berhasil`)
          } else {
            toast.success('Deploy selesai!')
          }
        }
      } catch(e) {
        if (!pollErrorLogged) {
          addLog('⚠ Gagal cek status job — mencoba lagi...', 'err')
          pollErrorLogged = true
        }
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [jobId])

  const addLog = (msg, type='info') => {
    setLogs(prev => {
      const next = [...prev, { time:new Date().toLocaleTimeString('id-ID'), msg, type }]
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 0)
      return next
    })
  }

  const runDeploy = async () => {
    if (!selected.size) { toast.error('Pilih minimal 1 client'); return }
    setRunning(true); setLogs([]); setProgress({})
    const targets = clients.filter(c => selected.has(c.id))
    targets.forEach(c => setProgress(p => ({ ...p, [c.id]: 'running' })))
    addLog(`Deploy ${SCRIPTS.find(s=>s.id===script)?.name}`, 'info')
    addLog(`Target: ${selected.size} client`, 'info')
    try {
      // Kirim daftar app hanya kalau script 01/all melibatkan install apps.
      const payload = { scriptType:script, clientIds:[...selected] }
      if (script === '01' || script === 'all') payload.apps = [...apps]
      const r = await api.post('/deploy/run', payload)
      setJobId(r.data.jobId)
      addLog(`Job ID: ${r.data.jobId} — menunggu hasil...`, 'dim')
      targets.forEach((c,i) => setTimeout(()=>addLog(`[SSH] Connecting ${c.name} (${c.ip_address})...`,'dim'), i*400+500))
    } catch(e) {
      toast.error(e.response?.data?.error||'Gagal')
      setRunning(false)
    }
  }

  const toggle   = id => setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  const filtered = clients.filter(c => filter==='all'?true:filter==='online'?c.status==='online':c.status!=='online')

  const statusIcon = (id) => {
    const s = progress[id]
    if (!s) return null
    if (s==='running') return <RefreshCw size={11} className="animate-spin" style={{color:'var(--warn)'}}/>
    if (s==='ok')      return <CheckCircle size={11} style={{color:'var(--success)'}}/>
    return <XCircle size={11} style={{color:'var(--danger)'}}/>
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-h2 page-title">Deploy Massal</h1>
        <p className="text-body-sm muted">Kirim script ke banyak Linux client sekaligus (max 5 paralel)</p>
      </div>

      <div className="grid grid-cols-3 gap-5 items-start">
        {/* Kiri: Script + Target */}
        <div className="col-span-1 space-y-4">
          {/* Script selector */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{color:'var(--text)'}}>1. Pilih Script</span></div>
            <div className="p-3 space-y-2">
              {SCRIPTS.map(s => (
                <button key={s.id} onClick={()=>setScript(s.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border transition-all"
                  style={{
                    borderColor: script===s.id ? 'var(--accent)' : s.highlight ? 'var(--info)' : 'var(--border)',
                    background:  script===s.id ? 'var(--accent-dim)' : s.highlight ? 'var(--info2)' : 'var(--bg3)',
                  }}>
                  <div className="text-xs font-semibold font-mono" style={{color:script===s.id?'var(--accent)':s.highlight?'var(--info)':'var(--text2)'}}>
                    {s.name}
                  </div>
                  <div className="text-[10px] mt-0.5 opacity-70" style={{color:'var(--text-muted)'}}>{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Pilih aplikasi (hanya untuk script 01 / all) */}
          {(script === '01' || script === 'all') && (
            <div className="card">
              <div className="card-header">
                <span className="text-sm font-medium" style={{color:'var(--text)'}}>Pilih Aplikasi</span>
                <div className="flex gap-1.5">
                  <button onClick={()=>setApps(new Set(APPS.map(a=>a.id)))} className="btn btn-ghost btn-sm">Semua</button>
                  <button onClick={()=>setApps(new Set())} className="btn btn-ghost btn-sm">Kosong</button>
                </div>
              </div>
              <div className="p-3 space-y-1">
                {APPS.map(a => (
                  <label key={a.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer hover:opacity-80">
                    <input type="checkbox" checked={apps.has(a.id)}
                      onChange={()=>setApps(prev=>{const n=new Set(prev);n.has(a.id)?n.delete(a.id):n.add(a.id);return n})}/>
                    <span className="text-xs" style={{color:'var(--text)'}}>{a.label}</span>
                  </label>
                ))}
                <p className="text-[10px] px-2 pt-1" style={{color:'var(--text-muted)'}}>
                  Desktop XFCE + SSH selalu dipasang. Kosong = tidak install app tambahan.
                </p>
              </div>
            </div>
          )}

          {/* Summary + Run */}
          <div className="card p-4 space-y-3">
            <div className="text-[10px] font-mono uppercase" style={{color:'var(--text-muted)'}}>Ringkasan</div>
            <div className="space-y-1.5">
              {[
                ['Script',  SCRIPTS.find(s=>s.id===script)?.id||'—'],
                ['Target',  `${selected.size} client`],
                ['Paralel', '5 client/batch'],
              ].map(([k,v])=>(
                <div key={k} className="flex justify-between text-sm">
                  <span style={{color:'var(--text2)'}}>{k}</span>
                  <span className="font-mono" style={{color:k==='Target'?'var(--accent)':'var(--text)'}}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={runDeploy} disabled={running||!selected.size} className="btn btn-primary w-full justify-center">
              {running?<><RefreshCw size={13} className="animate-spin"/>Berjalan...</>:<><Rocket size={13}/>Jalankan Deploy</>}
            </button>
          </div>
        </div>

        {/* Tengah: Client list */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium" style={{color:'var(--text)'}}>2. Pilih Client</span>
            <span className="badge badge-blue text-[10px]">{selected.size} dipilih</span>
          </div>
          <div className="p-3 flex gap-2 border-b" style={{borderColor:'var(--border)'}}>
            <button onClick={()=>setSelected(new Set(filtered.map(c=>c.id)))} className="btn btn-ghost btn-sm">Semua</button>
            <button onClick={()=>setSelected(new Set(clients.filter(c=>c.status==='online').map(c=>c.id)))} className="btn btn-ghost btn-sm">Online</button>
            <button onClick={()=>setSelected(new Set())} className="btn btn-ghost btn-sm">Reset</button>
            <select className="select text-xs ml-auto w-28" value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="all">Semua</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {filtered.map(c=>(
              <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b last:border-0 hover:opacity-80" style={{borderColor:'var(--border)'}}>
                <input type="checkbox" className="accent-blue-500 flex-shrink-0"
                  checked={selected.has(c.id)} onChange={()=>toggle(c.id)}/>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{color:'var(--text)'}}>{c.name}</div>
                  <div className="text-[10px] font-mono" style={{color:'var(--text-muted)'}}>{c.ip_address}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {statusIcon(c.id)}
                  <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                    c.status==='online'?'bg-[var(--success)]':'bg-[var(--text-muted)]')}/>
                </div>
              </label>
            ))}
            {!filtered.length && <div className="p-6 text-center text-xs" style={{color:'var(--text-muted)'}}>Tidak ada client</div>}
          </div>
        </div>

        {/* Kanan: Log + History */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{color:'var(--text)'}}>Output Deploy</span>
              {running && <span className="badge badge-yellow text-[10px] animate-pulse-slow">Running...</span>}
              {!running && logs.length>0 && <span className="badge badge-green text-[10px]">Selesai</span>}
            </div>
            <div ref={logRef} className="terminal-box m-3 h-56 text-[11px]">
              {logs.length===0
                ? <span style={{color:'var(--text-muted)'}}>Menunggu perintah deploy...</span>
                : logs.map((l,i)=>(
                  <div key={i} className="leading-5" style={{
                    color:l.type==='ok'?'var(--success)':l.type==='err'?'var(--danger)':l.type==='info'?'var(--accent)':'var(--text-muted)'
                  }}>
                    <span style={{color:'var(--text-muted)'}}>[{l.time}]</span> {l.msg}
                  </div>
                ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{color:'var(--text)'}}>Riwayat Deploy</span></div>
            <div className="max-h-52 overflow-y-auto">
              {history.slice(0,10).map(h=>(
                <div key={h.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0" style={{borderColor:'var(--border)'}}>
                  {h.status==='finished'
                    ? <CheckCircle size={13} style={{color:'var(--success)',flexShrink:0}}/>
                    : h.status==='running'
                    ? <RefreshCw size={13} className="animate-spin" style={{color:'var(--warn)',flexShrink:0}}/>
                    : <Clock size={13} style={{color:'var(--text-muted)',flexShrink:0}}/>}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{color:'var(--text)'}}>{h.job_name}</div>
                    <div className="text-[10px] font-mono" style={{color:'var(--text-muted)'}}>
                      {new Date(h.created_at).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono" style={{
                    color:h.status==='finished'?'var(--success)':h.status==='running'?'var(--warn)':'var(--text-muted)'
                  }}>{h.status}</span>
                </div>
              ))}
              {!history.length && <div className="p-4 text-center text-xs" style={{color:'var(--text-muted)'}}>Belum ada riwayat</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
