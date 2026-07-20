(function () {
  const SIDEBAR_BREAKPOINT = 980;
  const TOPNAV_BREAKPOINT = 860;

  function isSidebarMobile() {
    return window.matchMedia(`(max-width: ${SIDEBAR_BREAKPOINT}px)`).matches;
  }

  function isTopnavMobile() {
    return window.matchMedia(`(max-width: ${TOPNAV_BREAKPOINT}px)`).matches;
  }

  function getOverlay() {
    let overlay = document.querySelector('[data-mobile-nav-overlay]');
    if (!overlay) {
      overlay = document.createElement('button');
      overlay.type = 'button';
      overlay.className = 'mobile-nav-overlay';
      overlay.dataset.mobileNavOverlay = '';
      overlay.setAttribute('aria-label', 'Tutup menu');
      document.body.appendChild(overlay);
      overlay.addEventListener('click', closeResponsiveNavigation);
    }
    return overlay;
  }

  function updateOverlay() {
    const overlay = getOverlay();
    const isOpen = document.body.classList.contains('is-mobile-sidebar-open') || document.body.classList.contains('is-topnav-menu-open');
    overlay.classList.toggle('is-open', isOpen);
  }

  function setSidebarCollapsed(isCollapsed) {
    const layout = document.getElementById('dashboardLayout') || document.querySelector('.dashboard-layout');
    const sidebar = document.getElementById('dashboardSidebar') || document.querySelector('.app-sidebar');
    const button = document.getElementById('dashboardSidebarButton');
    if (!layout || !sidebar || !button) return;

    layout.classList.toggle('is-sidebar-collapsed', isCollapsed);
    sidebar.classList.toggle('compact', isCollapsed);
    button.setAttribute('aria-expanded', String(!isCollapsed));
    button.setAttribute('aria-label', isCollapsed ? 'Buka sidebar' : 'Tutup sidebar');
  }

  function openMobileSidebar() {
    closeTopnavMenu();
    const sidebar = document.getElementById('dashboardSidebar') || document.querySelector('.app-sidebar');
    const button = document.getElementById('dashboardSidebarButton');
    if (!sidebar || !button) return;

    setSidebarCollapsed(false);
    document.body.classList.add('is-mobile-sidebar-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Tutup sidebar');
    updateOverlay();
  }

  function closeMobileSidebar() {
    const button = document.getElementById('dashboardSidebarButton');
    document.body.classList.remove('is-mobile-sidebar-open');
    if (button && isSidebarMobile()) {
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Buka sidebar');
    }
    updateOverlay();
  }

  function toggleMobileSidebar() {
    if (document.body.classList.contains('is-mobile-sidebar-open')) closeMobileSidebar();
    else openMobileSidebar();
  }

  function openTopnavMenu(button) {
    closeMobileSidebar();
    document.body.classList.add('is-topnav-menu-open');
    document.querySelectorAll('.topnav-mobile-btn').forEach((item) => {
      item.setAttribute('aria-expanded', 'true');
      item.setAttribute('aria-label', 'Tutup menu');
    });
    button?.setAttribute('aria-expanded', 'true');
    button?.setAttribute('aria-label', 'Tutup menu');
    updateOverlay();
  }

  function closeTopnavMenu() {
    document.body.classList.remove('is-topnav-menu-open');
    document.querySelectorAll('.topnav-main .topnav-dropdown.is-open').forEach((dropdown) => {
      dropdown.classList.remove('is-open');
      dropdown.querySelector('.topnav-link')?.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.topnav-main .topnav-submenu.is-open').forEach((submenu) => {
      submenu.classList.remove('is-open');
      submenu.querySelector(':scope > .topnav-menu-row')?.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.topnav-mobile-btn').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Buka menu');
    });
    updateOverlay();
  }

  function toggleTopnavMenu(button) {
    if (document.body.classList.contains('is-topnav-menu-open')) closeTopnavMenu();
    else openTopnavMenu(button);
  }

  function closeResponsiveNavigation() {
    closeMobileSidebar();
    closeTopnavMenu();
  }

  document.addEventListener('click', (event) => {
    const sidebarButton = event.target.closest('#dashboardSidebarButton');
    if (sidebarButton) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (isSidebarMobile()) toggleMobileSidebar();
      else {
        const sidebar = document.getElementById('dashboardSidebar') || document.querySelector('.app-sidebar');
        setSidebarCollapsed(!sidebar?.classList.contains('compact'));
      }
      return;
    }

    const topnavButton = event.target.closest('.topnav-mobile-btn');
    if (topnavButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleTopnavMenu(topnavButton);
      return;
    }

    const topnavTrigger = event.target.closest('.topnav-main .topnav-dropdown > .topnav-link');
    if (topnavTrigger && isTopnavMobile()) {
      const dropdown = topnavTrigger.closest('.topnav-dropdown');
      if (!dropdown) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const shouldOpen = !dropdown.classList.contains('is-open');
      dropdown.parentElement?.querySelectorAll('.topnav-dropdown.is-open').forEach((item) => {
        if (item !== dropdown) {
          item.classList.remove('is-open');
          item.querySelector('.topnav-link')?.setAttribute('aria-expanded', 'false');
        }
      });
      dropdown.classList.toggle('is-open', shouldOpen);
      topnavTrigger.setAttribute('aria-expanded', String(shouldOpen));
      return;
    }

    const topnavSubmenuTrigger = event.target.closest('.topnav-main .topnav-submenu > .topnav-menu-row');
    if (topnavSubmenuTrigger && isTopnavMobile()) {
      const submenu = topnavSubmenuTrigger.closest('.topnav-submenu');
      const panel = submenu?.querySelector(':scope > .topnav-submenu-panel');
      if (!submenu || !panel) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const shouldOpen = !submenu.classList.contains('is-open');
      submenu.parentElement?.querySelectorAll(':scope > .topnav-submenu.is-open').forEach((item) => {
        if (item !== submenu) {
          item.classList.remove('is-open');
          item.querySelector(':scope > .topnav-menu-row')?.setAttribute('aria-expanded', 'false');
        }
      });
      submenu.classList.toggle('is-open', shouldOpen);
      topnavSubmenuTrigger.setAttribute('aria-expanded', String(shouldOpen));
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (!isSidebarMobile() || !document.body.classList.contains('is-mobile-sidebar-open')) return;
    if (event.target.closest('.app-sidebar') || event.target.closest('#dashboardSidebarButton')) return;
    closeMobileSidebar();
  });

  document.addEventListener('click', (event) => {
    if (!isTopnavMobile() || !document.body.classList.contains('is-topnav-menu-open')) return;
    if (event.target.closest('.topnav-main') || event.target.closest('.topnav-mobile-btn')) return;
    closeTopnavMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeResponsiveNavigation();
  });

  window.addEventListener('resize', () => {
    if (!isSidebarMobile()) closeMobileSidebar();
    if (!isTopnavMobile()) closeTopnavMenu();
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.topnav-mobile-btn').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll('.topnav-main .topnav-submenu > .topnav-menu-row').forEach((trigger) => {
      const hasPanel = trigger.closest('.topnav-submenu')?.querySelector(':scope > .topnav-submenu-panel');
      if (!hasPanel) return;
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    });
    if (isSidebarMobile()) {
      document.getElementById('dashboardSidebarButton')?.setAttribute('aria-expanded', 'false');
    }
  });
})();
