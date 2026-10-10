/**
 * 오늘 기준 n일 뒤 날짜를 YYYY-MM-DD(로컬 시간)로 반환한다.
 * 서버의 "오늘" 판단(src/utils.js todayString)도 로컬 시간 기준이라 동일하게 맞춘다.
 */
export function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 오늘+from일 체크인 ~ 오늘+to일 체크아웃 */
export function stay(from: number, to: number) {
  return { checkIn: daysFromToday(from), checkOut: daysFromToday(to) };
}
