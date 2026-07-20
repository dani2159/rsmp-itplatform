// ── ClientModal.jsx ────────────────────────────────
import React, { useState } from 'react'
import { X } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

export default function ClientModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', ip_address: '', hostname: '', mac_address: '',
    os_type: 'linux', os_version: '', location: '', department: '',
    category: 'Lainnya', ssh_user: 'rsadmin', ssh_port: 22,
    vnc_port: 5900, rustdesk_id: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/clients', form)
      toast.success('Client ditambahkan')
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan')
    }
    setSaving(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Tambah client baru">
        <div className="modal-card is-lg animate-slide-in">
          <div className="modal-head">
            <div>
              <h2 className="modal-title">Tambah Client Baru</h2>
              <p className="modal-subtitle">Daftarkan PC/unit baru untuk dimonitor</p>
            </div>
            <button onClick={onClose} className="icon-btn" type="button" aria-label="Tutup">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={submit}>
            <div className="modal-body">
              <div className="field">
                <span className="label">OS Type *</span>
                <div className="flex gap-4 mt-1">
                  {['linux', 'windows'].map(os => (
                    <label key={os} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="os_type" value={os} checked={form.os_type === os}
                        onChange={() => set('os_type', os)} />
                      <span className="text-sm capitalize" style={{ color: 'var(--text-primary)' }}>{os}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-form-grid">
                {[
                  { key: 'name',        label: 'Nama PC *',        required: true },
                  { key: 'ip_address',  label: 'IP Address *',     required: true, mono: true },
                  { key: 'hostname',    label: 'Hostname' },
                  { key: 'mac_address', label: 'MAC Address',      mono: true },
                  { key: 'os_version',  label: 'OS Version',       span2: true },
                  { key: 'location',    label: 'Lokasi / Ruangan' },
                  { key: 'department',  label: 'Departemen' },
                ].map(f => (
                  <div key={f.key} className={`field ${f.span2 ? 'span-2' : ''}`}>
                    <span className="label">{f.label}</span>
                    <input className={`input ${f.mono ? 'font-mono' : ''}`}
                      value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} required={f.required} />
                  </div>
                ))}

                <div className="field">
                  <span className="label">Kategori</span>
                  <select className="select input" value={form.category} onChange={e => set('category', e.target.value)}>
                    {['IGD','Poli','Nurse Station','Dokter','Administrasi','Kasir','Farmasi','Lab','Radiologi','ICU/ICCU','Lainnya'].map(c => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {form.os_type === 'linux' && (
                  <>
                    <div className="field">
                      <span className="label">SSH User</span>
                      <input className="input font-mono" value={form.ssh_user || ''} onChange={e => set('ssh_user', e.target.value)} />
                    </div>
                    <div className="field">
                      <span className="label">SSH Port</span>
                      <input type="number" className="input font-mono" value={form.ssh_port || 22} onChange={e => set('ssh_port', parseInt(e.target.value))} />
                    </div>
                    <div className="field">
                      <span className="label">VNC Port</span>
                      <input type="number" className="input font-mono" value={form.vnc_port || 5900} onChange={e => set('vnc_port', parseInt(e.target.value))} />
                    </div>
                  </>
                )}

                <div className={`field ${form.os_type === 'linux' ? '' : 'span-2'}`}>
                  <span className="label">RustDesk ID</span>
                  <input className="input font-mono" value={form.rustdesk_id || ''} onChange={e => set('rustdesk_id', e.target.value)}
                    placeholder="ID untuk remote desktop" />
                </div>

                <div className="field span-2">
                  <span className="label">Catatan</span>
                  <textarea className="input resize-none" style={{ height: 72 }} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn btn-outline">Batal</button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? 'Menyimpan...' : 'Tambah Client'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
