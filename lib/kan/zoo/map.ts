/**
 * Omaha's zoo, laid out from the zoo's own visitor map (summer 2026). Everything is
 * placed in that map's pixels (1232 × 953, the main entrance at the bottom, the lions
 * at the top) and turned into world units here, so it's easy to check a spot against
 * the map. Pure data and arithmetic: the game, the scene and the tests all read it.
 *
 * On the map, north is to the left; the scene doesn't care, it just keeps the map's
 * picture the right way up: the entrance near you, the lions far away.
 */

/** World units per map pixel. A person is about 1.6 tall. */
export const K = 0.55;
const CX = 620, CY = 480;
export type Px = [number, number];
export const toWorld = ([px, py]: Px) => ({ x: (px - CX) * K, z: (py - CY) * K });
export const toPx = (x: number, z: number): Px => [x / K + CX, z / K + CY];

export type Ground = 'grass' | 'savanna' | 'dirt' | 'rock' | 'snow' | 'sand' | 'jungle' | 'ice' | 'mulch';
export type Region = 'Africa' | 'Asia' | 'Madagascar' | 'Gorillas & Apes' | 'Birds' | 'Water' | 'Desert' | 'Jungle' | 'Night' | 'Kids';

export interface HabitatDef {
  id: string;
  name: string;
  at: Px;
  /** Ellipse radii in map pixels, and its turn. */
  rx: number;
  ry: number;
  angle?: number;
  ground: Ground;
  /** A pool, as a share of the habitat's size (0.3 = a pool a third as wide). */
  pool?: number;
  /** A moat all the way around: an island. */
  moat?: boolean;
  /** Who lives here at the start. */
  animals: { species: string; count: number }[];
  /** Inside a building (a hall): a glass tank or a room, not fenced ground. */
  tank?: boolean;
  /** You can walk in among them (an aviary, a garden). */
  walkIn?: boolean;
  /** Tall things to climb, for apes and monkeys. */
  climb?: boolean;
  /** Trees inside, and how many. */
  trees?: number;
  /** Some rocks to lie on. */
  rocks?: number;
}

export type HallKind = 'dome' | 'jungle' | 'glass' | 'house' | 'net';
export interface ExhibitDef {
  id: string;
  name: string;
  region: Region;
  emoji: string;
  blurb: string;
  /** Where its name sits. */
  at: Px;
  habitats: HabitatDef[];
  /** A building you walk into: a dome, the jungle, a glass hall, or a house you look into from a sheet. `door` is the way it faces, as atan2(z, x) in the world. */
  hall?: { kind: HallKind; at: Px; r: number; door: number; height: number };
  /** How sunken (negative) or raised it sits, in world units. */
  lift?: number;
}

const H = (h: HabitatDef) => h;

