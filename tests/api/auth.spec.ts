import fs from 'fs';
import { test, expect } from '@playwright/test';
import { stay } from '../support/dates';
import { ISSUES } from '../support/data';
import { expectValidationError, reservationBody, uniqueEmail } from '../support/api';
import {
  DEFAULT_PASSWORD,
  SEED_MEMBER,
  bearer,
  freshContext,
  loginToken,
  oauthAuthorize,
  oauthCallback,
  signupMember,
} from '../support/auth';
import { usersByEmail } from '../support/db';
import { E2E_LOG_FILE } from '../support/env';

// v1.1 회원 기능 API 테스트. 기대결과는 docs/SPEC.md(v1.1 명세) 기준.
// 데이터 격리: 회원은 테스트마다 새로 가입, 예약은 객실 10·12 / 오늘+20~29일을 TC별로 나눠 사용.

test.describe('회원가입·로그인', () => {
  test('TC-40 비밀번호 규칙', async ({ request }) => {
    const cases = [
      { label: '7자', password: 'Abc1234', ok: false },
      { label: '65자', password: 'a1'.repeat(32) + 'a', ok: false },
      { label: '숫자만', password: '12345678', ok: false },
      { label: '영문만', password: 'abcdefgh', ok: false },
      { label: '영문+숫자 8자', password: 'Abcd1234', ok: true },
      { label: '영문+숫자 64자', password: 'a1'.repeat(32), ok: true },
    ];
    for (const c of cases) {
      await test.step(`비밀번호 ${c.label}`, async () => {
        const res = await request.post('/api/auth/signup', {
          data: { name: '규칙', email: uniqueEmail('TC-40'), password: c.password },
        });
        if (c.ok) expect(res.status(), await res.text()).toBe(201);
        else await expectValidationError(res, 'password');
      });
    }
  });

  test('TC-41 가입된 이메일로 다시 가입 (대소문자만 다르게)', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { name: '중복', email: SEED_MEMBER.email.toUpperCase(), password: DEFAULT_PASSWORD },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_TAKEN');
    expect(usersByEmail(SEED_MEMBER.email)).toHaveLength(1);
  });

  test('TC-43 로그인 실패: 틀린 비밀번호 / 없는 이메일', async ({ request }) => {
    const wrongPassword = await request.post('/api/auth/login', {
      data: { email: SEED_MEMBER.email, password: 'Wrong1234' },
    });
    const noAccount = await request.post('/api/auth/login', {
      data: { email: uniqueEmail('TC-43-none'), password: SEED_MEMBER.password },
    });

    expect(wrongPassword.status()).toBe(401);
    expect(noAccount.status()).toBe(401);
    const a = (await wrongPassword.json()).error;
    const b = (await noAccount.json()).error;
    expect(a.code).toBe('INVALID_CREDENTIALS');
    expect(b.code).toBe('INVALID_CREDENTIALS');
    expect(a.message, '어느 쪽이 틀렸는지 구분하지 않음').toBe(b.message);
  });
});

test.describe('인증·세션', () => {
  test('TC-44 인증 방식 2가지 (쿠키 / Bearer 토큰)', async () => {
    await test.step('① sid 쿠키만으로 /me', async () => {
      const ctx = await freshContext();
      await ctx.post('/api/auth/login', { data: { email: SEED_MEMBER.email, password: SEED_MEMBER.password } });
      const me = await ctx.get('/api/auth/me');
      expect(me.status()).toBe(200);
      expect((await me.json()).user.email).toBe(SEED_MEMBER.email);
      await ctx.dispose();
    });

    await test.step('② Bearer 토큰만으로 /me', async () => {
      const token = await loginToken(SEED_MEMBER.email, SEED_MEMBER.password);
      const ctx = await freshContext();
      const me = await ctx.get('/api/auth/me', { headers: bearer(token) });
      expect(me.status()).toBe(200);
      expect((await me.json()).user.email).toBe(SEED_MEMBER.email);
      await ctx.dispose();
    });

    await test.step('③ 둘 다 없이 /me → 200 user:null', async () => {
      const ctx = await freshContext();
      const me = await ctx.get('/api/auth/me');
      expect(me.status()).toBe(200);
      expect(await me.json()).toEqual({ user: null });
      await ctx.dispose();
    });
  });

  test('TC-45 로그아웃', async ({ request }) => {
    const token = await loginToken(SEED_MEMBER.email, SEED_MEMBER.password);

    const logout = await request.post('/api/auth/logout', { headers: bearer(token) });
    expect(logout.status()).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });

    const me = await request.get('/api/auth/me', { headers: bearer(token) });
    expect((await me.json()).user).toBeNull();

    const list = await request.get('/api/me/reservations', { headers: bearer(token) });
    expect(list.status()).toBe(401);
    expect((await list.json()).error.code).toBe('UNAUTHORIZED');
  });
});

