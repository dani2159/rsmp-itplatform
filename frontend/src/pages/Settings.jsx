import React, { useState, useEffect } from 'react'
import { Save, Plus, RefreshCw, Eye, EyeOff, Copy } from 'lucide-react'
import api from '../services/api'
import { copyText } from '../services/clipboard'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function Settings() {
  const [config,   setConfig]   = useState({})
  const [users,    setUsers]    = useState([])
  const [newUser,  setNewUser]  = useState({ username:'', password:'', full_name:'', role:'viewer' })
  const [saving,   setSaving]   = useState(false)
  const [addingU,  setAddingU]  = useState(false)
  const [changePw, setChangePw] = useState({ old:'', new1:'', new2:'' })
  const [agentToken, setAgentToken] = useState('')
  const [showToken,  setShowToken]  = useState(false)

  useEffect(() => {
    api.get('/system/config').then(r => setConfig(r.data)).catch(()=>{})
    api.get('/auth/users').then(r => setUsers(r.data)).catch(()=>{})
    api.get('/system/agent-token').then(r => setAgentToken(r.data.token || '')).catch(()=>{})
  }, [])

  const copyToken = () => {
    if (!agentToken) return
    copyText(agentToken).then(() => toast.success('Token disalin')).catch(() => toast.error('Gagal menyalin'))
  }

  const serverBase = () => {
    const ip = config.server_ip || window.location.hostname
    const port = config.web_port || window.location.port || '80'
    return `http://${ip}:${port}`
  }

  const copyLinuxCmd = () => {
    if (!agentToken) return
    const base = serverBase()
    const vp = config.vnc_password || 'Rsmps@2025'
    const cmd = `curl -sf ${base}/api/agent/download/install-agent.sh -o install-agent.sh && RS_SERVER=${base} RS_AGENT_TOKEN=${agentToken} VNC_PASS=${vp} sudo bash install-agent.sh`
    copyText(cmd).then(() => toast.success('Command Linux disalin')).catch(() => toast.error('Gagal menyalin'))
  }

  const copyWindowsCmd = () => {
    if (!agentToken) return
    const base = serverBase()
    const vp = config.vnc_password || 'Rsmps@2025'
    const cmd = `iwr ${base}/api/agent/download/rs-agent.ps1 -OutFile rs-agent.ps1; iwr ${base}/api/agent/download/install-agent-windows.bat -OutFile install-agent-windows.bat; $env:RS_SERVER_URL="${base}"; $env:RS_AGENT_TOKEN="${agentToken}"; $env:RS_VNC_PASSWORD="${vp}"; .\\install-agent-windows.bat`
    copyText(cmd).then(() => toast.success('Command Windows disalin (paste di PowerShell Administrator)')).catch(() => toast.error('Gagal menyalin'))
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      await api.put('/system/config', {
        rs_name: config.rs_name,
        server_ip: config.server_ip,
        vnc_password: config.vnc_password,
        telegram_bot_token: config.telegram_bot_token,
        telegram_chat_id: config.telegram_chat_id,
      })
      toast.success('Pengaturan disimpan')
    } catch(e) { toast.error('Gagal menyimpan') }
    setSaving(false)
  }

  const testTelegram = async () => {
    try {
      await api.post('/system/alerts/test')
      toast.success('Pesan test terkirim — cek Telegram')
    } catch(e) { toast.error(e.response?.data?.error || 'Gagal kirim test') }
  }

  const addUser = async (e) => {
    e.preventDefault()
    if (!newUser.username || !newUser.password) { toast.error('Username dan password wajib'); return }
    setAddingU(true)
    try {
      await api.post('/auth/users', newUser)
      toast.success('User ditambahkan')
      setNewUser({ username:'', password:'', full_name:'', role:'viewer' })
      api.get('/auth/users').then(r => setUsers(r.data)).catch(()=>{})
    } catch(e) { toast.error(e.response?.data?.error||'Gagal') }
    setAddingU(false)
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (changePw.new1 !== changePw.new2) { toast.error('Password baru tidak sama'); return }
    try {
      await api.post('/auth/change-password', { oldPassword: changePw.old, newPassword: changePw.new1 })
      toast.success('Password berhasil diubah')
      setChangePw({ old:'', new1:'', new2:'' })
    } catch(e) { toast.error(e.response?.data?.error||'Gagal') }
  }

  const Label = ({ children }) => (
    <label className="block text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color:'var(--text-muted)' }}>
      {children}
    </label>
  )

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-h2 page-title">Pengaturan Sistem</h1>
        <p className="text-body-sm muted">Konfigurasi RSMP-IT Platform</p>
      </div>

      <div className="grid grid-cols-2 gap-5 items-start">
        <div className="space-y-4">
          {/* System config */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{ color:'var(--text)' }}>Info Instansi</span></div>
            <div className="card-body space-y-3">
              <div><Label>Nama RS / Instansi</Label>
                <input className="input" value={config.rs_name||''} onChange={e=>setConfig(c=>({...c,rs_name:e.target.value}))} placeholder="RSMP ..."/>
              </div>
              <div><Label>IP Server</Label>
                <input className="input font-mono" value={config.server_ip||''} onChange={e=>setConfig(c=>({...c,server_ip:e.target.value}))} placeholder="192.168.x.x"/>
              </div>
              <div><Label>Password VNC Default</Label>
                <input className="input font-mono" value={config.vnc_password||''} onChange={e=>setConfig(c=>({...c,vnc_password:e.target.value}))} placeholder="Rsmps@2025" maxLength={16}/>
                <p className="text-[10px] mt-1" style={{ color:'var(--text-muted)' }}>
                  Dipakai agent baru (Linux &amp; Windows) &amp; auto-fill remote desktop. VNC classic auth cuma baca 8 karakter pertama. Client yang udah kepasang gak ikut berubah otomatis — reinstall agent atau ganti manual.
                </p>
              </div>
              <button onClick={saveConfig} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? <><RefreshCw size={12} className="animate-spin"/>Menyimpan...</> : <><Save size={12}/>Simpan</>}
              </button>
            </div>
          </div>

          {/* Notifikasi Telegram */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{ color:'var(--text)' }}>Notifikasi Telegram</span></div>
            <div className="card-body space-y-3">
              <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                Alert otomatis (client offline/online, disk &ge;90%, CPU &ge;95% berkepanjangan) dikirim ke grup/chat Telegram.
                Buat bot via @BotFather, masukkan bot ke grup IT, lalu isi token &amp; chat ID di sini.
              </p>
              <div><Label>Bot Token</Label>
                <input className="input font-mono" value={config.telegram_bot_token||''}
                  onChange={e=>setConfig(c=>({...c,telegram_bot_token:e.target.value}))}
                  placeholder="123456789:AAF..."/>
              </div>
              <div><Label>Chat ID</Label>
                <input className="input font-mono" value={config.telegram_chat_id||''}
                  onChange={e=>setConfig(c=>({...c,telegram_chat_id:e.target.value}))}
                  placeholder="-1001234567890 (grup) atau chat ID pribadi"/>
              </div>
              <div className="flex gap-2">
                <button onClick={saveConfig} disabled={saving} className="btn btn-primary btn-sm">
                  <Save size={12}/>Simpan
                </button>
                <button onClick={testTelegram} className="btn btn-ghost btn-sm">Kirim Test</button>
              </div>
            </div>
          </div>

          {/* SSH Public key info */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{ color:'var(--text)' }}>SSH Public Key</span></div>
            <div className="card-body">
              <div className="terminal-box text-[10px] break-all mb-2">{config.pub_key || 'Memuat...'}</div>
              <a href="/api/iso/pubkey/download" className="btn btn-ghost btn-sm w-full justify-center">Download key</a>
            </div>
          </div>

          {/* Agent token */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{ color:'var(--text)' }}>Agent Token</span></div>
            <div className="card-body">
              <p className="text-[10px] mb-2" style={{ color:'var(--text-muted)' }}>
                Dipakai saat install agent di client (RS_AGENT_TOKEN / -AgentToken). Wajib kalau server jalan production mode.
              </p>
              <div className="flex items-center gap-2">
                <div className="terminal-box text-[10px] break-all flex-1 select-none">
                  {agentToken ? (showToken ? agentToken : '••••••••••••••••••••••••••••••••••••') : 'Memuat...'}
                </div>
                <button onClick={()=>setShowToken(v=>!v)} className="btn btn-ghost btn-sm btn-icon" disabled={!agentToken}>
                  {showToken ? <EyeOff size={12}/> : <Eye size={12}/>}
                </button>
                <button onClick={copyToken} className="btn btn-ghost btn-sm btn-icon" disabled={!agentToken}>
                  <Copy size={12}/>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={copyLinuxCmd} disabled={!agentToken} className="btn btn-ghost btn-sm justify-center">
                  <Copy size={11}/> Install Command (Linux)
                </button>
                <button onClick={copyWindowsCmd} disabled={!agentToken} className="btn btn-ghost btn-sm justify-center">
                  <Copy size={11}/> Install Command (Windows)
                </button>
              </div>
              <p className="text-[10px] mt-2" style={{ color:'var(--text-muted)' }}>
                Paste command Linux di terminal client (sudo), atau command Windows di PowerShell (Run as Administrator).
              </p>
            </div>
          </div>

          {/* Change password */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{ color:'var(--text)' }}>Ganti Password Saya</span></div>
            <form onSubmit={changePassword} className="card-body space-y-3">
              {[
                { key:'old',  label:'Password Lama', type:'password' },
                { key:'new1', label:'Password Baru',  type:'password' },
                { key:'new2', label:'Konfirmasi Baru', type:'password' },
              ].map(f => (
                <div key={f.key}><Label>{f.label}</Label>
                  <input type={f.type} className="input" value={changePw[f.key]}
                    onChange={e=>setChangePw(p=>({...p,[f.key]:e.target.value}))}/>
                </div>
              ))}
              <button type="submit" className="btn btn-primary btn-sm">Ganti Password</button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          {/* Add user */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{ color:'var(--text)' }}>Tambah IT Staff</span></div>
            <form onSubmit={addUser} className="card-body space-y-3">
              {[
                { key:'full_name', label:'Nama Lengkap', type:'text' },
                { key:'username',  label:'Username',     type:'text', mono:true },
                { key:'password',  label:'Password',     type:'password' },
              ].map(f => (
                <div key={f.key}><Label>{f.label}</Label>
                  <input type={f.type} className={`input${f.mono?' font-mono':''}`}
                    value={newUser[f.key]} onChange={e=>setNewUser(u=>({...u,[f.key]:e.target.value}))} required/>
                </div>
              ))}
              <div><Label>Role</Label>
                <select className="select" value={newUser.role} onChange={e=>setNewUser(u=>({...u,role:e.target.value}))}>
                  <option value="viewer">Viewer (read-only + buat ticket)</option>
                  <option value="operator">Operator (kelola client + jalankan aksi)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" disabled={addingU} className="btn btn-primary btn-sm w-full justify-center">
                {addingU ? 'Menyimpan...' : <><Plus size={12}/>Tambah User</>}
              </button>
            </form>
          </div>

          {/* User list */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-medium" style={{ color:'var(--text)' }}>Daftar IT Staff</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Login Terakhir</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="text-xs" style={{ color:'var(--text)' }}>{u.full_name||'—'}</td>
                      <td className="font-mono text-xs">{u.username}</td>
                      <td><span className={clsx('badge text-[10px]',
                        u.role==='admin'?'badge-purple':u.role==='operator'?'badge-yellow':'badge-blue')}>{u.role}</span></td>
                      <td><span className={clsx('badge text-[10px]',u.active?'badge-green':'badge-red')}>{u.active?'Aktif':'Nonaktif'}</span></td>
                      <td className="font-mono text-[10px]" style={{ color:'var(--text-muted)' }}>
                        {u.last_login ? new Date(u.last_login).toLocaleString('id-ID') : '—'}
                      </td>
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
