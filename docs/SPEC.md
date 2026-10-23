# 앱 명세: 미니 호텔 예약 웹앱 (Mini Hotel Booking) v1.2

> [← QA 포트폴리오 소개(README)로 돌아가기](../README.md) · [변경 내역(CHANGELOG)](CHANGELOG.md)

QA 포트폴리오용 **테스트 대상 애플리케이션**입니다.
호텔 검색 → 객실 선택 → 예약 → 예약 조회/취소까지의 흐름을 갖춘 작은 웹앱으로,
UI 자동화(Playwright/Selenium/Cypress), API 테스트(Postman/REST Assured/Jest+Supertest),
DB 검증, 로그 분석 연습에 사용할 수 있습니다.

**v1.1**부터 회원 기능이 추가되었습니다: 이메일 회원가입·로그인, 카카오·구글 소셜 로그인(Mock OAuth),
회원 예약 내역, 비회원 예약 허용 여부 스위치. 변경 내역은 `CHANGELOG.md`를 참고하세요.

**v1.2**부터 PostHog 이벤트 트래킹이 추가되었습니다 (`POSTHOG_KEY`가 있을 때만 동작). 이벤트 명세는 `EVENTS.md`를 참고하세요.

> ⚠️ 이 앱에는 **의도적으로 심어 둔 버그 2개**가 있고, v1.2에서 2개가 더 추가되었습니다. 직접 찾아본 뒤 `BUGS_SPOILER.md`에서 확인하세요.

---

## 1. 실행 방법

**요구사항:** Node.js 20 이상 (테스트에 쓰는 Playwright 1.64의 요구 버전, 권장 22 LTS)

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 접속.

| 명령 | 설명 |
|---|---|
| `npm start` | 서버 실행. DB가 비어 있으면 샘플 데이터 자동 생성 |
| `npm run reset` | DB 파일 삭제 (다음 `npm start` 때 샘플 데이터로 초기화) |
| `PORT=4000 npm start` | 포트 변경 |
| `GUEST_CHECKOUT=off npm start` | 회원 전용 예약 모드 (비회원 예약 차단) |

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `DB_PATH` | `data/hotel.db` | SQLite 파일 경로 |
| `LOG_DIR` | `logs` | 로그 폴더 |
| `GUEST_CHECKOUT` | `on` | `off`/`false`/`0`이면 비회원 예약 불가 (401 `LOGIN_REQUIRED`) |
| `SESSION_TTL_MINUTES` | `10080` (7일) | 로그인 세션 유효 시간. 만료 테스트 시 `1` 등으로 줄여서 사용 |
| `POSTHOG_KEY` | (없음) | PostHog 프로젝트 API 키. 없으면 이벤트 트래킹 꺼짐 (`EVENTS.md`) |
| `POSTHOG_HOST` | `https://eu.i.posthog.com` | PostHog 주소 |

> Windows PowerShell: `$env:GUEST_CHECKOUT="off"; npm start`

### 테스트 계정

| 구분 | 계정 | 비밀번호 / 방법 |
|---|---|---|
| 이메일 회원 | `test@minihotel.test` (테스트회원) | `Test1234` |
| 이메일 회원 | `test2@minihotel.test` (두번째회원) | `Test1234` — 권한(타인 예약 접근) 테스트용 |
| 카카오 (Mock) | `kakao.tester@kakao.test`, `kakao.second@kakao.test` | 로그인 → "카카오로 로그인" → 계정 선택 |
| 구글 (Mock) | `google.tester@gmail.test`, `google.second@gmail.test` | 로그인 → "구글로 로그인" → 계정 선택 |

Mock 로그인 화면의 "다른 테스트 계정으로 로그인"에 임의 이름·이메일을 넣으면 새 소셜 계정을 만들 수 있습니다.
이메일 회원 2명은 서버 시작 시 `users` 테이블이 비어 있으면 자동 생성됩니다. 소셜 계정은 처음 로그인할 때 가입됩니다.

