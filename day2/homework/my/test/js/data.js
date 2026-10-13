// 게임 데이터 — 실제 스토어 정보 (Google Play / YouTube)
// cat: 시안용 분류(놀이 유형). 필요하면 여기만 고치면 됩니다.

const img = (slug, n) => `/assets/games/${slug}/${String(n).padStart(2, '0')}.jpg`;
const range = (slug, from, to) => Array.from({ length: to - from + 1 }, (_, i) => img(slug, from + i));
const play = (id) => `https://play.google.com/store/apps/details?id=${id}`;
const yt = (url) => url.split('/').pop();

export const categories = [
  { id: 'all', label: '전체', icon: '🧺' },
  { id: 'job', label: '직업놀이', icon: '🩺' },
  { id: 'make', label: '만들기·가게', icon: '🧁' },
  { id: 'care', label: '돌보기', icon: '🐱' },
  { id: 'adventure', label: '탐험·스포츠', icon: '🦖' },
  { id: 'brain', label: '음악·퍼즐', icon: '🎹' },
];

export const games = [
  {
    slug: 'dentist', title: '코코비 치과의사', cat: 'job', color: '#9fe0f0', downloads: '1,000만+',
    desc: '아픈 치아를 가진 친구들을 치료하며 올바른 양치 습관을 배우는 어린이 치과 놀이.',
    headline: '어린이 치과에 온 친구들을 치료해 줘요',
    body: '충치 치료, 부러진 치아 치료, 임플란트, 교정까지 다양한 치과 진료를 직접 해봐요. 칫솔과 치약을 골라 올바른 양치법을 배우고, 변신한 코코비가 되어 충치 세균을 무찔러요.',
    link: play('com.kigle.cocobi.dentist'), video: yt('https://youtu.be/TdryMmt4xzo'), runtime: '00:40',
  },
  {
    slug: 'dinosaur-world', title: '코코비 공룡 월드', cat: 'adventure', color: '#5b6bd6', downloads: '100만+',
    desc: '고고학자 코코와 러비가 되어 화석을 발굴하고 공룡을 키워 배틀하는 공룡 탐험 게임.',
    headline: '화석을 찾아 떠나는 공룡 대탐험',
    body: '드릴카를 타고 화산, 빙하, 사막의 땅속을 탐험하며 공룡 화석을 발굴해요. 연구소에서 화석을 맞춰 공룡을 되살리고, 먹이를 주고 변신시켜 전투에 나서요.',
    link: play('com.kigle.cocobi.dinosaurworld'), video: yt('https://youtu.be/7b3ZeBkmml0'), runtime: '01:00',
  },
  {
    slug: 'cotton-candy-cat', title: '코코비 솜사탕 고양이', cat: 'care', color: '#f7b3e0', downloads: '100만+',
    desc: '알에서 태어난 솜사탕 고양이를 돌보고 꾸미며 함께 노는 아기 동물 키우기 게임.',
    headline: '달콤한 솜사탕 하우스에 오신 걸 환영해요',
    body: '레몬 샤벳부터 초코 쿠키까지, 18마리의 솜사탕 고양이를 모으고 마법 합체로 새로운 알을 얻어요. 32가지 음식을 먹이고 36벌의 옷으로 꾸며 사진을 찍어요.',
    link: play('com.kigle.cocobi.cottoncandycat'), video: yt('https://youtu.be/gCpqZiQvffc'), runtime: '00:52',
  },
  {
    slug: 'hospital-world', title: '코코비 종합 병원', cat: 'job', color: '#f7e07a', downloads: '100만+',
    desc: '의사가 되어 35가지 치료로 사람과 동물 환자를 돌보는 병원 놀이 게임.',
    headline: '아픈 환자들을 치료하는 꼬마 의사',
    body: '감기, 골절, 바이러스, 알레르기부터 동물 병원과 치과 진료까지 35가지 치료를 쉽고 간단하게 해봐요. 환자를 치료할수록 병원이 점점 커져요.',
    link: play('com.kigle.cocobi.hospitalworld'), video: yt('https://youtu.be/857i58XFwYg'), runtime: '01:00',
  },
  {
    slug: 'bakery', title: '코코비 케이크 만들기', cat: 'make', color: '#f4a6d0', downloads: '50만+',
    desc: '꼬마 제빵사가 되어 케이크, 쿠키, 도넛을 굽고 나만의 빵집을 운영하는 키즈 베이킹 게임.',
    headline: '달콤한 빵이 가득한 코코비 베이커리',
    body: '레인보우 케이크, 동물 쿠키, 롤 케이크, 도넛, 공주 케이크, 과일 타르트까지 6가지 메뉴를 직접 만들어요. 번 코인으로 가게를 꾸미고 코코에게 예쁜 옷도 입혀 줘요.',
    link: play('com.kigle.cocobi.bakery'), video: yt('https://youtu.be/cs_VV_v4duo'), runtime: '00:53',
  },
  {
    slug: 'cocobi-music', title: '코코비 음악놀이', cat: 'brain', color: '#8fd8f0', downloads: '50만+',
    desc: '꼬마공룡 코코비 친구들과 함께 악기를 연주하고 소리를 탐험하는 키즈 음악 게임.',
    headline: '멋진 악기, 다양한 소리가 가득한 음악놀이',
    body: '8개의 악기로 자유롭게 연주하며 나만의 멜로디를 만들고, 52개의 소리를 탐색하고, 24곡의 인기 동요를 연주하며 놀아요.',
    link: play('com.kigle.cocobi.music'), video: yt('https://youtu.be/BO1bck2xiRU'), runtime: '00:48',
  },
  {
    slug: 'space-police', title: '코코비 꼬마 우주 경찰', cat: 'job', color: '#4b3aa8', downloads: '50만+',
    desc: '우주 경찰이 되어 도둑을 잡고 위험에 빠진 행성을 구하는 우주 직업 체험 게임.',
    headline: '우주의 평화를 지키는 꼬마 경찰 출동',
    body: '신고를 받으면 우주선을 타고 출동해요. 별빛 도둑 찾기, 아기 외계인 찾기, 블랙홀 우주선 구조 등 6가지 임무를 경찰 로봇과 함께 해결해요.',
    link: play('com.kigle.cocobi.spacepolice'), video: yt('https://youtu.be/NvhXQGu2fM4'), runtime: '00:54',
  },
  {
    slug: 'construction-truck', title: '코코비 중장비 놀이', cat: 'job', color: '#8ccf5a', downloads: '10만+',
    desc: '불도저, 굴착기, 덤프트럭, 레미콘과 함께 건물을 짓고 시민을 구조하는 중장비 게임.',
    headline: '힘센 중장비 친구들과 함께하는 건설 임무',
    body: '주택, 다리, 기차역, 터널, 빌딩을 직접 지어요. 지진과 터널 사고 현장에 긴급 출동해 시민을 구하고, 모은 나사로 나만의 중장비를 만들어요.',
    link: play('com.kigle.cocobi.constructiontruck'), video: yt('https://youtu.be/G-hWglPPb-8'), runtime: '00:44',
  },
  {
    slug: 'little-champion', title: '코코비 꼬마 챔피언', cat: 'adventure', color: '#7fc4f0', downloads: '10만+',
    desc: '코코비 마을 운동회에서 8가지 종목에 도전해 스포츠 챔피언이 되는 게임.',
    headline: '뜨거운 운동회, 챔피언에 도전해요',
    body: '역도, 클레이 사격, 농구, 복싱, 철인 삼종, 양궁, 다이빙, 수중 발레까지 8가지 종목에서 1등을 노려요. 피버 모드와 아이템으로 짜릿한 역전을!',
    link: play('com.kigle.cocobi.littlechampion'), video: null, runtime: null,
  },
  {
    slug: 'flower-shop', title: '코코비 꽃 만들기', cat: 'make', color: '#a8e07a', downloads: '10만+',
    desc: '정원에서 꽃을 키우고 키링, 향수, 꽃다발을 만들어 파는 꽃 가게 게임.',
    headline: '꽃으로 만드는 특별한 선물 가게',
    body: '씨앗을 심고 가꿔 꽃을 수확하고, 그 꽃으로 키링, 목걸이, 비누, 꽃다발, 향수를 만들어요. 꽃수레를 끌고 배달도 떠나요.',
    link: play('com.kigle.cocobi.flowershop'), video: yt('https://youtu.be/7164FZ2ZfR8'), runtime: '01:00',
  },
  {
    slug: 'scavenger-hunt', title: '놈놈 트윈스 숨은그림찾기', cat: 'brain', color: '#6a8fd0', downloads: '1만+',
    desc: '먹방 남매와 함께 스테이지 곳곳에 숨은 푸드 몬스터를 찾아내는 숨은그림찾기 게임.',
    headline: '우주최강 먹방 남매의 푸드 몬스터 대모험',
    body: '뉴욕부터 해저도시까지, 개성 넘치는 스테이지에 숨은 물건과 푸드 몬스터를 찾아요. 노멀·하드·타임어택·매치페어 모드로 다양하게 즐겨요.',
    link: play('com.kigle.scavengerhunt'), video: null, runtime: null, portrait: true,
  },
].map((g) => ({
  ...g,
  cover: img(g.slug, 1),
  gallery: range(g.slug, 2, 5),
}));

