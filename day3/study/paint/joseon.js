// 조선 전생 뽑기 재료: 직업 · 시대 · 운명
//
// 직업(JOBS)은 브라우저가 고르고(룰렛), 시대와 운명은 서버가 이야기를 쓸 때마다 고른다.
// costume / scene 은 이미지 모델에 그대로 들어가는 영어 묘사라서, 조선 시대 고증에 맞게 구체적으로 적는다.

// ---------------------------------------------------------------------------
// 시대 — 이야기에 엮을 실제 사건 후보
// ---------------------------------------------------------------------------

const ERAS = [
  {
    id: 'founding', label: '태조·태종 때', years: '1392~1418',
    events: '조선 건국(1392), 한양 천도(1394)와 경복궁 완공(1395), 제1·2차 왕자의 난(1398·1400), 호패법 시행(1413)',
  },
  {
    id: 'sejong', label: '세종 때', years: '1418~1450',
    events: '대마도 정벌(1419), 집현전, 장영실의 자격루(1434)와 측우기(1441), 4군 6진 개척, 훈민정음 창제(1443)·반포(1446)',
  },
  {
    id: 'sejo', label: '단종·세조 때', years: '1452~1468',
    events: '계유정난(1453), 사육신 사건(1456), 단종의 영월 청령포 유배와 죽음(1457), 이시애의 난(1467)',
  },
  {
    id: 'yeonsan', label: '성종·연산군 때', years: '1469~1506',
    events: '경국대전 완성(1485), 무오사화(1498), 갑자사화(1504), 광대 공길의 직언(1505), 흥청과 채홍사, 중종반정(1506)',
  },
  {
    id: 'jungjong', label: '중종·명종 때', years: '1506~1567',
    events: '삼포왜란(1510), 조광조와 기묘사화(1519), 을사사화(1545), 을묘왜변(1555), 임꺽정의 난(1559~1562)',
  },
  {
    id: 'imjin', label: '선조 때', years: '1567~1608',
    events: '기축옥사(1589), 임진왜란 발발과 선조의 몽진(1592), 한산도 대첩(1592), 진주성 전투(1592·1593), 행주 대첩(1593), 명량 해전(1597), 노량 해전(1598)',
  },
  {
    id: 'byeongja', label: '광해군·인조 때', years: '1608~1649',
    events: '대동법 시행(1608), 허준의 동의보감 완성(1610), 인조반정(1623), 이괄의 난(1624), 정묘호란(1627), 병자호란과 남한산성 농성(1636), 삼전도의 굴욕(1637)',
  },
  {
    id: 'sukjong', label: '효종·현종·숙종 때', years: '1649~1720',
    events: '하멜 표류(1653), 나선 정벌(1654·1658), 예송 논쟁, 경신 대기근(1670~1671), 장희빈과 환국 정치, 안용복의 울릉도·독도 담판(1693·1696), 백두산정계비(1712)',
  },
  {
    id: 'yeongjo', label: '영조 때', years: '1724~1776',
    events: '이인좌의 난(1728), 탕평책, 균역법(1750), 청계천 준천(1760), 사도세자 뒤주 사건(1762)',
  },
  {
    id: 'jeongjo', label: '정조 때', years: '1776~1800',
    events: '규장각 설치(1776), 신해통공(1791), 수원 화성 축성(1794~1796), 을묘년 화성 행차(1795), 정조의 갑작스러운 승하(1800)',
  },
  {
    id: 'sedo', label: '순조·헌종·철종 때', years: '1800~1863',
    events: '신유박해와 정약용의 강진 유배(1801), 홍경래의 난(1811~1812), 최제우의 동학 창시(1860), 김정호의 대동여지도(1861), 진주 농민 봉기(1862)',
  },
  {
    id: 'gojong', label: '고종 때', years: '1863~1897',
    events: '흥선대원군의 경복궁 중건(1865~1868), 병인양요(1866), 신미양요(1871), 강화도 조약(1876), 임오군란(1882), 갑신정변(1884), 동학 농민 운동(1894), 을미사변(1895), 아관파천(1896)',
  },
];

