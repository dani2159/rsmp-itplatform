import React, { useState, useEffect } from 'react'
import { Plus, RefreshCw, Ticket as TicketIcon, X } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { useAuthStore } from '../store/authStore'

const PRIORITY_BADGE = { high:'badge-red', medium:'badge-yellow', low:'badge-blue' }
const STATUS_BADGE   = { open:'badge-red', in_progress:'badge-yellow', closed:'badge-green' }

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}>
      <div className="w-full max-w-xl rounded-xl animate-slide-in"
           style={{ background:'var(--bg2)', border:'1px solid var(--border2)', maxHeight:'90vh', overflowY:'auto' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color:'var(--text)' }}>{title}</span>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={14}/></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export default function Tickets() {
  const canOperate = useAuthStore(s => s.user?.role === 'admin' || s.user?.role === 'operator')
  const [tickets,  setTickets]  = useState([])
  const [clients,  setClients]  = useState([])
  const [users,    setUsers]    = useState([])
  const [filter,   setFilter]   = useState({ status:'', priority:'' })
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({
    title:'', description:'', client_id:'', priority:'medium',
    category:'', assigned_to:'', resolution:''
  })

  const load = async () => {
    const p = new URLSearchParams()
    if (filter.status)   p.set('status',   filter.status)
    if (filter.priority) p.set('priority', filter.priority)
    api.get(`/tickets?${p}`).then(r => setTickets(r.data)).catch(()=>{})
  }

  useEffect(() => {
    load()
    api.get('/clients').then(r => setClients(r.data)).catch(()=>{})
    api.get('/auth/users').then(r => setUsers(r.data)).catch(()=>{})
  }, [filter])

  const submit = async (e) => {
    e.preventDefault()
    try {
      if (selected) {
        await api.put(`/tickets/${selected.id}`, { ...selected, ...form })
        toast.success('Ticket diperbarui')
      } else {
        await api.post('/tickets', form)
        toast.success('Ticket dibuat')
      }
      setShowForm(false); setSelected(null)
      setForm({ title:'', description:'', client_id:'', priority:'medium', category:'', assigned_to:'', resolution:'' })
      load()
    } catch(e) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  const openEdit = (t) => {
    setSelected(t)
    setForm({ title:t.title, description:t.description||'', client_id:t.client_id||'',
      priority:t.priority, category:t.category||'', assigned_to:t.assigned_to||'', resolution:t.resolution||'' })
    setShowForm(true)
  }

  const updateStatus = async (id, status) => {
    const t = tickets.find(t => t.id === id)
    if (!t) return
    await api.put(`/tickets/${id}`, { ...t, status }).catch(()=>{})
    load()
  }

  const del = async (id) => {
    if (!confirm('Hapus ticket ini?')) return
    await api.delete(`/tickets/${id}`)
    toast.success('Ticket dihapus'); load()
  }

  const ticketStats = {
    open:        tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    closed:      tickets.filter(t => t.status === 'closed').length,
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 page-title">IT Tickets</h1>
          <p className="text-body-sm muted">{tickets.length} ticket</p>
        </div>
        <button onClick={() => { setSelected(null); setShowForm(true) }} className="btn btn-primary btn-sm">
          <Plus size={13}/> Buat Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Open',        val:ticketStats.open,        color:'var(--danger)' },
          { label:'In Progress', val:ticketStats.in_progress, color:'var(--warn)' },
          { label:'Closed',      val:ticketStats.closed,      color:'var(--success)' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center justify-between">
            <span className="text-sm" style={{ color:'var(--text2)' }}>{s.label}</span>
            <span className="text-2xl font-mono font-semibold" style={{ color:s.color }}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select className="select w-36" value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}>
          <option value="">Semua Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
        <select className="select w-36" value={filter.priority} onChange={e=>setFilter(f=>({...f,priority:e.target.value}))}>
          <option value="">Semua Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCw size={12}/></button>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>No. Ticket</th><th>Judul</th><th>Client</th><th>Priority</th>
              <th>Status</th><th>Assign</th><th>Tanggal</th><th>Aksi</th>
            </tr></thead>
            <tbody>
              {tickets.length === 0
                ? <tr><td colSpan={8} className="text-center py-8" style={{ color:'var(--text-muted)' }}>Tidak ada ticket</td></tr>
                : tickets.map(t => (
                <tr key={t.id}>
                  <td className="font-mono text-xs" style={{ color:'var(--accent)' }}>{t.ticket_no}</td>
                  <td className="max-w-[180px]">
                    <div className="text-xs font-medium truncate" style={{ color:'var(--text)' }}>{t.title}</div>
                    {t.category && <div className="text-[10px]" style={{ color:'var(--text-muted)' }}>{t.category}</div>}
                  </td>
                  <td className="text-xs">{t.client_name||'—'}</td>
                  <td><span className={clsx('badge text-[10px]', PRIORITY_BADGE[t.priority]||'badge-gray')}>{t.priority}</span></td>
                  <td><span className={clsx('badge text-[10px]', STATUS_BADGE[t.status]||'badge-gray')}>{t.status?.replace('_',' ')}</span></td>
                  <td className="text-xs">{t.assigned_name||'—'}</td>
                  <td className="font-mono text-[10px]">{new Date(t.created_at).toLocaleDateString('id-ID')}</td>
                  <td>
                    {canOperate ? (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(t)} className="btn btn-ghost btn-sm btn-icon" title="Edit">✏</button>
                        <select
                          className="text-[10px] font-mono rounded px-1.5 py-1 cursor-pointer"
                          style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text2)' }}
                          value={t.status}
                          onChange={e => updateStatus(t.id, e.target.value)}>
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                        <button onClick={() => del(t.id)} className="btn btn-danger btn-sm btn-icon" title="Hapus">✕</button>
                      </div>
                    ) : (
                      <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <Modal title={selected ? 'Edit Ticket' : 'Buat Ticket Baru'} onClose={() => { setShowForm(false); setSelected(null) }}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-mono uppercase mb-1" style={{ color:'var(--text-muted)' }}>Judul *</label>
                <input className="input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} required/>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase mb-1" style={{ color:'var(--text-muted)' }}>Client</label>
                <select className="select" value={form.client_id} onChange={e=>setForm(f=>({...f,client_id:e.target.value}))}>
                  <option value="">-- Pilih --</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.ip_address})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase mb-1" style={{ color:'var(--text-muted)' }}>Priority</label>
                <select className="select" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase mb-1" style={{ color:'var(--text-muted)' }}>Kategori</label>
                <select className="select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                  <option value="">-- Pilih --</option>
                  {['Hardware','Software','Jaringan','Printer','Email','OS','VNC','RustDesk','Lainnya'].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              {canOperate && (
                <div>
                  <label className="block text-[10px] font-mono uppercase mb-1" style={{ color:'var(--text-muted)' }}>Assign ke</label>
                  <select className="select" value={form.assigned_to} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}>
                    <option value="">-- Pilih IT Staff --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name||u.username}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-[10px] font-mono uppercase mb-1" style={{ color:'var(--text-muted)' }}>Deskripsi</label>
                <textarea className="input h-20 resize-none" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
              </div>
              {selected && canOperate && (
                <div className="col-span-2">
                  <label className="block text-[10px] font-mono uppercase mb-1" style={{ color:'var(--text-muted)' }}>Resolusi</label>
                  <textarea className="input h-16 resize-none" value={form.resolution} onChange={e=>setForm(f=>({...f,resolution:e.target.value}))}/>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
              <button type="button" onClick={() => { setShowForm(false); setSelected(null) }} className="btn btn-ghost">Batal</button>
              <button type="submit" className="btn btn-primary">{selected ? 'Perbarui' : 'Buat Ticket'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