export const EXHIBITS: ExhibitDef[] = [
  // ---------- Africa ----------
  {
    id: 'grasslands', name: 'Scott African Grasslands', region: 'Africa', emoji: '🦒', at: [870, 560],
    blurb: 'Twenty-eight acres of African savanna: elephants, giraffes, rhinos, zebras and lions.',
    habitats: [
      H({ id: 'elephants-n', name: 'Grewcock Elephant Habitat', at: [830, 370], rx: 66, ry: 50, angle: -0.2, ground: 'savanna', pool: 0.32, animals: [{ species: 'elephant', count: 3 }], trees: 4, rocks: 3 }),
      H({ id: 'elephants-e', name: 'Elephant Family Yard', at: [1040, 600], rx: 66, ry: 58, ground: 'savanna', pool: 0.3, animals: [{ species: 'elephant', count: 3 }], trees: 3, rocks: 2 }),
      H({ id: 'veldt', name: 'Giraffe, White Rhino & Impala Habitat', at: [835, 565], rx: 82, ry: 44, angle: -0.15, ground: 'savanna', animals: [{ species: 'giraffe', count: 4 }, { species: 'rhino', count: 2 }, { species: 'impala', count: 4 }, { species: 'ostrich', count: 2 }], trees: 5 }),
      H({ id: 'meerkats', name: 'Meerkat Mob', at: [962, 470], rx: 14, ry: 12, ground: 'sand', animals: [{ species: 'meerkat', count: 6 }], rocks: 2 }),
      H({ id: 'goats', name: 'Goat Kraal', at: [740, 488], rx: 16, ry: 14, ground: 'dirt', animals: [{ species: 'goat', count: 5 }], rocks: 1 }),
    ],
  },
  {
    id: 'lions', name: 'Lion’s Pride', region: 'Africa', emoji: '🦁', at: [620, 88], lift: 3,
    blurb: 'The pride’s hilltop at the far end of the Skyfari, with a rock to roar from.',
    habitats: [
      H({ id: 'lions', name: 'Lion’s Pride', at: [620, 88], rx: 58, ry: 42, ground: 'savanna', animals: [{ species: 'lion', count: 4 }], rocks: 4, trees: 2 }),
    ],
  },
  {
    id: 'savanna-north', name: 'African Plains', region: 'Africa', emoji: '🦓', at: [540, 175],
    blurb: 'Zebras, cheetahs and the okapi out past the lagoon.',
    habitats: [
      H({ id: 'zebras', name: 'Zebra Plains', at: [478, 158], rx: 42, ry: 38, ground: 'savanna', animals: [{ species: 'zebra', count: 4 }], trees: 2 }),
      H({ id: 'cheetahs', name: 'Cheetah Run', at: [665, 200], rx: 40, ry: 26, ground: 'savanna', animals: [{ species: 'cheetah', count: 2 }], rocks: 2, trees: 1 }),
      H({ id: 'okapi', name: 'Okapi Forest', at: [602, 230], rx: 26, ry: 24, ground: 'jungle', animals: [{ species: 'okapi', count: 2 }], trees: 4 }),
    ],
  },

  // ---------- Asia ----------
  {
    id: 'asia', name: 'Asian Highlands', region: 'Asia', emoji: '🐅', at: [270, 420], lift: 4,
    blurb: 'Mountains of central Asia: tigers, snow leopards, red pandas, sloth bears and rhinos.',
    habitats: [
      H({ id: 'tigers', name: 'Amur Tiger Ridge', at: [180, 372], rx: 34, ry: 28, ground: 'grass', pool: 0.3, animals: [{ species: 'tiger', count: 2 }], rocks: 3, trees: 3 }),
      H({ id: 'bears', name: 'Sloth Bear Hollow', at: [265, 370], rx: 34, ry: 24, ground: 'dirt', animals: [{ species: 'slothbear', count: 2 }], rocks: 2, trees: 2, climb: true }),
      H({ id: 'cranes', name: 'Crane & Deer Wetland', at: [352, 372], rx: 34, ry: 24, ground: 'grass', pool: 0.4, animals: [{ species: 'deer', count: 3 }, { species: 'crane', count: 2 }], trees: 2 }),
      H({ id: 'snowleopards', name: 'Snow Leopard Peaks', at: [196, 470], rx: 28, ry: 26, ground: 'snow', animals: [{ species: 'snowleopard', count: 2 }], rocks: 5 }),
      H({ id: 'redpandas', name: 'Red Panda Forest', at: [266, 456], rx: 17, ry: 15, ground: 'mulch', animals: [{ species: 'redpanda', count: 2 }], trees: 3, climb: true }),
      H({ id: 'takins', name: 'Takin Mountain', at: [252, 506], rx: 26, ry: 16, ground: 'rock', animals: [{ species: 'takin', count: 3 }], rocks: 3 }),
      H({ id: 'indianrhinos', name: 'Indian Rhino Wallow', at: [340, 470], rx: 34, ry: 26, ground: 'dirt', pool: 0.35, animals: [{ species: 'indianrhino', count: 2 }], trees: 2 }),
    ],
  },

  // ---------- Madagascar ----------
  {
    id: 'madagascar', name: 'Expedition Madagascar', region: 'Madagascar', emoji: '🐒', at: [500, 455],
    blurb: 'Lemurs on their island, the fossa, and tortoises older than your grandparents.',
    habitats: [
      H({ id: 'lemurs', name: 'Lemur Island', at: [496, 440], rx: 27, ry: 25, ground: 'jungle', moat: true, animals: [{ species: 'lemur', count: 5 }, { species: 'ruffedlemur', count: 2 }], trees: 3, climb: true }),
      H({ id: 'fossa', name: 'Fossa Den', at: [540, 476], rx: 14, ry: 12, ground: 'mulch', animals: [{ species: 'fossa', count: 1 }], trees: 2, climb: true }),
      H({ id: 'tortoises', name: 'Tortoise Garden', at: [462, 478], rx: 14, ry: 11, ground: 'sand', animals: [{ species: 'tortoise', count: 3 }], rocks: 2 }),
      H({ id: 'ayeaye', name: 'Aye-aye Night Room', at: [538, 438], rx: 10, ry: 9, ground: 'mulch', tank: true, animals: [{ species: 'ayeaye', count: 1 }] }),
    ],
    hall: { kind: 'house', at: [538, 438], r: 12, door: -Math.PI / 2, height: 6 },
  },

  // ---------- Birds ----------
  {
    id: 'aviary', name: 'Simmons Aviary', region: 'Birds', emoji: '🦩', at: [372, 548],
    blurb: 'Walk right in under the net, among the flamingos, ibises, spoonbills and swans.',
    habitats: [
      H({ id: 'aviary', name: 'Simmons Aviary', at: [372, 548], rx: 64, ry: 22, angle: -0.95, ground: 'grass', walkIn: true, pool: 0.45, animals: [{ species: 'flamingo', count: 8 }, { species: 'ibis', count: 4 }, { species: 'spoonbill', count: 3 }, { species: 'swan', count: 2 }], trees: 4 }),
    ],
  },
  {
    id: 'garden', name: 'Garden of the Senses', region: 'Birds', emoji: '🦜', at: [682, 388],
    blurb: 'Flowers, fountains, a giant sundial and the macaws on their perches.',
    habitats: [
      H({ id: 'macaws', name: 'Macaw Perches', at: [690, 392], rx: 18, ry: 12, ground: 'grass', walkIn: true, animals: [{ species: 'macaw', count: 4 }], trees: 2 }),
    ],
  },

  // ---------- Apes ----------
  {
    id: 'gorillas', name: 'Hubbard Gorilla Valley', region: 'Gorillas & Apes', emoji: '🦍', at: [470, 572], lift: -9,
    blurb: 'Down the elevator, 44 feet into the valley: gorillas, colobus monkeys, river hogs and crowned cranes.',
    habitats: [
      H({ id: 'gorillas', name: 'Gorilla Valley', at: [470, 568], rx: 44, ry: 32, ground: 'jungle', animals: [{ species: 'gorilla', count: 5 }], trees: 4, rocks: 3, climb: true }),
      H({ id: 'colobus', name: 'Colobus Treetops', at: [418, 612], rx: 15, ry: 13, ground: 'jungle', animals: [{ species: 'colobus', count: 3 }], trees: 2, climb: true }),
      H({ id: 'hogs', name: 'River Hog & Crane Yard', at: [520, 528], rx: 20, ry: 14, ground: 'dirt', pool: 0.35, animals: [{ species: 'hog', count: 2 }, { species: 'crownedcrane', count: 2 }], trees: 1 }),
    ],
  },
  {
    id: 'orangutans', name: 'Hubbard Orangutan Forest', region: 'Gorillas & Apes', emoji: '🦧', at: [562, 640],
    blurb: 'Tall poles and swinging ropes for the orangutans and the siamangs, who sing every morning.',
    habitats: [
      H({ id: 'orangutans', name: 'Orangutan Forest', at: [562, 638], rx: 38, ry: 32, ground: 'grass', animals: [{ species: 'orangutan', count: 4 }, { species: 'siamang', count: 2 }], trees: 3, climb: true }),
    ],
  },

  // ---------- Water ----------
  {
    id: 'sealions', name: 'Owen Sea Lion Shores', region: 'Water', emoji: '🦭', at: [396, 690],
    blurb: 'A rocky Pacific shore with sea lions and harbor seals. Feeding time is a big splashy show.',
    habitats: [
      H({ id: 'sealions', name: 'Sea Lion Shores', at: [396, 690], rx: 40, ry: 28, ground: 'rock', pool: 0.75, animals: [{ species: 'sealion', count: 5 }, { species: 'seal', count: 3 }], rocks: 4 }),
    ],
  },
  {
    id: 'aquarium', name: 'Scott Aquarium', region: 'Water', emoji: '🐧', at: [700, 615],
    blurb: 'Penguins and puffins on the ice, sharks overhead in the tunnel, a sea turtle and an octopus.',
    habitats: [
      H({ id: 'penguins', name: 'Penguin Coast', at: [690, 600], rx: 14, ry: 10, ground: 'ice', tank: true, pool: 0.5, animals: [{ species: 'penguin', count: 7 }, { species: 'puffin', count: 3 }] }),
      H({ id: 'sharks', name: 'Shark Reef', at: [716, 628], rx: 13, ry: 11, ground: 'sand', tank: true, pool: 1, animals: [{ species: 'shark', count: 3 }, { species: 'seaturtle', count: 1 }] }),
      H({ id: 'octopus', name: 'Octopus Grotto', at: [684, 636], rx: 6, ry: 6, ground: 'rock', tank: true, pool: 1, animals: [{ species: 'octopus', count: 1 }] }),
    ],
    hall: { kind: 'glass', at: [700, 620], r: 34, door: 2.45, height: 9 },
  },
  {
    id: 'stingrays', name: 'Stingray Beach', region: 'Water', emoji: '🐟', at: [466, 300],
    blurb: 'Reach in and touch a stingray. They feel like wet velvet.',
    habitats: [
      H({ id: 'stingrays', name: 'Stingray Beach', at: [466, 300], rx: 18, ry: 13, ground: 'sand', pool: 1, animals: [{ species: 'stingray', count: 6 }] }),
    ],
  },
  {
    id: 'lagoon', name: 'The Lagoon', region: 'Water', emoji: '🎏', at: [688, 266],
    blurb: 'A long lagoon full of koi, under the Skyfari.',
    habitats: [
      H({ id: 'lagoon', name: 'Koi Lagoon', at: [688, 266], rx: 100, ry: 26, angle: -0.42, ground: 'grass', pool: 1, animals: [{ species: 'koi', count: 10 }] }),
    ],
  },

  // ---------- Under the dome ----------
  {
    id: 'desert', name: 'Desert Dome', region: 'Desert', emoji: '🌵', at: [600, 728], lift: 0,
    blurb: 'The world’s biggest indoor desert, under a glass dome on top of the hill.',
    habitats: [
      H({ id: 'foxes', name: 'Kalahari Dunes', at: [585, 712], rx: 13, ry: 10, ground: 'sand', animals: [{ species: 'batearedfox', count: 2 }, { species: 'meerkat', count: 4 }], rocks: 2 }),
      H({ id: 'bobcats', name: 'Sonoran Canyon', at: [620, 708], rx: 12, ry: 10, ground: 'rock', animals: [{ species: 'bobcat', count: 2 }], rocks: 3 }),
      H({ id: 'roadrunners', name: 'Desert Wash', at: [612, 746], rx: 11, ry: 8, ground: 'sand', walkIn: true, animals: [{ species: 'roadrunner', count: 2 }, { species: 'owl', count: 2 }], rocks: 2 }),
      H({ id: 'reptiles', name: 'Reptile Rocks', at: [580, 748], rx: 9, ry: 7, ground: 'sand', tank: true, animals: [{ species: 'rattlesnake', count: 2 }, { species: 'beadedlizard', count: 2 }], rocks: 2 }),
    ],
    hall: { kind: 'dome', at: [600, 730], r: 46, door: 0, height: 26 },
  },
  {
    id: 'night', name: 'Kingdoms of the Night', region: 'Night', emoji: '🦇', at: [540, 760],
    blurb: 'Underneath the dome, where it’s always night: bats, aardvarks, sloths and a swamp with alligators.',
    habitats: [
      H({ id: 'swamp', name: 'Night Swamp', at: [540, 760], rx: 8, ry: 7, ground: 'mulch', tank: true, pool: 0.6, animals: [{ species: 'alligator', count: 2 }, { species: 'aardvark', count: 1 }, { species: 'bat', count: 6 }, { species: 'sloth', count: 1 }, { species: 'echidna', count: 1 }] }),
    ],
    hall: { kind: 'house', at: [540, 760], r: 10, door: 0.73, height: 5 },
  },

  // ---------- The jungle ----------
  {
    id: 'jungle', name: 'Lied Jungle', region: 'Jungle', emoji: '🌴', at: [830, 820],
    blurb: 'A whole rainforest under one roof, with a waterfall you can walk behind.',
    habitats: [
      H({ id: 'hippos', name: 'Hippo River', at: [812, 806], rx: 12, ry: 9, ground: 'jungle', pool: 0.6, animals: [{ species: 'pygmyhippo', count: 2 }] }),
      H({ id: 'tapirs', name: 'Tapir Trail', at: [850, 800], rx: 11, ry: 9, ground: 'jungle', animals: [{ species: 'tapir', count: 2 }], trees: 2 }),
      H({ id: 'monkeys', name: 'Monkey Canopy', at: [838, 842], rx: 14, ry: 10, ground: 'jungle', animals: [{ species: 'spidermonkey', count: 3 }, { species: 'squirrelmonkey', count: 5 }], trees: 3, climb: true }),
      H({ id: 'otters', name: 'Otter Creek', at: [806, 840], rx: 8, ry: 6, ground: 'jungle', pool: 0.6, animals: [{ species: 'otter', count: 4 }] }),
    ],
    hall: { kind: 'jungle', at: [830, 822], r: 44, door: 2.36, height: 22 },
  },
  {
    id: 'butterflies', name: 'Butterfly & Insect Pavilion', region: 'Birds', emoji: '🦋', at: [792, 640],
    blurb: 'Hundreds of butterflies flying free in a warm glass house. Wear something bright and one might land on you.',
    habitats: [
      H({ id: 'butterflies', name: 'Butterfly Garden', at: [792, 640], rx: 15, ry: 13, ground: 'grass', walkIn: true, animals: [{ species: 'butterfly', count: 14 }], trees: 2 }),
    ],
    hall: { kind: 'glass', at: [792, 640], r: 21, door: 2.14, height: 8 },
  },

  // ---------- Kids ----------
  {
    id: 'trails', name: 'Children’s Adventure Trails', region: 'Kids', emoji: '🐦', at: [440, 800],
    blurb: 'Tree houses, rope bridges, a cave to crawl through and a room full of budgies.',
    habitats: [
      H({ id: 'budgies', name: 'Budgie Encounter', at: [408, 788], rx: 13, ry: 10, ground: 'mulch', walkIn: true, animals: [{ species: 'budgie', count: 10 }], trees: 2 }),
    ],
  },
];

