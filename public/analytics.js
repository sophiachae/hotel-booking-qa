// PostHog 이벤트 트래킹. /api/config에 키가 없으면 아무것도 보내지 않는다.
// 이벤트 명세: docs/EVENTS.md
const Analytics = {
  PENDING_KEY: 'analytics:pending',
  OAUTH_KEY: 'analytics:oauthMethod',
  SENSITIVE_PARAMS: ['email', 'phone', 'name'],
  _enabled: null,

  ready() {
    if (!Analytics._readyPromise) Analytics._readyPromise = Analytics._init();
    return Analytics._readyPromise;
  },

  readyWithin(ms) {
    return Promise.race([Analytics.ready(), new Promise((resolve) => setTimeout(() => resolve(false), ms))]);
  },

  async _init() {
    const cfg = await App.config();
    const ph = cfg && cfg.posthog;
    if (!ph || !ph.key) {
      Analytics._enabled = false;
      Analytics._storage(() => sessionStorage.removeItem(Analytics.PENDING_KEY));
      return false;
    }
    Analytics._enabled = true;
    Analytics._loadSnippet();

    const loaded = await new Promise((resolve) => {
      window.posthog.init(ph.key, {
        api_host: ph.host,
        defaults: '2025-05-24',
        person_profiles: 'identified_only',
        autocapture: false,
        disable_session_recording: true,
        before_send: Analytics._scrub,
        loaded: () => resolve(true),
      });
      setTimeout(() => resolve(false), 5000);
    });
    if (!loaded) return false;

    await Analytics._syncUser();
    Analytics._flushPending();
    return true;
  },

  // posthog-js 공식 스니펫 (CDN에서 array.js를 비동기로 불러온다)
  _loadSnippet() {
    /* eslint-disable */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    /* eslint-enable */
  },

  // URL 쿼리에 들어간 개인정보(내 예약 조회 링크의 email 등)를 지운다
  _stripParams(url) {
    try {
      const u = new URL(url, location.origin);
      Analytics.SENSITIVE_PARAMS.forEach((k) => u.searchParams.delete(k));
      const returnTo = u.searchParams.get('returnTo');
      if (returnTo) u.searchParams.set('returnTo', Analytics._stripParams(returnTo));
      return /^https?:/i.test(url) ? u.toString() : u.pathname + u.search + u.hash;
    } catch (e) {
      return url;
    }
  },

  _scrub(event) {
    if (event && event.properties && event.properties.$current_url) {
      event.properties.$current_url = Analytics._stripParams(event.properties.$current_url);
    }
    return event;
  },

  // 로그인 상태와 PostHog 사용자를 맞춘다: 회원이면 identify, 세션이 끝났으면 reset
  async _syncUser() {
    const ph = window.posthog;
    const me = await App.me();
    const oauthMethod = Analytics._storage(() => sessionStorage.getItem(Analytics.OAUTH_KEY));
    Analytics._storage(() => sessionStorage.removeItem(Analytics.OAUTH_KEY));

    if (me) {
      const id = String(me.id);
      if (ph.get_distinct_id() !== id) ph.identify(id, { login_provider: String(me.provider).toLowerCase() });
      if (oauthMethod) ph.capture('login_completed', { method: oauthMethod }, { transport: 'sendBeacon' });
    } else if (ph.get_property('$user_state') === 'identified') {
      ph.reset();
    }
  },

  _storage(fn) {
    try {
      return fn();
    } catch (e) {
      return null;
    }
  },

  _flushPending() {
    const raw = Analytics._storage(() => sessionStorage.getItem(Analytics.PENDING_KEY));
    Analytics._storage(() => sessionStorage.removeItem(Analytics.PENDING_KEY));
    let items = [];
    try {
      items = JSON.parse(raw || '[]');
    } catch (e) {
      items = [];
    }
    items.forEach((item) => {
      window.posthog.capture(item.event, item.properties, { timestamp: new Date(item.at), transport: 'sendBeacon' });
    });
  },

  /** 현재 화면에서 바로 보내는 이벤트 */
  async track(event, properties = {}) {
    if (!(await Analytics.ready())) return;
    window.posthog.capture(event, properties);
  },

  /** 직후에 다른 화면으로 이동하는 이벤트: 저장해 두었다가 다음 화면에서 발생 시각과 함께 보낸다 */
  trackNext(event, properties = {}) {
    if (Analytics._enabled === false) return;
    Analytics._storage(() => {
      const items = JSON.parse(sessionStorage.getItem(Analytics.PENDING_KEY) || '[]');
      items.push({ event, properties: { ...properties, $current_url: location.href, $pathname: location.pathname }, at: Date.now() });
      sessionStorage.setItem(Analytics.PENDING_KEY, JSON.stringify(items));
    });
  },

  /** 소셜 로그인 버튼을 누를 때 방법을 기억해 두고, 돌아온 화면에서 login_completed를 보낸다 */
  rememberOAuth(method) {
    if (Analytics._enabled === false) return;
    Analytics._storage(() => sessionStorage.setItem(Analytics.OAUTH_KEY, method));
  },

  /** 서버 이벤트를 화면 이벤트와 같은 사용자로 묶기 위한 익명 ID (트래킹 꺼짐·로딩 전이면 빈 값) */
  distinctId() {
    if (!Analytics._enabled || !window.posthog || !window.posthog.__loaded) return '';
    return window.posthog.get_distinct_id() || '';
  },

  async logout() {
    if (!(await Analytics.readyWithin(1500))) return;
    window.posthog.reset();
    window.posthog.capture('logout', {}, { transport: 'sendBeacon' });
  },
};

Analytics.ready();