test.describe('소셜 로그인 (Mock OAuth)', () => {
  test('TC-50 OAuth state 불일치 (CSRF 방어)', async () => {
    const ctx = await freshContext({ maxRedirects: 0 });
    const { code } = await oauthAuthorize(ctx, 'kakao', 'kakao-1001');

    const location = await oauthCallback(ctx, 'kakao', code, 'wrong-state-value');
    expect(location.pathname).toBe('/login.html');
    expect(location.searchParams.get('error')).toBe('INVALID_STATE');

    const me = await ctx.get('/api/auth/me');
    expect((await me.json()).user, '로그인되지 않음').toBeNull();
    await ctx.dispose();
  });

  test('TC-51 OAuth code 재사용 / 60초 경과', async () => {
    test.setTimeout(120_000);

    await test.step('① 이미 사용한 code를 새 state로 재사용 → INVALID_CODE', async () => {
      // 콜백은 state 쿠키를 지우므로, 재사용 확인은 새 흐름의 state + 예전 code로 해야 INVALID_STATE가 아닌 code 검증까지 간다
      const first = await freshContext({ maxRedirects: 0 });
      const used = await oauthAuthorize(first, 'kakao', 'kakao-1001');
      const ok = await oauthCallback(first, 'kakao', used.code, used.state);
      expect(ok.pathname, '첫 사용은 성공').toBe('/my.html');
      await first.dispose();

      const second = await freshContext({ maxRedirects: 0 });
      const start = await second.get('/api/auth/oauth/kakao/start?returnTo=/my.html');
      const newState = new URL(start.headers()['location'], 'http://x').searchParams.get('state')!;
      const location = await oauthCallback(second, 'kakao', used.code, newState);
      expect(location.searchParams.get('error')).toBe('INVALID_CODE');
      expect((await (await second.get('/api/auth/me')).json()).user, '세션 발급 안 됨').toBeNull();
      await second.dispose();
    });

    await test.step('② code 발급 후 61초 경과 → INVALID_CODE', async () => {
      const ctx = await freshContext({ maxRedirects: 0 });
      const { code, state } = await oauthAuthorize(ctx, 'kakao', 'kakao-1001');
      await new Promise((r) => setTimeout(r, 61_000));
      const location = await oauthCallback(ctx, 'kakao', code, state);
      expect(location.searchParams.get('error')).toBe('INVALID_CODE');
      expect((await (await ctx.get('/api/auth/me')).json()).user, '세션 발급 안 됨').toBeNull();
      await ctx.dispose();
    });
  });

  // 알려진 결함 #10: 취소(error) 콜백은 state를 검증하지 않음. 기대값 INVALID_STATE는 명세 126행(콜백 → state 검증)·132행 기준
  // https://github.com/sophiachae/hotel-booking-qa/issues/10
  // 대조군: 정상 흐름에서 취소하면 OAUTH_CANCELLED (TC-49, UI)
  test('TC-68 취소(error) 콜백의 state 검증', async () => {
    test.fail(true, `결함 #10 ${ISSUES.OAUTH_ERROR_STATE}`);

    await test.step('① 로그인 성공 후 이미 사용한 state로 error 콜백 → INVALID_STATE, 로그인 유지', async () => {
      const ctx = await freshContext({ maxRedirects: 0 });
      const { code, state } = await oauthAuthorize(ctx, 'kakao', 'kakao-1001');
      const ok = await oauthCallback(ctx, 'kakao', code, state);
      expect(ok.pathname, '사전조건: 로그인 성공').toBe('/my.html');

      const res = await ctx.get(`/api/auth/oauth/kakao/callback?error=access_denied&state=${encodeURIComponent(state)}`);
      const location = new URL(res.headers()['location'], 'http://x');
      expect.soft(location.searchParams.get('error'), '이미 사용한 state').toBe('INVALID_STATE');
      expect.soft((await (await ctx.get('/api/auth/me')).json()).user, '로그인 상태 유지').not.toBeNull();
      await ctx.dispose();
    });

    for (const [label, query] of [
      ['② 임의 state + error (state 쿠키 없음)', 'error=access_denied&state=forged-state'],
      ['③ state 없이 error', 'error=access_denied'],
    ] as const) {
      await test.step(`${label} → INVALID_STATE`, async () => {
        const ctx = await freshContext({ maxRedirects: 0 });
        const res = await ctx.get(`/api/auth/oauth/kakao/callback?${query}`);
        expect(res.status()).toBe(302);
        expect.soft(new URL(res.headers()['location'], 'http://x').searchParams.get('error'), label).toBe('INVALID_STATE');
        await ctx.dispose();
      });
    }
  });

  test('TC-61 Mock OAuth redirect_uri 변조', async () => {
    const ctx = await freshContext({ maxRedirects: 0 });
    const { query } = await oauthAuthorize(ctx, 'kakao', 'kakao-1001');
    const tampered = 'http://evil.example/api/auth/oauth/kakao/callback';

    await test.step('계정 선택 화면 요청 → 400', async () => {
      const params = new URLSearchParams({ ...query, redirect_uri: tampered });
      const res = await ctx.get(`/mock-oauth/kakao/authorize?${params}`);
      expect(res.status()).toBe(400);
    });

    await test.step('계정 선택(POST) → 400, code 발급 안 됨', async () => {
      const res = await ctx.post('/mock-oauth/kakao/authorize', {
        form: { client_id: query.client_id, redirect_uri: tampered, state: query.state, account_id: 'kakao-1001', consent_email: 'on' },
      });
      expect(res.status()).toBe(400);
      expect(res.headers()['location'], 'code가 담긴 리다이렉트 없음').toBeUndefined();
    });
    await ctx.dispose();
  });
});

