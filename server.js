const path = require('path');
const express = require('express');
const { seedIfEmpty, DB_PATH } = require('./src/db');
const config = require('./src/config');
const logger = require('./src/logger');
const analytics = require('./src/analytics');
const auth = require('./src/auth');
const mockOAuth = require('./src/mockOAuth');
const routes = require('./src/routes');
const { ApiError, notFound } = require('./src/utils');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use('/api', logger.requestLogger);
app.use(express.json({ limit: '100kb' }));
app.use('/api', auth.attachUser);
app.use('/api/auth', auth.router);
app.use('/api', routes);
app.use('/api', (req, res, next) => next(notFound('존재하지 않는 API입니다.')));
app.use('/mock-oauth', mockOAuth.router);
app.use(express.static(path.join(__dirname, 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: '요청 본문이 올바른 JSON이 아닙니다.' } });
  }
  if (err instanceof ApiError) {
    const error = { code: err.code, message: err.message };
    if (err.details) error.details = err.details;
    return res.status(err.status).json({ error });
  }
  res.locals.error = err;
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } });
});

const seeded = seedIfEmpty();

app.listen(PORT, () => {
  logger.info(
    `Server started on http://localhost:${PORT} (db=${DB_PATH}, seeded=${seeded}, ` +
      `guestCheckout=${config.guestCheckout}, sessionTtlMinutes=${config.sessionTtlMinutes}, ` +
      `analytics=${analytics.enabled ? 'on' : 'off'})`
  );
});

// 종료 전에 서버 이벤트 큐를 비운다
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.once(signal, () => {
    analytics.shutdown().finally(() => process.exit(0));
  });
});