> 테스트 전 깨끗한 상태가 필요하면: 서버 종료 → `npm run reset` → `npm start`

### 폴더 구조

```
mini-hotel/
├─ server.js            # Express 앱 진입점, 에러 핸들러
├─ src/
│  ├─ db.js             # SQLite 스키마 + 마이그레이션 + 샘플 데이터
│  ├─ routes.js         # 호텔/예약 API
│  ├─ auth.js           # 회원가입·로그인·세션·OAuth 콜백
│  ├─ mockOAuth.js      # 로컬 Mock OAuth 서버 (카카오/구글 흉내)
│  ├─ password.js       # 비밀번호 해시 (scrypt)
│  ├─ analytics.js      # PostHog 서버 이벤트 (posthog-node)
│  ├─ config.js         # 환경 변수 설정
│  ├─ utils.js          # 검증 유틸, 에러 클래스
│  └─ logger.js         # logs/app.log 기록 (비밀번호 등 마스킹)
├─ public/              # 프론트엔드 (순수 HTML/JS)
│  ├─ index.html        # 1. 호텔 검색
│  ├─ results.html      # 2. 검색 결과
│  ├─ hotel.html        # 2. 호텔 상세 / 객실 선택
│  ├─ book.html         # 3. 예약 정보 입력
│  ├─ complete.html     # 3. 예약 완료
│  ├─ my.html           # 4. 내 예약 조회 / 취소 (회원 예약 내역 포함)
│  ├─ login.html        # 로그인 (이메일 / 카카오 / 구글)
│  ├─ signup.html       # 이메일 회원가입
│  ├─ app.js, style.css
│  ├─ analytics.js      # PostHog 화면 이벤트 (공식 스니펫, 키 없으면 꺼짐)
├─ scripts/reset-db.js
├─ data/hotel.db        # (자동 생성)
└─ logs/app.log         # (자동 생성)
```

---

## 2. 화면 흐름

```
[index] 호텔 검색 ─▶ [results] 검색 결과 ─▶ [hotel] 상세/객실 선택
                                                   │
[my] 내 예약 조회/취소 ◀─ [complete] 예약 완료 ◀─ [book] 예약 정보 입력
```

화면 간 상태는 URL 쿼리스트링으로 전달됩니다.
예: `hotel.html?id=1&checkIn=2026-11-10&checkOut=2026-11-12&guests=2`

### 로그인 흐름

```
[아무 화면] 헤더 "로그인" ─▶ [login] ─┬─ 이메일/비밀번호 ───────────────────────────▶ returnTo 화면으로 복귀
                                     ├─ 카카오/구글 ─▶ [Mock OAuth 계정 선택] ─▶ 콜백 ─▶ returnTo 화면으로 복귀
                                     └─ 회원가입 ─▶ [signup] ──────────────────────────▶ returnTo 화면으로 복귀
```

- 로그인 화면은 `returnTo` 파라미터로 원래 화면에 돌아갑니다. 예약 입력 중 로그인하면 같은 예약 화면으로 돌아옵니다.
- 회원으로 예약하면 이름·이메일·전화번호가 자동 입력되고, 이메일은 계정 이메일로 고정됩니다.
- 비회원 예약 허용(기본): 예약 화면에 "로그인하면 편해요" 안내가 보이고 비회원도 예약할 수 있습니다.
- 회원 전용(`GUEST_CHECKOUT=off`): 비로그인 상태에서는 예약 폼 대신 "로그인하고 예약하기" 안내가 보입니다.

### Mock OAuth (카카오·구글)

실제 카카오·구글 서버 대신, 앱에 포함된 **Mock OAuth 서버**(`/mock-oauth/...`)가 동일한 Authorization Code 흐름을 흉내 냅니다.
실서비스의 소셜 로그인은 봇 차단·캡차 때문에 자동화가 어렵기 때문에 테스트 환경에서 Mock provider로 대체하는 방식입니다.

