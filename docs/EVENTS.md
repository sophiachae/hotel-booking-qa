# 이벤트 명세 (PostHog) v1.2

> [← 앱 명세(SPEC)](SPEC.md) · [변경 내역(CHANGELOG)](CHANGELOG.md)

v1.2부터 사용자 행동을 [PostHog](https://posthog.com)로 수집합니다.
화면은 `posthog-js` 공식 스니펫(CDN), 서버는 `posthog-node`를 사용합니다.

## 1. 켜고 끄기

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `POSTHOG_KEY` | (없음) | PostHog 프로젝트 API 키 (`phc_...`). **없으면 화면·서버 모두 트래킹 꺼짐** |
| `POSTHOG_HOST` | `https://eu.i.posthog.com` | PostHog 주소 (이 프로젝트는 EU 리전). US 리전이면 `https://us.i.posthog.com` |

```bash
POSTHOG_KEY=phc_xxx POSTHOG_HOST=https://eu.i.posthog.com npm start
```

- 화면은 `GET /api/config`의 `posthog` 값으로 키를 받습니다. 키가 없으면 `"posthog": null`이고, 스니펫을 불러오지 않으며 PostHog로 요청을 보내지 않습니다.
- Playwright 테스트와 CI는 키 없이 실행합니다. 서버 시작 로그의 `analytics=on|off`로 상태를 확인할 수 있습니다.
- 자동 수집은 페이지뷰(`$pageview`, `$pageleave`)만 켭니다. 클릭 자동 수집(autocapture)은 끕니다 (화면에 이름·이메일이 보이므로).
- **세션 녹화는 코드에서 끕니다** (`disable_session_recording: true`). PostHog 프로젝트 설정에서 녹화를 켜도 이 앱에서는 녹화되지 않습니다.

## 2. 사용자 식별

| 상황 | 동작 |
|---|---|
| 비회원 | PostHog 익명 ID를 그대로 사용 (브라우저에 저장, 다시 방문해도 유지). 개인 프로필은 만들지 않음 (`person_profiles: identified_only`) |
| 로그인·회원가입 직후 | `identify(회원 id)` — 회원 id는 `users.id`를 문자열로 바꾼 값 (예: `"3"`). 그 전의 익명 이벤트가 회원에게 합쳐짐 |
| 로그인 상태로 화면 진입 | 이미 같은 회원으로 식별돼 있으면 다시 호출하지 않음 |
| 로그아웃 | `logout` 이벤트 후 `reset()` → 새 익명 ID 발급 |
| 세션 만료 (식별된 상태인데 비로그인) | `reset()` |

사람 속성(person property)은 `login_provider`(`email`/`kakao`/`google`)만 설정합니다.

## 3. 개인정보 원칙

- **이메일·전화번호·이름은 어떤 이벤트 속성에도 넣지 않습니다.** 회원은 회원 id, 예약은 예약번호로만 구분합니다.
- 화면 주소에 들어가는 개인정보(예: 예약 완료 → 내 예약 조회 링크의 `email`)는 보내기 전에 쿼리에서 지웁니다 (`email`, `phone`, `name`, `returnTo` 안쪽 주소 포함).
- 도시, 날짜, 인원, 금액, 호텔·객실 id, 예약번호는 개인정보로 보지 않습니다.

## 4. 이벤트 목록

**발생 위치**: 화면 = 브라우저, 서버 = `posthog-node`.
**전송 시점**: 바로 = 그 화면에서 전송 / 다음 화면 = 직후 화면 이동이 있어서 `sessionStorage`에 저장했다가 다음 화면에서 실제 발생 시각(`timestamp`)으로 전송.

| 이벤트 | 발생 시점 | 위치 | 전송 |
|---|---|---|---|
| `search_submitted` | 검색 화면에서 검색 버튼을 눌러 입력 검증을 통과했을 때 (검증 실패는 보내지 않음) | 화면 `index.html` | 다음 화면 |
| `hotel_viewed` | 호텔 상세 화면의 호텔·객실 정보를 불러왔을 때 (조회 실패는 보내지 않음) | 화면 `hotel.html` | 바로 |
| `room_selected` | 예약 가능한 객실의 "이 객실 예약" 버튼을 눌렀을 때 | 화면 `hotel.html` | 다음 화면 |
| `booking_started` | 예약 정보 입력 폼이 표시됐을 때 (회원 전용 모드에서 로그인 안내가 뜨면 보내지 않음) | 화면 `book.html` | 바로 |
| `reservation_completed` | 예약 생성 API가 성공했을 때 | 화면 `book.html` | 다음 화면 |
| `reservation_completed` | `POST /api/reservations`가 201로 성공했을 때 | 서버 | 바로 (서버 큐) |
| `reservation_cancelled` | 예약 취소 API가 성공했을 때 | 화면 `my.html` | 바로 |
| `signup_completed` | 이메일 회원가입 API가 성공했을 때 | 화면 `signup.html` | 다음 화면 |
| `login_completed` | 이메일 로그인 API가 성공했을 때 / 소셜 로그인 후 로그인 상태로 돌아왔을 때 | 화면 `login.html` / 돌아온 화면 | 다음 화면 |
| `logout` | 헤더의 로그아웃 API가 끝났을 때 | 화면 (모든 화면 헤더) | 바로 (`sendBeacon`) |

## 5. 이벤트 속성

공통: PostHog가 자동으로 붙이는 속성(`$current_url`, `$browser`, `$session_id` 등)은 생략합니다.
타입의 `integer`는 정수, `string|null`은 값이 없으면 `null`입니다.

### `search_submitted`

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `city` | string | 선택한 도시 | `"서울"` |
| `check_in` | string (YYYY-MM-DD) | 체크인 날짜 | `"2026-11-01"` |
| `check_out` | string (YYYY-MM-DD) | 체크아웃 날짜 | `"2026-11-03"` |
| `nights` | integer | 숙박 일수 | `2` |
| `guests` | integer | 인원 | `2` |

### `hotel_viewed`

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `hotel_id` | integer | 호텔 id | `1` |
| `city` | string | 호텔 도시 | `"서울"` |
| `has_stay` | boolean | 주소에 일정(체크인·체크아웃·인원)이 모두 있는지 | `true` |
| `nights` | integer\|null | 숙박 일수 (`has_stay=false`면 `null`) | `2` |
| `guests` | integer\|null | 인원 (`has_stay=false`면 `null`) | `2` |
| `available_room_count` | integer | 예약 가능으로 표시된 객실 수 | `3` |

### `room_selected`

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `hotel_id` | integer | 호텔 id | `1` |
| `room_id` | integer | 객실 id | `2` |
| `price_per_night` | integer | 1박 요금 (원) | `120000` |
| `nights` | integer | 숙박 일수 | `2` |
| `guests` | integer | 인원 | `2` |

### `booking_started`

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `hotel_id` | integer | 호텔 id | `1` |
| `room_id` | integer | 객실 id | `2` |
| `nights` | integer | 숙박 일수 | `2` |
| `guests` | integer | 인원 | `2` |
| `total_price` | integer | 화면에 표시한 총 금액 (원, 1박 요금 × 숙박 일수) | `240000` |
| `booked_as` | string (`member`\|`guest`) | 회원 / 비회원 예약 | `"guest"` |

### `reservation_completed`

화면과 서버에서 **같은 이름으로 두 번** 보냅니다. `source`로 구분하며, 집계(퍼널·매출)는 서버 이벤트(`source = server`)를 기준으로 합니다.
화면 이벤트는 브라우저가 닫히거나 광고 차단기가 있으면 빠질 수 있습니다.

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `source` | string (`web`\|`server`) | 보낸 곳 | `"server"` |
| `reservation_id` | string | 예약번호 | `"RSV-1A2B3C4D"` |
| `hotel_id` | integer | 호텔 id | `1` |
| `room_id` | integer | 객실 id | `2` |
| `nights` | integer | 숙박 일수 | `2` |
| `guests` | integer | 인원 | `2` |
| `total_price` | integer | `web`: 화면에 표시한 총 금액 / `server`: DB에 저장된 `total_price` | `240000` |
| `booked_as` | string (`member`\|`guest`) | 회원 / 비회원 예약 | `"member"` |

서버 이벤트의 `distinct_id`:

| 예약 | `distinct_id` |
|---|---|
| 회원 | 회원 id (문자열) |
| 비회원, 화면에서 예약 | 화면이 `X-Analytics-Distinct-Id` 헤더로 보낸 PostHog 익명 ID → 화면 이벤트와 같은 사용자로 묶임 |
| 비회원, 헤더 없음 (API 직접 호출, 트래킹 로딩 전) | 예약번호 |

비회원 서버 이벤트는 `$process_person_profile: false`로 보내 개인 프로필을 만들지 않습니다.

### `reservation_cancelled`

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `reservation_id` | string | 예약번호 | `"RSV-1A2B3C4D"` |
| `hotel_id` | integer | 호텔 id | `1` |
| `room_id` | integer | 객실 id | `2` |
| `nights` | integer | 숙박 일수 | `2` |
| `total_price` | integer | 저장된 총 금액 (원) | `240000` |
| `booked_as` | string (`member`\|`guest`) | 회원 / 비회원 예약 | `"guest"` |
| `days_before_check_in` | integer | 취소한 날부터 체크인까지 남은 일수 (취소 가능하면 1 이상) | `5` |

### `signup_completed`

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `method` | string (`email`) | 가입 방법 | `"email"` |

소셜 계정은 첫 로그인 때 자동으로 가입되며, 이 경우 `signup_completed` 없이 `login_completed`만 보냅니다.

### `login_completed`

| 속성 | 타입 | 설명 | 예 |
|---|---|---|---|
| `method` | string (`email`\|`kakao`\|`google`) | 로그인 방법 | `"kakao"` |

소셜 로그인은 로그인 화면에서 카카오·구글 버튼을 누를 때 방법을 저장해 두고, 로그인 상태로 돌아온 첫 화면에서 보냅니다.
로그인 실패(취소, `ACCOUNT_EXISTS` 등)로 로그인 화면에 돌아오면 저장값을 지우고 보내지 않습니다.

### `logout`

속성 없음.

## 6. 확인 방법

- **화면 이벤트**: 개발자 도구 → Network에서 `i.posthog.com`의 `/e/` 요청 본문, 또는 콘솔에서 `posthog.debug()` 실행 후 화면 조작
- **서버 이벤트**: PostHog → Activity에서 `source = server` 필터
- **트래킹 꺼짐 확인**: 키 없이 실행하면 `/api/config`가 `"posthog": null`이고 `posthog.com`으로 가는 요청이 없어야 함
