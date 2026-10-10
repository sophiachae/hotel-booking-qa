function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

module.exports = {
  guestCheckout: flag(process.env.GUEST_CHECKOUT, true),
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES) > 0 ? Number(process.env.SESSION_TTL_MINUTES) : 60 * 24 * 7,
  loginProviders: ['email', 'kakao', 'google'],
};
