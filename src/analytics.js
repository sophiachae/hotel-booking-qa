const { PostHog } = require('posthog-node');
const config = require('./config');
const logger = require('./logger');

// 브라우저가 보내는 익명 ID 헤더. 비회원 예약을 화면 이벤트와 같은 사용자로 묶는 데 쓴다.
const DISTINCT_ID_HEADER = 'x-analytics-distinct-id';
const DISTINCT_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;

const client = config.posthog ? new PostHog(config.posthog.key, { host: config.posthog.host }) : null;

function capture(distinctId, event, properties) {
  if (!client) return;
  try {
    client.capture({ distinctId, event, properties });
  } catch (e) {
    logger.error(`analytics capture failed: event=${event} ${e.message}`);
  }
}

function browserDistinctId(req) {
  const value = String(req.get(DISTINCT_ID_HEADER) || '').trim();
  return DISTINCT_ID_RE.test(value) ? value : null;
}

function reservationCompleted(req, reservation) {
  if (!client) return;
  const member = Boolean(req.user);
  const properties = {
    source: 'server',
    reservation_id: reservation.id,
    hotel_id: reservation.hotel.id,
    room_id: reservation.room.id,
    nights: reservation.nights,
    guests: reservation.guests,
    total_price: reservation.totalPrice,
    booked_as: reservation.bookedAs.toLowerCase(),
  };
  if (!member) properties.$process_person_profile = false;
  capture(member ? String(req.user.id) : browserDistinctId(req) || reservation.id, 'reservation_completed', properties);
}

function shutdown() {
  return client ? client.shutdown() : Promise.resolve();
}

module.exports = { enabled: Boolean(client), reservationCompleted, shutdown };
