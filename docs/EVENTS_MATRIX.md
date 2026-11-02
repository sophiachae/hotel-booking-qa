# 기능별 이벤트 매트릭스 (release/1.2)

> 근거: [EVENTS.md](EVENTS.md) 줄 번호(`L`), [SPEC.md](SPEC.md) 화면·API · 모호한 점: [EVENTS_REVIEW.md](EVENTS_REVIEW.md) 번호

- 트래킹이 켜진 상태(`POSTHOG_KEY` 있음)가 기준입니다.
- 모든 화면 진입 시 `$pageview`, 떠날 때 `$pageleave`가 자동 수집됩니다 (L21). 아래 표에서는 따로 적지 않습니다.
- 모든 이벤트 속성에 이메일·전화번호·이름이 없어야 합니다 (L38).

## 공통 (헤더·환경)

| 화면 / 동작 | 이벤트 | 주요 속성 | 근거 | 비고 |
|---|---|---|---|---|
| 키 없이 실행 | 없음 (PostHog 요청 0건) | `/api/config`의 `posthog: null` | L12, L19, L170 | A7 |
| 헤더 로그아웃 성공 | `logout` → `reset()` | 없음 | L31, L58, L164 | `sendBeacon` 사용. D23·D24 |
| 헤더 로그아웃 API 실패 | 모호 | - | L58 | D23 |
| 로그인 상태로 화면 진입 | `identify` 다시 안 함 | - | L30 | B2 |
| 식별된 상태인데 세션 만료 | `reset()` | - | L32 | B2 |
| 헤더 "로그인" 클릭 | 이벤트 없음 (명세 없음) | - | - | |

## 검색 `index.html` → 결과 `results.html`

| 화면 / 동작 | 이벤트 | 주요 속성 | 근거 | 비고 |
|---|---|---|---|---|
| 검색 성공 (검증 통과) | `search_submitted` | `city`, `check_in`, `check_out`, `nights`, `guests` | L49, L69–73 | 다음 화면(results)에서 전송. D2 |
| 검색 검증 실패 | 없음 | - | L49 | |
| 결과 1건 이상 표시 | 이벤트 없음 (명세 없음) | - | - | |
| 결과 0건 | 이벤트 없음 (명세 없음) | - | - | |
| 결과 API 오류 | 이벤트 없음 (명세 없음) | - | - | |
| "검색 조건 변경" → 다시 검색 | `search_submitted`? | 위와 같음 | L49 | D1 |
| 호텔 상세 버튼 클릭 | 이벤트 없음 (명세 없음) | - | - | |

## 호텔 상세 `hotel.html`

| 화면 / 동작 | 이벤트 | 주요 속성 | 근거 | 비고 |
|---|---|---|---|---|
| 일정 포함 진입 성공 | `hotel_viewed` | `hotel_id`, `city`, `has_stay=true`, `nights`, `guests`, `available_room_count` | L50, L79–84 | 바로 전송. D6 |
| 일정 없이 진입 성공 | `hotel_viewed` | `has_stay=false`, `nights=null`, `guests=null` | L81–83 | D4·D5 |
| 없는 호텔 (404) / id 오류 (400) | 없음 | - | L50 | |
| 날짜 오류 (400) | 모호 | - | L50, L81 | D3 |
| 새로고침·뒤로가기 재진입 | 명세 없음 | - | - | A2 |
| 예약 가능한 객실 "이 객실 예약" | `room_selected` | `hotel_id`, `room_id`, `price_per_night`, `nights`, `guests` | L51, L90–94 | 다음 화면(book)에서 전송. A3·D7 |
| 예약 불가 객실 | 없음 | - | L51 | "예약 가능한 객실"만 대상 |
| 결과로 돌아가기 | 이벤트 없음 (명세 없음) | - | - | |

## 예약 입력 `book.html` → 완료 `complete.html`

