import { test, expect } from '@playwright/test';
import { stay } from '../support/dates';
import { bearer, loginBrowser, signupMember } from '../support/auth';
import { ISSUES } from '../support/data';

// 세션 1분 서버 (SESSION_TTL_MINUTES=1, 포트 3102). 만료를 기다려야 해서 테스트마다 61초 이상 걸린다.
const EXPIRE_WAIT_MS = 61_000;

test('TC-46 세션 만료', async ({ request }) => {
  test.setTimeout(120_000);
  const m = await signupMember('TC-46');

  const before = await request.get('/api/auth/me', { headers: bearer(m.token) });
  expect((await before.json()).user?.email, '사전조건: 만료 전에는 로그인 상태').toBe(m.email);

  await new Promise((r) => setTimeout(r, EXPIRE_WAIT_MS));

  const me = await request.get('/api/auth/me', { headers: bearer(m.token) });
  expect((await me.json()).user).toBeNull();
  const list = await request.get('/api/me/reservations', { headers: bearer(m.token) });
  expect(list.status()).toBe(401);
  expect((await list.json()).error.code).toBe('UNAUTHORIZED');
});

// 알려진 결함 #8: 입력 중 세션이 만료되면 안내 없이 비회원 예약으로 저장됨 (needs-spec)
// https://github.com/sophiachae/hotel-booking-qa/issues/8
test('TC-64 예약 입력 중 세션 만료 후 제출', async ({ page, context }) => {
  test.fail(true, `결함 #8 ${ISSUES.SESSION_EXPIRED_AS_GUEST}`);
  test.setTimeout(120_000);
  const m = await signupMember('TC-64');
  await loginBrowser(context, m.token);
  const window = stay(30, 32);

  await page.goto(`/book.html?hotelId=1&roomId=1&checkIn=${window.checkIn}&checkOut=${window.checkOut}&guests=2`);
  await expect(page.getByTestId('booking-member-notice'), '사전조건: 회원으로 예약 화면 진입').toBeVisible();

  await page.waitForTimeout(EXPIRE_WAIT_MS);
  const responsePromise = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/reservations'),
  );
  await page.getByTestId('booking-submit').click();
  const status = (await responsePromise).status();
  test.info().annotations.push({ type: '관찰', description: `제출 응답 상태 ${status}` });

  // 기대: 회원 예약으로 처리되거나, 만료를 알리고 재로그인 유도. 알리지 않고 비회원 예약으로 저장되면 안 됨
  if (status === 201) {
    await expect(page.getByTestId('reservation-id')).toHaveText(/^RSV-.{8}$/);
    const id = (await page.getByTestId('reservation-id').textContent())!.trim();
    const body = await (await page.request.get(`/api/reservations/${id}?email=${encodeURIComponent(m.email)}`)).json();
    test.info().annotations.push({ type: '관찰', description: `저장된 예약 ${JSON.stringify(body)}` });
    expect(body.bookedAs, `만료 후 제출이 비회원 예약으로 저장됨 (예약: ${JSON.stringify(body)})`).toBe('MEMBER');
  } else {
    expect(status).toBe(401);
    await expect(page.getByTestId('booking-login-required')).toBeVisible();
  }
});
