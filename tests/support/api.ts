import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { GUEST } from './data';

export type ReservationInput = {
  roomId: unknown;
  checkIn: string;
  checkOut: string;
  guests: unknown;
  name: unknown;
  email: unknown;
  phone: unknown;
};

/** 테스트마다 고유한 이메일 → 병렬 실행 중에도 DB에서 해당 테스트의 예약만 골라낼 수 있음 */
export function uniqueEmail(tag: string): string {
  return `${tag.toLowerCase()}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.com`;
}

export function reservationBody(overrides: Partial<ReservationInput> & Pick<ReservationInput, 'checkIn' | 'checkOut'>) {
  return {
    roomId: 1,
    guests: 2,
    name: GUEST.name,
    email: GUEST.email,
    phone: GUEST.phone,
    ...overrides,
  };
}

export function postReservation(request: APIRequestContext, body: object): Promise<APIResponse> {
  return request.post('/api/reservations', { data: body });
}

/** 사전조건용 예약 생성 (201이 아니면 즉시 실패) */
export async function createReservation(
  request: APIRequestContext,
  overrides: Parameters<typeof reservationBody>[0],
) {
  const res = await postReservation(request, reservationBody(overrides));
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

export async function cancelReservation(request: APIRequestContext, id: string, email: string) {
  return request.post(`/api/reservations/${id}/cancel`, { data: { email } });
}

/**
 * 400 VALIDATION_ERROR 공통 검증. detailsKey가 있으면 error.details에 해당 키가 있는지 확인.
 * 여러 입력값을 반복 검증하는 TC에서 한 건 실패로 나머지가 건너뛰어지지 않도록 soft assertion 사용.
 */
export async function expectValidationError(res: APIResponse, detailsKey?: string) {
  const body = await res.json();
  expect.soft(res.status(), `HTTP status (응답: ${JSON.stringify(body)})`).toBe(400);
  expect.soft(body.error?.code).toBe('VALIDATION_ERROR');
  if (detailsKey) {
    expect.soft(body.error?.details ?? {}, `error.details.${detailsKey} 존재`).toHaveProperty(detailsKey);
  }
  return body;
}
