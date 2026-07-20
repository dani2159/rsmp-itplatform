(() => {
  const DEFAULT_TIMEOUT = 3600;
  const ICONS = {
    success: 'fa-solid fa-check',
    danger: 'fa-solid fa-triangle-exclamation',
    warning: 'fa-solid fa-circle-exclamation',
    info: 'fa-solid fa-circle-info'
  };

  function getRegion() {
    let region = document.querySelector('.alert-toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'alert-toast-region';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-label', 'Notifikasi');
      document.body.append(region);
    }
    return region;
  }

  function removeToast(toast) {
    if (!toast || toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  }

  function show({ type = 'success', title = 'Berhasil', message = '', timeout = DEFAULT_TIMEOUT } = {}) {
    const region = getRegion();
    const safeType = ICONS[type] ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `alert-toast is-${safeType}`;
    toast.setAttribute('role', safeType === 'danger' ? 'alert' : 'status');
    toast.innerHTML = `
      <span class="alert-toast-icon" aria-hidden="true"><i class="${ICONS[safeType]}"></i></span>
      <span class="alert-toast-body">
        <strong class="alert-toast-title"></strong>
        <span class="alert-toast-message"></span>
      </span>
      <button class="alert-toast-close" type="button" aria-label="Tutup notifikasi"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    `;
    toast.querySelector('.alert-toast-title').textContent = title;
    toast.querySelector('.alert-toast-message').textContent = message;
    toast.querySelector('.alert-toast-close')?.addEventListener('click', () => removeToast(toast));
    region.append(toast);
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    if (timeout > 0) window.setTimeout(() => removeToast(toast), timeout);
    return toast;
  }

  const api = {
    show,
    success(title, message, options = {}) { return show({ ...options, type: 'success', title, message }); },
    info(title, message, options = {}) { return show({ ...options, type: 'info', title, message }); },
    warning(title, message, options = {}) { return show({ ...options, type: 'warning', title, message }); },
    danger(title, message, options = {}) { return show({ ...options, type: 'danger', title, message }); }
  };

  window.AlertToast = api;
})();
