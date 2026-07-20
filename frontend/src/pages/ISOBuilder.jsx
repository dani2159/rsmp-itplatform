import React, { useState, useEffect, useRef } from 'react'
import { Disc, RefreshCw, Download, CheckCircle, Terminal, AlertCircle, Trash2 } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'

const LAST_JOB_KEY = 'rsmp_iso_last_job'

export default function ISOBuilder() {
  const [isos,     setIsos]     = useState([])
  // Rehydrate dari localStorage biar build yang lagi jalan gak "hilang"
  // pas pindah halaman terus balik lagi -- component ini unmount total
  // tiap ganti route, useState biasa gak survive itu.
  const [building, setBuilding] = useState(() => !!localStorage.getItem(LAST_JOB_KEY))
  const [jobId,    setJobId]    = useState(() => {
    const v = localStorage.getItem(LAST_JOB_KEY)
    return v ? Number(v) : null
  })
  const [jobStatus,setJobStatus]= useState(() => localStorage.getItem(LAST_JOB_KEY) ? 'running' : null)
  const [buildLog, setBuildLog] = useState('')
  const [label,    setLabel]    = useState('LinuxMint-RSMP')
  const [serverUrl,setServerUrl]= useState('')
  const [baseIso,  setBaseIso]  = useState('/tmp/linuxmint-base.iso')
  const logRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    api.get('/iso/list').then(r => setIsos(r.data)).catch(() => {})
    api.get('/system/config').then(r => {
      if (r.data.server_ip && r.data.web_port)
        setServerUrl(`http://${r.data.server_ip}:${r.data.web_port}`)
    }).catch(() => {})
  }, [])

  // Poll status jika ada job berjalan (termasuk yang di-rehydrate dari
  // localStorage setelah balik dari halaman lain)
  useEffect(() => {
    if (!jobId) return
    const poll = async () => {
      try {
        const [statusR, logR] = await Promise.all([
          api.get(`/iso/jobs/${jobId}/status`),
          api.get(`/iso/jobs/${jobId}/log`),
        ])
        setJobStatus(statusR.data.status)
        setBuildLog(logR.data.log || '')
        setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 100)

        if (statusR.data.status === 'finished' || statusR.data.status === 'error') {
          clearInterval(pollRef.current)
          setBuilding(false)
          localStorage.removeItem(LAST_JOB_KEY)
          if (statusR.data.status === 'finished') {
            toast.success('ISO build selesai!')
            api.get('/iso/list').then(r => setIsos(r.data)).catch(() => {})
          } else {
            toast.error('ISO build gagal — cek log')
          }
        }
      } catch(e) {}
    }
    poll() // langsung fetch sekali, gak nunggu interval pertama (3s)
    pollRef.current = setInterval(poll, 3000)
    return () => clearInterval(pollRef.current)
  }, [jobId])

  const startBuild = async () => {
    if (!baseIso) { toast.error('Path ISO base wajib diisi'); return }
    setBuilding(true)
    setBuildLog('')
    setJobStatus('running')
    try {
      const r = await api.post('/iso/build', { baseIso, label, serverUrl })
      setJobId(r.data.jobId)
      localStorage.setItem(LAST_JOB_KEY, String(r.data.jobId))
      toast.success('ISO build dimulai! Proses ~30-60 menit.')
      setBuildLog(`Job ID: ${r.data.jobId}\nBuild dimulai: ${new Date().toLocaleString('id-ID')}\nMonitoring log...\n`)
    } catch(e) {
      toast.error(e.response?.data?.error || 'Gagal')
      setBuilding(false)
      setJobStatus(null)
    }
  }

  const deleteIso = async (name) => {
    if (!confirm(`Hapus ${name}?`)) return
    try {
      await api.delete(`/iso/${name}`)
      toast.success('ISO dihapus')
      setIsos(prev => prev.filter(iso => iso.name !== name))
    } catch(e) {
      toast.error(e.response?.data?.error || 'Gagal hapus')
    }
  }

  const fetchLog = async () => {
    if (!jobId) return
    try {
      const r = await api.get(`/iso/jobs/${jobId}/log`)
      setBuildLog(r.data.log || '')
    } catch(e) {}
  }

  const INCLUDES = [
    'ISO Linux Mint XFCE apa adanya (base, belum dimodifikasi paket/appnya)',
    'File agent RSMP dititip di /opt/rsmp-agent-src (best-effort, TIDAK dijamin ada di sistem hasil instalasi)',
  ]

  const statusColor = {
    running:  'var(--warn)',
    finished: 'var(--success)',
    error:    'var(--danger)',
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-h2 page-title">ISO Builder</h1>
        <p className="text-body-sm muted">
          Build custom Linux Mint XFCE untuk deployment RSMP
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5 items-start">
        {/* Build form */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{color:'var(--text)'}}>Konfigurasi Build</span>
              {jobStatus && (
                <span className="badge text-[10px]" style={{
                  background: jobStatus==='running' ? 'var(--warn2)' :
                              jobStatus==='finished' ? 'var(--success2)' : 'var(--danger2)',
                  color: statusColor[jobStatus] || 'var(--text-muted)'
                }}>
                  {jobStatus==='running' ? '⟳ Building...' :
                   jobStatus==='finished' ? '✓ Selesai' : '✗ Error'}
                </span>
              )}
            </div>
            <div className="card-body space-y-3">
              <div className="alert alert-warning text-xs">
                ⚠ Download ISO Linux Mint XFCE dari{' '}
                <a href="https://www.linuxmint.com/download.php" target="_blank"
                   rel="noreferrer" style={{color:'var(--accent)'}} className="underline">
                  linuxmint.com
                </a>{' '}
                dan simpan ke path di bawah ini di server.
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase mb-1" style={{color:'var(--text-muted)'}}>
                  Path ISO Base di Server
                </label>
                <input className="input font-mono text-xs" value={baseIso}
                  onChange={e=>setBaseIso(e.target.value)}
                  placeholder="/tmp/linuxmint-base.iso"/>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase mb-1" style={{color:'var(--text-muted)'}}>
                  Label ISO
                </label>
                <input className="input font-mono" value={label}
                  onChange={e=>setLabel(e.target.value)}
                  placeholder="LinuxMint-RSMP"/>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase mb-1" style={{color:'var(--text-muted)'}}>
                  URL Server RSMP (untuk agent config)
                </label>
                <input className="input font-mono text-xs" value={serverUrl}
                  onChange={e=>setServerUrl(e.target.value)}
                  placeholder="http://192.168.x.x:8080"/>
              </div>

              <button onClick={startBuild} disabled={building}
                className="btn btn-primary w-full justify-center py-2">
                {building
                  ? <><RefreshCw size={13} className="animate-spin"/> Building (~30-60 menit)...</>
                  : <><Disc size={13}/> Build ISO Sekarang</>}
              </button>

              {jobId && (
                <div className="text-xs font-mono p-2 rounded" style={{background:'var(--bg3)', color:'var(--text-muted)'}}>
                  Job ID: <span style={{color:'var(--accent)'}}>{jobId}</span>
                  <br/>
                  Log server: <code className="text-[10px]">/var/log/rsmp-it-platform/iso-build-{jobId}.log</code>
                  <br/>
                  Pantau langsung: <code className="text-[10px]">tail -f /var/log/rsmp-it-platform/iso-build-{jobId}.log</code>
                </div>
              )}
            </div>
          </div>

          {/* Build Log */}
          {(buildLog || building) && (
            <div className="card">
              <div className="card-header">
                <span className="text-sm font-medium" style={{color:'var(--text)'}}>Build Log</span>
                <button onClick={fetchLog} className="btn btn-ghost btn-sm btn-icon" title="Refresh log">
                  <RefreshCw size={12}/>
                </button>
              </div>
              <div ref={logRef}
                className="terminal-box m-3 text-[10px] whitespace-pre-wrap"
                style={{height:'280px', overflowY:'auto'}}>
                {buildLog || <span style={{color:'var(--text-muted)'}}>Menunggu output...</span>}
                {building && <span className="cursor-blink"/>}
              </div>
              <div className="px-3 pb-3 text-[10px]" style={{color:'var(--text-muted)'}}>
                💡 Pantau langsung di server:{' '}
                <code className="font-mono" style={{color:'var(--accent)'}}>
                  tail -f /var/log/rsmp-it-platform/iso-build.log
                </code>
              </div>
            </div>
          )}
        </div>

        {/* Kanan: ISO includes + list */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{color:'var(--text)'}}>Yang Termasuk dalam ISO</span>
            </div>
            <div className="p-4 space-y-1.5">
              {INCLUDES.map(item=>(
                <div key={item} className="flex items-center gap-2 text-xs" style={{color:'var(--text2)'}}>
                  <CheckCircle size={12} style={{color:'var(--success)', flexShrink:0}}/>
                  {item}
                </div>
              ))}
              <div className="alert alert-warning text-[11px] mt-2">
                ⚠ Sudah ditest: instalasi penuh Linux Mint dari ISO ini <b>tidak
                membawa</b> agent RSMP ke sistem hasil instalasi (installer Mint
                tidak menyalin modifikasi kita). Lihat "Cara Deploy" di bawah —
                agent tetap perlu di-install manual (1-liner) setelah Mint selesai
                di-install.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium" style={{color:'var(--text)'}}>ISO Tersedia untuk Download</span>
              <button onClick={()=>api.get('/iso/list').then(r=>setIsos(r.data))}
                className="btn btn-ghost btn-sm btn-icon"><RefreshCw size={12}/></button>
            </div>
            {isos.length===0 ? (
              <div className="p-8 text-center text-xs" style={{color:'var(--text-muted)'}}>
                <Disc size={24} className="mx-auto mb-2 opacity-30"/>
                Belum ada ISO yang di-build
              </div>
            ) : isos.map((iso,i)=>(
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                   style={{borderColor:'var(--border)'}}>
                <Disc size={14} style={{color:'var(--accent)', flexShrink:0}}/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{color:'var(--text)'}}>{iso.name}</div>
                  <div className="text-[10px] font-mono" style={{color:'var(--text-muted)'}}>
                    {(iso.size/1024/1024/1024).toFixed(2)} GB ·{' '}
                    {new Date(iso.created).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <a href={`/api/iso/download/${iso.name}`}
                   className="btn btn-ghost btn-sm">
                  <Download size={12}/> Download
                </a>
                <button onClick={()=>deleteIso(iso.name)}
                   className="btn btn-ghost btn-sm btn-icon" title="Hapus ISO">
                  <Trash2 size={12} style={{color:'var(--danger)'}}/>
                </button>
              </div>
            ))}
          </div>

          {/* Cara deploy ISO */}
          <div className="card p-4">
            <div className="text-xs font-semibold font-mono uppercase mb-2"
                 style={{color:'var(--text-muted)'}}>Cara Deploy ISO</div>
            <div className="space-y-2 text-xs" style={{color:'var(--text2)'}}>
              <div className="flex items-start gap-2">
                <span className="badge badge-blue text-[10px] mt-0.5 flex-shrink-0">1</span>
                <span>Download ISO lalu flash ke USB dengan <span style={{color:'var(--accent)'}}>Ventoy</span> (bisa multi-ISO)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge badge-blue text-[10px] mt-0.5 flex-shrink-0">2</span>
                <span>Boot PC dari USB, install Linux Mint seperti biasa</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge badge-blue text-[10px] mt-0.5 flex-shrink-0">3</span>
                <span>Setelah install Mint selesai & boot ke desktop, buka Settings {'>'} Agent Token di RSMP, copy "Install Command (Linux)"</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge badge-blue text-[10px] mt-0.5 flex-shrink-0">4</span>
                <span>Paste & jalankan command itu di terminal PC yang baru diinstall — agent+VNC ke-setup dan PC otomatis daftar ke dashboard</span>
              </div>
            </div>

            <div className="mt-3 rounded p-2 text-[10px] font-mono"
                 style={{background:'var(--terminal-bg)', color:'var(--text-muted)'}}>
              <span style={{color:'var(--text2)'}}># Flash ke USB (Linux):</span>{'\n'}
              <span style={{color:'var(--success)'}}>sudo dd if=LinuxMint-RSMP.iso of=/dev/sdX bs=4M status=progress</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
