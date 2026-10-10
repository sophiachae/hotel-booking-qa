const crypto = require('crypto');
const express = require('express');
const { db } = require('./db');
const u = require('./utils');
const config = require('./config');
const { requireAuth } = require('./auth');

const router = express.Router();

function hotelDto(row) {
  const dto = {
    id: row.id,
    name: row.name,
    city: row.city,
    address: row.address,
    rating: row.rating,
    description: row.description,
  };
  if (row.min_price !== undefined) dto.minPrice = row.min_price;
  if (row.available_rooms !== undefined) dto.availableRooms = row.available_rooms;
  return dto;
}

function reservationDto(row) {
  return {
    id: row.id,
    status: row.status,
    bookedAs: row.user_id ? 'MEMBER' : 'GUEST',
    hotel: { id: row.hotel_id, name: row.hotel_name, city: row.hotel_city },
    room: { id: row.room_id, name: row.room_name, pricePerNight: row.price_per_night },
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    guests: row.guests,
    guestName: row.guest_name,
    email: row.email,
    phone: row.phone,
    totalPrice: row.total_price,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

const selectReservation = db.prepare(`
  SELECT r.*, rm.name AS room_name, rm.price_per_night,
         h.id AS hotel_id, h.name AS hotel_name, h.city AS hotel_city
  FROM reservations r
  JOIN rooms rm ON rm.id = r.room_id
  JOIN hotels h ON h.id = rm.hotel_id
  WHERE r.id = ?
`);

const roomBookedForStay = db.prepare(`
  SELECT 1 FROM reservations
  WHERE room_id = ? AND status = 'CONFIRMED' AND check_in < ? AND check_out > ?
`);

const roomOccupiedOn = db.prepare(`
  SELECT id FROM reservations
  WHERE room_id = ? AND status = 'CONFIRMED' AND check_in <= ? AND check_out > ?
`);

function isRoomOccupied(roomId, date) {
  return Boolean(roomOccupiedOn.get(roomId, date, date));
}

function calculateTotal(pricePerNight, checkIn, checkOut) {
  const start = u.parseDate(checkIn);
  const end = u.parseDate(checkOut);
  let total = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    total += pricePerNight;
  }
  return total;
}

function generateReservationId() {
  return 'RSV-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function normalizeReservationId(value) {
  return String(value || '').trim().toUpperCase();
}

function findAccessibleReservation(req, id, email) {
  const row = selectReservation.get(normalizeReservationId(id));
  if (row && req.user && row.user_id === req.user.id) return row;
  if (!email) throw u.fieldError('email', 'email은 필수입니다.');
  if (!row || row.email.toLowerCase() !== email.toLowerCase()) {
    throw u.notFound('예약번호 또는 이메일이 일치하는 예약이 없습니다.');
  }
  return row;
}

router.get('/cities', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT city FROM hotels ORDER BY city').all();
  res.json(rows.map((r) => r.city));
});

router.get('/hotels', (req, res) => {
  const city = u.asTrimmedString(req.query.city);
  if (!city) throw u.fieldError('city', 'city는 필수입니다.');
  const { checkIn, checkOut } = req.query;
  u.validateStay(checkIn, checkOut);
  const guests = u.parseGuests(req.query.guests);

  const rows = db
    .prepare(
      `SELECT h.*, MIN(r.price_per_night) AS min_price, COUNT(r.id) AS available_rooms
       FROM hotels h
       JOIN rooms r ON r.hotel_id = h.id
       WHERE h.city = ?
         AND r.capacity >= ?
         AND NOT EXISTS (
           SELECT 1 FROM reservations x
           WHERE x.room_id = r.id AND x.status = 'CONFIRMED'
             AND x.check_in < ? AND x.check_out > ?
         )
       GROUP BY h.id
       ORDER BY h.id`
    )
    .all(city, guests, checkOut, checkIn);

  res.json(rows.map(hotelDto));
});

router.get('/hotels/:id/rooms', (req, res) => {
  const hotelId = u.parseId(req.params.id, '호텔 ID');
  const hotel = db.prepare('SELECT * FROM hotels WHERE id = ?').get(hotelId);
  if (!hotel) throw u.notFound('호텔을 찾을 수 없습니다.');

  const { checkIn, checkOut, guests } = req.query;
  const hasStay = checkIn !== undefined || checkOut !== undefined;
  if (hasStay) u.validateStay(checkIn, checkOut);
  const guestCount = guests !== undefined ? u.parseGuests(guests) : null;

  const rooms = db
    .prepare('SELECT * FROM rooms WHERE hotel_id = ? ORDER BY price_per_night')
    .all(hotelId)
    .map((r) => {
      const free = hasStay ? !roomBookedForStay.get(r.id, checkOut, checkIn) : true;
      const fits = guestCount ? r.capacity >= guestCount : true;
      return {
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        pricePerNight: r.price_per_night,
        available: free && fits,
      };
    });

  res.json({ hotel: hotelDto(hotel), rooms });
});

