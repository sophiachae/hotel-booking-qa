const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;

const MAX_NIGHTS = 30;
const MAX_GUESTS = 10;
const MAX_NAME_LENGTH = 50;

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new ApiError(400, 'VALIDATION_ERROR', message, details);
const notFound = (message) => new ApiError(404, 'NOT_FOUND', message);
const conflict = (message, code = 'CONFLICT') => new ApiError(409, code, message);

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function nightsBetween(checkIn, checkOut) {
  return Math.round((parseDate(checkOut) - parseDate(checkIn)) / 86400000);
}

function validateStay(checkIn, checkOut) {
  if (!checkIn || !checkOut) throw badRequest('checkIn과 checkOut은 필수입니다.');
  if (!parseDate(checkIn)) throw badRequest('checkIn 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)');
  if (!parseDate(checkOut)) throw badRequest('checkOut 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)');
  if (checkIn < todayString()) throw badRequest('체크인 날짜는 오늘 이후여야 합니다.');

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw badRequest('체크아웃 날짜는 체크인 날짜보다 이후여야 합니다.');
  if (nights > MAX_NIGHTS) throw badRequest(`최대 ${MAX_NIGHTS}박까지 예약할 수 있습니다.`);
  return nights;
}

function parseGuests(value) {
  if (value === undefined || value === null || value === '') {
    throw badRequest('guests는 필수입니다.');
  }
  const isNumeric =
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && /^\d+$/.test(value));
  const n = Number(value);
  if (!isNumeric || !Number.isInteger(n) || n < 1 || n > MAX_GUESTS) {
    throw badRequest(`guests는 1~${MAX_GUESTS} 사이의 정수여야 합니다.`);
  }
  return n;
}

function parseId(value, label) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
    throw badRequest(`${label}가 올바르지 않습니다.`);
  }
  return Number(value);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = {
  ApiError,
  badRequest,
  notFound,
  conflict,
  parseDate,
  todayString,
  nightsBetween,
  validateStay,
  parseGuests,
  parseId,
  asTrimmedString,
  EMAIL_RE,
  PHONE_RE,
  MAX_NAME_LENGTH,
};