test.describe('회원 예약', () => {
  test('TC-55 회원 예약 목록', async ({ request }) => {
    const m = await signupMember('TC-55');
    const book = (window: { checkIn: string; checkOut: string }, auth: boolean) =>
      request.post('/api/reservations', {
        data: reservationBody({ roomId: 10, ...window, name: m.name, email: m.email, phone: m.phone }),
        headers: auth ? bearer(m.token) : {},
      });

    const r1 = await (await book(stay(20, 21), true)).json();
    const r2 = await (await book(stay(22, 23), true)).json();
    const cancel = await request.post(`/api/reservations/${r1.id}/cancel`, { data: {}, headers: bearer(m.token) });
    expect(cancel.status()).toBe(200);
    const guest = await (await book(stay(24, 25), false)).json();
    expect(guest.bookedAs, '사전조건: 같은 이메일 비회원 예약').toBe('GUEST');

    const res = await request.get('/api/me/reservations', { headers: bearer(m.token) });
    expect(res.status()).toBe(200);
    const list: { id: string; status: string }[] = await res.json();
    expect(list.map((r) => r.id), '회원 예약 2건만 최신순').toEqual([r2.id, r1.id]);
    expect(list.find((r) => r.id === r1.id)?.status, '취소 건 포함').toBe('CANCELLED');
  });

  test('TC-56 본인 회원 예약을 이메일 없이 조회·취소', async ({ request }) => {
    const m = await signupMember('TC-56');
    const created = await request.post('/api/reservations', {
      data: reservationBody({ roomId: 10, ...stay(26, 27), name: m.name, email: m.email, phone: m.phone }),
      headers: bearer(m.token),
    });
    const r = await created.json();
    expect(r.bookedAs).toBe('MEMBER');

    const get = await request.get(`/api/reservations/${r.id}`, { headers: bearer(m.token) });
    expect(get.status()).toBe(200);
    expect((await get.json()).id).toBe(r.id);

    const cancel = await request.post(`/api/reservations/${r.id}/cancel`, { data: {}, headers: bearer(m.token) });
    expect(cancel.status()).toBe(200);
    expect((await cancel.json()).status).toBe('CANCELLED');
  });

  test('TC-57 로그인 상태에서 다른 회원 예약 조회', async ({ request }) => {
    const owner = await signupMember('TC-57-owner', { phone: '010-7777-8888' });
    const other = await signupMember('TC-57-other');
    const r = await (
      await request.post('/api/reservations', {
        data: reservationBody({ roomId: 10, ...stay(28, 29), name: owner.name, email: owner.email, phone: owner.phone }),
        headers: bearer(owner.token),
      })
    ).json();

    await test.step('① email 없이 조회 → 400', async () => {
      const res = await request.get(`/api/reservations/${r.id}`, { headers: bearer(other.token) });
      const raw = await res.text();
      expect(res.status(), raw).toBe(400);
      expect(JSON.parse(raw).error.code).toBe('VALIDATION_ERROR');
      expect(raw).not.toContain(owner.name);
      expect(raw).not.toContain(owner.phone);
    });

    await test.step('② 다른 이메일로 조회 → 404', async () => {
      const res = await request.get(`/api/reservations/${r.id}?email=${encodeURIComponent(other.email)}`, {
        headers: bearer(other.token),
      });
      const raw = await res.text();
      expect(res.status(), raw).toBe(404);
      expect(JSON.parse(raw).error.code).toBe('NOT_FOUND');
      expect(raw).not.toContain(owner.name);
      expect(raw).not.toContain(owner.phone);
    });
  });

  // 알려진 결함 #7: 서버가 회원 예약 이메일을 계정 이메일로 고정하지 않음 (UI 우회, #2와 같은 유형)
  // https://github.com/sophiachae/hotel-booking-qa/issues/7
  test('TC-65 로그인 상태에서 다른 이메일로 예약 (UI 우회)', async ({ request }) => {
    test.fail(true, `결함 #7 ${ISSUES.MEMBER_EMAIL_NOT_FIXED}`);
    const m = await signupMember('TC-65');
    const otherEmail = uniqueEmail('TC-65-other');
    const res = await request.post('/api/reservations', {
      data: reservationBody({ roomId: 12, ...stay(22, 23), name: m.name, email: otherEmail, phone: m.phone }),
      headers: bearer(m.token),
    });
    const body = await res.json();

    // 기대: 계정 이메일로 고정해서 저장하거나, 400으로 거부. 다른 이메일로 회원 예약이 저장되면 안 됨
    if (res.status() === 201) {
      expect(body.email, `계정 이메일로 고정되어야 함 (응답: ${JSON.stringify(body)})`).toBe(m.email);
    } else {
      expect(res.status(), JSON.stringify(body)).toBe(400);
    }
  });
});

