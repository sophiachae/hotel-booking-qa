const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

fs.mkdirSync(LOG_DIR, { recursive: true });

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function timestamp() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

function write(level, message) {
  const line = `${timestamp()} [${level}] ${message}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
  if (level === 'ERROR') console.error(line);
  else console.log(line);
}

function summarizeResult(body) {
  if (body === undefined || body === null) return '-';
  if (body.error) {
    const details = body.error.details ? ` details=${JSON.stringify(body.error.details)}` : '';
    return `${body.error.code}: ${body.error.message}${details}`;
  }
  if (Array.isArray(body)) return `count=${body.length}`;
  if (body.hotel && Array.isArray(body.rooms)) {
    return `hotelId=${body.hotel.id} rooms=${body.rooms.length}`;
  }
  if (body.id && body.status) {
    return `reservationId=${body.id} status=${body.status} totalPrice=${body.totalPrice}`;
  }
  const text = JSON.stringify(body);
  return text.length > 200 ? text.slice(0, 200) + '...' : text;
}

function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const endpoint = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const params = { ...req.query };
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      Object.assign(params, req.body);
    }
    const message =
      `${endpoint} params=${JSON.stringify(params)} status=${res.statusCode} ` +
      `result=${summarizeResult(res.locals.responseBody)} (${elapsedMs.toFixed(1)}ms)`;

    if (res.statusCode >= 400) {
      write('ERROR', message);
      if (res.locals.error && res.locals.error.stack) {
        write('ERROR', `${endpoint} stack=${res.locals.error.stack.replace(/\n\s*/g, ' | ')}`);
      }
    } else {
      write('INFO', message);
    }
  });

  next();
}

module.exports = {
  info: (msg) => write('INFO', msg),
  error: (msg) => write('ERROR', msg),
  requestLogger,
  LOG_FILE,
};
