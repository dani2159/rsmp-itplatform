import React, { useState } from 'react'
import { X, Upload } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

export default function ImportModal({ onClose, onSaved }) {
  const [text,    setText]    = useState('')
  const [osType,  setOsType]  = useState('linux')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setText(ev.target.result)
    reader.readAsText(file)
  }

  const doImport = async () => {
    if (!text.trim()) { toast.error('Teks hosts kosong'); return }
    setLoading(true)
    try {
      const r = await api.post('/clients/import', { text, os_type: osType })
      setResult(r.data)
      toast.success(`${r.data.added} client berhasil diimport`)
      onSaved?.()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Gagal import')
    }
    setLoading(false)
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import client dari hosts.txt">
        <div className="modal-card is-sm animate-slide-in">
          <div className="modal-head">
            <div>
              <h2 className="modal-title">Import Client</h2>
              <p className="modal-subtitle">Import massal dari file hosts.txt</p>
            </div>
            <button onClick={onClose} className="icon-btn" type="button" aria-label="Tutup">
              <X size={16} />
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <span className="label">OS Type</span>
              <div className="flex gap-4 mt-1">
                {['linux', 'windows'].map(os => (
                  <label key={os} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="os" value={os} checked={osType === os}
                      onChange={() => setOsType(os)} />
                    <span className="text-sm capitalize" style={{ color: 'var(--text-primary)' }}>{os}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="label-line">
                <span className="label">Isi hosts.txt</span>
                <label className="btn btn-ghost btn-sm cursor-pointer">
                  <Upload size={11} /> Upload File
                  <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
                </label>
              </div>
              <textarea
                className="input font-mono text-xs resize-none"
                style={{ height: 160 }}
                placeholder={'# Format: IP_ADDRESS  # Nama PC\n192.168.1.101  # PC-IGD-01\n192.168.1.102  # PC-IGD-02\n192.168.1.103  # PC-Nurse-L1'}
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                Baris yang diawali # diabaikan. IP duplikat dilewati otomatis.
              </p>
            </div>

            {result && (
              <div className="alert alert-success">✓ {result.added} client berhasil diimport</div>
            )}
          </div>

          <div className="modal-actions">
            <button onClick={onClose} className="btn btn-outline">Tutup</button>
            <button onClick={doImport} disabled={loading || !text.trim()} className="btn btn-primary">
              {loading ? 'Mengimport...' : 'Import Sekarang'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
