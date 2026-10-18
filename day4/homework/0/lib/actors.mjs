// 진행자 루소 (흉내 배우가 아님). 포즈 그림을 만들 때 쓴다 (scripts/make-russo.mjs)
export const RUSSO_LOOK = 'Russo, a chubby beige ankylosaurus carpenter uncle with a round face, a tan muzzle, a thick dark unibrow, small black eyes, a white sweat drop on his head, a blue knit beanie, a white shirt and blue overalls with yellow buttons';

// 흉내 배우 10명 (기획서 6절). look 은 이미지 모델용 생김새, vibe 는 Jev 가 고를 때 보는 성격.
// vibe 는 서로 겹치지 않게 쓴다. "주인공·슈퍼스타"처럼 아무 정답에나 어울리는 말을 넣으면 Jev 가 그 배우만 고른다
// (처음 5명일 때 러비·코코에 몰렸던 이유).
export const ACTORS = {
  lobi: { name: '러비', gender: 'male', look: 'Lobi, a round yellow baby dinosaur boy with a brown back crest, wearing a red sweater with a dark zigzag stripe', vibe: 'Cheerful and curious little boy. Suits cuddly pets, toys and playful kid things.' },
  coco: { name: '코코', gender: 'female', look: 'Coco, a pink baby dinosaur girl with two big magenta hair buns, wearing a purple dress with a white collar', vibe: 'Sweet and girly. Suits cute, pretty, princess-like, fashionable or dessert answers.' },
  bell: { name: '벨', gender: 'female', look: 'Bell, a sky-blue baby raptor girl with a long snout, wearing a red-and-white cap, a red neckerchief, a cream top and navy pants', vibe: 'Energetic and sporty. Suits fast, athletic, adventurous and outdoor answers.' },
  jackjack: { name: '잭잭', gender: 'male', look: 'Jack Jack, a red baby T-rex boy with tiny arms and a dark-striped tail, wearing a lime-green shirt with a brown-orange stripe', vibe: 'Mischievous prankster. Suits wild, fierce, predator, loud, funny or naughty answers.' },
  elon: { name: '엘론', gender: 'male', look: 'Elon, an orange baby stegosaurus boy with brown back plates, a black nose, big brown-framed square glasses and a purple shirt with a white collar', vibe: 'Smart and bookish. Suits clever, scientific, techy, inventor or detective answers.' },
  duke: { name: '듀크', gender: 'male', look: 'Duke, an orange stegosaurus gentleman with brown back plates, a black nose and black-framed glasses, wearing a dark business suit, a white shirt, a red tie and a small gold pin', vibe: 'Dignified gentleman in a suit. Suits rich, powerful, formal, business, royal or grown-up answers.' },
  rou: { name: '루', gender: 'male', look: 'Rou, a lime-green long-necked baby dinosaur with a dark green head crest and a calm, eyes-closed smile', vibe: 'Calm, gentle and tall. Suits peaceful, slow, relaxed, plant, nature, tall or long answers.' },
  tom: { name: '톰', gender: 'male', look: 'Tom, a lavender-gray baby triceratops with small white horns, thick dark eyebrows and an orange T-shirt', vibe: 'Tough and serious. Suits strong, sturdy, heavy, armored, brave, hard-working or grumpy answers.' },
  jessy: { name: '제시', gender: 'female', look: 'Jessy, a red baby T-rex girl with a mint-green hair bow and a mint-green dress with a white scalloped collar, and a dark-striped tail', vibe: 'Bold and lively girl. Suits spicy, fiery, confident, performer or red answers.' },
  pinky: { name: '핑키', gender: 'female', look: 'Pinky, a pink baby pterodactyl girl with a yellow beak, a blue head crest, pink wings with blue tips and a cream belly', vibe: 'Cheerful flying girl. Suits flying, sky, bird, sea breeze, music, singing and colorful answers.' },
};

// 인물은 성별을 맞춘다 (남 6명, 여 4명). 동물·음식, 성별이 없거나 애매한 대상은 10명 모두 후보
export function allowedActors(candidate) {
  const ids = Object.keys(ACTORS);
  return candidate.gender ? ids.filter((id) => ACTORS[id].gender === candidate.gender) : ids;
}