const LATE = ['sukjong', 'yeongjo', 'jeongjo', 'sedo', 'gojong'];

// ---------------------------------------------------------------------------
// 운명 — 이야기의 결. weight 가 클수록 자주 나온다.
// ---------------------------------------------------------------------------

const FATES = [
  {
    id: 'tragic', label: '비극', weight: 25,
    guide: '억울하거나 비참한 최후. 역사의 소용돌이에 휘말려 처형·유배·전사·객사·굶주림 등으로 끝난다. 담담하고 절제된 문체로 쓰고, 잔혹한 장면은 자세히 그리지 않는다.',
  },
  {
    id: 'glory', label: '영광', weight: 20,
    guide: '크게 이름을 떨친다. 신분의 벽을 넘는 출세나 역사의 뒤편에 남은 큰 업적. 통쾌하게.',
  },
  {
    id: 'fantasy', label: '기담', weight: 15,
    guide: '조선의 설화·야담 속 존재(도깨비, 구미호, 산신령, 저승사자, 이무기, 신선 등)가 삶에 끼어든다. 실제 역사 사건과 자연스럽게 엮되 역사의 큰 줄기는 바꾸지 않는다.',
  },
  {
    id: 'twist', label: '반전', weight: 15,
    guide: '아무도 몰랐던 비밀이나 역사의 숨은 공로자로서의 삶. 마지막 장에서 반전이 드러난다.',
  },
  {
    id: 'comic', label: '해학', weight: 15,
    guide: '해학과 풍자가 넘치는 삶. 어이없고 웃긴 사건, 그리고 황당한 최후나 사인. 판소리 사설처럼 능청스럽게.',
  },
  {
    id: 'humble', label: '소박', weight: 10,
    guide: '역사의 큰 사건을 곁에서 스쳐 지나갔지만, 소박하고 따뜻하게 천수를 누린다. 잔잔한 여운.',
  },
];

// ---------------------------------------------------------------------------
// 직업
// ---------------------------------------------------------------------------

