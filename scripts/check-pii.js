#!/usr/bin/env node
// 커밋 전/CI에서 저장소에 실제 개인정보(이메일·전화번호·금지 목록 값)가 들어가지 않았는지 검사한다.
//
//   node scripts/check-pii.js            # git에 올라간 파일 전체 검사 (CI)
//   node scripts/check-pii.js --staged   # 커밋하려고 스테이징한 내용만 검사 (pre-commit 훅)
//   node scripts/check-pii.js --self-test  # 검사기 자체가 잡아야 할 값을 잡는지 확인
//
// 기준
// - 이메일: 테스트용으로 예약된 도메인(*.test, example.com 등)과 허용 목록 도메인만 통과
// - 전화번호: 한국 휴대폰 번호는 테스트용 번호대가 따로 없으므로 허용 목록에 등록한 번호만 통과
//            영국 번호는 Ofcom 드라마·테스트용 번호대(07700 900000~900999)만 통과
// - 금지 목록: 이름처럼 규칙으로 잡을 수 없는 실제 값은 저장소 밖에 두고 비교
//            로컬: .pii-denylist 파일(.gitignore), CI: PII_DENYLIST 시크릿 (줄바꿈 또는 쉼표로 구분)
// - 출력: CI 로그는 공개되므로 발견한 값은 일부만 보여준다. 금지 목록 일치는 값을 출력하지 않는다.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(__dirname, 'pii-allowlist.json');
const DENYLIST_PATH = path.join(ROOT, '.pii-denylist');

const ZIP_EXTENSIONS = new Set(['.xlsx', '.docx', '.pptx']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.woff', '.woff2', '.db']);
const SKIP_FILES = new Set(['package-lock.json']);

const RESERVED_EMAIL_DOMAINS = [/\.test$/, /\.example$/, /\.invalid$/, /\.localhost$/, /^example\.(com|net|org)$/, /\.example\.(com|net|org)$/];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const KR_MOBILE_RE = /(?<![\d+])(?:\+82[\s-]?|0)1[016789][\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/g;
const UK_MOBILE_RE = /(?<![\d+])(?:\+44[\s-]?|0)7\d{3}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g;

function loadAllowlist() {
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  return {
    emailDomains: (raw.emailDomains || []).map((d) => d.toLowerCase()),
    phones: new Set((raw.phones || []).map(digitsOnly)),
  };
}

function loadDenylist() {
  const sources = [];
  if (process.env.PII_DENYLIST) sources.push(process.env.PII_DENYLIST);
  if (fs.existsSync(DENYLIST_PATH)) sources.push(fs.readFileSync(DENYLIST_PATH, 'utf8'));
  return sources
    .join('\n')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

function digitsOnly(value) {
  let d = String(value).replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2);
  if (d.startsWith('44') && d.length >= 12) d = '0' + d.slice(2);
  return d;
}

function mask(value) {
  const s = String(value);
  if (s.includes('@')) {
    const [local, domain] = s.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  const d = s.replace(/\D/g, '');
  return `${d.slice(0, 3)}****${d.slice(-2)}`;
}

function isAllowedEmail(email, allow) {
  const domain = email.split('@')[1].toLowerCase();
  if (RESERVED_EMAIL_DOMAINS.some((re) => re.test(domain))) return true;
  return allow.emailDomains.some((d) => domain === d || domain.endsWith('.' + d));
}

function isAllowedUkMobile(number) {
  const d = digitsOnly(number);
  return /^07700900\d{3}$/.test(d);
}

function scanText(text, allow, denylist) {
  const findings = [];
  const lines = text.split('\n');
  const denyLower = denylist.map((v) => ({ text: v.toLowerCase(), digits: digitsOnly(v) }));

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    for (const m of line.matchAll(EMAIL_RE)) {
      if (!isAllowedEmail(m[0], allow)) {
        findings.push({ line: lineNo, kind: '테스트용이 아닌 이메일 도메인', shown: mask(m[0]) });
      }
    }
    for (const m of line.matchAll(KR_MOBILE_RE)) {
      if (!allow.phones.has(digitsOnly(m[0]))) {
        findings.push({ line: lineNo, kind: '허용 목록에 없는 휴대폰 번호', shown: mask(m[0]) });
      }
    }
    for (const m of line.matchAll(UK_MOBILE_RE)) {
      if (!isAllowedUkMobile(m[0]) && !allow.phones.has(digitsOnly(m[0]))) {
        findings.push({ line: lineNo, kind: '테스트용 번호대가 아닌 영국 휴대폰 번호', shown: mask(m[0]) });
      }
    }
    const lower = line.toLowerCase();
    const lineDigits = line.replace(/\D/g, '');
    denyLower.forEach((d, idx) => {
      const textHit = d.text.length >= 2 && lower.includes(d.text);
      const digitHit = d.digits.length >= 8 && lineDigits.includes(d.digits);
      if (textHit || digitHit) {
        findings.push({ line: lineNo, kind: `금지 목록 ${idx + 1}번째 항목과 일치`, shown: '(값 숨김)' });
      }
    });
  });
  return findings;
}

function readZipEntries(buffer) {
  const entries = [];
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip 구조를 읽을 수 없습니다');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('zip 목록이 손상되었습니다');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;

    if (!/\.(xml|rels)$/i.test(name)) continue;
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = buffer.subarray(start, start + compressedSize);
    let content;
    if (method === 0) content = data;
    else if (method === 8) content = zlib.inflateRawSync(data);
    else continue;
    entries.push({ name, text: content.toString('utf8') });
  }
  return entries;
}

