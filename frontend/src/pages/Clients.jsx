import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, RefreshCw, Download, Upload, Terminal, Monitor, Rocket } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import ClientModal from '../components/clients/ClientModal'
import ImportModal from '../components/clients/ImportModal'
import { useAuthStore } from '../store/authStore'

function StatusBadge({ status }) {
  const map = { online:'badge-green', offline:'badge-red', unknown:'badge-gray' }
  const dot = { online:'bg-[var(--success)] animate-pulse-slow', offline:'bg-[var(--danger)]', unknown:'bg-[var(--text-muted)]' }
  return (
    <span className={clsx('badge text-[10px]', map[status]||'badge-gray')}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', dot[status]||'bg-[var(--text-muted)]')}/>
      {status||'unknown'}
    </span>
  )
}

function UsageBar({ val, warn=70, crit=90 }) {
  if (val == null) return <span style={{color:'var(--text-muted)'}}>—</span>
  const pct   = Math.min(100, val)
  const color = pct>=crit ? 'bg-[var(--danger)]' : pct>=warn ? 'bg-[var(--warn)]' : 'bg-[var(--success)]'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 rounded-full h-1.5" style={{background:'var(--bg3)'}}>
        <div className={clsx('h-1.5 rounded-full', color)} style={{width:`${pct}%`}}/>
      </div>
      <span className="text-xs font-mono">{val.toFixed(0)}%</span>
    </div>
  )
}

