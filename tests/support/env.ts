/** 테스트 서버 전용 경로 (playwright.config.ts의 webServer.env와 공유) */
export const E2E_DB_PATH = 'data/e2e.db';
export const E2E_LOG_DIR = 'logs/e2e';
export const E2E_LOG_FILE = `${E2E_LOG_DIR}/app.log`;
