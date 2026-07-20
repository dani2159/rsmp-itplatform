(function () {
  const STORAGE_KEY = 'simrs.floatingBottomTabs.v1';
  const ACTIVE_KEY = 'simrs.floatingBottomTabs.activeKey.v1';
  const MAX_TABS = 10;
  const TEMPORARILY_HIDE_FLOATING_BOTTOM_TABS = true;

  const MENU_LINK_SELECTOR = [
    '.app-sidebar a[href]',
    '.topnav-main a[href]',
    '.brand-lockup[href]',
    '.mobile-header-brand[href]',
    '.topnav-brand[href]',
    '.shortcut-card[href]'
  ].join(',');

  const IGNORED_HREF_PATTERN = /^(javascript:|mailto:|tel:)/i;

  function isUsableHref(href) {
    return href && !IGNORED_HREF_PATTERN.test(href.trim());
  }

  function cleanText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .replace(/\s*›\s*/g, ' ')
      .trim();
  }

  function getCurrentPathKey() {
    return `path:${window.location.pathname.split('/').pop() || window.location.pathname}`;
  }

  function resolvePathKeyFromHref(href) {
    try {
      const url = new URL(href, window.location.href);
      return `path:${url.pathname.split('/').pop() || url.pathname}`;
    } catch (error) {
      return null;
    }
  }

  function getIconClass(link) {
    const icon = link.querySelector('i[class*="fa-"]');
    if (!icon) return 'fa-regular fa-window-maximize';
    return Array.from(icon.classList)
      .filter((className) => className.startsWith('fa-'))
      .join(' ') || 'fa-regular fa-window-maximize';
  }

  function getLabelFromLink(link) {
    const directLabel = link.querySelector('.nav-label, .shortcut-title, .shortcut-copy, .topnav-link span, .topnav-menu-row span');
    const label = cleanText(directLabel ? directLabel.textContent : link.textContent);
    if (label) return label;
    return cleanText(link.getAttribute('aria-label')) || 'Menu';
  }

  function getCurrentLabel() {
    const activeMenu = document.querySelector('.nav-subitem.active, .nav-item.active, .topnav-link.active');
    if (activeMenu) {
      const activeLabel = getLabelFromLink(activeMenu);
      if (activeLabel) return activeLabel;
    }

    const pageTitle = cleanText((document.title || '').split('·')[0]);
    return pageTitle || 'Dashboard';
  }

  function normalizeTabFromLink(link) {
    const rawHref = link.getAttribute('href') || '';
    if (!isUsableHref(rawHref)) return null;

    const isPlaceholder = rawHref === '#' || rawHref.startsWith('#');
    const route = link.dataset.route || '';
    const label = getLabelFromLink(link);
    const iconClass = getIconClass(link);

    if (isPlaceholder) {
      const key = route ? `route:${route}` : `virtual:${label.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`;
      return { key, label, href: '#', iconClass, virtual: true };
    }

    const key = resolvePathKeyFromHref(rawHref);
    if (!key) return null;

    const absoluteHref = new URL(rawHref, window.location.href).href;
    return { key, label, href: absoluteHref, iconClass, virtual: false };
  }

  function getCurrentTab() {
    return {
      key: getCurrentPathKey(),
      label: getCurrentLabel(),
      href: window.location.href,
      iconClass: getCurrentPageIconClass(),
      virtual: false
    };
  }

  function getCurrentPageIconClass() {
    const activeMenu = document.querySelector('.nav-subitem.active, .nav-item.active, .topnav-link.active');
    if (activeMenu) return getIconClass(activeMenu);

    const title = document.title.toLowerCase();
    if (title.includes('pendaftaran')) return 'fa-solid fa-user-plus';
    if (title.includes('tarif')) return 'fa-solid fa-tags';
    if (title.includes('unit')) return 'fa-regular fa-hospital';
    if (title.includes('user') || title.includes('pengguna')) return 'fa-regular fa-user';
    if (title.includes('kamar')) return 'fa-solid fa-bed';
    if (title.includes('penjamin')) return 'fa-regular fa-id-card';
    if (title.includes('printer')) return 'fa-solid fa-print';
    return 'fa-regular fa-window-maximize';
  }

  function readTabs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((tab) => tab && tab.key && tab.label) : [];
    } catch (error) {
      return [];
    }
  }

  function writeTabs(tabs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.slice(-MAX_TABS)));
  }

  function getActiveKey() {
    return localStorage.getItem(ACTIVE_KEY) || getCurrentPathKey();
  }

  function setActiveKey(key) {
    if (key) localStorage.setItem(ACTIVE_KEY, key);
  }

  function upsertTab(tab, makeActive) {
    if (!tab) return;
    const tabs = readTabs();
    const existingIndex = tabs.findIndex((item) => item.key === tab.key);

    if (existingIndex >= 0) {
      tabs[existingIndex] = { ...tabs[existingIndex], ...tab };
    } else {
      tabs.push(tab);
    }

    writeTabs(tabs.slice(-MAX_TABS));
    if (makeActive) setActiveKey(tab.key);
    renderTabs();
  }

  function ensureCurrentTab() {
    const currentTab = getCurrentTab();
    const tabs = readTabs();
    if (!tabs.length || !tabs.some((tab) => tab.key === currentTab.key)) {
      tabs.unshift(currentTab);
      writeTabs(tabs);
    }
    setActiveKey(currentTab.key);
  }

  function createTabElement(tab, tabs) {
    const isActive = tab.key === getActiveKey();
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `floating-bottom-tab${isActive ? ' is-active' : ''}`;
    item.setAttribute('data-tab-key', tab.key);
    item.setAttribute('title', tab.label);
    item.setAttribute('aria-label', `Buka tab ${tab.label}`);

    const icon = document.createElement('span');
    icon.className = 'floating-bottom-tab-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<i class="${tab.iconClass || 'fa-regular fa-window-maximize'}"></i>`;

    const label = document.createElement('span');
    label.className = 'floating-bottom-tab-label';
    label.textContent = tab.label;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'floating-bottom-tab-close';
    close.setAttribute('aria-label', `Tutup tab ${tab.label}`);
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    close.disabled = tabs.length <= 1;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.key);
    });

    item.append(icon, label, close);
    item.addEventListener('click', () => activateTab(tab));
    return item;
  }

  function renderTabs() {
    let root = document.getElementById('floatingBottomTabs');
    if (!root) {
      root = document.createElement('div');
      root.id = 'floatingBottomTabs';
      root.className = 'floating-bottom-tabs';
      root.setAttribute('aria-label', 'Tab menu yang sedang dibuka');
      document.body.appendChild(root);
    }

    if (TEMPORARILY_HIDE_FLOATING_BOTTOM_TABS) {
      root.style.display = 'none';
      root.innerHTML = '';
      document.body.classList.remove('has-floating-bottom-tabs');
      return;
    }

    const tabs = readTabs();
    if (!tabs.length) {
      root.remove();
      document.body.classList.remove('has-floating-bottom-tabs');
      return;
    }

    document.body.classList.add('has-floating-bottom-tabs');
    root.innerHTML = '';

    const shell = document.createElement('div');
    shell.className = 'floating-bottom-tabs-shell';

    const home = document.createElement('button');
    home.type = 'button';
    home.className = 'floating-bottom-tabs-home';
    home.setAttribute('aria-label', 'Buka dashboard');
    home.innerHTML = '<i class="fa-solid fa-house-medical" aria-hidden="true"></i>';
    home.addEventListener('click', () => {
      const dashboardHref = findDashboardHref();
      const homeTab = {
        key: resolvePathKeyFromHref(dashboardHref) || 'path:30-dashboard.html',
        label: 'Dashboard',
        href: new URL(dashboardHref, window.location.href).href,
        iconClass: 'fa-solid fa-gauge-high',
        virtual: false
      };
      upsertTab(homeTab, true);
      window.location.href = homeTab.href;
    });

    const list = document.createElement('div');
    list.className = 'floating-bottom-tabs-list';
    list.setAttribute('role', 'tablist');
    tabs.forEach((tab) => list.appendChild(createTabElement(tab, tabs)));

    shell.append(home, list);
    root.appendChild(shell);

    const active = list.querySelector('.floating-bottom-tab.is-active');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function activateTab(tab) {
    setActiveKey(tab.key);
    renderTabs();
    if (!tab.virtual && tab.href && tab.href !== window.location.href) {
      window.location.href = tab.href;
    }
  }

  function closeTab(key) {
    const tabs = readTabs();
    if (tabs.length <= 1) return;

    const currentActiveKey = getActiveKey();
    const closedIndex = tabs.findIndex((tab) => tab.key === key);
    const filtered = tabs.filter((tab) => tab.key !== key);
    writeTabs(filtered);

    if (key === currentActiveKey) {
      const nextTab = filtered[Math.max(0, closedIndex - 1)] || filtered[0];
      if (nextTab) {
        setActiveKey(nextTab.key);
        if (!nextTab.virtual && nextTab.href) {
          window.location.href = nextTab.href;
          return;
        }
      }
    }

    renderTabs();
  }

  function findDashboardHref() {
    const dashboardLink = document.querySelector('a[href$="30-dashboard.html"]');
    return dashboardLink ? dashboardLink.getAttribute('href') : '../dashboard/30-dashboard.html';
  }

  function handleMenuClick(event) {
    const link = event.target.closest(MENU_LINK_SELECTOR);
    if (!link) return;

    const dropdownLogout = link.closest('.dropdown-panel');
    if (dropdownLogout && /keluar|logout/i.test(link.textContent || '')) return;

    const tab = normalizeTabFromLink(link);
    if (!tab) return;

    upsertTab(tab, true);

    if (tab.virtual) {
      event.preventDefault();
    }
  }

  document.addEventListener('click', handleMenuClick, true);
  document.addEventListener('DOMContentLoaded', () => {
    ensureCurrentTab();
    renderTabs();
  });
})();
