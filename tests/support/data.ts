/** 결함 이슈 링크 (docs/mini_hotel_test_cases_v2.xlsx '결함 목록' 시트) */
export const ISSUES = {
  PRICE_MISMATCH: 'https://github.com/sophiachae/hotel-booking-qa/issues/1',
  FRONT_OVERLAP: 'https://github.com/sophiachae/hotel-booking-qa/issues/2',
  LOG_PII: 'https://github.com/sophiachae/hotel-booking-qa/issues/3',
  PHONE_FORMAT: 'https://github.com/sophiachae/hotel-booking-qa/issues/5',
  MEMBER_EMAIL_NOT_FIXED: 'https://github.com/sophiachae/hotel-booking-qa/issues/7',
  SESSION_EXPIRED_AS_GUEST: 'https://github.com/sophiachae/hotel-booking-qa/issues/8',
  OAUTH_ERROR_STATE: 'https://github.com/sophiachae/hotel-booking-qa/issues/10',
} as const;

/** 테스트용 예약자 정보 (실제 개인정보 사용 금지) */
export const GUEST = {
  name: '테스트',
  email: 'qa.tester@test.com',
  phone: '010-1234-5678',
} as const;

export function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}
