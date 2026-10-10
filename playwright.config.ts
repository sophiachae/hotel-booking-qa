import { defineConfig, devices } from '@playwright/test';

// 수동 테스트용 서버(3000, data/hotel.db)와 겹치지 않도록 포트·DB·로그를 분리한다.
const PORT = Number(process.env.E2E_PORT) || 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  // 테스트 실행 1회당 DB를 한 번만 초기화하므로, 각 테스트는 서로 다른 객실·날짜를 사용해 데이터가 겹치지 않게 작성한다.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'ui',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testDir: './tests/api',
    },
  ],
  webServer: {
    // 서버 시작 전 DB 파일을 삭제 → 서버가 샘플 데이터만 있는 깨끗한 DB로 시작
    command: 'npm run reset && npm start',
    url: `${BASE_URL}/api/cities`,
    // 이미 떠 있는 서버를 재사용하면 초기화가 건너뛰어지므로 항상 새로 띄운다.
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      DB_PATH: 'data/e2e.db',
      LOG_DIR: 'logs/e2e',
    },
  },
});
