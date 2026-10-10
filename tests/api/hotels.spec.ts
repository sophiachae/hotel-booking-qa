import fs from 'fs';
import { test, expect } from '@playwright/test';
import { daysFromToday, stay } from '../support/dates';
import { createReservation, expectValidationError, uniqueEmail } from '../support/api';
import { E2E_LOG_FILE } from '../support/env';

const D30_32 = stay(30, 32);

function hotelsQuery(params: Record<string, string | number>) {
  return '/api/hotels?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
}

// TC-04, 08, 09: AI 원문 기대결과의 "error.details에 해당 키 존재"는 명세(README)에 근거가 없어 제외함 (TC 리뷰 결과)
test.describe('GET /api/hotels', () => {
  test('TC-02 인원 조건 필터링', async ({ request }) => {
    const res = await request.get(hotelsQuery({ city: '부산', ...D30_32, guests: 5 }));

    expect(res.status()).toBe(200);
    const hotels = await res.json();
    // 호텔 4(광안 브릿지 스테이, 최대 3인)는 제외되고 펜트하우스(6인)가 있는 호텔 3만 남아야 함
    expect(hotels).toHaveLength(1);
    expect(hotels[0]).toMatchObject({ id: 3, availableRooms: 1, minPrice: 450000 });
  });

  test('TC-03 guests 최솟값/최댓값 허용', async ({ request }) => {
    await test.step('guests=1 → 호텔 1·2', async () => {
      const res = await request.get(hotelsQuery({ city: '서울', ...D30_32, guests: 1 }));
      expect(res.status()).toBe(200);
      expect((await res.json()).map((h: { id: number }) => h.id)).toEqual([1, 2]);
    });

    await test.step('guests=10 → 수용 가능한 객실 없음 []', async () => {
      const res = await request.get(hotelsQuery({ city: '서울', ...D30_32, guests: 10 }));
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  test('TC-04 guests 범위·형식 위반', async ({ request }) => {
    for (const guests of ['0', '11', '2.5', 'abc']) {
      await test.step(`guests=${guests}`, async () => {
        const res = await request.get(hotelsQuery({ city: '서울', ...D30_32, guests }));
        await expectValidationError(res);
      });
    }
  });

  test('TC-08 날짜 형식 오류·존재하지 않는 날짜', async ({ request }) => {
    const valid = daysFromToday(30);
    const year = Number(valid.slice(0, 4)) + 1;
    const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const nonLeapYear = isLeap(year) ? year + 1 : year;

    const invalidCheckIns = [
      valid.replaceAll('-', '/'), // 구분자 오류
      `${nonLeapYear}-02-29`, // 평년 2/29
      `${year}-13-01`, // 13월
    ];
    for (const checkIn of invalidCheckIns) {
      await test.step(`checkIn=${checkIn}`, async () => {
        const res = await request.get(
          hotelsQuery({ city: '서울', checkIn, checkOut: daysFromToday(400), guests: 2 }),
        );
        await expectValidationError(res);
      });
    }
  });

  test('TC-09 필수 파라미터 누락', async ({ request }) => {
    // 로그는 실행 간 누적되므로 요청 전 파일 크기를 기억해 두고 그 뒤에 추가된 줄만 본다
    const logOffset = fs.existsSync(E2E_LOG_FILE) ? fs.statSync(E2E_LOG_FILE).size : 0;

    const res = await request.get(hotelsQuery({ ...D30_32, guests: 2 }));
    await expectValidationError(res);

    await expect
      .poll(() => {
        const appended = fs.readFileSync(E2E_LOG_FILE).subarray(logOffset).toString('utf8');
        return appended
          .split('\n')
          .filter((l) => l.includes('[ERROR] GET /api/hotels params=') && !l.includes('"city"') && l.includes('status=400'))
          .length;
      }, { message: 'app.log에 [ERROR] GET /api/hotels ... status=400 1줄 기록' })
      .toBe(1);
  });

  test('TC-10 만실 호텔은 검색에서 제외', async ({ request }) => {
    // 사전조건: 한강 리버뷰 호텔(호텔 2)의 객실 4, 5를 모두 예약
    // (UI TC-01이 서울 오늘+30~32를 쓰므로 겹치지 않게 오늘+40~42 사용)
    const window = stay(40, 42);
    const email = uniqueEmail('TC-10');
    await createReservation(request, { roomId: 4, ...window, email });
    await createReservation(request, { roomId: 5, ...window, email });

    const res = await request.get(hotelsQuery({ city: '서울', ...window, guests: 2 }));
    expect(res.status()).toBe(200);
    const hotels = await res.json();
    expect(hotels).toHaveLength(1);
    expect(hotels[0]).toMatchObject({ id: 1, availableRooms: 3 });
  });
});

test.describe('GET /api/hotels/:id/rooms', () => {
  test('TC-12 객실 조회 시 잘못된 호텔 id', async ({ request }) => {
    await test.step('없는 id 999 → 404', async () => {
      const res = await request.get('/api/hotels/999/rooms');
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    });

    await test.step('숫자 아닌 id abc → 400', async () => {
      const res = await request.get('/api/hotels/abc/rooms');
      await expectValidationError(res);
    });
  });

  test('TC-13 기존 예약 반영한 available 계산', async ({ request }) => {
    // 사전조건 R1: 객실 1, 오늘+50~52 (UI TC와 겹치지 않는 기간)
    await createReservation(request, { roomId: 1, ...stay(50, 52), email: uniqueEmail('TC-13') });

    const { checkIn, checkOut } = stay(51, 53);
    const res = await request.get(`/api/hotels/1/rooms?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
    expect(res.status()).toBe(200);
    const { rooms } = await res.json();
    const availability = Object.fromEntries(rooms.map((r: { id: number; available: boolean }) => [r.id, r.available]));
    expect(availability).toEqual({ 1: false, 2: true, 3: true });
  });
});