export const HABITATS = EXHIBITS.flatMap((e) => e.habitats.map((h) => ({ ...h, exhibit: e.id })));
export const habitat = (id: string) => HABITATS.find((h) => h.id === id);
export const exhibitOf = (habitatId: string) => EXHIBITS.find((e) => e.habitats.some((h) => h.id === habitatId))!;

/** Places that aren't animals: where you eat, ride, splash and come in. */
export interface Place { id: string; name: string; emoji: string; at: Px; kind: 'entrance' | 'food' | 'ride' | 'play' | 'building' | 'station' | 'show'; r: number }
export const PLACES: Place[] = [
  { id: 'entrance', name: 'Main Entrance', emoji: '🎟️', at: [700, 880], kind: 'entrance', r: 0 },
  { id: 'north-entrance', name: 'North Entrance', emoji: '🎟️', at: [392, 918], kind: 'entrance', r: 0 },
  { id: 'wildkingdom', name: 'Wild Kingdom Pavilion', emoji: '🐸', at: [735, 760], kind: 'building', r: 20 },
  { id: 'lozier', name: 'Giant Screen Theater', emoji: '🎬', at: [618, 842], kind: 'building', r: 18 },
  { id: 'education', name: 'Daugherty Education Center', emoji: '🏫', at: [528, 795], kind: 'building', r: 16 },
  { id: 'durham', name: 'Durham Lodge', emoji: '🎂', at: [822, 720], kind: 'building', r: 13 },
  { id: 'harper', name: 'Harper Event Center', emoji: '🎪', at: [502, 262], kind: 'building', r: 15 },
  { id: 'hq', name: 'Wildlife Management HQ', emoji: '🧑‍🔬', at: [548, 110], kind: 'building', r: 12 },
  { id: 'conservation', name: 'Center for Conservation & Research', emoji: '🔬', at: [626, 600], kind: 'building', r: 14 },
  { id: 'elephant-house', name: 'Elephant Family Quarters', emoji: '🐘', at: [1068, 690], kind: 'building', r: 16 },
  { id: 'giraffe-house', name: 'Giraffe Herd Rooms', emoji: '🦒', at: [945, 700], kind: 'building', r: 13 },
  { id: 'lodge', name: 'African Lodge', emoji: '🍔', at: [872, 442], kind: 'food', r: 13 },
  { id: 'treetops', name: 'TreeTops Restaurant', emoji: '🍕', at: [770, 778], kind: 'food', r: 11 },
  { id: 'plaza-cafe', name: 'Plaza Café', emoji: '🥪', at: [655, 800], kind: 'food', r: 8 },
  { id: 'glacier', name: 'Glacier Bay Landing', emoji: '🌭', at: [252, 858], kind: 'food', r: 13 },
  { id: 'yeti', name: 'Yeti Camp Snacks', emoji: '🍿', at: [226, 440], kind: 'food', r: 6 },
  { id: 'orangutan-oasis', name: 'Orangutan Oasis', emoji: '🍦', at: [505, 640], kind: 'food', r: 6 },
  { id: 'carousel', name: 'Sue’s Carousel', emoji: '🎠', at: [302, 790], kind: 'ride', r: 11 },
  { id: 'splash', name: 'Alaskan Adventure Splash Park', emoji: '🐳', at: [292, 690], kind: 'play', r: 20 },
  { id: 'giraffe-encounter', name: 'Giraffe Encounter', emoji: '🥬', at: [914, 594], kind: 'show', r: 7 },
  { id: 'amphitheater', name: 'Elephant Amphitheater', emoji: '🎭', at: [930, 520], kind: 'show', r: 10 },
  { id: 'depot', name: 'Omaha Train Depot', emoji: '🚂', at: [196, 712], kind: 'station', r: 10 },
  { id: 'kenefick', name: 'Kenefick Train Station', emoji: '🚉', at: [792, 470], kind: 'station', r: 9 },
  { id: 'skyfari', name: 'Skyfari Landing', emoji: '🚡', at: [842, 672], kind: 'ride', r: 9 },
  { id: 'skyfari-top', name: 'Skyfari at the Lions', emoji: '🚡', at: [602, 34], kind: 'ride', r: 7 },
  { id: 'sundial', name: 'The Giant Sundial', emoji: '☀️', at: [660, 404], kind: 'play', r: 6 },
];
export const place = (id: string) => PLACES.find((p) => p.id === id)!;

