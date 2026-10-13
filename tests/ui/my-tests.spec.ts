import { test, expect } from '@playwright/test';
import { usersByEmail } from '../support/db'; // 🆕 DB에서 이메일로 계정을 찾아보는 도구

test('TC-71 비밀번호 확인 불일치', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-login').click();
  await page.getByTestId('login-signup-link').click();
  await page.getByTestId('signup-name').fill('테스트');
  await page.getByTestId('signup-email').fill('tc71@test.com');
  await page.getByTestId('signup-password').fill('Test1234a');
  await page.getByTestId('signup-password-confirm').fill('Test1234b');
  await page.getByTestId('signup-submit').click();

  // ⭐ 확인: 비밀번호 확인 에러가 보이는지
  await expect(page.getByTestId('signup-password-confirm-error')).toBeVisible();

  // 🆕 확인: 계정이 만들어지지 않았는지
  // (서버엔 '비밀번호 확인' 칸이 없어서, 요청이 나갔다면 계정이 생겼을 것 → 0건이면 요청도 안 나간 것)
  expect(usersByEmail('tc71@test.com')).toHaveLength(0);
});

test('TC-69 대소문자 다른 이메일로 로그인', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-login').click();
  await page.getByTestId('login-email').fill('TEST@MiniHotel.test');
  await page.getByTestId('login-password').fill('Test1234');
  await page.getByTestId('login-submit').click();

  // ⭐ 확인: 헤더 이름이 '테스트회원님'인지
  await expect(page.getByTestId('nav-user-name')).toHaveText('테스트회원님');
});

test('TC-77 소셜 가입 계정으로 이메일 로그인', async ({ page }) => {
  await page.goto('/');

  // 사전조건: 카카오(kakao-1001)로 가입한 뒤 로그아웃
  await page.getByTestId('nav-login').click();
  // 🆕 카카오 버튼에 주소(href)가 채워질 때까지 기다렸다가 클릭 (처음엔 href="#", TC-53과 같은 문제)
  await expect(page.getByTestId('login-kakao')).toHaveAttribute('href', /oauth\/kakao\/start/);
  await page.getByTestId('login-kakao').click();
  await page.getByTestId('mock-account-kakao-1001').click();
  await page.getByTestId('nav-logout').click();

  // 카카오로 가입한 이메일로 이메일 로그인
  await page.getByTestId('nav-login').click();
  await page.getByTestId('login-email').fill('kakao.tester@kakao.test');
  await page.getByTestId('login-password').fill('Abcd1234');
  await page.getByTestId('login-submit').click();

  // ⭐ 확인: 에러 코드가 INVALID_CREDENTIALS인지
  await expect(page.getByTestId('login-error')).toHaveAttribute('data-code', 'INVALID_CREDENTIALS');
});