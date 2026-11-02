# 이벤트 실행 결과 (release/1.2)

> 근거: [EVENTS.md](EVENTS.md) 줄 번호(`L`) · 관련: [EVENTS_MATRIX.md](EVENTS_MATRIX.md), [EVENTS_REVIEW.md](EVENTS_REVIEW.md)
>
> 관찰한 사실만 적습니다. 원인 추정은 적지 않습니다.

## F1. 서버 `reservation_completed`의 `total_price`가 화면 값과 다름

**대상 예약**: `RSV-8ED92D20` (객실 4, 2박, 1박 95,000원)

| 이벤트 | 보낸 곳 | `total_price` |
|---|---|---|
| `booking_started` | web | `190000` |
| `reservation_completed` | web | `190000` |
| `reservation_completed` | posthog-node (`source=server`) | `285000` |

- 서버 이벤트에서만 1박 요금(95,000원)만큼 금액이 더 붙었습니다 (285,000 − 190,000 = 95,000).
- 명세상 집계(퍼널·매출)의 기준은 서버 이벤트입니다 (L109).
- 명세상 서버 `total_price`는 "DB에 저장된 `total_price`"입니다 (L120).
- 명세상 화면 총 금액은 "1박 요금 × 숙박 일수"입니다 (L104). 이 예약에서는 95,000 × 2 = 190,000입니다.

**DB 확인** (2026-11-02, `reservations` 테이블)

```bash
sqlite3 data/hotel.db "SELECT id, room_id, check_in, check_out, nights, guests, total_price, status, user_id FROM reservations WHERE id='RSV-8ED92D20';"
```

| id | room_id | check_in | check_out | nights | guests | total_price | status | user_id |
|---|---|---|---|---|---|---|---|---|
| `RSV-8ED92D20` | 4 | 2026-11-03 | 2026-11-05 | 2 | 2 | **285000** | CONFIRMED | (NULL, 비회원) |

- 서버 이벤트 `total_price`(285,000)는 DB `total_price`(285,000)와 같습니다 (L120 기준 일치).
- DB `total_price`(285,000)는 같은 행의 `nights`(2) × 객실 4의 1박 요금(95,000, SPEC 샘플 데이터) = 190,000과 다릅니다.
- 화면 이벤트 2개는 190,000이고, DB에 저장된 값은 285,000입니다.

## F2. (확인 필요) 화면 `reservation_completed`의 Current URL

- 화면 `reservation_completed`의 Current URL이 `complete.html`이 아니라 `book.html`이었습니다.
- 명세상 이 이벤트는 "다음 화면"에서 보냅니다 (L53). 다음 화면 이벤트는 `sessionStorage`에 저장했다가 다음 화면에서 실제 발생 시각으로 보냅니다 (L45).
- 이때 Current URL이 어느 화면이어야 하는지는 **명세 없음** (리뷰 A4·D11).
