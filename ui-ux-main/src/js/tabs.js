(() => {
  function setActiveTab(tabsRoot, activeButton) {
    const buttons = Array.from(tabsRoot.querySelectorAll('[role="tab"][data-tab-target]'));
    const panels = Array.from(tabsRoot.querySelectorAll('.tab-panel'));

    buttons.forEach((button) => {
      const isActive = button === activeButton;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach((panel) => {
      const targetId = activeButton.dataset.tabTarget;
      panel.hidden = panel.id !== targetId;
    });
  }

  function moveFocus(tabsRoot, currentButton, direction) {
    const buttons = Array.from(tabsRoot.querySelectorAll('[role="tab"][data-tab-target]:not(:disabled)'));
    if (!buttons.length) return;

    const currentIndex = buttons.indexOf(currentButton);
    const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
    setActiveTab(tabsRoot, buttons[nextIndex]);
  }

  document.querySelectorAll('[data-tabs]').forEach((tabsRoot) => {
    const buttons = Array.from(tabsRoot.querySelectorAll('[role="tab"][data-tab-target]'));
    if (!buttons.length) return;

    const selectedButton = buttons.find((button) => button.getAttribute('aria-selected') === 'true') || buttons[0];
    setActiveTab(tabsRoot, selectedButton);

    buttons.forEach((button) => {
      button.addEventListener('click', () => setActiveTab(tabsRoot, button));
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(tabsRoot, button, 1);
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(tabsRoot, button, -1);
        }
      });
    });
  });
})();
