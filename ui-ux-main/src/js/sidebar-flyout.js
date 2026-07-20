(function () {
  const sidebarGroups = Array.from(document.querySelectorAll('.app-sidebar details.nav-group'));

  if (!sidebarGroups.length) return;

  function getLayout(group) {
    return group.closest('.layout-preview');
  }

  function getSidebar(group) {
    return group.closest('.app-sidebar');
  }

  function isCollapsed(group) {
    const layout = getLayout(group);
    const sidebar = getSidebar(group);
    return Boolean(
      (sidebar && sidebar.classList.contains('compact')) ||
      (layout && layout.classList.contains('is-sidebar-collapsed'))
    );
  }

  function setFlyoutTitle(group) {
    const subnav = group.querySelector(':scope > .subnav');
    const summary = group.querySelector(':scope > .nav-summary');
    if (!subnav || !summary) return;

    const label = summary.querySelector('.nav-label');
    const title = (label && label.textContent.trim()) || summary.getAttribute('data-tooltip') || 'Menu';
    subnav.setAttribute('data-flyout-title', title);
  }

  function setFlyoutAnchor(group) {
    const subnav = group.querySelector(':scope > .subnav');
    const summary = group.querySelector(':scope > .nav-summary');
    if (!subnav || !summary) return;

    const summaryRect = summary.getBoundingClientRect();
    subnav.style.setProperty('--sidebar-flyout-left', summaryRect.right + 12 + 'px');
    subnav.style.setProperty('--sidebar-flyout-top', Math.max(16, summaryRect.top) + 'px');
  }

  function adjustFlyoutPosition(group) {
    const subnav = group.querySelector(':scope > .subnav');
    const summary = group.querySelector(':scope > .nav-summary');
    if (!subnav || !summary) return;

    const summaryRect = summary.getBoundingClientRect();
    let left = summaryRect.right + 12;
    let top = Math.max(16, summaryRect.top);

    subnav.style.setProperty('--sidebar-flyout-left', left + 'px');
    subnav.style.setProperty('--sidebar-flyout-top', top + 'px');

    window.requestAnimationFrame(function () {
      const rect = subnav.getBoundingClientRect();
      const viewportBottom = window.innerHeight - 16;
      const viewportTop = 16;

      if (rect.bottom > viewportBottom) {
        top -= rect.bottom - viewportBottom;
      }

      if (top < viewportTop) {
        top = viewportTop;
      }

      subnav.style.setProperty('--sidebar-flyout-left', left + 'px');
      subnav.style.setProperty('--sidebar-flyout-top', top + 'px');
    });
  }

  function closeGroup(group) {
    if (!group.classList.contains('is-flyout-open')) return;

    const wasOpenBeforeFlyout = group.dataset.wasOpenBeforeFlyout === 'true';

    group.classList.remove('is-flyout-open');
    group.removeAttribute('data-was-open-before-flyout');
    const subnav = group.querySelector(':scope > .subnav');
    if (subnav) {
      subnav.style.removeProperty('--sidebar-flyout-left');
      subnav.style.removeProperty('--sidebar-flyout-top');
    }

    if (!wasOpenBeforeFlyout) {
      group.removeAttribute('open');
    }
  }

  function closeOtherGroups(activeGroup) {
    sidebarGroups.forEach(function (group) {
      if (group !== activeGroup) closeGroup(group);
    });
  }

  function closeAllFlyouts() {
    sidebarGroups.forEach(closeGroup);
  }

  function openGroup(group) {
    const subnav = group.querySelector(':scope > .subnav');
    if (!subnav || !isCollapsed(group)) return;

    closeOtherGroups(group);

    if (!group.classList.contains('is-flyout-open')) {
      group.dataset.wasOpenBeforeFlyout = group.hasAttribute('open') ? 'true' : 'false';
    }

    group.setAttribute('open', '');
    setFlyoutAnchor(group);
    group.classList.add('is-flyout-open');
    adjustFlyoutPosition(group);
  }

  sidebarGroups.forEach(function (group) {
    const subnav = group.querySelector(':scope > .subnav');
    const summary = group.querySelector(':scope > .nav-summary');
    let closeTimer = null;

    if (!subnav || !summary) return;

    setFlyoutTitle(group);

    group.addEventListener('mouseenter', function () {
      if (!isCollapsed(group)) return;
      window.clearTimeout(closeTimer);
      openGroup(group);
    });

    group.addEventListener('mouseleave', function () {
      if (!isCollapsed(group) && !group.classList.contains('is-flyout-open')) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(function () {
        closeGroup(group);
      }, 120);
    });

    group.addEventListener('focusin', function () {
      if (!isCollapsed(group)) return;
      window.clearTimeout(closeTimer);
      openGroup(group);
    });

    group.addEventListener('focusout', function (event) {
      if (group.contains(event.relatedTarget)) return;
      if (!isCollapsed(group) && !group.classList.contains('is-flyout-open')) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(function () {
        closeGroup(group);
      }, 120);
    });

    summary.addEventListener('click', function (event) {
      if (!isCollapsed(group)) {
        closeAllFlyouts();
        return;
      }

      event.preventDefault();
      window.clearTimeout(closeTimer);

      if (group.classList.contains('is-flyout-open')) {
        closeGroup(group);
      } else {
        openGroup(group);
      }
    });
  });

  document.addEventListener('click', function (event) {
    if (event.target.closest('.app-sidebar details.nav-group')) return;
    closeAllFlyouts();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    closeAllFlyouts();
  });

  window.addEventListener('resize', function () {
    sidebarGroups.forEach(function (group) {
      if (!group.classList.contains('is-flyout-open')) return;

      if (isCollapsed(group)) {
        adjustFlyoutPosition(group);
      } else {
        closeGroup(group);
      }
    });
  });

  const sidebarObserver = new MutationObserver(function () {
    sidebarGroups.forEach(function (group) {
      if (!isCollapsed(group)) closeGroup(group);
    });
  });

  document.querySelectorAll('.layout-preview, .app-sidebar').forEach(function (element) {
    sidebarObserver.observe(element, { attributes: true, attributeFilter: ['class'] });
  });
})();
