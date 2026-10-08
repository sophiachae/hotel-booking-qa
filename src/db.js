const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hotel.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS hotels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    city        TEXT    NOT NULL,
    address     TEXT    NOT NULL,
    rating      REAL    NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_id        INTEGER NOT NULL REFERENCES hotels(id),
    name            TEXT    NOT NULL,
    capacity        INTEGER NOT NULL,
    price_per_night INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id           TEXT    PRIMARY KEY,
    room_id      INTEGER NOT NULL REFERENCES rooms(id),
    guest_name   TEXT    NOT NULL,
    email        TEXT    NOT NULL,
    phone        TEXT    NOT NULL,
    check_in     TEXT    NOT NULL,
    check_out    TEXT    NOT NULL,
    guests       INTEGER NOT NULL,
    nights       INTEGER NOT NULL,
    total_price  INTEGER NOT NULL,
    status       TEXT    NOT NULL CHECK (status IN ('CONFIRMED', 'CANCELLED')),
    created_at   TEXT    NOT NULL,
    cancelled_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_rooms_hotel ON rooms(hotel_id);
  CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id, status);
`);

const SEED = [
  {
    name: '서울 그랜드 호텔', city: '서울', address: '서울특별시 중구 세종대로 100', rating: 4.6,
    description: '시청과 광화문 사이에 위치한 도심형 비즈니스 호텔입니다.',
    rooms: [
      { name: '스탠다드 더블', capacity: 2, price: 120000 },
      { name: '디럭스 트윈', capacity: 3, price: 160000 },
      { name: '이그제큐티브 스위트', capacity: 4, price: 280000 },
    ],
  },
  {
    name: '한강 리버뷰 호텔', city: '서울', address: '서울특별시 용산구 이촌로 22', rating: 4.2,
    description: '모든 객실에서 한강 전망을 즐길 수 있는 부티크 호텔입니다.',
    rooms: [
      { name: '스탠다드 더블', capacity: 2, price: 95000 },
      { name: '패밀리 룸', capacity: 4, price: 150000 },
    ],
  },
  {
    name: '해운대 오션 리조트', city: '부산', address: '부산광역시 해운대구 해운대해변로 264', rating: 4.8,
    description: '해운대 해수욕장 바로 앞, 인피니티 풀을 갖춘 리조트입니다.',
    rooms: [
      { name: '오션뷰 더블', capacity: 2, price: 140000 },
      { name: '오션뷰 패밀리', capacity: 4, price: 210000 },
      { name: '펜트하우스', capacity: 6, price: 450000 },
    ],
  },
  {
    name: '광안 브릿지 스테이', city: '부산', address: '부산광역시 수영구 광안해변로 219', rating: 4.1,
    description: '광안대교 야경이 보이는 합리적인 가격의 호텔입니다.',
    rooms: [
      { name: '스탠다드 더블', capacity: 2, price: 85000 },
      { name: '디럭스 트리플', capacity: 3, price: 120000 },
    ],
  },
  {
    name: '제주 포레스트 리조트', city: '제주', address: '제주특별자치도 서귀포시 1100로 453', rating: 4.7,
    description: '한라산 숲속에 자리한 독채형 빌라 리조트입니다.',
    rooms: [
      { name: '가든 더블', capacity: 2, price: 130000 },
      { name: '포레스트 빌라', capacity: 5, price: 320000 },
    ],
  },
  {
    name: '성산 선라이즈 호텔', city: '제주', address: '제주특별자치도 서귀포시 성산읍 일출로 120', rating: 4.3,
    description: '성산일출봉 일출을 객실에서 감상할 수 있는 호텔입니다.',
    rooms: [
      { name: '스탠다드 더블', capacity: 2, price: 90000 },
      { name: '오션뷰 트윈', capacity: 3, price: 125000 },
      { name: '패밀리 스위트', capacity: 4, price: 170000 },
    ],
  },
];

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM hotels').get();
  if (count > 0) return false;

  const insertHotel = db.prepare(
    'INSERT INTO hotels (name, city, address, rating, description) VALUES (?, ?, ?, ?, ?)'
  );
  const insertRoom = db.prepare(
    'INSERT INTO rooms (hotel_id, name, capacity, price_per_night) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    for (const h of SEED) {
      const { lastInsertRowid } = insertHotel.run(h.name, h.city, h.address, h.rating, h.description);
      for (const r of h.rooms) insertRoom.run(lastInsertRowid, r.name, r.capacity, r.price);
    }
  })();
  return true;
}

module.exports = { db, seedIfEmpty, DB_PATH };
