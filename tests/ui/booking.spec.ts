import { test, expect } from '@playwright/test';
import { stay } from '../support/dates';
import { GUEST, ISSUES } from '../support/data';

test.describe('예약', () => {
  // 알려진 결함 #1: 저장 금액이 1박 요금만큼 많음 (390,000원 → 520,000원)
  // https://github.com/sophiachae/hotel-booking-qa/issues/1
  test('TC-14 검색부터 예약 완료까지 E2E', async ({ page }) => {
    test.fail(true, `결함 #1 ${ISSUES.PRICE_MISMATCH}`);

    // 제주 포레스트 리조트 / 가든 더블(130,000원) / 3박 → 390,000원
    const { checkIn, checkOut } = stay(10, 13);
    const expectedTotal = '390,000원';

    await test.step('제주 / 3박 / 2명 검색', async () => {
      await page.goto('/index.html');
      await page.getByTestId('search-city').selectOption('제주');
      await page.getByTestId('search-checkin').fill(checkIn);
      await page.getByTestId('search-checkout').fill(checkOut);
      await page.getByTestId('search-guests').fill('2');
      await page.getByTestId('search-submit').click();
    });

    await test.step('제주 포레스트 리조트 → 가든 더블 선택', async () => {
      await page.getByTestId('hotel-detail-btn-5').click();
      await expect(page.getByTestId('room-total-11')).toHaveText(expectedTotal);
      await page.getByTestId('room-select-btn-11').click();
    });

    await test.step('예약 정보 입력 화면 금액 확인 후 예약 확정', async () => {
      await expect(page.getByTestId('booking-room-name')).toHaveText('가든 더블');
      await expect(page.getByTestId('booking-nights')).toHaveText('3박');
      await expect(page.getByTestId('booking-total')).toHaveText(expectedTotal);

      await page.getByTestId('guest-name').fill(GUEST.name);
      await page.getByTestId('guest-email').fill(GUEST.email);
      await page.getByTestId('guest-phone').fill(GUEST.phone);
      await page.getByTestId('booking-submit').click();
    });

    await test.step('예약 완료 화면 금액 확인', async () => {
      await expect(page.getByTestId('complete-message')).toBeVisible();
      await expect(page.getByTestId('reservation-id')).toHaveText(/^RSV-.{8}$/);
      await expect(page.getByTestId('complete-total')).toHaveText(expectedTotal);
    });

    await test.step('내 예약 조회 화면(저장 금액) 확인', async () => {
      await page.getByTestId('complete-go-my-reservation').click();
      await expect(page.getByTestId('reservation-status')).toHaveAttribute('data-status', 'CONFIRMED');
      await expect(page.getByTestId('reservation-total')).toHaveText(expectedTotal);
    });
  });

  test('TC-24 예약 입력 폼 검증 메시지', async ({ page }) => {
    const { checkIn, checkOut } = stay(30, 32);

    // 폼 검증에서 막혀야 하므로 예약 생성 요청이 나가면 안 됨
    const reservationRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/reservations')) {
        reservationRequests.push(req.url());
      }
    });

    await page.goto(`/book.html?hotelId=1&roomId=1&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
    await expect(page.getByTestId('booking-section')).toBeVisible();

    await page.getByTestId('guest-name').fill('');
    await page.getByTestId('guest-email').fill('abc');
    await page.getByTestId('guest-phone').fill('123');
    await page.getByTestId('booking-submit').click();

    await expect(page.getByTestId('guest-name-error')).toHaveText('이름을 입력해 주세요.');
    await expect(page.getByTestId('guest-email-error')).toHaveText('이메일 형식이 올바르지 않습니다.');
    await expect(page.getByTestId('guest-phone-error')).toHaveText(
      '전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)',
    );
    await expect(page).toHaveURL(/book\.html/);
    expect(reservationRequests).toHaveLength(0);
  });
});
