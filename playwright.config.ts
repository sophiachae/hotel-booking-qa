import { defineConfig, devices } from '@playwright/test';
import { SERVERS, baseUrlOf } from './tests/support/env';

// 수동 테스트용 서버(3000, data/hotel.db)와 겹치지 않도록 포트·DB·로그를 분리한다.
// 환경 변수가 다른 서버 3개: 기본(3100) / 회원 전용 GUEST_CHECKOUT=off(3101) / 세션 1분(3102)

export default defineConfig({
  testDir: './tests',
  // 테스트 실행 1회당 DB를 한 번만 초기화하므로, 각 테스트는 서로 다른 객실·날짜·계정을 사용해 데이터가 겹치지 않게 작성한다.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: baseUrlOf(SERVERS.default.port),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 눈으로 볼 때: SLOWMO=500 npm run test:watch → 동작마다 0.5초 지연
    launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 },
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
    {
      name: 'guest-off',
      testDir: './tests/guest-off',
      use: { ...devices['Desktop Chrome'], baseURL: baseUrlOf(SERVERS.guestOff.port) },
    },
    {
      name: 'short-session',
      testDir: './tests/short-session',
      use: { ...devices['Desktop Chrome'], baseURL: baseUrlOf(SERVERS.shortSession.port) },
    },
  ],
  // 서버 시작 전 각자의 DB 파일을 삭제 → 샘플 데이터만 있는 깨끗한 DB로 시작
  // 이미 떠 있는 서버를 재사용하면 초기화가 건너뛰어지므로 항상 새로 띄운다.
  webServer: Object.values(SERVERS).map((s) => ({
    command: 'npm run reset && npm start',
    url: `${baseUrlOf(s.port)}/api/cities`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(s.port), DB_PATH: s.db, LOG_DIR: s.logDir, ...s.env },
  })),
});
