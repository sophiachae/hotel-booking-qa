import { test, expect, type Page } from '@playwright/test';
import { stay } from '../support/dates';
import { GUEST, ISSUES } from '../support/data';
import { createReservation, uniqueEmail } from '../support/api';
import { reservationsByEmail } from '../support/db';

// 기간 겹침 유형 (UI 우회): 객실 목록에서는 '예약 불가'로 막히므로 예약 화면 URL로 직접 진입해 서버 검증을 확인한다.
// 데이터 격리: 유형마다 객실 1의 서로 다른 기간(오늘+110일~)에 기존 예약을 만든다.

async function bookViaUrl(page: Page, checkIn: string, checkOut: string, email: string) {
  await page.goto(`/book.html?hotelId=1&roomId=1&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
  await page.getByTestId('guest-name').fill(GUEST.name);
  await page.getByTestId('guest-email').fill(email);
  await page.getByTestId('guest-phone').fill(GUEST.phone);

  const responsePromise = page.waitForResponse(
    (res) => res.request().method() === 'POST' && res.url().endsWith('/api/reservations'),
  );
  await page.getByTestId('booking-submit').click();
  return responsePromise;
}

async function expectRejected(page: Page, status: number, email: string) {
  expect(status).toBe(409);
  await expect(page.getByTestId('booking-error')).toHaveText('선택한 날짜에 이미 예약된 객실입니다.');
  await expect(page).toHaveURL(/book\.html/);
  expect(reservationsByEmail(email)).toHaveLength(0);
}

test.describe('기간 겹침 예약 (UI 우회)', () => {
  test('TC-17 기존 예약 뒤쪽에 걸치는 기간 예약', async ({ page, request }) => {
    // 기존: 오늘+140~142 / 시도: 오늘+141~143
    await createReservation(request, { roomId: 1, ...stay(140, 142), email: uniqueEmail('TC-17-base') });
    const email = uniqueEmail('TC-17');
    const { checkIn, checkOut } = stay(141, 143);

    await test.step('객실 목록에서 스탠다드 더블 예약 불가 표시', async () => {
      await page.goto(`/hotel.html?id=1&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
      await expect(page.getByTestId('room-select-btn-1')).toHaveText('예약 불가');
      await expect(page.getByTestId('room-select-btn-1')).toBeDisabled();
    });

    await test.step('URL 직접 진입으로 제출해도 서버에서 차단', async () => {
      const res = await bookViaUrl(page, checkIn, checkOut, email);
      await expectRejected(page, res.status(), email);
    });
  });

  // 알려진 결함 #2: 체크인이 기존 예약보다 앞서면 겹치는 기간이 허용됨
  // https://github.com/sophiachae/hotel-booking-qa/issues/2
  test('TC-32 기존 예약 앞쪽에 걸치는 기간 예약', async ({ page, request }) => {
    test.fail(true, `결함 #2 ${ISSUES.FRONT_OVERLAP}`);

    // 기존: 오늘+110~112 / 시도: 오늘+109~111
    await createReservation(request, { roomId: 1, ...stay(110, 112), email: uniqueEmail('TC-32-base') });
    const email = uniqueEmail('TC-32');
    const { checkIn, checkOut } = stay(109, 111);

    const res = await bookViaUrl(page, checkIn, checkOut, email);
    await expectRejected(page, res.status(), email);
  });

  // 알려진 결함 #2: 체크인이 기존 예약보다 앞서면 겹치는 기간이 허용됨 (감싸는 유형도 같은 패턴)
  // https://github.com/sophiachae/hotel-booking-qa/issues/2
  test('TC-37 기존 예약을 감싸는 기간 예약', async ({ page, request }) => {
    test.fail(true, `결함 #2 ${ISSUES.FRONT_OVERLAP}`);

    // 기존: 오늘+120~122 / 시도: 오늘+119~123
    await createReservation(request, { roomId: 1, ...stay(120, 122), email: uniqueEmail('TC-37-base') });
    const email = uniqueEmail('TC-37');
    const { checkIn, checkOut } = stay(119, 123);

    const res = await bookViaUrl(page, checkIn, checkOut, email);
    await expectRejected(page, res.status(), email);
  });

  test('TC-38 기존 예약 안에 포함되는 기간 예약', async ({ page, request }) => {
    // 기존: 오늘+130~132 / 시도: 오늘+130~131
    await createReservation(request, { roomId: 1, ...stay(130, 132), email: uniqueEmail('TC-38-base') });
    const email = uniqueEmail('TC-38');
    const { checkIn, checkOut } = stay(130, 131);

    const res = await bookViaUrl(page, checkIn, checkOut, email);
    await expectRejected(page, res.status(), email);
  });
});
