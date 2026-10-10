import Database from 'better-sqlite3';
import { E2E_DB_PATH } from './env';

/** 테스트 DB 읽기 전용 조회 (DB 검증용. 데이터 변경은 반드시 API로만 한다) */
export function queryDb<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  const db = new Database(E2E_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

export function reservationsByEmail(email: string) {
  return queryDb<{ id: string; room_id: number; status: string; cancelled_at: string | null }>(
    'SELECT id, room_id, status, cancelled_at FROM reservations WHERE email = ? ORDER BY created_at',
    email,
  );
}
