(() => {
  const ACTION_SELECTOR = 'details.row-action-dropdown';

  const LABEL_ICON_MAP = [
    { match: /lihat detail|detail/i, icon: 'fa-regular fa-eye' },
    { match: /ubah data|edit|ubah/i, icon: 'fa-regular fa-pen-to-square' },
    { match: /pembaruan dokumen|renewal/i, icon: 'fa-solid fa-file-circle-plus' },
    { match: /pemeriksaan dokumen|review|pemeriksaan/i, icon: 'fa-solid fa-clipboard-check' },
    { match: /tes koneksi|test koneksi/i, icon: 'fa-solid fa-plug-circle-check' },
    { match: /cetak test|cetak|print/i, icon: 'fa-solid fa-print' },
    { match: /nonaktifkan/i, icon: 'fa-solid fa-circle-xmark' },
    { match: /aktifkan/i, icon: 'fa-solid fa-circle-check' },
    { match: /hapus|delete/i, icon: 'fa-regular fa-trash-can' },
    { match: /reset/i, icon: 'fa-solid fa-key' },
    { match: /salin|copy/i, icon: 'fa-regular fa-copy' },
    { match: /download|unduh/i, icon: 'fa-solid fa-download' }
  ];

  function cleanLabel(button) {
    const visibleText = (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim();
    const explicitLabel = button.dataset.tooltip || button.dataset.actionLabel || button.getAttribute('aria-label');
    const text = visibleText || explicitLabel || 'Aksi';
    return text.replace(/\s+/g, ' ').trim() || 'Aksi';
  }

  function iconFor(label, button) {
    const currentIcon = button.querySelector('i[class*="fa-"]');
    if (currentIcon) {
      return Array.from(currentIcon.classList).filter((item) => /^fa-/.test(item)).join(' ') || 'fa-regular fa-circle-dot';
    }
    const item = LABEL_ICON_MAP.find((entry) => entry.match.test(label));
    return item?.icon || 'fa-solid fa-circle-dot';
  }

  function toneFor(label, button) {
    const classes = button.classList;
    if (classes.contains('is-danger') || classes.contains('danger-option') || /hapus|delete|nonaktifkan/i.test(label)) return 'is-danger';
    if (classes.contains('is-warning') || /review|pemeriksaan|pembaruan|renewal/i.test(label)) return 'is-warning';
    if (/aktifkan/i.test(label)) return 'is-success';
    if (/tes koneksi|cetak|print|download|copy/i.test(label)) return 'is-info';
    return '';
  }

  function convertDropdown(dropdown) {
    if (!dropdown || dropdown.dataset.inlineActionsReady === 'true') return;
    const actionButtons = Array.from(dropdown.querySelectorAll('.row-action-panel button.dropdown-option, .row-action-panel button'));
    if (!actionButtons.length) return;

    const group = document.createElement('div');
    group.className = 'row-inline-actions';
    group.setAttribute('role', 'group');
    const summaryLabel = dropdown.querySelector('summary')?.getAttribute('aria-label') || 'Aksi tabel';
    group.setAttribute('aria-label', summaryLabel.replace(/^Buka menu\s*/i, ''));

    actionButtons.forEach((button) => {
      const label = cleanLabel(button);
      const icon = iconFor(label, button);
      const tone = toneFor(label, button);

      button.classList.remove('dropdown-option', 'danger-option', 'is-danger', 'is-warning', 'selected', 'active');
      button.classList.add('row-icon-action');
      if (tone) button.classList.add(tone);
      button.removeAttribute('role');
      button.setAttribute('type', 'button');
      button.setAttribute('aria-label', label);
      button.setAttribute('data-tooltip', label);
      button.setAttribute('title', label);
      button.innerHTML = `<i aria-hidden="true" class="${icon}"></i>`;
      group.appendChild(button);
    });

    dropdown.dataset.inlineActionsReady = 'true';
    dropdown.replaceWith(group);
  }

  function convertAll(root = document) {
    if (root.nodeType !== 1 && root !== document) return;
    if (root.matches?.(ACTION_SELECTOR)) convertDropdown(root);
    root.querySelectorAll?.(ACTION_SELECTOR).forEach(convertDropdown);
  }


  let tooltipNode = null;

  function getTooltipNode() {
    if (!tooltipNode) {
      tooltipNode = document.createElement('div');
      tooltipNode.className = 'row-action-floating-tooltip';
      tooltipNode.hidden = true;
      document.body.appendChild(tooltipNode);
    }
    return tooltipNode;
  }

  function showTooltip(button) {
    const label = button?.dataset?.tooltip || button?.getAttribute('aria-label');
    if (!button || !label) return;
    const tooltip = getTooltipNode();
    tooltip.textContent = label;
    tooltip.hidden = false;
    tooltip.dataset.placement = 'top';

    requestAnimationFrame(() => {
      const rect = button.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();
      let top = rect.top + window.scrollY - tipRect.height - 8;
      let left = rect.left + window.scrollX + (rect.width / 2) - (tipRect.width / 2);
      const minLeft = window.scrollX + 8;
      const maxLeft = window.scrollX + document.documentElement.clientWidth - tipRect.width - 8;
      left = Math.min(Math.max(left, minLeft), maxLeft);
      if (top < window.scrollY + 8) {
        top = rect.bottom + window.scrollY + 8;
        tooltip.dataset.placement = 'bottom';
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.classList.add('is-visible');
    });
  }

  function hideTooltip() {
    if (!tooltipNode) return;
    tooltipNode.classList.remove('is-visible');
    tooltipNode.hidden = true;
  }

  function bindFloatingTooltip() {
    document.addEventListener('mouseover', (event) => {
      const button = event.target.closest?.('.row-icon-action');
      if (!button || button.contains(event.relatedTarget)) return;
      showTooltip(button);
    });
    document.addEventListener('mouseout', (event) => {
      const button = event.target.closest?.('.row-icon-action');
      if (!button || button.contains(event.relatedTarget)) return;
      hideTooltip();
    });
    document.addEventListener('focusin', (event) => {
      const button = event.target.closest?.('.row-icon-action');
      if (button) showTooltip(button);
    });
    document.addEventListener('focusout', (event) => {
      if (event.target.closest?.('.row-icon-action')) hideTooltip();
    });
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
  }

  function init() {
    convertAll(document);
    bindFloatingTooltip();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => convertAll(node));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.SIMRSInlineTableActions = { refresh: convertAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
