// 관리 페이지 (기획서 9-1절). 서버 쪽은 lib/admin.mjs
const $ = (id) => document.getElementById(id);
let state = null;

const SWITCHES = [
  { key: 'showTop5', label: 'TOP 5 표시', desc: '시작 화면 왼쪽 "많이 만든 작품 TOP 5" 메모' },
  { key: 'storageSearch', label: '창고 뒤지기', desc: '판단 표로 두 번 틀리면 LLM + Jev 로 목록 밖 정답 찾기. 끄면 바로 "못 맞힘"으로 가요' },
  { key: 'imageGen', label: '목각인형 새로 그리기', desc: '끄면 새 그림을 그리지 않아요. 이미 그린 그림은 계속 나와요' },
];

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `요청 실패 (${res.status})`), { status: res.status, data });
  return data;
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

function showLogin(message = '') {
  $('panel').hidden = true;
  $('logout').hidden = true;
  $('login-card').hidden = false;
  $('login-error').textContent = message;
  $('password').focus();
}

async function load() {
  try {
    state = await api('/api/admin/state');
  } catch (e) {
    if (e.status === 401) return showLogin(e.data?.configured === false ? '관리자 비밀번호가 아직 설정되지 않았어요. (ADMIN_PASSWORD)' : '');
    return toast(e.message);
  }
  $('login-card').hidden = true;
  $('panel').hidden = false;
  $('logout').hidden = false;
  render();
}

function tile(value, label) {
  const div = document.createElement('div');
  div.className = 'tile';
  div.innerHTML = '<b></b><span></span>';
  div.querySelector('b').textContent = value;
  div.querySelector('span').textContent = label;
  return div;
}

function toggleRow(label, desc, checked, onChange) {
  const row = document.createElement('div');
  row.className = 'switch-row';
  row.innerHTML = '<div><span class="name"></span><small></small></div><label class="toggle"><input type="checkbox"><span></span></label>';
  row.querySelector('.name').textContent = label;
  row.querySelector('small').textContent = desc;
  const input = row.querySelector('input');
  input.checked = checked;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => onChange(input.checked, input));
  return row;
}

function render() {
  const { settings, envLimits, usage, totals, topics } = state;
  const imageLimit = settings.dailyImageLimit ?? envLimits.image;
  const searchLimit = settings.dailySearchLimit ?? envLimits.search;
  $('tiles').replaceChildren(
    tile(`${usage.images} / ${imageLimit}`, '오늘 그린 목각인형 (장)'),
    tile(`${usage.searches} / ${searchLimit}`, '오늘 창고 뒤지기 (번)'),
    tile(`${totals.wins}번`, `맞힌 횟수 합계 (정답 ${totals.winners}개)`),
    tile(`${totals.losses}건`, '못 맞힌 기록'),
    tile(`${totals.found}개`, '창고에서 찾아 맞힌 정답'),
  );

  const save = async (patch, input) => {
    try {
      state.settings = (await api('/api/admin/settings', patch)).settings;
      toast('저장했어요');
    } catch (e) {
      if (input) input.checked = !input.checked;
      if (e.status === 401) return showLogin('다시 로그인해 주세요.');
      toast(e.message);
    }
  };
  $('switches').replaceChildren(
    ...SWITCHES.map((s) => toggleRow(s.label, s.desc, settings[s.key], (on, input) => save({ [s.key]: on }, input))),
    ...topics.map((t) => toggleRow(`주제: ${t.name}`, '끄면 주제 고르기에서 "준비 중"으로 보여요', settings.topics[t.id] !== false, (on, input) => save({ topics: { [t.id]: on } }, input))),
  );

  $('limit-image').value = settings.dailyImageLimit ?? '';
  $('limit-image').placeholder = `배포 설정값 ${envLimits.image}`;
  $('limit-search').value = settings.dailySearchLimit ?? '';
  $('limit-search').placeholder = `배포 설정값 ${envLimits.search}`;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    await api('/api/admin/login', { password: $('password').value });
    $('password').value = '';
    load();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/admin/logout', {}).catch(() => {});
  showLogin();
});

$('limits').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    state.settings = (await api('/api/admin/settings', { dailyImageLimit: $('limit-image').value, dailySearchLimit: $('limit-search').value })).settings;
    toast('상한을 저장했어요');
    render();
  } catch (err) {
    if (err.status === 401) return showLogin('다시 로그인해 주세요.');
    toast(err.message);
  }
});

const RESET_CONFIRM = {
  wins: 'TOP 5(모든 정답의 맞힌 횟수)를 초기화할까요? 되돌릴 수 없어요.',
  losses: '못 맞힌 기록을 모두 지울까요? 되돌릴 수 없어요.',
  usage: '오늘 그림 생성 수와 창고 뒤지기 수를 0으로 되돌릴까요?',
};
document.querySelectorAll('[data-reset]').forEach((b) =>
  b.addEventListener('click', async () => {
    const what = b.dataset.reset;
    if (!window.confirm(RESET_CONFIRM[what])) return;
    try {
      await api('/api/admin/reset', { what });
      toast('초기화했어요');
      load();
    } catch (err) {
      if (err.status === 401) return showLogin('다시 로그인해 주세요.');
      toast(err.message);
    }
  }),
);

load();