const JOBS = [
  {
    id: 'gwangdae', name: '광대', hanja: '廣大', desc: '장터를 떠도는 줄타기 광대',
    en: 'gwangdae, a traveling tightrope acrobat and entertainer',
    costume: 'white hanbok jacket and baggy trousers tied at the ankles, red-blue-yellow sashes crossed over the chest, a small black brimmed hat, holding an open folding fan for balance',
    scene: 'a tightrope stretched high over a village market crowd',
  },
  {
    id: 'geoji', name: '거지', hanja: '乞人', desc: '장타령 부르는 각설이',
    en: 'a beggar (gakseori) singing for coins at the market',
    costume: 'ragged, patched gray-brown hanbok full of holes, straw sandals, a cracked gourd bowl in hand, a messy topknot with bits of straw, a crooked wooden stick',
    scene: 'under a stone bridge next to a market street',
  },
  {
    id: 'baekjeong', name: '백정', hanja: '白丁', desc: '고리 짜고 소 잡던 천민',
    en: 'a baekjeong, a low-caste butcher and wicker-basket maker',
    costume: 'plain undyed hemp clothes with rolled-up sleeves, a cheap bamboo paeraengi hat (the low-caste hat), a leather apron, holding a willow basket',
    scene: 'a lonely thatched hut at the edge of a village',
  },
  {
    id: 'gisaeng', name: '기생', hanja: '妓生', desc: '시·서·화·가무에 능한 관기',
    en: 'a gisaeng, a skilled court entertainer-artist of poetry, music and dance',
    costume: 'a big braided gache wig piled high with ornate hairpins, a short colorful silk jeogori and a full long chima skirt, holding a gayageum zither',
    scene: 'a riverside pavilion with hanging lanterns',
  },
  {
    id: 'mudang', name: '무당', hanja: '巫堂', desc: '굿판을 여는 큰무당',
    en: 'a mudang, a shaman performing a gut ritual',
    costume: 'a red shaman robe with long rainbow-striped sleeves, a tall red hat with feathers, a folding fan in one hand and a bunch of brass bells in the other',
    scene: 'a gut ritual with five-colored flags, a straw rope and a janggu drum',
  },
  {
    id: 'pojol', name: '포졸', hanja: '捕卒', desc: '도둑 잡는 포도청 포졸',
    en: 'a pojol, a constable of the police bureau',
    costume: 'a black felt jeollip hat with a red tassel, a dark navy uniform robe with a red vest, a six-sided wooden club in hand, a red rope tied at the waist',
    scene: 'a night street of Hanyang lit by a paper lantern',
  },
  {
    id: 'amhaeng', name: '암행어사', hanja: '暗行御史', desc: '거지꼴로 변장한 임금의 밀사',
    en: 'an amhaeng-eosa, the king\'s secret inspector disguised as a shabby traveler',
    costume: 'a deliberately shabby, patched white robe and a tattered black gat hat, secretly holding up a round bronze horse tablet (mapae)',
    scene: 'the gate of a corrupt magistrate\'s office',
    eras: ['jungjong', 'imjin', 'byeongja', ...LATE],
  },
  {
    id: 'eoui', name: '어의', hanja: '御醫', desc: '임금의 몸을 돌보는 의원',
    en: 'an eoui, the royal physician',
    costume: 'a dark green official dallyeong robe with a square rank badge, a black winged samo hat, holding acupuncture needles beside a box of medicinal herbs',
    scene: 'a palace room with a wall of wooden medicine drawers',
  },
  {
    id: 'dogong', name: '사기장', hanja: '沙器匠', desc: '백자를 빚는 분원 도공',
    en: 'a potter making white porcelain',
    costume: 'white hemp work clothes with rolled-up sleeves, a cloth headband, clay-stained hands, shaping a white porcelain moon jar on a kick wheel',
    scene: 'a hillside climbing kiln puffing smoke',
  },
  {
    id: 'bobusang', name: '보부상', hanja: '褓負商', desc: '팔도를 누비는 등짐장수',
    en: 'a bobusang, a traveling peddler',
    costume: 'a bamboo paeraengi hat with fluffy white cotton balls on both sides, plain hanbok with leg wraps, a wooden A-frame jige on the back loaded with bundles of goods, a walking stick',
    scene: 'a winding mountain pass road',
  },
  {
    id: 'gungnyeo', name: '궁녀', hanja: '宮女', desc: '구중궁궐의 나인',
    en: 'a gungnyeo, a palace court lady',
    costume: 'a green dangui jacket over a deep navy chima skirt, hair in a neat low bun with a hairpin, hands folded inside the sleeves',
    scene: 'a palace corridor with red pillars and latticed doors',
  },
  {
    id: 'naesi', name: '내시', hanja: '內侍', desc: '임금 곁을 지키는 내관',
    en: 'a naesi, a palace eunuch attendant to the king',
    costume: 'a dark crimson official robe, a black winged samo hat, holding a white horsehair fly whisk',
    scene: 'the doorway of a royal throne hall',
  },
  {
    id: 'sagwan', name: '사관', hanja: '史官', desc: '임금의 일거수일투족을 적는 기록관',
    en: 'a sagwan, a royal historian recording the king\'s every word',
    costume: 'a green official robe, a black samo hat, kneeling with a brush in hand, paper and an ink stone in front',
    scene: 'the corner of a royal audience hall',
  },
  {
    id: 'hwawon', name: '화원', hanja: '畵員', desc: '도화서의 궁중 화원',
    en: 'a hwawon, a court painter of the royal painting bureau',
    costume: 'a light blue robe, a black gat hat, holding a big brush over a half-finished scroll painting',
    scene: 'a painting studio full of folding screens',
  },
  {
    id: 'jeongisu', name: '전기수', hanja: '傳奇叟', desc: '저잣거리에서 소설을 읽어 주는 이야기꾼',
    en: 'a jeongisu, a professional storyteller reading novels aloud at the market',
    costume: 'a white durumagi coat, a black gat hat, reading from an old thread-bound novel, a fan in the other hand',
    scene: 'a straw mat at a busy market surrounded by listeners',
    eras: ['yeongjo', 'jeongjo', 'sedo', 'gojong'],
  },
  {
    id: 'jamnyeo', name: '잠녀', hanja: '潛女', desc: '제주 바다의 해녀',
    en: 'a jamnyeo, a Jeju island free diver (haenyeo)',
    costume: 'white cotton diving clothes, a white headscarf, a round gourd float with a net bag, holding up an abalone',
    scene: 'black volcanic rocks and waves of Jeju',
  },
  {
    id: 'chakho', name: '착호갑사', hanja: '捉虎甲士', desc: '호랑이 잡는 특수 부대 군사',
    en: 'a chakho-gapsa, a soldier of the royal tiger-hunting unit',
    costume: 'a fur-lined padded jacket and fur cap, a bow on the back and a spear in hand, a tiger pelt slung over one shoulder',
    scene: 'a snowy mountain forest with tiger tracks',
  },
  {
    id: 'uibyeong', name: '의병', hanja: '義兵', desc: '나라를 지키러 일어선 의병',
    en: 'an uibyeong, a volunteer militia fighter defending the country',
    costume: 'plain white hanbok, a cloth headband, straw sandals, a spear in hand and a bow on the back',
    scene: 'a stone mountain fortress with a banner',
    eras: ['imjin', 'byeongja', 'gojong'],
  },
  {
    id: 'janggun', name: '장군', hanja: '將軍', desc: '변방을 지키는 무장',
    en: 'a Joseon military general',
    costume: 'red studded dujeonggap coat armor, an iron helmet with a red plume, a long sword at the waist and a bow',
    scene: 'a fortress wall lined with flags',
  },
  {
    id: 'seonbi', name: '선비', hanja: '士', desc: '책만 읽는 가난한 시골 선비',
    en: 'a seonbi, a poor Confucian scholar',
    costume: 'a white dopo robe, a black horsehair gat hat, holding a folding fan and a thread-bound book',
    scene: 'a small thatched-roof study beside a pine tree',
  },
  {
    id: 'nobi', name: '노비', hanja: '奴婢', desc: '대갓집의 솔거 노비',
    en: 'a nobi, a household servant of a noble family',
    costume: 'rough undyed hemp clothes, straw sandals, a towel tied around the head, carrying firewood on a wooden A-frame jige',
    scene: 'the courtyard of a tiled-roof noble mansion',
  },
  {
    id: 'hwajeok', name: '화적', hanja: '火賊', desc: '산채를 차린 도적 떼 두목',
    en: 'a hwajeok, the leader of a mountain bandit gang',
    costume: 'a headband, a rough sleeveless vest, leg wraps, a big sword at the waist, wild untied hair',
    scene: 'a mountain hideout with a campfire',
  },
  {
    id: 'yeokgwan', name: '역관', hanja: '譯官', desc: '사신단을 따라 중국을 오가는 통역관',
    en: 'a yeokgwan, an official interpreter traveling with envoy missions to China',
    costume: 'a blue official robe, a black gat hat, carrying bundles of ginseng and a rolled document',
    scene: 'an envoy procession on a long road with horses',
  },
  {
    id: 'cheonmun', name: '천문관', hanja: '天文官', desc: '관상감에서 별을 읽는 관원',
    en: 'an astronomer of the royal observatory',
    costume: 'a green official robe, a black samo hat, standing beside a bronze armillary sphere, holding a star chart scroll',
    scene: 'a stone observatory platform under a starry sky',
  },
  {
    id: 'yajang', name: '대장장이', hanja: '冶匠', desc: '불꽃 튀는 대장간의 주인',
    en: 'a village blacksmith',
    costume: 'a sleeveless hemp tunic, a leather apron, a headband, a hammer raised over a glowing red iron on an anvil',
    scene: 'a smoky forge with flying sparks',
  },
  {
    id: 'sagong', name: '뱃사공', hanja: '沙工', desc: '한강 나루의 뱃사공',
    en: 'a ferryman on the Han river',
    costume: 'a straw rain cape, a wide bamboo hat, rolled-up trousers, pushing a long wooden oar',
    scene: 'a small ferry boat at a misty river dock',
  },
  {
    id: 'jumo', name: '주모', hanja: '酒母', desc: '길목 주막의 주인',
    en: 'a jumo, the keeper of a roadside tavern',
    costume: 'a white headscarf, plain jeogori and chima with an apron, a big ladle in one hand and a bowl of makgeolli in the other',
    scene: 'a roadside tavern with big clay jars and a straw roof',
  },
  {
    id: 'eungsa', name: '응사', hanja: '鷹師', desc: '사냥매를 길들이는 매사냥꾼',
    en: 'an eungsa, a falconer',
    costume: 'a short hanbok with leg wraps, a fur cap, a thick leather glove with a hunting hawk perched on it',
    scene: 'a wide field with distant mountains',
  },
  {
    id: 'jeoseung', name: '저승사자', hanja: '使者', desc: '망자를 데리러 오는 저승의 관리',
    en: 'a jeoseung-saja, the Joseon folklore grim reaper who escorts the dead',
    costume: 'an all-black hanbok robe and a tall black gat hat, a pale face, holding a scroll list of names of the dead',
    scene: 'a misty full-moon night at a village gate',
  },
  {
    id: 'dosa', name: '도사', hanja: '道士', desc: '도술을 부리는 떠돌이 도사',
    en: 'a dosa, a wandering Taoist sorcerer like Jeon Woo-chi',
    costume: 'a flowing pale robe, a tall black hat, a white feather fan in one hand and a yellow paper talisman in the other',
    scene: 'a mountain peak floating among swirling clouds',
  },
  {
    id: 'byeolgam', name: '별감', hanja: '別監', desc: '붉은 철릭의 궁궐 멋쟁이',
    en: 'a byeolgam, a flamboyant royal palace attendant known for fashion',
    costume: 'a bright red cheollik robe, a small yellow straw choerip hat with a decorative string, a fancy sash',
    scene: 'a grand palace gate',
  },
  {
    id: 'hunjang', name: '훈장', hanja: '訓長', desc: '서당의 엄한 훈장님',
    en: 'a hunjang, a village schoolmaster',
    costume: 'a white robe, a black horsehair indoor cap, a long thin switch in one hand and a Thousand Character Classic book in the other',
    scene: 'a village seodang classroom with children\'s low desks',
  },
  {
    id: 'yeot', name: '엿장수', hanja: '', desc: '가위 장단 치는 엿장수',
    en: 'a yeot (taffy) seller clacking big scissors',
    costume: 'plain hanbok, a towel tied on the head, big iron scissors in one hand, a wooden tray of yeot taffy hung from the neck',
    scene: 'a village alley with kids running',
    eras: LATE,
  },
  {
    id: 'muljang', name: '물장수', hanja: '', desc: '새벽마다 물지게 지는 북청 물장수',
    en: 'a water carrier delivering water at dawn',
    costume: 'a shoulder pole with two wooden water buckets, straw sandals, a sweat towel around the neck',
    scene: 'a Hanyang alley at dawn beside a well',
    eras: ['sedo', 'gojong'],
  },
  {
    id: 'sorikkun', name: '소리꾼', hanja: '', desc: '목이 쉬도록 판소리 하는 명창',
    en: 'a sorikkun, a pansori singer',
    costume: 'a white durumagi coat, a black gat hat, an open folding fan in one hand and a handkerchief in the other, singing with the mouth wide open',
    scene: 'a straw mat in a courtyard with a drummer and listeners',
    eras: LATE,
  },
  {
    id: 'mangnani', name: '망나니', hanja: '', desc: '칼춤 추는 사형 집행인',
    en: 'a mangnani, a wild-looking executioner of the old courts',
    costume: 'loose wild hair, a red headband, rough red-and-black clothes, a big curved sword raised in a dance pose',
    scene: 'an empty sandy riverbank under a gloomy sky',
  },
  {
    id: 'simmani', name: '심마니', hanja: '', desc: '산삼을 찾아 깊은 산을 헤매는 사람',
    en: 'a simmani, a wild-ginseng hunter',
    costume: 'rough mountain clothes, straw sandals, a long digging stick and a basket, joyfully holding up a wild ginseng root',
    scene: 'a deep mountain valley with mossy rocks',
  },
  {
    id: 'seungbyeong', name: '승병', hanja: '僧兵', desc: '칼을 든 산사의 스님',
    en: 'a seungbyeong, a Buddhist warrior monk',
    costume: 'a gray monk robe with a brown kasaya sash, a shaved head, wooden prayer beads around the neck, a long staff in hand',
    scene: 'a mountain temple gate',
    eras: ['imjin', 'byeongja'],
  },
  {
    id: 'geoja', name: '과거 수험생', hanja: '擧子', desc: '몇 번째인지 모를 과거 응시생',
    en: 'a perpetual civil-service exam candidate',
    costume: 'a white scholar robe, a black gat hat, a brush in hand, a long exam paper scroll, a lunch bundle tied on the back',
    scene: 'a crowded exam ground with parasols and a royal banner',
  },
  {
    id: 'waljja', name: '왈짜', hanja: '曰者', desc: '한양 뒷골목의 멋쟁이 왈패',
    en: 'a waljja, a swaggering street tough of Hanyang',
    costume: 'flashy colorful hanbok worn loosely, a tilted black gat hat, a long smoking pipe, a swaggering pose',
    scene: 'a busy Hanyang back alley with tiled roofs',
    eras: ['yeongjo', 'jeongjo', 'sedo', 'gojong'],
  },
  {
    id: 'gyeokgun', name: '격군', hanja: '格軍', desc: '판옥선의 노 젓는 수군',
    en: 'a gyeokgun, an oarsman of a Joseon panokseon warship',
    costume: 'a black felt jeollip hat, a short navy uniform jacket with a red sash, gripping a long oar',
    scene: 'the deck of a Joseon panokseon warship at sea',
  },
  {
    id: 'damo', name: '다모', hanja: '茶母', desc: '포도청의 여자 수사관',
    en: 'a damo, an undercover investigator of the police bureau',
    costume: 'a plain dark hanbok, hair in a braid under a black head cover, a short sword hidden in the sleeve, a coil of rope',
    scene: 'a moonlit tiled rooftop over a Hanyang alley',
  },
];

const jobById = new Map(JOBS.map((job) => [job.id, job]));
const eraById = new Map(ERAS.map((era) => [era.id, era]));

const findJob = (id) => jobById.get(id) || null;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function pickEra(job) {
  return job.eras ? eraById.get(pick(job.eras)) : pick(ERAS);
}

function pickFate() {
  let roll = Math.random() * FATES.reduce((sum, fate) => sum + fate.weight, 0);
  return FATES.find((fate) => (roll -= fate.weight) < 0) || FATES[0];
}

// 브라우저에 보낼 직업 목록 (이미지 프롬프트용 영어 묘사는 빼고)
const publicJobs = () => JOBS.map(({ id, name, hanja, desc }) => ({ id, name, hanja, desc }));

module.exports = { JOBS, ERAS, FATES, findJob, pickEra, pickFate, publicJobs };
