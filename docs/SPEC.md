# 앱 명세: 미니 호텔 예약 웹앱 (Mini Hotel Booking)

> [← QA 포트폴리오 소개(README)로 돌아가기](../README.md)

QA 포트폴리오용 **테스트 대상 애플리케이션**입니다.
호텔 검색 → 객실 선택 → 예약 → 예약 조회/취소까지의 흐름을 갖춘 작은 웹앱으로,
UI 자동화(Playwright/Selenium/Cypress), API 테스트(Postman/REST Assured/Jest+Supertest),
DB 검증, 로그 분석 연습에 사용할 수 있습니다.

> ⚠️ 이 앱은 QA 실습용 테스트 대상이며 의도적인 결함이 포함되어 있습니다. 발견한 결함은 [Issues](https://github.com/sophiachae/hotel-booking-qa/issues)에 정리했습니다.

---

## 1. 실행 방법

**요구사항:** Node.js 18 이상 (권장 20/22 LTS)

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

환경 변수: `PORT`(기본 3000), `DB_PATH`(기본 `data/hotel.db`), `LOG_DIR`(기본 `logs`)

> 테스트 전 깨끗한 상태가 필요하면: 서버 종료 → `npm run reset` → `npm start`

### 폴더 구조

```
mini-hotel/
├─ server.js            # Express 앱 진입점, 에러 핸들러
├─ src/
│  ├─ db.js             # SQLite 스키마 + 샘플 데이터
│  ├─ routes.js         # API 라우트
│  ├─ utils.js          # 검증 유틸, 에러 클래스
│  └─ logger.js         # logs/app.log 기록
├─ public/              # 프론트엔드 (순수 HTML/JS)
│  ├─ index.html        # 1. 호텔 검색
│  ├─ results.html      # 2. 검색 결과
│  ├─ hotel.html        # 2. 호텔 상세 / 객실 선택
│  ├─ book.html         # 3. 예약 정보 입력
│  ├─ complete.html     # 3. 예약 완료
│  ├─ my.html           # 4. 내 예약 조회 / 취소
│  ├─ app.js, style.css
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
| 404 | `NOT_FOUND` | 호텔/객실/예약 없음, 예약번호-이메일 불일치, 없는 API |
| 409 | `ROOM_UNAVAILABLE` | 이미 예약된 날짜의 객실 |
| 409 | `ALREADY_CANCELLED` | 이미 취소된 예약을 다시 취소 |
| 409 | `CANCELLATION_CLOSED` | 체크인 당일 이후 취소 시도 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

### 공통 검증 규칙

- 날짜: `YYYY-MM-DD`, 실제 존재하는 날짜
- 체크인 ≥ 오늘, 체크아웃 > 체크인, 최대 30박
- 인원(`guests`): 1~10 정수
- 이름: 1~50자 / 이메일: 일반 이메일 형식 / 전화번호: `010-1234-5678` 또는 `01012345678`

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
에러: `400`(검증 실패, 수용 인원 초과), `404`(객실 없음), `409`(이미 예약된 객실)

### GET `/api/reservations/:id?email=`

예약번호 + 이메일(대소문자 무시)이 모두 일치해야 조회됩니다.
에러: `400`(email 누락), `404`(없음 또는 이메일 불일치)

### POST `/api/reservations/:id/cancel`

본문: `{ "email": "hong@test.com" }` → `200` + 취소된 예약 객체(`status: "CANCELLED"`, `cancelledAt` 채워짐)
에러: `400`(email 누락), `404`(없음/불일치), `409`(이미 취소, 체크인 당일 이후)

### (부가) GET `/api/cities`

검색 화면 드롭다운용 도시 목록. `["부산","서울","제주"]`

---

## 4. DB 테이블 구조 (SQLite)

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
sqlite3 data/hotel.db "SELECT id, room_id, check_in, check_out, nights, total_price, status FROM reservations;"
```

---

## 5. 로그

모든 `/api` 요청이 `logs/app.log`에 한 줄씩 기록됩니다. 4xx/5xx는 `ERROR`, 그 외는 `INFO`.
500 에러는 스택 트레이스가 추가 줄로 기록됩니다.

형식: `시간 [레벨] 메서드 경로 params={쿼리+본문} status=코드 result=요약 (소요시간)`

```
2026-11-01 10:00:01.123 [INFO] GET /api/hotels params={"city":"서울","checkIn":"2026-11-10","checkOut":"2026-11-12","guests":"2"} status=200 result=count=2 (3.1ms)
2026-11-01 10:00:09.456 [INFO] POST /api/reservations params={"roomId":1,…} status=201 result=reservationId=RSV-1A2B3C4D status=CONFIRMED totalPrice=240000 (8.2ms)
2026-11-01 10:00:12.789 [ERROR] POST /api/reservations params={"roomId":1,…} status=409 result=ROOM_UNAVAILABLE: 선택한 날짜에 이미 예약된 객실입니다. (1.4ms)
```

---

## 6. data-testid 목록

공통 헤더: `nav-home`, `nav-search`, `nav-my-reservation`

| 화면 | data-testid |
|---|---|
| 검색 (`index.html`) | `search-form`, `search-city`, `search-checkin`, `search-checkout`, `search-guests`, `search-submit`, `search-error` |
| 결과 (`results.html`) | `results-summary`, `results-modify-search`, `results-loading`, `results-error`, `results-empty`, `hotel-list`, `hotel-card-{id}`, `hotel-name-{id}`, `hotel-min-price-{id}`, `hotel-available-rooms-{id}`, `hotel-detail-btn-{id}` |
| 상세 (`hotel.html`) | `hotel-back-to-results`, `hotel-loading`, `hotel-error`, `hotel-detail`, `hotel-name`, `hotel-address`, `hotel-rating`, `hotel-description`, `hotel-stay-summary`, `room-list`, `room-card-{id}`, `room-name-{id}`, `room-capacity-{id}`, `room-price-{id}`, `room-total-{id}`, `room-select-btn-{id}` |
| 예약 입력 (`book.html`) | `booking-loading`, `booking-error`, `booking-section`, `booking-summary`, `booking-hotel-name`, `booking-room-name`, `booking-dates`, `booking-nights`, `booking-guests`, `booking-price-per-night`, `booking-total`, `booking-form`, `guest-name`, `guest-email`, `guest-phone`, `guest-name-error`, `guest-email-error`, `guest-phone-error`, `booking-submit` |
| 예약 완료 (`complete.html`) | `complete-message`, `complete-section`, `reservation-id`, `complete-details`, `complete-hotel-name`, `complete-room-name`, `complete-dates`, `complete-nights`, `complete-guests`, `complete-guest-name`, `complete-total`, `complete-go-my-reservation`, `complete-go-home` |
| 내 예약 (`my.html`) | `lookup-form`, `lookup-id`, `lookup-email`, `lookup-submit`, `lookup-error`, `reservation-detail`, `reservation-detail-id`, `reservation-status`, `reservation-hotel-name`, `reservation-room-name`, `reservation-dates`, `reservation-nights`, `reservation-guests`, `reservation-guest-name`, `reservation-email`, `reservation-phone`, `reservation-created-at`, `reservation-cancelled-row`, `reservation-cancelled-at`, `reservation-total`, `cancel-btn`, `cancel-confirm`, `cancel-confirm-yes`, `cancel-confirm-no`, `cancel-result`, `cancel-error` |

`reservation-status`는 화면에 한글("예약 확정"/"취소됨")로 표시되고, `data-status` 속성에 `CONFIRMED`/`CANCELLED` 원본 값이 들어 있습니다.

```js
// Playwright 예시
await page.getByTestId('search-city').selectOption('서울');
await expect(page.getByTestId('reservation-status')).toHaveAttribute('data-status', 'CANCELLED');
```

예약 취소 확인은 브라우저 `confirm()` 대신 페이지 내 패널(`cancel-confirm`)을 사용하므로 dialog 처리가 필요 없습니다.
