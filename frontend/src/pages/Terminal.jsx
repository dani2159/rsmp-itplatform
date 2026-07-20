import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal as TermIcon, X, Maximize2, Copy, RefreshCw, ArrowLeft, Download } from 'lucide-react'
import api from '../services/api'
import { copyText } from '../services/clipboard'
import toast from 'react-hot-toast'

const QUICK_CMDS = [
  'uptime',
  'hostname && hostname -I',
  'df -h /',
  'free -m',
  'top -bn1 | head -25',
  'systemctl status rsmp-agent --no-pager',
  'systemctl status x11vnc --no-pager',
  'systemctl status rustdesk --no-pager',
  'systemctl status ssh --no-pager',
  'sudo apt-get update -qq',
  'sudo apt-get upgrade -y -qq',
  'sudo /usr/local/bin/rsmp-do-update.sh',
  'cat /var/log/rsmp-update.log | tail -40',
  'cat /var/log/rsmp-agent.log | tail -30',
  'ps aux --sort=-%cpu | head -12',
  'netstat -tlnp 2>/dev/null | head -15',
  'journalctl -n 40 --no-pager',
  'ip route && cat /etc/resolv.conf',
]

export default function Terminal() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const termRef  = useRef(null)
  const xtermRef = useRef(null)
  const fitRef   = useRef(null)
  const wsRef    = useRef(null)
  const roRef    = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef    = useRef(null)
  const isManualReconnectRef = useRef(false)

  const [client,     setClient]     = useState(null)
  const [connected,  setConnected]  = useState(false)
  const [status,     setStatus]     = useState('Menghubungkan...')
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    api.get(`/clients/${id}`).then(r => setClient(r.data)).catch(()=>{})
    initTerminal()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      xtermRef.current?.dispose()
      roRef.current?.disconnect()
    }
  }, [id])

  const initTerminal = async () => {
    try {
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('xterm-addon-fit')
      await import('xterm/css/xterm.css')

      const term = new Terminal({
        theme: {
          background:    '#080a0f',
          foreground:    '#c8cedd',
          cursor:        '#4f9cf9',
          cursorAccent:  '#080a0f',
          selectionBackground: 'rgba(79,156,249,0.3)',
          black:   '#1a1e28', red:     '#f56565',
          green:   '#3dd68c', yellow:  '#f6c343',
          blue:    '#4f9cf9', magenta: '#a78bfa',
          cyan:    '#5dcaa5', white:   '#c8cedd',
          brightBlack:   '#4a5268', brightRed:    '#fc8181',
          brightGreen:   '#68d391', brightYellow: '#faf089',
          brightBlue:    '#63b3ed', brightMagenta:'#b794f4',
          brightCyan:    '#81e6d9', brightWhite:  '#e2e8f0',
        },
        fontFamily:  '"IBM Plex Mono", "Fira Code", monospace',
        fontSize:    13,
        lineHeight:  1.4,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback:  5000,
        allowTransparency: true,
        macOptionIsMeta:   true,
      })

      const fit = new FitAddon()
      term.loadAddon(fit)

      if (termRef.current) {
        term.open(termRef.current)
        setTimeout(() => { try { fit.fit() } catch(e){} }, 100)
      }

      xtermRef.current = term
      fitRef.current   = fit

      term.writeln('\x1b[34m╔═══════════════════════════════════╗\x1b[0m')
      term.writeln('\x1b[34m║   RSMP-IT Platform — SSH Terminal ║\x1b[0m')
      term.writeln('\x1b[34m╚═══════════════════════════════════╝\x1b[0m')
      term.writeln('\x1b[90mMenghubungkan...\x1b[0m\r\n')

      connectWS(term, fit)

      // Auto resize
      roRef.current = new ResizeObserver(() => {
        try { fit.fit() } catch(e){}
      })
      if (termRef.current) roRef.current.observe(termRef.current)

    } catch(e) {
      console.error('xterm init error:', e)
    }
  }

  const connectWS = (term, fit) => {
    const { hostname, port, protocol } = window.location
    const wsPort = port || (protocol === 'https:' ? '443' : '80')
    const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${wsProto}//${hostname}:${wsPort}/ws?type=terminal&client=${id}`)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('Terhubung')
      setConnected(true)
      reconnectAttemptsRef.current = 0
      term.writeln('\x1b[32m✓ WebSocket terhubung\x1b[0m')
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if      (msg.type === 'data')      term.write(atob(msg.data))
        else if (msg.type === 'connected') term.write(msg.message || '')
        else if (msg.type === 'error')     term.writeln(`\r\n\x1b[31m✗ ${msg.message}\x1b[0m`)
      } catch {
        if (typeof e.data === 'string') term.write(e.data)
      }
    }

    ws.onclose = (e) => {
      setConnected(false)
      setStatus(`Terputus (${e.code})`)
      if (isManualReconnectRef.current) {
        isManualReconnectRef.current = false
        return
      }
      if (reconnectAttemptsRef.current < 5) {
        const attempt = reconnectAttemptsRef.current + 1
        const delay = Math.min(1000 * attempt, 5000)
        term.writeln(`\r\n\x1b[33m⚡ Koneksi terputus. Reconnect otomatis dalam ${Math.round(delay/1000)}s (percobaan ${attempt}/5)...\x1b[0m`)
        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptsRef.current = attempt
          connectWS(term, fitRef.current)
        }, delay)
      } else {
        term.writeln('\r\n\x1b[31m✗ Reconnect otomatis gagal 5x. Tekan tombol Reconnect atau Enter untuk coba lagi.\x1b[0m')
      }
    }

    ws.onerror = () => {
      setStatus('Error')
      term.writeln('\r\n\x1b[31m✗ Gagal konek ke server\x1b[0m')
    }

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type:'input', data:btoa(data) }))
      } else if (data === '\r') {
        reconnect()
      }
    })

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type:'resize', cols, rows }))
      }
    })
  }

  const reconnect = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    reconnectAttemptsRef.current = 0
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      isManualReconnectRef.current = true
    }
    wsRef.current?.close()
    setStatus('Reconnecting...')
    setConnected(false)
    const term = xtermRef.current
    if (!term) return
    term.writeln('\r\n\x1b[34m↺ Mencoba reconnect...\x1b[0m')
    setTimeout(() => connectWS(term, fitRef.current), 1000)
  }

  const sendCmd = (cmd) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Terminal belum terhubung')
      return
    }
    wsRef.current.send(JSON.stringify({ type:'input', data:btoa(cmd + '\n') }))
    xtermRef.current?.focus()
  }

  const copySelection = () => {
    const sel = xtermRef.current?.getSelection()
    if (sel) {
      copyText(sel).then(() => toast.success('Teks disalin')).catch(() => toast.error('Gagal menyalin'))
    } else {
      toast.error('Tidak ada teks yang dipilih')
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setFullscreen(false)
    }
    setTimeout(() => { try { fitRef.current?.fit() } catch(e){} }, 150)
  }

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-[#080a0f]' : 'flex flex-col h-screen bg-[#080a0f]'}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
           style={{background:'var(--bg2)', borderBottom:'1px solid var(--border)'}}>
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm btn-icon">
          <ArrowLeft size={14}/>
        </button>
        <TermIcon size={15} style={{color:'var(--accent)', flexShrink:0}}/>
        <div>
          <div className="text-sm font-medium" style={{color:'var(--text)'}}>
            {client?.name || `Client #${id}`}
          </div>
          <div className="text-[10px] font-mono" style={{color:'var(--text-muted)'}}>
            {client?.ip_address} · {client?.ssh_user||'rsadmin'}@{client?.ssh_port||22}
          </div>
        </div>
        <div className="ml-2">
          <span className={`badge text-[10px] ${connected?'badge-green':'badge-red'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected?'bg-[var(--success)] animate-pulse-slow':'bg-[var(--danger)]'}`}/>
            {status}
          </span>
        </div>
        <div className="ml-auto flex gap-1.5">
          <button onClick={copySelection}    className="btn btn-ghost btn-sm btn-icon" title="Copy terpilih"><Copy size={13}/></button>
          <button onClick={reconnect}        className="btn btn-ghost btn-sm btn-icon" title="Reconnect"><RefreshCw size={13}/></button>
          <button onClick={toggleFullscreen} className="btn btn-ghost btn-sm btn-icon" title="Fullscreen"><Maximize2 size={13}/></button>
          <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm btn-icon"><X size={13}/></button>
        </div>
      </div>

      {/* Quick commands */}
      <div className="flex gap-1.5 px-4 py-2 flex-shrink-0 overflow-x-auto"
           style={{background:'var(--bg2)', borderBottom:'1px solid var(--border)'}}>
        {QUICK_CMDS.map(cmd => (
          <button key={cmd} onClick={() => sendCmd(cmd)}
            className="flex-shrink-0 px-2.5 py-1 text-[10px] font-mono rounded transition-colors border"
            style={{
              background:'var(--bg3)',
              borderColor:'var(--border)',
              color:'var(--text2)',
            }}
            onMouseEnter={e => {
              e.target.style.background='var(--bg4)'
              e.target.style.color='var(--text)'
            }}
            onMouseLeave={e => {
              e.target.style.background='var(--bg3)'
              e.target.style.color='var(--text2)'
            }}>
            {cmd.length > 22 ? cmd.slice(0, 22) + '…' : cmd}
          </button>
        ))}
      </div>

      {/* xterm.js terminal area */}
      <div ref={termRef} className="flex-1 overflow-hidden" style={{padding:'4px'}}/>
    </div>
  )
}
