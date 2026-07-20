(function () {
  var CONTROL_SELECTOR = 'details.ds-dropdown[data-component="modal-control-select"], details.ds-dropdown[data-component="modal-control-datepicker"], details.ds-dropdown[data-component="modal-control-timepicker"]';
  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function formatDate(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 'Pilih tanggal';
    var monthIndex = Number(match[2]) - 1;
    return Number(match[3]) + ' ' + (MONTHS[monthIndex] || match[2]) + ' ' + match[1];
  }

  function getNative(dropdown) {
    return dropdown && dropdown.dataset.syncControl ? document.getElementById(dropdown.dataset.syncControl) : null;
  }

  function setTriggerText(dropdown, value) {
    var target = dropdown.querySelector('[data-picker-text], [data-select-text]');
    if (target) target.textContent = value;
    dropdown.dataset.value = value;
  }

  function dispatchNative(nativeControl) {
    if (!nativeControl) return;
    nativeControl.dispatchEvent(new Event('input', { bubbles: true }));
    nativeControl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closeModalDropdowns(activeDropdown) {
    document.querySelectorAll(CONTROL_SELECTOR + '[open]').forEach(function (dropdown) {
      if (dropdown !== activeDropdown) dropdown.removeAttribute('open');
    });
  }

  function selectOption(dropdown, selectedOption) {
    dropdown.querySelectorAll('.dropdown-option').forEach(function (option) {
      var active = option === selectedOption;
      option.classList.toggle('selected', active);
      option.classList.toggle('active', active);
      if (option.hasAttribute('aria-selected')) option.setAttribute('aria-selected', String(active));
    });
  }

  function selectDate(dropdown, selectedDate) {
    dropdown.querySelectorAll('[data-modal-date]').forEach(function (dateButton) {
      dateButton.classList.toggle('selected', dateButton === selectedDate);
    });
  }

  function getSelectLabel(nativeControl, value) {
    if (!nativeControl) return value || 'Pilih data';
    var option = Array.from(nativeControl.options || []).find(function (item) { return item.value === value; });
    return option ? cleanText(option.textContent) : (value || 'Pilih data');
  }

  function updateSelectFromNative(dropdown) {
    var nativeControl = getNative(dropdown);
    if (!nativeControl) return;
    var value = nativeControl.value;
    dropdown.querySelectorAll('.dropdown-option').forEach(function (option) {
      var optionValue = option.dataset.value || cleanText(option.textContent);
      var active = optionValue === value;
      option.classList.toggle('selected', active);
      option.classList.toggle('active', active);
      if (option.hasAttribute('aria-selected')) option.setAttribute('aria-selected', String(active));
    });
    setTriggerText(dropdown, getSelectLabel(nativeControl, value));
  }

  function updateDateFromNative(dropdown) {
    var nativeControl = getNative(dropdown);
    if (!nativeControl) return;
    var value = nativeControl.value || '';
    dropdown.dataset.dateValue = value;
    setTriggerText(dropdown, value ? formatDate(value) : 'Pilih tanggal');
    dropdown.querySelectorAll('[data-modal-date]').forEach(function (dateButton) {
      dateButton.classList.toggle('selected', dateButton.dataset.value === value);
    });
  }

  function selectedTimeValue(dropdown) {
    var hour = cleanText((dropdown.querySelector('.time-col:nth-child(1) .time-option.selected') || {}).textContent || '');
    var minute = cleanText((dropdown.querySelector('.time-col:nth-child(2) .time-option.selected') || {}).textContent || '');
    return hour && minute ? hour + ':' + minute : '';
  }

  function updateTimeButtons(dropdown, value) {
    var parts = String(value || '').split(':');
    var hour = parts[0] || '';
    var minute = parts[1] || '';
    var hourCol = dropdown.querySelector('.time-col:nth-child(1)');
    var minuteCol = dropdown.querySelector('.time-col:nth-child(2)');
    if (hourCol) {
      hourCol.querySelectorAll('.time-option').forEach(function (option) {
        option.classList.toggle('selected', cleanText(option.textContent) === hour);
      });
    }
    if (minuteCol) {
      minuteCol.querySelectorAll('.time-option').forEach(function (option) {
        option.classList.toggle('selected', cleanText(option.textContent) === minute);
      });
    }
  }

  function updateTimeFromNative(dropdown) {
    var nativeControl = getNative(dropdown);
    if (!nativeControl) return;
    var value = nativeControl.value || '';
    dropdown.dataset.timeValue = value;
    setTriggerText(dropdown, value || 'Pilih jam');
    if (value) updateTimeButtons(dropdown, value);
  }

  function syncDropdown(dropdown) {
    if (!dropdown) return;
    var component = dropdown.dataset.component;
    if (component === 'modal-control-select') updateSelectFromNative(dropdown);
    if (component === 'modal-control-datepicker') updateDateFromNative(dropdown);
    if (component === 'modal-control-timepicker') updateTimeFromNative(dropdown);
  }

  function syncAll(root) {
    (root || document).querySelectorAll(CONTROL_SELECTOR).forEach(syncDropdown);
  }

  function handleSelectOption(option) {
    var dropdown = option.closest('details.ds-dropdown[data-component="modal-control-select"]');
    if (!dropdown || option.disabled) return false;
    var nativeControl = getNative(dropdown);
    var value = option.dataset.value || cleanText(option.textContent);
    if (nativeControl) {
      nativeControl.value = value;
      dispatchNative(nativeControl);
    }
    selectOption(dropdown, option);
    setTriggerText(dropdown, cleanText(option.textContent) || value);
    dropdown.removeAttribute('open');
    return true;
  }

  function handleDateOption(dateButton) {
    var dropdown = dateButton.closest('details.ds-dropdown[data-component="modal-control-datepicker"]');
    if (!dropdown) return false;
    var nativeControl = getNative(dropdown);
    var value = dateButton.dataset.value || '';
    var label = dateButton.dataset.label || formatDate(value);
    if (nativeControl) {
      nativeControl.value = value;
      dispatchNative(nativeControl);
    }
    selectDate(dropdown, dateButton);
    setTriggerText(dropdown, label);
    dropdown.dataset.dateValue = value;
    dropdown.removeAttribute('open');
    return true;
  }

  function clearDate(button) {
    var dropdown = button.closest('details.ds-dropdown[data-component="modal-control-datepicker"]');
    if (!dropdown) return false;
    var nativeControl = getNative(dropdown);
    if (nativeControl) {
      nativeControl.value = '';
      dispatchNative(nativeControl);
    }
    dropdown.querySelectorAll('[data-modal-date]').forEach(function (dateButton) { dateButton.classList.remove('selected'); });
    setTriggerText(dropdown, 'Pilih tanggal');
    dropdown.dataset.dateValue = '';
    dropdown.removeAttribute('open');
    return true;
  }

  function handleTimeOption(timeButton) {
    var dropdown = timeButton.closest('details.ds-dropdown[data-component="modal-control-timepicker"]');
    var column = timeButton.closest('.time-col');
    if (!dropdown || !column) return false;
    column.querySelectorAll('.time-option').forEach(function (option) {
      option.classList.toggle('selected', option === timeButton);
    });
    var value = selectedTimeValue(dropdown);
    var nativeControl = getNative(dropdown);
    if (value && nativeControl) {
      nativeControl.value = value;
      dispatchNative(nativeControl);
      setTriggerText(dropdown, value);
      dropdown.dataset.timeValue = value;
    }
    if (timeButton.dataset.timePart === 'minute') dropdown.removeAttribute('open');
    return true;
  }

  function setupDropdown(dropdown) {
    if (dropdown.dataset.modalDropdownReady === 'true') return;
    dropdown.dataset.modalDropdownReady = 'true';
    dropdown.addEventListener('toggle', function () {
      if (dropdown.open) closeModalDropdowns(dropdown);
    });
    syncDropdown(dropdown);
  }

  function setupAll(root) {
    (root || document).querySelectorAll(CONTROL_SELECTOR).forEach(setupDropdown);
    (root || document).querySelectorAll('[data-modal-native]').forEach(function (nativeControl) {
      if (nativeControl.dataset.modalNativeReady === 'true') return;
      nativeControl.dataset.modalNativeReady = 'true';
      nativeControl.addEventListener('change', function () { syncAll(nativeControl.closest('.modal') || document); });
      nativeControl.addEventListener('input', function () { syncAll(nativeControl.closest('.modal') || document); });
    });
  }

  document.addEventListener('click', function (event) {
    var selectOptionButton = event.target.closest('details.ds-dropdown[data-component="modal-control-select"] .dropdown-option');
    if (selectOptionButton && handleSelectOption(selectOptionButton)) return;

    var dateButton = event.target.closest('details.ds-dropdown[data-component="modal-control-datepicker"] [data-modal-date]');
    if (dateButton && handleDateOption(dateButton)) return;

    var clearButton = event.target.closest('details.ds-dropdown[data-component="modal-control-datepicker"] [data-modal-date-clear]');
    if (clearButton && clearDate(clearButton)) return;

    var timeButton = event.target.closest('details.ds-dropdown[data-component="modal-control-timepicker"] .time-option');
    if (timeButton && handleTimeOption(timeButton)) return;
  }, true);

  document.addEventListener('click', function (event) {
    if (!event.target.closest(CONTROL_SELECTOR)) closeModalDropdowns();
  });

  document.addEventListener('reset', function (event) {
    window.setTimeout(function () { syncAll(event.target); }, 0);
  }, true);

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
        var modal = mutation.target;
        if (modal && modal.classList && modal.matches('.modal') && !modal.hidden) {
          window.setTimeout(function () { syncAll(modal); }, 0);
        }
      }
    });
  });

  function startObserver() {
    document.querySelectorAll('.modal').forEach(function (modal) {
      observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  function init() {
    setupAll(document);
    startObserver();
    syncAll(document);
  }

  window.syncModalDropdowns = syncAll;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
