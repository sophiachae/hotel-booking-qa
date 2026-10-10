const crypto = require('crypto');
const express = require('express');
const { EMAIL_RE, MAX_NAME_LENGTH } = require('./utils');
const logger = require('./logger');

const CLIENT_ID = 'mini-hotel-local';
const CODE_TTL_MS = 60 * 1000;

const PROVIDERS = {
  kakao: {
    label: '카카오',
    accent: '#f2cf2f',
    emailConsentOptional: true,
    accounts: [
      { id: 'kakao-1001', name: '카카오테스터', email: 'kakao.tester@kakao.test' },
      { id: 'kakao-1002', name: '카카오둘', email: 'kakao.second@kakao.test' },
    ],
  },
  google: {
    label: '구글',
    accent: '#4c8bf5',
    emailConsentOptional: false,
    accounts: [
      { id: 'google-2001', name: 'Google Tester', email: 'google.tester@gmail.test' },
      { id: 'google-2002', name: '구글둘', email: 'google.second@gmail.test' },
    ],
  },
};

const codes = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function validateAuthorizeRequest(req, provider, params) {
  if (!PROVIDERS[provider]) return '지원하지 않는 provider입니다.';
  if (params.client_id !== CLIENT_ID) return 'client_id가 올바르지 않습니다.';
  if (!params.state) return 'state 값이 없습니다.';
  let url;
  try {
    url = new URL(params.redirect_uri);
  } catch (e) {
    return 'redirect_uri가 올바르지 않습니다.';
  }
  if (url.host !== req.get('host') || url.pathname !== `/api/auth/oauth/${provider}/callback`) {
    return 'redirect_uri가 등록된 주소와 다릅니다.';
  }
  return null;
}

function redirectWith(res, redirectUri, params) {
  const url = new URL(redirectUri);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  res.redirect(url.toString());
}

