function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

const posthogKey = String(process.env.POSTHOG_KEY || '').trim();

module.exports = {
  guestCheckout: flag(process.env.GUEST_CHECKOUT, true),
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES) > 0 ? Number(process.env.SESSION_TTL_MINUTES) : 60 * 24 * 7,
  loginProviders: ['email', 'kakao', 'google'],
  // 키가 없으면 트래킹을 끈다 (테스트·CI 기본값)
  posthog: posthogKey
    ? { key: posthogKey, host: String(process.env.POSTHOG_HOST || '').trim() || 'https://eu.i.posthog.com' }
    : null,
};
