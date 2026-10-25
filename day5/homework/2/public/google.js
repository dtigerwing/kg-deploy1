// 구글 로그인(Google Identity Services) + Sheets API 읽기.
// 로그인한 사람의 권한으로 읽으므로 그 사람이 볼 수 있는 시트만 열린다. 토큰은 메모리에만 둔다.
import { GOOGLE_CLIENT_ID } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
let token = null;

export const hasClientId = () => Boolean(GOOGLE_CLIENT_ID);

// https://docs.google.com/spreadsheets/d/<id>/edit#gid=<탭 번호>
export function parseLink(link) {
  const id = (link.match(/\/spreadsheets\/d\/([\w-]+)/) || [])[1];
  if (!id) return null;
  const gid = (link.match(/[#&?]gid=(\d+)/) || [])[1];
  return { id, gid: gid === undefined ? null : Number(gid) };
}

// 로그인 창은 클릭 직후에만 열리므로, 클릭 처리에서 await 없이 바로 여기까지 와야 한다
function signIn() {
  if (token && token.expires > Date.now() + 60000) return Promise.resolve(token.value);
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('구글 로그인 스크립트를 불러오지 못했어요. 인터넷 연결을 확인하세요.'));
      return;
    }
    google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error) return reject(new Error(`구글 로그인에 실패했어요 (${res.error}).`));
        token = { value: res.access_token, expires: Date.now() + res.expires_in * 1000 };
        resolve(token.value);
      },
      error_callback: (err) => reject(new Error(err.type === 'popup_closed' ? '로그인 창이 닫혔어요.' : `구글 로그인에 실패했어요 (${err.type}).`)),
    }).requestAccessToken();
  });
}

async function api(path) {
  const t = await signIn();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { headers: { Authorization: `Bearer ${t}` } });
  if (res.ok) return res.json();
  if (res.status === 401) token = null;
  const known = {
    401: '로그인이 만료됐어요. 다시 불러오세요.',
    403: '이 구글 계정으로는 시트를 볼 권한이 없어요.',
    404: '시트를 찾지 못했어요. 링크를 확인하세요.',
  };
  throw new Error(known[res.status] || `시트를 읽지 못했어요 (${res.status}).`);
}

export async function listTabs(id) {
  const data = await api(`${id}?fields=properties.title,sheets.properties(sheetId,title)`);
  return {
    title: data.properties.title,
    tabs: data.sheets.map((s) => ({ id: s.properties.sheetId, title: s.properties.title })),
  };
}

// 탭 전체 값. 화면에 보이는 글자 그대로(FORMATTED_VALUE), 병합 칸은 왼쪽 위에만 값이 있다
export async function readTab(id, title) {
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'`);
  const data = await api(`${id}/values/${range}`);
  return data.values || [];
}
