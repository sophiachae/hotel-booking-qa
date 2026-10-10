import { test, expect } from '@playwright/test';
import { stay } from '../support/dates';

test.describe('호텔 검색', () => {
  test('TC-01 서울 호텔 검색', async ({ page }) => {
    const { checkIn, checkOut } = stay(30, 32);

    await page.goto('/index.html');
    await page.getByTestId('search-city').selectOption('서울');
    await page.getByTestId('search-checkin').fill(checkIn);
    await page.getByTestId('search-checkout').fill(checkOut);
    await page.getByTestId('search-guests').fill('2');
    await page.getByTestId('search-submit').click();

    await expect(page).toHaveURL(/results\.html/);
    await expect(page.getByTestId('results-summary')).toHaveText(
      `서울 · ${checkIn} ~ ${checkOut} (2박) · 2명 · 2개 호텔`,
    );
    await expect(page.getByTestId(/^hotel-card-\d+$/)).toHaveCount(2);

    // 서울 그랜드 호텔
    await expect(page.getByTestId('hotel-name-1')).toHaveText('서울 그랜드 호텔');
    await expect(page.getByTestId('hotel-min-price-1')).toHaveText('120,000원');
    await expect(page.getByTestId('hotel-available-rooms-1')).toHaveText('3');

    // 한강 리버뷰 호텔
    await expect(page.getByTestId('hotel-name-2')).toHaveText('한강 리버뷰 호텔');
    await expect(page.getByTestId('hotel-min-price-2')).toHaveText('95,000원');
    await expect(page.getByTestId('hotel-available-rooms-2')).toHaveText('2');
  });
});
