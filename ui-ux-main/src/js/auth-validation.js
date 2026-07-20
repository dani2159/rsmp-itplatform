(() => {
  const FORM_SELECTOR = 'form[data-auth-validate]';
  const CONTROL_SELECTOR = '[data-auth-control]';
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const LAST_PASSWORDS = ['Zaidan@2025', 'Admin@2025!', 'Password@123'];

  function cleanLabel(value) {
    return (value || 'Field').replace('*', '').replace(/\s+/g, ' ').trim();
  }

  function getLabel(control) {
    if (control.dataset.authLabel) return cleanLabel(control.dataset.authLabel);
    const explicit = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
    const fieldLabel = control.closest('.field')?.querySelector('label');
    return cleanLabel(explicit?.textContent || fieldLabel?.textContent || control.placeholder || control.name || 'Field');
  }

  function getField(control) {
    return control.closest('.field') || control.closest('fieldset') || control.parentElement;
  }

  function getErrorElement(container, id) {
    if (!container) return null;
    let error = container.querySelector(`[data-auth-error-for="${CSS.escape(id)}"]`);
    if (!error) {
      error = document.createElement('small');
      error.className = 'field-error auth-field-error';
      error.hidden = true;
      error.id = `${id}AuthError`;
      error.dataset.authErrorFor = id;
      container.append(error);
    }
    return error;
  }

  function setControlError(control, message = '') {
    const field = getField(control);
    const id = control.id || control.name || `control-${Math.random().toString(36).slice(2)}`;
    const error = getErrorElement(field, id);
    const hasError = Boolean(message);

    field?.classList.toggle('is-error', hasError);
    control.classList.toggle('error', hasError);
    control.toggleAttribute('aria-invalid', hasError);

    if (error) {
      error.textContent = message;
      error.hidden = !hasError;
      if (hasError) {
        const describedBy = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        describedBy.add(error.id);
        control.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
      }
    }
  }

  function setGroupError(container, message = '') {
    if (!container) return;
    const id = container.id || 'otpGroup';
    const fieldset = container.closest('[data-auth-otp-fieldset]') || container.closest('fieldset') || container;
    const error = getErrorElement(fieldset, id);
    const hasError = Boolean(message);

    fieldset.classList.toggle('is-error', hasError);
    container.querySelectorAll('input').forEach((input) => {
      input.classList.toggle('error', hasError);
      input.toggleAttribute('aria-invalid', hasError);
      if (error && hasError) {
        const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        describedBy.add(error.id);
        input.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
      }
    });

    if (error) {
      error.textContent = message;
      error.hidden = !hasError;
    }
  }

  function passwordRules(value) {
    return {
      length: value.length >= 8,
      uppercase: /[A-Z]/.test(value),
      number: /\d/.test(value),
      special: /[^A-Za-z0-9]/.test(value),
      history: value.length > 0 && !LAST_PASSWORDS.includes(value)
    };
  }

  function strongPasswordMessage(value) {
    const rules = passwordRules(value);
    if (!rules.length) return 'Password baru minimal 8 karakter.';
    if (!rules.uppercase) return 'Password baru harus memiliki minimal 1 huruf besar.';
    if (!rules.number) return 'Password baru harus memiliki minimal 1 angka.';
    if (!rules.special) return 'Password baru harus memiliki minimal 1 karakter khusus.';
    if (!rules.history) return 'Password baru tidak boleh sama dengan 3 password terakhir.';
    return '';
  }

  function validateControl(control) {
    if (!control || control.disabled) return true;
    const label = getLabel(control);
    const value = (control.value || '').trim();

    if (control.required && !value) {
      setControlError(control, `${label} wajib diisi.`);
      return false;
    }

    if (value && control.type === 'email' && !EMAIL_PATTERN.test(value)) {
      setControlError(control, 'Masukkan alamat email yang valid.');
      return false;
    }

    if (value && control.minLength > 0 && value.length < control.minLength) {
      setControlError(control, `${label} minimal ${control.minLength} karakter.`);
      return false;
    }

    if (value && control.hasAttribute('data-auth-strong-password')) {
      const message = strongPasswordMessage(value);
      if (message) {
        setControlError(control, message);
        return false;
      }
    }

    if (control.dataset.authMatch) {
      const target = document.getElementById(control.dataset.authMatch);
      const targetLabel = control.dataset.authMatchLabel || getLabel(target);
      if (value && target && value !== (target.value || '').trim()) {
        setControlError(control, `${label} harus sama dengan ${targetLabel}.`);
        return false;
      }
    }

    setControlError(control);
    return true;
  }

  function validateOtp(form) {
    const group = form.querySelector('[data-auth-otp-group]');
    if (!group) return true;
    const inputs = Array.from(group.querySelectorAll('.auth-otp-input'));
    const value = inputs.map((input) => (input.value || '').trim()).join('');
    if (value.length !== 6 || !/^\d{6}$/.test(value)) {
      setGroupError(group, 'Masukkan kode verifikasi 6 digit.');
      return false;
    }
    setGroupError(group);
    return true;
  }

  function validateForm(form, shouldFocus = false) {
    const controls = Array.from(form.querySelectorAll(CONTROL_SELECTOR));
    let firstInvalid = null;

    controls.forEach((control) => {
      const isValid = validateControl(control);
      if (!isValid && !firstInvalid) firstInvalid = control;
    });

    const isOtpValid = validateOtp(form);
    if (!isOtpValid && !firstInvalid) firstInvalid = form.querySelector('.auth-otp-input');

    if (firstInvalid && shouldFocus) {
      firstInvalid.focus?.({ preventScroll: true });
      firstInvalid.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }

    return !firstInvalid;
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest?.(FORM_SELECTOR);
    if (!form) return;
    if (validateForm(form, true)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('input', (event) => {
    const control = event.target.closest?.(CONTROL_SELECTOR);
    if (control) validateControl(control);

    const otpInput = event.target.closest?.('.auth-otp-input');
    const otpForm = otpInput?.closest?.(FORM_SELECTOR);
    if (otpForm) validateOtp(otpForm);
  });

  document.addEventListener('change', (event) => {
    const control = event.target.closest?.(CONTROL_SELECTOR);
    if (control) validateControl(control);
  });

  window.SIMRSAuthValidation = { validateForm, validateControl };
})();