/** The walking paths, as lines through the map. People keep to these; you can wander off them. */
export const PATHS: Px[][] = [
  // The big loop: entrance, up past the dome, the sea lions, and back down the north side.
  [[700, 880], [690, 820], [664, 774], [660, 724], [640, 680], [600, 670], [560, 690], [500, 694], [452, 704], [390, 760], [372, 860], [392, 918]],
  // The entrance plaza to the jungle, the theater and the education center.
  [[700, 880], [780, 856], [800, 852]],
  [[700, 880], [650, 846], [600, 806], [560, 778], [500, 776], [460, 772], [390, 760]],
  // Up the east side: the aquarium, the butterflies, the Skyfari and into Africa.
  [[660, 724], [722, 702], [770, 690], [842, 676], [902, 668], [944, 640], [952, 560], [930, 500], [900, 466], [872, 452]],
  [[640, 680], [662, 650], [676, 640]],
  [[770, 690], [778, 662]],
  // Africa, across to the goats, the train station and the garden.
  [[872, 452], [830, 450], [792, 470], [766, 470], [740, 466], [720, 432], [690, 400], [640, 372], [580, 348], [520, 362], [452, 404]],
  // Gorillas and orangutans, then up the west side to Madagascar and Asia.
  [[560, 690], [512, 660], [450, 640], [400, 602], [388, 580], [400, 520], [432, 470], [452, 404]],
  [[500, 694], [505, 650]],
  [[450, 640], [470, 610]],
  [[452, 404], [395, 420], [310, 416], [225, 420], [150, 428]],
  [[150, 428], [146, 470], [160, 520], [210, 540], [300, 556], [360, 520], [400, 520]],
  [[225, 420], [226, 440]],
  // North past the stingrays, around the lions, and back by the lagoon and the elephants.
  [[452, 404], [470, 360], [520, 330], [548, 300], [540, 250], [540, 204], [552, 150], [600, 146], [680, 150], [730, 166], [770, 205], [772, 255], [748, 300], [712, 340], [690, 400]],
  [[548, 300], [490, 300], [502, 270]],
  [[520, 362], [536, 422]],
  [[548, 110], [560, 50], [602, 34]],
  [[552, 150], [548, 110]],
  // Glacier Bay, the carousel, the splash park and the train depot.
  [[390, 760], [330, 744], [262, 738], [222, 790], [250, 846], [310, 872], [372, 860]],
  [[262, 738], [210, 718], [196, 712]],
  [[330, 744], [300, 714]],
  // Giraffe encounter and the elephant house.
  [[944, 640], [920, 606]],
  [[902, 668], [945, 700], [1010, 700], [1068, 690]],
];