function page(provider, params, error) {
  const p = PROVIDERS[provider];
  const hidden = ['client_id', 'redirect_uri', 'state']
    .map((k) => `<input type="hidden" name="${k}" value="${esc(params[k])}">`)
    .join('');
  const consent = p.emailConsentOptional
    ? `<label class="consent"><input type="checkbox" id="consent" checked data-testid="mock-consent-email"> [선택] 이메일 제공 동의</label>`
    : '';
  const accounts = p.accounts
    .map((a) => `
      <button type="submit" name="account_id" value="${a.id}" class="account" data-testid="mock-account-${a.id}">
        <strong>${esc(a.name)}</strong><span>${esc(a.email)}</span>
      </button>`)
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock ${p.label} 로그인 (테스트용)</title>
<style>
  body { margin: 0; font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; background: #eef0f2; color: #222; }
  .banner { background: #333; color: #fff; font-size: 13px; padding: 10px 16px; text-align: center; }
  .box { max-width: 420px; margin: 32px auto; background: #fff; border-radius: 10px; border-top: 6px solid ${p.accent}; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin: 0 0 18px; }
  .account { display: flex; flex-direction: column; align-items: flex-start; width: 100%; padding: 12px 14px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; cursor: pointer; font: inherit; text-align: left; }
  .account:hover { border-color: #999; }
  .account span { color: #666; font-size: 13px; }
  .consent { display: block; font-size: 14px; margin: 4px 0 14px; }
  hr { border: none; border-top: 1px solid #eee; margin: 18px 0; }
  label.f { display: block; font-size: 13px; font-weight: 600; margin: 8px 0 4px; }
  input[type=text], input[type=email] { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
  .btn { margin-top: 12px; padding: 10px 16px; border: none; border-radius: 6px; background: #333; color: #fff; font: inherit; cursor: pointer; }
  .btn.ghost { background: #fff; color: #333; border: 1px solid #bbb; }
  .error { background: #fdecea; color: #b3261e; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin-bottom: 14px; }
</style>
</head>
<body data-testid="mock-oauth-page" data-provider="${provider}">
  <div class="banner">로컬 테스트용 Mock OAuth 서버입니다. 실제 ${p.label} 계정·서비스와 연결되지 않습니다.</div>
  <div class="box">
    <h1>${p.label} 로그인 (Mock)</h1>
    <p class="sub">미니 호텔이 계정 정보(이름, 이메일) 제공을 요청합니다.</p>
    ${error ? `<div class="error" data-testid="mock-error">${esc(error)}</div>` : ''}
    ${consent}
    <form method="post" class="consent-form" data-testid="mock-account-form">
      ${hidden}
      <input type="hidden" name="consent_email" value="on">
      ${accounts}
      <button type="submit" name="action" value="cancel" class="btn ghost" data-testid="mock-cancel">취소</button>
    </form>
    <hr>
    <form method="post" class="consent-form" data-testid="mock-custom-form">
      ${hidden}
      <input type="hidden" name="consent_email" value="on">
      <input type="hidden" name="action" value="custom">
      <div class="sub" style="margin:0">다른 테스트 계정으로 로그인</div>
      <label class="f" for="cname">이름</label>
      <input type="text" id="cname" name="name" maxlength="${MAX_NAME_LENGTH}" data-testid="mock-custom-name">
      <label class="f" for="cemail">이메일</label>
      <input type="email" id="cemail" name="email" data-testid="mock-custom-email">
      <button type="submit" class="btn" data-testid="mock-custom-submit">이 계정으로 계속</button>
    </form>
  </div>
  <script>
    document.querySelectorAll('.consent-form').forEach(function (form) {
      form.addEventListener('submit', function () {
        var box = document.getElementById('consent');
        form.querySelector('[name=consent_email]').value = !box || box.checked ? 'on' : 'off';
      });
    });
  </script>
</body>
</html>`;
}

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

router.get('/:provider/authorize', (req, res) => {
  const { provider } = req.params;
  const error = validateAuthorizeRequest(req, provider, req.query);
  if (error) {
    logger.error(`MOCK-OAUTH GET /mock-oauth/${provider}/authorize rejected: ${error}`);
    return res.status(400).type('html').send(`<p data-testid="mock-error">잘못된 인증 요청: ${esc(error)}</p>`);
  }
  res.type('html').send(page(provider, req.query));
});

router.post('/:provider/authorize', (req, res) => {
  const { provider } = req.params;
  const body = req.body || {};
  const error = validateAuthorizeRequest(req, provider, body);
  if (error) {
    logger.error(`MOCK-OAUTH POST /mock-oauth/${provider}/authorize rejected: ${error}`);
    return res.status(400).type('html').send(`<p data-testid="mock-error">잘못된 인증 요청: ${esc(error)}</p>`);
  }

  if (body.action === 'cancel') {
    return redirectWith(res, body.redirect_uri, { error: 'access_denied', state: body.state });
  }

  const p = PROVIDERS[provider];
  let profile;
  if (body.action === 'custom') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    if (!name || name.length > MAX_NAME_LENGTH || !EMAIL_RE.test(email)) {
      return res.status(400).type('html').send(page(provider, body, '이름과 올바른 이메일을 입력해 주세요.'));
    }
    const hash = crypto.createHash('sha1').update(email.toLowerCase()).digest('hex').slice(0, 10);
    profile = { id: `${provider}-${hash}`, name, email };
  } else {
    const account = p.accounts.find((a) => a.id === body.account_id);
    if (!account) {
      return res.status(400).type('html').send(page(provider, body, '테스트 계정을 선택해 주세요.'));
    }
    profile = { ...account };
  }

  if (p.emailConsentOptional && body.consent_email === 'off') profile.email = null;

  const code = crypto.randomBytes(16).toString('hex');
  codes.set(code, { provider, profile, expiresAt: Date.now() + CODE_TTL_MS });
  logger.info(`MOCK-OAUTH ${provider} authorized providerUserId=${profile.id} emailConsent=${Boolean(profile.email)}`);
  redirectWith(res, body.redirect_uri, { code, state: body.state });
});

function exchangeCode(provider, code) {
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  if (entry.provider !== provider || Date.now() > entry.expiresAt) return null;
  return entry.profile;
}

module.exports = { router, exchangeCode, CLIENT_ID, PROVIDERS };
