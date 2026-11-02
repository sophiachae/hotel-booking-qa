const App = {
  param(name) {
    return new URLSearchParams(location.search).get(name);
  },

  stay() {
    return {
      checkIn: App.param('checkIn') || '',
      checkOut: App.param('checkOut') || '',
      guests: App.param('guests') || '',
    };
  },

  query(obj) {
    const params = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    return params.toString();
  },

  async api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || `요청에 실패했습니다. (${res.status})`);
      err.status = res.status;
      err.code = data && data.error && data.error.code;
      err.details = data && data.error && data.error.details;
      throw err;
    }
    return data;
  },

  won(n) {
    return Number(n).toLocaleString('ko-KR') + '원';
  },

  dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  nights(checkIn, checkOut) {
    const toUtc = (s) => {
      const [y, m, d] = s.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((toUtc(checkOut) - toUtc(checkIn)) / 86400000);
  },

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  },

  show(el, text) {
    if (text !== undefined) el.textContent = text;
    el.classList.remove('hidden');
  },

  hide(el) {
    el.classList.add('hidden');
  },

  $(testId) {
    return document.querySelector(`[data-testid="${testId}"]`);
  },

  me() {
    if (!App._mePromise) {
      App._mePromise = App.api('/api/auth/me')
        .then((data) => data.user)
        .catch(() => null);
    }
    return App._mePromise;
  },

  config() {
    if (!App._configPromise) {
      App._configPromise = App.api('/api/config').catch(() => ({ guestCheckout: true, loginProviders: ['email'] }));
    }
    return App._configPromise;
  },

  currentPath() {
    return location.pathname + location.search;
  },

  loginUrl(returnTo = App.currentPath()) {
    return 'login.html?' + App.query({ returnTo });
  },

  safeReturnTo(value) {
    const v = String(value || '');
    if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return '/index.html';
    return v;
  },

  async logout() {
    try {
      await App.api('/api/auth/logout', { method: 'POST' });
      await Analytics.logout();
    } finally {
      location.href = 'index.html';
    }
  },

  async renderNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const slot = document.createElement('span');
    slot.className = 'nav-auth';
    slot.dataset.testid = 'nav-auth';
    nav.appendChild(slot);

    const me = await App.me();
    if (me) {
      slot.innerHTML =
        `<span class="nav-user" data-testid="nav-user-name">${App.esc(me.name)}님</span>` +
        `<a href="#" data-testid="nav-logout">로그아웃</a>`;
      App.$('nav-logout').addEventListener('click', (e) => {
        e.preventDefault();
        App.logout();
      });
    } else if (!/\/(login|signup)\.html$/.test(location.pathname)) {
      slot.innerHTML = `<a href="${App.esc(App.loginUrl())}" data-testid="nav-login">로그인</a>`;
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.renderNav());