function xmlToText(xml) {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function scanFile(name, buffer, allow, denylist) {
  const ext = path.extname(name).toLowerCase();
  if (SKIP_FILES.has(path.basename(name)) || BINARY_EXTENSIONS.has(ext)) return [];
  if (ZIP_EXTENSIONS.has(ext)) {
    return readZipEntries(buffer).flatMap((entry) =>
      scanText(xmlToText(entry.text), allow, denylist).map((f) => ({ ...f, file: `${name} › ${entry.name}`, line: null }))
    );
  }
  if (buffer.includes(0)) return [];
  return scanText(buffer.toString('utf8'), allow, denylist).map((f) => ({ ...f, file: name }));
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, ...options });
}

function listFiles(staged) {
  const args = staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '-z'];
  return git(args).toString('utf8').split('\0').filter(Boolean);
}

function readFile(name, staged) {
  if (staged) return git(['show', `:${name}`]);
  return fs.readFileSync(path.join(ROOT, name));
}

function report(findings) {
  if (findings.length === 0) return;
  const byFile = new Map();
  findings.forEach((f) => {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  });
  for (const [file, list] of byFile) {
    console.error(`\n  ${file}`);
    list.forEach((f) => console.error(`    ${f.line ? `${f.line}행 ` : ''}${f.kind}: ${f.shown}`));
  }
}

function selfTest() {
  const join = (...parts) => parts.join('');
  const realEmail = join('someone', '@', 'gmail', '.com');
  const allow = { emailDomains: ['test.com'], phones: new Set(['01012345678']) };
  const deny = ['홍실명', join('010', '9999', '8888')];
  const cases = [
    { text: 'hong@test.com, guest@example.com, a@minihotel.test', expect: 0, why: '테스트용 이메일은 통과' },
    { text: '010-1234-5678 / +82 10-1234-5678 / 01012345678', expect: 0, why: '허용 목록 번호는 형식이 달라도 통과' },
    { text: '07700 900123, +44 7700 900999', expect: 0, why: '영국 테스트용 번호대는 통과' },
    { text: 'RSV-1792774626410, 2026-11-13, totalPrice=640000', expect: 0, why: '예약번호·날짜·금액은 전화번호로 보지 않음' },
    { text: realEmail, expect: 1, why: '실제 메일 도메인은 잡음' },
    { text: join('010-', '4321-', '8765'), expect: 1, why: '허용 목록에 없는 휴대폰 번호는 잡음' },
    { text: join('+44', '7911', '123456'), expect: 1, why: '테스트용 번호대 밖의 영국 번호는 잡음' },
    { text: '예약자 홍실명', expect: 1, why: '금지 목록의 이름은 잡음' },
    { text: join('연락처 010 ', '9999 ', '8888'), expect: 1, why: '금지 목록 번호는 형식이 달라도 잡음 (목록에 없는 번호이기도 해서 2건)', atLeast: true },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = scanText(c.text, allow, deny).length;
    const ok = c.atLeast ? n >= c.expect : n === c.expect;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.why} (발견 ${n}건)`);
    if (!ok) failed++;
  }
  const zipped = zlib.deflateRawSync(Buffer.from(`<t>${realEmail}</t>`));
  const fakeXlsx = buildZip('xl/worksheets/sheet1.xml', zipped);
  const zipHits = scanFile('fake.xlsx', fakeXlsx, allow, deny).length;
  console.log(`  ${zipHits === 1 ? 'PASS' : 'FAIL'}  엑셀 압축 내부의 값도 잡음 (발견 ${zipHits}건)`);
  if (zipHits !== 1) failed++;

  if (failed > 0) {
    console.error(`\n검사기 자체 테스트 실패 ${failed}건`);
    process.exit(1);
  }
  console.log('\n검사기 자체 테스트 통과');
}

function buildZip(name, deflated) {
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBuf.length + deflated.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuf, deflated, central, nameBuf, eocd]);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();

  const staged = args.includes('--staged');
  const allow = loadAllowlist();
  const denylist = loadDenylist();
  const files = listFiles(staged);

  const findings = [];
  for (const name of files) {
    if (!staged && !fs.existsSync(path.join(ROOT, name))) continue;
    try {
      findings.push(...scanFile(name, readFile(name, staged), allow, denylist));
    } catch (e) {
      findings.push({ file: name, line: null, kind: `파일을 검사하지 못함 (${e.message})`, shown: '-' });
    }
  }

  const scope = staged ? '스테이징된 파일' : 'git 추적 파일';
  const denyInfo = denylist.length > 0 ? `금지 목록 ${denylist.length}개 적용` : '금지 목록 없음';
  if (findings.length === 0) {
    console.log(`개인정보 검사 통과: ${scope} ${files.length}개 (${denyInfo})`);
    return;
  }

  console.error(`개인정보로 의심되는 값 ${findings.length}건 발견: ${scope} ${files.length}개 중 (${denyInfo})`);
  report(findings);
  console.error(
    '\n실제 개인정보라면 테스트용 값으로 바꾸세요: 이메일은 example.com 또는 *.test, 영국 번호는 07700 900xxx.' +
      '\n테스트용으로 새로 만든 한국 번호라면 scripts/pii-allowlist.json의 phones에 추가하세요.'
  );
  process.exit(1);
}

main();
