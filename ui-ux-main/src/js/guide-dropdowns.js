(function () {
  var SELECT_DROPDOWN_SELECTOR = 'details.ds-dropdown[data-component="guide-select"], details.ds-dropdown[data-component="dropdown-select"], details.ds-dropdown.ds-select';
  var GUIDE_PICKER_SELECTOR = 'details.ds-dropdown[data-component="guide-datepicker"], details.ds-dropdown[data-component="guide-timepicker"], details.ds-dropdown[data-component="guide-datetimepicker"], details.ds-dropdown[data-component="guide-daterange"]';
  var ALL_GUIDE_DROPDOWNS = SELECT_DROPDOWN_SELECTOR + ', ' + GUIDE_PICKER_SELECTOR;

  function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function optionValue(option) {
    if (!option) return '';
    if (option.dataset.selectValue) return cleanText(option.dataset.selectValue);
    if (option.dataset.value) return cleanText(option.dataset.value);
    if (option.dataset.searchValue) return cleanText(option.dataset.searchValue);

    var meta = option.querySelector('.option-meta');
    if (meta) {
      var metaClone = meta.cloneNode(true);
      metaClone.querySelectorAll('small, .helper, .badge').forEach(function (node) { node.remove(); });
      return cleanText(metaClone.textContent);
    }

    var clone = option.cloneNode(true);
    clone.querySelectorAll('small, svg, .option-icon, .option-right, .badge, .helper').forEach(function (node) { node.remove(); });
    return cleanText(clone.textContent);
  }

  function setSelectedOption(container, selectedOption) {
    container.querySelectorAll('.dropdown-option').forEach(function (option) {
      var isSelected = option === selectedOption;
      option.classList.toggle('selected', isSelected);
      option.classList.toggle('active', isSelected);
      if (option.hasAttribute('aria-selected')) option.setAttribute('aria-selected', String(isSelected));
    });
  }

  function setDropdownTriggerValue(dropdown, value) {
    var target = dropdown.querySelector('[data-select-text]') ||
      dropdown.querySelector('[data-picker-text]') ||
      dropdown.querySelector('.dropdown-trigger > span:not(.field-icon):not(.option-icon)') ||
      dropdown.querySelector('.dropdown-trigger span');

    if (target) target.textContent = value;
    dropdown.dataset.value = value;
  }

  function setHiddenValue(dropdown, value) {
    var hiddenInput = dropdown.querySelector('[data-picker-value]');
    if (hiddenInput) hiddenInput.value = value;
  }

  function closeGuideDropdowns(activeDropdown) {
    document.querySelectorAll(ALL_GUIDE_DROPDOWNS + '[open]').forEach(function (dropdown) {
      if (dropdown !== activeDropdown) dropdown.removeAttribute('open');
    });
  }

  function setupDetailsSelects() {
    document.querySelectorAll(SELECT_DROPDOWN_SELECTOR).forEach(function (dropdown) {
      if (dropdown.dataset.guideDropdownReady === 'true') return;
      dropdown.dataset.guideDropdownReady = 'true';

      dropdown.addEventListener('toggle', function () {
        if (dropdown.open) closeGuideDropdowns(dropdown);
      });

      var selected = dropdown.querySelector('.dropdown-option.selected, .dropdown-option.active, .dropdown-option[aria-selected="true"]');
      if (selected) setDropdownTriggerValue(dropdown, optionValue(selected));
    });
  }

  function setupGuidePickers() {
    document.querySelectorAll(GUIDE_PICKER_SELECTOR).forEach(function (dropdown) {
      if (dropdown.dataset.guidePickerReady === 'true') return;
      dropdown.dataset.guidePickerReady = 'true';
      dropdown.addEventListener('toggle', function () {
        if (dropdown.open) closeGuideDropdowns(dropdown);
      });
    });
  }

  function selectDetailsOption(option) {
    var dropdown = option.closest(SELECT_DROPDOWN_SELECTOR);
    if (!dropdown || option.disabled) return false;

    var value = optionValue(option);
    if (!value) return false;

    setSelectedOption(dropdown, option);
    setDropdownTriggerValue(dropdown, value);
    dropdown.removeAttribute('open');
    return true;
  }

  function getDemoMainInput(demo) {
    return demo ? demo.querySelector('.field > .input-wrap input, .field > input.input, .field input.input') : null;
  }

  function selectDemoDropdownOption(option) {
    var demo = option.closest('.dropdown-demo');
    if (!demo || option.closest(SELECT_DROPDOWN_SELECTOR)) return false;

    var value = optionValue(option);
    var input = getDemoMainInput(demo);
    if (input && value) input.value = value;

    setSelectedOption(demo, option);
    demo.classList.remove('is-open');
    var trigger = demo.querySelector('.input-wrap');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    return true;
  }

  function selectCalendarDate(dateButton) {
    var demo = dateButton.closest('.dropdown-demo');
    if (!demo) return false;

    var input = getDemoMainInput(demo);
    var day = cleanText(dateButton.textContent);
    if (input && day) input.value = day + ' Juni 2026';

    demo.querySelectorAll('.calendar-date').forEach(function (date) {
      date.classList.toggle('selected', date === dateButton);
    });
    demo.classList.remove('is-open');
    var trigger = demo.querySelector('.input-wrap');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    return true;
  }

  function selectedTimeValue(scope) {
    var columns = scope.querySelectorAll('.time-col');
    var hour = columns[0] ? cleanText((columns[0].querySelector('.time-option.selected') || {}).textContent) : '';
    var minute = columns[1] ? cleanText((columns[1].querySelector('.time-option.selected') || {}).textContent) : '';
    return hour && minute ? hour + ':' + minute : '';
  }

  function selectTimeOption(timeOption) {
    var demo = timeOption.closest('.dropdown-demo');
    var column = timeOption.closest('.time-col');
    if (!demo || !column) return false;

    column.querySelectorAll('.time-option').forEach(function (option) {
      option.classList.toggle('selected', option === timeOption);
    });

    var value = selectedTimeValue(demo);
    var input = getDemoMainInput(demo);
    if (input && value) input.value = value;
    return true;
  }

  function selectPickerDate(dateButton) {
    var dropdown = dateButton.closest(GUIDE_PICKER_SELECTOR);
    if (!dropdown || !dateButton.dataset.value) return false;
    if (dropdown.dataset.component === 'guide-daterange') return selectRangeDate(dropdown, dateButton);

    dropdown.querySelectorAll('[data-guide-date]').forEach(function (day) {
      day.classList.toggle('selected', day === dateButton);
    });

    dropdown.dataset.dateValue = dateButton.dataset.value;
    dropdown.dataset.dateLabel = dateButton.dataset.label || cleanText(dateButton.textContent);
    updatePickerValue(dropdown);

    if (dropdown.dataset.component === 'guide-datepicker') dropdown.removeAttribute('open');
    return true;
  }

  function selectPickerTime(timeButton) {
    var dropdown = timeButton.closest(GUIDE_PICKER_SELECTOR);
    var column = timeButton.closest('.time-col');
    if (!dropdown || !column) return false;

    column.querySelectorAll('.time-option').forEach(function (option) {
      option.classList.toggle('selected', option === timeButton);
    });

    dropdown.dataset.timeValue = selectedTimeValue(dropdown);
    updatePickerValue(dropdown);

    if (dropdown.dataset.component === 'guide-timepicker' && timeButton.dataset.timePart === 'minute') dropdown.removeAttribute('open');
    return true;
  }

  function getSelectedDate(dropdown) {
    var selected = dropdown.querySelector('[data-guide-date].selected');
    return selected ? { value: selected.dataset.value, label: selected.dataset.label || cleanText(selected.textContent) } : null;
  }

  function getSelectedTime(dropdown) {
    return selectedTimeValue(dropdown) || dropdown.dataset.timeValue || '';
  }

  function updatePickerValue(dropdown) {
    var component = dropdown.dataset.component;

    if (component === 'guide-datepicker') {
      var dateData = getSelectedDate(dropdown);
      if (!dateData) return;
      setDropdownTriggerValue(dropdown, dateData.label);
      setHiddenValue(dropdown, dateData.value);
      return;
    }

    if (component === 'guide-timepicker') {
      var timeValue = getSelectedTime(dropdown);
      if (!timeValue) return;
      setDropdownTriggerValue(dropdown, timeValue);
      setHiddenValue(dropdown, timeValue);
      return;
    }

    if (component === 'guide-datetimepicker') {
      var selectedDate = getSelectedDate(dropdown);
      var selectedTime = getSelectedTime(dropdown);
      if (!selectedDate || !selectedTime) return;
      setDropdownTriggerValue(dropdown, selectedDate.label + ' · ' + selectedTime);
      setHiddenValue(dropdown, selectedDate.value + 'T' + selectedTime);
    }
  }

  function selectRangeDate(dropdown, dateButton) {
    var value = dateButton.dataset.value;
    var label = dateButton.dataset.label || cleanText(dateButton.textContent);
    var order = Number(dateButton.dataset.order || 0);
    var startOrder = Number(dropdown.dataset.rangeStartOrder || 0);
    var endOrder = Number(dropdown.dataset.rangeEndOrder || 0);

    if (!dropdown.dataset.rangeStart || (dropdown.dataset.rangeStart && dropdown.dataset.rangeEnd) || order < startOrder) {
      dropdown.dataset.rangeStart = value;
      dropdown.dataset.rangeStartLabel = label;
      dropdown.dataset.rangeStartOrder = String(order);
      delete dropdown.dataset.rangeEnd;
      delete dropdown.dataset.rangeEndLabel;
      delete dropdown.dataset.rangeEndOrder;
    } else {
      dropdown.dataset.rangeEnd = value;
      dropdown.dataset.rangeEndLabel = label;
      dropdown.dataset.rangeEndOrder = String(order);
    }

    renderRangeSelection(dropdown);
    if (dropdown.dataset.rangeStart && dropdown.dataset.rangeEnd) {
      setDropdownTriggerValue(dropdown, dropdown.dataset.rangeStartLabel + ' – ' + dropdown.dataset.rangeEndLabel);
      setHiddenValue(dropdown, dropdown.dataset.rangeStart + '|' + dropdown.dataset.rangeEnd);
      dropdown.removeAttribute('open');
    } else {
      setDropdownTriggerValue(dropdown, dropdown.dataset.rangeStartLabel + ' – pilih akhir');
      setHiddenValue(dropdown, dropdown.dataset.rangeStart || '');
    }
    return true;
  }

  function renderRangeSelection(dropdown) {
    var start = Number(dropdown.dataset.rangeStartOrder || 0);
    var end = Number(dropdown.dataset.rangeEndOrder || 0);
    dropdown.querySelectorAll('[data-guide-date]').forEach(function (day) {
      var order = Number(day.dataset.order || 0);
      var isStart = start && order === start;
      var isEnd = end && order === end;
      var inRange = start && end && order > start && order < end;
      day.classList.toggle('selected', Boolean(isStart || isEnd));
      day.classList.toggle('range', Boolean(inRange));
    });
  }

  function resetRange(dropdown) {
    delete dropdown.dataset.rangeStart;
    delete dropdown.dataset.rangeStartLabel;
    delete dropdown.dataset.rangeStartOrder;
    delete dropdown.dataset.rangeEnd;
    delete dropdown.dataset.rangeEndLabel;
    delete dropdown.dataset.rangeEndOrder;
    dropdown.querySelectorAll('[data-guide-date]').forEach(function (day) {
      day.classList.remove('selected', 'range');
    });
    setDropdownTriggerValue(dropdown, 'Pilih rentang tanggal');
    setHiddenValue(dropdown, '');
  }

  function clearDate(dropdown) {
    dropdown.querySelectorAll('[data-guide-date]').forEach(function (day) {
      day.classList.remove('selected');
    });
    setDropdownTriggerValue(dropdown, 'Pilih tanggal');
    setHiddenValue(dropdown, '');
  }

  document.addEventListener('click', function (event) {
    var detailsOption = event.target.closest(SELECT_DROPDOWN_SELECTOR + ' .dropdown-option');
    if (detailsOption && selectDetailsOption(detailsOption)) return;

    var pickerDate = event.target.closest(GUIDE_PICKER_SELECTOR + ' [data-guide-date]');
    if (pickerDate && selectPickerDate(pickerDate)) return;

    var pickerTime = event.target.closest(GUIDE_PICKER_SELECTOR + ' .time-option');
    if (pickerTime && selectPickerTime(pickerTime)) return;

    var pickerClose = event.target.closest(GUIDE_PICKER_SELECTOR + ' [data-guide-close]');
    if (pickerClose) {
      var picker = pickerClose.closest(GUIDE_PICKER_SELECTOR);
      if (picker) picker.removeAttribute('open');
      return;
    }

    var pickerClear = event.target.closest(GUIDE_PICKER_SELECTOR + ' [data-guide-date-clear]');
    if (pickerClear) {
      var datePicker = pickerClear.closest(GUIDE_PICKER_SELECTOR);
      if (datePicker) clearDate(datePicker);
      return;
    }

    var rangeReset = event.target.closest(GUIDE_PICKER_SELECTOR + ' [data-guide-range-reset]');
    if (rangeReset) {
      var rangePicker = rangeReset.closest(GUIDE_PICKER_SELECTOR);
      if (rangePicker) resetRange(rangePicker);
      return;
    }

    var demoOption = event.target.closest('.dropdown-demo .dropdown-option');
    if (demoOption && selectDemoDropdownOption(demoOption)) return;

    var calendarDate = event.target.closest('.dropdown-demo .calendar-date');
    if (calendarDate && selectCalendarDate(calendarDate)) return;

    var timeOption = event.target.closest('.dropdown-demo .time-option');
    if (timeOption) selectTimeOption(timeOption);
  }, true);

  document.addEventListener('click', function (event) {
    if (!event.target.closest(ALL_GUIDE_DROPDOWNS)) closeGuideDropdowns();
  });

  function setupAll() {
    setupDetailsSelects();
    setupGuidePickers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAll);
  } else {
    setupAll();
  }
})();