```
1. GET  /api/auth/oauth/{kakao|google}/start?returnTo=/my.html
        → state 생성, oauth_state 쿠키 저장, Mock 인증 화면으로 302
2. GET  /mock-oauth/{provider}/authorize?client_id&redirect_uri&state   (계정 선택 화면)
3. POST /mock-oauth/{provider}/authorize                                (계정 선택 → code 발급)
        → redirect_uri?code=…&state=… 로 302
4. GET  /api/auth/oauth/{provider}/callback?code&state
        → state 검증, code 교환(1회용, 60초), 회원 조회/가입, 세션 발급 → returnTo로 302
```

| 콜백 실패 코드 (`login.html?error=`) | 상황 |
|---|---|
| `OAUTH_CANCELLED` | Mock 화면에서 "취소" |
| `INVALID_STATE` | state 쿠키 없음/불일치 (CSRF 방어) |
| `INVALID_CODE` | code가 없거나, 만료(60초)됐거나, 이미 사용됨 |
| `EMAIL_CONSENT_REQUIRED` | 카카오에서 "[선택] 이메일 제공 동의"를 해제 |
| `ACCOUNT_EXISTS` | 같은 이메일이 다른 방법으로 이미 가입됨 (`&provider=EMAIL` 등 함께 전달) |

- Mock 서버는 `client_id`와 `redirect_uri`(같은 호스트의 해당 provider 콜백 경로만 허용)를 검증하고, 틀리면 400을 반환합니다.
- `returnTo`는 `/`로 시작하는 같은 사이트 경로만 허용됩니다. `//evil.com` 같은 값은 `/index.html`로 바뀝니다 (오픈 리다이렉트 방지).

---

## 3. API

모든 응답은 JSON입니다. 에러 응답 형식:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { "email": "…" } } }
```

| 상태 | code | 상황 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 필수값 누락, 형식 오류, 날짜/인원 규칙 위반 |
| 400 | `INVALID_JSON` | 요청 본문이 JSON이 아님 |
| 401 | `UNAUTHORIZED` | 로그인이 필요한 API를 비로그인으로 호출 |
| 401 | `INVALID_CREDENTIALS` | 이메일 또는 비밀번호 불일치 (어느 쪽이 틀렸는지 구분하지 않음) |
| 401 | `LOGIN_REQUIRED` | 회원 전용 모드에서 비회원 예약 시도 |
| 409 | `EMAIL_TAKEN` | 이미 가입된 이메일로 회원가입 (소셜 계정 포함) |
| 404 | `NOT_FOUND` | 호텔/객실/예약 없음, 예약번호-이메일 불일치, 없는 API |
| 409 | `ROOM_UNAVAILABLE` | 이미 예약된 날짜의 객실 |
| 409 | `ALREADY_CANCELLED` | 이미 취소된 예약을 다시 취소 |
| 409 | `CANCELLATION_CLOSED` | 체크인 당일 이후 취소 시도 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

`VALIDATION_ERROR`는 항상 `details`에 문제가 된 필드 이름을 키로 담습니다. 예: `{ "guests": "guests는 1~10 사이의 정수여야 합니다." }`

### 인증 방식

로그인·회원가입에 성공하면 두 가지가 동시에 발급됩니다. 둘 중 하나만 보내면 됩니다.
- 쿠키 `sid` (HttpOnly, SameSite=Lax) — 브라우저/UI 테스트용
- 응답 본문의 `token` → `Authorization: Bearer <token>` 헤더 — Postman/API 테스트용

### 공통 검증 규칙

- 날짜: `YYYY-MM-DD`, 실제 존재하는 날짜
- 체크인 ≥ 오늘, 체크아웃 > 체크인, 최대 30박
- 인원(`guests`): 1~10 정수
- 이름: 1~50자 / 이메일: 일반 이메일 형식 / 전화번호: `010-1234-5678` 또는 `01012345678`
- 비밀번호: 영문과 숫자를 포함한 8~64자
- 이메일은 대소문자를 구분하지 않습니다 (가입·로그인·예약 조회 모두)

### POST `/api/auth/signup`

```json
{ "name": "홍길동", "email": "hong@test.com", "password": "Abcd1234", "phone": "010-1234-5678" }
```
`phone`은 선택. `201` → `{ "user": {…}, "token": "…" }` + `sid` 쿠키 (가입 즉시 로그인)
에러: `400`(검증), `409 EMAIL_TAKEN`

### POST `/api/auth/login`

`{ "email": "test@minihotel.test", "password": "Test1234" }` → `200 { "user": {…}, "token": "…" }`
에러: `400`(누락), `401 INVALID_CREDENTIALS` (소셜 가입 계정은 비밀번호가 없어 항상 401)

### POST `/api/auth/logout`

세션 삭제 + 쿠키 제거. 로그인 상태가 아니어도 `200 { "ok": true }`

### GET `/api/auth/me`

`200 { "user": { "id", "email", "name", "phone", "provider": "EMAIL|KAKAO|GOOGLE", "createdAt" } }`
비로그인이면 `200 { "user": null }` (화면마다 호출하므로 401 대신 null로 응답)

### GET `/api/me/reservations` 🔒

로그인한 회원의 예약 목록 (최신순, 취소 포함). 비로그인 `401 UNAUTHORIZED`.
비회원으로 한 예약은 같은 이메일이어도 회원 목록에 포함되지 않습니다.

### GET `/api/config`

`{ "guestCheckout": true, "loginProviders": ["email", "kakao", "google"], "posthog": null }`

`posthog`는 `POSTHOG_KEY`가 있으면 `{ "key": "phc_...", "host": "https://eu.i.posthog.com" }`, 없으면 `null` (v1.2).


### GET `/api/hotels`

검색 조건에 맞고 **해당 기간에 예약 가능한 객실이 1개 이상** 있는 호텔 목록.

| 파라미터 | 필수 | 예 |
|---|---|---|
| `city` | O | `서울` |
| `checkIn` | O | `2026-11-10` |
| `checkOut` | O | `2026-11-12` |
| `guests` | O | `2` |

```json
[{ "id": 1, "name": "서울 그랜드 호텔", "city": "서울", "address": "…", "rating": 4.6,
   "description": "…", "minPrice": 120000, "availableRooms": 3 }]