export default function Clients() {
  const canOperate = useAuthStore(s => s.user?.role === 'admin' || s.user?.role === 'operator')
  const [clients,    setClients]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(new Set())
  const [showAdd,    setShowAdd]    = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [pinging,    setPinging]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [params]                    = useSearchParams()
  const [filters,    setFilters]    = useState({
    os_type: params.get('os')||'', status: params.get('status')||'', department:''
  })
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (filters.os_type)    p.set('os_type',    filters.os_type)
      if (filters.status)     p.set('status',     filters.status)
      if (filters.department) p.set('department', filters.department)
      if (search)             p.set('search',     search)
      const r = await api.get(`/clients?${p}`)
      setClients(r.data)
    } catch(e) { toast.error('Gagal memuat client') }
    setLoading(false)
  }, [filters, search])

  useEffect(() => { load() }, [load])

  const pingAll = async () => {
    setPinging(true)
    toast.loading('Ping semua client...', { id:'ping' })
    try {
      await api.post('/clients/ping-all')
      toast.success('Ping selesai', { id:'ping' })
      load()
    } catch { toast.error('Gagal', { id:'ping' }) }
    setPinging(false)
  }

  const pingSelected = async () => {
    for (const id of selected) await api.post(`/clients/${id}/ping`).catch(()=>{})
    load(); setSelected(new Set())
  }

  const toggleSel = id => setSelected(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  const selectAll = () => setSelected(new Set(clients.map(c=>c.id)))
  const clearSel  = () => setSelected(new Set())

  const del = async (id, name) => {
    if (!confirm(`Hapus ${name}?`)) return
    await api.delete(`/clients/${id}`)
    toast.success('Client dihapus'); load()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 page-title">Semua Client</h1>
          <p className="text-xs font-mono mt-0.5" style={{color:'var(--text-muted)'}}>
            {clients.length} terdaftar · {clients.filter(c=>c.status==='online').length} online
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>window.open('/api/clients/export/hosts','_blank')} className="btn btn-ghost btn-sm">
            <Download size={13}/> Export hosts.txt
          </button>
          {canOperate && <button onClick={()=>setShowImport(true)} className="btn btn-ghost btn-sm">
            <Upload size={13}/> Import
          </button>}
          {canOperate && <button onClick={()=>setShowAdd(true)} className="btn btn-primary btn-sm">
            <Plus size={13}/> Tambah Client
          </button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:'var(--text-muted)'}}/>
          <input className="input pl-8 text-sm" placeholder="Cari nama, IP, hostname..."
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="select w-36" value={filters.os_type} onChange={e=>setFilters(f=>({...f,os_type:e.target.value}))}>
          <option value="">Semua OS</option>
          <option value="linux">Linux</option>
          <option value="windows">Windows</option>
        </select>
        <select className="select w-36" value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}>
          <option value="">Semua Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="unknown">Unknown</option>
        </select>
        <button onClick={pingAll} disabled={pinging} className="btn btn-ghost btn-sm">
          <RefreshCw size={13} className={pinging?'animate-spin':''}/>{pinging?'Pinging...':'Ping Semua'}
        </button>
      </div>

      {selected.size>0 && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg border text-sm"
             style={{background:'var(--accent-dim)',borderColor:'color-mix(in srgb,var(--accent) 30%,transparent)'}}>
          <span className="font-mono" style={{color:'var(--accent)'}}>{selected.size} dipilih</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={pingSelected} className="btn btn-ghost btn-sm">Ping Selected</button>
            {canOperate && <button onClick={()=>navigate('/deploy',{state:{clientIds:[...selected]}})} className="btn btn-primary btn-sm">
              <Rocket size={13}/> Deploy ke Selected
            </button>}
            <button onClick={clearSel} className="btn btn-ghost btn-sm">Batal</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th className="w-8">
                <input type="checkbox" className="accent-blue-500"
                  onChange={e=>e.target.checked?selectAll():clearSel()}
                  checked={selected.size===clients.length&&clients.length>0}/>
              </th>
              <th>Nama</th><th>IP Address</th><th>OS</th><th>Lokasi</th>
              <th>Status</th><th>CPU</th><th>RAM</th><th>Disk</th>
              <th>SSH</th><th>Update</th><th>Aksi</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-12" style={{color:'var(--text-muted)'}}>
                  <RefreshCw size={16} className="animate-spin mx-auto mb-2"/>Memuat...
                </td></tr>
              ) : clients.length===0 ? (
                <tr><td colSpan={12} className="text-center py-12" style={{color:'var(--text-muted)'}}>
                  Tidak ada client
                </td></tr>
              ) : clients.map(c=>(
                <tr key={c.id} onClick={()=>navigate(`/clients/${c.id}`)} className="cursor-pointer">
                  <td onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" className="accent-blue-500"
                      checked={selected.has(c.id)} onChange={()=>toggleSel(c.id)}/>
                  </td>
                  <td>
                    <div className="font-medium text-xs" style={{color:'var(--text)'}}>{c.name}</div>
                    {c.hostname&&<div className="text-[10px] font-mono" style={{color:'var(--text-muted)'}}>{c.hostname}</div>}
                  </td>
                  <td className="font-mono text-xs">{c.ip_address}</td>
                  <td>
                    <span className={clsx('badge text-[10px]',c.os_type==='linux'?'badge-blue':'badge-purple')}>
                      {c.os_type}
                    </span>
                  </td>
                  <td className="text-xs max-w-[110px] truncate">{c.location||c.department||'—'}</td>
                  <td><StatusBadge status={c.status}/></td>
                  <td><UsageBar val={c.cpu_usage}/></td>
                  <td><UsageBar val={c.ram_usage}/></td>
                  <td><UsageBar val={c.disk_usage}/></td>
                  <td>
                    {c.ssh_ready
                      ?<span className="badge badge-green text-[10px]">✓</span>
                      :<span className="badge badge-gray text-[10px]">—</span>}
                  </td>
                  <td>
                    {c.packages_pending>0
                      ?<span className="badge badge-yellow text-[10px]">{c.packages_pending}</span>
                      :<span className="text-xs" style={{color:'var(--text-muted)'}}>—</span>}
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div className="flex gap-1">
                      {c.os_type==='linux'&&<>
                        <button onClick={()=>navigate(`/terminal/${c.id}`)} className="btn btn-ghost btn-sm btn-icon" title="Terminal"><Terminal size={13}/></button>
                        <button onClick={()=>navigate(`/remote/${c.id}`)} className="btn btn-ghost btn-sm btn-icon" title="Remote"><Monitor size={13}/></button>
                      </>}
                      {c.os_type==='windows'&&
                        <button onClick={()=>navigate(`/remote/${c.id}`)} className="btn btn-ghost btn-sm btn-icon" title="Remote"><Monitor size={13}/></button>
                      }
                      {canOperate && <button onClick={()=>del(c.id,c.name)} className="btn btn-danger btn-sm btn-icon" title="Hapus">✕</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd    && <ClientModal onClose={()=>setShowAdd(false)} onSaved={load}/>}
      {showImport && <ImportModal onClose={()=>setShowImport(false)} onSaved={load}/>}
    </div>
  )
}
