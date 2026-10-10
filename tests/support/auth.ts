import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { uniqueEmail } from './api';

// 주의: Playwright의 request 픽스처는 쿠키를 저장한다. 로그인·가입을 request로 하면 이후 요청이 전부 로그인 상태가 되므로,
// 가입·로그인은 일회용 컨텍스트에서 하고 토큰을 Bearer 헤더로 명시해서 쓴다.

export const SEED_MEMBER = { email: 'test@minihotel.test', password: 'Test1234', name: '테스트회원' } as const;
export const DEFAULT_PASSWORD = 'Test1234a';

export type Member = { name: string; email: string; password: string; phone: string; token: string; id: number };

/** 현재 프로젝트의 baseURL (서버가 3개라 프로젝트마다 다름) */
export function currentBaseURL(): string {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error('baseURL이 설정되지 않았습니다.');
  return url;
}

/** 쿠키가 비어 있는 새 API 컨텍스트 (사용 후 dispose 필요) */
export function freshContext(options: { maxRedirects?: number } = {}): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: currentBaseURL(), ...options });
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** 새 이메일 회원 가입 (테스트마다 고유 계정) */
export async function signupMember(tag: string, overrides: Partial<Omit<Member, 'token' | 'id'>> = {}): Promise<Member> {
  const ctx = await freshContext();
  try {
    const body = { name: `${tag}회원`, email: uniqueEmail(tag), password: DEFAULT_PASSWORD, phone: '010-5555-6666', ...overrides };
    const res = await ctx.post('/api/auth/signup', { data: body });
    expect(res.status(), `가입 실패: ${await res.text()}`).toBe(201);
    const json = await res.json();
    return { ...body, token: json.token, id: json.user.id };
  } finally {
    await ctx.dispose();
  }
}

/** 이메일 로그인 → 토큰 */
export async function loginToken(email: string, password: string): Promise<string> {
  const ctx = await freshContext();
  try {
    const res = await ctx.post('/api/auth/login', { data: { email, password } });
    expect(res.status(), `로그인 실패: ${await res.text()}`).toBe(200);
    return (await res.json()).token;
  } finally {
    await ctx.dispose();
  }
}

/** 브라우저를 로그인 상태로 만든다 (sid 쿠키 주입) */
export async function loginBrowser(context: BrowserContext, token: string) {
  await context.addCookies([{ name: 'sid', value: token, url: currentBaseURL() }]);
}

/**
 * Mock OAuth 흐름을 API로 진행: start → (계정 선택) authorize → callback 직전까지.
 * 리다이렉트를 따라가지 않는 컨텍스트에서 단계별 값(state, code)을 꺼낸다.
 */
export async function oauthAuthorize(
  ctx: APIRequestContext,
  provider: 'kakao' | 'google',
  accountId: string,
  opts: { returnTo?: string; consentEmail?: boolean } = {},
) {
  const start = await ctx.get(`/api/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(opts.returnTo ?? '/my.html')}`);
  expect(start.status()).toBe(302);
  const authorizeUrl = new URL(start.headers()['location'], currentBaseURL());
  const q = Object.fromEntries(authorizeUrl.searchParams);

  const auth = await ctx.post(`/mock-oauth/${provider}/authorize`, {
    form: {
      client_id: q.client_id,
      redirect_uri: q.redirect_uri,
      state: q.state,
      account_id: accountId,
      consent_email: opts.consentEmail === false ? 'off' : 'on',
    },
  });
  expect(auth.status()).toBe(302);
  const callbackUrl = new URL(auth.headers()['location']);
  return { state: q.state, code: callbackUrl.searchParams.get('code') ?? '', redirectUri: q.redirect_uri, query: q };
}

/** callback 호출 → 리다이렉트 위치 */
export async function oauthCallback(ctx: APIRequestContext, provider: 'kakao' | 'google', code: string, state: string) {
  const res = await ctx.get(
    `/api/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
  expect(res.status()).toBe(302);
  return new URL(res.headers()['location'], currentBaseURL());
}
