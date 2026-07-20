(() => {
  const FORM_SELECTOR = 'form[data-validate-form]';
  const SUBMIT_LOADING_FORM_SELECTOR = 'form[data-validate-form], form[data-submit-loading], #printerForm';
  const SUBMIT_PROCESS_DELAY = 650;
  const CONTROL_SELECTOR = 'input[data-validate-control], select[data-validate-control], textarea[data-validate-control]';
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_PATTERN = /^[+()\d\s.-]{7,20}$/;
  const FILE_EXTENSIONS = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };

  const cleanLabel = (value) => (value || 'Field')
    .replace('*', '')
    .replace(/\s+/g, ' ')
    .trim();

  function getField(control) {
    return control.closest('.field') || control.parentElement;
  }

  function getLabel(control) {
    if (control.dataset.controlLabel) return cleanLabel(control.dataset.controlLabel);
    const field = getField(control);
    const explicitLabel = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
    const fieldLabel = field?.querySelector('label');
    return cleanLabel(explicitLabel?.textContent || fieldLabel?.textContent || control.placeholder || control.id || 'Field');
  }

  function getErrorElement(control) {
    const field = getField(control);
    if (!field || !control.id) return null;
    let error = field.querySelector(`[data-validation-error-for="${CSS.escape(control.id)}"]`);
    if (!error) {
      error = document.createElement('small');
      error.className = 'field-error';
      error.hidden = true;
      error.id = `${control.id}ValidationError`;
      error.dataset.validationErrorFor = control.id;
      field.append(error);
    }
    return error;
  }

  function getControlValue(control) {
    if (control.type === 'file') return control.files?.length ? 'file-selected' : '';
    if (control.type === 'checkbox' || control.type === 'radio') return control.checked ? control.value : '';
    return (control.value || '').trim();
  }

  function isEmpty(control) {
    return getControlValue(control) === '';
  }

  function normalizedCurrency(value) {
    return value.replace(/rp/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  }


  function parseDateValue(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
    return date;
  }

  function formatDateLabel(value) {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const date = parseDateValue(value);
    if (!date) return value;
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function compareDateValue(a, b) {
    if (!a || !b) return 0;
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  function fileIsAccepted(control) {
    if (!control.files?.length || !control.accept) return true;
    const accepted = control.accept.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    return Array.from(control.files).every((file) => {
      const name = file.name.toLowerCase();
      const ext = Object.keys(FILE_EXTENSIONS).find((extension) => name.endsWith(extension));
      return accepted.some((rule) => {
        if (rule.startsWith('.')) return name.endsWith(rule);
        if (rule.endsWith('/*')) return file.type.startsWith(rule.replace('/*', '/'));
        return file.type === rule || (ext && FILE_EXTENSIONS[ext] === rule);
      });
    });
  }

  function setError(control, message = '') {
    const field = getField(control);
    const error = getErrorElement(control);
    const hasError = Boolean(message);

    field?.classList.toggle('is-error', hasError);
    control.toggleAttribute('aria-invalid', hasError);
    if (control.classList.contains('input') || control.classList.contains('textarea')) {
      control.classList.toggle('error', hasError);
    }

    field?.querySelectorAll('.dropdown-trigger, .employee-file-upload').forEach((visibleControl) => {
      visibleControl.classList.toggle('is-error', hasError);
      visibleControl.toggleAttribute('aria-invalid', hasError);
    });

    if (error) {
      error.textContent = message;
      error.hidden = !hasError;
      const describedBy = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add(error.id);
      control.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
    }
  }

  function validateControl(control) {
    if (!control || control.disabled) return true;
    const label = getLabel(control);
    const value = getControlValue(control);

    if (control.required && isEmpty(control)) {
      const defaultRequired = control.tagName === 'SELECT' ? `${label} wajib dipilih.` : `${label} wajib diisi.`;
      setError(control, control.dataset.errorRequired || defaultRequired);
      return false;
    }

    if (value) {
      if (control.type === 'email' && !EMAIL_PATTERN.test(value)) {
        setError(control, control.dataset.errorEmail || 'Masukkan alamat email yang valid.');
        return false;
      }

      if ((control.type === 'tel' || control.dataset.validationType === 'phone') && !PHONE_PATTERN.test(value)) {
        setError(control, control.dataset.errorPhone || 'Masukkan nomor telepon yang valid.');
        return false;
      }

      if (control.type === 'date' || control.dataset.validationType === 'date') {
        if (!parseDateValue(value)) {
          setError(control, control.dataset.errorDate || `Format ${label} belum valid.`);
          return false;
        }
        const minDate = control.min || control.dataset.dateMin || '';
        const maxDate = control.max || control.dataset.dateMax || '';
        if (minDate && compareDateValue(value, minDate) < 0) {
          setError(control, control.dataset.errorMinDate || `${label} tidak boleh sebelum ${formatDateLabel(minDate)}.`);
          return false;
        }
        if (maxDate && compareDateValue(value, maxDate) > 0) {
          setError(control, control.dataset.errorMaxDate || `${label} tidak boleh setelah ${formatDateLabel(maxDate)}.`);
          return false;
        }
      }

      if (control.dataset.validationType === 'currency') {
        const amount = Number(normalizedCurrency(value));
        if (!Number.isFinite(amount) || amount < 0) {
          setError(control, control.dataset.errorCurrency || 'Masukkan nominal menggunakan angka.');
          return false;
        }
      }

      if (control.type === 'number') {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          setError(control, control.dataset.errorNumber || 'Masukkan angka yang valid.');
          return false;
        }
        if (control.min !== '' && numberValue < Number(control.min)) {
          setError(control, `Nilai ${label} minimal ${control.min}.`);
          return false;
        }
        if (control.max !== '' && numberValue > Number(control.max)) {
          setError(control, `Nilai ${label} maksimal ${control.max}.`);
          return false;
        }
      }

      if (control.minLength > 0 && value.length < control.minLength) {
        setError(control, control.dataset.errorMinlength || `${label} minimal ${control.minLength} karakter.`);
        return false;
      }

      if (control.pattern) {
        try {
          const pattern = new RegExp(`^(?:${control.pattern})$`);
          if (!pattern.test(value)) {
            setError(control, control.dataset.errorPattern || `Format ${label} belum sesuai ketentuan.`);
            return false;
          }
        } catch (error) {
          // Pattern HTML tidak valid tidak boleh memblokir form.
        }
      }

      if (control.type === 'file' && !fileIsAccepted(control)) {
        setError(control, control.dataset.errorFile || 'Format file tidak sesuai.');
        return false;
      }
    }

    if (control.dataset.matchField) {
      const target = document.getElementById(control.dataset.matchField);
      if (target && value && value !== (target.value || '').trim()) {
        setError(control, control.dataset.errorMatch || `${label} harus sama.`);
        return false;
      }
    }

    if (control.dataset.afterField) {
      const target = document.getElementById(control.dataset.afterField);
      const start = (target?.value || '').trim();
      if (start && value && value <= start) {
        setError(control, control.dataset.errorAfter || `${label} harus lebih besar dari nilai sebelumnya.`);
        return false;
      }
    }

    setError(control);
    return true;
  }

  function getFormControls(form) {
    return Array.from(form.querySelectorAll(CONTROL_SELECTOR))
      .filter((control) => control.type !== 'hidden' || control.hasAttribute('data-validate-hidden'))
      .filter((control) => !(control.type === 'checkbox' || control.type === 'radio') || control.required);
  }

  function setSummary(form, firstInvalid) {
    let summary = form.querySelector('.form-error-summary');
    if (!firstInvalid) {
      if (summary) summary.hidden = true;
      return;
    }
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'form-error-summary';
      summary.hidden = true;
      summary.setAttribute('role', 'alert');
      form.prepend(summary);
    }
    summary.textContent = 'Mohon lengkapi atau perbaiki data yang ditandai sebelum menyimpan.';
    summary.hidden = false;
  }

  function validateForm(form, shouldFocus = false) {
    const controls = getFormControls(form);
    let firstInvalid = null;
    controls.forEach((control) => {
      const valid = validateControl(control);
      if (!valid && !firstInvalid) firstInvalid = control;
    });
    setSummary(form, firstInvalid);
    if (firstInvalid && shouldFocus) {
      const visibleControl = getField(firstInvalid)?.querySelector('.dropdown-trigger, .employee-file-upload') || firstInvalid;
      visibleControl.focus?.({ preventScroll: true });
      visibleControl.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
    return !firstInvalid;
  }


  function uniqueElements(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function getSubmitButtons(form, submitter = null) {
    const escapedId = form.id ? CSS.escape(form.id) : '';
    const scopedButtons = Array.from(form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]'));
    const externalButtons = escapedId
      ? Array.from(document.querySelectorAll(`button[type="submit"][form="${escapedId}"], button:not([type])[form="${escapedId}"], input[type="submit"][form="${escapedId}"]`))
      : [];
    return uniqueElements([submitter, ...scopedButtons, ...externalButtons]);
  }

  function setSubmitLoading(form, isLoading, submitter = null) {
    if (!form) return;
    form.setAttribute('aria-busy', String(isLoading));
    getSubmitButtons(form, submitter).forEach((button) => {
      if (!button) return;
      if (isLoading) {
        if (!button.dataset.submitLoadingOriginalHtml && button.tagName === 'BUTTON') {
          button.dataset.submitLoadingOriginalHtml = button.innerHTML;
        }
        if (!button.dataset.submitLoadingOriginalValue && button.tagName === 'INPUT') {
          button.dataset.submitLoadingOriginalValue = button.value || '';
        }
        if (!button.dataset.submitLoadingWasDisabled) {
          button.dataset.submitLoadingWasDisabled = String(button.disabled);
        }
        button.classList.add('is-loading');
        button.disabled = true;
        if (button.tagName === 'BUTTON') {
          button.innerHTML = '<span class="auth-spinner" aria-hidden="true"></span><span class="btn-label">Memproses...</span>';
        } else {
          button.value = 'Memproses...';
        }
        return;
      }

      button.classList.remove('is-loading');
      button.disabled = button.dataset.submitLoadingWasDisabled === 'true';
      if (button.tagName === 'BUTTON' && button.dataset.submitLoadingOriginalHtml) {
        button.innerHTML = button.dataset.submitLoadingOriginalHtml;
      }
      if (button.tagName === 'INPUT' && button.dataset.submitLoadingOriginalValue) {
        button.value = button.dataset.submitLoadingOriginalValue;
      }
      delete button.dataset.submitLoadingOriginalHtml;
      delete button.dataset.submitLoadingOriginalValue;
      delete button.dataset.submitLoadingWasDisabled;
    });
  }

  function dispatchSubmitAfterLoading(form, submitter = null) {
    window.setTimeout(() => {
      form.dataset.submitLoadingReady = 'true';
      let submitEvent;
      try {
        submitEvent = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter });
      } catch (error) {
        submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      }
      form.dispatchEvent(submitEvent);
      window.setTimeout(() => setSubmitLoading(form, false, submitter), 220);
    }, SUBMIT_PROCESS_DELAY);
  }

  function syncDropdownValue(option) {
    const field = option.closest('.field');
    const hidden = field?.querySelector('[data-dropdown-value]');
    if (!hidden) return;
    hidden.value = option.dataset.value || option.textContent.trim();
    validateControl(hidden);
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest?.('form');
    if (!form) return;

    const shouldValidate = form.matches(FORM_SELECTOR);
    const shouldShowLoading = form.matches(SUBMIT_LOADING_FORM_SELECTOR);

    if (form.dataset.submitLoadingReady === 'true') {
      delete form.dataset.submitLoadingReady;
      if (shouldValidate && !validateForm(form, true)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setSubmitLoading(form, false, event.submitter);
      }
      return;
    }

    if (shouldValidate && !validateForm(form, true)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setSubmitLoading(form, false, event.submitter);
      return;
    }

    if (!shouldShowLoading) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setSubmitLoading(form, true, event.submitter);
    dispatchSubmitAfterLoading(form, event.submitter);
  }, true);

  document.addEventListener('input', (event) => {
    const control = event.target.closest?.(CONTROL_SELECTOR);
    if (control) validateControl(control);
  });

  document.addEventListener('change', (event) => {
    const control = event.target.closest?.(CONTROL_SELECTOR);
    if (control) validateControl(control);
  });

  document.addEventListener('click', (event) => {
    const option = event.target.closest?.('.modal-select-dropdown .dropdown-option, .modal-picker-dropdown .dropdown-option');
    if (!option) return;
    window.setTimeout(() => {
      syncDropdownValue(option);
      const field = option.closest('.field');
      field?.querySelectorAll('select[data-validate-control]').forEach(validateControl);
    }, 0);
  });

  document.addEventListener('reset', (event) => {
    const form = event.target.closest?.(FORM_SELECTOR);
    if (!form) return;
    window.setTimeout(() => {
      getFormControls(form).forEach((control) => setError(control));
      setSummary(form, null);
    }, 0);
  });


  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest?.('[data-close-modal]');
    if (!closeButton) return;
    const modal = closeButton.closest('.modal');
    modal?.querySelectorAll(FORM_SELECTOR).forEach((form) => {
      getFormControls(form).forEach((control) => setError(control));
      setSummary(form, null);
    });
  });

  window.SIMRSFormValidation = {
    validateForm,
    validateControl,
    setSubmitLoading,
    clearForm(form) {
      getFormControls(form).forEach((control) => setError(control));
      setSummary(form, null);
    }
  };
})();
