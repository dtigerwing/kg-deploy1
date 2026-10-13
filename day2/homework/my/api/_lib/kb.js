// 챗봇 지식베이스(카테고리 + 질문·답변) 읽기·쓰기
import crypto from 'node:crypto';
import { store } from './store.js';
import { HttpError } from './http.js';
import { seedKb } from './seed-kb.js';

const KEY = 'kb:v1';

export async function loadKb() {
  return (await store.get(KEY)) || structuredClone(seedKb);
}

async function write(kb, expectedRev) {
  const current = await loadKb();
  if (expectedRev != null && expectedRev !== current.rev) throw new HttpError(409, '다른 곳에서 먼저 저장했어요. 새로고침 후 다시 해 주세요.');
  kb.rev = current.rev + 1;
  kb.updatedAt = new Date().toISOString();
  await store.set(KEY, kb);
  return kb;
}

const newId = () => crypto.randomUUID().slice(0, 8);
const text = (v, max, label) => {
  const s = String(v ?? '').trim();
  if (!s) throw new HttpError(400, `${label}을(를) 적어 주세요.`);
  if (s.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 적어 주세요.`);
  return s;
};

// 이용자에게 보여 줄 부분 (켜진 항목, 항목이 있는 카테고리만)
export function publicKb(kb) {
  const items = kb.items.filter((i) => i.enabled);
  const used = new Set(items.map((i) => i.categoryId));
  return {
    categories: kb.categories.filter((c) => used.has(c.id)).map(({ id, name, icon }) => ({ id, name, icon })),
    items: items.map(({ id, categoryId, question }) => ({ id, categoryId, question })),
  };
}

export async function saveItem(input, expectedRev) {
  const kb = await loadKb();
  const categoryId = String(input.categoryId || '');
  if (!kb.categories.some((c) => c.id === categoryId)) throw new HttpError(400, '카테고리를 골라 주세요.');
  const data = {
    categoryId,
    question: text(input.question, 200, '질문'),
    answer: text(input.answer, 2000, '답변'),
    enabled: Boolean(input.enabled),
    updatedAt: new Date().toISOString(),
  };
  if (input.id) {
    const found = kb.items.find((i) => i.id === input.id);
    if (!found) throw new HttpError(404, '이미 지워진 질문이에요. 새로고침해 주세요.');
    Object.assign(found, data);
  } else {
    kb.items.push({ id: newId(), ...data });
  }
  return write(kb, expectedRev);
}

export async function deleteItem(id, expectedRev) {
  const kb = await loadKb();
  const before = kb.items.length;
  kb.items = kb.items.filter((i) => i.id !== id);
  if (kb.items.length === before) throw new HttpError(404, '이미 지워진 질문이에요.');
  return write(kb, expectedRev);
}

export async function saveCategory(input, expectedRev) {
  const kb = await loadKb();
  const data = { name: text(input.name, 30, '카테고리 이름'), icon: String(input.icon || '').trim().slice(0, 4) || '💬' };
  if (input.id) {
    const found = kb.categories.find((c) => c.id === input.id);
    if (!found) throw new HttpError(404, '이미 지워진 카테고리예요.');
    Object.assign(found, data);
  } else {
    if (kb.categories.length >= 30) throw new HttpError(400, '카테고리는 30개까지 만들 수 있어요.');
    kb.categories.push({ id: newId(), ...data });
  }
  return write(kb, expectedRev);
}

export async function deleteCategory(id, expectedRev) {
  const kb = await loadKb();
  const count = kb.items.filter((i) => i.categoryId === id).length;
  if (count) throw new HttpError(400, `이 카테고리에 질문이 ${count}개 있어요. 질문을 먼저 옮기거나 지워 주세요.`);
  kb.categories = kb.categories.filter((c) => c.id !== id);
  return write(kb, expectedRev);
}

export async function moveCategory(id, dir, expectedRev) {
  const kb = await loadKb();
  const i = kb.categories.findIndex((c) => c.id === id);
  const j = i + (dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= kb.categories.length) return kb;
  [kb.categories[i], kb.categories[j]] = [kb.categories[j], kb.categories[i]];
  return write(kb, expectedRev);
}

export async function resetKb() {
  return write(structuredClone(seedKb));
}