/** The Omaha Zoo Railroad: one loop all the way around, through both stations. */
export const TRAIN: Px[] = [
  [196, 704], [128, 640], [112, 560], [116, 470], [112, 380], [150, 330], [200, 318], [330, 312], [420, 282], [440, 220], [430, 120], [470, 60],
  [540, 22], [622, 16], [700, 46], [770, 112], [850, 196], [912, 280], [932, 360], [904, 428], [850, 458], [792, 462], [730, 446], [680, 424],
  [600, 410], [520, 402], [458, 414], [420, 452], [372, 500], [300, 562], [248, 626],
];
export const STATIONS = [{ id: 'depot', at: 0 }, { id: 'kenefick', at: 21 }] as const;

/** The Skyfari: from beside the butterflies, over the grasslands and the lagoon, to the lions. */
export const SKYFARI: [Px, Px] = [[842, 664], [602, 40]];

/** The zoo's edge. */
export const BOUNDARY: Px[] = [
  [706, 920], [640, 905], [560, 866], [480, 878], [420, 940], [330, 942], [210, 910], [150, 870], [130, 790], [92, 700], [80, 620], [90, 520],
  [88, 420], [92, 340], [130, 300], [210, 290], [330, 292], [400, 258], [412, 180], [420, 100], [460, 36], [530, -2], [630, -8], [720, 24],
  [790, 96], [870, 180], [940, 270], [962, 360], [1000, 420], [1090, 480], [1146, 560], [1150, 690], [1110, 742], [990, 752], [900, 770],
  [884, 870], [800, 912],
];