test.describe('로그', () => {
  /** 테스트 중 추가된 로그 줄만 읽기 위해 시작 시점 파일 크기를 기억 */
  const logReader = () => {
    const offset = fs.existsSync(E2E_LOG_FILE) ? fs.statSync(E2E_LOG_FILE).size : 0;
    return () => fs.readFileSync(E2E_LOG_FILE).subarray(offset).toString('utf8');
  };

  test('TC-60 로그 마스킹: 비밀번호·토큰·OAuth code·state', async ({ request }) => {
    const read = logReader();
    const password = `Mask${Date.now()}x1`;
    const email = uniqueEmail('TC-60-secret');

    const signup = await request.post('/api/auth/signup', { data: { name: '마스킹', email, password } });
    const token = (await signup.json()).token;
    await request.post('/api/auth/login', { data: { email, password } });

    const ctx = await freshContext({ maxRedirects: 0 });
    const { code, state } = await oauthAuthorize(ctx, 'kakao', 'kakao-1001');
    await oauthCallback(ctx, 'kakao', code, state);
    await ctx.dispose();

    await expect.poll(() => read().includes('/api/auth/oauth/kakao/callback')).toBe(true);
    const log = read();
    for (const [label, secret] of [['password', password], ['token', token], ['code', code], ['state', state]]) {
      expect(log, `${label} 원문이 로그에 없어야 함`).not.toContain(secret);
    }
    expect(log).toContain('"password":"***"');
    expect(log).toContain('"code":"***"');
    expect(log).toContain('"state":"***"');
  });

  // 알려진 결함 #3: 로그에 이름·이메일·전화번호가 평문으로 기록됨 (v1.1 회귀 확인)
  // https://github.com/sophiachae/hotel-booking-qa/issues/3
  test('TC-60 로그 마스킹: 이름·이메일·전화번호 (#3)', async ({ request }) => {
    test.fail(true, `결함 #3 ${ISSUES.LOG_PII}`);
    const read = logReader();
    const m = await signupMember('TC-60-pii', { phone: '010-9876-5432' });
    await request.post('/api/reservations', {
      data: reservationBody({ roomId: 12, ...stay(20, 21), name: m.name, email: m.email, phone: m.phone }),
      headers: bearer(m.token),
    });
    await expect.poll(() => read().includes(m.email) || read().includes('POST /api/reservations')).toBe(true);
    const log = read();
    expect(log).not.toContain(m.email);
    expect(log).not.toContain(m.phone);
    expect(log).not.toContain(m.name);
  });
});
