import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Terminal, Monitor, RefreshCw, Activity,
  HardDrive, Cpu, MemoryStick, Package, Wifi, Edit2,
  Save, X, Eye, EyeOff, Copy, Key, Radio, Server,
  Users, Network, Thermometer, Clock, List, Layers, TrendingUp
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import api from '../services/api'
import { copyText } from '../services/clipboard'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { useAuthStore } from '../store/authStore'

const RANGES = [['24h','24 Jam'],['7d','7 Hari'],['30d','30 Hari']]

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function UptimeSection({ clientId }) {
  const [range, setRange] = useState('24h')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/clients/${clientId}/history?range=${range}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [clientId, range])

  const chartData = (data?.incidents || []).map((inc, i) => ({
    name: `#${i + 1}`,
    durationMinutes: Math.round(inc.durationSeconds / 60),
    ongoing: inc.end === null,
  }))

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Uptime History</span>
        </div>
        <div className="flex gap-1">
          {RANGES.map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)}
              className={clsx('px-2 py-1 text-[10px] font-mono rounded border', range === k && 'font-semibold')}
              style={{
                background: range === k ? 'var(--accent2)' : 'var(--bg3)',
                borderColor: 'var(--border)',
                color: range === k ? 'var(--accent)' : 'var(--text-muted)',
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Memuat...</div>
        ) : !data ? (
          <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Gagal memuat data uptime</div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-mono font-semibold"
                style={{ color: data.uptimePercent >= 99 ? 'var(--success)' : data.uptimePercent >= 95 ? 'var(--warn)' : 'var(--danger)' }}>
                {data.uptimePercent.toFixed(2)}%
              </div>
              <div className="text-[10px] font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
                Uptime · {data.incidents.length} incident{data.incidents.length !== 1 ? 's' : ''}
              </div>
            </div>
            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                    label={{ value: 'menit', angle: -90, position: 'insideLeft', fontSize: 9, fill: 'var(--text-muted)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                    labelStyle={{ color: 'var(--text2)' }}
                    formatter={(v) => [`${v} menit`, 'Durasi']}
                  />
                  <Bar dataKey="durationMinutes" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.ongoing ? 'var(--danger)' : 'var(--warn)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="space-y-1">
              {data.incidents.length === 0 ? (
                <div className="text-[11px] text-center py-2" style={{ color: 'var(--text-muted)' }}>
                  Tidak ada downtime dalam periode ini
                </div>
              ) : [...data.incidents].reverse().map((inc, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b last:border-0"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="font-mono" style={{ color: 'var(--text2)' }}>
                    {new Date(inc.start).toLocaleString('id-ID')}
                  </span>
                  <span className={clsx('badge text-[10px]', inc.end === null ? 'badge-red' : 'badge-yellow')}>
                    {inc.end === null ? 'Ongoing' : formatDuration(inc.durationSeconds)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, unit, icon: Icon, color, sub }) {
  const pct = Math.min(100, parseFloat(value) || 0)
  const bar = pct >= 90 ? 'bg-[var(--danger)]' : pct >= 70 ? 'bg-[var(--warn)]' : 'bg-[var(--accent)]'
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color }} />
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div className="text-2xl font-mono font-semibold" style={{ color: 'var(--text)' }}>
        {value != null ? `${parseFloat(value).toFixed(1)}${unit}` : '—'}
      </div>
      {sub && <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
      <div className="mt-2 rounded-full h-1" style={{ background: 'var(--bg3)' }}>
        <div className={clsx('h-1 rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function SecretField({ label, value }) {
  const [visible, setVisible] = useState(false)
  const empty = !value || value === '—'
  const copy = () => { if (!empty) copyText(value).then(() => toast.success(`${label} disalin`)).catch(() => toast.error('Gagal menyalin')) }
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
      <span className="text-[10px] flex-shrink-0 w-28 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        <Key size={9} /> {label}
      </span>
      <div className="flex items-center gap-1 ml-auto overflow-hidden">
        <span className={clsx('text-xs font-mono truncate max-w-[130px] transition-all select-none',
          empty ? '' : visible ? '' : 'tracking-[0.2em]')}
          style={{ color: empty ? 'var(--text-muted)' : visible ? 'var(--text)' : 'var(--text-muted)' }}>
          {empty ? '—' : visible ? value : '••••••••••••'}
        </span>
        {!empty && <>
          <button onClick={() => setVisible(v => !v)} className="p-1 rounded"
            style={{ color: 'var(--text-muted)' }}>
            {visible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button onClick={copy} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}>
            <Copy size={11} />
          </button>
        </>}
      </div>
    </div>
  )
}

function EditSecretField({ label, fieldKey, value, onChange }) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase mb-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        <Key size={9} /> {label}
      </label>
      <div className="relative">
        <input className="input text-xs font-mono pr-8" type={visible ? 'text' : 'password'}
          value={value || ''} onChange={e => onChange(fieldKey, e.target.value)} autoComplete="new-password" />
        <button type="button" onClick={() => setVisible(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
          {visible ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  )
}

function InfoSection({ title, icon: Icon, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{title}</span>
        </div>
      </div>
      <div className="p-3 space-y-1">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0"
         style={{ borderColor: 'var(--border)' }}>
      <span className="text-[10px] flex-shrink-0 w-24" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={clsx('text-xs text-right break-all flex-1', mono && 'font-mono')}
            style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

function RustDeskPanel({ client }) {
  const [rdConfig, setRdConfig] = useState(null)
  const [showKey,  setShowKey]  = useState(false)
  const [deploying, setDeploying] = useState(false)

  useEffect(() => {
    api.get('/rustdesk/config-string').then(r => setRdConfig(r.data)).catch(() => {})
  }, [])

  const deploy = async () => {
    setDeploying(true)
    try {
      const r = await api.post(`/rustdesk/deploy-config/${client.id}`)
      toast.success(r.data.message)
    } catch(e) { toast.error(e.response?.data?.error || 'Gagal') }
    setDeploying(false)
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Radio size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>RustDesk Remote</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <SecretField label="RustDesk ID" value={client.rustdesk_id} />
        {rdConfig && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[['Rendezvous',rdConfig.host],['Relay',rdConfig.relay]].map(([k,v])=>(
                <div key={k} className="rounded p-2" style={{ background:'var(--bg3)' }}>
                  <div className="text-[10px] mb-1" style={{ color:'var(--text-muted)' }}>{k}</div>
                  <div className="font-mono text-xs truncate" style={{ color:'var(--text)' }}>{v||'—'}</div>
                </div>
              ))}
            </div>
            <div className="rounded p-2" style={{ background:'var(--bg3)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>Public Key</span>
                <button onClick={() => setShowKey(v=>!v)} className="text-[10px] flex items-center gap-1"
                  style={{ color:'var(--text-muted)' }}>
                  {showKey ? <EyeOff size={11}/> : <Eye size={11}/>}
                  {showKey ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <div className={clsx('font-mono text-[10px] break-all', !showKey && 'tracking-[0.15em] select-none')}
                   style={{ color: showKey ? 'var(--success)' : 'var(--text-muted)' }}>
                {showKey ? (rdConfig.pubKey||'—') : '••••••••••••••••••••••••••••••••••••••••'}
              </div>
            </div>
          </div>
        )}
        {client.os_type === 'linux' && (
          <button onClick={deploy} disabled={deploying} className="btn btn-ghost btn-sm w-full justify-center">
            {deploying ? <><RefreshCw size={12} className="animate-spin"/>Deploying...</> : <><Server size={12}/>Deploy Config RustDesk</>}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ClientDetail() {
  const canOperate = useAuthStore(s => s.user?.role === 'admin' || s.user?.role === 'operator')
  const { id } = useParams()
  const navigate = useNavigate()
  const [client,       setClient]       = useState(null)
  const [info,         setInfo]         = useState(null)
  const [cmdLogs,      setCmdLogs]      = useState([])
  const [cmd,          setCmd]          = useState('')
  const [cmdOut,       setCmdOut]       = useState('')
  const [running,      setRunning]      = useState(false)
  const [editing,      setEditing]      = useState(false)
  const [editData,     setEditData]     = useState({})
  const [fetchingInfo, setFetchingInfo] = useState(false)
  const [pinging,      setPinging]      = useState(false)

  useEffect(() => { loadClient(); loadCmdLogs() }, [id])

  const loadClient  = async () => {
    const r = await api.get(`/clients/${id}`).catch(() => null)
    if (r) { setClient(r.data); setEditData(r.data) }
  }
  const loadCmdLogs = async () => {
    const r = await api.get(`/logs/commands?clientId=${id}`).catch(() => null)
    if (r) setCmdLogs(r.data.slice(0, 20))
  }
  const fetchInfo   = async () => {
    setFetchingInfo(true)
    try { const r = await api.get(`/ssh/${id}/system-info`); setInfo(r.data); loadClient() }
    catch(e) { toast.error('Gagal: ' + (e.response?.data?.error || e.message)) }
    setFetchingInfo(false)
  }
  const ping = async () => {
    setPinging(true)
    try {
      const r = await api.post(`/clients/${id}/ping`)
      const timeLabel = typeof r.data.time === 'number' ? `${r.data.time}ms` : 'tidak merespons'
      toast[r.data.alive ? 'success' : 'error'](`${r.data.alive ? 'Online' : 'Offline'} — ${timeLabel}`)
      loadClient()
    } catch { toast.error('Ping gagal') }
    setPinging(false)
  }
  const runCmd = async () => {
    if (!cmd.trim()) return
    setRunning(true); setCmdOut('')
    try {
      const r = await api.post(`/ssh/${id}/exec`, { command: cmd })
      setCmdOut((r.data.stdout||'') + (r.data.stderr ? '\n[stderr]\n'+r.data.stderr : ''))
      loadCmdLogs()
    } catch(e) { setCmdOut('Error: ' + (e.response?.data?.error || e.message)) }
    setRunning(false)
  }
  const saveEdit = async () => {
    try { await api.put(`/clients/${id}`, editData); toast.success('Diperbarui'); setEditing(false); loadClient() }
    catch(e) { toast.error(e.response?.data?.error || 'Gagal') }
  }
  const set = (k, v) => setEditData(d => ({ ...d, [k]: v }))

  // Parse network info
  const netInfo = (() => { try { return JSON.parse(client?.network_info || '{}') } catch { return {} } })()
  const svcStatus = (() => { try { return JSON.parse(client?.services_status || '{}') } catch { return {} } })()

  const QUICK = [
    'uptime','hostname && hostname -I','df -h /','free -m',
    'systemctl status rsmp-agent --no-pager',
    'systemctl status x11vnc --no-pager',
    'systemctl status rustdesk --no-pager',
    'sudo apt-get update -qq && sudo apt-get upgrade -y -qq',
    'cat /var/log/rsmp-update.log | tail -30',
    'ps aux --sort=-%mem | head -12',
    'journalctl -n 40 --no-pager',
  ]

  if (!client) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-muted)' }}>
      <RefreshCw size={20} className="animate-spin" />
    </div>
  )

  const isLinux = client.os_type === 'linux'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/clients')} className="btn btn-ghost btn-sm btn-icon"><ArrowLeft size={14}/></button>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={clsx('w-2 h-2 rounded-full flex-shrink-0',
            client.status==='online'?'bg-[var(--success)] animate-pulse-slow':
            client.status==='offline'?'bg-[var(--danger)]':'bg-[var(--text-muted)]')}/>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate" style={{ color:'var(--text)' }}>{client.name}</h1>
            <div className="text-xs font-mono" style={{ color:'var(--text-muted)' }}>
              {client.ip_address} · {client.os_type} · {client.location||client.department||'—'}
            </div>
          </div>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button onClick={ping} disabled={pinging} className="btn btn-ghost btn-sm">
            {pinging?<RefreshCw size={12} className="animate-spin"/>:<Wifi size={12}/>} Ping
          </button>
          {isLinux && <>
            <button onClick={fetchInfo} disabled={fetchingInfo} className="btn btn-ghost btn-sm">
              <Activity size={12}/> {fetchingInfo?'Fetching...':'Refresh SSH Info'}
            </button>
            <button onClick={() => navigate(`/terminal/${id}`)} className="btn btn-primary btn-sm">
              <Terminal size={13}/> Terminal
            </button>
          </>}
          <button onClick={() => navigate(`/remote/${id}`)} className="btn btn-ghost btn-sm">
            <Monitor size={13}/> Remote
          </button>
          {canOperate && <button onClick={() => { setEditing(!editing); if(editing) setEditData(client) }} className="btn btn-ghost btn-sm">
            {editing?<X size={12}/>:<Edit2 size={12}/>} {editing?'Batal':'Edit'}
          </button>}
          {canOperate && editing && <button onClick={saveEdit} className="btn btn-success btn-sm"><Save size={12}/> Simpan</button>}
        </div>
      </div>

      {/* Metric cards */}
      {(info || client.cpu_usage != null) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="CPU" value={info?.cpuUsage??client.cpu_usage} unit="%" icon={Cpu}
            color="var(--accent)" sub={client.load_avg?`Load: ${client.load_avg}`:undefined}/>
          <MetricCard label="RAM" value={info?.ramUsage??client.ram_usage} unit="%" icon={MemoryStick}
            color="var(--info)" sub={client.ram_detail||undefined}/>
          <MetricCard label="Disk" value={info?.diskUsage??client.disk_usage} unit="%" icon={HardDrive}
            color="var(--warn)" sub={client.disk_detail||undefined}/>
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Package size={13} style={{ color:'var(--success)' }}/>
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color:'var(--text-muted)' }}>Pending Updates</span>
            </div>
            <div className="text-2xl font-mono font-semibold" style={{ color:'var(--text)' }}>
              {info?.packagesPending??client.packages_pending??'—'}
            </div>
            {client.boot_time && (
              <div className="text-[10px] font-mono mt-1" style={{ color:'var(--text-muted)' }}>
                Boot: {client.boot_time}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5 items-start">
        {/* Kiri: Detail + Edit */}
        <div className="col-span-1 space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{ color:'var(--text)' }}>Detail Client</span>
              {editing && <span className="badge badge-yellow text-[10px]">Edit</span>}
            </div>
            <div className="p-4">
              {editing ? (
                <div className="space-y-3">
                  {[
                    {k:'name',l:'Nama'},{k:'ip_address',l:'IP',mono:true},
                    {k:'hostname',l:'Hostname',mono:true},{k:'location',l:'Lokasi'},
                    {k:'department',l:'Departemen'},{k:'ssh_user',l:'SSH User',mono:true},
                    {k:'ssh_port',l:'SSH Port',mono:true},{k:'vnc_port',l:'VNC Port',mono:true},
                  ].map(f=>(
                    <div key={f.k}>
                      <label className="block text-[10px] font-mono uppercase mb-1"
                             style={{color:'var(--text-muted)'}}>{f.l}</label>
                      <input className={clsx('input text-xs',f.mono&&'font-mono')}
                        value={editData[f.k]||''} onChange={e=>set(f.k,e.target.value)}/>
                    </div>
                  ))}
                  <div className="pt-2 border-t space-y-3" style={{borderColor:'var(--border)'}}>
                    <div className="text-[10px] font-mono uppercase flex items-center gap-1"
                         style={{color:'var(--text-muted)'}}><Key size={9}/> Field Sensitif</div>
                    <EditSecretField label="RustDesk ID" fieldKey="rustdesk_id" value={editData.rustdesk_id} onChange={set}/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase mb-1" style={{color:'var(--text-muted)'}}>Catatan</label>
                    <textarea className="input text-xs h-16 resize-none" value={editData.notes||''}
                      onChange={e=>set('notes',e.target.value)}/>
                  </div>
                </div>
              ) : (
                <div className="space-y-0">
                  {[
                    ['IP',         client.ip_address],
                    ['Hostname',   info?.hostname||client.hostname||'—'],
                    ['OS',         info?.os||client.os_version||'—'],
                    ['Kernel',     info?.kernel||'—'],
                    ['Uptime',     info?.uptime||client.uptime||'—'],
                    ['Load Avg',   client.load_avg||'—'],
                    ['Boot',       client.boot_time||'—'],
                    ['Lokasi',     client.location||'—'],
                    ['Departemen', client.department||'—'],
                    ['Kategori',   client.category||'—'],
                    ['SSH User',   client.ssh_user||'rsadmin'],
                    ['SSH Port',   client.ssh_port||22],
                    ['VNC Port',   client.vnc_port||5901],
                    ['SSH Key',    client.ssh_ready?'✓ Ready':'✗ Belum'],
                    ['Agent',      client.agent_version||'—'],
                    ['Last Seen',  client.last_seen?new Date(client.last_seen).toLocaleString('id-ID'):'—'],
                    ['Last Update',client.last_update?new Date(client.last_update).toLocaleString('id-ID'):'—'],
                  ].map(([k,v])=>(
                    <div key={k} className="flex justify-between items-start gap-2 py-1.5 border-b last:border-0"
                         style={{borderColor:'var(--border)'}}>
                      <span className="text-[10px] flex-shrink-0 w-24" style={{color:'var(--text-muted)'}}>{k}</span>
                      <span className={clsx('text-xs font-mono text-right break-all',
                        k==='SSH Key'?(client.ssh_ready?'text-[var(--success)]':'text-[var(--warn)]'):'')}
                        style={{color:k==='SSH Key'?undefined:'var(--text)'}}>{v}</span>
                    </div>
                  ))}
                  <div className="pt-1">
                    <SecretField label="RustDesk ID"  value={client.rustdesk_id}/>
                  </div>
                  {client.notes && (
                    <div className="mt-2 text-[10px] rounded p-2" style={{background:'var(--bg3)',color:'var(--text2)'}}>
                      {client.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          {canOperate && <div className="card p-4">
            <div className="text-xs font-mono uppercase tracking-wider mb-3" style={{color:'var(--text-muted)'}}>Quick Actions</div>
            <div className="space-y-1.5">
              {isLinux && <>
                <button onClick={()=>setCmd('sudo apt-get update -qq && sudo apt-get upgrade -y -qq')}
                  className="btn btn-ghost btn-sm w-full justify-start text-xs">
                  <RefreshCw size={12}/> Update Paket
                </button>
                <button onClick={()=>api.post(`/ssh/${id}/exec`,{command:'sudo systemctl restart rsmp-agent'}).then(()=>toast.success('Restarted'))}
                  className="btn btn-ghost btn-sm w-full justify-start text-xs">
                  <Activity size={12}/> Restart Agent
                </button>
                <button onClick={()=>api.post(`/ssh/${id}/exec`,{command:'sudo systemctl restart x11vnc'}).then(()=>toast.success('VNC restarted'))}
                  className="btn btn-ghost btn-sm w-full justify-start text-xs">
                  <Monitor size={12}/> Restart VNC
                </button>
                <button onClick={()=>api.post(`/ssh/${id}/exec`,{command:'sudo systemctl restart rustdesk'}).then(()=>toast.success('RustDesk restarted'))}
                  className="btn btn-ghost btn-sm w-full justify-start text-xs">
                  <Radio size={12}/> Restart RustDesk
                </button>
              </>}
              <button onClick={()=>navigate(`/tickets?client=${id}`)}
                className="btn btn-ghost btn-sm w-full justify-start text-xs">
                <Package size={12}/> Buat Ticket
              </button>
            </div>
          </div>}
        </div>

        {/* Kanan: Info detail + SSH + RustDesk */}
        <div className="col-span-2 space-y-4">

          {/* Info cards grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Running Apps */}
            {client.running_apps && (
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <List size={13} style={{color:'var(--accent)'}}/>
                  <span className="text-xs font-medium" style={{color:'var(--text)'}}>Aplikasi Berjalan</span>
                </div>
                <div className="text-[11px] font-mono leading-5" style={{color:'var(--text2)'}}>
                  {client.running_apps.split(',').map((a,i)=>(
                    <span key={i} className="inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] mb-1"
                          style={{background:'var(--bg3)',color:'var(--accent)'}}>
                      {a.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top Processes (CPU/mem per proses) */}
            {client.top_processes && (
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={13} style={{color:'var(--danger)'}}/>
                  <span className="text-xs font-medium" style={{color:'var(--text)'}}>Proses Teratas (CPU/Mem)</span>
                </div>
                <div className="space-y-1">
                  {client.top_processes.split(';').map((p,i)=>{
                    const m = p.trim().match(/^(.+?)\(cpu:([\d.]+)s,mem:([\d.]+)MB\)$/)
                    return (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="font-mono truncate" style={{color:'var(--text2)'}}>{m ? m[1] : p.trim()}</span>
                        {m && (
                          <span className="font-mono flex-shrink-0 ml-2" style={{color:'var(--text-muted)'}}>
                            {m[2]}s · {m[3]}MB
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Network */}
            {netInfo.ip && (
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Network size={13} style={{color:'var(--info)'}}/>
                  <span className="text-xs font-medium" style={{color:'var(--text)'}}>Jaringan</span>
                </div>
                <div className="space-y-1">
                  {[['IP',netInfo.ip],['Interface',netInfo.iface],
                    ['Gateway',netInfo.gateway],['MAC',netInfo.mac],
                    ['DNS',netInfo.dns]].map(([k,v])=> v ? (
                    <div key={k} className="flex justify-between text-[10px]">
                      <span style={{color:'var(--text-muted)'}}>{k}</span>
                      <span className="font-mono" style={{color:'var(--text)'}}>{v}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            {/* Logged users */}
            {client.logged_users && (
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={13} style={{color:'var(--success)'}}/>
                  <span className="text-xs font-medium" style={{color:'var(--text)'}}>User Login</span>
                </div>
                <div className="text-[11px] font-mono" style={{color:'var(--text2)'}}>
                  {client.logged_users || 'Tidak ada'}
                </div>
              </div>
            )}

            {/* Services status */}
            {Object.keys(svcStatus).length > 0 && (
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Layers size={13} style={{color:'var(--warn)'}}/>
                  <span className="text-xs font-medium" style={{color:'var(--text)'}}>Status Services</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(svcStatus).map(([svc,st])=>(
                    <div key={svc} className="flex items-center justify-between text-[10px]">
                      <span className="font-mono truncate" style={{color:'var(--text-muted)'}}>{svc}</span>
                      <span className={clsx('badge text-[10px]',st==='active'?'badge-green':'badge-red')}>{st}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Uptime history */}
          <UptimeSection clientId={id} />

          {/* RustDesk panel */}
          <RustDeskPanel client={client} />

          {/* SSH Exec */}
          {isLinux && canOperate && (
            <div className="card">
              <div className="card-header">
                <span className="text-sm font-medium" style={{color:'var(--text)'}}>Jalankan Perintah SSH</span>
                <button onClick={()=>navigate(`/terminal/${id}`)} className="btn btn-ghost btn-sm">
                  <Terminal size={12}/> Terminal Penuh →
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-1.5 flex-wrap">
                  {QUICK.map(q=>(
                    <button key={q} onClick={()=>setCmd(q)}
                      className="px-2 py-1 text-[10px] font-mono rounded transition-colors border"
                      style={{background:'var(--bg3)',borderColor:'var(--border)',color:'var(--text2)'}}>
                      {q.length>28?q.slice(0,28)+'…':q}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono text-sm" placeholder="$ perintah..."
                    value={cmd} onChange={e=>setCmd(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&runCmd()}/>
                  <button onClick={runCmd} disabled={running||!cmd.trim()} className="btn btn-primary btn-sm px-4">
                    {running?<RefreshCw size={13} className="animate-spin"/>:'Run'}
                  </button>
                </div>
                {cmdOut && (
                  <div className="terminal-box h-44 text-[11px] whitespace-pre-wrap overflow-auto">{cmdOut}</div>
                )}
              </div>
            </div>
          )}

          {/* Windows */}
          {client.os_type==='windows' && (
            <div className="card p-5">
              <div className="text-sm font-medium mb-3" style={{color:'var(--text)'}}>Windows Remote</div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={()=>navigate(`/remote/${id}`)} className="btn btn-primary justify-center py-3">
                  <Monitor size={14}/> Remote Desktop (RDP)
                </button>
                <div className="card p-3">
                  <div className="text-[10px] font-mono mb-1" style={{color:'var(--text-muted)'}}>RDP Command</div>
                  <div className="font-mono text-xs" style={{color:'var(--text)'}}>{`mstsc /v:${client.ip_address}`}</div>
                  <button onClick={()=>copyText(`mstsc /v:${client.ip_address}`).then(()=>toast.success('Disalin')).catch(()=>toast.error('Gagal menyalin'))}
                    className="btn btn-ghost btn-sm mt-2 w-full text-[10px]">
                    <Copy size={11}/> Salin
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Command logs */}
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{color:'var(--text)'}}>Riwayat Perintah</span>
              <button onClick={loadCmdLogs} className="btn btn-ghost btn-sm btn-icon"><RefreshCw size={12}/></button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Waktu</th><th>Perintah</th><th>Exit</th><th>Durasi</th></tr></thead>
                <tbody>
                  {cmdLogs.length===0
                    ?<tr><td colSpan={4} className="text-center py-6" style={{color:'var(--text-muted)'}}>Belum ada riwayat</td></tr>
                    :cmdLogs.map(l=>(
                    <tr key={l.id}>
                      <td className="font-mono text-[10px]">{new Date(l.created_at).toLocaleString('id-ID')}</td>
                      <td className="font-mono text-xs max-w-xs truncate" style={{color:'var(--accent)'}} title={l.command}>{l.command}</td>
                      <td><span className={clsx('badge text-[10px]',(l.exit_code||0)===0?'badge-green':'badge-red')}>{l.exit_code??'—'}</span></td>
                      <td className="font-mono text-[10px]" style={{color:'var(--text-muted)'}}>{l.duration_ms?`${l.duration_ms}ms`:'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
