/**
 * 테스트 서버 설정 (playwright.config.ts의 webServer와 공유)
 * 환경 변수가 다른 서버가 필요해서 서버마다 포트·DB·로그를 분리한다.
 */
export const SERVERS = {
  /** 기본 설정 (비회원 예약 허용, 세션 7일) */
  default: { port: 3100, db: 'data/e2e.db', logDir: 'logs/e2e', env: {} },
  /** 회원 전용 모드 */
  guestOff: { port: 3101, db: 'data/e2e-guest-off.db', logDir: 'logs/e2e-guest-off', env: { GUEST_CHECKOUT: 'off' } },
  /** 세션 1분 (만료 테스트용) */
  shortSession: {
    port: 3102,
    db: 'data/e2e-short-session.db',
    logDir: 'logs/e2e-short-session',
    env: { SESSION_TTL_MINUTES: '1' },
  },
} as const;

export const E2E_DB_PATH = SERVERS.default.db;
export const E2E_LOG_DIR = SERVERS.default.logDir;
export const E2E_LOG_FILE = `${E2E_LOG_DIR}/app.log`;

export const baseUrlOf = (port: number) => `http://localhost:${port}`;