export const stores = {
  play: 'https://play.google.com/store/apps/dev?id=4740368439505063702',
  apple: 'https://apps.apple.com/us/developer/kigle-inc/id1078190379',
  youtube: 'https://www.youtube.com/channel/UC2fWLJgQUxRg-5Mv5A0cJMg', // kigle.co.kr Watch 페이지의 채널 링크
};

// ---------- 코코비 친구들 ----------
// 캐릭터 이미지는 시안이라 kigle.co.kr 공개 이미지를 그대로 불러옵니다.
// 실제 사이트에서는 원본 파일을 assets/ 에 넣고 주소만 바꾸면 됩니다.
const K = (file) => `https://kigle.co.kr/img/custom/${file}`;

export const art = {
  family: K('main_visual_character_m.png'),   // 손 흔드는 3D 캐릭터 넷
  playground: K('about_playground_img.png'),  // 모니터 주위에 모인 3D 친구들
};

// star: true 인 친구(코코·러비)는 주인공 카드로 크게 나오고 '함께 노는 친구들'에도 처음부터 있어요.
// 나머지는 랜덤 1명이 먼저 나오고, 공룡 알에서 새 친구가 나오면 '함께 노는 친구들'로 합류해요.
// 코코·러비 소개 문구는 공식 소개('걸크러쉬 골목 대장 코코와 호기심 많고 귀여운 동생 러비')에서 가져왔고,
// lines(말풍선)는 시안용으로 쓴 대사입니다. 나머지 친구들은 name 을 채우면 인사할 때 이름을 말해요.
export const friends = [
  {
    id: 'coco', star: true, name: '코코', en: 'Coco', trait: '걸크러쉬 골목 대장', color: '#ff8fb1', img: K('about_original_img_1.png'),
    lines: ['안녕! 나는 코코야!', '따라와, 골목 대장이 간다!', '오늘은 뭐 하고 놀까?'],
  },
  {
    id: 'lobi', star: true, name: '러비', en: 'Lobi', trait: '호기심 많고 귀여운 동생', color: '#ffd45c', img: K('about_original_img_2.png'),
    lines: ['안녕! 나는 러비야!', '이건 뭐야? 너무 궁금해!', '코코, 같이 가!'],
  },
  { id: 'red', name: null, color: '#ff6b6b', img: K('about_original_img_3.png') },
  { id: 'blue', name: null, color: '#7ccbff', img: K('about_original_img_4.png') },
  { id: 'green', name: null, color: '#8fdb6e', img: K('about_original_img_5.png') },
  { id: 'brown', name: null, color: '#ff9e5e', img: K('about_original_img_6.png') },
  { id: 'gray', name: null, color: '#b79cff', img: K('about_original_img_7.png') },
];

export const greetings = ['안녕!', '같이 놀자!', '반가워!', '헤헤', '나 여기 있어!'];
