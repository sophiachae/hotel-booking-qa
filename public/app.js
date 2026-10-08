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
};
