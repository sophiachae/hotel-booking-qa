const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hotel.db');

for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`삭제: ${file}`);
  }
}
console.log('DB가 초기화되었습니다. npm start 시 샘플 데이터가 다시 생성됩니다.');
