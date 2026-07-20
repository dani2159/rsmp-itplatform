import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Play, CheckCircle, XCircle } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function Update() {
  const [config,  setConfig]  = useState({ schedule_time:'02:00', mode:'all', bandwidth_kb:1024, auto_restart:false, notify_users:false })
  const [history, setHistory] = useState([])
  const [clients, setClients] = useState([])
  const [target,  setTarget]  = useState('all')
  const [running, setRunning] = useState(false)
  const [logs,    setLogs]    = useState([])
  const logRef = useRef(null)

  useEffect(() => {
    api.get('/update/config').then(r => { if(r.data) setConfig(c=>({...c,...r.data})) }).catch(()=>{})
    api.get('/update/history').then(r => setHistory(r.data)).catch(()=>{})
    api.get('/clients?os_type=linux').then(r => setClients(r.data)).catch(()=>{})
  }, [])

  const addLog = (msg, type='info') => {
    setLogs(prev => {
      const next = [...prev, { time:new Date().toLocaleTimeString('id-ID'), msg, type }]
      setTimeout(()=>logRef.current?.scrollTo(0,logRef.current.scrollHeight),0)
      return next
    })
  }

  const saveConfig = async () => {
    await api.put('/update/config', config)
    toast.success('Konfigurasi disimpan')
  }

  const runUpdate = async () => {
    setRunning(true); setLogs([])
    addLog('Memulai update...', 'info')
    try {
      if (target === 'all') {
        const r = await api.post('/update/run-all')
        addLog(r.data.message, 'ok')
      } else {
        const r = await api.post('/update/run', { clientIds:[parseInt(target)] })
        addLog(r.data.message, 'ok')
      }
      addLog('Proses berjalan di background — cek riwayat untuk hasil', 'dim')
      toast.success('Update dimulai')
      setTimeout(()=>api.get('/update/history').then(r=>setHistory(r.data)).catch(()=>{}), 5000)
    } catch(e) { addLog('Error: '+e.message, 'err'); toast.error('Gagal') }
    setRunning(false)
  }

  const Label = ({children}) => <label className="block text-[10px] font-mono uppercase mb-1" style={{color:'var(--text-muted)'}}>{children}</label>

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-h2 page-title">Update Control</h1>
        <p className="text-body-sm muted">Jadwal & kontrol update otomatis semua client Linux</p>
      </div>

      <div className="grid grid-cols-3 gap-5 items-start">
        <div className="col-span-1 space-y-4">
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{color:'var(--text)'}}>Jadwal Auto-Update</span></div>
            <div className="card-body space-y-3">
              <div>
                <Label>Waktu Update (WIB)</Label>
                <input type="time" className="input" value={config.schedule_time} onChange={e=>setConfig(c=>({...c,schedule_time:e.target.value}))}/>
                <p className="text-[10px] mt-1" style={{color:'var(--text-muted)'}}>Direkomendasikan: 01:00–03:00 WIB</p>
              </div>
              <div>
                <Label>Mode Update</Label>
                <select className="select" value={config.mode} onChange={e=>setConfig(c=>({...c,mode:e.target.value}))}>
                  <option value="all">Semua update</option>
                  <option value="security">Security only</option>
                </select>
              </div>
              <div>
                <Label>Batasi Bandwidth</Label>
                <select className="select" value={config.bandwidth_kb} onChange={e=>setConfig(c=>({...c,bandwidth_kb:parseInt(e.target.value)}))}>
                  <option value={512}>512 KB/s</option>
                  <option value={1024}>1 MB/s (default)</option>
                  <option value={2048}>2 MB/s</option>
                  <option value={0}>Tidak dibatasi</option>
                </select>
              </div>
              <div className="space-y-2">
                {[{key:'auto_restart',label:'Restart otomatis setelah update'},{key:'notify_users',label:'Notifikasi ke user'}].map(item=>(
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-blue-500" checked={config[item.key]}
                      onChange={e=>setConfig(c=>({...c,[item.key]:e.target.checked}))}/>
                    <span className="text-xs" style={{color:'var(--text2)'}}>{item.label}</span>
                  </label>
                ))}
              </div>
              <button onClick={saveConfig} className="btn btn-primary w-full justify-center">Simpan Jadwal</button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{color:'var(--text)'}}>Update Manual</span></div>
            <div className="card-body space-y-3">
              <div className="alert alert-warning text-xs">Update langsung dijalankan ke client. Proses di background.</div>
              <select className="select" value={target} onChange={e=>setTarget(e.target.value)}>
                <option value="all">Semua Linux Client Online</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name} ({c.ip_address})</option>)}
              </select>
              <button onClick={runUpdate} disabled={running} className="btn btn-success w-full justify-center">
                {running?<><RefreshCw size={13} className="animate-spin"/>Berjalan...</>:<><Play size={13}/>Update Sekarang</>}
              </button>
              {logs.length>0 && (
                <div ref={logRef} className="terminal-box h-28 text-[10px]">
                  {logs.map((l,i)=>(
                    <div key={i} style={{color:l.type==='ok'?'var(--success)':l.type==='err'?'var(--danger)':l.type==='info'?'var(--accent)':'var(--text-muted)'}}>
                      [{l.time}] {l.msg}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-2 card">
          <div className="card-header">
            <span className="text-sm font-medium" style={{color:'var(--text)'}}>Riwayat Update</span>
            <button onClick={()=>api.get('/update/history').then(r=>setHistory(r.data))} className="btn btn-ghost btn-sm btn-icon"><RefreshCw size={12}/></button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Client</th><th>Status</th><th>Waktu</th><th>Output</th></tr></thead>
              <tbody>
                {history.length===0
                  ? <tr><td colSpan={4} className="text-center py-8" style={{color:'var(--text-muted)'}}>Belum ada riwayat</td></tr>
                  : history.map(h=>(
                  <tr key={h.id}>
                    <td>
                      <div className="text-xs font-medium" style={{color:'var(--text)'}}>{h.client_name}</div>
                      <div className="text-[10px] font-mono" style={{color:'var(--text-muted)'}}>{h.ip_address}</div>
                    </td>
                    <td>
                      <span className={clsx('badge text-[10px]',h.status==='success'?'badge-green':'badge-red')}>
                        {h.status==='success'?<CheckCircle size={10}/>:<XCircle size={10}/>}{h.status}
                      </span>
                    </td>
                    <td className="font-mono text-[10px]">{new Date(h.created_at).toLocaleString('id-ID')}</td>
                    <td className="font-mono text-[10px] max-w-xs truncate" style={{color:'var(--text-muted)'}}>{(h.output||'').slice(0,80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
