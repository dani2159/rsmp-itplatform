import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Monitor, ArrowLeft, Maximize2, RefreshCw, Clipboard, X, Wifi, WifiOff, Eye, EyeOff, Radio } from 'lucide-react'
import api from '../services/api'
import { copyText } from '../services/clipboard'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function RemoteDesktop() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const iframeRef = useRef(null)

  const [client,      setClient]      = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [fullscreen,  setFullscreen]  = useState(false)
  const [vncReady,    setVncReady]    = useState(false)
  const [vncError,    setVncError]    = useState(null)
  const [showRdId,    setShowRdId]    = useState(false)
  const [rdConfig,    setRdConfig]    = useState(null)

  useEffect(() => {
    api.get(`/clients/${id}`)
      .then(r => { setClient(r.data); })
      .catch(() => setError('Client tidak ditemukan'))
      .finally(() => setLoading(false))

    api.get('/rustdesk/config-string').then(r => setRdConfig(r.data)).catch(() => {})
  }, [id])

  // Bangun URL noVNC yang benar
  const buildVncUrl = useCallback((c) => {
    if (!c) return null
    const vnc_port = c.vnc_port || 5901
    const { hostname, port, protocol } = window.location
    const wsPort  = port || (protocol === 'https:' ? '443' : '80')
    // Path WebSocket diteruskan ke novnc-proxy.py via nginx
    const wsPath  = encodeURIComponent(`novnc-ws/${c.ip_address}/${vnc_port}`)
    return `/novnc/vnc.html` +
      `?host=${hostname}` +
      `&port=${wsPort}` +
      `&path=${wsPath}` +
      `&encrypt=0` +
      `&autoconnect=true` +
      (c.vnc_password ? `&password=${encodeURIComponent(c.vnc_password)}` : '') +
      `&reconnect=true` +
      `&reconnect_delay=3000` +
      `&resize=scale` +
      `&quality=6` +
      `&compression=2` +
      `&view_only=false` +
      `&show_dot=true`
  }, [])

  const handleIframeLoad = () => {
    setVncReady(true)
    setVncError(null)
  }

  const handleIframeError = () => {
    setVncError('Gagal memuat noVNC. Pastikan server noVNC berjalan.')
  }

  const reload = () => {
    setVncReady(false)
    setVncError(null)
    if (iframeRef.current) {
      const src = iframeRef.current.src
      iframeRef.current.src = ''
      setTimeout(() => { if (iframeRef.current) iframeRef.current.src = src }, 200)
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      iframeRef.current?.parentElement?.requestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const copyRdId = () => {
    copyText(client?.rustdesk_id || '').then(() => toast.success('RustDesk ID disalin')).catch(() => toast.error('Gagal menyalin'))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[var(--bg)] text-[var(--text-muted)]">
      <div className="text-center">
        <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-[var(--accent)]" />
        <div className="text-sm">Memuat data client...</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
      <div className="text-center">
        <Monitor size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
        <div className="text-sm text-[var(--danger)]">{error}</div>
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm mt-4">
          <ArrowLeft size={13} /> Kembali
        </button>
      </div>
    </div>
  )

  const isLinux   = client?.os_type === 'linux'
  const isWindows = client?.os_type === 'windows'
  const hasVnc    = isLinux || isWindows        // Windows kini pakai TightVNC (port 5901)
  const vncUrl    = hasVnc ? buildVncUrl(client) : null

  return (
    <div className={clsx(
      'flex flex-col bg-[#080a0f]',
      fullscreen ? 'fixed inset-0 z-50' : 'h-screen'
    )}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--border)] flex-shrink-0">
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm btn-icon">
          <ArrowLeft size={14} />
        </button>
        <Monitor size={15} className="text-[var(--accent)] flex-shrink-0" />
        <div>
          <div className="text-sm font-medium text-[var(--text)]">
            {client?.name} — Remote Desktop
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)]">
            {client?.ip_address} ·{' '}
            {hasVnc ? `VNC :${(client?.vnc_port || 5901) - 5900}` : 'RustDesk'}
          </div>
        </div>

        {/* VNC status */}
        {hasVnc && (
          <div className="ml-2">
            {vncReady
              ? <span className="badge badge-green text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-slow" /> Terhubung
                </span>
              : vncError
              ? <span className="badge badge-red text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger" /> Error
                </span>
              : <span className="badge badge-yellow text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-warn" /> Menghubungkan...
                </span>
            }
          </div>
        )}

        <div className="ml-auto flex gap-1.5">
          <button onClick={reload} className="btn btn-ghost btn-sm btn-icon" title="Reload">
            <RefreshCw size={13} />
          </button>
          {hasVnc && (
            <button onClick={toggleFullscreen} className="btn btn-ghost btn-sm btn-icon" title="Fullscreen">
              <Maximize2 size={13} />
            </button>
          )}
          <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm btn-icon">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      {hasVnc && vncUrl ? (
        <div className="flex-1 relative overflow-hidden">
          {!vncReady && !vncError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#080a0f] z-10">
              <div className="text-center">
                <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-[var(--accent)]" />
                <div className="text-sm text-[var(--text-muted)]">Menghubungkan ke VNC...</div>
                <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">{client?.ip_address}:{client?.vnc_port || 5901}</div>
              </div>
            </div>
          )}
          {vncError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#080a0f] z-10">
              <div className="text-center max-w-sm">
                <WifiOff size={32} className="mx-auto mb-3 text-[var(--danger)]" />
                <div className="text-sm text-[var(--danger)] mb-2">{vncError}</div>
                <div className="text-xs text-[var(--text-muted)] mb-4 font-mono">
                  Pastikan:<br/>
                  1. VNC server jalan di client ({isWindows ? 'TightVNC' : 'x11vnc'})<br/>
                  2. Client online &amp; agent aktif<br/>
                  3. Port {client?.vnc_port || 5901} tidak diblokir firewall
                </div>
                <button onClick={reload} className="btn btn-primary btn-sm">
                  <RefreshCw size={12} /> Coba Lagi
                </button>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={vncUrl}
            className="w-full h-full border-0"
            title="VNC Remote Desktop"
            allow="fullscreen clipboard-read clipboard-write"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>
      ) : (
        /* Windows / RustDesk panel */
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-6 bg-[var(--bg)]">
          <div className="w-full max-w-lg space-y-4">
            <div className="text-center mb-6">
              <Monitor size={44} className="mx-auto mb-3 text-[var(--accent)] opacity-70" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Remote Desktop</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {client?.name} ({client?.ip_address})
              </p>
            </div>

            {/* RustDesk */}
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-[var(--accent-dim)] rounded-lg flex items-center justify-center">
                  <Radio size={16} className="text-[var(--accent)]" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">RustDesk Remote</div>
                  <div className="text-xs text-[var(--text-muted)]">Via server RSMP internal</div>
                </div>
                {rdConfig?.host && (
                  <span className="ml-auto badge badge-green text-[10px]">Server aktif</span>
                )}
              </div>

              {client?.rustdesk_id ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider block mb-1">
                      RustDesk ID Client
                    </label>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 bg-[#080a0f] border border-[var(--border)] rounded px-3 py-2 font-mono text-sm">
                        <span className={clsx(
                          'transition-all',
                          showRdId ? 'text-[var(--accent)]' : 'tracking-[0.25em] text-[var(--text-muted)]'
                        )}>
                          {showRdId ? client.rustdesk_id : '••••••••••••'}
                        </span>
                      </div>
                      <button onClick={() => setShowRdId(v => !v)}
                        className="btn btn-ghost btn-sm btn-icon" title={showRdId ? 'Sembunyikan' : 'Tampilkan'}>
                        {showRdId ? <EyeOff size={14}/> : <Eye size={14}/>}
                      </button>
                      <button onClick={copyRdId} className="btn btn-ghost btn-sm" title="Salin ID">
                        <Clipboard size={13}/> Salin
                      </button>
                    </div>
                  </div>

                  {rdConfig && (
                    <div className="bg-[var(--bg2)] rounded p-3 text-xs text-[var(--text-muted)] space-y-1">
                      <div>Server: <span className="text-[var(--accent)] font-mono">{rdConfig.host}</span></div>
                      <div>Relay : <span className="text-[var(--accent)] font-mono">{rdConfig.relay}</span></div>
                    </div>
                  )}

                  <div className="bg-[var(--bg2)] rounded p-3 text-xs text-[var(--text-muted)] space-y-1">
                    <div className="font-medium text-[var(--text)] mb-1">Cara pakai:</div>
                    <div>1. Buka aplikasi <span className="text-[var(--accent)]">RustDesk</span> di PC Anda</div>
                    <div>2. Masukkan ID di atas → klik Connect</div>
                    <div>3. Masukkan password jika diminta</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="text-sm text-[var(--text-muted)] mb-3">RustDesk ID belum dikonfigurasi</div>
                  <button onClick={() => navigate(`/clients/${id}`)} className="btn btn-ghost btn-sm">
                    Edit Client →
                  </button>
                </div>
              )}
            </div>

            {/* Linux fallback ke SSH terminal */}
            {isLinux && (
              <div className="card p-4">
                <div className="text-sm font-medium text-[var(--text)] mb-2">Alternatif: SSH Terminal</div>
                <button onClick={() => navigate(`/terminal/${id}`)} className="btn btn-primary btn-sm w-full justify-center">
                  Buka Terminal SSH →
                </button>
              </div>
            )}

            {/* Windows RDP */}
            {isWindows && (
              <div className="card p-4">
                <div className="text-sm font-medium text-[var(--text)] mb-2">Windows Remote Desktop (RDP)</div>
                <div className="bg-[#080a0f] rounded p-3 font-mono text-xs text-success mb-3">
                  mstsc /v:{client?.ip_address}:3389
                </div>
                <button onClick={() => {
                  copyText(`mstsc /v:${client?.ip_address}:3389`).then(() => toast.success('Perintah disalin')).catch(() => toast.error('Gagal menyalin'))
                }} className="btn btn-ghost btn-sm w-full justify-center">
                  <Clipboard size={13}/> Salin Perintah RDP
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