```
결과가 없으면 `200 []`.

### GET `/api/hotels/:id/rooms`

호텔 정보와 객실 목록. 쿼리 `checkIn`, `checkOut`, `guests`(선택)를 주면 `available`이 계산됩니다.

```json
{ "hotel": { "id": 1, "name": "…", … },
  "rooms": [{ "id": 1, "name": "스탠다드 더블", "capacity": 2, "pricePerNight": 120000, "available": true }] }
```
에러: `400`(id 형식/날짜 오류), `404`(호텔 없음)

### POST `/api/reservations`

```json
{ "roomId": 1, "checkIn": "2026-11-10", "checkOut": "2026-11-12", "guests": 2,
  "name": "홍길동", "email": "hong@test.com", "phone": "010-1234-5678" }
```
`201` 응답 (예약 객체):
```json
{ "id": "RSV-1A2B3C4D", "status": "CONFIRMED",
  "hotel": { "id": 1, "name": "서울 그랜드 호텔", "city": "서울" },
  "room": { "id": 1, "name": "스탠다드 더블", "pricePerNight": 120000 },
  "checkIn": "2026-11-10", "checkOut": "2026-11-12", "nights": 2, "guests": 2,
  "guestName": "홍길동", "email": "hong@test.com", "phone": "010-1234-5678",
  "totalPrice": 240000, "createdAt": "2026-…Z", "cancelledAt": null }
