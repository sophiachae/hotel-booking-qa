import { test, expect, type Page } from '@playwright/test';
import { stay } from '../support/dates';
import { GUEST } from '../support/data';
import { reservationBody, submitBookingAndFetch, uniqueEmail } from '../support/api';
import { DEFAULT_PASSWORD, SEED_MEMBER, bearer, loginBrowser, signupMember } from '../support/auth';
import { queryDb, usersByEmail } from '../support/db';

// v1.1 회원 기능 UI 테스트. 기대결과는 docs/SPEC.md(v1.1 명세) 기준.
// 데이터 격리: 회원은 테스트마다 새로 가입, 예약은 객실 9·13 / 오늘+20~23일을 TC별로 나눠 사용.

/** 소셜 로그인 버튼은 화면 스크립트가 링크(href)를 채운 뒤에 눌러야 함 (처음엔 href="#") */
async function clickSocialLogin(page: Page, provider: 'kakao' | 'google') {
  const btn = page.getByTestId(`login-${provider}`);
  await expect(btn).toHaveAttribute('href', new RegExp(`/api/auth/oauth/${provider}/start`));
  await btn.click();
}

const bookUrl = (roomId: number, window: { checkIn: string; checkOut: string }, hotelId: number) =>
  `/book.html?hotelId=${hotelId}&roomId=${roomId}&checkIn=${window.checkIn}&checkOut=${window.checkOut}&guests=2`;

test.describe('이메일 회원가입·로그인', () => {
  test('TC-39 이메일 회원가입 후 자동 로그인', async ({ page }) => {
    const email = uniqueEmail('TC-39');
    await page.goto('/index.html');
    await page.getByTestId('nav-login').click();
    await page.getByTestId('login-signup-link').click();

    await page.getByTestId('signup-name').fill('가입테스트');
    await page.getByTestId('signup-email').fill(email);
    await page.getByTestId('signup-password').fill(DEFAULT_PASSWORD);
    await page.getByTestId('signup-password-confirm').fill(DEFAULT_PASSWORD);
    await page.getByTestId('signup-submit').click();

    await expect(page, '원래 화면으로 복귀').toHaveURL(/\/index\.html$/);
    await expect(page.getByTestId('nav-user-name')).toHaveText('가입테스트님');
    expect(usersByEmail(email).map((u) => u.provider)).toEqual(['EMAIL']);
  });

  test('TC-42 예약 화면에서 이메일 로그인 후 복귀', async ({ page }) => {
    const url = bookUrl(1, stay(150, 152), 1);
    await page.goto(url);
    await expect(page.getByTestId('booking-guest-notice')).toBeVisible();
    await page.getByTestId('booking-guest-login-link').click();

    await page.getByTestId('login-email').fill(SEED_MEMBER.email);
    await page.getByTestId('login-password').fill(SEED_MEMBER.password);
    await page.getByTestId('login-submit').click();

    await expect(page, '같은 예약 화면(같은 객실·날짜)으로 복귀').toHaveURL((u) => u.pathname + u.search === url);
    await expect(page.getByTestId('nav-user-name')).toHaveText(`${SEED_MEMBER.name}님`);
    await expect(page.getByTestId('booking-room-name')).toHaveText('스탠다드 더블');
  });

  test('TC-59 오픈 리다이렉트 방지', async ({ page, baseURL }) => {
    await page.goto('/login.html?returnTo=//evil.com');
    await page.getByTestId('login-email').fill(SEED_MEMBER.email);
    await page.getByTestId('login-password').fill(SEED_MEMBER.password);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(`${baseURL}/index.html`);
  });
});