router.get('/config', (req, res) => {
  res.json({ guestCheckout: config.guestCheckout, loginProviders: config.loginProviders });
});

router.get('/me/reservations', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, rm.name AS room_name, rm.price_per_night,
              h.id AS hotel_id, h.name AS hotel_name, h.city AS hotel_city
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       JOIN hotels h ON h.id = rm.hotel_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(req.user.id);
  res.json(rows.map(reservationDto));
});

router.post('/reservations', (req, res) => {
  if (!req.user && !config.guestCheckout) {
    throw u.unauthorized('회원만 예약할 수 있습니다. 로그인해 주세요.', 'LOGIN_REQUIRED');
  }
  const body = u.asObject(req.body);
  const name = u.asTrimmedString(body.name);
  const email = u.asTrimmedString(body.email);
  const phone = u.asTrimmedString(body.phone);

  const fieldErrors = {};
  if (!name) fieldErrors.name = '이름은 필수입니다.';
  else if (name.length > u.MAX_NAME_LENGTH) fieldErrors.name = `이름은 ${u.MAX_NAME_LENGTH}자 이하여야 합니다.`;
  if (!email) fieldErrors.email = '이메일은 필수입니다.';
  else if (!u.EMAIL_RE.test(email)) fieldErrors.email = '이메일 형식이 올바르지 않습니다.';
  if (!phone) fieldErrors.phone = '전화번호는 필수입니다.';
  else if (!u.PHONE_RE.test(phone)) fieldErrors.phone = '전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)';
  if (Object.keys(fieldErrors).length > 0) {
    throw u.badRequest('입력값을 확인해 주세요.', fieldErrors);
  }

  if (body.roomId === undefined || body.roomId === null || body.roomId === '') {
    throw u.fieldError('roomId', 'roomId는 필수입니다.');
  }
  const roomId = u.parseId(body.roomId, '객실 ID', 'roomId');
  const nights = u.validateStay(body.checkIn, body.checkOut);
  const guests = u.parseGuests(body.guests);

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) throw u.notFound('객실을 찾을 수 없습니다.');
  if (guests > room.capacity) {
    throw u.fieldError('guests', `이 객실의 최대 인원은 ${room.capacity}명입니다.`);
  }

  const create = db.transaction(() => {
    if (isRoomOccupied(room.id, body.checkIn)) {
      throw u.conflict('선택한 날짜에 이미 예약된 객실입니다.', 'ROOM_UNAVAILABLE');
    }
    const id = generateReservationId();
    db.prepare(
      `INSERT INTO reservations
         (id, room_id, user_id, guest_name, email, phone, check_in, check_out, guests, nights, total_price, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)`
    ).run(
      id,
      room.id,
      req.user ? req.user.id : null,
      name,
      email,
      phone,
      body.checkIn,
      body.checkOut,
      guests,
      nights,
      calculateTotal(room.price_per_night, body.checkIn, body.checkOut),
      new Date().toISOString()
    );
    return id;
  });

  const id = create();
  res.status(201).json(reservationDto(selectReservation.get(id)));
});

router.get('/reservations/:id', (req, res) => {
  const email = u.asTrimmedString(req.query.email);
  const row = findAccessibleReservation(req, req.params.id, email);
  res.json(reservationDto(row));
});

router.post('/reservations/:id/cancel', (req, res) => {
  const email = u.asTrimmedString(u.asObject(req.body).email);
  const row = findAccessibleReservation(req, req.params.id, email);

  if (row.status === 'CANCELLED') {
    throw u.conflict('이미 취소된 예약입니다.', 'ALREADY_CANCELLED');
  }
  if (row.check_in <= u.todayString()) {
    throw u.conflict('체크인 당일 이후에는 예약을 취소할 수 없습니다.', 'CANCELLATION_CLOSED');
  }

  db.prepare("UPDATE reservations SET status = 'CANCELLED', cancelled_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    row.id
  );
  res.json(reservationDto(selectReservation.get(row.id)));
});

module.exports = router;