/** Hills: the dome's hill, the highlands, the lions' rise; the valley the gorillas live in. In world units. */
const BUMPS: { at: Px; h: number; r: number }[] = [
  { at: [600, 730], h: 7, r: 120 },
  { at: [230, 430], h: 5, r: 110 },
  { at: [610, 80], h: 3.5, r: 90 },
  { at: [470, 572], h: -9, r: 52 },
  { at: [1000, 600], h: 1.5, r: 140 },
  { at: [688, 266], h: -1.6, r: 80 },
];
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The ground's height at a point (world units in, world units out). */
export function heightAt(x: number, z: number) {
  const [px, py] = toPx(x, z);
  let h = 0;
  for (const b of BUMPS) {
    const d = Math.hypot(px - b.at[0], py - b.at[1]) / b.r;
    if (d < 1) h += b.h * smooth(1 - d);
  }
  // A gentle roll everywhere, so nothing's perfectly flat.
  h += Math.sin(px * 0.021) * Math.cos(py * 0.017) * 0.6 + Math.sin(px * 0.007 + py * 0.009) * 0.8;
  return h;
}

export function inside(poly: Px[], [px, py]: Px) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Where a point sits in a habitat: below 1 is inside its ellipse. */
export function ellipseD(h: Pick<HabitatDef, 'at' | 'rx' | 'ry' | 'angle'>, [px, py]: Px) {
  const a = -(h.angle ?? 0);
  const dx = px - h.at[0], dy = py - h.at[1];
  const ux = dx * Math.cos(a) - dy * Math.sin(a), uy = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.hypot(ux / h.rx, uy / h.ry);
}

/** A point along a polyline loop, by distance. */
export function along(line: { x: number; z: number }[], lengths: number[], s: number) {
  const total = lengths[lengths.length - 1];
  s = ((s % total) + total) % total;
  let i = 1;
  while (i < lengths.length && lengths[i] < s) i++;
  const a = line[(i - 1) % line.length], b = line[i % line.length];
  const k = (s - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}
export function loopLengths(line: { x: number; z: number }[]) {
  const out = [0];
  for (let i = 1; i <= line.length; i++) {
    const a = line[i - 1], b = line[i % line.length];
    out.push(out[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return out;
}