test.describe('소셜 로그인 (Mock OAuth)', () => {
  for (const { tc, provider, accountId, email } of [
    { tc: 'TC-47', provider: 'kakao', accountId: 'kakao-1001', email: 'kakao.tester@kakao.test' },
    { tc: 'TC-48', provider: 'google', accountId: 'google-2001', email: 'google.tester@gmail.test' },
  ] as const) {
    test(`${tc} ${provider === 'kakao' ? '카카오' : '구글'} Mock 로그인`, async ({ page }) => {
      await page.goto('/my.html');
      await page.getByTestId('nav-login').click();
      await clickSocialLogin(page, provider);

      await expect(page.getByTestId('mock-oauth-page')).toHaveAttribute('data-provider', provider);
      await page.getByTestId(`mock-account-${accountId}`).click();

      await expect(page, '원래 화면으로 복귀').toHaveURL(/\/my\.html$/);
      await expect(page.getByTestId('nav-user-name')).toBeVisible();
      expect(usersByEmail(email).map((u) => u.provider)).toEqual([provider.toUpperCase()]);
    });
  }

  test('TC-49 Mock 로그인 화면에서 취소', async ({ page }) => {
    await page.goto('/login.html');
    await clickSocialLogin(page, 'kakao');
    await page.getByTestId('mock-cancel').click();

    await expect(page).toHaveURL(/\/login\.html\?.*error=OAUTH_CANCELLED/);
    await expect(page.getByTestId('login-error')).toHaveAttribute('data-code', 'OAUTH_CANCELLED');
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.user, '로그인되지 않음').toBeNull();
  });

  test('TC-52 카카오 이메일 제공 동의 해제', async ({ page }) => {
    await test.step('동의 해제 후 계정 선택 → EMAIL_CONSENT_REQUIRED', async () => {
      await page.goto('/login.html');
      await clickSocialLogin(page, 'kakao');
      await page.getByTestId('mock-consent-email').uncheck();
      await page.getByTestId('mock-account-kakao-1002').click();

      await expect(page).toHaveURL(/\/login\.html\?.*error=EMAIL_CONSENT_REQUIRED/);
      const me = await (await page.request.get('/api/auth/me')).json();
      expect(me.user, '로그인되지 않음').toBeNull();
      expect(usersByEmail('kakao.second@kakao.test'), '가입되지 않음').toHaveLength(0);
    });

    // 탐색 테스트에서 합친 관점: 로그인이 막힌 뒤 예약하면 비회원 예약으로만 처리되어야 함
    await test.step('이어서 예약 → 비회원 예약 (bookedAs=GUEST)', async () => {
      await page.goto(bookUrl(9, stay(20, 21), 4));
      await expect(page.getByTestId('booking-guest-notice')).toBeVisible();
      const email = uniqueEmail('TC-52');
      await page.getByTestId('guest-name').fill(GUEST.name);
      await page.getByTestId('guest-email').fill(email);
      await page.getByTestId('guest-phone').fill(GUEST.phone);
      const r = await submitBookingAndFetch(page, email);
      expect(r.bookedAs).toBe('GUEST');
    });
  });

  test('TC-53 이메일로 가입한 주소로 구글 로그인', async ({ page }) => {
    const m = await signupMember('TC-53');

    await page.goto('/login.html');
    await clickSocialLogin(page, 'google');
    await page.getByTestId('mock-custom-name').fill('같은이메일');
    await page.getByTestId('mock-custom-email').fill(m.email);
    await page.getByTestId('mock-custom-submit').click();

    await expect(page).toHaveURL(/\/login\.html\?.*error=ACCOUNT_EXISTS/);
    expect(new URL(page.url()).searchParams.get('provider')).toBe('EMAIL');
    expect(usersByEmail(m.email).map((u) => u.provider), '새 계정 생성 안 됨').toEqual(['EMAIL']);
  });
});

test.describe('회원 예약 화면', () => {
  test('TC-54 로그인 상태로 예약 (회원 예약)', async ({ page, context }) => {
    const m = await signupMember('TC-54', { phone: '010-2222-3333' });
    await loginBrowser(context, m.token);

    await page.goto(bookUrl(9, stay(22, 23), 4));
    await expect(page.getByTestId('booking-member-notice')).toBeVisible();
    await expect(page.getByTestId('guest-name')).toHaveValue(m.name);
    await expect(page.getByTestId('guest-email')).toHaveValue(m.email);
    await expect(page.getByTestId('guest-email'), '이메일 수정 불가').not.toBeEditable();
    await expect(page.getByTestId('guest-phone')).toHaveValue(m.phone);

    const body = await submitBookingAndFetch(page, m.email);
    expect(body.bookedAs).toBe('MEMBER');
    const [row] = queryDb<{ user_id: number }>('SELECT user_id FROM reservations WHERE id = ?', body.id);
    expect(row.user_id).toBe(m.id);
  });

  test('TC-66 로그아웃 후 뒤로 가기', async ({ page, context, request }) => {
    const m = await signupMember('TC-66');
    const r = await (
      await request.post('/api/reservations', {
        data: reservationBody({ roomId: 13, ...stay(20, 21), name: m.name, email: m.email, phone: m.phone }),
        headers: bearer(m.token),
      })
    ).json();
    await loginBrowser(context, m.token);

    await page.goto('/my.html');
    await expect(page.getByTestId(`my-reservation-item-${r.id}`)).toBeVisible();
    await page.getByTestId('nav-logout').click();
    await expect(page).toHaveURL(/\/index\.html$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/my\.html$/);
    const visibleAfterBack = await page.getByTestId('my-reservations-section').isVisible();
    test.info().annotations.push({
      type: '관찰',
      description: `뒤로 가기 직후 회원 예약 목록 ${visibleAfterBack ? '보임 (이전 화면 복원)' : '안 보임'}`,
    });

    // 기대: 안 보이거나, 보이더라도 새로고침하면 비로그인 상태로 처리
    if (visibleAfterBack) {
      await page.reload();
      await expect(page.getByTestId('my-reservations-section')).toBeHidden();
      await expect(page.getByTestId('nav-login')).toBeVisible();
    }
  });
});
