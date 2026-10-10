import { test, expect } from '@playwright/test';
import { stay } from '../support/dates';
import { ISSUES } from '../support/data';
import {
  cancelReservation,
  createReservation,
  expectValidationError,
  postReservation,
  reservationBody,
  uniqueEmail,
} from '../support/api';
import { queryDb, reservationsByEmail } from '../support/db';

// 데이터 격리: UI TC가 객실 1·2·3 / 오늘+30~32를 쓰므로 여기서는 테스트마다 다른 기간(오늘+60일~)을 쓴다.

test.describe('POST /api/reservations', () => {
  // 알려진 결함 #1: 저장 금액이 1박 요금만큼 많음
  // https://github.com/sophiachae/hotel-booking-qa/issues/1
  test('TC-15 예약 생성 응답 검증', async ({ request }) => {
    test.fail(true, `결함 #1 ${ISSUES.PRICE_MISMATCH}`);

    // 객실 ID 2(디럭스 트윈, 160,000원) / 3박 / 3명
    const res = await postReservation(
      request,
      reservationBody({ roomId: 2, ...stay(60, 63), guests: 3, email: uniqueEmail('TC-15') }),
    );

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^RSV-.{8}$/);
    expect(body).toMatchObject({
      status: 'CONFIRMED',
      nights: 3,
      room: { pricePerNight: 160000 },
      cancelledAt: null,
    });
    expect(body.totalPrice).toBe(480000);
  });

  test('TC-16 객실 수용 인원 초과', async ({ request }) => {
    const window = stay(64, 66);

    await test.step('객실 1(정원 2) / guests=3 → 400, DB 행 없음', async () => {
      const email = uniqueEmail('TC-16-over');
      const res = await postReservation(request, reservationBody({ roomId: 1, ...window, guests: 3, email }));
      await expectValidationError(res);
      expect(reservationsByEmail(email)).toHaveLength(0);
    });

    await test.step('같은 조건 guests=2 → 201', async () => {
      const res = await postReservation(
        request,
        reservationBody({ roomId: 1, ...window, guests: 2, email: uniqueEmail('TC-16-ok') }),
      );
      expect(res.status()).toBe(201);
    });
  });

  test('TC-18 체크아웃일=다음 체크인일 허용', async ({ request }) => {
    const email = uniqueEmail('TC-18');
    // 사전조건 R1: 객실 1, 오늘+70~72
    await createReservation(request, { roomId: 1, ...stay(70, 72), email });

    const res = await postReservation(request, reservationBody({ roomId: 1, ...stay(72, 74), email }));
    expect(res.status()).toBe(201);
    expect((await res.json()).status).toBe('CONFIRMED');

    const rows = reservationsByEmail(email);
    expect(rows.filter((r) => r.room_id === 1 && r.status === 'CONFIRMED')).toHaveLength(2);
  });

  test('TC-19 취소된 예약 기간 재예약', async ({ request }) => {
    const window = stay(76, 78);
    const firstEmail = uniqueEmail('TC-19-first');
    const secondEmail = uniqueEmail('TC-19-second');

    // 사전조건: R1 생성 후 취소
    const r1 = await createReservation(request, { roomId: 1, ...window, email: firstEmail });
    expect((await cancelReservation(request, r1.id, firstEmail)).status()).toBe(200);

    const res = await postReservation(request, reservationBody({ roomId: 1, ...window, email: secondEmail }));
    expect(res.status()).toBe(201);

    const rows = queryDb<{ status: string }>(
      'SELECT status FROM reservations WHERE room_id = 1 AND check_in = ? AND check_out = ? ORDER BY status',
      window.checkIn,
      window.checkOut,
    );
    expect(rows.map((r) => r.status)).toEqual(['CANCELLED', 'CONFIRMED']);
  });

  test('TC-20 존재하지 않는 객실', async ({ request }) => {
    const email = uniqueEmail('TC-20');
    const res = await postReservation(request, reservationBody({ roomId: 999, ...stay(60, 62), email }));

    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
    expect(reservationsByEmail(email)).toHaveLength(0);
  });

  test('TC-21 JSON 아닌 본문', async ({ request }) => {
    const res = await request.post('/api/reservations', {
      headers: { 'Content-Type': 'application/json' },
      data: '{roomId:1,',
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_JSON');
    expect(typeof body.error.message).toBe('string');
  });

  test('TC-22 이름 길이 1/50/51자, 빈 값', async ({ request }) => {
    const cases = [
      { label: '1자', name: '가', window: stay(80, 81), ok: true },
      { label: '50자', name: '가'.repeat(50), window: stay(82, 83), ok: true },
      { label: '51자', name: '가'.repeat(51), window: stay(84, 85), ok: false },
      { label: '빈 문자열', name: '', window: stay(86, 87), ok: false },
    ];
    for (const c of cases) {
      await test.step(`이름 ${c.label}`, async () => {
        const res = await postReservation(
          request,
          reservationBody({ roomId: 3, ...c.window, name: c.name, email: uniqueEmail('TC-22') }),
        );
        if (c.ok) expect(res.status()).toBe(201);
        else await expectValidationError(res, 'name');
      });
    }
  });

  // 알려진 결함 #5: 가운데 3자리 전화번호(010-123-4567)가 201로 예약됨. 나머지 입력값은 정상 차단
  // https://github.com/sophiachae/hotel-booking-qa/issues/5
  test('TC-23 전화번호·이메일 형식', async ({ request }) => {
    test.fail(true, `결함 #5 ${ISSUES.PHONE_FORMAT}`);

    await test.step('phone=01012345678 → 201', async () => {
      const res = await postReservation(
        request,
        reservationBody({ roomId: 3, ...stay(90, 91), phone: '01012345678', email: uniqueEmail('TC-23') }),
      );
      expect(res.status()).toBe(201);
    });

    const invalid = [
      { field: 'phone', value: '010-123-4567', window: stay(92, 93) },
      { field: 'phone', value: '010 1234 5678', window: stay(94, 95) },
      { field: 'email', value: 'hong@', window: stay(96, 97) },
      { field: 'email', value: 'hong.test.com', window: stay(98, 99) },
    ] as const;
    for (const c of invalid) {
      await test.step(`${c.field}=${c.value} → 400`, async () => {
        const overrides = c.field === 'phone' ? { phone: c.value, email: uniqueEmail('TC-23') } : { email: c.value };
        const res = await postReservation(request, reservationBody({ roomId: 3, ...c.window, ...overrides }));
        await expectValidationError(res, c.field);
      });
    }
  });
});

test.describe('GET /api/reservations/:id', () => {
  test('TC-26 조회 시 이메일 불일치·누락', async ({ request }) => {
    const email = uniqueEmail('TC-26');
    // 사전조건 R1: 객실 1, 오늘+100~102
    const r1 = await createReservation(request, { roomId: 1, ...stay(100, 102), email });

    await test.step('① 이메일 불일치 → 404, 개인정보 미노출', async () => {
      const res = await request.get(`/api/reservations/${r1.id}?email=other@test.com`);
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
      const raw = await res.text();
      expect(raw).not.toContain(r1.guestName);
      expect(raw).not.toContain(r1.phone);
    });

    await test.step('② 이메일 누락 → 400', async () => {
      const res = await request.get(`/api/reservations/${r1.id}`);
      await expectValidationError(res);
    });

    await test.step('③ 없는 예약번호 → 404', async () => {
      const res = await request.get(`/api/reservations/RSV-00000000?email=${encodeURIComponent(email)}`);
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    });
  });
});

test.describe('POST /api/reservations/:id/cancel', () => {
  test('TC-29 이미 취소된 예약 재취소', async ({ request }) => {
    const email = uniqueEmail('TC-29');
    // 사전조건: R1(객실 1, 오늘+104~106) 생성 후 취소
    const r1 = await createReservation(request, { roomId: 1, ...stay(104, 106), email });
    const first = await (await cancelReservation(request, r1.id, email)).json();
    expect(first.cancelledAt).not.toBeNull();

    const res = await cancelReservation(request, r1.id, email);
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('ALREADY_CANCELLED');

    // cancelled_at이 첫 취소 시각 그대로인지 DB에서 확인
    const [row] = reservationsByEmail(email);
    expect(row.cancelled_at).toBe(first.cancelledAt);
  });
});
