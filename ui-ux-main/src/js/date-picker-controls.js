(function () {
  var PICKER_SELECTOR = [
    'details.ds-datepicker[data-component="datepicker"]',
    'details.ds-dropdown[data-component="modal-control-datepicker"]',
    'details.ds-dropdown[data-component="guide-datepicker"]',
    'details.ds-dropdown[data-component="guide-datetimepicker"]',
    'details.ds-dropdown[data-component="guide-daterange"]'
  ].join(', ');

  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function localToday() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function toISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseISO(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
    return date;
  }

  function compareISO(a, b) {
    if (!a || !b) return 0;
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  function addDate(date, amount, unit) {
    var next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (unit === 'y') next.setFullYear(next.getFullYear() + amount);
    else if (unit === 'm') next.setMonth(next.getMonth() + amount);
    else next.setDate(next.getDate() + amount);
    return next;
  }

  function resolveBoundary(value) {
    if (!value) return '';
    var raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    var today = localToday();
    if (raw === 'today') return toISO(today);
    var match = raw.match(/^today([+-])(\d+)([dmy])$/);
    if (match) {
      var amount = Number(match[2]) * (match[1] === '-' ? -1 : 1);
      return toISO(addDate(today, amount, match[3]));
    }
    return '';
  }

  function formatDate(value) {
    var date = parseISO(value);
    if (!date) return 'Pilih tanggal';
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }

  function dayOrder(value) {
    var date = parseISO(value);
    if (!date) return 0;
    return Math.floor(date.getTime() / 86400000);
  }

  function getNativeControl(picker) {
    return picker && picker.dataset.syncControl ? document.getElementById(picker.dataset.syncControl) : null;
  }

  function getKind(picker) {
    var component = picker.dataset.component || '';
    if (component === 'modal-control-datepicker') return 'modal';
    if (component === 'datepicker') return 'page';
    return 'guide';
  }

  function getDayAttr(picker) {
    var kind = getKind(picker);
    if (kind === 'modal') return 'data-modal-date';
    if (kind === 'page') return 'data-datepicker-day';
    return 'data-guide-date';
  }

  function getHiddenInput(picker) {
    return picker.querySelector('[data-datepicker-value], [data-picker-value]');
  }

  function getTriggerText(picker) {
    return picker.querySelector('[data-datepicker-text], [data-picker-text]');
  }

  function getSelectedValue(picker) {
    var nativeControl = getNativeControl(picker);
    if (nativeControl && nativeControl.value) return nativeControl.value;

    var hidden = getHiddenInput(picker);
    if (hidden && hidden.value) {
      if (picker.dataset.component === 'guide-daterange') return hidden.value.split('|')[0] || '';
      return hidden.value.split('T')[0] || '';
    }

    var selected = picker.querySelector('.calendar-date.selected');
    return selected ? selected.dataset.value || '' : '';
  }

  function getFirstDateValue(picker) {
    var first = picker.querySelector('.calendar-date[data-value]');
    return first ? first.dataset.value : '';
  }

  function getBounds(picker) {
    var nativeControl = getNativeControl(picker);
    var minRaw = picker.dataset.dateMin || picker.dataset.minDate || (nativeControl && (nativeControl.dataset.dateMin || nativeControl.min)) || '';
    var maxRaw = picker.dataset.dateMax || picker.dataset.maxDate || (nativeControl && (nativeControl.dataset.dateMax || nativeControl.max)) || '';
    var min = resolveBoundary(minRaw);
    var max = resolveBoundary(maxRaw);

    if (nativeControl) {
      if (min) nativeControl.min = min;
      if (max) nativeControl.max = max;
    }

    return { min: min, max: max };
  }

  function clampViewDate(date, bounds) {
    if (!date) return null;
    var iso = toISO(date);
    if (bounds.min && compareISO(iso, bounds.min) < 0) return parseISO(bounds.min);
    if (bounds.max && compareISO(iso, bounds.max) > 0) return parseISO(bounds.max);
    return date;
  }

  function getViewDate(picker) {
    var selected = parseISO(getSelectedValue(picker));
    var stored = parseISO(picker.dataset.viewDate);
    var first = parseISO(getFirstDateValue(picker));
    var bounds = getBounds(picker);
    var date = stored || selected || first || parseISO(bounds.max) || parseISO(bounds.min) || localToday();
    return clampViewDate(date, bounds) || localToday();
  }

  function getYearRange(viewYear, bounds, picker) {
    var minYear = bounds.min ? Number(bounds.min.slice(0, 4)) : 1900;
    var maxYear = bounds.max ? Number(bounds.max.slice(0, 4)) : localToday().getFullYear() + 10;

    if (picker.dataset.dateYearStart) minYear = Number(picker.dataset.dateYearStart);
    if (picker.dataset.dateYearEnd) maxYear = Number(picker.dataset.dateYearEnd);

    minYear = Number.isFinite(minYear) ? minYear : Math.min(viewYear - 10, 1900);
    maxYear = Number.isFinite(maxYear) ? maxYear : viewYear + 10;
    if (viewYear < minYear) minYear = viewYear;
    if (viewYear > maxYear) maxYear = viewYear;
    return { minYear: minYear, maxYear: maxYear };
  }

  function ensureCalendarControls(picker, viewDate, bounds) {
    var widget = picker.querySelector('.calendar-widget');
    if (!widget) return null;

    var head = widget.querySelector('.calendar-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'calendar-head';
      widget.prepend(head);
    }

    if (!head.querySelector('[data-datepicker-month-select]')) {
      head.innerHTML = '';

      var prev = document.createElement('button');
      prev.className = 'icon-btn icon-btn-sm';
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Bulan sebelumnya');
      prev.setAttribute('data-datepicker-prev-month', '');
      prev.textContent = '‹';

      var controlWrap = document.createElement('div');
      controlWrap.className = 'datepicker-month-year';

      var monthSelect = document.createElement('select');
      monthSelect.className = 'datepicker-select datepicker-month-select';
      monthSelect.setAttribute('aria-label', 'Pilih bulan');
      monthSelect.setAttribute('data-datepicker-month-select', '');
      MONTHS.forEach(function (month, index) {
        var option = document.createElement('option');
        option.value = String(index);
        option.textContent = month;
        monthSelect.append(option);
      });

      var yearSelect = document.createElement('select');
      yearSelect.className = 'datepicker-select datepicker-year-select';
      yearSelect.setAttribute('aria-label', 'Pilih tahun');
      yearSelect.setAttribute('data-datepicker-year-select', '');

      controlWrap.append(monthSelect, yearSelect);

      var next = document.createElement('button');
      next.className = 'icon-btn icon-btn-sm';
      next.type = 'button';
      next.setAttribute('aria-label', 'Bulan berikutnya');
      next.setAttribute('data-datepicker-next-month', '');
      next.textContent = '›';

      head.append(prev, controlWrap, next);
    }

    var monthControl = head.querySelector('[data-datepicker-month-select]');
    var yearControl = head.querySelector('[data-datepicker-year-select]');
    var yearRange = getYearRange(viewDate.getFullYear(), bounds, picker);

    if (yearControl.dataset.minYear !== String(yearRange.minYear) || yearControl.dataset.maxYear !== String(yearRange.maxYear)) {
      yearControl.innerHTML = '';
      for (var year = yearRange.maxYear; year >= yearRange.minYear; year -= 1) {
        var option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearControl.append(option);
      }
      yearControl.dataset.minYear = String(yearRange.minYear);
      yearControl.dataset.maxYear = String(yearRange.maxYear);
    }

    monthControl.value = String(viewDate.getMonth());
    yearControl.value = String(viewDate.getFullYear());

    return widget;
  }

  function renderGrid(picker, viewDate, bounds) {
    var widget = ensureCalendarControls(picker, viewDate, bounds);
    if (!widget) return;

    var grid = widget.querySelector('.calendar-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'calendar-grid';
      var actions = widget.querySelector('.calendar-actions, .dropdown-footer');
      if (actions) widget.insertBefore(grid, actions);
      else widget.append(grid);
    }

    grid.innerHTML = '';
    DAY_LABELS.forEach(function (label) {
      var day = document.createElement('div');
      day.className = 'calendar-day';
      day.textContent = label;
      grid.append(day);
    });

    var year = viewDate.getFullYear();
    var month = viewDate.getMonth();
    var firstDay = new Date(year, month, 1);
    var mondayIndex = (firstDay.getDay() + 6) % 7;
    var start = new Date(year, month, 1 - mondayIndex);
    var selectedValue = getSelectedValue(picker);
    var rangeStart = picker.dataset.rangeStart || '';
    var rangeEnd = picker.dataset.rangeEnd || '';
    var rangeStartOrder = dayOrder(rangeStart);
    var rangeEndOrder = dayOrder(rangeEnd);
    var attrName = getDayAttr(picker);

    for (var i = 0; i < 42; i += 1) {
      var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var value = toISO(date);
      var order = dayOrder(value);
      var button = document.createElement('button');
      button.className = 'calendar-date';
      button.type = 'button';
      button.textContent = String(date.getDate());
      button.dataset.value = value;
      button.dataset.label = formatDate(value);
      button.dataset.order = String(order);
      button.setAttribute(attrName, '');

      if (date.getMonth() !== month) button.classList.add('muted-date');
      if (picker.dataset.component === 'guide-daterange') {
        var isRangeStart = rangeStart && value === rangeStart;
        var isRangeEnd = rangeEnd && value === rangeEnd;
        var inRange = rangeStartOrder && rangeEndOrder && order > rangeStartOrder && order < rangeEndOrder;
        button.classList.toggle('selected', Boolean(isRangeStart || isRangeEnd));
        button.classList.toggle('range', Boolean(inRange));
      } else if (selectedValue && value === selectedValue) {
        button.classList.add('selected');
      }

      var disabled = (bounds.min && compareISO(value, bounds.min) < 0) || (bounds.max && compareISO(value, bounds.max) > 0);
      if (disabled) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      }

      grid.append(button);
    }
  }

  function hydrateRangeFromHidden(picker) {
    if (!picker || picker.dataset.component !== 'guide-daterange') return;
    if (picker.dataset.rangeStart || picker.dataset.rangeEnd) return;
    var hidden = getHiddenInput(picker);
    var parts = hidden && hidden.value ? hidden.value.split('|') : [];
    if (!parts[0]) return;
    picker.dataset.rangeStart = parts[0];
    picker.dataset.rangeStartLabel = formatDate(parts[0]);
    picker.dataset.rangeStartOrder = String(dayOrder(parts[0]));
    if (parts[1]) {
      picker.dataset.rangeEnd = parts[1];
      picker.dataset.rangeEndLabel = formatDate(parts[1]);
      picker.dataset.rangeEndOrder = String(dayOrder(parts[1]));
    }
  }

  function renderPicker(picker) {
    if (!picker || !picker.matches(PICKER_SELECTOR)) return;
    hydrateRangeFromHidden(picker);
    var bounds = getBounds(picker);
    var viewDate = getViewDate(picker);
    picker.dataset.viewDate = toISO(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
    renderGrid(picker, viewDate, bounds);
  }

  function renderAll(root) {
    (root || document).querySelectorAll(PICKER_SELECTOR).forEach(renderPicker);
  }

  function setPagePickerValue(picker, value) {
    var hidden = picker.querySelector('[data-datepicker-value]');
    var trigger = getTriggerText(picker);
    picker.querySelectorAll('[data-datepicker-day]').forEach(function (day) {
      day.classList.toggle('selected', day.dataset.value === value);
    });
    if (hidden) {
      hidden.value = value;
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (trigger) trigger.textContent = formatDate(value);
    picker.dataset.dateValue = value;
  }

  function setModalPickerValue(picker, value) {
    var nativeControl = getNativeControl(picker);
    var trigger = getTriggerText(picker);
    picker.querySelectorAll('[data-modal-date]').forEach(function (day) {
      day.classList.toggle('selected', day.dataset.value === value);
    });
    if (nativeControl) {
      nativeControl.value = value;
      nativeControl.dispatchEvent(new Event('input', { bubbles: true }));
      nativeControl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (trigger) trigger.textContent = formatDate(value);
    picker.dataset.dateValue = value;
  }

  function syncModalPickerFromNative(picker) {
    if (!picker) return;
    var nativeControl = getNativeControl(picker);
    var trigger = getTriggerText(picker);
    var value = nativeControl && nativeControl.value ? nativeControl.value : '';
    picker.dataset.dateValue = value;
    picker.querySelectorAll('[data-modal-date]').forEach(function (day) {
      day.classList.toggle('selected', Boolean(value && day.dataset.value === value));
    });
    if (trigger) trigger.textContent = value ? formatDate(value) : 'Pilih tanggal';
    renderPicker(picker);
  }

  function setGuidePickerValue(picker, value) {
    var hidden = getHiddenInput(picker);
    var trigger = getTriggerText(picker);
    picker.querySelectorAll('[data-guide-date]').forEach(function (day) {
      day.classList.toggle('selected', day.dataset.value === value);
    });
    picker.dataset.dateValue = value;
    picker.dataset.dateLabel = formatDate(value);

    if (picker.dataset.component === 'guide-datepicker') {
      if (hidden) hidden.value = value;
      if (trigger) trigger.textContent = formatDate(value);
    } else if (picker.dataset.component === 'guide-datetimepicker') {
      var currentTime = picker.dataset.timeValue || '';
      if (!currentTime) {
        var current = hidden && hidden.value ? hidden.value.split('T')[1] : '';
        currentTime = current || '08:30';
      }
      if (hidden) hidden.value = value + 'T' + currentTime;
      if (trigger) trigger.textContent = formatDate(value) + ' · ' + currentTime;
    }
  }

  function setPickerValue(picker, value, shouldClose) {
    if (!value) return;
    var bounds = getBounds(picker);
    if ((bounds.min && compareISO(value, bounds.min) < 0) || (bounds.max && compareISO(value, bounds.max) > 0)) return;

    var kind = getKind(picker);
    if (kind === 'page') setPagePickerValue(picker, value);
    else if (kind === 'modal') setModalPickerValue(picker, value);
    else if (picker.dataset.component !== 'guide-daterange') setGuidePickerValue(picker, value);

    picker.dataset.viewDate = value.slice(0, 7) + '-01';
    renderPicker(picker);
    if (shouldClose) picker.removeAttribute('open');
  }

  function navigateMonth(picker, offset) {
    var viewDate = getViewDate(picker);
    var next = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    next = clampViewDate(next, getBounds(picker)) || next;
    picker.dataset.viewDate = toISO(new Date(next.getFullYear(), next.getMonth(), 1));
    renderPicker(picker);
  }

  function changeMonthYear(picker) {
    var monthSelect = picker.querySelector('[data-datepicker-month-select]');
    var yearSelect = picker.querySelector('[data-datepicker-year-select]');
    if (!monthSelect || !yearSelect) return;
    var next = new Date(Number(yearSelect.value), Number(monthSelect.value), 1);
    next = clampViewDate(next, getBounds(picker)) || next;
    picker.dataset.viewDate = toISO(new Date(next.getFullYear(), next.getMonth(), 1));
    renderPicker(picker);
  }

  function goToday(picker, button) {
    var value = button.dataset.todayValue || toISO(localToday());
    var actualToday = toISO(localToday());
    var bounds = getBounds(picker);
    if ((bounds.min && compareISO(value, bounds.min) < 0) || (bounds.max && compareISO(value, bounds.max) > 0)) {
      value = actualToday;
    }
    setPickerValue(picker, value, false);
  }

  document.addEventListener('click', function (event) {
    var prev = event.target.closest('[data-datepicker-prev-month]');
    if (prev) {
      var prevPicker = prev.closest(PICKER_SELECTOR);
      if (prevPicker) navigateMonth(prevPicker, -1);
      return;
    }

    var next = event.target.closest('[data-datepicker-next-month]');
    if (next) {
      var nextPicker = next.closest(PICKER_SELECTOR);
      if (nextPicker) navigateMonth(nextPicker, 1);
      return;
    }

    var day = event.target.closest('.calendar-date[data-value]');
    if (day && day.closest(PICKER_SELECTOR)) {
      if (day.disabled) return;
      var picker = day.closest(PICKER_SELECTOR);
      if (getKind(picker) === 'page') setPickerValue(picker, day.dataset.value, false);
      else if (getKind(picker) === 'modal') setPickerValue(picker, day.dataset.value, true);
      else if (picker.dataset.component !== 'guide-daterange') setPickerValue(picker, day.dataset.value, picker.dataset.component === 'guide-datepicker');
      else window.setTimeout(function () { renderPicker(picker); }, 0);
      return;
    }

    var today = event.target.closest('[data-datepicker-today]');
    if (today) {
      var todayPicker = today.closest(PICKER_SELECTOR);
      if (todayPicker) goToday(todayPicker, today);
      return;
    }

    var clear = event.target.closest('[data-modal-date-clear], [data-guide-date-clear], [data-guide-range-reset]');
    if (clear) {
      var clearPicker = clear.closest(PICKER_SELECTOR);
      if (clearPicker && getKind(clearPicker) === 'modal') {
        var nativeControl = getNativeControl(clearPicker);
        if (nativeControl) {
          nativeControl.value = '';
          nativeControl.dispatchEvent(new Event('input', { bubbles: true }));
          nativeControl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncModalPickerFromNative(clearPicker);
        clearPicker.removeAttribute('open');
      } else if (clearPicker) {
        window.setTimeout(function () { renderPicker(clearPicker); }, 0);
      }
    }
  });

  document.addEventListener('change', function (event) {
    if (!event.target.matches('[data-datepicker-month-select], [data-datepicker-year-select]')) return;
    var picker = event.target.closest(PICKER_SELECTOR);
    if (picker) changeMonthYear(picker);
  });

  document.addEventListener('toggle', function (event) {
    var picker = event.target;
    if (picker && picker.matches && picker.matches(PICKER_SELECTOR) && picker.open) renderPicker(picker);
  }, true);

  document.addEventListener('input', function (event) {
    var nativeControl = event.target;
    if (!nativeControl.matches || !nativeControl.matches('input[type="date"][data-modal-native]')) return;
    var picker = document.querySelector('details.ds-dropdown[data-component="modal-control-datepicker"][data-sync-control="' + CSS.escape(nativeControl.id) + '"]');
    if (picker) window.setTimeout(function () { syncModalPickerFromNative(picker); }, 0);
  });

  document.addEventListener('change', function (event) {
    var nativeControl = event.target;
    if (!nativeControl.matches || !nativeControl.matches('input[type="date"][data-modal-native]')) return;
    var picker = document.querySelector('details.ds-dropdown[data-component="modal-control-datepicker"][data-sync-control="' + CSS.escape(nativeControl.id) + '"]');
    if (picker) window.setTimeout(function () { syncModalPickerFromNative(picker); }, 0);
  });


  var DEMO_WIDGET_SELECTOR = '.dropdown-demo .calendar-widget';

  function parseDateLabel(value) {
    var text = cleanText(value).toLowerCase();
    var match = text.match(/^(\d{1,2})\s+([a-zA-ZÀ-ÿ]+)\s+(\d{4})$/);
    if (!match) return null;
    var monthIndex = MONTHS.map(function (month) { return month.toLowerCase(); }).indexOf(match[2]);
    if (monthIndex < 0) return null;
    return new Date(Number(match[3]), monthIndex, Number(match[1]));
  }

  function getDemoInput(widget) {
    var demo = widget && widget.closest('.dropdown-demo');
    return demo ? demo.querySelector('.field > .input-wrap input, .field > input.input, .field input.input') : null;
  }

  function getDemoViewDate(widget) {
    var selected = widget.querySelector('.calendar-date.selected[data-value]');
    if (selected && parseISO(selected.dataset.value)) return parseISO(selected.dataset.value);
    var input = getDemoInput(widget);
    var parsedInput = input ? parseDateLabel(input.value) : null;
    if (parsedInput) return parsedInput;
    var stored = parseISO(widget.dataset.viewDate);
    if (stored) return stored;
    return new Date(2026, 5, 15);
  }

  function ensureDemoCalendarControls(widget, viewDate) {
    var head = widget.querySelector('.calendar-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'calendar-head';
      widget.prepend(head);
    }
    if (!head.querySelector('[data-demo-datepicker-month-select]')) {
      head.innerHTML = '';
      var prev = document.createElement('button');
      prev.className = 'icon-btn icon-btn-sm';
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Bulan sebelumnya');
      prev.setAttribute('data-demo-datepicker-prev-month', '');
      prev.textContent = '‹';

      var wrap = document.createElement('div');
      wrap.className = 'datepicker-month-year';

      var monthSelect = document.createElement('select');
      monthSelect.className = 'datepicker-select datepicker-month-select';
      monthSelect.setAttribute('aria-label', 'Pilih bulan');
      monthSelect.setAttribute('data-demo-datepicker-month-select', '');
      MONTHS.forEach(function (month, index) {
        var option = document.createElement('option');
        option.value = String(index);
        option.textContent = month;
        monthSelect.append(option);
      });

      var yearSelect = document.createElement('select');
      yearSelect.className = 'datepicker-select datepicker-year-select';
      yearSelect.setAttribute('aria-label', 'Pilih tahun');
      yearSelect.setAttribute('data-demo-datepicker-year-select', '');
      for (var year = localToday().getFullYear() + 10; year >= 1900; year -= 1) {
        var yearOption = document.createElement('option');
        yearOption.value = String(year);
        yearOption.textContent = String(year);
        yearSelect.append(yearOption);
      }

      var next = document.createElement('button');
      next.className = 'icon-btn icon-btn-sm';
      next.type = 'button';
      next.setAttribute('aria-label', 'Bulan berikutnya');
      next.setAttribute('data-demo-datepicker-next-month', '');
      next.textContent = '›';

      wrap.append(monthSelect, yearSelect);
      head.append(prev, wrap, next);
    }

    head.querySelector('[data-demo-datepicker-month-select]').value = String(viewDate.getMonth());
    head.querySelector('[data-demo-datepicker-year-select]').value = String(viewDate.getFullYear());
  }

  function renderDemoWidget(widget) {
    if (!widget) return;
    var viewDate = getDemoViewDate(widget);
    widget.dataset.viewDate = toISO(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
    ensureDemoCalendarControls(widget, viewDate);

    var grid = widget.querySelector('.calendar-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'calendar-grid';
      var actions = widget.querySelector('.calendar-actions');
      if (actions) widget.insertBefore(grid, actions);
      else widget.append(grid);
    }

    grid.innerHTML = '';
    DAY_LABELS.forEach(function (label) {
      var day = document.createElement('div');
      day.className = 'calendar-day';
      day.textContent = label;
      grid.append(day);
    });

    var input = getDemoInput(widget);
    var selectedFromInput = input ? parseDateLabel(input.value) : null;
    var selectedValue = selectedFromInput ? toISO(selectedFromInput) : '';
    var year = viewDate.getFullYear();
    var month = viewDate.getMonth();
    var firstDay = new Date(year, month, 1);
    var mondayIndex = (firstDay.getDay() + 6) % 7;
    var start = new Date(year, month, 1 - mondayIndex);

    for (var i = 0; i < 42; i += 1) {
      var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var value = toISO(date);
      var button = document.createElement('button');
      button.className = 'calendar-date';
      button.type = 'button';
      button.textContent = String(date.getDate());
      button.dataset.demoDate = '';
      button.dataset.value = value;
      button.dataset.label = formatDate(value);
      if (date.getMonth() !== month) button.classList.add('muted-date');
      if (selectedValue && selectedValue === value) button.classList.add('selected');
      grid.append(button);
    }
  }

  function renderDemoWidgets(root) {
    (root || document).querySelectorAll(DEMO_WIDGET_SELECTOR).forEach(renderDemoWidget);
  }

  function navigateDemoMonth(widget, offset) {
    var viewDate = getDemoViewDate(widget);
    var next = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    widget.dataset.viewDate = toISO(next);
    renderDemoWidget(widget);
  }

  function changeDemoMonthYear(control) {
    var widget = control.closest(DEMO_WIDGET_SELECTOR);
    if (!widget) return;
    var monthSelect = widget.querySelector('[data-demo-datepicker-month-select]');
    var yearSelect = widget.querySelector('[data-demo-datepicker-year-select]');
    if (!monthSelect || !yearSelect) return;
    widget.dataset.viewDate = toISO(new Date(Number(yearSelect.value), Number(monthSelect.value), 1));
    renderDemoWidget(widget);
  }

  function setDemoDate(widget, value) {
    var input = getDemoInput(widget);
    if (input) input.value = formatDate(value);
    widget.querySelectorAll('[data-demo-date]').forEach(function (day) {
      day.classList.toggle('selected', day.dataset.value === value);
    });
    var demo = widget.closest('.dropdown-demo');
    if (demo) {
      demo.classList.remove('is-open');
      var trigger = demo.querySelector('.input-wrap');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  }

  document.addEventListener('click', function (event) {
    var demoPrev = event.target.closest('[data-demo-datepicker-prev-month]');
    if (demoPrev) {
      var prevWidget = demoPrev.closest(DEMO_WIDGET_SELECTOR);
      if (prevWidget) navigateDemoMonth(prevWidget, -1);
      return;
    }

    var demoNext = event.target.closest('[data-demo-datepicker-next-month]');
    if (demoNext) {
      var nextWidget = demoNext.closest(DEMO_WIDGET_SELECTOR);
      if (nextWidget) navigateDemoMonth(nextWidget, 1);
      return;
    }

    var demoDay = event.target.closest('[data-demo-date]');
    if (demoDay) {
      var dayWidget = demoDay.closest(DEMO_WIDGET_SELECTOR);
      if (dayWidget) setDemoDate(dayWidget, demoDay.dataset.value);
      return;
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target.matches('[data-demo-datepicker-month-select], [data-demo-datepicker-year-select]')) changeDemoMonthYear(event.target);
  });

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(PICKER_SELECTOR)) renderPicker(node);
        if (node.matches && node.matches(DEMO_WIDGET_SELECTOR)) renderDemoWidget(node);
        if (node.querySelectorAll) {
          renderAll(node);
          renderDemoWidgets(node);
        }
      });
    });
  });

  function init() {
    renderAll(document);
    renderDemoWidgets(document);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.SIMRSDatepickerControls = {
    renderAll: renderAll,
    renderPicker: renderPicker,
    formatDate: formatDate
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