| 화면 / 동작 | 이벤트 | 주요 속성 | 근거 | 비고 |
|---|---|---|---|---|
| 비로그인 + 비회원 허용, 폼 표시 | `booking_started` | `hotel_id`, `room_id`, `nights`, `guests`, `total_price`, `booked_as=guest` | L52, L100–105 | 바로 전송. D10 |
| 로그인 상태, 폼 표시 | `booking_started` | `booked_as=member` | L52, L105 | |
| 회원 전용 모드 + 비로그인 (로그인 안내) | 없음 | - | L52 | |
| 로그인 후 같은 예약 화면으로 복귀 | 명세 없음 | - | - | D8 |
| 예약 화면 로딩 실패 (`booking-error`) | 명세 없음 | - | - | D9 |
| 입력값 검증 실패 (화면) | 이벤트 없음 (명세 없음) | - | - | |
| 예약 성공 (201), 화면 | `reservation_completed` | `source=web`, `reservation_id`, `hotel_id`, `room_id`, `nights`, `guests`, `total_price`, `booked_as` | L53, L114–121 | 다음 화면(complete)에서 전송. D11 |
| 예약 성공 (201), 서버 | `reservation_completed` | `source=server`, `total_price`=DB 값 | L54, L114–121 | 집계 기준 (L109). D12·D14 |
| 위 서버 이벤트: 회원 | `distinct_id`=회원 id (문자열) | - | L127 | D13 |
| 위 서버 이벤트: 비회원 (화면) | `distinct_id`=헤더 익명 ID | `$process_person_profile: false` | L128, L131 | |
| 예약 실패 (400 / 401 `LOGIN_REQUIRED` / 404 / 409 `ROOM_UNAVAILABLE`) | 없음 (화면·서버 모두) | - | L53–54 | "성공했을 때"만 |
| 완료 화면 → "내 예약 조회" 링크 | 이벤트 없음 (명세 없음) | URL의 `email` 제거 | L39 | C1 |
| 완료 화면 새로고침 | 명세 없음 | - | - | A2·D11 |

## 내 예약 `my.html`

| 화면 / 동작 | 이벤트 | 주요 속성 | 근거 | 비고 |
|---|---|---|---|---|
| 회원 예약 목록 로드 / 0건 | 이벤트 없음 (명세 없음) | - | - | |
| 예약번호 + 이메일 조회 성공 / 실패 (400·404) | 이벤트 없음 (명세 없음) | URL에 이메일이 있으면 제거 | L39 | C1 |
| 취소 확인 패널 → "아니오" | 이벤트 없음 (명세 없음) | - | - | |
| 취소 성공 (200) | `reservation_cancelled` | `reservation_id`, `hotel_id`, `room_id`, `nights`, `total_price`, `booked_as`, `days_before_check_in` | L55, L137–143 | 바로 전송. D15·D16·D17 |
| 취소 실패 (404 / 409 `ALREADY_CANCELLED` / 409 `CANCELLATION_CLOSED`) | 없음 | - | L55 | "성공했을 때"만 |

## 로그인 `login.html` · 회원가입 `signup.html` · Mock OAuth

| 화면 / 동작 | 이벤트 | 주요 속성 | 근거 | 비고 |
|---|---|---|---|---|
| 이메일 로그인 성공 | `login_completed` + `identify` | `method=email`, 사람 속성 `login_provider` | L29, L34, L57, L157 | 다음 화면(returnTo)에서 전송. B1·D22 |
| 이메일 로그인 실패 (400 / 401 `INVALID_CREDENTIALS`) | 없음 | - | L57 | |
| 카카오·구글 버튼 클릭 | 이벤트 없음, 방법만 저장 | - | L159 | D19 |
| Mock 화면 계정 선택·직접 입력 | 이벤트 없음 (명세 없음) | - | - | A9 |
| 소셜 로그인 성공 (기존 회원) | `login_completed` + `identify` | `method=kakao/google` | L57, L159 | 돌아온 첫 화면에서 전송 |
| 소셜 첫 로그인 (자동 가입) | `login_completed`만 | `method=kakao/google` | L151 | `signup_completed` 없음. D21 |
| 소셜 실패: `OAUTH_CANCELLED`, `ACCOUNT_EXISTS` | 없음, 저장값 삭제 | - | L160 | |
| 소셜 실패: `INVALID_STATE`, `INVALID_CODE`, `EMAIL_CONSENT_REQUIRED` | 없음, 저장값 삭제 (추정) | - | L160 "등" | D20 |
| 이메일 회원가입 성공 (201) | `signup_completed` + `identify` | `method=email` | L29, L56, L149 | 다음 화면에서 전송. D18 |
| 회원가입 실패 (400 / 409 `EMAIL_TAKEN`) | 없음 | - | L56 | |
| 회원가입 링크 클릭 | 이벤트 없음 (명세 없음) | - | - | |

## 서버 (API 직접 호출)

| 화면 / 동작 | 이벤트 | 주요 속성 | 근거 | 비고 |
|---|---|---|---|---|
| `POST /api/reservations` 201, 헤더 없음 | `reservation_completed` (server) | `distinct_id`=예약번호 | L129 | |
| `POST /api/reservations/:id/cancel` 200 | 이벤트 없음 (명세 없음) | - | - | D17 |
| 로그인·회원가입 API 직접 호출 | 이벤트 없음 (명세 없음) | - | - | 화면 이벤트만 있음 |
