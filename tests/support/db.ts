import Database from 'better-sqlite3';
import { E2E_DB_PATH } from './env';

/** 테스트 DB 읽기 전용 조회 (DB 검증용. 데이터 변경은 반드시 API로만 한다) */
export function queryDbAt<T = Record<string, unknown>>(dbPath: string, sql: string, ...params: unknown[]): T[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

/** 기본 테스트 서버 DB 조회 */
export function queryDb<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return queryDbAt<T>(E2E_DB_PATH, sql, ...params);
}

export function reservationsByEmail(email: string, dbPath: string = E2E_DB_PATH) {
  return queryDbAt<{ id: string; room_id: number; status: string; cancelled_at: string | null }>(
    dbPath,
    'SELECT id, room_id, status, cancelled_at FROM reservations WHERE email = ? ORDER BY created_at',
    email,
  );
}

export function usersByEmail(email: string, dbPath: string = E2E_DB_PATH) {
  return queryDbAt<{ id: number; email: string; provider: string; provider_user_id: string | null }>(
    dbPath,
    'SELECT id, email, provider, provider_user_id FROM users WHERE email = ? COLLATE NOCASE',
    email,
  );
}
