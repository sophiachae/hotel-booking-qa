import { test, expect } from '@playwright/test';
import { stay } from '../support/dates';

test.describe('호텔 상세 / 객실 선택', () => {
  test('TC-11 객실 목록과 기간 총액 표시', async ({ page }) => {
    const { checkIn, checkOut } = stay(30, 32);

    await page.goto(`/hotel.html?id=1&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);

    await expect(page.getByTestId('hotel-name')).toHaveText('서울 그랜드 호텔');
    await expect(page.getByTestId('hotel-address')).toHaveText('서울특별시 중구 세종대로 100');
    await expect(page.getByTestId('hotel-rating')).toHaveText('★ 4.6');
    await expect(page.getByTestId('hotel-description')).not.toBeEmpty();
    await expect(page.getByTestId('hotel-stay-summary')).toHaveText(
      `${checkIn} ~ ${checkOut} (2박) · 2명`,
    );

    const rooms = [
      { id: 1, name: '스탠다드 더블', capacity: '2', price: '120,000원', total: '240,000원' },
      { id: 2, name: '디럭스 트윈', capacity: '3', price: '160,000원', total: '320,000원' },
      { id: 3, name: '이그제큐티브 스위트', capacity: '4', price: '280,000원', total: '560,000원' },
    ];
    await expect(page.getByTestId(/^room-card-\d+$/)).toHaveCount(rooms.length);

    for (const r of rooms) {
      await test.step(`${r.name}`, async () => {
        await expect(page.getByTestId(`room-name-${r.id}`)).toHaveText(r.name);
        await expect(page.getByTestId(`room-capacity-${r.id}`)).toHaveText(r.capacity);
        await expect(page.getByTestId(`room-price-${r.id}`)).toHaveText(r.price);
        await expect(page.getByTestId(`room-total-${r.id}`)).toHaveText(r.total);
        // 예약 가능 객실은 '이 객실 예약' 링크, 불가 객실은 비활성 '예약 불가' 버튼
        await expect(page.getByTestId(`room-select-btn-${r.id}`)).toHaveText('이 객실 예약');
      });
    }
  });
});