```
에러: `400`(검증 실패, 수용 인원 초과), `401 LOGIN_REQUIRED`(회원 전용 모드에서 비로그인), `404`(객실 없음), `409`(이미 예약된 객실)

로그인 상태로 요청하면 회원 예약(`bookedAs: "MEMBER"`)으로 저장되고, 아니면 비회원 예약(`"GUEST"`)입니다.

### GET `/api/reservations/:id?email=`

- 본인 회원 예약: 로그인 상태면 `email` 없이 조회 가능
- 그 외(비회원 예약, 다른 회원의 예약): 예약번호 + 이메일(대소문자 무시)이 모두 일치해야 조회
에러: `400`(email 누락), `404`(없음 또는 이메일 불일치)

### POST `/api/reservations/:id/cancel`

본문: `{ "email": "hong@test.com" }` → `200` + 취소된 예약 객체(`status: "CANCELLED"`, `cancelledAt` 채워짐)
본인 회원 예약은 로그인 상태에서 `{}`로 취소 가능 (조회와 같은 접근 규칙)
에러: `400`(email 누락), `404`(없음/불일치), `409`(이미 취소, 체크인 당일 이후)

### (부가) GET `/api/cities`

검색 화면 드롭다운용 도시 목록. `["부산","서울","제주"]`

---

## 4. DB 테이블 구조 (SQLite)

v1.0 DB 파일을 그대로 두고 v1.1을 실행하면 `users`, `sessions` 테이블이 생기고 `reservations.user_id` 컬럼이 자동 추가됩니다.

### hotels
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | INTEGER PK | 자동 증가 |
| name | TEXT | 호텔명 |
| city | TEXT | 도시 (서울/부산/제주) |
| address | TEXT | 주소 |
| rating | REAL | 평점 |
| description | TEXT | 소개 |

### rooms
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | INTEGER PK | 자동 증가 |
| hotel_id | INTEGER FK → hotels.id | |
| name | TEXT | 객실명 |
| capacity | INTEGER | 최대 인원 |
| price_per_night | INTEGER | 1박 요금(원) |

### reservations
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | 예약번호 `RSV-XXXXXXXX` |
| room_id | INTEGER FK → rooms.id | |
| guest_name | TEXT | 예약자 이름 |
| email | TEXT | 이메일 |
| phone | TEXT | 전화번호 |
| check_in | TEXT | `YYYY-MM-DD` |
| check_out | TEXT | `YYYY-MM-DD` |
| guests | INTEGER | 인원 |
| nights | INTEGER | 숙박일수 |
| total_price | INTEGER | 총 결제 금액(원) |
| status | TEXT | `CONFIRMED` / `CANCELLED` (CHECK 제약) |
| created_at | TEXT | ISO 8601 (UTC) |
| cancelled_at | TEXT NULL | 취소 시각 |
| user_id | INTEGER NULL FK → users.id | 회원 예약이면 회원 id, 비회원 예약이면 NULL |

### users
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | INTEGER PK | 자동 증가 |
| email | TEXT UNIQUE (NOCASE) | 로그인 채널과 관계없이 이메일 1개당 계정 1개 |
| password_hash | TEXT NULL | scrypt 해시. 소셜 가입 계정은 NULL |
| name | TEXT | 이름 |
| phone | TEXT NULL | 전화번호 (소셜 가입은 NULL) |
| provider | TEXT | `EMAIL` / `KAKAO` / `GOOGLE` |
| provider_user_id | TEXT NULL | 소셜 provider의 사용자 id. (provider, provider_user_id) UNIQUE |
| created_at | TEXT | ISO 8601 (UTC) |

### sessions
| 컬럼 | 타입 | 설명 |
|---|---|---|
| token | TEXT PK | 세션 토큰 (쿠키 `sid` / Bearer 토큰 값) |
| user_id | INTEGER FK → users.id | |
| created_at | TEXT | 발급 시각 |
| expires_at | TEXT | 만료 시각 (`SESSION_TTL_MINUTES`) |

예약 겹침 규칙: 같은 객실에서 `CONFIRMED` 예약끼리 숙박 기간이 하루라도 겹치면 안 됩니다.
체크아웃 날짜 = 다음 손님의 체크인 날짜는 허용됩니다.

### 샘플 데이터

| 도시 | 호텔 (id) | 객실 (id: 이름 / 인원 / 1박 요금) |
|---|---|---|
| 서울 | 서울 그랜드 호텔 (1) | 1: 스탠다드 더블 / 2 / 120,000 · 2: 디럭스 트윈 / 3 / 160,000 · 3: 이그제큐티브 스위트 / 4 / 280,000 |
| 서울 | 한강 리버뷰 호텔 (2) | 4: 스탠다드 더블 / 2 / 95,000 · 5: 패밀리 룸 / 4 / 150,000 |
| 부산 | 해운대 오션 리조트 (3) | 6: 오션뷰 더블 / 2 / 140,000 · 7: 오션뷰 패밀리 / 4 / 210,000 · 8: 펜트하우스 / 6 / 450,000 |
| 부산 | 광안 브릿지 스테이 (4) | 9: 스탠다드 더블 / 2 / 85,000 · 10: 디럭스 트리플 / 3 / 120,000 |
| 제주 | 제주 포레스트 리조트 (5) | 11: 가든 더블 / 2 / 130,000 · 12: 포레스트 빌라 / 5 / 320,000 |
| 제주 | 성산 선라이즈 호텔 (6) | 13: 스탠다드 더블 / 2 / 90,000 · 14: 오션뷰 트윈 / 3 / 125,000 · 15: 패밀리 스위트 / 4 / 170,000 |

DB 직접 확인 예:
```bash
sqlite3 data/hotel.db "SELECT id, room_id, user_id, check_in, check_out, nights, total_price, status FROM reservations;"
sqlite3 data/hotel.db "SELECT id, email, provider, provider_user_id FROM users;"
```

---

## 5. 로그

모든 `/api` 요청이 `logs/app.log`에 한 줄씩 기록됩니다. 4xx/5xx와 소셜 로그인 실패는 `ERROR`, 그 외는 `INFO`.
500 에러는 스택 트레이스가 추가 줄로 기록됩니다.

형식: `시간 [레벨] 메서드 경로 user=회원id(비로그인은 -) params={쿼리+본문} status=코드 result=요약 (소요시간)`

- `password`, `passwordConfirm`, `token`, `code`, `state` 값은 `***`로 마스킹됩니다.
- Mock OAuth 서버의 계정 선택·요청 거부도 `MOCK-OAUTH …` 줄로 기록됩니다.

```
2026-11-01 10:00:01.123 [INFO] GET /api/hotels params={"city":"서울","checkIn":"2026-11-10","checkOut":"2026-11-12","guests":"2"} status=200 result=count=2 (3.1ms)
2026-11-01 10:00:09.456 [INFO] POST /api/reservations params={"roomId":1,…} status=201 result=reservationId=RSV-1A2B3C4D status=CONFIRMED totalPrice=240000 (8.2ms)
2026-11-01 10:00:12.789 [ERROR] POST /api/reservations params={"roomId":1,…} status=409 result=ROOM_UNAVAILABLE: 선택한 날짜에 이미 예약된 객실입니다. (1.4ms)
2026-11-01 10:01:02.111 [ERROR] POST /api/auth/login user=- params={"email":"test@minihotel.test","password":"***"} status=401 result=INVALID_CREDENTIALS: 이메일 또는 비밀번호가 올바르지 않습니다. (60.2ms)
2026-11-01 10:01:30.222 [INFO] GET /api/auth/oauth/kakao/callback user=- params={"code":"***","state":"***"} status=302 result=userId=3 provider=KAKAO redirect=/my.html (0.9ms)
```

---

## 6. data-testid 목록

공통 헤더: `nav-home`, `nav-search`, `nav-my-reservation`, `nav-auth`, `nav-login`(비로그인), `nav-user-name`·`nav-logout`(로그인)

| 화면 | data-testid |
|---|---|
| 검색 (`index.html`) | `search-form`, `search-city`, `search-checkin`, `search-checkout`, `search-guests`, `search-submit`, `search-error` |
| 결과 (`results.html`) | `results-summary`, `results-modify-search`, `results-loading`, `results-error`, `results-empty`, `hotel-list`, `hotel-card-{id}`, `hotel-name-{id}`, `hotel-min-price-{id}`, `hotel-available-rooms-{id}`, `hotel-detail-btn-{id}` |
| 상세 (`hotel.html`) | `hotel-back-to-results`, `hotel-loading`, `hotel-error`, `hotel-detail`, `hotel-name`, `hotel-address`, `hotel-rating`, `hotel-description`, `hotel-stay-summary`, `room-list`, `room-card-{id}`, `room-name-{id}`, `room-capacity-{id}`, `room-price-{id}`, `room-total-{id}`, `room-select-btn-{id}` |
| 로그인 (`login.html`) | `login-form`, `login-email`, `login-password`, `login-email-error`, `login-password-error`, `login-submit`, `login-error`(`data-code`에 에러 코드), `login-kakao`, `login-google`, `login-signup-link` |
| 회원가입 (`signup.html`) | `signup-form`, `signup-name`, `signup-email`, `signup-password`, `signup-password-confirm`, `signup-phone`, `signup-{name\|email\|password\|password-confirm\|phone}-error`, `signup-submit`, `signup-error`, `signup-login-link` |
| Mock OAuth (`/mock-oauth/...`) | `mock-oauth-page`(`data-provider`), `mock-account-{계정id}` (예: `mock-account-kakao-1001`), `mock-consent-email`(카카오만), `mock-cancel`, `mock-custom-name`, `mock-custom-email`, `mock-custom-submit`, `mock-error` |
| 예약 입력 (`book.html`) | `booking-login-required`, `booking-login-btn`, `booking-member-notice`, `booking-guest-notice`, `booking-guest-login-link`, `booking-loading`, `booking-error`, `booking-section`, `booking-summary`, `booking-hotel-name`, `booking-room-name`, `booking-dates`, `booking-nights`, `booking-guests`, `booking-price-per-night`, `booking-total`, `booking-form`, `guest-name`, `guest-email`, `guest-phone`, `guest-name-error`, `guest-email-error`, `guest-phone-error`, `booking-submit` |
| 예약 완료 (`complete.html`) | `complete-message`, `complete-section`, `reservation-id`, `complete-details`, `complete-hotel-name`, `complete-room-name`, `complete-dates`, `complete-nights`, `complete-guests`, `complete-guest-name`, `complete-total`, `complete-go-my-reservation`, `complete-go-home` |
| 내 예약 (`my.html`) | `my-reservations-section`, `my-reservations-loading`, `my-reservations-empty`, `my-reservation-list`, `my-reservation-item-{예약번호}`(`data-status`), `my-login-hint`, `my-login-link`, `lookup-title`, `lookup-form`, `lookup-id`, `lookup-email`, `lookup-submit`, `lookup-error`, `reservation-detail`, `reservation-detail-id`, `reservation-status`, `reservation-hotel-name`, `reservation-room-name`, `reservation-dates`, `reservation-nights`, `reservation-guests`, `reservation-guest-name`, `reservation-email`, `reservation-phone`, `reservation-created-at`, `reservation-cancelled-row`, `reservation-cancelled-at`, `reservation-total`, `cancel-btn`, `cancel-confirm`, `cancel-confirm-yes`, `cancel-confirm-no`, `cancel-result`, `cancel-error` |

`reservation-status`는 화면에 한글("예약 확정"/"취소됨")로 표시되고, `data-status` 속성에 `CONFIRMED`/`CANCELLED` 원본 값이 들어 있습니다.

```js
// Playwright 예시
await page.getByTestId('search-city').selectOption('서울');
await expect(page.getByTestId('reservation-status')).toHaveAttribute('data-status', 'CANCELLED');
```

예약 취소 확인은 브라우저 `confirm()` 대신 페이지 내 패널(`cancel-confirm`)을 사용하므로 dialog 처리가 필요 없습니다.
