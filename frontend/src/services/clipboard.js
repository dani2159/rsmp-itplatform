// navigator.clipboard requires a secure context (HTTPS or localhost).
// RSMP-IT runs on plain HTTP on the hospital LAN, so it's undefined there --
// fall back to the classic execCommand('copy') via a hidden textarea.
export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try {
      const ok = document.execCommand('copy')
      ok ? resolve() : reject(new Error('execCommand copy failed'))
    } catch (e) {
      reject(e)
    } finally {
      document.body.removeChild(ta)
    }
  })
}
