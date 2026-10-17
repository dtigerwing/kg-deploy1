// .env 는 부를 때마다 다시 읽는다. 서버를 켠 뒤에 키를 넣어도 재시작 없이 바로 쓸 수 있게.
// 셸에서 export 한 값이 있으면 그쪽이 우선.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { ROOT } from './paths.mjs';

export function env(name, fallback = '') {
  let file = {};
  try {
    file = parseEnv(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'));
  } catch {}
  return String(process.env[name] || file[name] || fallback).trim();
}
