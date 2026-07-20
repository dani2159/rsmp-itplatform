(() => {
  const SWITCH_SELECTOR = '.switch';
  const CHECKBOX_SELECTOR = 'input[type="checkbox"]';

  function getSwitch(target) {
    if (!target) return null;
    if (target.matches?.(SWITCH_SELECTOR)) return target;
    return target.closest?.(SWITCH_SELECTOR) || null;
  }

  function getInput(switchControl) {
    return switchControl?.querySelector?.(CHECKBOX_SELECTOR) || null;
  }

  function readInitialState(switchControl) {
    const input = getInput(switchControl);
    if (input) return input.checked;
    if (switchControl.hasAttribute('aria-pressed')) return switchControl.getAttribute('aria-pressed') === 'true';
    if (switchControl.hasAttribute('aria-checked')) return switchControl.getAttribute('aria-checked') === 'true';
    return switchControl.classList.contains('on');
  }

  function updateStateLabel(switchControl, checked) {
    const label = switchControl.querySelector('[data-switch-state]');
    if (!label) return;
    label.textContent = checked
      ? (label.dataset.onText || 'Aktif')
      : (label.dataset.offText || 'Nonaktif');
  }

  function setState(target, checked, options = {}) {
    const switchControl = getSwitch(target);
    if (!switchControl) return;
    const input = getInput(switchControl);
    const nextState = Boolean(checked);

    switchControl.classList.toggle('on', nextState);
    switchControl.dataset.state = nextState ? 'on' : 'off';
    switchControl.setAttribute('aria-checked', nextState ? 'true' : 'false');
    if (switchControl.matches('button')) {
      switchControl.setAttribute('aria-pressed', nextState ? 'true' : 'false');
    }
    updateStateLabel(switchControl, nextState);

    if (input && input.checked !== nextState) {
      input.checked = nextState;
      if (options.emit) input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function sync(target) {
    const switchControl = getSwitch(target);
    if (!switchControl) return;
    setState(switchControl, readInitialState(switchControl));
  }

  function toggle(switchControl) {
    if (!switchControl || switchControl.matches('[aria-disabled="true"]')) return;
    const input = getInput(switchControl);
    if (input?.disabled) return;
    setState(switchControl, !readInitialState(switchControl), { emit: Boolean(input) });
  }

  function enhance(root = document) {
    root.querySelectorAll(SWITCH_SELECTOR).forEach((switchControl) => {
      const input = getInput(switchControl);
      const track = switchControl.querySelector('.switch-track');

      if (track) track.setAttribute('aria-hidden', 'true');
      if (input) {
        input.setAttribute('role', 'switch');
        if (!input.id && switchControl.dataset.switchName) input.id = switchControl.dataset.switchName;
      } else {
        switchControl.setAttribute('role', 'switch');
        if (!switchControl.matches('button') && !switchControl.hasAttribute('tabindex')) {
          switchControl.setAttribute('tabindex', '0');
        }
      }

      sync(switchControl);
    });
  }

  document.addEventListener('change', (event) => {
    if (event.target.matches(`${SWITCH_SELECTOR} ${CHECKBOX_SELECTOR}`)) {
      sync(event.target);
    }
  });

  document.addEventListener('click', (event) => {
    const switchControl = getSwitch(event.target);
    if (!switchControl) return;

    const hasNativeInput = Boolean(getInput(switchControl));
    if (hasNativeInput && switchControl.matches('label')) return;
    if (event.target.closest('input, select, textarea, a')) return;

    if (!hasNativeInput || switchControl.matches('button')) {
      event.preventDefault();
      toggle(switchControl);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const switchControl = getSwitch(event.target);
    if (!switchControl || getInput(switchControl)) return;
    event.preventDefault();
    toggle(switchControl);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhance());
  } else {
    enhance();
  }

  window.SIMRSSwitch = { enhance, sync, setState, toggle };
})();
