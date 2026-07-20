(() => {
  const TABLE_SELECTOR = 'table:not([data-sortable="false"])';
  const SKIP_HEADER_LABEL = /^(aksi|action|opsi|pilih)$/i;
  const collator = new Intl.Collator('id-ID', { numeric: true, sensitivity: 'base' });
  const MONTHS = new Map([
    ['jan', 0], ['januari', 0], ['january', 0],
    ['feb', 1], ['februari', 1], ['february', 1],
    ['mar', 2], ['maret', 2], ['march', 2],
    ['apr', 3], ['april', 3],
    ['mei', 4], ['may', 4],
    ['jun', 5], ['juni', 5], ['june', 5],
    ['jul', 6], ['juli', 6], ['july', 6],
    ['agu', 7], ['agustus', 7], ['aug', 7], ['august', 7],
    ['sep', 8], ['sept', 8], ['september', 8],
    ['okt', 9], ['oktober', 9], ['oct', 9], ['october', 9],
    ['nov', 10], ['november', 10],
    ['des', 11], ['desember', 11], ['dec', 11], ['december', 11]
  ]);

  function normalizeText(value = '') {
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function getHeaderLabel(th) {
    const clone = th.cloneNode(true);
    clone.querySelectorAll('i, svg, .table-sort-indicator').forEach((icon) => icon.remove());
    return normalizeText(clone.textContent || th.textContent || '');
  }

  function shouldSkipColumn(th) {
    const label = getHeaderLabel(th);
    if (!label) return true;
    if (th.dataset.sortable === 'false') return true;
    if (SKIP_HEADER_LABEL.test(label)) return true;
    if (th.querySelector('input, select, textarea')) return true;
    return false;
  }

  function ensureSortLabel(th) {
    let label = th.querySelector('.sort');
    if (!label) {
      label = document.createElement('span');
      label.className = 'sort';
      while (th.firstChild) label.appendChild(th.firstChild);
      th.appendChild(label);
    }

    let indicator = label.querySelector('.table-sort-indicator');
    if (!indicator) {
      indicator = label.querySelector('i[class*="fa-sort"], svg.lucide');
      if (indicator) {
        indicator.classList.add('table-sort-indicator');
      } else {
        indicator = document.createElement('i');
        indicator.className = 'fa-solid fa-sort table-sort-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        label.appendChild(indicator);
      }
    }
  }

  function getCellValue(row, index) {
    const cell = row.children[index];
    if (!cell) return '';
    const explicitValue = cell.dataset.sortValue || cell.dataset.sort;
    if (explicitValue != null) return normalizeText(explicitValue);

    const checkbox = cell.querySelector('input[type="checkbox"]');
    if (checkbox) return checkbox.checked ? '1' : '0';

    const valueNode = cell.querySelector('[data-sort-value], [data-sort]');
    if (valueNode) return normalizeText(valueNode.dataset.sortValue || valueNode.dataset.sort || valueNode.textContent);

    return normalizeText(cell.innerText || cell.textContent || '');
  }

  function parseNumber(value) {
    const cleaned = normalizeText(value)
      .replace(/rp\s?/gi, '')
      .replace(/%/g, '')
      .replace(/[^0-9,.-]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.');
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function parseDate(value) {
    const text = normalizeText(value).toLowerCase();
    if (!text || text === '-') return null;

    const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s](\d{1,2})[:.](\d{2}))?/);
    if (isoDate) {
      const time = Date.UTC(
        Number(isoDate[1]),
        Number(isoDate[2]) - 1,
        Number(isoDate[3]),
        Number(isoDate[4] || 0),
        Number(isoDate[5] || 0)
      );
      return Number.isFinite(time) ? time : null;
    }

    const numericDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2})[:.](\d{2}))?/);
    if (numericDate) {
      const day = Number(numericDate[1]);
      const month = Number(numericDate[2]) - 1;
      const year = Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]);
      const hour = Number(numericDate[4] || 0);
      const minute = Number(numericDate[5] || 0);
      const time = Date.UTC(year, month, day, hour, minute);
      return Number.isFinite(time) ? time : null;
    }

    const namedDate = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?/i);
    if (namedDate) {
      const month = MONTHS.get(namedDate[2]);
      if (month == null) return null;
      const time = Date.UTC(
        Number(namedDate[3]),
        month,
        Number(namedDate[1]),
        Number(namedDate[4] || 0),
        Number(namedDate[5] || 0)
      );
      return Number.isFinite(time) ? time : null;
    }

    return null;
  }

  function detectType(values) {
    const filledValues = values.filter((value) => value && value !== '-');
    if (!filledValues.length) return 'text';

    const dateCount = filledValues.filter((value) => parseDate(value) !== null).length;
    if (dateCount === filledValues.length) return 'date';

    const numberCount = filledValues.filter((value) => parseNumber(value) !== null).length;
    if (numberCount === filledValues.length) return 'number';

    return 'text';
  }

  function compareValue(a, b, type) {
    const emptyA = !a || a === '-';
    const emptyB = !b || b === '-';
    if (emptyA && emptyB) return 0;
    if (emptyA) return 1;
    if (emptyB) return -1;

    if (type === 'number') return parseNumber(a) - parseNumber(b);
    if (type === 'date') return parseDate(a) - parseDate(b);
    return collator.compare(a, b);
  }

  function updateSortIcon(table, activeTh, direction) {
    table.querySelectorAll('thead th[aria-sort]').forEach((th) => {
      const icon = th.querySelector('.table-sort-indicator');
      th.classList.remove('is-sorted-asc', 'is-sorted-desc');
      th.setAttribute('aria-sort', th === activeTh ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
      if (icon?.classList.contains('fa-sort-up') || icon?.classList.contains('fa-sort-down') || icon?.classList.contains('fa-sort')) {
        icon.classList.remove('fa-sort-up', 'fa-sort-down', 'fa-sort');
        icon.classList.add(th === activeTh ? (direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort');
      }
    });
    activeTh.classList.add(direction === 'asc' ? 'is-sorted-asc' : 'is-sorted-desc');
  }

  function sortTable(table, columnIndex, th) {
    const tbody = table.tBodies[0];
    if (!tbody) return;

    const currentDirection = th.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
    const rows = Array.from(tbody.rows).map((row, index) => ({
      row,
      index,
      value: getCellValue(row, columnIndex)
    }));
    const type = th.dataset.sortType || detectType(rows.map((item) => item.value));

    rows.sort((a, b) => {
      const result = compareValue(a.value, b.value, type);
      if (result === 0) return a.index - b.index;
      return currentDirection === 'asc' ? result : -result;
    });

    const fragment = document.createDocumentFragment();
    rows.forEach(({ row }) => fragment.appendChild(row));
    tbody.appendChild(fragment);

    table.querySelectorAll('thead th[data-sort-direction]').forEach((item) => delete item.dataset.sortDirection);
    th.dataset.sortDirection = currentDirection;
    updateSortIcon(table, th, currentDirection);
    table.dispatchEvent(new CustomEvent('table:sorted', {
      bubbles: true,
      detail: { columnIndex, direction: currentDirection, type }
    }));
  }

  function initTable(table) {
    if (!table || table.dataset.sortReady === 'true') return;
    const headerRow = table.tHead?.rows?.[0];
    const body = table.tBodies?.[0];
    if (!headerRow || !body) return;

    Array.from(headerRow.cells).forEach((th, index) => {
      if (shouldSkipColumn(th)) {
        th.dataset.sortable = 'false';
        return;
      }

      ensureSortLabel(th);
      th.classList.add('is-sortable');
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'button');
      th.setAttribute('aria-sort', 'none');
      th.setAttribute('title', `Urutkan berdasarkan ${getHeaderLabel(th)}`);
      th.addEventListener('click', (event) => {
        if (event.target.closest('button, a, input, select, textarea, details, summary')) return;
        sortTable(table, index, th);
      });
      th.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        sortTable(table, index, th);
      });
    });

    table.dataset.sortReady = 'true';
  }

  function initAll(root = document) {
    if (root.nodeType !== 1 && root !== document) return;
    if (root.matches?.(TABLE_SELECTOR)) initTable(root);
    root.querySelectorAll?.(TABLE_SELECTOR).forEach(initTable);
  }

  function init() {
    initAll(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => initAll(node));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.TableSorting = { refresh: initAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
