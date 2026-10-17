// 진행자 루소 (흉내 배우가 아님). 포즈 그림을 만들 때 쓴다 (scripts/make-russo.mjs)
export const RUSSO_LOOK = 'Russo, a chubby beige ankylosaurus carpenter uncle with a round face, a tan muzzle, a thick dark unibrow, small black eyes, a white sweat drop on his head, a blue knit beanie, a white shirt and blue overalls with yellow buttons';

// 흉내 배우 5명 (기획서 6절). look 은 이미지 모델용 생김새, vibe 는 Jev 가 고를 때 보는 성격
export const ACTORS = {
  lobi: { name: '러비', gender: 'male', look: 'Lobi, a round yellow baby dinosaur boy with a brown back crest, wearing a red sweater with a dark zigzag stripe', vibe: 'The main hero of the cast. A cheerful superstar type who suits famous, iconic, lovable or leading-role answers.' },
  coco: { name: '코코', gender: 'female', look: 'Coco, a pink baby dinosaur girl with two big magenta hair buns, wearing a purple dress with a white collar', vibe: 'The main heroine of the cast. A sweet superstar type who suits cute, pretty, lovable, iconic or leading-role answers.' },
  bell: { name: '벨', gender: 'female', look: 'Bell, a sky-blue baby raptor girl with a long snout, wearing a red-and-white cap, a red neckerchief, a cream top and navy pants', vibe: 'Energetic and sporty. Suits fast, active, athletic, adventurous answers.' },
  jackjack: { name: '잭잭', gender: 'male', look: 'Jack Jack, a red baby T-rex boy with tiny arms and a dark-striped tail, wearing a lime-green shirt with a brown-orange stripe', vibe: 'A mischievous, playful prankster. Suits wild, fierce, funny, loud or naughty answers.' },
  elon: { name: '엘론', gender: 'male', look: 'Elon, an orange baby stegosaurus boy with brown back plates, a black nose, big brown-framed square glasses and a purple shirt with a white collar', vibe: 'Smart and rich. Suits clever, calm, curious, scientific or classy answers.' },
};

// 인물은 성별을 맞춘다. 동물·음식, 성별이 없거나 애매한 대상은 다섯 명 모두 후보
export function allowedActors(candidate) {
  const ids = Object.keys(ACTORS);
  return candidate.gender ? ids.filter((id) => ACTORS[id].gender === candidate.gender) : ids;
}
