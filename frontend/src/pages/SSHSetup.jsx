import React, { useState, useEffect } from 'react'
import { Key, Upload, CheckCircle, XCircle, RefreshCw, Copy, Download } from 'lucide-react'
import api from '../services/api'
import { copyText } from '../services/clipboard'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function SSHSetupPage() {
  const [pubKey,   setPubKey]   = useState('')
  const [clients,  setClients]  = useState([])
  const [selected, setSelected] = useState(new Set())
  const [password, setPassword] = useState('')
  const [running,  setRunning]  = useState(false)
  const [results,  setResults]  = useState([])
  const [testId,   setTestId]   = useState('')
  const [testRes,  setTestRes]  = useState(null)

  useEffect(() => {
    api.get('/system/pub-key').then(r => setPubKey(r.data.key)).catch(()=>{})
    api.get('/clients?os_type=linux').then(r => setClients(r.data)).catch(()=>{})
  }, [])

  const upload = async () => {
    if (!selected.size) { toast.error('Pilih client dulu'); return }
    if (!password)      { toast.error('Masukkan password rsadmin'); return }
    setRunning(true); setResults([])
    try {
      const r = await api.post('/ssh/bulk-key-upload', { clientIds:[...selected], password })
      setResults(r.data.results)
      const ok = r.data.results.filter(r=>r.ok).length
      toast.success(`SSH key dikirim ke ${ok}/${r.data.results.length} client`)
      api.get('/clients?os_type=linux').then(r2=>setClients(r2.data)).catch(()=>{})
    } catch(e) { toast.error(e.response?.data?.error||'Gagal') }
    setRunning(false)
  }

  const testSSH = async () => {
    if (!testId) { toast.error('Pilih client'); return }
    setTestRes(null)
    try {
      const r = await api.post(`/ssh/${testId}/test`)
      setTestRes({ ok:true, info:r.data.info })
    } catch(e) { setTestRes({ ok:false, error:e.response?.data?.error||e.message }) }
  }

  const toggle = id => setSelected(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  const Label = ({children}) => <label className="block text-[10px] font-mono uppercase mb-1" style={{color:'var(--text-muted)'}}>{children}</label>

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-h2 page-title">SSH Key Setup</h1>
        <p className="text-body-sm muted">Distribusi SSH key ke semua Linux client</p>
      </div>
      <div className="grid grid-cols-2 gap-5 items-start">
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{color:'var(--text)'}}>Master SSH Public Key</span>
              <div className="flex gap-1.5">
                <button onClick={()=>copyText(pubKey).then(()=>toast.success('Disalin')).catch(()=>toast.error('Gagal menyalin'))} className="btn btn-ghost btn-sm"><Copy size={12}/> Salin</button>
                <a href="/api/iso/pubkey/download" className="btn btn-ghost btn-sm"><Download size={12}/> Download</a>
              </div>
            </div>
            <div className="p-4">
              <div className="terminal-box text-[10px] break-all">{pubKey||'Memuat...'}</div>
              <p className="text-[10px] mt-2" style={{color:'var(--text-muted)'}}>Key ini sudah di-embed di ISO custom. Install manual: tambahkan ke ~/.ssh/authorized_keys di PC client.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{color:'var(--text)'}}>Upload Key ke Client</span></div>
            <div className="card-body space-y-3">
              <div>
                <Label>Password rsadmin (sekali saja)</Label>
                <input type="password" className="input" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)}/>
              </div>
              <div className="max-h-44 overflow-y-auto border rounded" style={{borderColor:'var(--border)'}}>
                {clients.map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:opacity-80 cursor-pointer border-b last:border-0" style={{borderColor:'var(--border)'}}>
                    <input type="checkbox" className="accent-blue-500" checked={selected.has(c.id)} onChange={()=>toggle(c.id)}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs" style={{color:'var(--text)'}}>{c.name}</div>
                      <div className="text-[10px] font-mono" style={{color:'var(--text-muted)'}}>{c.ip_address}</div>
                    </div>
                    {c.ssh_ready ? <span className="badge badge-green text-[10px]">Ready</span> : <span className="badge badge-yellow text-[10px]">Belum</span>}
                  </label>
                ))}
                {!clients.length && <div className="p-4 text-center text-xs" style={{color:'var(--text-muted)'}}>Belum ada Linux client</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setSelected(new Set(clients.map(c=>c.id)))} className="btn btn-ghost btn-sm">Semua</button>
                <button onClick={()=>setSelected(new Set())} className="btn btn-ghost btn-sm">Reset</button>
                <button onClick={upload} disabled={running} className="btn btn-primary btn-sm ml-auto">
                  {running?<><RefreshCw size={12} className="animate-spin"/>Uploading...</>:<><Upload size={12}/>Upload ({selected.size})</>}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{color:'var(--text)'}}>Test Koneksi SSH</span></div>
            <div className="card-body space-y-3">
              <select className="select" value={testId} onChange={e=>setTestId(e.target.value)}>
                <option value="">-- Pilih Client --</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name} ({c.ip_address})</option>)}
              </select>
              <button onClick={testSSH} className="btn btn-ghost w-full justify-center">Test Koneksi</button>
              {testRes && (
                <div className={clsx('rounded p-3 text-xs', testRes.ok?'alert-success':'alert-danger')}>
                  {testRes.ok
                    ? <><CheckCircle size={12} className="inline mr-1"/>Berhasil!<br/><pre className="mt-1 text-[10px] whitespace-pre-wrap opacity-80">{testRes.info}</pre></>
                    : <><XCircle size={12} className="inline mr-1"/>Gagal: {testRes.error}</>}
                </div>
              )}
            </div>
          </div>

          {results.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="text-sm font-medium" style={{color:'var(--text)'}}>Hasil Upload</span></div>
              <div className="max-h-56 overflow-y-auto">
                {results.map((r,i)=>(
                  <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0" style={{borderColor:'var(--border)'}}>
                    {r.ok?<CheckCircle size={13} style={{color:'var(--success)'}}/>:<XCircle size={13} style={{color:'var(--danger)'}}/>}
                    <div className="flex-1">
                      <div className="text-xs" style={{color:'var(--text)'}}>{r.name}</div>
                      {!r.ok&&<div className="text-[10px]" style={{color:'var(--danger)'}}>{r.error}</div>}
                    </div>
                    <span className="text-[10px] font-mono" style={{color:r.ok?'var(--success)':'var(--danger)'}}>{r.ok?'OK':'Gagal'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="text-xs font-semibold font-mono uppercase mb-2" style={{color:'var(--text-muted)'}}>Perintah Manual</div>
            {[
              {label:'Upload key ke 1 PC', cmd:'ssh-copy-id -i rs_master_key.pub rsadmin@192.168.1.x'},
              {label:'Test SSH',           cmd:'ssh -i rs_master_key rsadmin@192.168.1.x echo OK'},
            ].map(item=>(
              <div key={item.label} className="mb-2">
                <div className="text-[10px] mb-1" style={{color:'var(--text-muted)'}}>{item.label}</div>
                <div className="terminal-box px-2.5 py-1.5 text-[10px]" style={{color:'var(--accent)'}}>{item.cmd}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
