# CHANGELOG

## v1.1.0 — 회원 기능

### 추가
- 이메일 회원가입 / 로그인 / 로그아웃 (`/api/auth/signup`, `/login`, `/logout`, `/me`)
- 카카오·구글 소셜 로그인 — 로컬 Mock OAuth 서버로 Authorization Code 흐름 재현 (state 검증, 1회용 code, redirect_uri 검증)
- 카카오 이메일 제공 선택 동의, 같은 이메일의 다른 채널 가입 차단 (`ACCOUNT_EXISTS`, `EMAIL_TAKEN`)
- 세션 인증: HttpOnly 쿠키 `sid` + `Authorization: Bearer` 토큰, `SESSION_TTL_MINUTES`로 만료 시간 조절
- 회원 예약: 로그인 상태로 예약하면 `user_id` 연결, 예약자 정보 자동 입력
- 회원 예약 목록 `GET /api/me/reservations`, 내 예약 화면에 목록 표시
- 본인 회원 예약은 이메일 없이 조회·취소
- 비회원 예약 허용 스위치 `GUEST_CHECKOUT` (기본 on, off면 401 `LOGIN_REQUIRED`)
- `GET /api/config`
- 테스트 계정 2개 자동 생성 (`test@minihotel.test`, `test2@minihotel.test` / `Test1234`)
- 화면: `login.html`, `signup.html`, 헤더 로그인 상태 표시

### 변경
- 모든 `VALIDATION_ERROR` 응답에 `details`(필드명 → 메시지) 포함
- 로그에 `user=` 항목 추가, 비밀번호·토큰·OAuth code/state 마스킹
- `reservations` 응답에 `bookedAs`(`MEMBER`/`GUEST`) 추가
- v1.0 DB 자동 마이그레이션 (`reservations.user_id` 컬럼 추가)

## v1.0.0 — 최초 버전
- 호텔 검색, 객실 선택, 비회원 예약, 예약번호+이메일 조회/취소
- 요청/응답 로그, data-testid, 샘플 데이터
