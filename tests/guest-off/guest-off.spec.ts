import { test, expect } from '@playwright/test';
import { stay } from '../support/dates';
import { reservationBody, uniqueEmail } from '../support/api';
import { reservationsByEmail } from '../support/db';
import { SERVERS } from '../support/env';

// 회원 전용 모드 서버 (GUEST_CHECKOUT=off, 포트 3101)

test('TC-58 회원 전용 모드에서 비로그인 예약', async ({ page, request }) => {
  const window = stay(30, 32);

  await test.step('① 예약 화면: 폼 대신 "로그인하고 예약하기" 안내', async () => {
    await page.goto(`/book.html?hotelId=1&roomId=1&checkIn=${window.checkIn}&checkOut=${window.checkOut}&guests=2`);
    await expect(page.getByTestId('booking-login-required')).toBeVisible();
    await expect(page.getByTestId('booking-login-btn')).toHaveText('로그인하고 예약하기');
    await expect(page.getByTestId('booking-form')).toBeHidden();
  });

  await test.step('② API 예약 요청 → 401 LOGIN_REQUIRED, 예약 생성 안 됨', async () => {
    const email = uniqueEmail('TC-58');
    const res = await request.post('/api/reservations', { data: reservationBody({ roomId: 1, ...window, email }) });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe('LOGIN_REQUIRED');
    expect(reservationsByEmail(email, SERVERS.guestOff.db)).toHaveLength(0);
  });
});
