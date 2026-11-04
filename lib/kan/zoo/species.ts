/**
 * Every kind of animal at the zoo: what it's called, what it looks like (enough for
 * the scene to build it from a handful of shapes), when it's awake, what it eats, and
 * one thing worth knowing about it. Pure data, so the game and the tests can use it
 * without three.js.
 *
 * `look` is read by components/kan/zoo/animals.ts. Sizes are in world units, where
 * a person is about 1.6 tall.
 */

export type Body = 'quad' | 'ape' | 'monkey' | 'bird' | 'penguin' | 'seal' | 'reptile' | 'snake' | 'fish' | 'bat' | 'butterfly';

export interface Look {
  body: Body;
  /** Height at the shoulder (or of the bird standing), in world units. */
  size: number;
  color: string;
  /** Belly, muzzle, wings, spots or stripes. */
  color2?: string;
  pattern?: 'stripes' | 'spots' | 'rings' | 'patches' | 'belly';
  /** How long the body is next to how tall it stands (1 = as long as tall). */
  long?: number;
  /** How long the legs are next to the body (1 = ordinary). */
  legs?: number;
  /** How long the neck is (0 none, 1 ordinary, 3 a giraffe's). */
  neck?: number;
  ears?: 'round' | 'pointy' | 'big' | 'tiny' | 'flap';
  tail?: 'thin' | 'tuft' | 'bushy' | 'short' | 'long' | 'flat' | 'fan';
  /** Extras that make a species read as itself at a glance. */
  extras?: ('trunk' | 'tusks' | 'horn' | 'horn2' | 'mane' | 'antlers' | 'horns' | 'spiral' | 'hump' | 'snout' | 'shell' | 'spines' | 'beak' | 'longbeak' | 'spoonbill' | 'crest' | 'wattle' | 'whiskers' | 'mask' | 'tentacles' | 'fin')[];
}

export interface Species {
  id: string;
  name: string;
  /** Plural for "3 ____". */
  many: string;
  emoji: string;
  look: Look;
  /** Awake at night and asleep by day (or at dusk and dawn). */
  night: boolean;
  /** What they eat, for the feeding button. */
  food: string;
  foodEmoji: string;
  fact: string;
  /** How fast it gets about, world units a second. */
  speed: number;
  swims?: boolean;
  flies?: boolean;
  climbs?: boolean;
  /** Small and quick enough to slip out now and then. Never anything dangerous. */
  sneaky?: boolean;
  /** How much a visitor wants to see it, 1–5. */
  star: number;
  /** Names for babies and new arrivals. */
  names: string[];
}

const S = (s: Species) => s;

