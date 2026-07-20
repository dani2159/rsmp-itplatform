(() => {
  const EDIT_ACTION_SELECTOR = [
    '[data-edit-user]',
    '[data-edit-role]',
    '[data-edit-unit]',
    '[data-edit-room]',
    '[data-edit-employee]',
    '[data-edit-insurance]',
    '[data-edit-tariff]',
    '[data-edit-schedule]',
    '[data-edit-printer]',
    '[data-edit-data]'
  ].join(',');

  let pendingDelete = null;
  let pendingStatusChange = null;
  let activeDetailRow = null;

  function formatKind(kind = 'data') {
    const labels = {
      pengguna: 'Pengguna',
      peran: 'Peran',
      unit: 'Unit',
      kamar: 'Kamar',
      karyawan: 'Karyawan',
      penjamin: 'Penjamin',
      tarif: 'Tarif',
      jadwal: 'Jadwal Dokter',
      audit: 'Aktivitas',
      printer: 'Printer',
      data: 'Data'
    };
    return labels[kind] || kind.charAt(0).toUpperCase() + kind.slice(1);
  }

  function labelFromRow(row) {
    return row?.querySelector('td strong')?.textContent?.trim() || row?.dataset?.name || row?.dataset?.roleName || 'data';
  }

  function cleanText(element) {
    const text = element?.innerText || element?.textContent || '';
    return text.replace(/\s+/g, ' ').trim() || '-';
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateTableSummary(row) {
    const tableCard = row?.closest('.card');
    if (!tableCard) return;
    const rows = Array.from(tableCard.querySelectorAll('tbody tr'));
    const visibleRows = rows.filter((item) => !item.hidden && item.dataset.tableFilterHidden !== 'true');
    tableCard.querySelectorAll('[data-visible-count], [data-role-visible-count]').forEach((item) => { item.textContent = String(visibleRows.length); });
    tableCard.querySelectorAll('[data-total-count], [data-role-total-count]').forEach((item) => { item.textContent = String(rows.length); });
  }

  function closeRowDropdown(button) {
    button.closest('details.ds-dropdown')?.removeAttribute('open');
  }

  function getBackdrop() {
    let backdrop = document.querySelector('[data-modal-backdrop]');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.setAttribute('data-modal-backdrop', '');
      backdrop.hidden = true;
      document.body.append(backdrop);
    }
    return backdrop;
  }

  function showModal(modal) {
    const backdrop = getBackdrop();
    backdrop.hidden = false;
    modal.hidden = false;
    modal.querySelector('button, input, textarea, [tabindex]')?.focus();
  }

  function closeActionModals() {
    document.querySelectorAll('[data-table-action-modal]').forEach((modal) => { modal.hidden = true; });
    const hasOpenModal = Array.from(document.querySelectorAll('.modal')).some((modal) => !modal.hidden);
    if (!hasOpenModal) getBackdrop().hidden = true;
    pendingDelete = null;
    pendingStatusChange = null;
  }

  function createActionModal({ id, titleId, title, subtitle, body, footer, danger = false, size = 'is-md' }) {
    const modal = document.createElement('section');
    modal.className = 'modal';
    modal.id = id;
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', titleId);
    modal.setAttribute('data-table-action-modal', '');
    modal.innerHTML = `
      <div class="modal-card ${size}${danger ? ' danger-modal' : ''}">
        <div class="modal-head">
          <div>
            <h2 class="modal-title" id="${titleId}">${title}</h2>
            <p class="modal-subtitle">${subtitle}</p>
          </div>
          <button aria-label="Tutup popup" class="btn btn-sm btn-ghost btn-icon" data-table-modal-close type="button"><i aria-hidden="true" class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">${footer}</div>
      </div>
    `;
    document.body.append(modal);
    modal.querySelectorAll('[data-table-modal-close]').forEach((button) => button.addEventListener('click', closeActionModals));
    return modal;
  }

  function ensureSuccessModal() {
    let modal = document.getElementById('tableActionSuccessModal');
    if (modal) return modal;
    modal = document.createElement('section');
    modal.className = 'modal';
    modal.id = 'tableActionSuccessModal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tableActionSuccessTitle');
    modal.setAttribute('data-table-action-modal', '');
    modal.innerHTML = `
      <div class="modal-card is-sm">
        <div class="modal-body text-center">
          <section class="modal-section">
            <div class="success-state">
              <span class="success-state-icon"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
              <h2 class="modal-title" id="tableActionSuccessTitle" data-success-title>Aksi Berhasil</h2>
              <p class="modal-subtitle" data-success-message>Perubahan berhasil diproses.</p>
            </div>
          </section>
        </div>
        <div class="modal-actions justify-center">
          <button class="btn btn-primary btn-lg" data-success-primary type="button">Tutup</button>
          <button class="btn btn-outline btn-lg" data-success-secondary type="button" hidden>Tutup</button>
        </div>
      </div>
    `;
    document.body.append(modal);
    modal.querySelector('[data-success-primary]')?.addEventListener('click', closeActionModals);
    modal.querySelector('[data-success-secondary]')?.addEventListener('click', closeActionModals);
    return modal;
  }

  function openSuccessModal(options = {}) {
    const modal = ensureSuccessModal();
    const titleNode = modal.querySelector('[data-success-title]');
    const messageNode = modal.querySelector('[data-success-message]');
    const primaryButton = modal.querySelector('[data-success-primary]');
    const secondaryButton = modal.querySelector('[data-success-secondary]');
    if (titleNode) titleNode.textContent = options.title || 'Aksi Berhasil';
    if (messageNode) messageNode.textContent = options.message || 'Perubahan berhasil diproses.';
    if (primaryButton) primaryButton.innerHTML = options.primaryHtml || escapeHtml(options.primaryLabel || 'Tutup');
    if (secondaryButton) {
      if (options.secondaryLabel || options.secondaryHtml) {
        secondaryButton.hidden = false;
        secondaryButton.innerHTML = options.secondaryHtml || escapeHtml(options.secondaryLabel);
      } else {
        secondaryButton.hidden = true;
      }
    }
    closeActionModals();
    showModal(modal);
  }

  function ensureDetailModal() {
    let modal = document.getElementById('tableDetailModal');
    if (modal) return modal;
    modal = createActionModal({
      id: 'tableDetailModal',
      titleId: 'tableDetailTitle',
      title: 'Detail Data',
      subtitle: '',
      size: 'is-md',
      body: `
        <div class="modal-section">
          <div class="modal-section-head">
            <div>
              <h3 data-detail-name>Data</h3>
              <p data-detail-caption hidden></p>
            </div>
          </div>
          <div class="modal-detail-grid" data-detail-grid></div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline btn-lg" data-table-modal-close type="button">Tutup</button>
        <button class="btn btn-lg" data-detail-edit type="button"><i aria-hidden="true" class="fa-regular fa-pen-to-square"></i>Ubah Data</button>
      `
    });
    modal.querySelector('[data-detail-edit]')?.addEventListener('click', () => {
      const editAction = activeDetailRow?.querySelector(EDIT_ACTION_SELECTOR);
      closeActionModals();
      editAction?.click();
    });
    return modal;
  }

  function ensureStatusModal() {
    let modal = document.getElementById('tableStatusConfirmModal');
    if (modal) return modal;
    modal = createActionModal({
      id: 'tableStatusConfirmModal',
      titleId: 'tableStatusConfirmTitle',
      title: 'Nonaktifkan Data?',
      subtitle: '',
      size: 'is-sm',
      danger: true,
      body: `
        <div class="alert alert-danger">
          <span aria-hidden="true" class="alert-icon"><i class="fa-solid fa-circle-xmark"></i></span>
          <div class="alert-body"><strong data-status-name>Data</strong><p data-status-message>Data ini akan dinonaktifkan setelah admin menekan tombol konfirmasi.</p></div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline btn-lg" data-table-modal-close type="button">Batal</button>
        <button class="btn btn-danger-soft btn-lg" data-confirm-status type="button"><i aria-hidden="true" class="fa-solid fa-circle-xmark"></i>Nonaktifkan</button>
      `
    });
    modal.querySelector('[data-confirm-status]')?.addEventListener('click', () => {
      const pending = pendingStatusChange ? { ...pendingStatusChange } : null;
      const action = pending?.onConfirm;
      closeActionModals();
      if (typeof action === 'function') action();
      if (pending) {
        const kindLabel = formatKind(pending.kind || 'data');
        openSuccessModal({
          title: `${kindLabel} Berhasil Dinonaktifkan`,
          message: `${pending.label || kindLabel} sudah dinonaktifkan dan tidak tampil sebagai pilihan aktif.`,
          primaryLabel: 'Tutup'
        });
      }
    });
    return modal;
  }

  function openStatusConfirm(options = {}) {
    const kind = options.kind || 'data';
    const label = options.label || 'Data';
    pendingStatusChange = { ...options, onConfirm: options.onConfirm };
    const modal = ensureStatusModal();
    const title = modal.querySelector('#tableStatusConfirmTitle');
    const subtitle = modal.querySelector('.modal-subtitle');
    const nameNode = modal.querySelector('[data-status-name]');
    const messageNode = modal.querySelector('[data-status-message]');
    const confirmButton = modal.querySelector('[data-confirm-status]');
    const kindLabel = formatKind(kind);
    if (title) title.textContent = `Nonaktifkan ${kindLabel}?`;
    if (subtitle) { subtitle.textContent = ''; subtitle.hidden = true; }
    if (nameNode) nameNode.textContent = label;
    if (messageNode) messageNode.textContent = options.message || `${kindLabel} ini tidak akan tampil sebagai pilihan aktif setelah dinonaktifkan.`;
    if (confirmButton) confirmButton.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-xmark"></i>Nonaktifkan';
    showModal(modal);
  }

  function ensureDeleteModal() {
    let modal = document.getElementById('tableDeleteConfirmModal');
    if (modal) return modal;
    modal = createActionModal({
      id: 'tableDeleteConfirmModal',
      titleId: 'tableDeleteConfirmTitle',
      title: 'Hapus Data?',
      subtitle: 'Tindakan ini membutuhkan konfirmasi sebelum data dihapus dari tabel.',
      size: 'is-sm',
      danger: true,
      body: `
        <div class="alert alert-danger">
          <span aria-hidden="true" class="alert-icon">!</span>
          <div class="alert-body"><strong data-delete-name>Data</strong><p data-delete-message>Data yang dihapus tidak akan tampil lagi pada tabel ini.</p></div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-table-modal-close type="button">Batal</button>
        <button class="btn btn-danger-soft" data-confirm-delete type="button"><i aria-hidden="true" class="fa-regular fa-trash-can"></i>Hapus Data</button>
      `
    });
    modal.querySelector('[data-confirm-delete]')?.addEventListener('click', () => {
      if (!pendingDelete?.row) return closeActionModals();
      const { row, label, kind } = pendingDelete;
      row.remove();
      updateTableSummary(row);
      window.dispatchEvent(new CustomEvent('simrs:table-row-deleted', { detail: { label, kind } }));
      openSuccessModal({
        title: `${formatKind(kind)} Berhasil Dihapus`,
        message: `${label} sudah dihapus dari tabel.`,
        primaryLabel: 'Tutup'
      });
    });
    return modal;
  }

  function getRowDetailItems(row) {
    const table = row.closest('table');
    const headers = Array.from(table?.querySelectorAll('thead th') || []);
    const cells = Array.from(row.children || []);
    return cells.map((cell, index) => {
      const header = cleanText(headers[index]) || `Kolom ${index + 1}`;
      if (/^aksi$/i.test(header)) return null;
      return { label: header, value: cleanText(cell) };
    }).filter(Boolean);
  }

  function openDetail(button) {
    const row = button.closest('tr');
    if (!row) return;
    activeDetailRow = row;
    const kind = button.dataset.rowDetail || 'data';
    const label = button.dataset.rowLabel || labelFromRow(row);
    const modal = ensureDetailModal();
    const detailTitle = modal.querySelector('#tableDetailTitle');
    const detailSubtitle = modal.querySelector('.modal-subtitle');
    const detailName = modal.querySelector('[data-detail-name]');
    const detailCaption = modal.querySelector('[data-detail-caption]');
    const grid = modal.querySelector('[data-detail-grid]');
    const editButton = modal.querySelector('[data-detail-edit]');
    const editAction = row.querySelector(EDIT_ACTION_SELECTOR);

    if (detailTitle) detailTitle.textContent = `Detail ${formatKind(kind)}`;
    if (detailSubtitle) { detailSubtitle.textContent = ''; detailSubtitle.hidden = true; }
    if (detailName) detailName.textContent = label;
    if (detailCaption) { detailCaption.textContent = ''; detailCaption.hidden = true; }
    if (grid) {
      grid.innerHTML = '';
      getRowDetailItems(row).forEach((item) => {
        const detailItem = document.createElement('div');
        detailItem.className = 'modal-detail-item';
        const labelNode = document.createElement('span');
        const valueNode = document.createElement('strong');
        labelNode.textContent = item.label;
        valueNode.textContent = item.value;
        detailItem.append(labelNode, valueNode);
        grid.append(detailItem);
      });
    }
    if (editButton) editButton.hidden = !editAction;
    showModal(modal);
  }

  function openDeleteConfirm(button) {
    const row = button.closest('tr');
    if (!row) return;
    const kind = button.dataset.rowDelete || 'data';
    const label = button.dataset.rowLabel || labelFromRow(row);
    pendingDelete = { row, label, kind };
    const modal = ensureDeleteModal();
    const title = modal.querySelector('#tableDeleteConfirmTitle');
    const subtitle = modal.querySelector('.modal-subtitle');
    const nameNode = modal.querySelector('[data-delete-name]');
    const messageNode = modal.querySelector('[data-delete-message]');
    if (title) title.textContent = `Hapus ${formatKind(kind)}?`;
    if (subtitle) subtitle.textContent = 'Data tidak akan langsung dihapus sebelum admin menekan tombol konfirmasi.';
    if (nameNode) nameNode.textContent = label;
    if (messageNode) messageNode.textContent = `${formatKind(kind)} ini akan dihapus dari tabel setelah konfirmasi.`;
    showModal(modal);
  }

  document.addEventListener('click', (event) => {
    const rowActionButton = event.target.closest?.(`${EDIT_ACTION_SELECTOR}, [data-open-deactivate], [data-open-reset]`);
    if (rowActionButton) closeRowDropdown(rowActionButton);

    const detailButton = event.target.closest?.('[data-row-detail]');
    if (detailButton) {
      closeRowDropdown(detailButton);
      openDetail(detailButton);
      return;
    }

    const toastButton = event.target.closest?.('[data-row-toast]');
    if (toastButton) {
      closeRowDropdown(toastButton);
      const type = toastButton.dataset.toastType || 'success';
      const title = toastButton.dataset.toastTitle || 'Berhasil';
      const message = toastButton.dataset.toastMessage || 'Aksi berhasil diproses.';
      window.AlertToast?.show({ type, title, message });
      return;
    }

    const deleteButton = event.target.closest?.('[data-row-delete]');
    if (deleteButton) {
      closeRowDropdown(deleteButton);
      openDeleteConfirm(deleteButton);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeActionModals();
  });

  getBackdrop().addEventListener('click', closeActionModals);

  window.SIMRSSuccessModal = {
    open: openSuccessModal,
    close: closeActionModals
  };

  window.SIMRSStatusConfirm = {
    open: openStatusConfirm,
    close: closeActionModals
  };
})();
