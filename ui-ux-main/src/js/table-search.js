(() => {
  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getElementSearchText(element) {
    if (!element) return '';
    const attributeText = [
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('alt'),
      element.dataset?.rowLabel,
      element.dataset?.toastTitle,
      element.dataset?.toastMessage,
      element.dataset?.searchText,
      element.dataset?.searchValue,
    ].filter(Boolean).join(' ');

    return `${element.textContent || ''} ${attributeText}`;
  }

  function getTableRowSearchText(row, extraText = '') {
    if (!row) return '';
    const datasetText = Object.values(row.dataset || {}).join(' ');
    const elementText = Array.from(row.querySelectorAll('[aria-label], [title], [alt], [data-row-label], [data-toast-title], [data-toast-message], [data-search-text], [data-search-value]'))
      .map(getElementSearchText)
      .join(' ');

    return normalizeSearchText(`${extraText} ${datasetText} ${row.textContent || ''} ${elementText}`);
  }



  function getTableDataRows(table) {
    const tbody = table?.tBodies?.[0];
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).filter((row) => !row.matches('[data-table-empty-row]'));
  }

  function getFilteredVisibleCount(table) {
    const rows = getTableDataRows(table);
    if (!rows.length) return 0;
    const usesFilterFlag = rows.some((row) => Object.prototype.hasOwnProperty.call(row.dataset || {}, 'tableFilterHidden'));
    if (usesFilterFlag) {
      return rows.filter((row) => row.dataset.tableFilterHidden !== 'true').length;
    }
    return rows.filter((row) => !row.hidden).length;
  }

  function getTableEmptyStateConfig(table) {
    const card = table.closest?.('.card') || table.parentElement || document;
    const resetButton = card.querySelector?.('[data-reset-table-filter]');
    return {
      title: table.dataset.tableEmptyTitle || 'Data tidak ditemukan',
      description: table.dataset.tableEmptyDescription || 'Coba ubah kata kunci pencarian atau filter yang digunakan.',
      actionLabel: table.dataset.tableEmptyActionLabel || (resetButton ? 'Reset filter' : ''),
      actionHref: table.dataset.tableEmptyActionHref || '',
      actionIcon: table.dataset.tableEmptyActionIcon || (resetButton ? 'fa-solid fa-rotate-left' : ''),
      resetButton,
    };
  }

  function getTableColumnCount(table) {
    const headerRow = table?.tHead?.rows?.[0];
    if (headerRow?.cells?.length) return headerRow.cells.length;
    const firstDataRow = getTableDataRows(table)[0];
    if (firstDataRow?.cells?.length) return firstDataRow.cells.length;
    return 1;
  }

  function createTableEmptyState(table) {
    const tbody = table?.tBodies?.[0];
    if (!tbody) return null;

    const staleExternalState = table.parentElement?.querySelector?.(':scope > [data-table-empty-state]');
    staleExternalState?.remove();

    let row = tbody.querySelector(':scope > tr[data-table-empty-row]');
    let cell = row?.querySelector?.('[data-table-empty-cell]');
    let state = row?.querySelector?.('[data-table-empty-state]');
    if (row && cell && state) {
      cell.colSpan = getTableColumnCount(table);
      return state;
    }

    row?.remove();

    row = document.createElement('tr');
    row.className = 'table-empty-state-row';
    row.dataset.tableEmptyRow = 'true';
    row.hidden = true;

    cell = document.createElement('td');
    cell.className = 'table-empty-state-cell';
    cell.dataset.tableEmptyCell = 'true';
    cell.colSpan = getTableColumnCount(table);

    state = document.createElement('div');
    state.className = 'table-empty-state';
    state.dataset.tableEmptyState = 'true';
    state.setAttribute('role', 'status');
    state.setAttribute('aria-live', 'polite');

    cell.append(state);
    row.append(cell);
    tbody.append(row);
    return state;
  }

  function renderTableEmptyState(table) {
    const state = createTableEmptyState(table);
    if (!state) return null;

    const config = getTableEmptyStateConfig(table);
    const content = document.createElement('div');
    content.className = 'table-empty-state-content';

    const line = document.createElement('div');
    line.className = 'table-empty-state-line';

    const dot = document.createElement('span');
    dot.className = 'table-empty-state-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '•';

    const title = document.createElement('strong');
    title.textContent = config.title;

    line.append(dot, title);

    if (config.actionLabel) {
      const separator = document.createElement('span');
      separator.className = 'table-empty-state-separator';
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '·';

      const action = config.actionHref ? document.createElement('a') : document.createElement('button');
      action.className = 'btn btn-primary btn-sm table-empty-state-action';
      if (config.actionHref) {
        action.href = config.actionHref;
      } else {
        action.type = 'button';
        action.dataset.tableEmptyReset = 'true';
      }
      if (config.actionIcon) {
        const icon = document.createElement('i');
        icon.className = config.actionIcon;
        icon.setAttribute('aria-hidden', 'true');
        action.append(icon);
      }
      action.append(document.createTextNode(config.actionLabel));
      line.append(separator, action);
    }

    const description = document.createElement('p');
    description.textContent = config.description;

    content.append(line, description);
    state.replaceChildren(content);
    return state;
  }

  function updateTableEmptyState(table, explicitVisibleCount) {
    if (!table) return;
    const state = renderTableEmptyState(table);
    if (!state) return;
    const visibleCount = Number.isFinite(explicitVisibleCount) ? explicitVisibleCount : getFilteredVisibleCount(table);
    const shouldShow = visibleCount === 0;
    const row = state.closest?.('[data-table-empty-row]');
    const cell = state.closest?.('[data-table-empty-cell]');
    if (cell) cell.colSpan = getTableColumnCount(table);
    state.hidden = !shouldShow;
    if (row) row.hidden = !shouldShow;
    table.classList.toggle('has-table-empty-state', shouldShow);
  }

  function shouldAutoInitTableEmptyState(table) {
    if (!table || table.dataset.tableEmpty === 'false') return false;
    if (table.dataset.tableEmpty === 'true' || table.dataset.tableEmptyTitle) return true;
    const card = table.closest?.('.card');
    if (!card) return false;
    return Boolean(card.querySelector('input[type="search"], [data-filter-key], .admin-filter-select, [data-reset-table-filter]'));
  }

  function initTableEmptyState(table) {
    if (!shouldAutoInitTableEmptyState(table) || table.dataset.tableEmptyReady === 'true') return;
    table.dataset.tableEmptyReady = 'true';
    renderTableEmptyState(table);
    updateTableEmptyState(table);

    const tbody = table.tBodies?.[0];
    if (!tbody) return;
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => updateTableEmptyState(table));
    });
    observer.observe(tbody, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ['hidden', 'data-table-filter-hidden'],
    });
  }

  function initAllTableEmptyStates(root = document) {
    root.querySelectorAll?.('table').forEach(initTableEmptyState);
  }


  function resetDropdown(dropdown) {
    if (!dropdown) return;
    const defaultOption = dropdown.querySelector('[data-filter-value="all"], [data-select-value="all"], .dropdown-option[aria-selected="true"]') || dropdown.querySelector('.dropdown-option');
    const triggerText = dropdown.querySelector('[data-select-text]');
    dropdown.querySelectorAll('.dropdown-option').forEach((option) => {
      const active = option === defaultOption;
      option.classList.toggle('selected', active);
      option.classList.toggle('active', active);
      option.setAttribute('aria-selected', String(active));
    });
    if (triggerText && defaultOption) triggerText.textContent = defaultOption.textContent.trim();
    dropdown.removeAttribute('open');
    if (defaultOption) {
      defaultOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }

  function resetTableFilters(button) {
    const toolbar = button.closest('.toolbar') || button.closest('.admin-user-toolbar');
    const scope = toolbar || button.closest('.card') || document;
    scope.querySelectorAll('input[type="search"]').forEach((input) => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    scope.querySelectorAll('details[data-filter-key], details.admin-filter-select').forEach(resetDropdown);
  }

  function getTablesForEmptyStateRefresh(root = document) {
    const selector = 'table[data-table-empty-ready="true"], table[data-table-empty="true"], table[data-table-empty-title]';
    const tables = [];
    if (root?.matches?.(selector)) tables.push(root);
    if (root?.querySelectorAll) tables.push(...root.querySelectorAll(selector));
    return Array.from(new Set(tables));
  }

  function refreshTableEmptyStates(root = document) {
    getTablesForEmptyStateRefresh(root).forEach((table) => {
      if (shouldAutoInitTableEmptyState(table) && table.dataset.tableEmptyReady !== 'true') {
        initTableEmptyState(table);
        return;
      }
      updateTableEmptyState(table);
    });
  }

  function scheduleTableEmptyStateRefresh(root = document) {
    [0, 80, 180, 380].forEach((delay) => {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => refreshTableEmptyStates(root));
      }, delay);
    });
  }

  function scheduleEmptyStateAfterTableInteraction(event) {
    if (event.target.closest?.('[data-table-empty-state]')) return;
    const isTableFilterInteraction = event.target.closest?.('input[type="search"], [data-filter-key], details.admin-filter-select, [data-reset-table-filter], .dropdown-option, .page-button, .per-page');
    if (!isTableFilterInteraction) return;
    const scope = event.target.closest?.('.card, .table-card, .content-panel, main') || document;
    scheduleTableEmptyStateRefresh(scope);
  }

  document.addEventListener('input', scheduleEmptyStateAfterTableInteraction, true);
  document.addEventListener('change', scheduleEmptyStateAfterTableInteraction, true);
  document.addEventListener('click', scheduleEmptyStateAfterTableInteraction, true);

  document.addEventListener('click', (event) => {
    const emptyReset = event.target.closest?.('[data-table-empty-reset]');
    if (!emptyReset) return;
    event.preventDefault();
    const wrapper = emptyReset.closest('[data-table-empty-state]');
    const table = wrapper?.closest?.('table') || wrapper?.closest?.('.table-scroll')?.querySelector?.('table');
    const resetButton = table ? getTableEmptyStateConfig(table).resetButton : null;
    resetButton?.click();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-reset-table-filter]');
    if (!button) return;
    event.preventDefault();
    resetTableFilters(button);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllTableEmptyStates());
  } else {
    initAllTableEmptyStates();
  }

  window.initTableEmptyStates = initAllTableEmptyStates;
  window.refreshTableEmptyStates = refreshTableEmptyStates;
  window.scheduleTableEmptyStateRefresh = scheduleTableEmptyStateRefresh;
  window.getTableDataRows = getTableDataRows;
  window.updateTableEmptyState = updateTableEmptyState;
  window.normalizeTableSearchText = normalizeSearchText;
  window.getTableRowSearchText = getTableRowSearchText;
})();
