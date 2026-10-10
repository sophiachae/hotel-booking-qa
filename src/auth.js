const crypto = require('crypto');
const express = require('express');
const { db } = require('./db');
const u = require('./utils');
const config = require('./config');
const { hashPassword, verifyPassword } = require('./password');
const mockOAuth = require('./mockOAuth');

const SESSION_COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_PATH = '/api/auth/oauth';
const OAUTH_PROVIDERS = { kakao: 'KAKAO', google: 'GOOGLE' };
const PROVIDER_LABELS = { EMAIL: '이메일', KAKAO: '카카오', GOOGLE: '구글' };

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(raw);
    } catch (e) {
      out[key] = raw;
    }
  });
  return out;
}

function userDto(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    provider: row.provider,
    createdAt: row.created_at,
  };
}

const selectSessionUser = db.prepare(`
  SELECT u.* FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ?
`);
const selectUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const selectUserByProvider = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_user_id = ?');
const insertUser = db.prepare(`
  INSERT INTO users (email, password_hash, name, phone, provider, provider_user_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function readToken(req) {
  const match = String(req.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (match) return match[1];
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

function attachUser(req, res, next) {
  req.user = null;
  const token = readToken(req);
  if (token) {
    const row = selectSessionUser.get(token, new Date().toISOString());
    if (row) {
      req.user = userDto(row);
      req.sessionToken = token;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return next(u.unauthorized());
  next();
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const ttlMs = config.sessionTtlMinutes * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now.toISOString(),
    new Date(now.getTime() + ttlMs).toISOString()
  );
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: ttlMs });
  return token;
}

function safeReturnTo(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return '/index.html';
  return v;
}

function emailTakenError(existing) {
  const message =
    existing.provider === 'EMAIL'
      ? '이미 가입된 이메일입니다.'
      : `이미 ${PROVIDER_LABELS[existing.provider]} 계정으로 가입된 이메일입니다.`;
  return u.conflict(message, 'EMAIL_TAKEN');
}

const router = express.Router();

router.post('/signup', (req, res) => {
  const body = u.asObject(req.body);
  const name = u.asTrimmedString(body.name);
  const email = u.asTrimmedString(body.email);
  const phone = u.asTrimmedString(body.phone);
  const password = typeof body.password === 'string' ? body.password : '';

  const errors = {};
  if (!name) errors.name = '이름은 필수입니다.';
  else if (name.length > u.MAX_NAME_LENGTH) errors.name = `이름은 ${u.MAX_NAME_LENGTH}자 이하여야 합니다.`;
  if (!email) errors.email = '이메일은 필수입니다.';
  else if (!u.EMAIL_RE.test(email)) errors.email = '이메일 형식이 올바르지 않습니다.';
  if (!password) errors.password = '비밀번호는 필수입니다.';
  else if (!u.PASSWORD_RE.test(password)) errors.password = '비밀번호는 영문과 숫자를 포함한 8~64자여야 합니다.';
  if (phone && !u.PHONE_RE.test(phone)) errors.phone = '전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)';
  if (Object.keys(errors).length > 0) throw u.badRequest('입력값을 확인해 주세요.', errors);

  const existing = selectUserByEmail.get(email);
  if (existing) throw emailTakenError(existing);

  const { lastInsertRowid } = insertUser.run(
    email,
    hashPassword(password),
    name,
    phone || null,
    'EMAIL',
    null,
    new Date().toISOString()
  );
  const token = startSession(res, lastInsertRowid);
  res.status(201).json({ user: userDto(selectUserById.get(lastInsertRowid)), token });
});

router.post('/login', (req, res) => {
  const body = u.asObject(req.body);
  const email = u.asTrimmedString(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  const errors = {};
  if (!email) errors.email = '이메일은 필수입니다.';
  if (!password) errors.password = '비밀번호는 필수입니다.';
  if (Object.keys(errors).length > 0) throw u.badRequest('입력값을 확인해 주세요.', errors);

  const user = selectUserByEmail.get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw u.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.', 'INVALID_CREDENTIALS');
  }
  const token = startSession(res, user.id);
  res.json({ user: userDto(user), token });
});

router.post('/logout', (req, res) => {
  if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.get('/oauth/:provider/start', (req, res) => {
  const { provider } = req.params;
  if (!OAUTH_PROVIDERS[provider]) throw u.notFound('지원하지 않는 로그인 채널입니다.');

  const state = crypto.randomBytes(16).toString('hex');
  const returnTo = safeReturnTo(req.query.returnTo);
  res.cookie(STATE_COOKIE, JSON.stringify({ state, provider, returnTo }), {
    httpOnly: true,
    sameSite: 'lax',
    path: STATE_COOKIE_PATH,
    maxAge: 10 * 60 * 1000,
  });

  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/oauth/${provider}/callback`;
  const params = new URLSearchParams({
    client_id: mockOAuth.CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'profile email',
    state,
  });
  res.redirect(`/mock-oauth/${provider}/authorize?${params}`);
});

router.get('/oauth/:provider/callback', (req, res) => {
  const { provider } = req.params;
  if (!OAUTH_PROVIDERS[provider]) throw u.notFound('지원하지 않는 로그인 채널입니다.');

  let saved = null;
  try {
    saved = JSON.parse(parseCookies(req.headers.cookie)[STATE_COOKIE] || 'null');
  } catch (e) {
    saved = null;
  }
  res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });

  const fail = (code, extra = {}) => {
    res.locals.logLevel = 'ERROR';
    res.locals.logResult = `OAUTH_FAILED: ${code}`;
    const params = new URLSearchParams({ error: code, ...extra });
    if (saved && saved.returnTo) params.set('returnTo', saved.returnTo);
    return res.redirect(`/login.html?${params}`);
  };

  if (req.query.error) return fail('OAUTH_CANCELLED');
  if (!saved || !req.query.state || saved.state !== req.query.state || saved.provider !== provider) {
    return fail('INVALID_STATE');
  }

  const profile = mockOAuth.exchangeCode(provider, String(req.query.code || ''));
  if (!profile) return fail('INVALID_CODE');
  if (!profile.email) return fail('EMAIL_CONSENT_REQUIRED');

  const providerKey = OAUTH_PROVIDERS[provider];
  let user = selectUserByProvider.get(providerKey, profile.id);
  if (!user) {
    const existing = selectUserByEmail.get(profile.email);
    if (existing) return fail('ACCOUNT_EXISTS', { provider: existing.provider });
    const { lastInsertRowid } = insertUser.run(
      profile.email,
      null,
      profile.name,
      null,
      providerKey,
      profile.id,
      new Date().toISOString()
    );
    user = selectUserById.get(lastInsertRowid);
  }

  startSession(res, user.id);
  res.locals.logResult = `userId=${user.id} provider=${providerKey}`;
  res.redirect(saved.returnTo);
});

module.exports = { router, attachUser, requireAuth, userDto };