export const SPECIES: Record<string, Species> = Object.fromEntries(([
  // ---------- Africa ----------
  S({ id: 'elephant', name: 'African elephant', many: 'elephants', emoji: '🐘', night: false, food: 'hay and watermelons', foodEmoji: '🍉', speed: 1.4, star: 5, swims: true,
    fact: 'An elephant’s trunk has about 40,000 muscles. Yours has about 600 in your whole body!',
    names: ['Kiki', 'Lolly', 'Jabu', 'Sonny', 'Zola', 'Eugenia', 'Tusky', 'Ruby'],
    look: { body: 'quad', size: 3.1, color: '#8d8a88', long: 1.15, legs: 1.05, neck: 0.2, ears: 'flap', tail: 'tuft', extras: ['trunk', 'tusks'] } }),
  S({ id: 'rhino', name: 'White rhino', many: 'rhinos', emoji: '🦏', night: false, food: 'grass and hay', foodEmoji: '🌾', speed: 1.5, star: 4,
    fact: 'A rhino’s horn is made of keratin, the same stuff as your fingernails.',
    names: ['Jubie', 'Rowdy', 'Nandi', 'Bruno', 'Pebbles', 'Thandi'],
    look: { body: 'quad', size: 1.7, color: '#9b958d', long: 1.6, legs: 0.7, neck: 0.15, ears: 'pointy', tail: 'tuft', extras: ['horn2'] } }),
  S({ id: 'giraffe', name: 'Reticulated giraffe', many: 'giraffes', emoji: '🦒', night: false, food: 'acacia leaves', foodEmoji: '🌿', speed: 2.2, star: 5,
    fact: 'A giraffe’s tongue is about 20 inches long and dark purple, so it doesn’t get sunburned.',
    names: ['Penny', 'Tall Paul', 'Zuri', 'Maisie', 'Twiga', 'Sunny', 'Juniper'],
    look: { body: 'quad', size: 2.6, color: '#d9913e', color2: '#7a3f14', pattern: 'patches', long: 0.9, legs: 1.6, neck: 3.2, ears: 'pointy', tail: 'tuft', extras: ['horns'] } }),
  S({ id: 'zebra', name: 'Grevy’s zebra', many: 'zebras', emoji: '🦓', night: false, food: 'grass', foodEmoji: '🌾', speed: 2.8, star: 4,
    fact: 'No two zebras have the same stripes, just like your fingerprints.',
    names: ['Stripes', 'Domino', 'Ziggy', 'Oreo', 'Marty', 'Zelda'],
    look: { body: 'quad', size: 1.4, color: '#f4f1ea', color2: '#1d1d1f', pattern: 'stripes', long: 1.25, legs: 1.1, neck: 1.1, ears: 'big', tail: 'tuft', extras: ['mane'] } }),
  S({ id: 'impala', name: 'Impala', many: 'impalas', emoji: '🦌', night: false, food: 'grass and leaves', foodEmoji: '🌿', speed: 3.4, star: 2,
    fact: 'An impala can leap 10 feet high, higher than a basketball hoop.',
    names: ['Skip', 'Hopper', 'Amara', 'Bounce', 'Kito'],
    look: { body: 'quad', size: 0.95, color: '#c88a4e', color2: '#f3e7d6', pattern: 'belly', long: 1.2, legs: 1.3, neck: 1.1, ears: 'pointy', tail: 'short', extras: ['spiral'] } }),
  S({ id: 'lion', name: 'Lion', many: 'lions', emoji: '🦁', night: true, food: 'meat', foodEmoji: '🍖', speed: 2.6, star: 5,
    fact: 'Lions sleep up to 20 hours a day, and wake up at dusk to play and roar.',
    names: ['Mufasa', 'Nala', 'Ruby', 'Leo', 'Sabi', 'Kimba', 'Goldie'],
    look: { body: 'quad', size: 1.15, color: '#c99a52', color2: '#7a4a1e', long: 1.45, legs: 0.95, neck: 0.6, ears: 'round', tail: 'tuft', extras: ['mane'] } }),
  S({ id: 'cheetah', name: 'Cheetah', many: 'cheetahs', emoji: '🐆', night: false, food: 'meat', foodEmoji: '🍖', speed: 4.5, star: 4,
    fact: 'A cheetah goes from 0 to 60 miles an hour in about 3 seconds, as fast as a race car.',
    names: ['Dash', 'Zippy', 'Kesi', 'Bolt', 'Speedy', 'Asha'],
    look: { body: 'quad', size: 0.85, color: '#e3b45e', color2: '#2a1d10', pattern: 'spots', long: 1.5, legs: 1.25, neck: 0.6, ears: 'round', tail: 'long', extras: ['mask'] } }),
  S({ id: 'ostrich', name: 'Ostrich', many: 'ostriches', emoji: '🪶', night: false, food: 'grain and greens', foodEmoji: '🥬', speed: 3.6, star: 3,
    fact: 'An ostrich egg weighs as much as 24 chicken eggs.',
    names: ['Ozzy', 'Feathers', 'Big Bird', 'Olive', 'Stretch'],
    look: { body: 'bird', size: 2.3, color: '#2a2422', color2: '#f2ece2', legs: 2.2, neck: 2.4, tail: 'fan', extras: ['beak'] } }),
  S({ id: 'okapi', name: 'Okapi', many: 'okapis', emoji: '🦓', night: false, food: 'leaves and fruit', foodEmoji: '🍃', speed: 2, star: 3,
    fact: 'The okapi has zebra stripes on its legs, but it’s really a cousin of the giraffe.',
    names: ['Kapi', 'Mosi', 'Lulu', 'Zawadi'],
    look: { body: 'quad', size: 1.5, color: '#4a2a20', color2: '#f1ede4', pattern: 'stripes', long: 1.2, legs: 1.2, neck: 1.4, ears: 'big', tail: 'tuft' } }),
  S({ id: 'meerkat', name: 'Meerkat', many: 'meerkats', emoji: '🐿️', night: false, food: 'crickets', foodEmoji: '🦗', speed: 2.4, star: 3, sneaky: true,
    fact: 'Meerkats take turns standing guard, and squeak a warning when they see a hawk.',
    names: ['Timon', 'Peep', 'Sandy', 'Scout', 'Nibbles', 'Pip'],
    look: { body: 'quad', size: 0.32, color: '#cfae80', color2: '#5a4430', pattern: 'stripes', long: 1.1, legs: 0.8, neck: 0.8, ears: 'tiny', tail: 'thin', extras: ['mask'] } }),
  S({ id: 'goat', name: 'Pygmy goat', many: 'goats', emoji: '🐐', night: false, food: 'goat pellets', foodEmoji: '🥣', speed: 2, star: 2, sneaky: true,
    fact: 'Goats have rectangle-shaped pupils, so they can see almost all the way around.',
    names: ['Billy', 'Nanny', 'Butterbean', 'Clover', 'Gus', 'Hazel'],
    look: { body: 'quad', size: 0.55, color: '#e7e1d6', color2: '#3a2e26', pattern: 'patches', long: 1.1, legs: 0.85, neck: 0.8, ears: 'flap', tail: 'short', extras: ['horns'] } }),

  // ---------- Asia ----------
  S({ id: 'tiger', name: 'Amur tiger', many: 'tigers', emoji: '🐅', night: true, food: 'meat', foodEmoji: '🍖', speed: 2.8, star: 5, swims: true,
    fact: 'Tigers love to swim, and they have stripes on their skin, not just their fur.',
    names: ['Rajah', 'Stripes', 'Mila', 'Tora', 'Sasha', 'Kira'],
    look: { body: 'quad', size: 1.1, color: '#e0812c', color2: '#1d1610', pattern: 'stripes', long: 1.55, legs: 0.95, neck: 0.6, ears: 'round', tail: 'long' } }),
  S({ id: 'snowleopard', name: 'Snow leopard', many: 'snow leopards', emoji: '🐆', night: true, food: 'meat', foodEmoji: '🍖', speed: 2.8, star: 5, climbs: true,
    fact: 'A snow leopard wraps its huge fluffy tail around its face like a scarf.',
    names: ['Misty', 'Frost', 'Yeti', 'Pearl', 'Shiva', 'Snowball'],
    look: { body: 'quad', size: 0.75, color: '#dcdad2', color2: '#4a4a4c', pattern: 'spots', long: 1.5, legs: 0.85, neck: 0.6, ears: 'round', tail: 'bushy' } }),
  S({ id: 'redpanda', name: 'Red panda', many: 'red pandas', emoji: '🦊', night: true, food: 'bamboo', foodEmoji: '🎋', speed: 1.6, star: 5, climbs: true, sneaky: true,
    fact: 'When a red panda feels scared, it stands up tall on its back legs and raises its arms.',
    names: ['Ember', 'Rusty', 'Maple', 'Pumpkin', 'Ginger', 'Momo'],
    look: { body: 'quad', size: 0.4, color: '#b84a1e', color2: '#2a1a14', pattern: 'belly', long: 1.3, legs: 0.7, neck: 0.5, ears: 'pointy', tail: 'bushy', extras: ['mask'] } }),
  S({ id: 'slothbear', name: 'Sloth bear', many: 'sloth bears', emoji: '🐻', night: true, food: 'termites and honey', foodEmoji: '🍯', speed: 1.6, star: 4, climbs: true,
    fact: 'Sloth bears suck up termites like a vacuum cleaner, and you can hear it from far away.',
    names: ['Baloo', 'Honey', 'Shaggy', 'Bramble', 'Mowgli'],
    look: { body: 'quad', size: 1.0, color: '#1c1a19', color2: '#e7dcc6', long: 1.35, legs: 0.85, neck: 0.4, ears: 'round', tail: 'short', extras: ['snout'] } }),
  S({ id: 'indianrhino', name: 'Indian rhino', many: 'Indian rhinos', emoji: '🦏', night: false, food: 'grass and fruit', foodEmoji: '🍎', speed: 1.5, star: 4, swims: true,
    fact: 'An Indian rhino’s skin folds look like a suit of armor.',
    names: ['Tank', 'Raja', 'Mira', 'Bumpy'],
    look: { body: 'quad', size: 1.7, color: '#8a7f78', long: 1.55, legs: 0.7, neck: 0.15, ears: 'pointy', tail: 'tuft', extras: ['horn'] } }),
  S({ id: 'deer', name: 'Père David’s deer', many: 'deer', emoji: '🦌', night: false, food: 'grass and water plants', foodEmoji: '🌿', speed: 2.6, star: 2, swims: true,
    fact: 'These deer love the water and are great swimmers, with wide hooves like paddles.',
    names: ['Bambi', 'Willow', 'Antler', 'Fern'],
    look: { body: 'quad', size: 1.2, color: '#9c6a42', long: 1.25, legs: 1.1, neck: 1, ears: 'pointy', tail: 'long', extras: ['antlers'] } }),
  S({ id: 'takin', name: 'Sichuan takin', many: 'takins', emoji: '🐃', night: false, food: 'leaves and twigs', foodEmoji: '🌿', speed: 1.6, star: 3,
    fact: 'Takins sneeze out a snort to say "watch out!" to the rest of the herd.',
    names: ['Moose', 'Toffee', 'Goldie', 'Bubba'],
    look: { body: 'quad', size: 1.3, color: '#c7a25a', long: 1.25, legs: 0.85, neck: 0.4, ears: 'round', tail: 'short', extras: ['horns', 'snout'] } }),
  S({ id: 'crane', name: 'White-naped crane', many: 'cranes', emoji: '🦩', night: false, food: 'grain and bugs', foodEmoji: '🐛', speed: 1.6, star: 2, flies: true,
    fact: 'Cranes dance to say hello: they bow, jump and flap their wings.',
    names: ['Dancer', 'Misty', 'Lacey', 'Sky'],
    look: { body: 'bird', size: 1.4, color: '#7d8590', color2: '#f2f2f2', legs: 1.9, neck: 1.8, tail: 'short', extras: ['beak', 'mask'] } }),

  // ---------- Madagascar ----------
  S({ id: 'lemur', name: 'Ring-tailed lemur', many: 'lemurs', emoji: '🐒', night: false, food: 'fruit', foodEmoji: '🍌', speed: 2.2, star: 4, climbs: true, sneaky: true,
    fact: 'Ring-tailed lemurs sunbathe every morning, sitting with their arms out wide.',
    names: ['King Julien', 'Ringo', 'Zaza', 'Mango', 'Lulu', 'Kiwi'],
    look: { body: 'monkey', size: 0.45, color: '#9a9a9c', color2: '#1d1d1f', pattern: 'rings', long: 1.2, ears: 'pointy', tail: 'long', extras: ['mask'] } }),
  S({ id: 'ruffedlemur', name: 'Red ruffed lemur', many: 'red ruffed lemurs', emoji: '🐒', night: false, food: 'fruit and nectar', foodEmoji: '🍑', speed: 2, star: 3, climbs: true, sneaky: true,
    fact: 'Red ruffed lemurs have one of the loudest calls of any animal in the forest.',
    names: ['Ruby', 'Fluff', 'Rojo', 'Bramble'],
    look: { body: 'monkey', size: 0.5, color: '#a3321c', color2: '#1d1d1f', pattern: 'belly', long: 1.2, ears: 'tiny', tail: 'bushy' } }),
  S({ id: 'fossa', name: 'Fossa', many: 'fossas', emoji: '🐈‍⬛', night: true, food: 'meat', foodEmoji: '🍖', speed: 2.6, star: 3, climbs: true,
    fact: 'A fossa can climb down a tree headfirst, like a squirrel, because its ankles turn around.',
    names: ['Fosco', 'Shadow', 'Tamba', 'Vola'],
    look: { body: 'quad', size: 0.55, color: '#8a5a34', long: 1.6, legs: 0.7, neck: 0.5, ears: 'round', tail: 'long' } }),
  S({ id: 'ayeaye', name: 'Aye-aye', many: 'aye-ayes', emoji: '🦇', night: true, food: 'grubs and coconut', foodEmoji: '🥥', speed: 1.4, star: 3, climbs: true,
    fact: 'The aye-aye taps on trees with one super-long finger to hear where the bugs are hiding.',
    names: ['Spooky', 'Tappy', 'Midnight', 'Gizmo'],
    look: { body: 'monkey', size: 0.35, color: '#3a332e', long: 1.1, ears: 'big', tail: 'bushy' } }),
  S({ id: 'tortoise', name: 'Radiated tortoise', many: 'tortoises', emoji: '🐢', night: false, food: 'greens and flowers', foodEmoji: '🌼', speed: 0.4, star: 2, sneaky: true,
    fact: 'Radiated tortoises can live more than 100 years.',
    names: ['Shelly', 'Speedy', 'Grandpa', 'Pebble', 'Turbo'],
    look: { body: 'reptile', size: 0.35, color: '#3a2e1c', color2: '#e8c64a', pattern: 'spots', long: 1.2, legs: 0.6, tail: 'short', extras: ['shell'] } }),

  // ---------- The aviary and the gardens ----------
  S({ id: 'flamingo', name: 'American flamingo', many: 'flamingos', emoji: '🦩', night: false, food: 'shrimp', foodEmoji: '🦐', speed: 1.4, star: 4, flies: true, sneaky: true,
    fact: 'Flamingos are pink because of the shrimp they eat. Without it they’d be white!',
    names: ['Pinky', 'Flo', 'Rosie', 'Bubblegum', 'Coral', 'Peaches'],
    look: { body: 'bird', size: 1.4, color: '#f57a96', color2: '#1d1d1f', legs: 2.4, neck: 2.2, tail: 'short', extras: ['beak'] } }),
  S({ id: 'ibis', name: 'Scarlet ibis', many: 'scarlet ibises', emoji: '🐦', night: false, food: 'crabs and shrimp', foodEmoji: '🦀', speed: 1.4, star: 2, flies: true,
    fact: 'Baby scarlet ibises are gray and brown, and turn bright red as they grow up.',
    names: ['Scarlet', 'Red', 'Cherry', 'Ruby'],
    look: { body: 'bird', size: 0.8, color: '#e8321c', legs: 1.6, neck: 1.4, tail: 'short', extras: ['longbeak'] } }),
  S({ id: 'spoonbill', name: 'Roseate spoonbill', many: 'spoonbills', emoji: '🦢', night: false, food: 'little fish', foodEmoji: '🐟', speed: 1.4, star: 2, flies: true,
    fact: 'A spoonbill swishes its spoon-shaped beak through the water to scoop up dinner.',
    names: ['Spoony', 'Blush', 'Ladle', 'Rosa'],
    look: { body: 'bird', size: 0.9, color: '#f3a4b8', color2: '#f2ece2', legs: 1.7, neck: 1.4, tail: 'short', extras: ['spoonbill'] } }),
  S({ id: 'swan', name: 'Black-necked swan', many: 'swans', emoji: '🦢', night: false, food: 'water plants', foodEmoji: '🌱', speed: 1.2, star: 2, swims: true, flies: true,
    fact: 'Swan babies ride around on their parents’ backs.',
    names: ['Duchess', 'Ebony', 'Snow', 'Paddles'],
    look: { body: 'bird', size: 0.8, color: '#f6f6f6', color2: '#1d1d1f', legs: 0.6, neck: 2, tail: 'short', extras: ['beak'] } }),
  S({ id: 'macaw', name: 'Scarlet macaw', many: 'macaws', emoji: '🦜', night: false, food: 'nuts and fruit', foodEmoji: '🥜', speed: 1.4, star: 3, flies: true, climbs: true, sneaky: true,
    fact: 'Macaws can crack a Brazil nut with their beak. You need a hammer!',
    names: ['Rio', 'Mango', 'Kiwi', 'Polly', 'Rainbow', 'Captain'],
    look: { body: 'bird', size: 0.55, color: '#e0281c', color2: '#2a6fd6', legs: 0.6, neck: 0.5, tail: 'long', extras: ['beak'] } }),
  S({ id: 'budgie', name: 'Budgie', many: 'budgies', emoji: '🐦', night: false, food: 'seed sticks', foodEmoji: '🌾', speed: 1.4, star: 3, flies: true, sneaky: true,
    fact: 'Budgies can learn to say words, and some know more than a hundred.',
    names: ['Kiwi', 'Sky', 'Pip', 'Sunny', 'Blue', 'Chirpy', 'Lemon'],
    look: { body: 'bird', size: 0.22, color: '#7ed13c', color2: '#f5e04a', legs: 0.5, neck: 0.4, tail: 'long', extras: ['beak'] } }),

  // ---------- Gorillas and orangutans ----------
  S({ id: 'gorilla', name: 'Western lowland gorilla', many: 'gorillas', emoji: '🦍', night: false, food: 'greens and fruit', foodEmoji: '🥬', speed: 1.4, star: 5, climbs: true,
    fact: 'Gorillas build a brand-new bed out of leaves every single night.',
    names: ['Motuba', 'Kijito', 'Freddie', 'Bambino', 'Lulu', 'Ozzie'],
    look: { body: 'ape', size: 1.5, color: '#2a2829', color2: '#5a5658', long: 1, ears: 'tiny' } }),
  S({ id: 'colobus', name: 'Colobus monkey', many: 'colobus monkeys', emoji: '🐒', night: false, food: 'leaves', foodEmoji: '🍃', speed: 2, star: 3, climbs: true, sneaky: true,
    fact: 'Colobus babies are born pure white, then turn black and white like their parents.',
    names: ['Cape', 'Panda', 'Flip', 'Swish'],
    look: { body: 'monkey', size: 0.5, color: '#1d1d1f', color2: '#f4f4f2', pattern: 'belly', long: 1.1, ears: 'tiny', tail: 'bushy' } }),
  S({ id: 'hog', name: 'Red river hog', many: 'river hogs', emoji: '🐗', night: true, food: 'roots and veggies', foodEmoji: '🥕', speed: 1.8, star: 2,
    fact: 'Red river hogs have tufts of white hair on their ears, like paintbrushes.',
    names: ['Rosie', 'Truffle', 'Chops', 'Rusty'],
    look: { body: 'quad', size: 0.7, color: '#c4502a', color2: '#f2ece2', long: 1.4, legs: 0.6, neck: 0.3, ears: 'pointy', tail: 'thin', extras: ['snout'] } }),
  S({ id: 'crownedcrane', name: 'Crowned crane', many: 'crowned cranes', emoji: '🐦', night: false, food: 'seeds and bugs', foodEmoji: '🐛', speed: 1.6, star: 3, flies: true,
    fact: 'A crowned crane wears a puff of golden feathers on its head like a crown.',
    names: ['Princess', 'Goldie', 'Duke', 'Tiara'],
    look: { body: 'bird', size: 1.1, color: '#3a3a42', color2: '#f2f2f2', legs: 1.8, neck: 1.6, tail: 'short', extras: ['beak', 'crest', 'wattle'] } }),
  S({ id: 'orangutan', name: 'Bornean orangutan', many: 'orangutans', emoji: '🦧', night: false, food: 'fruit', foodEmoji: '🍊', speed: 1.2, star: 5, climbs: true,
    fact: 'Orangutans use big leaves as umbrellas when it rains.',
    names: ['Rudy', 'Sumagu', 'Mango', 'Clementine', 'Pumpkin'],
    look: { body: 'ape', size: 1.2, color: '#b5521e', color2: '#e8a070', long: 0.9, ears: 'tiny' } }),
  S({ id: 'siamang', name: 'Siamang', many: 'siamangs', emoji: '🐒', night: false, food: 'fruit and leaves', foodEmoji: '🍇', speed: 2.4, star: 3, climbs: true,
    fact: 'Siamangs puff up their throat like a balloon to sing loud morning songs.',
    names: ['Echo', 'Hootie', 'Swing', 'Tarzan'],
    look: { body: 'ape', size: 0.8, color: '#1a1818', long: 0.7, ears: 'tiny' } }),

  // ---------- Water ----------
  S({ id: 'sealion', name: 'California sea lion', many: 'sea lions', emoji: '🦭', night: false, food: 'fish', foodEmoji: '🐟', speed: 2.4, star: 5, swims: true,
    fact: 'Sea lions can walk on all four flippers, but seals have to scoot on their bellies.',
    names: ['Splash', 'Bubbles', 'Sammy', 'Barky', 'Squirt', 'Captain'],
    look: { body: 'seal', size: 0.8, color: '#5a4636', long: 2.2, extras: ['whiskers'] } }),
  S({ id: 'seal', name: 'Harbor seal', many: 'harbor seals', emoji: '🦭', night: false, food: 'fish', foodEmoji: '🐟', speed: 2, star: 4, swims: true,
    fact: 'A harbor seal can hold its breath for 30 minutes.',
    names: ['Pebble', 'Spot', 'Misty', 'Noodle'],
    look: { body: 'seal', size: 0.6, color: '#8f8a84', color2: '#4a4644', pattern: 'spots', long: 2.2, extras: ['whiskers'] } }),
  S({ id: 'penguin', name: 'Gentoo penguin', many: 'penguins', emoji: '🐧', night: false, food: 'fish', foodEmoji: '🐟', speed: 1.2, star: 5, swims: true, sneaky: true,
    fact: 'Gentoo penguins are the fastest swimmers of all penguins, about 22 miles an hour.',
    names: ['Waddles', 'Pebbles', 'Tux', 'Skipper', 'Flipper', 'Mumble', 'Gus'],
    look: { body: 'penguin', size: 0.75, color: '#1d1d24', color2: '#f8f8f6', extras: ['beak'] } }),
  S({ id: 'puffin', name: 'Tufted puffin', many: 'puffins', emoji: '🐦', night: false, food: 'little fish', foodEmoji: '🐟', speed: 1.4, star: 4, swims: true, flies: true, sneaky: true,
    fact: 'A puffin can hold ten little fish in its beak at once.',
    names: ['Puff', 'Tuffy', 'Clown', 'Sunny'],
    look: { body: 'penguin', size: 0.4, color: '#1d1d24', color2: '#f8f8f6', extras: ['beak', 'crest'] } }),
  S({ id: 'shark', name: 'Sand tiger shark', many: 'sharks', emoji: '🦈', night: true, food: 'fish', foodEmoji: '🐟', speed: 2.2, star: 5, swims: true,
    fact: 'Sharks never run out of teeth. They grow new ones their whole lives.',
    names: ['Bruce', 'Finn', 'Chompers', 'Jaws Jr.', 'Marina'],
    look: { body: 'fish', size: 0.8, color: '#7a8a96', color2: '#e8ecee', pattern: 'belly', long: 3.2, extras: ['fin'] } }),
  S({ id: 'seaturtle', name: 'Green sea turtle', many: 'sea turtles', emoji: '🐢', night: false, food: 'lettuce', foodEmoji: '🥬', speed: 1, star: 4, swims: true,
    fact: 'Sea turtles can sleep underwater for hours.',
    names: ['Crush', 'Squirt', 'Myrtle', 'Shelldon'],
    look: { body: 'reptile', size: 0.5, color: '#4a6a3a', color2: '#a08a5a', long: 1.4, legs: 0.6, tail: 'short', extras: ['shell'] } }),
  S({ id: 'stingray', name: 'Cownose stingray', many: 'stingrays', emoji: '🐟', night: false, food: 'clams and shrimp', foodEmoji: '🦐', speed: 1.4, star: 4, swims: true,
    fact: 'Stingrays feel like wet velvet, and they flap their fins like wings to "fly" through the water.',
    names: ['Flappy', 'Ray', 'Velvet', 'Wings'],
    look: { body: 'fish', size: 0.25, color: '#8a6a4a', color2: '#f2ece2', long: 1, tail: 'thin', extras: ['fin'] } }),
  S({ id: 'octopus', name: 'Giant Pacific octopus', many: 'octopuses', emoji: '🐙', night: true, food: 'crabs', foodEmoji: '🦀', speed: 0.8, star: 4, swims: true,
    fact: 'An octopus has three hearts and blue blood.',
    names: ['Inky', 'Otto', 'Squiggles', 'Olive'],
    look: { body: 'fish', size: 0.6, color: '#c2412c', long: 1, extras: ['tentacles'] } }),
  S({ id: 'koi', name: 'Koi', many: 'koi', emoji: '🐟', night: false, food: 'fish food', foodEmoji: '🥣', speed: 1, star: 2, swims: true,
    fact: 'Koi can learn to recognize the person who feeds them.',
    names: ['Goldie', 'Bubbles', 'Nemo', 'Sunny', 'Dot'],
    look: { body: 'fish', size: 0.25, color: '#f28a2c', color2: '#f8f8f6', pattern: 'patches', long: 3, extras: ['fin'] } }),

  // ---------- The Desert Dome ----------
  S({ id: 'batearedfox', name: 'Bat-eared fox', many: 'bat-eared foxes', emoji: '🦊', night: true, food: 'termites', foodEmoji: '🐜', speed: 2.4, star: 4, sneaky: true,
    fact: 'Its giant ears can hear a beetle walking underground.',
    names: ['Radar', 'Sandy', 'Echo', 'Dune'],
    look: { body: 'quad', size: 0.4, color: '#b89a72', color2: '#2a2420', long: 1.3, legs: 0.9, neck: 0.5, ears: 'big', tail: 'bushy', extras: ['mask'] } }),
  S({ id: 'bobcat', name: 'Bobcat', many: 'bobcats', emoji: '🐈', night: true, food: 'meat', foodEmoji: '🍖', speed: 2.6, star: 3, climbs: true,
    fact: 'Bobcats are named for their short, "bobbed" tail.',
    names: ['Bob', 'Lynxie', 'Tufty', 'Ranger'],
    look: { body: 'quad', size: 0.55, color: '#b08a5e', color2: '#4a3424', pattern: 'spots', long: 1.3, legs: 1, neck: 0.5, ears: 'pointy', tail: 'short' } }),
  S({ id: 'roadrunner', name: 'Greater roadrunner', many: 'roadrunners', emoji: '🐦', night: false, food: 'bugs and lizards', foodEmoji: '🦗', speed: 4.2, star: 3, sneaky: true,
    fact: 'Roadrunners can run 20 miles an hour. Beep beep!',
    names: ['Beep', 'Zoom', 'Dusty', 'Speedy'],
    look: { body: 'bird', size: 0.5, color: '#6a5a44', color2: '#e8dcc4', pattern: 'spots', legs: 1.1, neck: 0.8, tail: 'long', extras: ['beak', 'crest'] } }),
  S({ id: 'owl', name: 'Burrowing owl', many: 'burrowing owls', emoji: '🦉', night: true, food: 'mice and bugs', foodEmoji: '🐛', speed: 1.4, star: 4, flies: true,
    fact: 'Burrowing owls live in holes in the ground and can copy a rattlesnake’s rattle to scare off foxes.',
    names: ['Hoot', 'Twiggy', 'Ollie', 'Professor'],
    look: { body: 'bird', size: 0.35, color: '#9a7a54', color2: '#f2e6c8', pattern: 'spots', legs: 1, neck: 0.2, tail: 'short', extras: ['beak'] } }),
  S({ id: 'rattlesnake', name: 'Sidewinder', many: 'sidewinders', emoji: '🐍', night: true, food: 'mice', foodEmoji: '🐭', speed: 0.9, star: 3,
    fact: 'Sidewinders slither sideways so only two little bits of their body touch the hot sand.',
    names: ['Slinky', 'Zigzag', 'Rattles', 'Sid'],
    look: { body: 'snake', size: 0.18, color: '#cdb48a', color2: '#7a5a3a', pattern: 'spots', long: 4 } }),
  S({ id: 'beadedlizard', name: 'Beaded lizard', many: 'beaded lizards', emoji: '🦎', night: false, food: 'eggs', foodEmoji: '🥚', speed: 0.8, star: 2,
    fact: 'Its scales look like tiny beads sewn on, like a fancy necklace.',
    names: ['Bead', 'Gilly', 'Rocky', 'Spike'],
    look: { body: 'reptile', size: 0.25, color: '#2a221c', color2: '#e8b84a', pattern: 'spots', long: 2.2, legs: 0.5, tail: 'long' } }),

  // ---------- Kingdoms of the Night ----------
  S({ id: 'aardvark', name: 'Aardvark', many: 'aardvarks', emoji: '🐽', night: true, food: 'ants and termites', foodEmoji: '🐜', speed: 1.6, star: 4,
    fact: 'The aardvark is the first animal in the dictionary, and it can dig a hole faster than a person with a shovel.',
    names: ['Arthur', 'Digger', 'Snuffles', 'Ava'],
    look: { body: 'quad', size: 0.7, color: '#c9a48a', long: 1.5, legs: 0.7, neck: 0.4, ears: 'big', tail: 'long', extras: ['snout'] } }),
  S({ id: 'bat', name: 'Fruit bat', many: 'fruit bats', emoji: '🦇', night: true, food: 'fruit', foodEmoji: '🍌', speed: 3, star: 4, flies: true,
    fact: 'Fruit bats plant forests: they drop seeds everywhere they fly.',
    names: ['Batty', 'Flutter', 'Nightwing', 'Mango', 'Count'],
    look: { body: 'bat', size: 0.3, color: '#3a2a20', color2: '#c8783c', ears: 'pointy' } }),
  S({ id: 'alligator', name: 'American alligator', many: 'alligators', emoji: '🐊', night: true, food: 'fish', foodEmoji: '🐟', speed: 1, star: 5, swims: true,
    fact: 'One of the zoo’s alligators is white! It’s called leucistic, and it’s super rare.',
    names: ['Chomp', 'Allie', 'Snappy', 'Gator', 'Pearl'],
    look: { body: 'reptile', size: 0.45, color: '#3a4a2a', color2: '#c8c09a', long: 4, legs: 0.5, tail: 'long', extras: ['snout'] } }),
  S({ id: 'sloth', name: 'Two-toed sloth', many: 'sloths', emoji: '🦥', night: true, food: 'leaves', foodEmoji: '🍃', speed: 0.3, star: 4, climbs: true,
    fact: 'Sloths only come down from their tree about once a week, to go potty.',
    names: ['Flash', 'Slowpoke', 'Mellow', 'Sid', 'Snooze'],
    look: { body: 'ape', size: 0.6, color: '#8a7058', color2: '#c8b090', long: 0.9, ears: 'tiny', extras: ['mask'] } }),
  S({ id: 'echidna', name: 'Short-beaked echidna', many: 'echidnas', emoji: '🦔', night: true, food: 'ants', foodEmoji: '🐜', speed: 0.8, star: 3,
    fact: 'An echidna is a mammal that lays eggs!',
    names: ['Spike', 'Prickles', 'Puggle', 'Pokey'],
    look: { body: 'quad', size: 0.3, color: '#4a3a2a', color2: '#e8dcc4', long: 1.3, legs: 0.5, neck: 0.3, ears: 'tiny', tail: 'short', extras: ['spines', 'snout'] } }),

  // ---------- The Lied Jungle ----------
  S({ id: 'spidermonkey', name: 'Spider monkey', many: 'spider monkeys', emoji: '🐒', night: false, food: 'fruit', foodEmoji: '🍌', speed: 2.6, star: 4, climbs: true, sneaky: true,
    fact: 'A spider monkey’s tail can hold on to a branch all by itself, like a fifth hand.',
    names: ['Coco', 'Swinger', 'Pepe', 'Banana', 'Lola'],
    look: { body: 'monkey', size: 0.55, color: '#4a3424', color2: '#c8a070', long: 1, ears: 'tiny', tail: 'long' } }),
  S({ id: 'squirrelmonkey', name: 'Squirrel monkey', many: 'squirrel monkeys', emoji: '🐒', night: false, food: 'bugs and fruit', foodEmoji: '🍇', speed: 2.8, star: 4, climbs: true, sneaky: true,
    fact: 'Squirrel monkeys live in big troops of up to 500 monkeys.',
    names: ['Squeaky', 'Peanut', 'Nutmeg', 'Chip', 'Zippy'],
    look: { body: 'monkey', size: 0.3, color: '#d9a43a', color2: '#f2ece2', long: 1, ears: 'tiny', tail: 'long', extras: ['mask'] } }),
  S({ id: 'tapir', name: 'Malayan tapir', many: 'tapirs', emoji: '🐖', night: true, food: 'fruit and leaves', foodEmoji: '🍎', speed: 1.6, star: 3, swims: true,
    fact: 'A baby tapir has stripes and spots like a watermelon.',
    names: ['Oreo', 'Panda', 'Tapioca', 'Snoot'],
    look: { body: 'quad', size: 1, color: '#1d1d1f', color2: '#f2f2ee', pattern: 'belly', long: 1.5, legs: 0.75, neck: 0.4, ears: 'round', tail: 'short', extras: ['snout'] } }),
  S({ id: 'pygmyhippo', name: 'Pygmy hippo', many: 'pygmy hippos', emoji: '🦛', night: true, food: 'leaves and fruit', foodEmoji: '🍉', speed: 1.4, star: 5, swims: true,
    fact: 'Pygmy hippos make their own sunscreen. Their skin oozes a pink goo that protects them.',
    names: ['Moo Deng', 'Bubbles', 'Gloria', 'Pudding', 'Tubby'],
    look: { body: 'quad', size: 0.8, color: '#5a5258', color2: '#c89a9a', long: 1.5, legs: 0.55, neck: 0.3, ears: 'tiny', tail: 'short', extras: ['snout'] } }),
  S({ id: 'otter', name: 'Small-clawed otter', many: 'otters', emoji: '🦦', night: false, food: 'fish and crabs', foodEmoji: '🦀', speed: 2.2, star: 5, swims: true, sneaky: true,
    fact: 'Otters hold hands while they sleep so they don’t drift apart.',
    names: ['Ollie', 'Splash', 'Pebble', 'Nutmeg', 'Wiggles', 'Bubbles'],
    look: { body: 'quad', size: 0.3, color: '#6a4a30', color2: '#c8a882', pattern: 'belly', long: 2, legs: 0.5, neck: 0.6, ears: 'tiny', tail: 'long', extras: ['whiskers'] } }),

  // ---------- Butterflies ----------
  S({ id: 'butterfly', name: 'Blue morpho butterfly', many: 'butterflies', emoji: '🦋', night: false, food: 'nectar and fruit', foodEmoji: '🌺', speed: 1.4, star: 4, flies: true,
    fact: 'A blue morpho’s wings aren’t really blue. Tiny scales bend the light so they look blue!',
    names: ['Azure', 'Flutter', 'Sky', 'Bluebell', 'Twinkle'],
    look: { body: 'butterfly', size: 0.25, color: '#2a7ae8', color2: '#1d1d24' } }),
] as Species[]).map((s) => [s.id, s]));

export const species = (id: string) => SPECIES[id];

/** Awake now? Night animals wake at dusk; day animals at dawn. */
export function awake(sp: Species, hour: number) {
  const day = hour >= 6.5 && hour < 19.5;
  return sp.night ? !day || hour < 8 || hour >= 18 : day;
}
