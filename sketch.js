// Bass Lake — procedural lake with panfish boids and lurking bass

let lake;
let panfish = [];
let bass = [];
let lilypads = [];
let weeds = [];
let ripples = [];
let bubbles = [];
let trees = [];
let logs = [];
let cattails = [];
let rocks = [];
let snags = [];      // sunken tree stumps with bits poking above water
let ducks = [];                       // surface birds, drift around the lake
let eagle = null;                     // active bald eagle, null when none
let eagleSpawnCooldown = 1200;        // frames until next eagle attempt
let worldSeed = null;                 // seed the whole world was generated from

// ---------------------------------------------------------------------------
// Kayak color palettes (Phase 6 — customizable angler)
// Each palette gives the kayak draw() everything it needs: base, lighter
// highlight, darker lip, and an accent stripe. Add new presets here and
// they'll automatically show up in the profile color picker.
// ---------------------------------------------------------------------------
const HULL_PALETTES = {
  navy:     { base: [60, 70, 100],   light: [95, 110, 145], dark: [40, 50, 75],  accent: [220, 110, 60] },
  burgundy: { base: [115, 40, 55],   light: [160, 80, 95],  dark: [80, 25, 35],  accent: [230, 200, 140] },
  forest:   { base: [40, 80, 55],    light: [75, 120, 90],  dark: [25, 55, 38],  accent: [240, 200, 100] },
  sunset:   { base: [195, 105, 60],  light: [230, 150, 95], dark: [150, 75, 40], accent: [70, 90, 130] },
  slate:    { base: [80, 85, 95],    light: [125, 130, 140],dark: [55, 60, 70],  accent: [220, 110, 60] },
};
const PFD_PALETTES = {
  orange:   { base: [200, 80, 50],   dark: [170, 60, 40]  },
  cyan:     { base: [70, 180, 220],  dark: [40, 140, 180] },
  red:      { base: [200, 50, 40],   dark: [160, 30, 25]  },
  yellow:   { base: [230, 190, 60],  dark: [180, 140, 40] },
  lime:     { base: [150, 210, 80],  dark: [110, 160, 55] },
};
const HAT_PALETTES = {
  green:    [60, 110, 70],
  black:    [25, 25, 30],
  tan:      [180, 150, 100],
  red:      [200, 50, 40],
  yellow:   [220, 190, 80],
};

// Current player's chosen appearance — synced with cloud profile + applied
// to the Kayak instance on world build.
let playerAppearance = { hull: 'navy', pfd: 'orange', hat: 'green' };

// Lifetime stats — incremented on catches and derby end, mirrored to cloud
// via MP.saveProfile.
let playerStats = {
  catches_by_species: {},
  biggest_catch:      {},
  derbies_played:     0,
  derbies_won:        0,
  total_points:       0,
  derby_catches:      0,
  derby_money_earned: 0,
};
let player;        // the kayak the user controls
let cast = null;   // active fly cast (null when not cast)
let MAX_CAST_RANGE = 220;       // current cast range (depends on rod tier)
const KAYAK_BASE_SPEED = 3.4;   // multiplied by kayak tier speed factor

// ---- FLY TYPES ----
// Each fly catches certain species. The player picks one with 1/2/3.
const FLY_CONFIG = {
  fly: {
    label: 'Dry Fly',
    catches: {
      bluegill: true, pumpkinseed: true,
      greenSunfish: true, redbreastSunfish: true, spottedSunfish: true,
      rainbowTrout: true,
    },
    flyColor: [220, 200, 130],
    legsColor: [120, 100, 60],
    sinks: false,                  // floats high on the surface
    biteRange: 22,
    interestRange: 80,
    shortcut: '1',
  },
  nymph: {
    label: 'Nymph',
    catches: { crappie: true, yellowPerch: true, brookTrout: true },
    flyColor: [120, 95, 60],
    legsColor: [70, 55, 35],
    sinks: true,                   // drifts a bit deeper
    biteRange: 28,
    interestRange: 110,
    shortcut: '2',
  },
  woolyBugger: {
    label: 'Wooly Bugger',
    catches: {
      bass: true, smallmouthBass: true, chainPickerel: true, northernPike: true,
      cutthroatTrout: true, brownTrout: true,
    },
    flyColor: [40, 32, 28],
    legsColor: [25, 20, 18],
    sinks: true,
    biteRange: 36,
    interestRange: 160,
    shortcut: '3',
  },
};
let selectedFly = 'fly';
let catchCount = {};
let lastCatchToast = null;        // { species, time } for brief on-screen popup
let lastMissToast = null;         // { reason, time } when a fish escapes

// ---- LEVELS ----
// Each level changes the lake's palette, the tree style, the species you can
// catch, and the fly→species table. Everything else (kayak, casting, sonar,
// fight loop, eagle, ducks) is shared.
const LEVELS = {
  bassLake: {
    name: 'Bass Lake',
    blurb: 'murky warm-water lake · sunfish, crappie, largemouth',
    palette: {
      forest:    [80, 95, 45],     // warm yellow-green meadow
      forestSpeck: [60, 80, 40],
      sand:      [195, 170, 115],
      shoreline: [40, 28, 18],
      waterBase: [28, 64, 52],     // murky teal-green
      patchTeal: [50, 95, 78],
      patchAlgae:[18, 48, 38],
      patchTannin:[60, 55, 30],
      ambient:   [120, 150, 90],   // motes color
      bgClear:   [20, 30, 18],     // off-canvas backdrop
    },
    treeStyle: 'deciduous',
    species:   [
      'bluegill', 'pumpkinseed', 'crappie',
      'greenSunfish', 'redbreastSunfish', 'spottedSunfish',
      'yellowPerch',
      'bass', 'smallmouthBass', 'chainPickerel', 'northernPike',
    ],
    catches: {
      fly:         ['bluegill', 'pumpkinseed', 'greenSunfish', 'redbreastSunfish', 'spottedSunfish'],
      nymph:       ['crappie', 'yellowPerch'],
      woolyBugger: ['bass', 'smallmouthBass', 'chainPickerel', 'northernPike'],
    },
    rewards: {
      bluegill: 5, pumpkinseed: 8, greenSunfish: 6, spottedSunfish: 7, redbreastSunfish: 9,
      crappie: 15, yellowPerch: 12,
      bass: 40, smallmouthBass: 35, chainPickerel: 60, northernPike: 100,
    },
    spawn: {
      bluegill: 50, pumpkinseed: 30, greenSunfish: 25, redbreastSunfish: 20, spottedSunfish: 20,
      crappie: 35, yellowPerch: 30,
      bass: 16, smallmouthBass: 10, chainPickerel: 5, northernPike: 2,
    },
    propCounts: { lilypads: 200, weeds: 700, cattails: 300, trees: 250, logs: 30, rocks: 110, snags: 40 },
    unlocked: true,
    unlockCost: 0,
  },
  alpineLake: {
    name: 'Alpine Lake',
    blurb: 'cold clear high-country water · trout',
    palette: {
      forest:    [165, 180, 155],  // pale rocky meadow
      forestSpeck: [120, 140, 110],
      sand:      [200, 200, 195],
      shoreline: [80, 75, 70],     // grey rock
      waterBase: [50, 110, 145],   // alpine blue
      patchTeal: [80, 165, 200],
      patchAlgae:[35, 80, 110],
      patchTannin:[120, 135, 145],
      ambient:   [220, 230, 240],
      bgClear:   [25, 35, 45],
    },
    treeStyle: 'pine',
    species:   ['rainbowTrout', 'brookTrout', 'brownTrout', 'cutthroatTrout', 'yellowPerch'],
    catches: {
      fly:         ['rainbowTrout'],
      nymph:       ['brookTrout', 'yellowPerch'],
      woolyBugger: ['cutthroatTrout', 'brownTrout'],
    },
    rewards: {
      rainbowTrout: 12, brookTrout: 18, brownTrout: 35, cutthroatTrout: 30,
      yellowPerch: 12,
    },
    spawn: {
      rainbowTrout: 40, brookTrout: 30, brownTrout: 15, cutthroatTrout: 6,
      yellowPerch: 25,
    },
    // alpine lakes are clearer and rockier — no lilies/cattails, more rocks
    propCounts: { lilypads: 0, weeds: 90, cattails: 0, trees: 300, logs: 18, rocks: 260, snags: 18 },
    unlocked: false,
    unlockCost: 150,
  },
};
let currentLevel = 'bassLake';
function lvl() { return LEVELS[currentLevel]; }

// ---- PROGRESSION ----
// Player state — earned/spent through gameplay, saved to localStorage so it
// persists across sessions. Start with the smallest setup; everything else
// is bought from the tackle shop on the menu screen.
const PROGRESS_KEY = 'bassLakeState_v2';
let playerState = {
  money: 0,
  level: 'bassLake',
  levelsUnlocked: { bassLake: true, alpineLake: false },
  unlocks: {
    flies: { fly: true, nymph: false, woolyBugger: false },
    rod: 1,         // 1, 2, 3 — gates max cast range
    kayak: 1,       // 1, 2, 3 — gates paddle speed
    sonar: false,
  },
};
const ROD_RANGES   = { 1: 220, 2: 350, 3: 480 };
const KAYAK_SPEEDS = { 1: 1.0, 2: 1.3, 3: 1.6 };
const REWARDS = {
  bluegill:    5,
  pumpkinseed: 8,
  crappie:    15,
  bass:       40,
};
const SHOP_ITEMS = [
  { id: 'nymph',       cost: 25,  label: 'Nymph fly',        desc: 'Catches crappie',
    check: s => !s.unlocks.flies.nymph,
    apply: s => { s.unlocks.flies.nymph = true; } },
  { id: 'rod2',        cost: 60,  label: 'Mid-grade rod',    desc: 'Longer cast (350ft max)',
    check: s => s.unlocks.rod < 2,
    apply: s => { s.unlocks.rod = 2; } },
  { id: 'kayak2',      cost: 80,  label: 'Faster kayak',     desc: '+30% paddle speed',
    check: s => s.unlocks.kayak < 2,
    apply: s => { s.unlocks.kayak = 2; } },
  { id: 'woolyBugger', cost: 120, label: 'Wooly Bugger',     desc: 'Catches largemouth bass',
    check: s => !s.unlocks.flies.woolyBugger,
    apply: s => { s.unlocks.flies.woolyBugger = true; } },
  { id: 'sonar',       cost: 200, label: 'Fish finder',      desc: 'Side-view sonar display',
    check: s => !s.unlocks.sonar,
    apply: s => { s.unlocks.sonar = true; } },
  { id: 'rod3',        cost: 250, label: 'Pro rod',          desc: 'Maximum cast (480ft)',
    check: s => s.unlocks.rod < 3,
    apply: s => { s.unlocks.rod = 3; } },
  { id: 'kayak3',      cost: 350, label: 'Sea kayak',        desc: '+60% paddle speed',
    check: s => s.unlocks.kayak < 3,
    apply: s => { s.unlocks.kayak = 3; } },
];

function refreshUnlocks() {
  MAX_CAST_RANGE = ROD_RANGES[playerState.unlocks.rod] || 220;
  if (player) player.maxSpeed = KAYAK_BASE_SPEED * (KAYAK_SPEEDS[playerState.unlocks.kayak] || 1);
  // hide sonar element if not unlocked
  let sonarEl = document.getElementById('sonar');
  if (sonarEl) sonarEl.style.display = playerState.unlocks.sonar ? '' : 'none';
  // make sure selected fly is unlocked
  if (!playerState.unlocks.flies[selectedFly]) selectedFly = 'fly';
  // refresh tackle shop UI if open
  populateShop();
}

function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(playerState)); } catch {}
  // Cloud mirror: every saveProgress also patches the player's profile row
  // so progress follows them to any device they sign in on next.
  if (window.MP && MP.saveProfile && MP.userId) {
    MP.saveProfile({
      money:           playerState.money,
      level_current:   playerState.level,
      levels_unlocked: playerState.levelsUnlocked,
      unlocks:         playerState.unlocks,
      stats:           playerStats,
      display_name:    MP.getPlayerName(),
      hull_color:      playerAppearance.hull,
      pfd_color:       playerAppearance.pfd,
      hat_color:       playerAppearance.hat,
    });
  }
}
function loadProgress() {
  try {
    let data = localStorage.getItem(PROGRESS_KEY);
    if (data) {
      let parsed = JSON.parse(data);
      if (parsed.money != null) playerState.money = parsed.money;
      if (parsed.level && LEVELS[parsed.level]) playerState.level = parsed.level;
      if (parsed.levelsUnlocked) Object.assign(playerState.levelsUnlocked, parsed.levelsUnlocked);
      if (parsed.unlocks) {
        if (parsed.unlocks.flies) Object.assign(playerState.unlocks.flies, parsed.unlocks.flies);
        if (parsed.unlocks.rod   != null) playerState.unlocks.rod = parsed.unlocks.rod;
        if (parsed.unlocks.kayak != null) playerState.unlocks.kayak = parsed.unlocks.kayak;
        if (parsed.unlocks.sonar != null) playerState.unlocks.sonar = parsed.unlocks.sonar;
      }
    }
    currentLevel = playerState.level || 'bassLake';
  } catch {}
}

// Merge a freshly-fetched cloud profile into the local playerState +
// appearance + stats. Called once after MP signs in so a player on a fresh
// browser picks up where they left off on another device.
function applyCloudProfile(p) {
  if (!p) return;
  if (p.display_name)   MP.setPlayerName(p.display_name);
  if (p.money != null)  playerState.money = p.money;
  if (p.level_current && LEVELS[p.level_current]) {
    playerState.level = p.level_current;
    currentLevel = p.level_current;
  }
  if (p.levels_unlocked) Object.assign(playerState.levelsUnlocked, p.levels_unlocked);
  if (p.unlocks) {
    if (p.unlocks.flies)             Object.assign(playerState.unlocks.flies, p.unlocks.flies);
    if (p.unlocks.rod   != null)     playerState.unlocks.rod   = p.unlocks.rod;
    if (p.unlocks.kayak != null)     playerState.unlocks.kayak = p.unlocks.kayak;
    if (p.unlocks.sonar != null)     playerState.unlocks.sonar = p.unlocks.sonar;
  }
  if (p.stats && typeof p.stats === 'object') {
    Object.assign(playerStats, p.stats);
  }
  if (p.hull_color && HULL_PALETTES[p.hull_color]) playerAppearance.hull = p.hull_color;
  if (p.pfd_color  && PFD_PALETTES [p.pfd_color])  playerAppearance.pfd  = p.pfd_color;
  if (p.hat_color  && HAT_PALETTES [p.hat_color])  playerAppearance.hat  = p.hat_color;
  // Cache merged state to localStorage for fast boot next time
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(playerState)); } catch {}
  refreshUnlocks();
  // Repaint everything that depends on unlocks / level
  if (typeof populateLevelGroup === 'function') populateLevelGroup();
  if (typeof populateMenuFlyGrid === 'function') populateMenuFlyGrid();
}

// Pre-baked static world image — drawn once at setup, then sub-region blitted
// every frame. Contains: forest floor, dirt/sand specks, trees, lake water +
// surface patches, tree shadows, shoreline edge, rocks, logs.
let staticImg = null;
const STATIC_SCALE = 0.5;

// Pre-rendered species sprites as data URLs — used by the catch-toast HUD
// element to show a picture of the fish you just caught.
let speciesPortraits = {};
let flyIcons = {};       // dataURL per fly type, generated procedurally
let menuOpen = true;     // game ignores input while menu is up

// ---- WIND ----
// Wind direction follows the lake's static wind angle (so the wavelets
// the player sees match the drift they feel). Strength wobbles slowly via
// Perlin noise so the breeze breathes.
let wind = { x: 0, y: 0, angle: 0, strength: 0 };
function updateWind() {
  if (!lake) return;
  let t = frameCount * 0.0008;
  let angleJitter = (noise(t, 17.3) - 0.5) * 0.5;       // ±~0.25 rad wobble
  let strengthN   = noise(t + 100, 31.7);
  wind.angle = lake.windAngle + angleJitter;
  wind.strength = 0.35 + strengthN * 0.85;                // ~0.35..1.20
  wind.x = Math.cos(wind.angle) * wind.strength;
  wind.y = Math.sin(wind.angle) * wind.strength;
}

// ---- SOUND ----
// Drop your audio files into /sounds/ with these filenames; missing files are
// skipped silently so the game still runs. Use .mp3 for broadest support.
const SOUND_FILES = {
  cast_start:    'sounds/cast_start.mp3',           // false-cast begins (whoosh)
  cast_release:  'sounds/cast_release.mp3',         // line shoots out
  splash:        'sounds/splash.mp3',               // fly lands on water
  bite:          'sounds/bite.mp3',                 // fish takes the fly
  hookset:       'sounds/hookset.mp3',              // line goes tight
  reel_loop:     'sounds/reelsound.mp3',            // looping reel click while reeling
  catch:         'sounds/catch.mp3',                // fish landed
  snap:          'sounds/snap.mp3',                 // line breaks
  paddle:        'sounds/paddle.mp3',               // paddle stroke in water
  buy:           'sounds/buy.mp3',                  // shop purchase
  eagle:         'sounds/eagle.mp3',                // eagle screech during dive
  // Ambient layers — quietly blended together while you're playing
  ambient:       'sounds/naturebackground.mp3',     // main nature bed
  ambient_birds: 'sounds/bird sounds.mp3',          // bird chirps layer
  ambient_wind:  'sounds/wind.mp3',                 // light wind layer
};

let sounds = {};
let masterVolume = 0.7;
let muted = false;
let audioUnlocked = false;
let activeLoops = {};

function loadSounds() {
  for (let [name, src] of Object.entries(SOUND_FILES)) {
    let audio = new Audio();
    audio.preload = 'auto';
    audio.src = src;
    sounds[name] = audio;
    // missing-file path: drop the entry so playSound becomes a no-op
    audio.addEventListener('error', () => { delete sounds[name]; });
  }
  // restore mute pref
  try {
    let m = localStorage.getItem('bassLakeMuted');
    muted = m === '1';
  } catch {}
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // Layer ambient beds at low volumes for a richer outdoor atmosphere
  if (sounds.ambient)       startLoop('ambient',       { volume: 0.35 });
  if (sounds.ambient_birds) startLoop('ambient_birds', { volume: 0.18 });
  if (sounds.ambient_wind)  startLoop('ambient_wind',  { volume: 0.22 });
}

function playSound(name, opts = {}) {
  if (muted || !audioUnlocked) return;
  let s = sounds[name];
  if (!s) return;
  try {
    let clone = s.cloneNode();
    clone.volume = (opts.volume != null ? opts.volume : 1) * masterVolume;
    if (opts.rate) clone.playbackRate = opts.rate;
    let p = clone.play();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

function startLoop(name, opts = {}) {
  if (muted || !audioUnlocked) return;
  if (activeLoops[name]) return;
  let s = sounds[name];
  if (!s) return;
  try {
    let loop = s.cloneNode();
    loop.loop = true;
    loop.volume = (opts.volume != null ? opts.volume : 0.6) * masterVolume;
    let p = loop.play();
    if (p && p.catch) p.catch(() => {});
    activeLoops[name] = loop;
  } catch {}
}

function stopLoop(name) {
  let loop = activeLoops[name];
  if (loop) {
    try { loop.pause(); loop.currentTime = 0; } catch {}
    delete activeLoops[name];
  }
}

function setMuted(m) {
  muted = m;
  try { localStorage.setItem('bassLakeMuted', m ? '1' : '0'); } catch {}
  for (let name in activeLoops) {
    let loop = activeLoops[name];
    if (!loop) continue;
    if (m) { try { loop.pause(); } catch {} }
    else   { try { loop.play().catch(() => {}); } catch {} }
  }
  let btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = m ? '🔇' : '🔊';
}

// ---- SONAR ----
let sonarCtx = null;
let sonarW = 280, sonarH = 80;
const SONAR_RANGE = 160;          // world-pixel scan radius around the kayak — tighter for shorter, more pronounced arches
const SONAR_BG = '#0a1813';
const SONAR_SPECIES_COLOR = {
  bluegill:    '#7fc88a',
  pumpkinseed: '#f0b260',
  crappie:     '#dde3e5',
  bass:        '#ff7e5f',
};

const NUM_PANFISH = 220;
const NUM_BASS = 9;

// World is much larger than the viewport — camera scrolls.
const WORLD_W = 5600;
const WORLD_H = 5600;
let cam = { x: 0, y: 0 };
let zoom = 1.0;
const ZOOM_MIN = 0.25, ZOOM_MAX = 2.5;
let dragging = false;
let dragStart = null;
const CAM_SPEED = 14;
const keys = {};

function setup() {
  createCanvas(windowWidth, windowHeight);
  loadProgress();
  buildWorld(seedFromURL());
  finishSetup();
}

// If a ?seed= or ?pin= param is present (a derby join link), seed the world
// from it so this client's lake matches everyone else's in that derby.
function seedFromURL() {
  try {
    let q = new URLSearchParams(location.search);
    let s = q.get('seed') ?? q.get('pin');
    if (s == null) return null;
    return hashSeed(s);
  } catch { return null; }
}

// Turn any string (a derby pin, a share code) into a stable 32-bit integer
// seed. Same string in -> same number out, on every machine.
function hashSeed(str) {
  str = String(str);
  let h = 2166136261 >>> 0;            // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1e9;
}

// Build (or rebuild) the entire procedural world from a seed. The same seed
// always yields the same lake, props, and fish layout — this is what lets
// every player in a derby fish an identical lake. Pass null for a fresh
// random world (normal single-player).
function buildWorld(seed) {
  worldSeed = (seed == null) ? (Date.now() % 1e9) : seed;
  randomSeed(worldSeed);
  noiseSeed(worldSeed);

  // wipe any world that was here before so rebuilds are clean
  panfish = []; bass = []; lilypads = []; weeds = []; trees = [];
  logs = []; cattails = []; rocks = []; snags = []; ducks = [];
  ripples = []; bubbles = []; eagle = null;

  lake = new Lake(WORLD_W, WORLD_H);

  // spawn the kayak in the first basin and center the camera on it
  let b = lake.basins[0];
  player = new Kayak(b.x, b.y);
  cam.x = constrain(player.pos.x - width / (2 * zoom), 0, WORLD_W - width / zoom);
  cam.y = constrain(player.pos.y - height / (2 * zoom), 0, WORLD_H - height / zoom);

  // Props — counts and tree style come from the current level config
  let counts = lvl().propCounts;
  let isPine = lvl().treeStyle === 'pine';
  for (let i = 0; i < counts.lilypads; i++) {
    let p = lake.randomEdgePoint(random(0.78, 0.92));
    lilypads.push({ x: p.x, y: p.y, r: random(14, 30), a: random(TWO_PI) });
  }
  for (let i = 0; i < counts.weeds; i++) {
    let p = lake.randomEdgePoint(random(0.7, 0.85));
    weeds.push({ x: p.x, y: p.y, h: random(20, 60), sway: random(TWO_PI) });
  }
  for (let i = 0; i < counts.cattails; i++) {
    let p = lake.randomEdgePoint(random(0.86, 0.98));
    cattails.push({ x: p.x, y: p.y, h: random(28, 55), sway: random(TWO_PI) });
  }

  // Trees — bass lake uses warm deciduous canopies; alpine lake uses dark pines.
  for (let i = 0; i < counts.trees; i++) {
    let p = randomShorePoint(random(40, 320));
    trees.push({
      x: p.x,
      y: p.y,
      r: isPine ? random(30, 60) : random(40, 95),
      shade: random(0.15, 0.35),
      hue: isPine ? 40 + random(-8, 8)  : 50 + random(-12, 12),
      val: isPine ? 60 + random(-10, 10) : 80 + random(-20, 20),
      tone: isPine ? 35 + random(-10, 10) : 50 + random(-15, 15),
      pine: isPine,
    });
  }

  for (let i = 0; i < counts.logs; i++) {
    let p = lake.randomEdgePoint(random(0.85, 1.02));
    let inward = lake.inwardNormal(p.x, p.y);
    let angle = inward.heading() + random(-0.6, 0.6);
    logs.push({
      x: p.x, y: p.y,
      len: random(80, 160),
      thick: random(10, 18),
      a: angle,
    });
  }

  for (let i = 0; i < counts.rocks; i++) {
    let p = lake.randomEdgePoint(random(0.88, 1.03));
    rocks.push({
      x: p.x, y: p.y,
      r: random(6, 18),
      shade: 60 + random(-20, 30),
    });
  }

  // Snags — sunken stumps with a stub poking above the surface. Predator-
  // friendly cover (pickerel, pike, bass love these). Placed away from shore
  // in mid-water, scattered around the basin.
  for (let i = 0; i < (counts.snags || 0); i++) {
    let p = lake.randomEdgePoint(random(0.55, 0.85));
    if (!lake.contains(p.x, p.y, 25)) continue;
    snags.push({
      x: p.x, y: p.y,
      r: random(7, 14),                  // submerged base radius
      stubH: random(6, 14),              // height of the stub above water
      stubLean: random(-0.6, 0.6),       // slight tilt
      branches: floor(random(0, 3)),     // optional broken-off stub count
      seed: random(1000),
    });
  }

  // Ducks — three pairs hugging the shoreline (mallards usually loaf in pairs)
  for (let i = 0; i < 3; i++) {
    let anchor = lake.randomEdgePoint(random(0.87, 0.93));
    if (!lake.contains(anchor.x, anchor.y, 14)) continue;
    let h = random(TWO_PI);
    let a = new Duck(anchor.x, anchor.y);
    a.heading = a.targetHeading = h;
    let off = random(TWO_PI);
    let bx = anchor.x + Math.cos(off) * 32;
    let by = anchor.y + Math.sin(off) * 32;
    let b = new Duck(bx, by);
    b.heading = b.targetHeading = h;
    // pair them so they flush together
    a.mate = b; b.mate = a;
    ducks.push(a, b);
  }

  // Fish — counts and species come from the current level config. Each
  // species' SPECIES.class field decides whether it spawns as a Panfish (boid
  // flocking) or a Bass (lurker/strike predator).
  for (let species in lvl().spawn) {
    let count = lvl().spawn[species];
    let cfg = SPECIES[species];
    if (!cfg) continue;
    for (let i = 0; i < count; i++) {
      let p = pickSpawnPoint(cfg);
      if (cfg.class === 'bass') {
        bass.push(new Bass(p.x, p.y, species));
      } else {
        panfish.push(new Panfish(p.x, p.y, species));
      }
    }
  }

  buildStaticImage();

  // Re-randomize the cosmetic RNG. World layout is now locked in; from here
  // on random() drives per-frame animation (eagle timers, paddle pitch,
  // wander noise) which should NOT be in lockstep across clients on a seed.
  randomSeed((Date.now() + (performance.now() * 1000 | 0)) % 1e9);
  noiseSeed((Date.now() ^ 0x9e3779b9) >>> 0);
}

// One-time wiring (UI, sounds, event listeners). Runs once per page load and
// must NOT be repeated when buildWorld() rebuilds the lake.
function finishSetup() {
  // Pull the cloud profile after MP signs in — applies appearance,
  // unlocks, stats, money, level, etc. so cross-device progress works.
  if (window.MP && MP.whenReady) {
    MP.whenReady()
      .then(() => MP.loadProfile())
      .then(p => applyCloudProfile(p))
      .catch(e => console.warn('[profile] cloud load failed:', e.message || e));

    // If the player signs in / signs out / converts anonymous->permanent
    // via the Account section, reload the cloud profile so progress and
    // appearance reflect the new identity.
    MP.onAuthChange(async ({ userChanged }) => {
      if (!userChanged) {
        // Same user, just a state refresh (e.g. anonymous -> email linked).
        // Re-render the Account section if the modal is open.
        if (!document.getElementById('profile')?.classList.contains('hidden')) {
          refreshProfileView();
        }
        return;
      }
      try {
        const p = await MP.loadProfile();
        applyCloudProfile(p);
      } catch (e) { console.warn('[profile] reload after auth change failed:', e.message || e); }
      if (!document.getElementById('profile')?.classList.contains('hidden')) {
        refreshProfileView();
      }
    });
  }
  buildSpeciesPortraits();
  buildFlyIcons();
  populateLevelGroup();
  populateMenuFlyGrid();
  initSonar();
  refreshUnlocks();
  loadSounds();
  let btn = document.getElementById('start-button');
  if (btn) btn.addEventListener('click', () => {
    unlockAudio();
    document.getElementById('menu').classList.add('hidden');
    menuOpen = false;
  });
  let shopBtn = document.getElementById('shop-button');
  if (shopBtn) shopBtn.addEventListener('click', () => {
    populateShop();
    document.getElementById('shop').classList.remove('hidden');
  });
  wireDerbyUI();
  wireProfileUI();
  wireFieldGuide();
  let shopClose = document.getElementById('shop-close');
  if (shopClose) shopClose.addEventListener('click', () => {
    document.getElementById('shop').classList.add('hidden');
  });
  let menuBtn = document.getElementById('menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', () => toggleMenu());
  let muteBtn = document.getElementById('mute-btn');
  if (muteBtn) {
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.addEventListener('click', () => {
      unlockAudio();
      setMuted(!muted);
    });
  }
  let flyBadge = document.getElementById('hud-fly');
  if (flyBadge) flyBadge.addEventListener('click', () => { if (!menuOpen) openFlyBox(); });
  let flyboxClose = document.getElementById('flybox-close');
  if (flyboxClose) flyboxClose.addEventListener('click', closeFlyBox);
  let flyboxBg = document.getElementById('flybox');
  if (flyboxBg) flyboxBg.addEventListener('click', e => {
    if (e.target === flyboxBg) closeFlyBox();
  });
  initTouchControls();
}

// ---- TOUCH UI ----
function initTouchControls() {
  // Fly selector buttons
  let flyBtns = document.querySelectorAll('.fly-btn');
  let updateActive = () => {
    flyBtns.forEach(b => b.classList.toggle('active', b.dataset.fly === selectedFly));
  };
  flyBtns.forEach(b => {
    b.addEventListener('click', e => {
      if (menuOpen) return;
      if (!playerState.unlocks.flies[b.dataset.fly]) return;   // locked
      selectedFly = b.dataset.fly;
      updateActive();
      e.preventDefault();
    });
  });
  // also flag locked buttons with the .locked class for CSS styling
  let updateLocked = () => {
    flyBtns.forEach(b => b.classList.toggle('locked', !playerState.unlocks.flies[b.dataset.fly]));
  };
  updateLocked();
  setInterval(updateLocked, 500);
  updateActive();
  // refresh active highlight whenever user uses 1/2/3 keys too — poll cheaply
  setInterval(updateActive, 200);

  // Virtual joystick (writes into the existing keys.{up,down,left,right} bools)
  let stick = document.getElementById('joystick-stick');
  let base = document.getElementById('joystick');
  let activePointer = null;
  let originX = 0, originY = 0;
  const MAX_R = 50;          // pixels of stick travel
  const DEADZONE = 0.20;

  let setStickFromPointer = (clientX, clientY) => {
    let rect = base.getBoundingClientRect();
    let cx = rect.left + rect.width / 2;
    let cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    let mag = Math.hypot(dx, dy);
    if (mag > MAX_R) { dx = (dx / mag) * MAX_R; dy = (dy / mag) * MAX_R; }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    // Absolute-direction steering: stick angle = world heading you want to go.
    // The kayak rotates toward that angle and paddles forward automatically.
    const norm = Math.min(mag / MAX_R, 1);
    if (player) {
      if (norm < DEADZONE) {
        player.mobileAim = null;
      } else {
        player.mobileAim = { dx, dy, mag: norm };
      }
    }
  };
  let resetStick = () => {
    stick.style.transform = 'translate(0,0)';
    if (player) player.mobileAim = null;
    activePointer = null;
  };
  base.addEventListener('pointerdown', e => {
    if (menuOpen) return;
    activePointer = e.pointerId;
    base.setPointerCapture(e.pointerId);
    setStickFromPointer(e.clientX, e.clientY);
    e.preventDefault();
  });
  base.addEventListener('pointermove', e => {
    if (e.pointerId !== activePointer) return;
    setStickFromPointer(e.clientX, e.clientY);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
    base.addEventListener(evt, e => {
      if (e.pointerId === activePointer) resetStick();
    });
  });

  // Cast button — touch to start a cast, DRAG the finger off the button in
  // the direction you want to cast (top-down aim), release to deliver. While
  // dragging we update the cast target so the false-cast line previews where
  // the fly will land.
  let castBtn = document.getElementById('cast-btn');
  let castPointer = null;
  let castStartX = 0, castStartY = 0;
  const DRAG_DEADZONE = 16;  // ignore tiny finger wobble

  let aimCastFromDrag = (dx, dy) => {
    const mag = Math.hypot(dx, dy);
    let wx, wy;
    if (mag < DRAG_DEADZONE) {
      // No real drag yet — aim straight ahead of the kayak
      const aheadDist = MAX_CAST_RANGE * 0.9;
      wx = player.pos.x + Math.cos(player.heading) * aheadDist;
      wy = player.pos.y + Math.sin(player.heading) * aheadDist;
    } else {
      // Drag direction = aim direction (top-down), distance up to MAX
      const nx = dx / mag, ny = dy / mag;
      const reach = Math.min(mag * 3, MAX_CAST_RANGE * 0.95); // longer drag = farther cast preview
      wx = player.pos.x + nx * reach;
      wy = player.pos.y + ny * reach;
    }
    window.mouseX = (wx - cam.x) * zoom;
    window.mouseY = (wy - cam.y) * zoom;
  };

  castBtn.addEventListener('pointerdown', e => {
    if (menuOpen) return;
    unlockAudio();
    castPointer = e.pointerId;
    castStartX = e.clientX;
    castStartY = e.clientY;
    castBtn.setPointerCapture(e.pointerId);
    castBtn.classList.add('charging');
    if (cast && cast.state === 'hooked') {
      cast.reeling = true;
      startLoop('reel_loop', { volume: 0.5 });
      return;
    }
    if (cast && cast.state === 'fishing') {
      cast.startReel();
      castBtn.classList.remove('charging');
      return;
    }
    if (cast && cast.state !== 'done') return;
    aimCastFromDrag(0, 0);   // initial aim — straight ahead
    cast = new FlyCast();
    playSound('cast_start');
    e.preventDefault();
  });
  castBtn.addEventListener('pointermove', e => {
    if (e.pointerId !== castPointer) return;
    if (!cast || cast.state !== 'aerial') return;   // only aim during the back-and-forth
    aimCastFromDrag(e.clientX - castStartX, e.clientY - castStartY);
  });
  let endCast = (e) => {
    if (e.pointerId !== castPointer) return;
    castBtn.classList.remove('charging');
    castPointer = null;
    if (cast && cast.state === 'aerial') cast.release();
    if (cast && cast.state === 'hooked') {
      cast.reeling = false;
      stopLoop('reel_loop');
    }
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
    castBtn.addEventListener(evt, endCast);
  });
}

function initSonar() {
  let canvas = document.getElementById('sonar-canvas');
  if (!canvas) return;
  // Match the canvas backing buffer to its CSS size so scrolling stays crisp
  let cssW = canvas.clientWidth || canvas.width;
  let cssH = canvas.clientHeight || canvas.height;
  canvas.width = cssW;
  canvas.height = cssH;
  sonarW = cssW;
  sonarH = cssH;
  sonarCtx = canvas.getContext('2d');
  sonarCtx.imageSmoothingEnabled = false;
  // Initial fill
  sonarCtx.fillStyle = SONAR_BG;
  sonarCtx.fillRect(0, 0, sonarW, sonarH);
  // Faint horizontal mid-line as depth reference
  sonarCtx.fillStyle = 'rgba(255, 220, 130, 0.08)';
  sonarCtx.fillRect(0, Math.floor(sonarH / 2), sonarW, 1);
}

function updateSonar() {
  if (!sonarCtx || menuOpen) return;
  // Scroll the existing display left by 1px (drawImage source-self with offset)
  sonarCtx.drawImage(sonarCtx.canvas, -1, 0);
  // Repaint the rightmost column with fresh data
  let xCol = sonarW - 1;
  sonarCtx.fillStyle = SONAR_BG;
  sonarCtx.fillRect(xCol, 0, 1, sonarH);

  // Bottom contour — derived from local lake depth so the bottom rises near
  // shore and dips in basins, like a real sonar trace.
  let lakeDepth = lake.depthAt(player.pos.x, player.pos.y);   // 0 (shore) → 1 (basin)
  let bottomY = Math.floor(2 + lakeDepth * (sonarH - 4));
  // shade from the bottom down to make a "ground" band
  sonarCtx.fillStyle = 'rgba(120, 90, 50, 0.55)';
  sonarCtx.fillRect(xCol, bottomY, 1, sonarH - bottomY);
  sonarCtx.fillStyle = 'rgba(180, 140, 80, 0.85)';
  sonarCtx.fillRect(xCol, bottomY, 1, 1);

  // Faint mid-line so depth is readable
  sonarCtx.fillStyle = 'rgba(255, 220, 130, 0.08)';
  sonarCtx.fillRect(xCol, Math.floor(sonarH / 2), 1, 1);

  // Plot fish using a sonar-cone apparent-depth model so passing fish trace
  // arches: apparent_y = sqrt(depth² + lateral²). A fish off to the side
  // echoes from a longer slant range than one directly below, so it shows up
  // deeper on the display. As the kayak closes in, apparent_y dips toward
  // true depth (the peak of the arch), then climbs again as it passes.
  let scanR2 = SONAR_RANGE * SONAR_RANGE;
  let lateralScale = sonarH / SONAR_RANGE;     // world px → display px (vertical)
  let plot = (f, isBass) => {
    let dx = f.pos.x - player.pos.x;
    let dy = f.pos.y - player.pos.y;
    let d2 = dx * dx + dy * dy;
    if (d2 > scanR2) return;
    let zNorm = Math.max(0, Math.min(1, f.z != null ? f.z : 0.4));
    let depthPix = 2 + zNorm * (sonarH - 4);
    let lateralPix = Math.sqrt(d2) * lateralScale;
    let apparentY = Math.sqrt(depthPix * depthPix + lateralPix * lateralPix);
    if (apparentY > sonarH - 2 || apparentY > bottomY - 1) return;
    let y = Math.floor(apparentY);
    let color = SONAR_SPECIES_COLOR[f.species] || '#9c9';
    sonarCtx.fillStyle = color;
    // 2px-wide, 1-2px tall blip — successive frames stitch into a curve
    let h = isBass ? 2 : 1;
    let w = isBass ? 2 : 1;
    sonarCtx.fillRect(xCol - (w - 1), y - Math.floor(h / 2), w, h);
  };
  for (let f of panfish) plot(f, false);
  for (let b of bass)   plot(b, true);

  // Right-edge "now" indicator — a thin yellow line
  sonarCtx.fillStyle = 'rgba(255, 230, 130, 0.35)';
  sonarCtx.fillRect(xCol, 0, 1, sonarH);
}

function populateFlyBox() {
  let grid = document.getElementById('flybox-grid');
  if (!grid) return;
  let order = ['fly', 'nymph', 'woolyBugger'];
  let hotkeys = { fly: '1', nymph: '2', woolyBugger: '3' };
  // Show what each fly catches in the *current* level
  let catches = lvl().catches || {};
  grid.innerHTML = order.map(t => {
    let cfg = FLY_CONFIG[t];
    let unlocked = playerState.unlocks.flies[t];
    let active = selectedFly === t;
    let cls = 'flybox-slot' + (active ? ' active' : '') + (!unlocked ? ' locked' : '');
    let targets = (catches[t] || []).map(s => s.replace(/([A-Z])/g, ' $1').toLowerCase().trim()).join(' · ');
    let img = flyIcons[t] ? `<img src="${flyIcons[t]}" alt="${cfg.label}">` : '';
    return `<div class="${cls}" data-fly="${t}">
      ${img}
      <div class="name">${cfg.label}${unlocked ? '' : ' 🔒'}</div>
      <div class="targets">${unlocked ? (targets || '—') : 'Locked'}</div>
      <div class="hotkey">[${hotkeys[t]}]</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.flybox-slot').forEach(el => {
    el.addEventListener('click', () => {
      let t = el.dataset.fly;
      if (!playerState.unlocks.flies[t]) return;
      trySelectFly(t);
      populateFlyBox();           // refresh active highlight
      closeFlyBox();
    });
  });
}

function openFlyBox()  { populateFlyBox(); document.getElementById('flybox')?.classList.remove('hidden'); }
function closeFlyBox() { document.getElementById('flybox')?.classList.add('hidden'); }

function populateLevelGroup() {
  let group = document.getElementById('level-group');
  if (!group) return;
  group.innerHTML = Object.entries(LEVELS).map(([id, L]) => {
    let active = id === currentLevel;
    let unlocked = playerState.levelsUnlocked[id];
    let cls = 'level-card' + (active ? ' active' : '') + (!unlocked ? ' locked' : '');
    let status = active
      ? 'Active'
      : (unlocked ? 'Tap to switch' : `Locked · $${L.unlockCost}`);
    return `<div class="${cls}" data-level="${id}">
      <div class="lvl-name">${L.name}</div>
      <div class="lvl-blurb">${L.blurb}</div>
      <div class="lvl-status">${status}</div>
    </div>`;
  }).join('');
  group.querySelectorAll('.level-card').forEach(el => {
    el.addEventListener('click', () => onLevelCardClick(el.dataset.level));
  });
  // Also reflect current level in the menu title/tagline
  let titleEl = document.getElementById('menu-title');
  let taglineEl = document.getElementById('menu-tagline');
  if (titleEl) titleEl.textContent = lvl().name;
  if (taglineEl) taglineEl.textContent = lvl().blurb;
}

function onLevelCardClick(id) {
  if (!LEVELS[id]) return;
  if (id === currentLevel) return;
  if (!playerState.levelsUnlocked[id]) {
    // try to buy the unlock with current money
    let cost = LEVELS[id].unlockCost || 0;
    if (playerState.money < cost) {
      // brief shake / feedback would be nice but for now just bail
      return;
    }
    playerState.money -= cost;
    playerState.levelsUnlocked[id] = true;
    playSound('buy');
  }
  playerState.level = id;
  saveProgress();
  // hard reload for a clean world rebuild with new palette/species/props
  location.reload();
}

function populateMenuFlyGrid() {
  let grid = document.getElementById('fly-grid');
  if (!grid) return;
  let entries = [
    { fly: 'fly',         species: 'bluegill',     desc: 'Bluegill · Pumpkinseed' },
    { fly: 'nymph',       species: 'crappie',      desc: 'Crappie' },
    { fly: 'woolyBugger', species: 'bass',         desc: 'Largemouth Bass' },
  ];
  grid.innerHTML = entries.map(e => {
    let portrait = speciesPortraits[e.species];
    let img = portrait ? `<img src="${portrait}">` : '';
    let locked = !playerState.unlocks.flies[e.fly];
    return `<div class="fly-card${locked ? ' locked' : ''}">${img}<div class="name">${FLY_CONFIG[e.fly].label}</div><div class="target">${e.desc}</div></div>`;
  }).join('');
}

function populateShop() {
  let list = document.getElementById('shop-list');
  let moneyEl = document.getElementById('shop-money');
  if (moneyEl) moneyEl.textContent = `$${playerState.money}`;
  if (!list) return;
  list.innerHTML = SHOP_ITEMS.map(item => {
    let owned = !item.check(playerState);
    let canAfford = playerState.money >= item.cost;
    let btnDisabled = owned || !canAfford;
    let btnLabel = owned ? 'Owned' : 'Buy';
    return `<div class="shop-item${owned ? ' owned' : ''}">
      <div class="info">
        <div class="name">${item.label}</div>
        <div class="desc">${item.desc}</div>
      </div>
      <div class="price">$${item.cost}</div>
      <button data-id="${item.id}" ${btnDisabled ? 'disabled' : ''}>${btnLabel}</button>
    </div>`;
  }).join('');
  // Re-bind buy buttons
  list.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      let item = SHOP_ITEMS.find(i => i.id === btn.dataset.id);
      if (!item || !item.check(playerState) || playerState.money < item.cost) return;
      playerState.money -= item.cost;
      item.apply(playerState);
      saveProgress();
      refreshUnlocks();
      populateMenuFlyGrid();
      populateShop();
      playSound('buy');
    });
  });
}

function buildFlyIcons() {
  // Real pixel-art assets — see /images/. The HTML <img> tags below take
  // these straight as src URLs. (The old procedural drawFlyArt() canvas
  // generator is kept just below for reference / fallback.)
  flyIcons = {
    fly:         'images/adams-dry-fly.png',
    nymph:       'images/prince-nymph.png',
    woolyBugger: 'images/woolly-bugger.png',
  };
}

function drawFlyArt(g, type, x, y) {
  g.push();
  g.translate(x, y);

  if (type === 'fly') {
    // ---- DRY FLY: cream body, upright wing post, radial hackle, hook curve ----
    // hook curve underneath
    g.stroke(70, 60, 50); g.strokeWeight(1.6); g.noFill();
    g.bezier(28, -2, 26, 14, 14, 18, 4, 14);
    // hackle (radial bristles around body) — dense
    g.stroke(140, 105, 60, 220); g.strokeWeight(0.9);
    for (let a = 0; a < TWO_PI; a += PI / 14) {
      g.line(-2, -2, -2 + Math.cos(a) * 16, -2 + Math.sin(a) * 16);
    }
    // body — tan/cream segmented
    g.noStroke();
    g.fill(215, 180, 120);
    g.ellipse(-2, -2, 30, 11);
    g.fill(170, 135, 80);
    for (let i = -14; i < 8; i += 5) {
      g.rect(i, -7, 1.6, 10);
    }
    // wing post — white deer hair, two clumps
    g.fill(245, 240, 225);
    g.triangle(-6, -7, -4, -22, -1, -7);
    g.fill(230, 225, 210);
    g.triangle( -1, -7,  3, -19,  6, -7);
    // head — small bead
    g.fill(60, 45, 25);
    g.ellipse(8, -2, 6, 5);
  }

  else if (type === 'nymph') {
    // ---- NYMPH: gold bead head, segmented olive body, sparse legs ----
    g.stroke(70, 60, 50); g.strokeWeight(1.6); g.noFill();
    g.bezier(28, -2, 26, 14, 14, 18, 4, 14);
    g.noStroke();
    // body — dark olive
    g.fill(85, 75, 45);
    g.ellipse(-4, 0, 32, 11);
    // dark ribbing
    g.fill(35, 30, 18, 220);
    for (let i = -18; i < 2; i += 3) {
      g.rect(i, -6, 1.4, 11);
    }
    // thorax (slightly bigger toward head)
    g.fill(70, 60, 35);
    g.ellipse(2, 0, 12, 11);
    // soft hackle / legs at thorax
    g.stroke(120, 95, 55, 220); g.strokeWeight(0.8);
    g.line(0,  3, -4,  10);
    g.line(0, -3, -4, -10);
    g.line(4,  3,  0,  10);
    g.line(4, -3,  0, -10);
    g.line(-4, 3, -10, 8);
    g.line(-4, -3, -10, -8);
    g.noStroke();
    // gold bead head
    g.fill(70, 50, 25);
    g.ellipse(11, -1, 11, 11);   // shadow
    g.fill(230, 175, 70);
    g.ellipse(10, -2, 10, 10);
    g.fill(255, 230, 160);
    g.ellipse(8, -4, 4, 4);
  }

  else if (type === 'woolyBugger') {
    // ---- WOOLY BUGGER: long marabou tail, fuzzy chenille body, bead head ----
    g.stroke(70, 60, 50); g.strokeWeight(1.5); g.noFill();
    g.bezier(20, -2, 18, 12, 6, 16, -4, 12);
    g.noStroke();
    // marabou tail — wispy strands trailing off the back
    g.stroke(35, 50, 35, 220); g.strokeWeight(1.4);
    for (let i = 0; i < 11; i++) {
      let baseY = (i - 5) * 1.3;
      let endY  = baseY + (Math.sin(i * 0.7) * 4);
      g.line(-12, baseY, -38, endY);
    }
    // softer outer wisps
    g.stroke(20, 35, 25, 140); g.strokeWeight(0.8);
    for (let i = 0; i < 6; i++) {
      let baseY = (i - 2.5) * 2;
      g.line(-12, baseY, -42 + Math.random() * 3, baseY * 2);
    }
    g.noStroke();
    // body — fuzzy dark-olive chenille
    g.fill(35, 50, 32);
    g.ellipse(-3, 0, 28, 14);
    g.fill(60, 75, 45);
    g.ellipse(-3, -2, 24, 9);
    // hackle palmer — spiral hackle wrap around the body
    g.stroke(80, 100, 55, 200); g.strokeWeight(0.7);
    for (let i = 0; i < 18; i++) {
      let t = i / 17;
      let bx = -16 + t * 26;
      let phase = i * 0.55;
      let r = 8;
      g.line(bx, Math.cos(phase) * r, bx + 1.5, Math.cos(phase + 0.4) * r);
      g.line(bx, Math.cos(phase) * r, bx + 2, Math.cos(phase) * (r + 3));
    }
    g.noStroke();
    // gold bead head with highlight
    g.fill(230, 175, 70);
    g.ellipse(11, -1, 11, 11);
    g.fill(255, 230, 160);
    g.ellipse(9, -3, 4, 4);
    // dark eye dot
    g.fill(40, 30, 18);
    g.ellipse(13, 0, 3, 3);
  }

  g.pop();
}

function buildSpeciesPortraits() {
  // External PNG portraits (place these files in /images/). The img tags load
  // them lazily; if a file is missing the toast falls back to no image.
  speciesPortraits = {
    // bass lake — original 4
    bluegill:         'images/bluegill-removebg-preview.png',
    pumpkinseed:      'images/pumpkinseed-removebg-preview.png',
    crappie:          'images/blackcrappie-removebg-preview.png',
    bass:             'images/largemouth-removebg-preview.png',
    // bass lake — new sunfish + perch + predators
    greenSunfish:     'images/green-sunfish.png',
    redbreastSunfish: 'images/redbreast-sunfish.png',
    spottedSunfish:   'images/spotted-sunfish.png',
    yellowPerch:      'images/yellow-perch.png',
    smallmouthBass:   'images/smallmouth-bass.png',
    chainPickerel:    'images/chain-pickerel.png',
    northernPike:     'images/northern-pike.png',
    // alpine lake
    rainbowTrout:     'images/rainbow-trout.png',
    brookTrout:       'images/brook-trout.png',
    brownTrout:       'images/brown-trout.png',
    cutthroatTrout:   'images/cutthroat-trout.png',
  };
}

function buildStaticImage() {
  // Bake everything that doesn't change to a single image. Memory: 2800x2800 *
  // 4 bytes ≈ 31MB at pixelDensity 1.
  let sw = Math.floor(WORLD_W * STATIC_SCALE);
  let sh = Math.floor(WORLD_H * STATIC_SCALE);
  let g = createGraphics(sw, sh);
  g.pixelDensity(1);
  g.scale(STATIC_SCALE);
  g.noStroke();

  // forest floor
  g.background(80, 95, 45);
  for (let s of lake.dirtSpecks) {
    g.fill(s.c[0], s.c[1], s.c[2], 180);
    g.ellipse(s.x, s.y, s.r);
  }
  for (let s of lake.sandSpecks) {
    g.fill(195, 170, 115, 140);
    g.ellipse(s.x, s.y, s.r);
  }

  // trees: trunks then canopies. Pines get a spiky, conical top-down look.
  for (let t of trees) {
    g.fill(40, 30, 22, 220);
    g.ellipse(t.x, t.y, t.r * 0.35, t.r * 0.35);
  }
  for (let t of trees) {
    g.fill(0, 0, 0, 60);
    g.ellipse(t.x + 6, t.y + 8, t.r * 1.6, t.r * 1.4);
    if (t.pine) {
      // base dark-green disk, then a starburst of triangle "branches"
      // radiating outward to suggest pine needles seen from directly above.
      let baseR = t.r * 1.0;
      g.fill(t.hue - 6, t.val - 12, t.tone - 6);
      g.ellipse(t.x, t.y, baseR * 1.2, baseR * 1.2);
      g.fill(t.hue, t.val, t.tone);
      let prongs = 8;
      g.beginShape();
      for (let i = 0; i < prongs * 2; i++) {
        let a = (i / (prongs * 2)) * TWO_PI + t.x * 0.005;
        let rr = (i % 2 === 0) ? baseR * 1.05 : baseR * 0.62;
        g.vertex(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr);
      }
      g.endShape(g.CLOSE);
      // sunlit tip near the apex of the conical tree
      g.fill(t.hue + 22, t.val + 30, t.tone + 12, 240);
      g.ellipse(t.x - t.r * 0.05, t.y - t.r * 0.08, t.r * 0.32, t.r * 0.32);
      // dark central shadow at the very top (suggesting the tip of the cone)
      g.fill(t.hue - 18, t.val - 25, t.tone - 12, 180);
      g.ellipse(t.x, t.y, t.r * 0.18, t.r * 0.18);
    } else {
      g.fill(t.hue - 10, t.val - 10, t.tone - 10);
      g.ellipse(t.x, t.y, t.r * 1.7, t.r * 1.5);
      for (let i = 0; i < 5; i++) {
        let a = (i / 5) * TWO_PI + t.x * 0.01;
        let dx = Math.cos(a) * t.r * 0.45;
        let dy = Math.sin(a) * t.r * 0.4;
        g.fill(t.hue, t.val, t.tone, 220);
        g.ellipse(t.x + dx, t.y + dy, t.r * 0.85, t.r * 0.75);
      }
      g.fill(t.hue + 15, t.val + 25, t.tone + 5, 200);
      g.ellipse(t.x - t.r * 0.2, t.y - t.r * 0.25, t.r * 0.6, t.r * 0.5);
    }
  }

  // lake water polygon — base color from level palette
  let waterPal = lvl().palette.waterBase;
  g.fill(waterPal[0], waterPal[1], waterPal[2]);
  g.beginShape();
  for (let p of lake.points) g.vertex(p.x, p.y);
  g.endShape(g.CLOSE);

  // surface patches — clipped to lake polygon, with bake-time blur for blending
  g.drawingContext.save();
  g.drawingContext.beginPath();
  g.drawingContext.moveTo(lake.points[0].x, lake.points[0].y);
  for (let i = 1; i < lake.points.length; i++) {
    g.drawingContext.lineTo(lake.points[i].x, lake.points[i].y);
  }
  g.drawingContext.closePath();
  g.drawingContext.clip();
  g.drawingContext.filter = 'blur(18px)';
  for (let p of lake.surfacePatches) {
    g.fill(p.c[0], p.c[1], p.c[2], p.a);
    g.ellipse(p.x, p.y, p.r, p.r * p.aspect);
  }
  g.drawingContext.filter = 'none';
  // tree shadows over water (still inside lake clip)
  for (let t of trees) {
    let inAmt = lake.insideAmount(t.x, t.y);
    if (inAmt > -150 && inAmt < 80) {
      let inward = lake.inwardNormal(t.x, t.y);
      let cx = t.x + inward.x * (t.r * 0.6);
      let cy = t.y + inward.y * (t.r * 0.6);
      g.fill(0, 10, 5, 70 * t.shade * 4);
      g.ellipse(cx, cy, t.r * 1.8, t.r * 1.4);
      g.fill(0, 10, 5, 30 * t.shade * 4);
      g.ellipse(cx, cy, t.r * 2.6, t.r * 2.0);
    }
  }
  g.drawingContext.restore();

  // shoreline edge
  let shorePal = lvl().palette.shoreline;
  g.stroke(shorePal[0], shorePal[1], shorePal[2], 220);
  g.strokeWeight(4);
  g.noFill();
  g.beginShape();
  for (let p of lake.points) g.vertex(p.x, p.y);
  g.endShape(g.CLOSE);
  g.noStroke();

  // rocks
  for (let r of rocks) {
    g.fill(0, 0, 0, 70);
    g.ellipse(r.x + 1, r.y + 2, r.r * 2.1, r.r * 1.4);
    g.fill(r.shade, r.shade, r.shade);
    g.ellipse(r.x, r.y, r.r * 2, r.r * 1.4);
    g.fill(r.shade + 30, r.shade + 30, r.shade + 30, 200);
    g.ellipse(r.x - r.r * 0.2, r.y - r.r * 0.25, r.r * 0.7, r.r * 0.4);
  }

  // logs — replicate drawLog using the offscreen graphics
  for (let l of logs) {
    g.push();
    g.translate(l.x, l.y);
    g.rotate(l.a);
    g.fill(0, 0, 0, 80);
    g.ellipse(2, 4, l.len, l.thick * 1.3);
    g.fill(75, 55, 35);
    g.rect(-l.len / 2, -l.thick / 2, l.len, l.thick, l.thick * 0.4);
    g.stroke(45, 30, 18, 200);
    g.strokeWeight(1);
    for (let i = -l.len / 2 + 6; i < l.len / 2 - 6; i += 8) {
      g.line(i, -l.thick / 2 + 2, i, l.thick / 2 - 2);
    }
    g.noStroke();
    g.fill(110, 80, 50);
    g.ellipse(-l.len / 2 + 2, 0, l.thick * 0.9, l.thick);
    g.ellipse(l.len / 2 - 2, 0, l.thick * 0.9, l.thick);
    g.fill(70, 50, 30);
    g.ellipse(-l.len / 2 + 2, 0, l.thick * 0.45, l.thick * 0.5);
    g.ellipse(l.len / 2 - 2, 0, l.thick * 0.45, l.thick * 0.5);
    g.pop();
  }

  // snags — sunken stumps with a stub above water
  for (let s of snags) {
    g.fill(28, 22, 18, 95);
    g.ellipse(s.x, s.y, s.r * 2.6, s.r * 1.6);
    g.fill(45, 35, 25, 120);
    g.ellipse(s.x, s.y, s.r * 1.8, s.r * 1.1);
    g.push();
    g.translate(s.x, s.y - 1);
    g.rotate(s.stubLean);
    g.fill(220, 230, 235, 50);
    g.ellipse(0, 0, s.r * 1.5, s.r * 0.7);
    g.fill(60, 42, 28);
    g.rect(-s.r * 0.32, -s.stubH, s.r * 0.64, s.stubH, 2);
    g.fill(85, 58, 38);
    g.rect(-s.r * 0.32, -s.stubH, s.r * 0.18, s.stubH, 2);
    g.fill(140, 110, 75);
    g.ellipse(0, -s.stubH, s.r * 0.62, s.r * 0.22);
    g.fill(50, 35, 22);
    g.ellipse(0, -s.stubH + 1, s.r * 0.45, s.r * 0.14);
    g.pop();
  }

  staticImg = g;
}

function jitterAround(obj, r) {
  return { x: obj.x + random(-r, r), y: obj.y + random(-r, r) };
}

function pickSpawnPoint(cfg) {
  // Habitat-aware spawn for both panfish-class and bass-class species.
  let p;
  if (cfg.class === 'bass') {
    // Predators love structure — half the time, drop them right next to a
    // snag or log. The other half they pick a deep mid-water position.
    if (snags.length > 0 && random() < 0.4) {
      p = jitterAround(random(snags), 35);
    } else if (logs.length > 0 && random() < 0.3) {
      p = jitterAround(random(logs), 50);
    } else {
      p = lake.randomEdgePoint(random(0.65, 0.90));
    }
  } else if (cfg.habitat === 'weeds' && weeds.length > 0 && random() < 0.7) {
    p = jitterAround(random(weeds), 60);
  } else if (cfg.habitat === 'lilypads' && lilypads.length > 0 && random() < 0.7) {
    p = jitterAround(random(lilypads), 50);
  } else if (cfg.habitat === 'logs' && logs.length > 0 && random() < 0.5) {
    p = jitterAround(random(logs), 70);
  } else if (cfg.habitat === 'rocks' && rocks.length > 0 && random() < 0.6) {
    p = jitterAround(random(rocks), 60);
  } else {
    p = lake.randomEdgePoint(random(0.35, 0.85));
  }
  // safety: make sure spawn ends up in water
  if (!lake.contains(p.x, p.y, 20)) p = lake.randomInteriorPoint();
  return p;
}

function randomShorePoint(distOutside) {
  // pick a point somewhere outside the lake (in the dirt/forest area)
  for (let i = 0; i < 50; i++) {
    let idx = floor(random(lake.points.length));
    let p = lake.points[idx];
    let n = lake._outwardAt(idx);
    let x = p.x + n.x * distOutside;
    let y = p.y + n.y * distOutside;
    if (x > 30 && y > 30 && x < WORLD_W - 30 && y < WORLD_H - 30) return { x, y };
  }
  return { x: random(WORLD_W), y: random(WORLD_H) };
}

// Viewport bounds in world coords — cached per-frame for cheap culling.
let viewMinX = 0, viewMaxX = 0, viewMinY = 0, viewMaxY = 0;
function inView(x, y, m = 0) {
  return x > viewMinX - m && x < viewMaxX + m && y > viewMinY - m && y < viewMaxY + m;
}

function draw() {
  // kayak movement (WASD/arrows). Camera lerps to follow the player.
  player.update();
  let targetCamX = player.pos.x - width / (2 * zoom);
  let targetCamY = player.pos.y - height / (2 * zoom);
  cam.x = lerp(cam.x, targetCamX, 0.12);
  cam.y = lerp(cam.y, targetCamY, 0.12);
  cam.x = constrain(cam.x, 0, WORLD_W - width / zoom);
  cam.y = constrain(cam.y, 0, WORLD_H - height / zoom);

  background(20, 30, 18);

  // cache viewport bounds in world coords for culling
  viewMinX = cam.x;
  viewMinY = cam.y;
  viewMaxX = cam.x + width / zoom;
  viewMaxY = cam.y + height / zoom;

  // Single sub-region blit of the pre-baked static world (in SCREEN coords —
  // outside the world transform — so the browser does a tight region copy
  // without per-pixel transform work).
  let srcX = cam.x * STATIC_SCALE;
  let srcY = cam.y * STATIC_SCALE;
  let srcW = (width / zoom) * STATIC_SCALE;
  let srcH = (height / zoom) * STATIC_SCALE;
  image(staticImg, 0, 0, width, height, srcX, srcY, srcW, srcH);

  push();
  scale(zoom);
  translate(-cam.x, -cam.y);

  // Animated water surface effects (wavelets/caustics/motes)
  lake.drawWaterEffects();
  for (let c of cattails) { if (inView(c.x, c.y, c.h)) drawCattail(c); }
  for (let w of weeds) { if (inView(w.x, w.y, w.h)) drawWeed(w); }

  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i].update();
    ripples[i].draw();
    if (ripples[i].dead()) ripples.splice(i, 1);
  }

  for (let i = bubbles.length - 1; i >= 0; i--) {
    bubbles[i].update();
    bubbles[i].draw();
    if (bubbles[i].dead()) bubbles.splice(i, 1);
  }

  // Build spatial hash for panfish so flock() is O(n) not O(n²).
  // Cell size > max neighbor radius so we only need to check 9 cells per fish.
  const HASH_CELL = 120;
  let panfishHash = new Map();
  for (let p of panfish) {
    let kx = Math.floor(p.pos.x / HASH_CELL);
    let ky = Math.floor(p.pos.y / HASH_CELL);
    let k = kx + ',' + ky;
    let bucket = panfishHash.get(k);
    if (!bucket) { bucket = []; panfishHash.set(k, bucket); }
    bucket.push(p);
  }

  for (let p of panfish) {
    if (!p.hooked) {
      p.flock(panfishHash, HASH_CELL, bass);
      p.update();
    }
    if (inView(p.pos.x, p.pos.y, 30)) p.draw();
  }

  for (let i = panfish.length - 1; i >= 0; i--) {
    if (panfish[i].dead) panfish.splice(i, 1);
  }

  for (let b of bass) {
    if (!b.hooked) b.update(panfish);
    if (inView(b.pos.x, b.pos.y, 60)) b.draw();
  }

  // Ducks — drift on the surface above the fish but under lily pads
  for (let d of ducks) {
    d.update();
    if (inView(d.pos.x, d.pos.y, 40)) d.draw();
  }

  // Eagle shadow on water — drawn under lily pads so pads cast above it
  if (eagle) eagle.drawShadow();

  // lily pads on top so fish appear to swim under them
  for (let lp of lilypads) { if (inView(lp.x, lp.y, lp.r * 1.5)) drawLilypad(lp); }

  // kayak floats on top of lily pads (it's at the surface)
  player.draw();

  // Ghost kayaks for everyone else in the derby — same layer as the local
  // kayak, drawn with a translucent body + a name label above each.
  drawDerbyGhosts();
  // Chat bubbles ride above ghost names; drawn for local + remote players.
  drawChatBubbles();

  // Broadcast our own position + active cast + appearance to peers
  if (window.MP && MP.broadcastPosition) {
    MP.broadcastPosition({
      x: player.pos.x, y: player.pos.y,
      heading: player.heading, paddlePhase: player.paddlePhase,
      cast,    // null when not casting; FlyCast instance during a cast
      appearance: playerAppearance,
    });
  }

  // fly line + fly — drawn after kayak so the line connects cleanly to the rod
  if (cast) {
    cast.update();
    cast.draw();
    if (cast.state === 'done') cast = null;
  }

  // aim reticle when no cast is active
  if (!cast) {
    let wx = mouseX / zoom + cam.x;
    let wy = mouseY / zoom + cam.y;
    let onWater = lake.contains(wx, wy, 4);
    noFill();
    stroke(onWater ? 'rgba(255,240,180,0.7)' : 'rgba(220,80,60,0.6)');
    strokeWeight(1);
    ellipse(wx, wy, 12, 12);
    line(wx - 5, wy, wx + 5, wy);
    line(wx, wy - 5, wx, wy + 5);
    noStroke();
  }

  // Eagle body — drawn last so it flies above everything in the world.
  // Spawn one occasionally when none is active.
  if (eagle) {
    eagle.update();
    eagle.draw();
    if (eagle.state === 'done') {
      eagle = null;
      eagleSpawnCooldown = 1800 + floor(random(1800));   // 30-60 s of quiet
    }
  } else {
    eagleSpawnCooldown--;
    if (eagleSpawnCooldown <= 0 && !menuOpen) {
      eagle = new Eagle();
    }
  }

  pop();

  // ---- Derby HUD (timer + leaderboard) — only renders while a derby is live ----
  if (frameCount % 12 === 0) tickDerbyHud();

  // ---- HUD updates (HTML overlay) ----
  if (frameCount % 6 === 0) {
    let flyEl = document.getElementById('hud-fly');
    let moneyEl = document.getElementById('hud-money');
    let catchEl = document.getElementById('hud-catch');
    if (flyEl) {
      let icon = flyIcons[selectedFly] ? `<img src="${flyIcons[selectedFly]}" alt="">` : '';
      flyEl.innerHTML = `${icon}<span>${FLY_CONFIG[selectedFly].label}</span><span class="fly-hint">F</span>`;
    }
    if (moneyEl) moneyEl.textContent = `$${playerState.money}`;
    if (catchEl) {
      // Compact: only species the player has actually caught (the lake now
      // has 11 species; showing all of them with zeros makes the HUD too
      // chatty). Falls back to a friendly nudge when nothing's caught yet.
      let caught = lvl().species
        .filter(sp => (catchCount[sp] || 0) > 0)
        .map(sp => `${sp.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} ${catchCount[sp]}`);
      catchEl.textContent = caught.length
        ? `Caught — ${caught.join('  ·  ')}`
        : `Nothing landed yet — try a fly`;
    }
  }
  updateWind();
  updateSonar();

  // Fight UI bars
  let fightUI = document.getElementById('fight-ui');
  if (fightUI) {
    let fighting = cast && cast.state === 'hooked';
    fightUI.classList.toggle('hidden', !fighting);
    if (fighting) {
      let tFill = document.getElementById('tension-fill');
      let sFill = document.getElementById('stamina-fill');
      if (tFill) tFill.style.width = `${constrain(cast.tension * 100, 0, 100)}%`;
      if (sFill) sFill.style.width = `${constrain(cast.fishStamina * 100, 0, 100)}%`;
    }
  }

  // Miss toast (line snap, hook slip)
  if (lastMissToast) {
    let age = frameCount - lastMissToast.time;
    let toast = document.getElementById('miss-toast');
    if (toast) {
      if (age < 150) {
        let msg = 'Got away!';
        if (lastMissToast.reason === 'snap') msg = 'Line snapped!';
        else if (lastMissToast.reason === 'slip') msg = 'Hook slipped!';
        toast.textContent = msg;
        toast.style.opacity = age < 110 ? '1' : `${(150 - age) / 40}`;
      } else {
        toast.style.opacity = '0';
        lastMissToast = null;
      }
    }
  }

  if (lastCatchToast) {
    let age = frameCount - lastCatchToast.time;
    let toast = document.getElementById('catch-toast');
    if (toast) {
      // Show for ~3.5 seconds (210 frames at 60fps), with a 60-frame fade-out
      const HOLD_FRAMES = 150;
      const FADE_FRAMES = 60;
      const TOTAL = HOLD_FRAMES + FADE_FRAMES;
      if (age < TOTAL) {
        let key = lastCatchToast.species + ':' + lastCatchToast.time;
        if (toast.dataset.species !== key) {
          toast.dataset.species = key;
          let portrait = speciesPortraits[lastCatchToast.species];
          let imgTag = portrait ? `<img src="${portrait}" alt="${lastCatchToast.species}">` : '';
          let rewardTag = lastCatchToast.points
            ? `<div class="reward">+${lastCatchToast.points} pts</div>`
            : (lastCatchToast.money ? `<div class="reward">+$${lastCatchToast.money}</div>` : '');
          toast.innerHTML =
            `<div class="card">${imgTag}` +
            `<div class="label">Catch!</div>` +
            `<div class="species">${lastCatchToast.species}</div>` +
            rewardTag +
            `</div>`;
        }
        toast.style.opacity = age < HOLD_FRAMES ? '1' : `${1 - (age - HOLD_FRAMES) / FADE_FRAMES}`;
      } else {
        toast.style.opacity = '0';
        toast.dataset.species = '';
        lastCatchToast = null;
      }
    }
  }

  // Respawn — driven by the current level's spawn table.
  // Each kind of fish (panfish-class and bass-class) has its own slow
  // respawn cadence. We pick the most under-represented species each tick.
  let levelSpawn = lvl().spawn;
  let panfishTarget = 0, bassTarget = 0;
  for (let sp in levelSpawn) {
    let cls = SPECIES[sp]?.class;
    if (cls === 'bass') bassTarget += levelSpawn[sp];
    else                panfishTarget += levelSpawn[sp];
  }

  if (bass.length < bassTarget && frameCount % 360 === 0) {
    let lowest = _underrepresentedSpecies(bass, levelSpawn, 'bass');
    let p = lake.randomEdgePoint(random(0.78, 0.93));
    bass.push(new Bass(p.x, p.y, lowest));
  }

  if (panfish.length < panfishTarget && frameCount % 90 === 0) {
    let lowest = _underrepresentedSpecies(panfish, levelSpawn, 'panfish');
    if (lowest) {
      let cfg = SPECIES[lowest];
      let p = pickSpawnPoint(cfg);
      panfish.push(new Panfish(p.x, p.y, lowest));
    }
  }
}

function _underrepresentedSpecies(arr, levelSpawn, classFilter) {
  let counts = {};
  for (let s in levelSpawn) {
    if ((SPECIES[s]?.class || 'panfish') !== classFilter) continue;
    counts[s] = 0;
  }
  for (let f of arr) {
    if (counts[f.species] != null) counts[f.species]++;
  }
  let best = null, bestRatio = Infinity;
  for (let s in counts) {
    let target = levelSpawn[s] || 1;
    let r = counts[s] / target;
    if (r < bestRatio) { bestRatio = r; best = s; }
  }
  return best;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() {
  // ESC / M reopens the menu (or closes it if already open).
  if (keyCode === ESCAPE || key === 'm' || key === 'M') {
    toggleMenu();
    return;
  }
  if (menuOpen) return;
  if (keyCode === LEFT_ARROW || key === 'a' || key === 'A') keys.left = true;
  if (keyCode === RIGHT_ARROW || key === 'd' || key === 'D') keys.right = true;
  if (keyCode === UP_ARROW || key === 'w' || key === 'W') keys.up = true;
  if (keyCode === DOWN_ARROW || key === 's' || key === 'S') keys.down = true;
  if (key === '1') trySelectFly('fly');
  if (key === '2') trySelectFly('nymph');
  if (key === '3') trySelectFly('woolyBugger');
  if (key === 'f' || key === 'F') {
    let box = document.getElementById('flybox');
    if (box && box.classList.contains('hidden')) openFlyBox();
    else closeFlyBox();
  }
}

function toggleMenu() {
  let menuEl = document.getElementById('menu');
  if (!menuEl) return;
  menuOpen = !menuOpen;
  menuEl.classList.toggle('hidden', !menuOpen);
  populateLevelGroup();
  populateMenuFlyGrid();
  // Release any held movement keys so the kayak doesn't drift while in menu
  if (menuOpen) {
    keys.left = keys.right = keys.up = keys.down = false;
  }
}

function trySelectFly(name) {
  if (playerState.unlocks.flies[name]) selectedFly = name;
}
function keyReleased() {
  if (keyCode === LEFT_ARROW || key === 'a' || key === 'A') keys.left = false;
  if (keyCode === RIGHT_ARROW || key === 'd' || key === 'D') keys.right = false;
  if (keyCode === UP_ARROW || key === 'w' || key === 'W') keys.up = false;
  if (keyCode === DOWN_ARROW || key === 's' || key === 'S') keys.down = false;
}

// Drag-pan removed: the camera follows the kayak now, and the mouse is for casting.

function mouseWheel(event) {
  if (menuOpen) return;
  // zoom toward the mouse cursor so it stays anchored
  let mwx = mouseX / zoom + cam.x;
  let mwy = mouseY / zoom + cam.y;
  let oldZoom = zoom;
  zoom = constrain(zoom * (1 - event.delta * 0.0015), ZOOM_MIN, ZOOM_MAX);
  if (zoom !== oldZoom) {
    cam.x = mwx - mouseX / zoom;
    cam.y = mwy - mouseY / zoom;
    cam.x = constrain(cam.x, 0, WORLD_W - width / zoom);
    cam.y = constrain(cam.y, 0, WORLD_H - height / zoom);
  }
  return false;
}

// ---------- LAKE ----------
// Multi-basin lake — 3 basins arranged in a triangle, connected by channels.
// Marching squares contour over (basin bias + channel bias + noise) gives
// a network of lakes with narrow connecting passages.
class Lake {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.noiseSeed = random(1000);
    this.threshold = 0.5;
    this.gridSize = 28;
    this.cols = ceil(w / this.gridSize);
    this.rows = ceil(h / this.gridSize);

    // Pick basin centers — 3 basins roughly arranged in a triangle, with jitter.
    this.basins = this._pickBasins();
    this.channels = this._connectBasins();

    // pick the largest blob over several seeds
    let best = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      this._buildField(this.noiseSeed + attempt * 13.7);
      let loops = this._marchingSquares();
      let big = loops.sort((a, b) => b.length - a.length)[0];
      if (big && (!best || big.length > best.loop.length)) {
        best = { loop: big, seed: this.noiseSeed + attempt * 13.7 };
      }
    }
    this._buildField(best.seed);
    this.buildDepthGrid();
    this.points = best.loop;

    // resample boundary so vertex spacing is roughly uniform — coarser than
    // the marching squares step to keep polygon vertex count reasonable
    this.points = this._resample(this.points, 22);

    // centroid for radial layering, edge sampling, etc.
    let sx = 0, sy = 0;
    for (let p of this.points) { sx += p.x; sy += p.y; }
    this.cx = sx / this.points.length;
    this.cy = sy / this.points.length;
    this.baseR = 0;
    for (let p of this.points) {
      this.baseR = max(this.baseR, dist(this.cx, this.cy, p.x, p.y));
    }

    // Pre-bake static shore particles so they don't flicker every frame.
    let areaScale = (this.w * this.h) / (1200 * 800);
    this.dirtSpecks = [];
    for (let i = 0; i < 1500 * areaScale; i++) {
      let x = random(this.w);
      let y = random(this.h);
      if (!this.contains(x, y, -10)) {
        this.dirtSpecks.push({
          x, y,
          r: random(2, 6),
          c: [60 + random(-20, 30), 80 + random(-20, 20), 40 + random(-15, 25)]
        });
      }
    }
    this.sandSpecks = [];
    for (let i = 0; i < 2400; i++) {
      let idx = floor(random(this.points.length));
      let p = this.points[idx];
      let n = this._outwardAt(idx);
      let d = random(2, 28);
      this.sandSpecks.push({
        x: p.x + n.x * d,
        y: p.y + n.y * d,
        r: random(2, 5),
      });
    }
    this.shimmerPoints = [];
    for (let i = 0; i < 220; i++) {
      let p = this.randomInteriorPoint();
      this.shimmerPoints.push(p);
    }

    // Global wind direction for the lake — wavelets drift in this direction.
    this.windAngle = random(TWO_PI);

    // Wavelet streaks — sun glints on wavelet crests, oriented into the wind.
    // Density is tuned so a viewport shows just a handful of subtle highlights.
    this.wavelets = [];
    let waveCount = 6500;
    for (let i = 0; i < waveCount; i++) {
      let p = this.randomInteriorPoint();
      this.wavelets.push({
        x: p.x, y: p.y,
        a: this.windAngle + random(-0.25, 0.25),
        len: random(10, 22),
        seed: random(1000),
      });
    }

    // Caustic spots — slowly pulsing brighter circles, light flickering through ripples.
    this.caustics = [];
    let causticCount = 2200;
    for (let i = 0; i < causticCount; i++) {
      let p = this.randomInteriorPoint();
      this.caustics.push({
        x: p.x, y: p.y,
        seed: random(1000),
        size: random(14, 30),
      });
    }

    // Pre-baked surface color variation. We generate patches and rasterize them
    // into a single downscaled texture; rendering blits this once instead of
    // drawing thousands of overlapping ellipses each frame, and the upscale
    // interpolation naturally blends adjacent patches into smooth gradients.
    this.surfacePatches = [];
    let patchSeed = random(1000);
    let patchCount = floor(180 * areaScale);
    for (let i = 0; i < patchCount; i++) {
      let p = this.randomInteriorPoint();
      let n = noise(p.x * 0.0008 + patchSeed, p.y * 0.0008 + patchSeed);
      let m = noise(p.x * 0.003 + patchSeed * 2, p.y * 0.003 + patchSeed * 2);
      // mix between dark olive scum, brighter teal patch, and brownish tannin
      let pal = lvl().palette;
      let kind = n;
      let r, g, b, a;
      if (kind < 0.4) {
        r = pal.patchAlgae[0]; g = pal.patchAlgae[1]; b = pal.patchAlgae[2];
        a = 120 * m + 30;
      } else if (kind < 0.7) {
        r = pal.patchTeal[0]; g = pal.patchTeal[1]; b = pal.patchTeal[2];
        a = 90 * m + 30;
      } else {
        r = pal.patchTannin[0]; g = pal.patchTannin[1]; b = pal.patchTannin[2];
        a = 100 * m + 25;
      }
      this.surfacePatches.push({
        x: p.x, y: p.y,
        r: random(150, 380),
        aspect: random(0.6, 1.4),
        c: [r, g, b], a,
      });
    }

  }

  _pickBasins() {
    // Basins overlap heavily so the lake reads as one connected body of water
    // (with three deeper zones) rather than three separate ponds with land
    // in the middle.
    let cx = this.w / 2, cy = this.h / 2;
    let R = min(this.w, this.h) * 0.20;
    let spacing = min(this.w, this.h) * 0.16;
    return [
      { x: cx - spacing * 0.85 + random(-80, 80), y: cy - spacing * 0.6 + random(-80, 80), r: R * random(0.95, 1.25) },
      { x: cx + spacing * 0.95 + random(-80, 80), y: cy - spacing * 0.4 + random(-80, 80), r: R * random(0.85, 1.10) },
      { x: cx + random(-80, 80),                  y: cy + spacing * 0.85 + random(-80, 80), r: R * random(1.00, 1.30) },
    ];
  }

  _connectBasins() {
    // narrow channels between adjacent basins. Skip the longest pair so the
    // shape feels less like a filled triangle and more like a chain.
    let pairs = [];
    for (let i = 0; i < this.basins.length; i++) {
      for (let j = i + 1; j < this.basins.length; j++) {
        let a = this.basins[i], b = this.basins[j];
        pairs.push({ a, b, d: dist(a.x, a.y, b.x, b.y) });
      }
    }
    pairs.sort((x, y) => x.d - y.d);
    // Generate meandering river paths between basins via midpoint displacement,
    // so channels curve naturally instead of being straight lines.
    return pairs.map((p, i) => {
      let isBack = i === pairs.length - 1;
      let path = this._meanderingPath(p.a, p.b, isBack ? 0.18 : 0.22, 4);
      let segments = [];
      for (let k = 0; k < path.length - 1; k++) {
        segments.push({ a: path[k], b: path[k + 1] });
      }
      return {
        a: p.a, b: p.b, path, segments,
        w: isBack ? random(70, 95) : random(110, 150),
        boost: isBack ? random(0.80, 0.88) : random(0.90, 0.97),
      };
    });
  }

  _meanderingPath(a, b, amplitude, iterations) {
    // recursive midpoint displacement perpendicular to the segment
    let pts = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    for (let iter = 0; iter < iterations; iter++) {
      let next = [pts[0]];
      let scale = pow(0.55, iter); // each iteration uses smaller offsets
      for (let i = 0; i < pts.length - 1; i++) {
        let p1 = pts[i], p2 = pts[i + 1];
        let mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        let segLen = dist(p1.x, p1.y, p2.x, p2.y);
        // perpendicular unit vector
        let nx = -(p2.y - p1.y) / segLen;
        let ny =  (p2.x - p1.x) / segLen;
        let off = random(-segLen * amplitude * scale, segLen * amplitude * scale);
        next.push({ x: mx + nx * off, y: my + ny * off });
        next.push(p2);
      }
      pts = next;
    }
    return pts;
  }

  _closestOnSegment(x, y, a, b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    let len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) return { x: a.x, y: a.y };
    let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = constrain(t, 0, 1);
    return { x: a.x + t * dx, y: a.y + t * dy };
  }

  _buildField(seed) {
    this.field = [];
    for (let i = 0; i <= this.cols; i++) {
      this.field[i] = [];
      let x = i * this.gridSize;
      for (let j = 0; j <= this.rows; j++) {
        let y = j * this.gridSize;
        // basins contribute additively so overlapping basins stay water in
        // between (instead of leaving a central land mass at the centroid)
        let bias = 0;
        for (let b of this.basins) {
          let d = dist(x, y, b.x, b.y);
          let v = 1 - constrain(d / b.r, 0, 1);
          bias += v;                       // linear, additive
        }
        bias = Math.min(bias, 1.0);         // cap at 1 so peaks don't blow out
        // channels still use max (they're thin connecting features)
        for (let c of this.channels) {
          let minD = Infinity;
          for (let s of c.segments) {
            let p = this._closestOnSegment(x, y, s.a, s.b);
            let d = dist(x, y, p.x, p.y);
            if (d < minD) minD = d;
          }
          let v = 1 - constrain(minD / c.w, 0, 1);
          bias = max(bias, pow(v, 1.4) * c.boost);
        }
        // multi-octave noise for ragged shorelines
        let n =
          noise(x * 0.0014 + seed,        y * 0.0014 + seed) * 0.6 +
          noise(x * 0.0035 + seed * 1.7,  y * 0.0035 + seed * 1.7) * 0.3 +
          noise(x * 0.0080 + seed * 2.3,  y * 0.0080 + seed * 2.3) * 0.1;
        // edge wall — force "outside" along world borders
        let edgeDist = min(x, y, this.w - x, this.h - y);
        let edge = constrain(edgeDist / 100, 0, 1);
        let val = (n * 0.45 + bias * 0.75) * edge;
        this.field[i][j] = val;
      }
    }
  }

  // Pre-compute a coarse grid of depth values once at construction. depthAt()
  // becomes a cheap bilinear lookup per fish, instead of iterating basins +
  // every channel segment every call (was ~50 ops per call × 230 fish/frame).
  buildDepthGrid() {
    this.depthGrid = [];
    for (let i = 0; i <= this.cols; i++) {
      this.depthGrid[i] = [];
      for (let j = 0; j <= this.rows; j++) {
        let x = i * this.gridSize, y = j * this.gridSize;
        this.depthGrid[i][j] = this._depthAtRaw(x, y);
      }
    }
  }

  _depthAtRaw(x, y) {
    if (!this.contains(x, y)) return 0;
    let d = 0;
    for (let b of this.basins) {
      let dd = dist(x, y, b.x, b.y);
      let v = 1 - constrain(dd / (b.r * 1.05), 0, 1);
      d = max(d, v);
    }
    for (let c of this.channels) {
      let minD = Infinity;
      for (let s of c.segments) {
        let p = this._closestOnSegment(x, y, s.a, s.b);
        let dd = dist(x, y, p.x, p.y);
        if (dd < minD) minD = dd;
      }
      let v = 1 - constrain(minD / c.w, 0, 1);
      d = max(d, v * 0.55);
    }
    return d;
  }

  depthAt(x, y) {
    let i = x / this.gridSize;
    let j = y / this.gridSize;
    let i0 = Math.floor(i), j0 = Math.floor(j);
    if (i0 < 0 || j0 < 0 || i0 >= this.cols || j0 >= this.rows) return 0;
    let fx = i - i0, fy = j - j0;
    let v00 = this.depthGrid[i0][j0];
    let v10 = this.depthGrid[i0 + 1][j0];
    let v01 = this.depthGrid[i0][j0 + 1];
    let v11 = this.depthGrid[i0 + 1][j0 + 1];
    return v00 * (1 - fx) * (1 - fy)
         + v10 * fx       * (1 - fy)
         + v01 * (1 - fx) * fy
         + v11 * fx       * fy;
  }

  fieldAt(x, y) {
    let i = x / this.gridSize;
    let j = y / this.gridSize;
    let i0 = floor(i), j0 = floor(j);
    if (i0 < 0 || j0 < 0 || i0 >= this.cols || j0 >= this.rows) return 0;
    let i1 = i0 + 1, j1 = j0 + 1;
    let fx = i - i0, fy = j - j0;
    let v00 = this.field[i0][j0];
    let v10 = this.field[i1][j0];
    let v01 = this.field[i0][j1];
    let v11 = this.field[i1][j1];
    return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
  }

  _marchingSquares() {
    let segs = [];
    let t = this.threshold;
    let g = this.gridSize;
    let lerpEdge = (vA, vB, ax, ay, bx, by) => {
      let f = (t - vA) / (vB - vA);
      return { x: ax + f * (bx - ax), y: ay + f * (by - ay) };
    };
    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        let v00 = this.field[i][j];
        let v10 = this.field[i + 1][j];
        let v11 = this.field[i + 1][j + 1];
        let v01 = this.field[i][j + 1];
        let idx = 0;
        if (v00 > t) idx |= 1;
        if (v10 > t) idx |= 2;
        if (v11 > t) idx |= 4;
        if (v01 > t) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        let x0 = i * g, x1 = (i + 1) * g;
        let y0 = j * g, y1 = (j + 1) * g;
        let top    = () => lerpEdge(v00, v10, x0, y0, x1, y0);
        let right  = () => lerpEdge(v10, v11, x1, y0, x1, y1);
        let bottom = () => lerpEdge(v11, v01, x1, y1, x0, y1);
        let left   = () => lerpEdge(v01, v00, x0, y1, x0, y0);
        // segments oriented so inside (filled side) is to the LEFT of the segment direction
        switch (idx) {
          case 1:  segs.push([left(),   top()]);    break;
          case 2:  segs.push([top(),    right()]);  break;
          case 3:  segs.push([left(),   right()]);  break;
          case 4:  segs.push([right(),  bottom()]); break;
          case 5:  segs.push([left(),   top()]);    segs.push([right(), bottom()]); break;
          case 6:  segs.push([top(),    bottom()]); break;
          case 7:  segs.push([left(),   bottom()]); break;
          case 8:  segs.push([bottom(), left()]);   break;
          case 9:  segs.push([bottom(), top()]);    break;
          case 10: segs.push([top(),    left()]);   segs.push([bottom(), right()]); break;
          case 11: segs.push([bottom(), right()]);  break;
          case 12: segs.push([right(),  left()]);   break;
          case 13: segs.push([right(),  top()]);    break;
          case 14: segs.push([top(),    left()]);   break;
        }
      }
    }
    return this._stitch(segs);
  }

  _stitch(segs) {
    let key = (p) => `${round(p.x * 4)},${round(p.y * 4)}`;
    let byStart = new Map();
    for (let i = 0; i < segs.length; i++) {
      let k = key(segs[i][0]);
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(i);
    }
    let used = new Array(segs.length).fill(false);
    let loops = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      let loop = [];
      let cur = i;
      let startKey = key(segs[i][0]);
      let safety = 0;
      while (cur !== -1 && !used[cur] && safety++ < segs.length + 5) {
        used[cur] = true;
        let s = segs[cur];
        loop.push({ x: s[0].x, y: s[0].y });
        let endKey = key(s[1]);
        if (endKey === startKey && loop.length > 3) break;
        let nexts = byStart.get(endKey);
        cur = -1;
        if (nexts) {
          for (let n of nexts) {
            if (!used[n]) { cur = n; break; }
          }
        }
      }
      if (loop.length > 8) loops.push(loop);
    }
    return loops;
  }

  _resample(loop, spacing) {
    if (loop.length < 3) return loop;
    let out = [];
    let acc = 0;
    out.push(loop[0]);
    for (let i = 0; i < loop.length; i++) {
      let a = loop[i];
      let b = loop[(i + 1) % loop.length];
      let d = dist(a.x, a.y, b.x, b.y);
      acc += d;
      while (acc >= spacing) {
        acc -= spacing;
        let t = 1 - acc / d;
        out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      }
    }
    return out;
  }

  _outwardAt(idx) {
    let p = this.points[idx];
    let inward = this.inwardNormal(p.x, p.y);
    return { x: -inward.x, y: -inward.y };
  }

  // Approximate signed distance to shore (positive inside) in pixels.
  insideAmount(x, y) {
    let f = this.fieldAt(x, y) - this.threshold;
    let eps = 4;
    let gx = (this.fieldAt(x + eps, y) - this.fieldAt(x - eps, y)) / (2 * eps);
    let gy = (this.fieldAt(x, y + eps) - this.fieldAt(x, y - eps)) / (2 * eps);
    let g = sqrt(gx * gx + gy * gy);
    if (g < 1e-6) return f * 1000;
    return f / g;
  }

  contains(x, y, margin = 0) {
    return this.insideAmount(x, y) > margin;
  }

  inwardNormal(x, y) {
    let eps = 4;
    let dx = this.fieldAt(x + eps, y) - this.fieldAt(x - eps, y);
    let dy = this.fieldAt(x, y + eps) - this.fieldAt(x, y - eps);
    let v = createVector(dx, dy);
    if (v.mag() < 1e-6) v = createVector(this.cx - x, this.cy - y);
    v.normalize();
    return v;
  }

  randomInteriorPoint() {
    for (let i = 0; i < 300; i++) {
      let x = random(this.w);
      let y = random(this.h);
      if (this.contains(x, y, 40)) return { x, y };
    }
    return { x: this.cx, y: this.cy };
  }

  // Pick a point near the shoreline. t=1 → right at the boundary,
  // smaller t → walk inward by (1-t)*300 px along the local inward normal.
  // Always validated against the lake field so we never return a point on land
  // (the old centroid-lerp method was broken for multi-basin lakes whose
  //  centroid lay on land between basins).
  randomEdgePoint(t = 0.92) {
    let walkDist = (1 - t) * 300;
    for (let attempts = 0; attempts < 30; attempts++) {
      let idx = floor(random(this.points.length));
      let p = this.points[idx];
      let inward = this.inwardNormal(p.x, p.y);
      let x = p.x + inward.x * walkDist;
      let y = p.y + inward.y * walkDist;
      if (walkDist < 0 || this.contains(x, y, 0)) return { x, y };
    }
    return this.randomInteriorPoint();
  }

  drawBackground() {
    let pal = lvl().palette;
    background(pal.forest[0], pal.forest[1], pal.forest[2]);
    if (zoom < 0.5) return;
    noStroke();
    for (let s of this.dirtSpecks) {
      if (!inView(s.x, s.y, 10)) continue;
      fill(s.c[0], s.c[1], s.c[2], 180);
      ellipse(s.x, s.y, s.r);
    }
    for (let s of this.sandSpecks) {
      if (!inView(s.x, s.y, 10)) continue;
      fill(pal.sand[0], pal.sand[1], pal.sand[2], 140);
      ellipse(s.x, s.y, s.r);
    }
  }

  // Lightweight per-frame water effects layered on top of the pre-baked static
  // image. No clip path — wavelets/caustics positions came from
  // randomInteriorPoint() so they're already inside the lake polygon.
  drawWaterEffects() {
    if (zoom < 0.45) return;            // sub-pixel at low zoom; skip entirely
    // p5's default stroke is black-1px enabled; without this every caustic
    // got a thin dark outline that read as a black ring on dark green water.
    noStroke();
    let t = frameCount * 0.015;

    // Caustics — soft pulsing brighter circles
    for (let c of this.caustics) {
      if (!inView(c.x, c.y, c.size * 1.2)) continue;
      let n = noise(c.x * 0.0025, c.y * 0.0025, t * 0.3 + c.seed);
      if (n < 0.62) continue;
      let alpha = (n - 0.62) * 60;
      let drift = sin(t * 0.5 + c.seed * 6) * 3;
      fill(140, 195, 175, alpha);
      ellipse(c.x + drift, c.y - drift * 0.6, c.size * (0.7 + n * 0.5));
    }

    // Wavelet streak highlights — drifting downwind
    let windX = cos(this.windAngle), windY = sin(this.windAngle);
    strokeWeight(1.2);
    for (let w of this.wavelets) {
      if (!inView(w.x, w.y, w.len)) continue;
      let n = noise(w.x * 0.0035, w.y * 0.0035, t + w.seed * 0.5);
      if (n < 0.66) continue;
      let alpha = (n - 0.66) * 200;
      let driftMag = (t * 10 + w.seed * 30) % 60;
      let dx = windX * driftMag - windX * 30;
      let dy = windY * driftMag - windY * 30;
      let lx = w.x + dx, ly = w.y + dy;
      stroke(180, 215, 200, alpha);
      let edx = cos(w.a) * w.len * 0.5;
      let edy = sin(w.a) * w.len * 0.5;
      line(lx - edx, ly - edy, lx + edx, ly + edy);
    }
    noStroke();

    // Surface motes — algae specks on bass lake, glittering droplets on alpine
    let mp = lvl().palette.ambient;
    for (let p of this.shimmerPoints) {
      if (!inView(p.x, p.y, 12)) continue;
      let a = noise(p.x * 0.01, p.y * 0.01, frameCount * 0.008);
      fill(mp[0], mp[1], mp[2], a * 35);
      ellipse(p.x, p.y, 4 + a * 6, 2 + a * 3);
    }
  }
}

// ---------- FISH species config ----------
// Each species also has a `class` field: 'panfish' (uses boid flocking) or
// 'bass' (uses lurker/strike AI). That picks which constructor and which
// global array it lives in.
const SPECIES = {
  bluegill: {
    class: 'panfish',
    sizeRange: [9, 12],
    bodyAspect: 0.62,
    maxSpeed: 1.05,
    maxForce: 0.028,
    sepR: 14, neighR: 60, fleeR: 100,
    sepW: 1.5, aliW: 1.1, cohW: 1.2, fleeW: 2.6,
    habitat: 'weeds',
    habitatW: 0.04,
    depthBias: -0.0006,
    schoolWith: 'bluegill',
    depthAlpha: 215,
    zRange: [0.15, 0.50],
  },
  pumpkinseed: {
    class: 'panfish',
    sizeRange: [9, 12],
    bodyAspect: 0.65,
    maxSpeed: 0.85,
    maxForce: 0.022,
    sepR: 18, neighR: 42, fleeR: 95,
    sepW: 1.6, aliW: 0.7, cohW: 0.7, fleeW: 2.4,
    habitat: 'lilypads',
    habitatW: 0.05,
    depthBias: -0.0004,
    schoolWith: 'pumpkinseed',
    depthAlpha: 205,
    zRange: [0.05, 0.30],     // surface-loving — closest to the top
  },
  crappie: {
    class: 'panfish',
    sizeRange: [11, 14],
    bodyAspect: 0.5,
    maxSpeed: 1.15,
    maxForce: 0.032,
    sepR: 13, neighR: 75, fleeR: 110,
    sepW: 1.4, aliW: 1.6, cohW: 1.6, fleeW: 3.0,
    habitat: 'logs',
    habitatW: 0.025,
    depthBias: 0.0008,
    schoolWith: 'crappie',
    depthAlpha: 230,
    zRange: [0.40, 0.70],
  },
  bass: {
    class: 'bass',
  },
  // ---- ALPINE LAKE TROUT ----
  rainbowTrout: {
    class: 'panfish',
    spooky: true,                                   // skittish — bigger avoid radius, splash-spooks
    sizeRange: [11, 14],
    bodyAspect: 0.42,
    maxSpeed: 1.35,
    maxForce: 0.034,
    sepR: 16, neighR: 50, fleeR: 110,
    sepW: 1.4, aliW: 0.9, cohW: 0.8, fleeW: 2.6,
    habitat: 'weeds',
    habitatW: 0.02,
    depthBias: 0,
    schoolWith: 'rainbowTrout',
    depthAlpha: 210,
    zRange: [0.10, 0.45],
  },
  brookTrout: {
    class: 'panfish',
    spooky: true,
    sizeRange: [9, 12],
    bodyAspect: 0.4,
    maxSpeed: 1.1,
    maxForce: 0.030,
    sepR: 18, neighR: 38, fleeR: 90,
    sepW: 1.6, aliW: 0.6, cohW: 0.5, fleeW: 2.4,
    habitat: 'rocks',
    habitatW: 0.03,
    depthBias: -0.0005,
    schoolWith: 'brookTrout',
    depthAlpha: 215,
    zRange: [0.05, 0.35],
  },
  cutthroatTrout: {
    class: 'bass',
    spooky: true,
  },

  // ---- BASS LAKE additions (Phase 7) ----
  yellowPerch: {
    class: 'panfish',
    sizeRange: [7, 11],
    bodyAspect: 0.45,
    maxSpeed: 1.0, maxForce: 0.026,
    sepR: 14, neighR: 60, fleeR: 100,
    sepW: 1.5, aliW: 1.3, cohW: 1.4, fleeW: 2.6,
    habitat: 'weeds', habitatW: 0.04,
    depthBias: 0.0006,
    schoolWith: 'yellowPerch',
    depthAlpha: 220,
    zRange: [0.30, 0.60],
  },
  greenSunfish: {
    class: 'panfish',
    sizeRange: [6, 9],
    bodyAspect: 0.62,
    maxSpeed: 0.95, maxForce: 0.024,
    sepR: 16, neighR: 45, fleeR: 90,
    sepW: 1.5, aliW: 0.8, cohW: 0.9, fleeW: 2.4,
    habitat: 'weeds', habitatW: 0.05,
    depthBias: -0.0002,
    schoolWith: 'greenSunfish',
    depthAlpha: 210,
    zRange: [0.10, 0.35],
  },
  redbreastSunfish: {
    class: 'panfish',
    sizeRange: [8, 11],
    bodyAspect: 0.60,
    maxSpeed: 1.0, maxForce: 0.026,
    sepR: 17, neighR: 50, fleeR: 95,
    sepW: 1.5, aliW: 0.9, cohW: 1.0, fleeW: 2.5,
    habitat: 'logs', habitatW: 0.04,
    depthBias: 0,
    schoolWith: 'redbreastSunfish',
    depthAlpha: 215,
    zRange: [0.10, 0.40],
  },
  spottedSunfish: {
    class: 'panfish',
    sizeRange: [6, 9],
    bodyAspect: 0.64,
    maxSpeed: 0.9, maxForce: 0.022,
    sepR: 16, neighR: 42, fleeR: 90,
    sepW: 1.5, aliW: 0.8, cohW: 0.9, fleeW: 2.3,
    habitat: 'lilypads', habitatW: 0.05,
    depthBias: 0,
    schoolWith: 'spottedSunfish',
    depthAlpha: 215,
    zRange: [0.10, 0.35],
  },
  // Bass-class predators with custom size ranges (the Bass class reads
  // sizeRange from cfg if present, falls back to [20, 28]).
  smallmouthBass: {
    class: 'bass',
    sizeRange: [16, 22],
    strikeRange: [80, 110],
    scareR: 110,             // school panic radius when smallmouth strikes
  },
  chainPickerel: {
    class: 'bass',
    sizeRange: [22, 30],
    bodyAspect: 0.28,        // long and lean
    strikeRange: [100, 140], // ambush from farther — like a thrown spear
    scareR: 150,
    cooldownBase: 420,       // sits motionless longer between strikes
    cooldownJitter: 540,
  },
  northernPike: {
    class: 'bass',
    sizeRange: [28, 40],
    bodyAspect: 0.26,        // huge apex predator
    strikeRange: [120, 170],
    scareR: 240,             // a pike strike scatters everything nearby
    cooldownBase: 600,
    cooldownJitter: 720,
  },

  // ---- ALPINE LAKE addition (Phase 7) ----
  brownTrout: {
    class: 'panfish',
    spooky: true,
    sizeRange: [12, 17],
    bodyAspect: 0.40,
    maxSpeed: 1.2, maxForce: 0.030,
    sepR: 22, neighR: 30, fleeR: 130,    // adult browns are wary loners
    sepW: 1.8, aliW: 0.4, cohW: 0.3, fleeW: 3.0,
    habitat: 'logs', habitatW: 0.04,
    depthBias: 0.0006,
    schoolWith: null,                    // solitary
    depthAlpha: 220,
    zRange: [0.30, 0.70],
  },
};

// ---------- PANFISH (boids) ----------
class Panfish {
  constructor(x, y, species) {
    this.species = species || 'bluegill';
    this.cfg = SPECIES[this.species];
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(random(0.5, 1.0));
    this.acc = createVector();
    this.maxSpeed = this.cfg.maxSpeed;
    this.maxForce = this.cfg.maxForce;
    this.size = random(this.cfg.sizeRange[0], this.cfg.sizeRange[1]);
    this.dead = false;
    this.hooked = false;
    this.wiggle = random(TWO_PI);
    this.habitatTarget = null;
    this.habitatPhase = floor(random(600));
    this._pickHabitat();
    // vertical depth: 0 = surface, 1 = bottom (relative to local lake depth)
    this.z = random(this.cfg.zRange[0], this.cfg.zRange[1]);
    this.zSeed = random(1000);
  }

  _pickHabitat() {
    let pool = null;
    if (this.cfg.habitat === 'weeds') pool = weeds;
    else if (this.cfg.habitat === 'lilypads') pool = lilypads;
    else if (this.cfg.habitat === 'logs') pool = logs;
    if (pool && pool.length > 0) this.habitatTarget = random(pool);
  }

  flock(panfishHash, hashCell, bass) {
    let cfg = this.cfg;

    // ---- KAYAK AVOIDANCE ----
    // All fish flee from the kayak. Spooky species (trout) have a bigger
    // avoidance radius and react sooner. Very close = full spook (sprint
    // away, dive deep, won't bite for a few seconds). Beyond that, fish add
    // a gentle flee force into their flock acceleration.
    let avoidR = cfg.spooky ? 130 : 75;
    let panicR = cfg.spooky ? 45 : 28;
    let kdx = this.pos.x - player.pos.x;
    let kdy = this.pos.y - player.pos.y;
    let kd2 = kdx * kdx + kdy * kdy;
    if (kd2 < panicR * panicR) {
      this.spookedUntil = frameCount + (cfg.spooky ? 200 : 120);
      this.spookFromX = player.pos.x;
      this.spookFromY = player.pos.y;
    }

    // Predator scatter — a striking pike/pickerel sends nearby schools
    // bolting. Each bass-class predator with `scareR` triggers a spook on
    // panfish in radius while it's dashing.
    for (let b of bass) {
      if (!b.dashing || !b.scareR) continue;
      let bdx = this.pos.x - b.pos.x;
      let bdy = this.pos.y - b.pos.y;
      let bd2 = bdx * bdx + bdy * bdy;
      if (bd2 < b.scareR * b.scareR) {
        // Bigger predator -> longer panic, same flee direction maths as kayak
        this.spookedUntil = Math.max(this.spookedUntil || 0, frameCount + 140);
        this.spookFromX = b.pos.x;
        this.spookFromY = b.pos.y;
        break;
      }
    }

    // SPOOK: if recently startled, sprint away from the disturbance and
    // skip normal flocking + bite eligibility for a few seconds.
    if (this.spookedUntil && frameCount < this.spookedUntil) {
      let dx = this.pos.x - (this.spookFromX || this.pos.x);
      let dy = this.pos.y - (this.spookFromY || this.pos.y);
      let d = Math.hypot(dx, dy) || 1;
      let burst = Math.max(0, (this.spookedUntil - frameCount) / 240);
      let speed = this.maxSpeed * (1.0 + burst * 1.2);
      this.vel.x = (dx / d) * speed;
      this.vel.y = (dy / d) * speed;
      this.z = Math.min(0.6, this.z + 0.01);
      this.wiggle += 0.4;
      return;
    }

    // Soft kayak-avoid force when within avoidR but not panicked
    if (kd2 < avoidR * avoidR) {
      let kd = Math.sqrt(kd2) || 1;
      let strength = (avoidR - kd) / avoidR;     // 0..1
      let away = createVector(kdx / kd, kdy / kd).mult(this.maxSpeed * 1.4);
      away.sub(this.vel).limit(this.maxForce * 4 * strength);
      this.acc.add(away);
    }
    let sep = createVector();
    let ali = createVector();
    let coh = createVector();
    let flee = createVector();
    let sepCount = 0, aliCount = 0, cohCount = 0, fleeCount = 0;

    // Spatial-hash neighbor query: only check own cell + 8 surrounding.
    let kx = Math.floor(this.pos.x / hashCell);
    let ky = Math.floor(this.pos.y / hashCell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        let bucket = panfishHash.get((kx + dx) + ',' + (ky + dy));
        if (!bucket) continue;
        for (let other of bucket) {
          if (other === this) continue;
          let ox = other.pos.x - this.pos.x;
          let oy = other.pos.y - this.pos.y;
          let d2 = ox * ox + oy * oy;
          if (d2 < cfg.sepR * cfg.sepR) {
            let d = Math.sqrt(d2) || 1;
            let diff = p5.Vector.sub(this.pos, other.pos).div(d);
            sep.add(diff); sepCount++;
          }
          if (d2 < cfg.neighR * cfg.neighR && other.species === cfg.schoolWith) {
            ali.add(other.vel); aliCount++;
            coh.add(other.pos); cohCount++;
          }
        }
      }
    }

    for (let b of bass) {
      let d = p5.Vector.dist(this.pos, b.pos);
      if (d < cfg.fleeR) {
        let diff = p5.Vector.sub(this.pos, b.pos).div(d || 1);
        flee.add(diff); fleeCount++;
        if (d < b.size * 0.6 && b.dashing) {
          this.dead = true;
          for (let i = 0; i < 4; i++) bubbles.push(new Bubble(this.pos.x, this.pos.y));
          ripples.push(new Ripple(this.pos.x, this.pos.y, 30));
        }
      }
    }

    if (sepCount > 0) sep.div(sepCount).setMag(this.maxSpeed).sub(this.vel).limit(this.maxForce * 1.6);
    if (aliCount > 0) ali.div(aliCount).setMag(this.maxSpeed).sub(this.vel).limit(this.maxForce);
    if (cohCount > 0) {
      coh.div(cohCount).sub(this.pos).setMag(this.maxSpeed).sub(this.vel).limit(this.maxForce);
    }
    if (fleeCount > 0) flee.setMag(this.maxSpeed * 1.4).sub(this.vel).limit(this.maxForce * 3);

    this.acc.add(sep.mult(cfg.sepW));
    this.acc.add(ali.mult(cfg.aliW));
    this.acc.add(coh.mult(cfg.cohW));
    this.acc.add(flee.mult(cfg.fleeW));

    // habitat attraction — gentle pull toward a preferred structure
    if ((frameCount + this.habitatPhase) % 600 === 0) this._pickHabitat();
    if (this.habitatTarget) {
      let to = createVector(this.habitatTarget.x - this.pos.x, this.habitatTarget.y - this.pos.y);
      let d = to.mag();
      if (d > 30) {
        to.setMag(this.maxSpeed * 0.7);
        to.sub(this.vel).limit(this.maxForce);
        this.acc.add(to.mult(cfg.habitatW * 30));
      }
    }

    // depth preference — crappie pull deeper, sunfish toward shore
    let inAmt = lake.insideAmount(this.pos.x, this.pos.y);
    if (cfg.depthBias !== 0) {
      let inward = lake.inwardNormal(this.pos.x, this.pos.y);
      this.acc.add(inward.copy().mult(cfg.depthBias * 30));
    }

    // boundary push
    if (inAmt < 60) {
      let t = constrain(map(inAmt, 60, -10, 0, 1), 0, 1);
      let strength = lerp(this.maxForce * 2, this.maxForce * 30, t);
      let inward = lake.inwardNormal(this.pos.x, this.pos.y);
      this.acc.add(inward.copy().mult(strength));
      if (inAmt < 5) {
        let dot = this.vel.dot(inward);
        if (dot < 0) this.vel.sub(inward.copy().mult(dot * 0.5));
      }
      if (inAmt < 0) {
        this.pos.add(inward.copy().mult(-inAmt + 1));
      }
    }

    // gentle noise wander
    let n = noise(this.pos.x * 0.003, this.pos.y * 0.003, frameCount * 0.004);
    this.acc.add(p5.Vector.fromAngle(n * TWO_PI * 2).mult(0.008));
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.vel.mult(0.985);
    this.pos.add(this.vel);
    this.acc.mult(0);
    this.wiggle += 0.18 + this.vel.mag() * 0.15;

    // vertical drift — pick a target z from preferred band, can't exceed local lake depth
    let pref = lerp(this.cfg.zRange[0], this.cfg.zRange[1],
                    noise(this.zSeed, frameCount * 0.004));
    let localMax = lake.depthAt(this.pos.x, this.pos.y);
    let target = pref * max(0.05, localMax);
    this.z += (target - this.z) * 0.012;
  }

  draw() {
    // Top-down view through the water surface: fish are only visible if they
    // are near the surface. Below the visibility threshold they're completely
    // invisible — the player has to read ripples and wakes instead.
    const SURFACE_Z = 0.18;
    if (this.z >= SURFACE_Z) return;
    let surfaceVis = pow(1 - this.z / SURFACE_Z, 2);  // 1 at z=0, 0 at z=SURFACE_Z

    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    let s = this.size;
    let aspect = this.cfg.bodyAspect;
    let tailW = sin(this.wiggle) * 0.4;
    let baseShadow = 80 * surfaceVis;

    noStroke();
    fill(0, 10, 18, baseShadow);
    ellipse(0, 0, s * 2.0, s * 0.95 * aspect / 0.62);
    fill(0, 6, 14, baseShadow * 0.85);
    ellipse(0, 0, s * 1.45, s * 0.68 * aspect / 0.62);
    push();
    translate(-s * 0.7, 0);
    rotate(tailW);
    fill(0, 10, 18, baseShadow * 0.7);
    triangle(0, 0, -s * 0.4, -s * 0.25, -s * 0.4, s * 0.25);
    pop();
    pop();
  }

  _drawBluegill(s, aspect, tailW) {
    let bw = s * 1.6, bh = s * 1.6 * aspect;
    fill(55, 75, 50);
    ellipse(0, 0, bw, bh);
    fill(35, 55, 45, 220);
    ellipse(-s * 0.05, 0, bw * 0.85, bh * 0.32);
    // faint vertical bars
    fill(30, 50, 40, 130);
    for (let i = -2; i <= 2; i++) {
      ellipse(i * bw * 0.18, 0, bw * 0.06, bh * 0.85);
    }
    // dark gill flap "ear" — signature bluegill mark
    fill(15, 25, 35);
    ellipse(s * 0.32, -bh * 0.42, s * 0.22, s * 0.16);
    ellipse(s * 0.32,  bh * 0.42, s * 0.22, s * 0.16);
    // hint of orange-yellow belly seeping past sides
    fill(230, 170, 80, 110);
    ellipse(-s * 0.1, 0, bw * 0.6, bh * 0.35);
    fill(50, 70, 48);
    push();
    translate(-bw * 0.45, 0);
    rotate(tailW);
    triangle(0, 0, -s * 0.45, -s * 0.32, -s * 0.45, s * 0.32);
    pop();
    fill(0);
    ellipse(s * 0.55, -bh * 0.28, s * 0.1);
    ellipse(s * 0.55,  bh * 0.28, s * 0.1);
  }

  _drawPumpkinseed(s, aspect, tailW) {
    let bw = s * 1.55, bh = s * 1.55 * aspect;
    fill(75, 110, 55);
    ellipse(0, 0, bw, bh);
    fill(50, 80, 45, 220);
    ellipse(-s * 0.05, 0, bw * 0.85, bh * 0.3);
    // bright orange flecks scattered across back
    fill(230, 110, 50);
    let flecks = [
      [-bw * 0.15, -bh * 0.15], [bw * 0.10, bh * 0.20], [-bw * 0.05, bh * 0.10],
      [bw * 0.20, -bh * 0.10],  [-bw * 0.25, bh * 0.05], [bw * 0.0, -bh * 0.25],
    ];
    for (let f of flecks) ellipse(f[0], f[1], s * 0.16, s * 0.16);
    // red gill cover spot — pumpkinseed signature
    fill(220, 60, 50);
    ellipse(s * 0.34, -bh * 0.38, s * 0.18, s * 0.14);
    ellipse(s * 0.34,  bh * 0.38, s * 0.18, s * 0.14);
    // wavy blue cheek hints
    fill(80, 130, 200, 180);
    ellipse(s * 0.42, -bh * 0.18, s * 0.12, s * 0.06);
    ellipse(s * 0.42,  bh * 0.18, s * 0.12, s * 0.06);
    fill(70, 100, 50);
    push();
    translate(-bw * 0.45, 0);
    rotate(tailW);
    triangle(0, 0, -s * 0.45, -s * 0.32, -s * 0.45, s * 0.32);
    fill(220, 130, 60, 200);
    triangle(-s * 0.3, -s * 0.22, -s * 0.45, -s * 0.32, -s * 0.45, s * 0.32);
    pop();
    fill(0);
    ellipse(s * 0.52, -bh * 0.28, s * 0.1);
    ellipse(s * 0.52,  bh * 0.28, s * 0.1);
  }

  _drawCrappie(s, aspect, tailW) {
    let bw = s * 1.85, bh = s * 1.85 * aspect;
    fill(140, 150, 145);
    ellipse(0, 0, bw, bh);
    fill(60, 75, 65, 230);
    ellipse(-s * 0.05, 0, bw * 0.85, bh * 0.32);
    // mottled black blotches characteristic of black crappie
    fill(30, 40, 35, 220);
    let blotches = [
      [-bw * 0.30, 0],          [-bw * 0.10, -bh * 0.18], [-bw * 0.10, bh * 0.18],
      [bw * 0.10, 0],           [bw * 0.25, -bh * 0.12],  [bw * 0.0, bh * 0.05],
      [-bw * 0.20, bh * 0.05],
    ];
    for (let b of blotches) ellipse(b[0], b[1], s * 0.22, s * 0.18);
    // long dorsal fin running down back
    fill(50, 65, 55, 200);
    ellipse(-s * 0.15, 0, bw * 0.6, bh * 0.18);
    fill(160, 170, 165);
    ellipse(s * 0.55, 0, bw * 0.55, bh * 0.85);
    fill(110, 120, 115);
    push();
    translate(-bw * 0.5, 0);
    rotate(tailW);
    triangle(0, -s * 0.05, -s * 0.5, -s * 0.4, -s * 0.5, s * 0.4);
    fill(80, 90, 85);
    triangle(-s * 0.1, 0, -s * 0.42, -s * 0.32, -s * 0.42, s * 0.32);
    pop();
    // larger eyes (crappie are night feeders)
    fill(255, 230, 130);
    ellipse(s * 0.62, -bh * 0.30, s * 0.16);
    ellipse(s * 0.62,  bh * 0.30, s * 0.16);
    fill(0);
    ellipse(s * 0.62, -bh * 0.30, s * 0.09);
    ellipse(s * 0.62,  bh * 0.30, s * 0.09);
  }
}

// ---------- BASS (lurker / darter) ----------
class Bass {
  constructor(x, y, species = 'bass') {
    this.pos = createVector(x, y);
    this.vel = createVector();
    this.acc = createVector();
    this.species = species;
    this.cfg = SPECIES[species] || {};
    // Each bass-class species can supply its own size range — smallmouth
    // are smaller, pike are huge.
    const sr = this.cfg.sizeRange || [20, 28];
    this.size = random(sr[0], sr[1]);
    this.bodyAspect = this.cfg.bodyAspect || 0.36;
    this.dashSpeed = 7.0;
    this.state = 'lurk';
    this.target = null;
    this.cooldown = 0;
    this.lurkPoint = this._pickLurkPoint();
    this.lurkHeading = random(TWO_PI);
    this.wiggle = random(TWO_PI);
    // Per-species strike range and scare radius (how far the dash scatters
    // panfish). Pike/pickerel reach farther and scare bigger schools.
    const stkRange = this.cfg.strikeRange || [70, 95];
    this.strikeRange = random(stkRange[0], stkRange[1]);
    this.scareR = this.cfg.scareR || 0;
    // Pickerel hold position longer between strikes; pike less so (they roam).
    this.cooldownBase = this.cfg.cooldownBase || 240;
    this.cooldownJitter = this.cfg.cooldownJitter || 360;
    this.hooked = false;
    // bass sit deep near the bottom, surge up when striking
    this.z = 0.85;
    this.zTarget = 0.85;
    this.zSeed = random(1000);
  }

  _pickLurkPoint() {
    // hold near the shoreline, in cover
    return lake.randomEdgePoint(random(0.8, 0.93));
  }

  update(panfish) {
    this.cooldown = max(0, this.cooldown - 1);

    // KAYAK AVOIDANCE — spooky bass (cutthroat trout) react at greater
    // distance. Plain bass have a small avoid radius (they're ambush
    // predators that tolerate boats more than trout).
    let cfg = SPECIES[this.species] || {};
    let avoidR = cfg.spooky ? 110 : 55;
    let panicR = cfg.spooky ? 40 : 24;
    let kdx = this.pos.x - player.pos.x;
    let kdy = this.pos.y - player.pos.y;
    let kd2 = kdx * kdx + kdy * kdy;
    if (kd2 < panicR * panicR) {
      this.spookedUntil = frameCount + (cfg.spooky ? 200 : 100);
      this.spookFromX = player.pos.x;
      this.spookFromY = player.pos.y;
    }

    // SPOOK — bolt away from a splash that landed too close
    if (this.spookedUntil && frameCount < this.spookedUntil) {
      let dx = this.pos.x - (this.spookFromX || this.pos.x);
      let dy = this.pos.y - (this.spookFromY || this.pos.y);
      let d = Math.hypot(dx, dy) || 1;
      let burst = Math.max(0, (this.spookedUntil - frameCount) / 240);
      let speed = this.dashSpeed * 0.45 * (1.0 + burst * 0.8);
      this.vel.x = (dx / d) * speed;
      this.vel.y = (dy / d) * speed;
      this.pos.add(this.vel);
      this.wiggle += 0.3;
      // dive deeper while fleeing
      this.z = Math.min(0.95, this.z + 0.015);
      // boundary push so they don't beach themselves
      let inAmt = lake.insideAmount(this.pos.x, this.pos.y);
      if (inAmt < 18) {
        let inward = lake.inwardNormal(this.pos.x, this.pos.y);
        this.pos.x += inward.x * 4;
        this.pos.y += inward.y * 4;
      }
      return;
    }

    if (this.state === 'lurk') {
      // sit nearly still — drift very slowly toward lurk point, sometimes change heading
      let to = createVector(this.lurkPoint.x - this.pos.x, this.lurkPoint.y - this.pos.y);
      let d = to.mag();
      if (d > 6) {
        to.setMag(0.18);
        this.vel.lerp(to, 0.015);
      } else {
        // hold still, very gentle sway
        this.vel.mult(0.85);
        if (random() < 0.003) this.lurkPoint = this._pickLurkPoint();
        // slow heading drift so they look "watching"
        this.lurkHeading += random(-0.02, 0.02);
        let drift = p5.Vector.fromAngle(this.lurkHeading).mult(0.05);
        this.vel.lerp(drift, 0.02);
      }

      // strike only when prey enters strike range AND cooldown expired
      if (this.cooldown === 0) {
        let prey = this._findPrey(panfish, this.strikeRange);
        if (prey) {
          this.target = prey;
          this.state = 'dash';
          this.dashFrames = 22;
          ripples.push(new Ripple(this.pos.x, this.pos.y, 26));
        }
      }
    } else if (this.state === 'dash') {
      if (!this.target || this.target.dead || this.dashFrames <= 0) {
        this.state = 'recover';
        this.recoverFrames = 26;
      } else {
        let to = p5.Vector.sub(this.target.pos, this.pos);
        to.setMag(this.dashSpeed);
        this.vel.lerp(to, 0.4);
        this.dashFrames--;
        if (frameCount % 3 === 0) bubbles.push(new Bubble(this.pos.x, this.pos.y));
      }
    } else if (this.state === 'recover') {
      this.vel.mult(0.9);
      this.recoverFrames--;
      if (this.recoverFrames <= 0) {
        this.state = 'lurk';
        this.cooldown = this.cooldownBase + floor(random(this.cooldownJitter));
        this.lurkPoint = this._pickLurkPoint();
        this.target = null;
      }
    }

    // boundary push
    let inAmt = lake.insideAmount(this.pos.x, this.pos.y);
    if (inAmt < 18) {
      let push = lake.inwardNormal(this.pos.x, this.pos.y).mult(0.6);
      this.vel.add(push);
    }

    // Soft kayak avoidance — outside of panic range, nudge velocity away
    // from the player. Spooky species (cutthroat trout) have a bigger reach.
    if (kd2 < avoidR * avoidR && kd2 > panicR * panicR && this.state !== 'dash') {
      let kd = Math.sqrt(kd2) || 1;
      let strength = (avoidR - kd) / avoidR;
      this.vel.x += (kdx / kd) * strength * 0.6;
      this.vel.y += (kdy / kd) * strength * 0.6;
    }

    this.pos.add(this.vel);
    this.wiggle += this.vel.mag() * 0.25 + (this.state === 'lurk' ? 0.02 : 0.05);

    // vertical depth — sit near bottom, surge to surface during dash so the
    // strike is visible to the player above.
    if (this.state === 'dash') this.zTarget = 0.05;
    else if (this.state === 'recover') this.zTarget = 0.55;
    else this.zTarget = lerp(0.75, 0.92, noise(this.zSeed, frameCount * 0.003));
    let localMax = lake.depthAt(this.pos.x, this.pos.y);
    let target = this.zTarget * max(0.05, localMax);
    this.z += (target - this.z) * (this.state === 'dash' ? 0.06 : 0.02);
  }

  get dashing() { return this.state === 'dash'; }

  _findPrey(panfish, range) {
    let best = null;
    let bestD = range;
    for (let p of panfish) {
      let d = p5.Vector.dist(this.pos, p.pos);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  draw() {
    // Bass are only visible from above when they surge near the surface during a
    // strike. Otherwise they're completely hidden below.
    const SURFACE_Z = 0.22;
    if (this.z >= SURFACE_Z) return;
    let surfaceVis = pow(1 - this.z / SURFACE_Z, 2);

    push();
    translate(this.pos.x, this.pos.y);
    let heading = this.vel.mag() > 0.01 ? this.vel.heading() : 0;
    rotate(heading);
    let s = this.size;
    let tailW = sin(this.wiggle) * (this.dashing ? 0.35 : 0.18);
    let baseA = 130 * surfaceVis;

    // Body aspect: pike/pickerel are much more elongated than bass.
    const aspect = this.bodyAspect || 0.36;
    noStroke();
    fill(0, 6, 14, baseA * 0.7);
    ellipse(0, 0, s * 2.6, s * 2.6 * aspect * 1.1);
    fill(0, 5, 12, baseA);
    ellipse(0, 0, s * 2.0, s * 2.0 * aspect);
    push();
    translate(-s * 0.85, 0);
    rotate(tailW);
    fill(0, 6, 14, baseA * 0.85);
    triangle(0, 0, -s * 0.55, -s * 0.55 * aspect * 1.3, -s * 0.55, s * 0.55 * aspect * 1.3);
    pop();
    pop();
  }
}

// ---------- KAYAK (player) ----------
class Kayak {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.heading = 0;
    this.targetHeading = 0;
    this.size = 22;                 // hull half-length-ish
    this.paddlePhase = 0;
    this.maxSpeed = KAYAK_BASE_SPEED * (KAYAK_SPEEDS[playerState.unlocks.kayak] || 1);
    this.acceleration = 0.22;
    this.friction = 0.93;
    this.wakeCooldown = 0;
    // Mobile joystick can set this to drive absolute-direction steering
    // instead of A/D turn + W/S paddle. { dx, dy, mag } in screen pixels.
    this.mobileAim = null;
  }

  update() {
    // Rotation-based controls: A/D turn the hull, W/S paddle along the heading.
    // This gives free, any-angle movement instead of 8-cardinal directions.
    const TURN_RATE = 0.045;   // radians/frame at full input
    const FORWARD_ACC = 0.22;
    const BACKWARD_ACC = 0.13;

    let turn = 0;
    let thrust = 0;

    if (this.mobileAim && this.mobileAim.mag > 0) {
      // Mobile mode: stick angle is the desired world-space heading, stick
      // magnitude is the throttle. The kayak rotates toward the stick angle
      // and paddles automatically — no separate "turn" then "forward" step.
      const target = Math.atan2(this.mobileAim.dy, this.mobileAim.dx);
      let diff = target - this.heading;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Turn rate proportional to angle error, clamped to ±1
      turn = Math.max(-1, Math.min(1, diff / 0.25));
      // Throttle scales with both stick magnitude AND how aligned we are with
      // the target — so the kayak pivots first then accelerates, which feels
      // natural and avoids drifting sideways at full speed.
      const alignment = (Math.cos(diff) + 1) * 0.5;   // 0..1
      thrust = this.mobileAim.mag * (0.3 + 0.7 * alignment);
    } else {
      // Keyboard/desktop: classic A/D turn + W/S paddle.
      if (keys.left)  turn -= 1;
      if (keys.right) turn += 1;
      if (keys.up)    thrust += 1;
      if (keys.down)  thrust -= 0.7;     // backpaddle is weaker
    }

    // turn rate scales slightly with speed so the kayak feels like it's
    // pivoting around the paddler, not on a dime
    let speedFactor = 0.6 + 0.4 * (1 - Math.min(this.vel.mag() / this.maxSpeed, 1));
    this.heading += turn * TURN_RATE * speedFactor;

    if (thrust !== 0) {
      let acc = thrust > 0 ? FORWARD_ACC : BACKWARD_ACC;
      this.vel.x += Math.cos(this.heading) * acc * thrust;
      this.vel.y += Math.sin(this.heading) * acc * thrust;
      let prev = this.paddlePhase;
      this.paddlePhase += 0.22 * Math.min(1, Math.abs(thrust));
      // sound: detect paddle-stroke beat — sin sign flip = side switch
      if (Math.sign(Math.sin(prev)) !== Math.sign(Math.sin(this.paddlePhase))) {
        playSound('paddle', { volume: 0.45, rate: 0.9 + Math.random() * 0.2 });
      }
    }
    this.targetHeading = this.heading;   // hull always faces its current heading

    // friction & cap
    this.vel.mult(this.friction);
    this.vel.limit(this.maxSpeed);

    // Wind drift — pushes the kayak continuously even when not paddling.
    // Scales with current wind strength; the boat slowly slides downwind.
    this.pos.x += wind.x * 0.18;
    this.pos.y += wind.y * 0.18;

    this.pos.add(this.vel);

    // Lake collision — soft push if hitting shore, can't enter land
    let inAmt = lake.insideAmount(this.pos.x, this.pos.y);
    if (inAmt < 22) {
      let inward = lake.inwardNormal(this.pos.x, this.pos.y);
      let penetration = max(0, 22 - inAmt);
      this.pos.x += inward.x * penetration;
      this.pos.y += inward.y * penetration;
      // bleed any outward-going velocity component (so we don't push into shore)
      let dot = this.vel.x * inward.x + this.vel.y * inward.y;
      if (dot < 0) {
        this.vel.x -= inward.x * dot;
        this.vel.y -= inward.y * dot;
      }
    }

    // Drop wake ripples behind the kayak when moving briskly
    let speed = this.vel.mag();
    this.wakeCooldown = max(0, this.wakeCooldown - 1);
    if (speed > 1.0 && this.wakeCooldown === 0) {
      let bx = this.pos.x - Math.cos(this.heading) * this.size * 0.9;
      let by = this.pos.y - Math.sin(this.heading) * this.size * 0.9;
      ripples.push(new Ripple(bx, by, 22 + speed * 4));
      this.wakeCooldown = 12;
    }
  }

  draw() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.heading);
    let s = this.size;

    // Persistent V-wake when moving — light streaks behind hull
    let speed = this.vel.mag();
    if (speed > 0.4) {
      noFill();
      stroke(220, 235, 245, 120);
      strokeWeight(1.2);
      let trail = constrain(speed * 4, 6, 24);
      for (let i = 0; i < 2; i++) {
        let offX = -s * 0.95 - i * 8;
        let spread = 5 + i * 4 + speed * 2;
        line(offX, -spread, offX - trail, -spread - trail * 0.5);
        line(offX,  spread, offX - trail,  spread + trail * 0.5);
      }
      noStroke();
    }

    // Hull shadow on water
    noStroke();
    fill(0, 0, 0, 90);
    ellipse(2, 4, s * 2.7, s * 0.95);

    // Hull — long elongated shape. Colors pull from the player's chosen
    // palette so each angler reads as their own kayak in a derby.
    const hp  = HULL_PALETTES[playerAppearance.hull] || HULL_PALETTES.navy;
    const pp  = PFD_PALETTES [playerAppearance.pfd]  || PFD_PALETTES.orange;
    const hat = HAT_PALETTES [playerAppearance.hat]  || HAT_PALETTES.green;
    fill(...hp.base);
    ellipse(0, 0, s * 2.5, s * 0.8);
    // accent stripe along upper edge (visible from above)
    fill(...hp.accent);
    ellipse(0, -s * 0.18, s * 2.3, s * 0.16);
    // hull lip / rim
    fill(...hp.dark);
    ellipse(0, 0, s * 2.5, s * 0.8);
    fill(...hp.light);
    ellipse(0, -s * 0.02, s * 2.2, s * 0.55);

    // cockpit opening (where the paddler sits) — dark oval
    fill(15, 20, 28);
    ellipse(s * 0.05, 0, s * 0.85, s * 0.42);

    // paddler torso + life jacket
    fill(...pp.base);
    ellipse(s * 0.05, 0, s * 0.55, s * 0.4);
    fill(...pp.dark);                    // shadow side
    arc(s * 0.05, 0, s * 0.55, s * 0.4, -PI / 2, PI / 2);

    // arms — thin segments holding the paddle shaft
    let armReach = s * 0.18;
    let armSpread = sin(this.paddlePhase) * s * 0.12;
    fill(pp.dark[0] - 10, pp.dark[1] - 10, pp.dark[2] - 10);
    ellipse(s * 0.10,  armReach + armSpread * 0.3, s * 0.15, s * 0.12);
    ellipse(s * 0.10, -armReach - armSpread * 0.3, s * 0.15, s * 0.12);

    // head (tan skin tone) + cap (chosen hat color)
    fill(225, 195, 155);
    ellipse(s * 0.05, 0, s * 0.28, s * 0.28);
    fill(...hat);
    arc(s * 0.05, 0, s * 0.30, s * 0.30, PI, TWO_PI);

    // PADDLE — alternates sides each stroke. Visible blade dipped in water on
    // the active side, other blade lifted across the bow.
    let phase = this.paddlePhase;
    let stroke01 = (Math.sin(phase) + 1) / 2;       // 0..1, switches sides
    let activeSide = Math.sin(phase) > 0 ? 1 : -1;
    let crossT = Math.cos(phase) * 0.5 + 0.5;       // 0..1 sweep position

    // Paddle shaft (across the kayak)
    stroke(60, 40, 25);
    strokeWeight(2.4);
    let shaftX = s * 0.05;
    let shaftY1 = -s * 0.85 - crossT * s * 0.2;
    let shaftY2 =  s * 0.85 + crossT * s * 0.2;
    if (activeSide < 0) {
      shaftY1 = -s * 0.85 - (1 - crossT) * s * 0.2;
      shaftY2 =  s * 0.85 + (1 - crossT) * s * 0.2;
    }
    line(shaftX, shaftY1, shaftX, shaftY2);
    noStroke();

    // Paddle blades on each end
    let bladeW = s * 0.5, bladeH = s * 0.22;
    push();
    translate(shaftX, shaftY1);
    rotate(0.2);
    fill(80, 55, 35);
    ellipse(0, -bladeH * 0.4, bladeW * 0.9, bladeH);
    pop();
    push();
    translate(shaftX, shaftY2);
    rotate(-0.2);
    fill(80, 55, 35);
    ellipse(0,  bladeH * 0.4, bladeW * 0.9, bladeH);
    pop();

    // Splashes near the active blade when paddling
    if (speed > 0.3 && Math.abs(Math.sin(phase)) > 0.7) {
      let sx = shaftX;
      let sy = activeSide > 0 ? shaftY2 : shaftY1;
      fill(220, 235, 245, 180);
      ellipse(sx + random(-2, 2), sy + random(-2, 2), 4, 4);
      ellipse(sx + random(-3, 3), sy + random(-3, 3), 3, 3);
    }

    pop();
  }
}

// ---------- DUCKS ----------
class Duck {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.heading = random(TWO_PI);
    this.targetHeading = this.heading;
    this.size = random(14, 18);
    this.male = random() < 0.55;
    this.dabble = 0;
    this.dabbleTimer = 0;
    this.dirTimer = floor(random(120, 360));
    this.bobPhase = random(TWO_PI);
    this.colorSeed = random(1000);
    // state machine
    this.state = 'floating';                // 'floating' | 'flushing' | 'flying' | 'gone'
    this.altitude = 0;                       // 0 = on water, 1 = high in sky
    this.flushTimer = 0;
    this.respawnTimer = 0;
    this.mate = null;                        // sibling duck — flushes together
    this.flapPhase = random(TWO_PI);
  }

  flush() {
    if (this.state !== 'floating') return;
    this.state = 'flushing';
    this.flushTimer = 22;
    // fly away from the kayak
    this.heading = Math.atan2(this.pos.y - player.pos.y, this.pos.x - player.pos.x);
    this.targetHeading = this.heading;
    // mate flushes too, with a tiny delay to look natural
    if (this.mate && this.mate.state === 'floating') {
      let m = this.mate;
      setTimeout(() => { if (m && m.state === 'floating') m.flush(); }, 120);
    }
  }

  update() {
    if (this.state === 'gone') {
      // wait then respawn at a fresh shoreline spot
      this.respawnTimer--;
      if (this.respawnTimer <= 0) this._respawn();
      return;
    }
    if (this.state === 'flying') {
      this.altitude = lerp(this.altitude, 1, 0.04);
      this.flapPhase += 0.45;
      let sp = 5.5;
      this.pos.x += Math.cos(this.heading) * sp;
      this.pos.y += Math.sin(this.heading) * sp;
      if (this.pos.x < -120 || this.pos.x > WORLD_W + 120 ||
          this.pos.y < -120 || this.pos.y > WORLD_H + 120) {
        this.state = 'gone';
        this.respawnTimer = 600 + floor(random(900));
      }
      return;
    }
    if (this.state === 'flushing') {
      this.altitude = lerp(this.altitude, 0.35, 0.18);
      this.flapPhase += 0.4;
      this.flushTimer--;
      // already moving away
      let sp = 2.0 + (22 - this.flushTimer) * 0.18;
      this.pos.x += Math.cos(this.heading) * sp;
      this.pos.y += Math.sin(this.heading) * sp;
      if (this.flushTimer <= 0) this.state = 'flying';
      return;
    }

    // ---- floating ----
    // Flush if the kayak gets too close
    let dpx = player.pos.x - this.pos.x, dpy = player.pos.y - this.pos.y;
    if (dpx * dpx + dpy * dpy < 95 * 95) {
      this.flush();
      ripples.push(new Ripple(this.pos.x, this.pos.y, 18));
      return;
    }

    this.dirTimer--;
    if (this.dirTimer <= 0) {
      this.targetHeading = this.heading + random(-PI * 0.7, PI * 0.7);
      this.dirTimer = floor(random(120, 360));
    }
    let dh = this.targetHeading - this.heading;
    while (dh >  PI) dh -= TWO_PI;
    while (dh < -PI) dh += TWO_PI;
    this.heading += dh * 0.02;
    let speed = 0.32 * (1 - this.dabble * 0.8);
    this.pos.x += Math.cos(this.heading) * speed;
    this.pos.y += Math.sin(this.heading) * speed;
    if (this.dabbleTimer <= 0 && random() < 0.0015) this.dabbleTimer = 70;
    if (this.dabbleTimer > 0) {
      this.dabbleTimer--;
      this.dabble = lerp(this.dabble, 1, 0.1);
      if (this.dabbleTimer === 35) ripples.push(new Ripple(this.pos.x, this.pos.y, 10));
    } else {
      this.dabble = lerp(this.dabble, 0, 0.1);
    }
    let inAmt = lake.insideAmount(this.pos.x, this.pos.y);
    if (inAmt < 16) {
      let inward = lake.inwardNormal(this.pos.x, this.pos.y);
      let pen = max(0, 16 - inAmt);
      this.pos.x += inward.x * pen;
      this.pos.y += inward.y * pen;
      this.targetHeading = Math.atan2(inward.y, inward.x);
    }
    this.bobPhase += 0.04;
  }

  _respawn() {
    // come back at a random shoreline point far from the kayak
    for (let i = 0; i < 30; i++) {
      let p = lake.randomEdgePoint(random(0.85, 0.95));
      let d2 = (p.x - player.pos.x) ** 2 + (p.y - player.pos.y) ** 2;
      if (d2 > 600 * 600 && lake.contains(p.x, p.y, 14)) {
        this.pos.x = p.x; this.pos.y = p.y;
        this.state = 'floating';
        this.altitude = 0;
        this.heading = this.targetHeading = random(TWO_PI);
        this.dirTimer = floor(random(120, 360));
        return;
      }
    }
    // fallback: somewhere random
    let p = lake.randomInteriorPoint();
    this.pos.x = p.x; this.pos.y = p.y;
    this.state = 'floating';
    this.altitude = 0;
  }

  draw() {
    if (this.state === 'gone') return;
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.heading);
    let s = this.size;

    // ---- FLYING / FLUSHING form: viewed top-down with wings spread ----
    if (this.state === 'flying' || this.state === 'flushing') {
      // shadow on water — slides ahead as the bird gains altitude
      let alt = this.altitude;
      let shadowOff = alt * 22;
      let shadowAlpha = 70 * (1 - alt * 0.6);
      noStroke();
      fill(0, 0, 0, shadowAlpha);
      ellipse(shadowOff * 0.5, shadowOff * 0.7, s * 1.4 * (1.4 - alt * 0.5), s * 0.5 * (1.4 - alt * 0.5));

      let bs = s * (1.2 - alt * 0.3);            // bird scales down with height a bit
      let flap = (Math.sin(this.flapPhase) + 1) / 2;
      let wingSpan = bs * (2.0 + flap * 0.7);
      let wingDepth = bs * (0.85 + flap * 0.4);
      // wings
      fill(80, 65, 45);
      triangle(-bs * 0.1, 0, -wingSpan * 0.5, -wingDepth, bs * 0.3, -bs * 0.15);
      triangle(-bs * 0.1, 0, -wingSpan * 0.5,  wingDepth, bs * 0.3,  bs * 0.15);
      // wing edge highlight
      fill(140, 115, 80);
      triangle(-bs * 0.1, 0, -wingSpan * 0.38, -wingDepth * 0.8, bs * 0.1, -bs * 0.1);
      triangle(-bs * 0.1, 0, -wingSpan * 0.38,  wingDepth * 0.8, bs * 0.1,  bs * 0.1);
      // body — torpedo
      fill(110, 90, 60);
      ellipse(0, 0, bs * 1.3, bs * 0.45);
      // head (small) — green or brown
      if (this.male) fill(40, 130, 70);
      else           fill(120, 95, 60);
      ellipse(bs * 0.55, 0, bs * 0.35, bs * 0.3);
      // bill
      fill(235, 195, 75);
      triangle(bs * 0.78, 0, bs * 0.9, -bs * 0.05, bs * 0.9, bs * 0.05);
      pop();
      return;
    }

    let bob = Math.sin(this.bobPhase) * 0.4;
    let bodyShrink = 1 - this.dabble * 0.35;
    let bw = s * 2.0 * bodyShrink;
    let bh = s * 1.2 * bodyShrink;

    noStroke();
    fill(0, 0, 0, 60);
    ellipse(1, 2 + bob, bw * 1.05, bh * 0.85);

    // body — warm mid-brown, lighter than the water so it pops
    fill(140, 110, 75);
    ellipse(-s * 0.05, bob, bw, bh);
    // belly hint along the sides
    fill(195, 165, 120);
    ellipse(-s * 0.1, bob, bw * 0.75, bh * 0.55);
    // dark scapular stripe along the back (subtle definition)
    fill(60, 45, 30, 220);
    ellipse(-s * 0.15, bob, bw * 0.85, bh * 0.18);

    let headFade = 1 - this.dabble;
    if (headFade > 0.05) {
      let headX = s * 0.85;
      // neck — yellow-brown
      fill(155, 125, 80, 255 * headFade);
      ellipse((s * 0.55 + headX) / 2, bob, s * 0.4, s * 0.32);
      // head — bright iridescent green for drakes, rich brown for hens
      if (this.male) fill(40, 130, 70, 255 * headFade);
      else           fill(120, 95, 60, 255 * headFade);
      ellipse(headX, bob, s * 0.6, s * 0.55);
      // white neck ring (drake only)
      if (this.male) {
        fill(245, 240, 230, 255 * headFade);
        ellipse(headX - s * 0.3, bob, s * 0.18, s * 0.32);
      }
      // bill — bright yellow
      fill(235, 195, 75, 255 * headFade);
      ellipse(headX + s * 0.35, bob, s * 0.34, s * 0.2);
      // eye
      fill(20, 18, 14, 255 * headFade);
      ellipse(headX + s * 0.04, bob - s * 0.14, s * 0.09);
    }

    if (this.dabble < 0.4) {
      noFill();
      stroke(220, 235, 245, 90);
      strokeWeight(0.6);
      line(-bw * 0.5, -3, -bw * 0.95, -7);
      line(-bw * 0.5,  3, -bw * 0.95,  7);
      noStroke();
    }
    pop();
  }
}

// ---------- BALD EAGLE ----------
class Eagle {
  constructor() {
    this.state = 'soaring';
    let edge = floor(random(4));
    if (edge === 0)      { this.pos = createVector(random(WORLD_W), -120); }
    else if (edge === 1) { this.pos = createVector(WORLD_W + 120, random(WORLD_H)); }
    else if (edge === 2) { this.pos = createVector(random(WORLD_W), WORLD_H + 120); }
    else                 { this.pos = createVector(-120, random(WORLD_H)); }
    let toCenter = Math.atan2(WORLD_H/2 - this.pos.y, WORLD_W/2 - this.pos.x);
    this.angle = toCenter;
    this.altitude = 1.0;
    this.target = null;
    this.carryFish = null;
    this.carryFishSpecies = null;
    this.lifetime = 0;
    this.size = 30;
    this.speed = 4.5;
    this.flapPhase = 0;
    this.flapMode = 'gliding';            // 'gliding' | 'flapping' | 'tucked'
    this.flapModeTimer = floor(random(60, 200));
    this.screeched = false;
  }

  _pickTarget() {
    let candidates = [];
    for (let b of bass) {
      if (!b.hooked && b.z < 0.35) candidates.push(b);
    }
    for (let f of panfish) {
      if (!f.hooked && f.z < 0.18) candidates.push(f);
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) =>
      Math.hypot(a.pos.x - this.pos.x, a.pos.y - this.pos.y) -
      Math.hypot(b.pos.x - this.pos.x, b.pos.y - this.pos.y));
    return candidates[Math.min(floor(random(2)), candidates.length - 1)];
  }

  update() {
    this.lifetime++;
    this.flapPhase += 0.31;     // ~3 beats per second during a flap burst

    // Wing mode: tucked while diving, continuous flapping while climbing,
    // and a glide/flap-burst cycle otherwise so the eagle reads as soaring.
    if (this.state === 'diving') {
      this.flapMode = 'tucked';
    } else if (this.state === 'rising') {
      this.flapMode = 'flapping';
    } else {
      this.flapModeTimer--;
      if (this.flapModeTimer <= 0) {
        if (this.flapMode === 'gliding') {
          this.flapMode = 'flapping';
          this.flapModeTimer = 60;          // ~3 wing beats
          this.flapPhase = 0;
        } else {
          this.flapMode = 'gliding';
          this.flapModeTimer = floor(random(120, 280));  // 2-4.5s glide
        }
      }
    }

    if (this.state === 'soaring') {
      this.altitude = lerp(this.altitude, 0.85, 0.02);
      if (!this.target) this.target = this._pickTarget();
      if (this.target) {
        let dx = this.target.pos.x - this.pos.x;
        let dy = this.target.pos.y - this.pos.y;
        let d = Math.hypot(dx, dy);
        this.angle = Math.atan2(dy, dx);
        if (d < 90) this.state = 'diving';
        else {
          this.pos.x += (dx / d) * this.speed;
          this.pos.y += (dy / d) * this.speed;
        }
      } else {
        this.pos.x += Math.cos(this.angle) * this.speed;
        this.pos.y += Math.sin(this.angle) * this.speed;
        if (this.lifetime > 480) this.state = 'leaving';
      }
    } else if (this.state === 'diving') {
      if (!this.screeched) { playSound('eagle', { volume: 0.7 }); this.screeched = true; }
      this.altitude = lerp(this.altitude, 0.05, 0.12);
      if (!this.target || this.target.hooked || (panfish.indexOf(this.target) < 0 && bass.indexOf(this.target) < 0)) {
        this.state = 'rising';
      } else {
        let dx = this.target.pos.x - this.pos.x;
        let dy = this.target.pos.y - this.pos.y;
        let d = Math.hypot(dx, dy);
        this.angle = Math.atan2(dy, dx);
        if (d < 12) {
          this.carryFish = this.target;
          this.carryFishSpecies = this.target.species;
          let idx = panfish.indexOf(this.target);
          if (idx >= 0) panfish.splice(idx, 1);
          else {
            let bidx = bass.indexOf(this.target);
            if (bidx >= 0) bass.splice(bidx, 1);
          }
          this.target = null;
          ripples.push(new Ripple(this.pos.x, this.pos.y, 44));
          ripples.push(new Ripple(this.pos.x, this.pos.y, 22));
          for (let i = 0; i < 8; i++) bubbles.push(new Bubble(this.pos.x, this.pos.y));
          playSound('splash', { volume: 0.85 });
          this.state = 'rising';
        } else {
          this.pos.x += (dx / d) * this.speed * 1.6;
          this.pos.y += (dy / d) * this.speed * 1.6;
        }
      }
    } else if (this.state === 'rising') {
      this.altitude = lerp(this.altitude, 1.0, 0.05);
      this.pos.x += Math.cos(this.angle) * this.speed;
      this.pos.y += Math.sin(this.angle) * this.speed;
      if (this.altitude > 0.85) this.state = 'leaving';
    } else if (this.state === 'leaving') {
      this.pos.x += Math.cos(this.angle) * this.speed;
      this.pos.y += Math.sin(this.angle) * this.speed;
      if (this.pos.x < -200 || this.pos.x > WORLD_W + 200 ||
          this.pos.y < -200 || this.pos.y > WORLD_H + 200) {
        this.state = 'done';
      }
    }
  }

  drawShadow() {
    if (this.state === 'done') return;
    let off = this.altitude * 28;
    let alpha = 90 * (1 - this.altitude * 0.55);
    let sz = this.size * (1.5 - this.altitude * 0.5);
    noStroke();
    fill(0, 0, 0, alpha);
    ellipse(this.pos.x + off * 0.5, this.pos.y + off * 0.7, sz, sz * 0.45);
  }

  draw() {
    if (this.state === 'done') return;
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    let s = this.size * (1.4 - this.altitude * 0.5);
    // sin(phase) is the beat — positive = downstroke (wing flat, broad
    // from above), negative = upstroke (wing tilted up, narrower).
    let beat = (this.flapMode === 'flapping') ? Math.sin(this.flapPhase) : 0;
    let tuck = (this.flapMode === 'tucked') ? 0.55 : 1.0;   // diving stoop
    let wingSpan  = s * (3.2 + beat * 0.30) * tuck;
    let wingDepth = s * (1.05 + beat * 0.40) * tuck;

    noStroke();
    fill(38, 28, 22);
    // Left wing — curved leading and trailing edges so it reads as a glide,
    // tapering smoothly to a rounded tip rather than a sharp point.
    beginShape();
    vertex( s * 0.25, -s * 0.20);                       // wing root (leading)
    quadraticVertex(-s * 0.10, -wingDepth * 0.85,
                    -wingSpan * 0.50, -wingDepth * 0.55); // tip
    quadraticVertex(-s * 0.40, -wingDepth * 0.20,
                    -s * 0.10,  0);                       // wing root (trailing)
    endShape(CLOSE);
    // Right wing — mirrored
    beginShape();
    vertex( s * 0.25,  s * 0.20);
    quadraticVertex(-s * 0.10,  wingDepth * 0.85,
                    -wingSpan * 0.50,  wingDepth * 0.55);
    quadraticVertex(-s * 0.40,  wingDepth * 0.20,
                    -s * 0.10,  0);
    endShape(CLOSE);
    // Feathered highlight band along the leading edge
    fill(85, 65, 45);
    beginShape();
    vertex( s * 0.22, -s * 0.18);
    quadraticVertex(-s * 0.05, -wingDepth * 0.55,
                    -wingSpan * 0.35, -wingDepth * 0.42);
    quadraticVertex(-s * 0.05, -wingDepth * 0.25,
                    s * 0.20, -s * 0.10);
    endShape(CLOSE);
    beginShape();
    vertex( s * 0.22,  s * 0.18);
    quadraticVertex(-s * 0.05,  wingDepth * 0.55,
                    -wingSpan * 0.35,  wingDepth * 0.42);
    quadraticVertex(-s * 0.05,  wingDepth * 0.25,
                    s * 0.20,  s * 0.10);
    endShape(CLOSE);
    // Wingtip "fingers" — a few separated dark feathers at each tip so the
    // outline reads as primaries fanned out, not a hard point.
    fill(28, 20, 16);
    for (let i = 0; i < 4; i++) {
      let t = i / 3;
      let tipX = lerp(-wingSpan * 0.42, -wingSpan * 0.55, t);
      let tipY = lerp(-wingDepth * 0.32, -wingDepth * 0.62, t);
      ellipse(tipX, tipY, s * 0.18, s * 0.07);
      ellipse(tipX, -tipY, s * 0.18, s * 0.07);
    }

    fill(38, 28, 22);
    ellipse(0, 0, s * 1.3, s * 0.55);

    fill(248, 245, 235);
    ellipse(s * 0.55, 0, s * 0.45, s * 0.38);
    fill(225, 175, 50);
    triangle(s * 0.78, 0, s * 0.94, -s * 0.06, s * 0.94, s * 0.06);
    fill(20, 18, 14);
    ellipse(s * 0.65, -s * 0.06, s * 0.06);

    fill(248, 245, 235);
    triangle(-s * 0.65, 0, -s * 1.05, -s * 0.18, -s * 1.05, s * 0.18);

    if (this.carryFish && (this.state === 'rising' || this.state === 'leaving')) {
      fill(45, 55, 40);
      ellipse(-s * 0.05, s * 0.35, s * 0.7, s * 0.28);
      fill(35, 45, 32);
      triangle(-s * 0.4, s * 0.35, -s * 0.6, s * 0.17, -s * 0.6, s * 0.53);
      stroke(220, 175, 50, 230);
      strokeWeight(1);
      line(0, s * 0.1, -s * 0.05, s * 0.3);
      line(s * 0.05, s * 0.1, s * 0.0, s * 0.3);
      noStroke();
    }
    pop();
  }
}

// ---------- FLY CAST ----------
// Fly fishing: hold the mouse to begin false-casting. The fly line whips
// back and forth above the water, growing further with each cycle.
// Release to "shoot" the line forward — distance is determined by how long
// the line has grown during false casts. Click again later to reel in.
class FlyCast {
  constructor() {
    this.flyType = selectedFly;            // capture player's choice at cast time
    this.cfg = FLY_CONFIG[this.flyType];
    this.state = 'aerial';
    // 'aerial' | 'delivering' | 'fishing' | 'hooked' | 'reeling' | 'done'
    this.aerialPhase = 0;
    this.lineLength = 70;
    this.maxLineLength = MAX_CAST_RANGE;
    this.lastHalfCycle = 0;
    this.flyX = 0; this.flyY = 0;
    this.startX = 0; this.startY = 0;
    this.targetX = 0; this.targetY = 0;
    this.flightT = 0;
    this.flightDuration = 0;
    this.driftSeed = random(1000);
    this.hookedFish = null;
    this.fightT = 0;
    this.reeling = false;
    this.tension = 0;
    this.fishStamina = 1;
    this.runTimer = 0;
    this.runCooldown = 0;
    this.runDir = { x: 0, y: 0 };
    this.slackTimer = 0;
    // ---- TIMING METER (Dredge-style release rhythm) ----
    // A cursor slides back and forth along a bar. Releasing the mouse while
    // the cursor is in the green sweet spot = perfect cast. Off-spot =
    // accuracy falls off (cast lands wide of the aim point) and the spook
    // radius grows. Speeds up each frame so you can't just hover indefinitely.
    this.timingPhase = 0;            // 0..1 — cursor position on bar
    this.timingDir = 1;              // +1 right, -1 left
    this.timingSpeed = 0.018;        // per-frame, grows with fightT
    this.sweetCenter = 0.50;
    this.sweetWidth  = 0.22;         // ±11% around center
    this.castQuality = 0;            // 1 = perfect, 0 = miss; set on release
    this.qualityLabel = null;        // 'PERFECT' | 'GOOD' | 'MISS' | null
    this.qualityLabelAt = 0;
  }

  _rodTip() {
    return {
      x: player.pos.x + Math.cos(player.heading) * player.size * 0.9,
      y: player.pos.y + Math.sin(player.heading) * player.size * 0.9,
    };
  }

  _aimDir() {
    // direction from rod to mouse (in world coords)
    let r = this._rodTip();
    let mwx = mouseX / zoom + cam.x;
    let mwy = mouseY / zoom + cam.y;
    let dx = mwx - r.x, dy = mwy - r.y;
    let m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m, dist: m, mwx, mwy };
  }

  update() {
    let r = this._rodTip();

    if (this.state === 'aerial') {
      // Alternating false casts — line tip swings between forward and backward.
      const SWING_SPEED = 0.085;
      this.aerialPhase += SWING_SPEED;
      let halfCycle = Math.floor(this.aerialPhase / Math.PI);
      if (halfCycle > this.lastHalfCycle) {
        this.lineLength = Math.min(this.lineLength + 55, this.maxLineLength);
        this.lastHalfCycle = halfCycle;
      }
      let aim = this._aimDir();
      let extend = Math.sin(this.aerialPhase);
      this.flyX = r.x + aim.x * this.lineLength * extend;
      this.flyY = r.y + aim.y * this.lineLength * extend;

      // Timing rhythm — cursor slides back and forth on the meter and
      // speeds up as the cast loads. The longer you false-cast, the harder
      // the timing window to nail. Forces a decision: deliver early in
      // the sweet rhythm, or build line length but risk missing the spot.
      this.timingPhase += this.timingDir * this.timingSpeed;
      if (this.timingPhase >= 1) { this.timingPhase = 1; this.timingDir = -1; }
      if (this.timingPhase <= 0) { this.timingPhase = 0; this.timingDir = 1; }
      this.timingSpeed = Math.min(0.06, 0.018 + this.aerialPhase * 0.001);
    } else if (this.state === 'delivering') {
      this.flightT += (deltaTime || 16) / 1000;
      let t = constrain(this.flightT / this.flightDuration, 0, 1);
      let eased = 1 - Math.pow(1 - t, 2);
      this.flyX = lerp(this.startX, this.targetX, eased);
      this.flyY = lerp(this.startY, this.targetY, eased);
      this.airHeight = Math.sin(t * Math.PI);
      if (t >= 1) {
        this.state = 'fishing';
        this.airHeight = 0;
        ripples.push(new Ripple(this.flyX, this.flyY, 14));
        playSound('splash', { volume: 0.7 });
        this._spookNearbyFish();
      }
    } else if (this.state === 'fishing') {
      // Fly drifts a touch on the water surface (subtle noise wander)
      let n1 = noise(this.flyX * 0.005, this.flyY * 0.005, frameCount * 0.005 + this.driftSeed);
      let n2 = noise(this.flyX * 0.005 + 50, this.flyY * 0.005 + 50, frameCount * 0.005 + this.driftSeed);
      this.flyX += (n1 - 0.5) * 0.4;
      this.flyY += (n2 - 0.5) * 0.4;

      // Wind drift on the water — fly skitters downwind
      this.flyX += wind.x * 0.22;
      this.flyY += wind.y * 0.22;

      // Line tether — if the kayak has paddled past the line length, the
      // line pulls the fly along. Drags surface ripples too.
      let r = this._rodTip();
      let dx = this.flyX - r.x, dy = this.flyY - r.y;
      let d = Math.hypot(dx, dy);
      if (d > this.lineLength) {
        let pull = d - this.lineLength;
        this.flyX -= (dx / d) * pull;
        this.flyY -= (dy / d) * pull;
        // small drag ripple every so often
        if (frameCount % 8 === 0) ripples.push(new Ripple(this.flyX, this.flyY, 9));
      }

      // bite check — find a catchable fish near the fly
      let prey = this._findBitingFish();
      if (prey) this._setHook(prey);
    } else if (this.state === 'hooked') {
      // ---- FIGHT ----
      // Player holds reel button (mouse / cast button) to apply tension.
      // Reeling drains the fish's stamina and pulls the fly toward the rod;
      // however, while a fish is RUNNING, tension climbs fast and can snap
      // the line. Letting go during a run safely lets out line.
      this.fightT++;
      let r = this._rodTip();
      let toX = r.x - this.flyX, toY = r.y - this.flyY;
      let dToRod = Math.hypot(toX, toY) || 1;

      // -- Run trigger --
      if (this.runTimer === 0 && this.runCooldown === 0) {
        // Lower base rate — average ~6-8s between runs at full stamina.
        let runChance = 0.001 + this.fishStamina * 0.004;
        if (Math.random() < runChance) {
          this.runTimer = 40 + Math.floor(Math.random() * 70);
          let perpX = -toY / dToRod, perpY = toX / dToRod;
          let side = Math.random() < 0.5 ? -1 : 1;
          this.runDir.x = -toX / dToRod * 0.7 + perpX * side * 0.7;
          this.runDir.y = -toY / dToRod * 0.7 + perpY * side * 0.7;
          let m = Math.hypot(this.runDir.x, this.runDir.y) || 1;
          this.runDir.x /= m; this.runDir.y /= m;
        }
      }

      // -- Update tension and fly position --
      let isRunning = this.runTimer > 0;
      let runStrength = isRunning ? (1.4 + this.fishStamina * 1.0) : 0;

      let reelSpeed = this.reeling ? Math.max(1.5 - runStrength * 0.6, 0.4) : 0;

      let netX = (toX / dToRod) * reelSpeed + this.runDir.x * runStrength;
      let netY = (toY / dToRod) * reelSpeed + this.runDir.y * runStrength;
      this.flyX += netX;
      this.flyY += netY;

      // Keep the fly (and the hooked fish that's puppeted to it) inside the
      // lake. If a run pushes the fly toward land, push it back along the
      // inward normal and bleed the outward velocity component so it doesn't
      // beach itself against the shoreline.
      let inAmt = lake.insideAmount(this.flyX, this.flyY);
      if (inAmt < 8) {
        let inward = lake.inwardNormal(this.flyX, this.flyY);
        let push = Math.max(0, 8 - inAmt);
        this.flyX += inward.x * push;
        this.flyY += inward.y * push;
        // damp the run vector against the shore — the fish "turns" along the bank
        let dotR = this.runDir.x * inward.x + this.runDir.y * inward.y;
        if (dotR < 0) {
          this.runDir.x -= inward.x * dotR;
          this.runDir.y -= inward.y * dotR;
          let m = Math.hypot(this.runDir.x, this.runDir.y);
          if (m > 0) { this.runDir.x /= m; this.runDir.y /= m; }
        }
      }

      // tension dynamics:
      //   calm reeling   → tension settles around 0.4 (safe steady-state) and
      //                    drains the fish's stamina
      //   reeling on run → tension climbs fast and can break the line
      //   not reeling    → tension decays toward zero
      if (this.reeling) {
        if (isRunning) {
          this.tension += 0.013 + this.fishStamina * 0.006;
        } else {
          this.tension = lerp(this.tension, 0.42, 0.06);   // approach steady
          this.fishStamina = Math.max(0, this.fishStamina - 0.0028);
        }
      } else {
        this.tension *= 0.92;
      }
      this.tension = Math.min(this.tension, 1.4);

      if (this.runTimer > 0) this.runTimer--;
      else if (this.runCooldown > 0) this.runCooldown--;
      if (this.runTimer === 0 && this.runDir.x !== 0) {
        this.runDir.x = 0; this.runDir.y = 0;
        this.runCooldown = 60 + Math.floor(Math.random() * 100);
      }

      // -- Resolution checks --
      if (this.tension >= 1.0) {
        this._onLineSnap();
        return;
      }
      // Hook slip — if the line stays slack the fish throws the hook.
      // A live fish needs constant pressure; failing to play it means losing it.
      if (this.tension < 0.06) this.slackTimer++;
      else this.slackTimer = Math.max(0, this.slackTimer - 2);
      if (this.slackTimer > 105) {
        this._onHookSlip();
        return;
      }
      let dToRodNew = Math.hypot(r.x - this.flyX, r.y - this.flyY);
      // landed: fish is close AND played out (mostly tired)
      if (dToRodNew < 24 && this.fishStamina < 0.55) {
        this._onCatch();
        return;
      }
      // stay within cast range — fish can't tow the line beyond a max
      if (dToRodNew > MAX_CAST_RANGE * 1.1) {
        // fish has run too far — adds tension and clamps position
        let f = (MAX_CAST_RANGE * 1.1) / dToRodNew;
        this.flyX = r.x - (r.x - this.flyX) * f;
        this.flyY = r.y - (r.y - this.flyY) * f;
        this.tension += 0.015;
      }

      // puppet the hooked fish to the fly
      if (this.hookedFish) {
        this.hookedFish.pos.x = this.flyX;
        this.hookedFish.pos.y = this.flyY;
        if (this.hookedFish.vel) this.hookedFish.vel.set(0, 0);
        if ('z' in this.hookedFish) this.hookedFish.z = 0.05;
      }

      // surface commotion — bigger ripple while fish is running
      let rippleRate = isRunning ? 6 : 14;
      if (frameCount % rippleRate === 0) {
        ripples.push(new Ripple(this.flyX, this.flyY, isRunning ? 18 : 12));
      }
    } else if (this.state === 'reeling') {
      let dx = player.pos.x - this.flyX;
      let dy = player.pos.y - this.flyY;
      let d = Math.hypot(dx, dy);
      if (d < 14) {
        this.state = 'done';
      } else {
        this.flyX += (dx / d) * 4.2;
        this.flyY += (dy / d) * 4.2;
        if (frameCount % 8 === 0) ripples.push(new Ripple(this.flyX, this.flyY, 10));
      }
    }
  }

  // Called when the user releases the mouse — shoot the line forward.
  release() {
    if (this.state !== 'aerial') return;
    playSound('cast_release');
    let r = this._rodTip();
    let aim = this._aimDir();

    // ---- TIMING QUALITY ----
    // Distance from the sweet-spot center as a fraction of half-window.
    let dFromSweet = Math.abs(this.timingPhase - this.sweetCenter);
    let halfWidth = this.sweetWidth / 2;
    let q;
    if (dFromSweet <= halfWidth) {
      q = 1 - dFromSweet / halfWidth;          // 0.6..1.0 — perfect band
      this.qualityLabel = q > 0.6 ? 'PERFECT' : 'GOOD';
    } else {
      let over = dFromSweet - halfWidth;       // 0..0.5
      q = Math.max(0, 1 - over * 2.4);         // 0..~0.7 — falls off fast
      this.qualityLabel = q > 0.3 ? 'OK' : 'WIDE';
    }
    this.castQuality = q;
    this.qualityLabelAt = frameCount;

    let castDist = Math.min(this.lineLength, aim.dist);
    // weak quality shortens the cast a touch — line dumps short
    castDist *= (0.65 + q * 0.35);
    if (castDist < 60) {
      this.state = 'done';
      return;
    }

    // Accuracy error — wide casts land perpendicular to the aim axis. Up to
    // ~25% of the cast distance off-line at quality=0.
    let perpX = -aim.y, perpY = aim.x;
    let err = (1 - q) * castDist * 0.25 * (random() < 0.5 ? -1 : 1);

    this.startX = this.flyX;
    this.startY = this.flyY;
    this.targetX = r.x + aim.x * castDist + perpX * err;
    this.targetY = r.y + aim.y * castDist + perpY * err;
    // Don't allow landing on land — pull the target back into water
    let attempts = 0;
    while (!lake.contains(this.targetX, this.targetY, 4) && attempts++ < 30) {
      let inward = lake.inwardNormal(this.targetX, this.targetY);
      this.targetX += inward.x * 6;
      this.targetY += inward.y * 6;
    }
    this.flightT = 0;
    this.flightDuration = constrain(0.25 + castDist / 700, 0.3, 0.9);
    this.state = 'delivering';
  }

  startReel() {
    if (this.state === 'fishing') this.state = 'reeling';
  }

  _spookNearbyFish() {
    if (this.flyType !== 'woolyBugger') return;
    // Cast quality modulates the spook radius. A perfect timing release lands
    // the fly softly enough that even spooky fish only react in a small area.
    // A wide cast slaps the water and scares everything in a much wider ring.
    let radius = lerp(48, 14, this.castQuality);     // miss=48px, perfect=14px
    const SPOOK_FRAMES = 240;
    let x = this.flyX, y = this.flyY;
    let spook = (f) => {
      if (!SPECIES[f.species]?.spooky) return;
      let d2 = (f.pos.x - x) ** 2 + (f.pos.y - y) ** 2;
      if (d2 < radius * radius) {
        f.spookedUntil = frameCount + SPOOK_FRAMES;
        f.spookFromX = x;
        f.spookFromY = y;
        if (random() < 0.6) ripples.push(new Ripple(f.pos.x, f.pos.y, 10));
      }
    };
    for (let f of panfish) { if (!f.dead && !f.hooked) spook(f); }
    for (let b of bass)    { if (!b.hooked) spook(b); }
  }

  _findBitingFish() {
    let cfg = this.cfg;
    let bestD = cfg.biteRange;
    let best = null;
    // What does THIS fly type catch in the current level? Build a quick lookup.
    let levelCatches = lvl().catches[this.flyType] || [];
    let canCatch = Object.create(null);
    for (let sp of levelCatches) canCatch[sp] = true;
    let spookedNow = (f) => f.spookedUntil && frameCount < f.spookedUntil;
    for (let f of panfish) {
      if (f.dead || f.hooked || spookedNow(f)) continue;
      if (!canCatch[f.species]) continue;
      let d = Math.hypot(f.pos.x - this.flyX, f.pos.y - this.flyY);
      if (d < bestD) { bestD = d; best = f; }
    }
    for (let b of bass) {
      if (b.hooked || spookedNow(b)) continue;
      if (!canCatch[b.species]) continue;
      let d = Math.hypot(b.pos.x - this.flyX, b.pos.y - this.flyY);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  _setHook(fish) {
    this.hookedFish = fish;
    fish.hooked = true;
    this.state = 'hooked';
    this.fightT = 0;
    this.runCooldown = 90;
    ripples.push(new Ripple(this.flyX, this.flyY, 28));
    ripples.push(new Ripple(this.flyX, this.flyY, 14));
    playSound('bite');
    playSound('hookset', { volume: 0.8 });
  }

  _onCatch() {
    if (this.hookedFish) {
      let species = this.hookedFish.species;
      let weight  = this.hookedFish.size || 1;
      catchCount[species] = (catchCount[species] || 0) + 1;
      let reward = (lvl().rewards && lvl().rewards[species]) || REWARDS[species] || 0;
      // Stats: every catch, anywhere, counts toward lifetime totals.
      playerStats.catches_by_species ||= {};
      playerStats.catches_by_species[species] = (playerStats.catches_by_species[species] || 0) + 1;
      playerStats.biggest_catch ||= {};
      if (!playerStats.biggest_catch[species] || weight > playerStats.biggest_catch[species]) {
        playerStats.biggest_catch[species] = Math.round(weight * 10) / 10;
      }
      // In a live derby, points go to the cloud leaderboard instead of cash.
      // Single-player keeps the dollar reward; derby money is paid out at the
      // end based on placement (see showDerbyResults()).
      if (derbyLive && window.MP && MP.currentDerby && MP.currentDerby.status === 'live') {
        MP.recordCatch({ species, weight: Math.round(weight * 10) / 10, points: reward });
        playerStats.derby_catches = (playerStats.derby_catches || 0) + 1;
        playerStats.total_points  = (playerStats.total_points  || 0) + reward;
      } else {
        playerState.money += reward;
      }
      saveProgress();
      lastCatchToast = { species, time: frameCount, money: derbyLive ? 0 : reward, points: derbyLive ? reward : 0 };
      playSound('catch');
      stopLoop('reel_loop');
      let idx = panfish.indexOf(this.hookedFish);
      if (idx >= 0) panfish.splice(idx, 1);
      else {
        let bidx = bass.indexOf(this.hookedFish);
        if (bidx >= 0) bass.splice(bidx, 1);
      }
      this.hookedFish = null;
    }
    this.state = 'done';
  }

  _onLineSnap() {
    if (this.hookedFish) {
      this.hookedFish.hooked = false;
      this.hookedFish = null;
    }
    ripples.push(new Ripple(this.flyX, this.flyY, 22));
    lastMissToast = { reason: 'snap', time: frameCount };
    playSound('snap');
    stopLoop('reel_loop');
    this.state = 'done';
  }

  _onHookSlip() {
    // Line went slack too long — the fish shook the hook free.
    if (this.hookedFish) {
      this.hookedFish.hooked = false;
      this.hookedFish = null;
    }
    ripples.push(new Ripple(this.flyX, this.flyY, 16));
    lastMissToast = { reason: 'slip', time: frameCount };
    stopLoop('reel_loop');
    this.state = 'done';
  }

  draw() {
    if (this.state === 'done') return;
    let r = this._rodTip();

    // ---- Aerial HUD: power meter + timing meter above the kayak ----
    if (this.state === 'aerial') {
      // Line-length / power bar
      let pct = (this.lineLength - 70) / (this.maxLineLength - 70);
      pct = constrain(pct, 0, 1);
      noStroke();
      fill(0, 0, 0, 140);
      rect(player.pos.x - 28, player.pos.y - 44, 56, 6, 2);
      fill(255, 200, 80);
      rect(player.pos.x - 27, player.pos.y - 43, 54 * pct, 4, 1);

      // Timing rhythm bar — sweet spot highlighted; sliding cursor
      let bx = player.pos.x - 28, by = player.pos.y - 34, bw = 56, bh = 7;
      fill(0, 0, 0, 150);
      rect(bx, by, bw, bh, 2);
      // sweet spot band
      let sStart = this.sweetCenter - this.sweetWidth / 2;
      let sEnd   = this.sweetCenter + this.sweetWidth / 2;
      fill(120, 220, 110, 220);
      rect(bx + sStart * bw, by + 1, (sEnd - sStart) * bw, bh - 2, 1);
      // sliding cursor
      fill(255, 245, 220);
      let cx = bx + this.timingPhase * bw;
      rect(cx - 1, by - 1, 2, bh + 2);
    }

    // Cast-quality feedback floats briefly above the kayak after release.
    if (this.qualityLabel && frameCount - this.qualityLabelAt < 60) {
      let age = frameCount - this.qualityLabelAt;
      let alpha = (1 - age / 60) * 255;
      let yOff = -54 - age * 0.4;
      let col = this.qualityLabel === 'PERFECT' ? [255, 230, 150]
              : this.qualityLabel === 'GOOD'    ? [180, 230, 170]
              : this.qualityLabel === 'OK'      ? [220, 220, 200]
              : [255, 150, 130];
      noStroke();
      fill(col[0], col[1], col[2], alpha);
      textAlign(CENTER, BOTTOM);
      textSize(10);
      textStyle(BOLD);
      text(this.qualityLabel, player.pos.x, player.pos.y + yOff);
      textStyle(NORMAL);
    }

    // FLY LINE
    stroke(30, 22, 15, 220);
    if (this.state === 'aerial') {
      // curved line in the air, perpendicular bow grows with swing speed
      strokeWeight(1.0);
      noFill();
      let dx = this.flyX - r.x, dy = this.flyY - r.y;
      let len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      // bow curve oscillates with the swing — strongest near zero crossings
      let bow = Math.cos(this.aerialPhase) * 26 * (this.lineLength / this.maxLineLength + 0.2);
      let mx = (r.x + this.flyX) / 2 + nx * bow;
      let my = (r.y + this.flyY) / 2 + ny * bow;
      beginShape();
      vertex(r.x, r.y);
      quadraticVertex(mx, my, this.flyX, this.flyY);
      endShape();
      // small white loop at the tip — the leader unfurling
      noStroke();
      fill(240, 240, 230, 180);
      ellipse(this.flyX, this.flyY, 3, 3);
    } else if (this.state === 'delivering') {
      strokeWeight(1.0);
      noFill();
      // line shoots out, slight bow in flight direction
      let dx = this.flyX - r.x, dy = this.flyY - r.y;
      let len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      let bow = (this.airHeight || 0) * 14;
      let mx = (r.x + this.flyX) / 2 + nx * bow;
      let my = (r.y + this.flyY) / 2 + ny * bow;
      beginShape();
      vertex(r.x, r.y);
      quadraticVertex(mx, my, this.flyX, this.flyY);
      endShape();
    } else {
      // line laid on water — slight drift curve
      strokeWeight(0.7);
      noFill();
      let dx = this.flyX - r.x, dy = this.flyY - r.y;
      let len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      let driftBow = Math.sin(frameCount * 0.04 + this.driftSeed) * 3;
      let mx = (r.x + this.flyX) / 2 + nx * driftBow;
      let my = (r.y + this.flyY) / 2 + ny * driftBow;
      beginShape();
      vertex(r.x, r.y);
      quadraticVertex(mx, my, this.flyX, this.flyY);
      endShape();
    }
    noStroke();

    // FLY (visible only when on water or just landed)
    if (this.state === 'fishing' || this.state === 'reeling' || this.state === 'delivering' || this.state === 'hooked') {
      let cfg = this.cfg;
      // dimple (water tension ring) under the fly — bigger for heavy flies
      let dimpleR = cfg.sinks ? 7 : 5;
      noFill();
      stroke(255, 255, 255, 90);
      strokeWeight(0.6);
      ellipse(this.flyX, this.flyY, dimpleR, dimpleR * 0.8);
      noStroke();
      // fly body — color from fly type
      fill(cfg.flyColor[0], cfg.flyColor[1], cfg.flyColor[2]);
      let bodyW = this.flyType === 'woolyBugger' ? 5 : (this.flyType === 'nymph' ? 3.5 : 2.5);
      ellipse(this.flyX, this.flyY, bodyW, bodyW);
      // hackle / legs / streamer tail
      stroke(cfg.legsColor[0], cfg.legsColor[1], cfg.legsColor[2], 220);
      strokeWeight(0.5);
      if (this.flyType === 'woolyBugger') {
        // long streamer tail trailing back toward kayak
        let r = this._rodTip();
        let dx = this.flyX - r.x, dy = this.flyY - r.y;
        let len = Math.hypot(dx, dy) || 1;
        let nx = -dx / len, ny = -dy / len;   // back toward rod
        for (let i = 0; i < 4; i++) {
          line(this.flyX, this.flyY,
               this.flyX + nx * 6 + (i - 1.5) * 1.2, this.flyY + ny * 6 + (i - 1.5) * 1.2);
        }
      } else {
        // tuft hackles
        line(this.flyX - 2.5, this.flyY - 1, this.flyX + 2.5, this.flyY + 1);
        line(this.flyX - 2, this.flyY + 1, this.flyX + 2, this.flyY - 1);
      }
      noStroke();
    }
  }
}

// ---------- EFFECTS ----------
class Ripple {
  constructor(x, y, maxR = 40) {
    this.x = x; this.y = y; this.r = 2; this.maxR = maxR;
  }
  update() { this.r += 1.2; }
  draw() {
    noFill();
    let a = map(this.r, 0, this.maxR, 200, 0);
    stroke(220, 240, 255, a);
    strokeWeight(1);
    ellipse(this.x, this.y, this.r * 2);
    noStroke();
  }
  dead() { return this.r > this.maxR; }
}

class Bubble {
  constructor(x, y) {
    this.x = x + random(-4, 4);
    this.y = y + random(-4, 4);
    this.r = random(1.5, 3.5);
    this.vy = random(-0.6, -0.2);
    this.life = 60;
  }
  update() { this.y += this.vy; this.life--; }
  draw() {
    noFill();
    stroke(220, 240, 255, this.life * 3);
    strokeWeight(1);
    ellipse(this.x, this.y, this.r * 2);
    noStroke();
  }
  dead() { return this.life <= 0; }
}

function drawLilypad(lp) {
  push();
  translate(lp.x, lp.y);
  rotate(lp.a);
  noStroke();
  fill(0, 0, 0, 60);
  ellipse(2, 3, lp.r * 2.1, lp.r * 1.7);
  fill(45, 95, 50);
  ellipse(0, 0, lp.r * 2, lp.r * 1.6);
  fill(70, 130, 70);
  arc(0, 0, lp.r * 1.9, lp.r * 1.5, -PI * 0.45, PI * 0.45, PIE);
  // notch
  fill(20, 60, 80);
  triangle(0, 0, lp.r, -2, lp.r, 2);
  pop();
}

function drawWeed(w) {
  let sway = sin(frameCount * 0.02 + w.sway) * 4;
  stroke(30, 80, 50, 180);
  strokeWeight(2);
  noFill();
  beginShape();
  vertex(w.x, w.y);
  vertex(w.x + sway * 0.3, w.y - w.h * 0.4);
  vertex(w.x + sway * 0.7, w.y - w.h * 0.75);
  vertex(w.x + sway, w.y - w.h);
  endShape();
  noStroke();
}

function mousePressed() {
  if (menuOpen) return;
  unlockAudio();
  if (cast && cast.state === 'hooked') {
    cast.reeling = true;
    startLoop('reel_loop', { volume: 0.5 });
    return;
  }
  if (cast && cast.state === 'fishing') {
    cast.startReel();
    return;
  }
  if (cast && cast.state !== 'done') return;
  cast = new FlyCast();
  playSound('cast_start');
}

function mouseReleased() {
  if (menuOpen) return;
  if (cast && cast.state === 'aerial') cast.release();
  if (cast && cast.state === 'hooked') {
    cast.reeling = false;
    stopLoop('reel_loop');
  }
}

// ---- Environment props ----
function drawTrees(canopyOnly) {
  noStroke();
  for (let t of trees) {
    if (!inView(t.x, t.y, t.r * 1.2)) continue;
    fill(40, 30, 22, 220);
    ellipse(t.x, t.y, t.r * 0.35, t.r * 0.35);
  }
  for (let t of trees) {
    if (!inView(t.x, t.y, t.r * 1.2)) continue;
    fill(0, 0, 0, 60);
    ellipse(t.x + 6, t.y + 8, t.r * 1.6, t.r * 1.4);
    fill(t.hue - 10, t.val - 10, t.tone - 10);
    ellipse(t.x, t.y, t.r * 1.7, t.r * 1.5);
    for (let i = 0; i < 5; i++) {
      let a = (i / 5) * TWO_PI + t.x * 0.01;
      let dx = cos(a) * t.r * 0.45;
      let dy = sin(a) * t.r * 0.4;
      fill(t.hue, t.val, t.tone, 220);
      ellipse(t.x + dx, t.y + dy, t.r * 0.85, t.r * 0.75);
    }
    fill(t.hue + 15, t.val + 25, t.tone + 5, 200);
    ellipse(t.x - t.r * 0.2, t.y - t.r * 0.25, t.r * 0.6, t.r * 0.5);
  }
}

function drawTreeShadows() {
  // overhanging shadow over the water near the shore
  noStroke();
  for (let t of trees) {
    if (!inView(t.x, t.y, t.r * 2.5)) continue;
    let inAmt = lake.insideAmount(t.x, t.y);
    // only trees near the water cast shadows onto it
    if (inAmt > -150 && inAmt < 80) {
      let inward = lake.inwardNormal(t.x, t.y);
      let cx = t.x + inward.x * (t.r * 0.6);
      let cy = t.y + inward.y * (t.r * 0.6);
      fill(0, 10, 5, 70 * t.shade * 4);
      ellipse(cx, cy, t.r * 1.8, t.r * 1.4);
      fill(0, 10, 5, 30 * t.shade * 4);
      ellipse(cx, cy, t.r * 2.6, t.r * 2.0);
    }
  }
}

function drawLog(l) {
  push();
  translate(l.x, l.y);
  rotate(l.a);
  noStroke();
  // shadow in water
  fill(0, 0, 0, 80);
  ellipse(2, 4, l.len, l.thick * 1.3);
  // log body
  fill(75, 55, 35);
  rect(-l.len / 2, -l.thick / 2, l.len, l.thick, l.thick * 0.4);
  // bark texture lines
  stroke(45, 30, 18, 200);
  strokeWeight(1);
  for (let i = -l.len / 2 + 6; i < l.len / 2 - 6; i += 8) {
    line(i, -l.thick / 2 + 2, i, l.thick / 2 - 2);
  }
  noStroke();
  // end caps — rings
  fill(110, 80, 50);
  ellipse(-l.len / 2 + 2, 0, l.thick * 0.9, l.thick);
  ellipse(l.len / 2 - 2, 0, l.thick * 0.9, l.thick);
  fill(70, 50, 30);
  ellipse(-l.len / 2 + 2, 0, l.thick * 0.45, l.thick * 0.5);
  ellipse(l.len / 2 - 2, 0, l.thick * 0.45, l.thick * 0.5);
  pop();
}

function drawCattail(c) {
  let sway = sin(frameCount * 0.018 + c.sway) * 5;
  // stem
  stroke(70, 110, 60, 220);
  strokeWeight(1.5);
  noFill();
  beginShape();
  vertex(c.x, c.y);
  vertex(c.x + sway * 0.5, c.y - c.h * 0.6);
  vertex(c.x + sway, c.y - c.h);
  endShape();
  // pod
  noStroke();
  fill(60, 35, 20);
  ellipse(c.x + sway, c.y - c.h, 4, 10);
  // tip
  stroke(70, 110, 60, 220);
  strokeWeight(1);
  line(c.x + sway, c.y - c.h - 5, c.x + sway, c.y - c.h - 12);
  noStroke();
}

function drawRock(r) {
  noStroke();
  fill(0, 0, 0, 70);
  ellipse(r.x + 1, r.y + 2, r.r * 2.1, r.r * 1.4);
  fill(r.shade, r.shade, r.shade);
  ellipse(r.x, r.y, r.r * 2, r.r * 1.4);
  fill(r.shade + 30, r.shade + 30, r.shade + 30, 200);
  ellipse(r.x - r.r * 0.2, r.y - r.r * 0.25, r.r * 0.7, r.r * 0.4);
}

// Snag — sunken stump with a chewed-off stub poking above the surface.
// Cover for predators; visually breaks up open water and lets the player
// read the lake bottom.
function drawSnag(s) {
  noStroke();
  // Submerged base — dark blotch on the bottom that hints at structure
  fill(28, 22, 18, 95);
  ellipse(s.x, s.y, s.r * 2.6, s.r * 1.6);
  fill(45, 35, 25, 120);
  ellipse(s.x, s.y, s.r * 1.8, s.r * 1.1);

  // Stub poking above the surface
  push();
  translate(s.x, s.y - 1);
  rotate(s.stubLean);
  // wet ring around the base
  fill(220, 230, 235, 50);
  ellipse(0, 0, s.r * 1.5, s.r * 0.7);
  // stub body
  fill(60, 42, 28);
  rect(-s.r * 0.32, -s.stubH, s.r * 0.64, s.stubH, 2);
  // bark highlight
  fill(85, 58, 38);
  rect(-s.r * 0.32, -s.stubH, s.r * 0.18, s.stubH, 2);
  // cracked top
  fill(140, 110, 75);
  ellipse(0, -s.stubH, s.r * 0.62, s.r * 0.22);
  fill(50, 35, 22);
  ellipse(0, -s.stubH + 1, s.r * 0.45, s.r * 0.14);
  // optional broken side branches
  for (let i = 0; i < s.branches; i++) {
    let a = (noise(s.seed + i) - 0.5) * 1.8;
    push();
    translate(0, -s.stubH * (0.4 + i * 0.2));
    rotate(a);
    fill(60, 42, 28);
    rect(0, -1, s.r * 0.6, 2);
    pop();
  }
  pop();
}

// ============================================================================
// Multiplayer / derby UI wiring (Phase 3)
// ----------------------------------------------------------------------------
// Opt-in: if multiplayer.js failed to connect, the modal still opens but
// actions error out — single-player play is unaffected.
// ============================================================================

let derbyLive = false;          // true once the host has started a derby

function wireDerbyUI() {
  if (!window.MP) return;
  const $ = (id) => document.getElementById(id);
  const modal = $('derby');
  if (!modal) return;

  const openModal  = () => { modal.classList.remove('hidden'); refreshDerbyView(); };
  const closeModal = () => modal.classList.add('hidden');

  $('derby-button')?.addEventListener('click', openModal);
  $('derby-close-x')?.addEventListener('click', closeModal);

  // Tabs ----------------------------------------------------------------
  const tabs  = modal.querySelectorAll('.derby-tab');
  const panes = modal.querySelectorAll('.derby-pane');
  let browseUnsub = null;
  let browseRefreshDebounce = null;
  let browsePoll = null;
  async function startBrowseWatch() {
    if (!browseUnsub) {
      // Realtime catches new lobbies appearing instantly. Debounced because
      // a single host action can trigger a burst (insert + roster upsert).
      browseUnsub = await MP.watchOpenDerbies(() => {
        clearTimeout(browseRefreshDebounce);
        browseRefreshDebounce = setTimeout(refreshBrowseList, 250);
      });
    }
    // Safety-net poll for events realtime can drop (notably DELETE without
    // replica-identity-full): refresh every 5s while Browse is open.
    if (!browsePoll) browsePoll = setInterval(refreshBrowseList, 5000);
  }
  async function stopBrowseWatch() {
    if (browsePoll) { clearInterval(browsePoll); browsePoll = null; }
    if (browseUnsub) { const u = browseUnsub; browseUnsub = null; try { await u(); } catch {} }
  }
  function showPane(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    panes.forEach(p => p.hidden = (p.dataset.pane !== name));
    if (name === 'browse') { refreshBrowseList(); startBrowseWatch(); }
    else stopBrowseWatch();
  }
  tabs.forEach(t => t.addEventListener('click', () => {
    if (MP.currentDerby) return;        // can't tab away while in a lobby
    showPane(t.dataset.tab);
  }));

  // Stop watching when the modal closes (saves the realtime channel)
  $('derby-close-x')?.addEventListener('click', stopBrowseWatch);

  // Name field ----------------------------------------------------------
  const nameInput = $('derby-name');
  if (nameInput) {
    nameInput.value = MP.getPlayerName();
    nameInput.addEventListener('change', () => MP.setPlayerName(nameInput.value));
  }

  // Host ----------------------------------------------------------------
  $('derby-host-create')?.addEventListener('click', async () => {
    const btn = $('derby-host-create');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      await MP.createDerby({
        level:    $('derby-host-level').value,
        duration: parseInt($('derby-host-duration').value, 10),
        isPublic: $('derby-host-public').value === 'true',
      });
      showPane('lobby');
    } catch (e) {
      alert('Could not create derby: ' + (e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = 'Create Derby';
    }
  });

  // Join by pin ---------------------------------------------------------
  $('derby-join-go')?.addEventListener('click', async () => {
    const pin = $('derby-join-pin').value;
    const err = $('derby-join-err');
    err.textContent = '';
    try { await MP.joinDerbyByPin(pin); showPane('lobby'); }
    catch (e) { err.textContent = e.message || String(e); }
  });

  // Browse --------------------------------------------------------------
  $('derby-browse-refresh')?.addEventListener('click', refreshBrowseList);

  async function refreshBrowseList() {
    const list = $('derby-browse-list');
    list.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const rows = await MP.listOpenDerbies();
      if (!rows.length) {
        list.innerHTML = '<div class="empty">No open derbies — host one!</div>';
        return;
      }
      list.innerHTML = rows.map(r => {
        const n    = (r.derby_players || []).length;
        const lake = r.level === 'alpineLake' ? 'Alpine Lake' : 'Bass Lake';
        const mins = Math.round(r.duration_secs / 60);
        return `<div class="derby-list-item">
          <div>
            <div><b>${escapeHtml(r.pin)}</b> · ${lake}</div>
            <div class="meta">${mins} min · ${n} angler${n === 1 ? '' : 's'}</div>
          </div>
          <button data-id="${r.id}">Join</button>
        </div>`;
      }).join('');
      list.querySelectorAll('button[data-id]').forEach(b => {
        b.addEventListener('click', async () => {
          try { await MP.joinDerbyById(b.dataset.id); showPane('lobby'); }
          catch (e) { alert('Could not join: ' + (e.message || e)); }
        });
      });
    } catch (e) {
      list.innerHTML = '<div class="empty">Error: ' + escapeHtml(e.message || String(e)) + '</div>';
    }
  }

  // Lobby actions -------------------------------------------------------
  $('derby-leave')?.addEventListener('click', async () => {
    await MP.leaveDerby();
    derbyLive = false;
    document.body.classList.remove('derby-live');
    showPane('host');
  });

  $('derby-start')?.addEventListener('click', async () => {
    const btn = $('derby-start');
    btn.disabled = true; btn.textContent = 'Starting…';
    try { await MP.startDerby(); }
    catch (e) { alert('Could not start: ' + (e.message || e)); }
    finally { btn.disabled = false; btn.textContent = 'Start Derby'; }
  });

  $('derby-share')?.addEventListener('click', () => {
    const link = derbyShareLink();
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      const el = $('derby-share');
      el.classList.add('copied');
      const old = el.textContent;
      el.textContent = 'copied! ' + link;
      setTimeout(() => { el.classList.remove('copied'); el.textContent = old; }, 1600);
    });
  });

  // React to lobby state changes (roster updates, host starts, derby ends) -
  MP.onLobbyChange(({ derby: d }) => {
    refreshDerbyView();
    if (d && d.status === 'live' && !derbyLive) enterDerbyWorld(d);
    if (d && d.status === 'done' && !derbyResultsShown) showDerbyResults();
  });

  // Close-results -> back to menu, clear current derby
  document.getElementById('results-close')?.addEventListener('click', async () => {
    document.getElementById('derby-results')?.classList.add('hidden');
    document.getElementById('menu')?.classList.remove('hidden');
    document.getElementById('chat-btn')?.classList.add('hidden');
    document.body.classList.remove('derby-live');
    menuOpen = true;
    derbyResultsShown = false;
    derbyLive = false;
    try { history.replaceState(null, '', location.pathname); } catch {}
    if (window.MP) { try { await MP.leaveDerby(); } catch {} }
  });

  // ---- Hooked-fish event feed: ANY catch in the derby shows up briefly
  MP.onCatch((c) => {
    if (c.player_id === MP.userId) return;   // skip our own (we already see the local toast)
    pushDerbyFeed(c.playerName, c.species, c.weight, c.points);
  });

  // ---- Quick chat — button + popup menu + speech bubbles
  wireQuickChat();

  // Auto-join via ?pin=ABC123 (share-link entry point) -----------------
  try {
    const urlPin = new URLSearchParams(location.search).get('pin');
    if (urlPin) {
      MP.whenReady()
        .then(() => MP.joinDerbyByPin(urlPin))
        .then(() => { openModal(); showPane('lobby'); })
        .catch(e => console.warn('[MP] auto-join failed:', e.message || e));
    }
  } catch {}

  function refreshDerbyView() {
    if (!MP.currentDerby) return;
    const d = MP.currentDerby;
    showPane('lobby');
    $('derby-lobby-pin').textContent      = d.pin;
    $('derby-lobby-level').textContent    = (LEVELS[d.level]?.name) || d.level;
    $('derby-lobby-duration').textContent = Math.round(d.duration_secs / 60) + ' min';
    $('derby-share').textContent          = derbyShareLink();

    const isHost  = d.host_id === MP.userId;
    const inLobby = d.status === 'lobby';
    $('derby-start').hidden   = !(isHost && inLobby);
    $('derby-waiting').hidden = (isHost || !inLobby);

    const ros = $('derby-roster');
    if (!MP.roster.length) {
      ros.innerHTML = '<div class="empty" style="padding:10px;color:rgba(180,200,210,0.5);font-style:italic;">Just you for now…</div>';
    } else {
      ros.innerHTML = MP.roster.map(p => {
        const tags = [];
        if (p.player_id === d.host_id) tags.push('<span class="host">HOST</span>');
        if (p.player_id === MP.userId) tags.push('<span class="you">YOU</span>');
        return `<div class="roster-row">
          <span>${escapeHtml(p.name)}</span>
          <span class="tags">${tags.join('')}</span>
        </div>`;
      }).join('');
    }
  }

  function derbyShareLink() {
    if (!MP.currentDerby) return '';
    try {
      const u = new URL(location.href);
      u.searchParams.delete('seed');
      u.searchParams.set('pin', MP.currentDerby.pin);
      return u.toString();
    } catch { return ''; }
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
}

// The host pressed "Start" — every client receives the realtime UPDATE on
// the derby row and lands here. Swap to the right biome, rebuild the world
// with the shared seed so everyone fishes an identical lake, and drop the
// player straight into the game.
// Render every other player's kayak. Positions arrive at ~10 Hz; we
// interpolate between the last two received snapshots so motion looks
// smooth at 60 fps even though the wire only ticks 10× per second.
function drawDerbyGhosts() {
  if (!window.MP || !MP.ghosts || MP.ghosts.size === 0) return;
  const now = performance.now();
  for (const g of MP.ghosts.values()) {
    const span = Math.max(50, g.recvT - g.prevRecvT);
    // Lerp from prev->current over the gap, and let it extrapolate up to
    // half a tick past the latest sample so movement keeps flowing.
    const t  = constrain((now - g.prevRecvT) / span, 0, 1.5);
    const x  = lerp(g.prevX, g.x, t);
    const y  = lerp(g.prevY, g.y, t);
    const h  = lerpAngle(g.prevH, g.h, t);
    drawGhostKayak(x, y, h, g.pp, g.name, g.appearance);
    // Cast line + fly — only drawn when this ghost is actively casting.
    if (g.cs) {
      const fx = lerp(g.prevCx, g.cx, t);
      const fy = lerp(g.prevCy, g.cy, t);
      // Rod tip mirrors the local _rodTip() math: kayak pos + ahead by 0.9·size
      const rx = x + Math.cos(h) * 22 * 0.9;
      const ry = y + Math.sin(h) * 22 * 0.9;
      drawGhostCast(rx, ry, fx, fy, g.cs);
    }
  }
}

// Draw another player's fly line + fly. State-driven look:
//   'a' aerial   — false-casting back-and-forth, loaded loop in the line
//   'd' delivering — line streams toward the landing point
//   'f' fishing  — gentle sag, fly drifting on water
//   'h' hooked   — taut straight line + tension wobble
//   'r' reeling  — same as hooked, just shorter over time
function drawGhostCast(rx, ry, fx, fy, state) {
  const dx = fx - rx, dy = fy - ry;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return;

  // Perpendicular vector for curving the bezier control point
  const px = -dy / dist, py = dx / dist;

  // Pick a control offset based on state. Positive = "above" relative to the
  // line direction (gives a nice loaded-loop look for aerial casts).
  let curve = 0;
  let lineAlpha = 180;
  let lineColor = [240, 240, 230];
  if (state === 'a') {
    // Aerial — animated wobble so the line looks alive, not pasted on
    curve = -8 - Math.sin(frameCount * 0.4) * 6;
  } else if (state === 'd') {
    curve = -4;
  } else if (state === 'f') {
    curve = 3;                              // slight sag while fishing
    lineAlpha = 150;
  } else if (state === 'h' || state === 'r') {
    curve = Math.sin(frameCount * 0.35) * 1.6;   // taut, tiny vibration
    lineColor = [255, 220, 130];           // warm tint when fighting a fish
  }

  // Mid-point control for a quadratic bezier — keeps the curve cheap to draw
  const cx = rx + dx * 0.5 + px * curve;
  const cy = ry + dy * 0.5 + py * curve;

  push();
  noFill();
  stroke(lineColor[0], lineColor[1], lineColor[2], lineAlpha);
  strokeWeight(1.2);
  beginShape();
  vertex(rx, ry);
  quadraticVertex(cx, cy, fx, fy);
  endShape();
  noStroke();

  // Fly itself — small dot on the water (or in the air during 'a'/'d')
  // matches the local cast's vibe without giving away who's hooked.
  fill(40, 30, 22, 220);
  ellipse(fx, fy, 3.5, 3.5);
  if (state === 'f' || state === 'h') {
    // Subtle ripple ring while on the water
    noFill();
    stroke(220, 240, 220, 80);
    strokeWeight(1);
    ellipse(fx, fy, 6 + (frameCount % 30) * 0.4, 6 + (frameCount % 30) * 0.4);
    noStroke();
  }
  pop();
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Translucent kayak silhouette using the ghost's chosen color palette so
// each peer reads as a distinct angler.
function drawGhostKayak(x, y, heading, paddlePhase, name, appearance) {
  const ap = appearance || { hull: 'navy', pfd: 'cyan', hat: 'green' };
  const hp  = HULL_PALETTES[ap.hull] || HULL_PALETTES.navy;
  const pp  = PFD_PALETTES [ap.pfd]  || PFD_PALETTES.cyan;
  const hat = HAT_PALETTES [ap.hat]  || HAT_PALETTES.green;

  push();
  translate(x, y);
  rotate(heading);
  const s = 22;
  noStroke();
  // hull shadow
  fill(0, 0, 0, 70);
  ellipse(2, 4, s * 2.7, s * 0.95);
  // hull (translucent so they read as "remote")
  fill(hp.dark[0], hp.dark[1], hp.dark[2], 210);
  ellipse(0, 0, s * 2.5, s * 0.8);
  fill(hp.light[0], hp.light[1], hp.light[2], 210);
  ellipse(0, -s * 0.02, s * 2.2, s * 0.55);
  // cockpit
  fill(15, 20, 28, 210);
  ellipse(s * 0.05, 0, s * 0.85, s * 0.42);
  // PFD
  fill(pp.base[0], pp.base[1], pp.base[2], 230);
  ellipse(s * 0.05, 0, s * 0.55, s * 0.4);
  // head + cap
  fill(225, 195, 155, 230);
  ellipse(s * 0.05, 0, s * 0.28, s * 0.28);
  fill(hat[0], hat[1], hat[2], 230);
  arc(s * 0.05, 0, s * 0.30, s * 0.30, PI, TWO_PI);
  // tiny paddle motion — animate from received paddlePhase
  stroke(50, 35, 22, 200);
  strokeWeight(2);
  const px = s * 0.05;
  const py = Math.sin(paddlePhase || 0) * s * 0.7;
  line(px, -s * 0.85, px, s * 0.85);
  noStroke();
  // blade hint on the active side
  fill(60, 45, 30, 220);
  ellipse(px, py, s * 0.3, s * 0.5);
  pop();

  // Name label above the kayak, counter-scaled so zoom doesn't shrink text.
  push();
  translate(x, y - 38);
  if (typeof zoom === 'number' && zoom > 0) scale(1 / zoom);
  noStroke();
  fill(0, 0, 0, 150);
  rectMode(CENTER);
  rect(0, 0, Math.max(50, (name || '').length * 6.5 + 14), 16, 4);
  rectMode(CORNER);
  fill(220, 240, 220, 245);
  textAlign(CENTER, CENTER);
  textSize(11);
  text(name || 'Angler', 0, 0);
  pop();
}

function enterDerbyWorld(d) {
  derbyLive = true;
  derbyResultsShown = false;
  try { history.replaceState(null, '', '?pin=' + d.pin); } catch {}

  if (LEVELS[d.level] && currentLevel !== d.level) currentLevel = d.level;

  document.getElementById('derby')?.classList.add('hidden');
  document.getElementById('menu')?.classList.add('hidden');
  document.getElementById('derby-hud')?.classList.remove('hidden');
  document.getElementById('chat-btn')?.classList.remove('hidden');
  // body class drives mobile-only CSS (hide regular HUD, etc.)
  document.body.classList.add('derby-live');
  menuOpen = false;

  buildWorld(d.lake_seed);
  try { unlockAudio(); } catch {}
}

// ----------------------------------------------------------------------------
// Live derby HUD: countdown + leaderboard. Cheap to call — only touches the
// DOM, runs at 5 Hz from draw(). Also handles the host's "time's up" trigger.
// ----------------------------------------------------------------------------

let derbyResultsShown = false;

function tickDerbyHud() {
  const hud = document.getElementById('derby-hud');
  if (!hud || !window.MP) return;
  const d = MP.currentDerby;
  if (!d || d.status !== 'live') {
    if (!hud.classList.contains('hidden')) hud.classList.add('hidden');
    return;
  }
  hud.classList.remove('hidden');

  // Timer
  const secs = MP.secondsRemaining();
  const t = document.getElementById('derby-timer');
  if (t) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    t.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    t.classList.toggle('warn', secs <= 15);
  }

  // Leaderboard — derby_players UPDATEs from the scoring trigger fire the
  // realtime sub which calls _refreshRoster, so MP.roster is always fresh.
  const board = document.getElementById('derby-board');
  if (board) {
    const sorted = [...(MP.roster || [])].sort((a, b) =>
      (b.score || 0) - (a.score || 0) || a.joined_at.localeCompare(b.joined_at));
    // Build the list so "you" is always one of the visible rows — even if
    // CSS chops the list to top 2 on mobile, the player sees their own
    // standing. Rank labels still reflect true position from sort.
    const youIdx = sorted.findIndex(p => p.player_id === MP.userId);
    let rows = sorted.map((p, i) => ({ p, rank: i + 1 }));
    // If you exist and you're outside the top 2, swap you into position 2
    // (still showing #1, so the visible mobile pair becomes "#1 + you").
    if (youIdx > 1) {
      rows = [rows[0], { p: sorted[youIdx], rank: youIdx + 1 }, ...rows.slice(1).filter(r => r.p.player_id !== MP.userId)];
    }
    board.innerHTML = rows.slice(0, 8).map(({ p, rank }) => {
      const you = p.player_id === MP.userId ? ' you' : '';
      return `<div class="derby-board-row${you}">` +
             `<span class="rk">${rank}</span>` +
             `<span class="nm">${escapeHtmlGlobal(p.name)}</span>` +
             `<span class="sc">${p.score || 0}</span></div>`;
    }).join('') || '<div style="color:rgba(180,200,210,0.5);font-style:italic;padding:6px;">(no scores yet)</div>';
  }

  // Host ends the derby exactly once when time runs out.
  if (secs <= 0 && d.host_id === MP.userId) {
    if (!tickDerbyHud._endedFor || tickDerbyHud._endedFor !== d.id) {
      tickDerbyHud._endedFor = d.id;
      MP.endDerby();
    }
  }
}

function showDerbyResults() {
  derbyResultsShown = true;
  document.getElementById('derby-hud')?.classList.add('hidden');
  const card = document.getElementById('derby-results');
  if (!card) return;

  const d = MP.currentDerby;
  const sorted = [...(MP.roster || [])].sort((a, b) =>
    (b.score || 0) - (a.score || 0) || a.joined_at.localeCompare(b.joined_at));

  const myRank = sorted.findIndex(p => p.player_id === MP.userId);

  // Money tiers — only paid out when at least 2 anglers participated, so
  // you can't host a 1-player derby to mint money.
  const PRIZES = [200, 100, 50];
  const minPlayers = [2, 3, 4];
  let prize = 0;
  if (myRank >= 0 && myRank < PRIZES.length && sorted.length >= minPlayers[myRank]) {
    prize = PRIZES[myRank];
  }

  // Pay out once, then save progress.
  if (!showDerbyResults._paidFor.has(d.id)) {
    showDerbyResults._paidFor.add(d.id);
    // Lifetime stats
    playerStats.derbies_played = (playerStats.derbies_played || 0) + 1;
    if (myRank === 0 && sorted.length >= 2) {
      playerStats.derbies_won = (playerStats.derbies_won || 0) + 1;
    }
    if (prize > 0) {
      playerState.money += prize;
      playerStats.derby_money_earned = (playerStats.derby_money_earned || 0) + prize;
    }
    saveProgress();
  }

  document.getElementById('results-subtitle').textContent =
    (d.level === 'alpineLake' ? 'Alpine Lake' : 'Bass Lake') + ' · ' +
    Math.round(d.duration_secs / 60) + ' min · ' + sorted.length + ' angler' + (sorted.length === 1 ? '' : 's');

  const board = document.getElementById('results-board');
  board.innerHTML = sorted.map((p, i) => {
    const cls = ['results-row'];
    if (i === 0) cls.push('first');
    else if (i === 1) cls.push('second');
    else if (i === 2) cls.push('third');
    if (p.player_id === MP.userId) cls.push('you');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    return `<div class="${cls.join(' ')}">
      <div class="rank">${medal}</div>
      <div class="name">${escapeHtmlGlobal(p.name)}${p.player_id === MP.userId ? '<span class="meta">YOU</span>' : ''}</div>
      <div class="score">${p.score || 0}</div>
    </div>`;
  }).join('');

  const rewardEl = document.getElementById('results-reward');
  if (prize > 0) {
    rewardEl.textContent = `+$${prize}`;
  } else if (myRank === 0) {
    rewardEl.textContent = '(prizes need 2+ anglers)';
    rewardEl.style.color = 'rgba(180, 200, 210, 0.6)';
    rewardEl.style.fontStyle = 'italic';
  } else {
    rewardEl.textContent = '';
  }

  card.classList.remove('hidden');
}
showDerbyResults._paidFor = new Set();

// shared in-world html-escape (the derby UI defines its own; this one is
// for HUD updates that don't go through the closure)
function escapeHtmlGlobal(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({
    '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;',
  }[c]));
}

// ============================================================================
// Hooked-fish event feed (Phase 5 follow-up)
// ============================================================================

// Pretty-print species names for the feed: "rainbowTrout" -> "rainbow trout"
function prettySpeciesName(species) {
  return String(species || 'fish').replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}

function pushDerbyFeed(playerName, species, weight, points) {
  const feed = document.getElementById('derby-feed');
  if (!feed) return;
  const row = document.createElement('div');
  row.className = 'feed-row';
  const w = weight ? `${Math.round(weight * 10) / 10}″ ` : '';
  row.innerHTML = `🎣 <span class="who">${escapeHtmlGlobal(playerName)}</span> landed a ${w}${escapeHtmlGlobal(prettySpeciesName(species))}<span class="pts">+${points || 0}</span>`;
  feed.appendChild(row);
  // Animate in
  requestAnimationFrame(() => row.classList.add('in'));
  // Live for 4s then fade out and remove
  setTimeout(() => row.classList.remove('in'), 4000);
  setTimeout(() => row.remove(), 4400);
  // Cap to 4 rows so the feed never gets out of hand
  while (feed.children.length > 4) feed.removeChild(feed.firstChild);
}

// ============================================================================
// Quick chat (Phase 5 follow-up)
// ============================================================================

const QUICK_CHATS = [
  'Nice!', 'Big one!', 'Lucky!', 'Lol',
  'Hello', 'GG', 'GLHF', 'Where’s the fish?',
];

// Bubble timers per playerId. Map<playerId, { text, until }>
const chatBubbles = new Map();

function wireQuickChat() {
  const btn   = document.getElementById('chat-btn');
  const menu  = document.getElementById('chat-menu');
  const grid  = document.getElementById('chat-menu-grid');
  const close = document.getElementById('chat-menu-close');
  if (!btn || !menu || !grid) return;

  // Populate the canned-message grid with hotkey numbers (1..8)
  grid.innerHTML = QUICK_CHATS.map((msg, i) =>
    `<button class="chat-msg" data-msg="${escapeHtmlGlobal(msg)}">` +
      `<span class="hk">${i + 1}</span>${escapeHtmlGlobal(msg)}</button>`
  ).join('');

  const openMenu  = () => menu.classList.remove('hidden');
  const closeMenu = () => menu.classList.add('hidden');

  btn.addEventListener('click', openMenu);
  close.addEventListener('click', closeMenu);
  // Click the dimmed background to dismiss
  menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });

  grid.querySelectorAll('.chat-msg').forEach(b => {
    b.addEventListener('click', () => {
      const text = b.dataset.msg;
      if (window.MP && MP.sendChat) MP.sendChat(text);
      closeMenu();
    });
  });

  // T to open quick chat, 1-8 to send canned messages instantly
  window.addEventListener('keydown', (e) => {
    // Ignore when typing in inputs
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!derbyLive) return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); openMenu(); return; }
    if (menu.classList.contains('hidden')) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= QUICK_CHATS.length) {
      MP.sendChat(QUICK_CHATS[n - 1]);
      closeMenu();
    }
    if (e.key === 'Escape') closeMenu();
  });

  // Incoming chat -> show bubble over sender's kayak for ~3s
  MP.onChat((m) => {
    chatBubbles.set(m.id, { text: m.text, until: performance.now() + 3000 });
    playSound?.('paddle', { volume: 0.15, rate: 1.8 });  // tiny audible blip
  });
}

// Draw chat bubbles over the local player and any ghost with a recent message.
// Called from the main draw loop AFTER kayaks and cast lines are drawn so the
// bubble sits on top of everything.
function drawChatBubbles() {
  if (chatBubbles.size === 0) return;
  const now = performance.now();
  for (const [id, b] of chatBubbles) {
    if (now > b.until) { chatBubbles.delete(id); continue; }
    let x, y;
    if (id === MP?.userId && player) {
      x = player.pos.x; y = player.pos.y;
    } else if (MP?.ghosts?.has(id)) {
      const g = MP.ghosts.get(id);
      const span = Math.max(50, g.recvT - g.prevRecvT);
      const t = constrain((now - g.prevRecvT) / span, 0, 1.5);
      x = lerp(g.prevX, g.x, t);
      y = lerp(g.prevY, g.y, t);
    } else {
      continue;
    }
    drawChatBubble(x, y, b.text);
  }
}

// ============================================================================
// Profile modal (Phase 6) — name, appearance, stats, inventory
// ============================================================================

function wireProfileUI() {
  const modal = document.getElementById('profile');
  if (!modal) return;
  const openBtn  = document.getElementById('profile-button');
  const closeBtn = document.getElementById('profile-close-x');
  const nameIn   = document.getElementById('profile-name');

  openBtn?.addEventListener('click', () => {
    refreshProfileView();
    modal.classList.remove('hidden');
  });
  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
  // Click outside the card to dismiss
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  // Name field — write-through to cloud profile via saveProgress
  nameIn?.addEventListener('change', () => {
    const n = (nameIn.value || '').trim().slice(0, 24);
    if (!n) return;
    MP?.setPlayerName?.(n);
    saveProgress();
    refreshProfileView();
  });

  buildSwatches('picker-hull', Object.keys(HULL_PALETTES),
    (key) => HULL_PALETTES[key].base,
    (key) => { playerAppearance.hull = key; onAppearanceChange(); });
  buildSwatches('picker-pfd',  Object.keys(PFD_PALETTES),
    (key) => PFD_PALETTES[key].base,
    (key) => { playerAppearance.pfd = key; onAppearanceChange(); });
  buildSwatches('picker-hat',  Object.keys(HAT_PALETTES),
    (key) => HAT_PALETTES[key],
    (key) => { playerAppearance.hat = key; onAppearanceChange(); });
}

function onAppearanceChange() {
  saveProgress();
  refreshProfileView();
}

function buildSwatches(rowId, keys, colorFn, onClick) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.innerHTML = keys.map(k => {
    const c = colorFn(k);
    const css = `rgb(${c[0]},${c[1]},${c[2]})`;
    return `<button class="swatch" data-key="${k}" style="background:${css}" title="${k}"></button>`;
  }).join('');
  row.querySelectorAll('.swatch').forEach(btn => {
    btn.addEventListener('click', () => onClick(btn.dataset.key));
  });
}

function refreshProfileView() {
  const modal = document.getElementById('profile');
  if (!modal || modal.classList.contains('hidden')) {
    // still update name input if open
  }
  const nameIn = document.getElementById('profile-name');
  if (nameIn && document.activeElement !== nameIn) nameIn.value = MP?.getPlayerName?.() || '';

  // Highlight active swatches
  for (const [rowId, key] of [
    ['picker-hull', playerAppearance.hull],
    ['picker-pfd',  playerAppearance.pfd],
    ['picker-hat',  playerAppearance.hat],
  ]) {
    document.querySelectorAll(`#${rowId} .swatch`).forEach(b => {
      b.classList.toggle('active', b.dataset.key === key);
    });
  }

  // Live kayak preview
  drawProfilePreview();

  // Account section — adapts to anonymous vs signed-in state
  renderAccountSection();

  // Stats panel
  const statsEl = document.getElementById('profile-stats');
  if (statsEl) {
    const biggest = playerStats.biggest_catch || {};
    const totalCatches = Object.values(playerStats.catches_by_species || {})
      .reduce((s, n) => s + n, 0);
    const bestEntry = Object.entries(biggest)
      .sort((a, b) => b[1] - a[1])[0];
    const rows = [
      ['Money',           `$${playerState.money}`],
      ['Total catches',   String(totalCatches)],
      ['Derbies played',  String(playerStats.derbies_played || 0)],
      ['Derbies won',     String(playerStats.derbies_won    || 0)],
      ['Derby catches',   String(playerStats.derby_catches  || 0)],
      ['Derby points',    String(playerStats.total_points   || 0)],
      ['Biggest fish',    bestEntry ? `${bestEntry[1]}″ ${prettySpeciesName(bestEntry[0])}` : '—'],
      ['Levels unlocked', String(Object.values(playerState.levelsUnlocked || {}).filter(Boolean).length)],
    ];
    statsEl.innerHTML = rows.map(([lbl, val]) =>
      `<div class="stat-row"><span class="lbl">${lbl}</span><span class="val">${escapeHtmlGlobal(val)}</span></div>`
    ).join('');
  }

  // Inventory chips (owned vs locked)
  const invEl = document.getElementById('profile-inventory');
  if (invEl) {
    const chips = [];
    chips.push({ owned: true,  label: 'Dry Fly' });
    chips.push({ owned: !!playerState.unlocks.flies.nymph,       label: 'Nymph' });
    chips.push({ owned: !!playerState.unlocks.flies.woolyBugger, label: 'Wooly Bugger' });
    chips.push({ owned: (playerState.unlocks.rod   || 1) >= 2, label: 'Mid Rod' });
    chips.push({ owned: (playerState.unlocks.rod   || 1) >= 3, label: 'Pro Rod' });
    chips.push({ owned: (playerState.unlocks.kayak || 1) >= 2, label: 'Fast Kayak' });
    chips.push({ owned: (playerState.unlocks.kayak || 1) >= 3, label: 'Sea Kayak' });
    chips.push({ owned: !!playerState.unlocks.sonar, label: 'Sonar' });
    Object.entries(playerState.levelsUnlocked || {}).forEach(([id, v]) => {
      if (v && LEVELS[id]) chips.push({ owned: true, label: LEVELS[id].name || id });
    });
    invEl.innerHTML = chips.map(c =>
      `<span class="inv-chip${c.owned ? '' : ' locked'}">${escapeHtmlGlobal(c.label)}</span>`
    ).join('');
  }
}

// Renders the Account section of the Profile modal. Two states:
//   - anonymous: "Save your progress" form (email -> magic link)
//   - signed in: email shown + Sign In Elsewhere / Sign Out buttons
function renderAccountSection() {
  const el = document.getElementById('profile-account');
  if (!el || !window.MP) return;

  const anon  = MP.isAnonymous();
  const email = MP.getEmail();

  if (anon) {
    el.innerHTML = `
      <div class="acct-blurb">
        Add your email to save progress across devices. We'll send you a magic
        link — no password to remember. Your current progress stays attached
        to this email.
      </div>
      <div class="acct-row">
        <input id="acct-email" type="email" placeholder="you@example.com"
               autocapitalize="none" autocorrect="off" spellcheck="false" />
        <button id="acct-save" class="acct-btn">Save Account</button>
      </div>
      <div class="acct-blurb" style="margin: 10px 0 6px;">Already have an account on another device?</div>
      <div class="acct-row">
        <input id="acct-signin-email" type="email" placeholder="you@example.com"
               autocapitalize="none" autocorrect="off" spellcheck="false" />
        <button id="acct-signin" class="acct-btn secondary">Sign In</button>
      </div>
      <div class="acct-status" id="acct-status"></div>
    `;
    el.querySelector('#acct-save').addEventListener('click',  () => doLinkEmail());
    el.querySelector('#acct-signin').addEventListener('click', () => doSignInWithEmail());
  } else {
    el.innerHTML = `
      <div class="signed-in">
        <div>
          <div class="acct-blurb" style="margin: 0 0 4px;">Signed in as</div>
          <div class="acct-email">${escapeHtmlGlobal(email || '(no email)')}</div>
        </div>
        <button id="acct-signout" class="acct-btn secondary">Sign Out</button>
      </div>
      <div class="acct-status" id="acct-status"></div>
    `;
    el.querySelector('#acct-signout').addEventListener('click', () => doSignOut());
  }
}

async function doLinkEmail() {
  const input  = document.getElementById('acct-email');
  const btn    = document.getElementById('acct-save');
  const status = document.getElementById('acct-status');
  if (!input || !btn) return;
  const email = (input.value || '').trim();
  if (!email) { setAcctStatus(status, 'enter an email first', 'err'); return; }
  btn.disabled = true; setAcctStatus(status, 'sending link…', '');
  try {
    await MP.linkEmail(email);
    setAcctStatus(status,
      `Check ${email} for a confirmation link. Click it to save your progress to this account.`,
      'ok');
  } catch (e) {
    setAcctStatus(status, e.message || String(e), 'err');
  } finally {
    btn.disabled = false;
  }
}

async function doSignInWithEmail() {
  const input  = document.getElementById('acct-signin-email');
  const btn    = document.getElementById('acct-signin');
  const status = document.getElementById('acct-status');
  if (!input || !btn) return;
  const email = (input.value || '').trim();
  if (!email) { setAcctStatus(status, 'enter an email first', 'err'); return; }
  if (!confirm('Sign in with ' + email + '?\n\nThis will replace your current local progress with whatever is saved to that account.')) return;
  btn.disabled = true; setAcctStatus(status, 'sending link…', '');
  try {
    await MP.signInWithEmail(email);
    setAcctStatus(status,
      `Check ${email} for a sign-in link. Open it on this device to load your saved progress.`,
      'ok');
  } catch (e) {
    setAcctStatus(status, e.message || String(e), 'err');
  } finally {
    btn.disabled = false;
  }
}

async function doSignOut() {
  if (!confirm('Sign out? Your saved progress is safe — sign back in any time to restore it.')) return;
  try { await MP.signOut(); } catch (e) { console.warn(e); }
}

function setAcctStatus(el, msg, cls) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'acct-status' + (cls ? ' ' + cls : '');
}

// Tiny offscreen-canvas render of a kayak with the chosen colors so the
// preview in the profile modal reflects changes instantly.
function drawProfilePreview() {
  const canvas = document.getElementById('profile-preview');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const hp  = HULL_PALETTES[playerAppearance.hull] || HULL_PALETTES.navy;
  const pp  = PFD_PALETTES [playerAppearance.pfd]  || PFD_PALETTES.orange;
  const hat = HAT_PALETTES [playerAppearance.hat]  || HAT_PALETTES.green;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const s  = 38;

  ctx.save();
  ctx.translate(cx, cy);
  // Hull shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(2, 6, s * 1.35, s * 0.48, 0, 0, Math.PI * 2); ctx.fill();
  // Hull
  ctx.fillStyle = `rgb(${hp.base.join(',')})`;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 1.25, s * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  // Accent
  ctx.fillStyle = `rgb(${hp.accent.join(',')})`;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.18, s * 1.15, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  // Lip
  ctx.fillStyle = `rgb(${hp.dark.join(',')})`;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 1.25, s * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgb(${hp.light.join(',')})`;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.02, s * 1.1, s * 0.27, 0, 0, Math.PI * 2); ctx.fill();
  // Cockpit
  ctx.fillStyle = 'rgb(15, 20, 28)';
  ctx.beginPath(); ctx.ellipse(s * 0.05, 0, s * 0.42, s * 0.21, 0, 0, Math.PI * 2); ctx.fill();
  // PFD
  ctx.fillStyle = `rgb(${pp.base.join(',')})`;
  ctx.beginPath(); ctx.ellipse(s * 0.05, 0, s * 0.27, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgb(${pp.dark.join(',')})`;
  ctx.beginPath(); ctx.arc(s * 0.05, 0, s * 0.20, -Math.PI / 2, Math.PI / 2); ctx.fill();
  // Head + hat
  ctx.fillStyle = 'rgb(225, 195, 155)';
  ctx.beginPath(); ctx.ellipse(s * 0.05, 0, s * 0.14, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgb(${hat.join(',')})`;
  ctx.beginPath(); ctx.arc(s * 0.05, 0, s * 0.15, Math.PI, Math.PI * 2); ctx.fill();
  // Paddle hint
  ctx.strokeStyle = 'rgba(50, 35, 22, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 0.6); ctx.lineTo(s * 0.05, s * 0.6); ctx.stroke();
  ctx.restore();
}

// ============================================================================
// Field Guide (Phase 7)
// ----------------------------------------------------------------------------
// Flip through every species with portrait + Latin name + factual blurb.
// Sourced from real-world identification references; intentionally short so
// the page stays readable on a phone.
// ============================================================================

const FIELD_GUIDE = [
  {
    id: 'bluegill', name: 'Bluegill', latin: 'Lepomis macrochirus',
    size: '6–10 inches', lakes: 'Bass Lake',
    fact: 'Easily told apart by the solid black "ear" flap on the gill cover and a copper-orange breast. Among the boldest panfish — readily strike small flies right at the surface. Spawn in saucer-shaped nests in dense colonies in late spring.',
    flies: ['Dry Fly'],
  },
  {
    id: 'pumpkinseed', name: 'Pumpkinseed', latin: 'Lepomis gibbosus',
    size: '4–8 inches', lakes: 'Bass Lake',
    fact: 'One of the most colorful North American fish: blue-green sides scrawled with orange flecks and a bright red spot on the tip of the gill flap. Surface feeders that haunt lily pads and weed edges.',
    flies: ['Dry Fly'],
  },
  {
    id: 'greenSunfish', name: 'Green Sunfish', latin: 'Lepomis cyanellus',
    size: '4–7 inches', lakes: 'Bass Lake',
    fact: 'Stockier and bigger-mouthed than other sunfish, with wavy turquoise lines along an olive-green body. Tolerates poor water quality and out-competes other panfish in disturbed habitat.',
    flies: ['Dry Fly'],
  },
  {
    id: 'redbreastSunfish', name: 'Redbreast Sunfish', latin: 'Lepomis auritus',
    size: '5–9 inches', lakes: 'Bass Lake',
    fact: 'Distinguished by a long, narrow black ear flap with a pale border and a vivid orange-red belly that flushes brighter during the spawn. Favors current-edge water near submerged wood.',
    flies: ['Dry Fly'],
  },
  {
    id: 'spottedSunfish', name: 'Spotted Sunfish', latin: 'Lepomis punctatus',
    size: '4–7 inches', lakes: 'Bass Lake',
    fact: 'Identified by rows of small reddish-orange spots along the sides over a brassy background. Common in slow southeastern streams and the dense vegetation of warmwater lakes.',
    flies: ['Dry Fly'],
  },
  {
    id: 'crappie', name: 'Black Crappie', latin: 'Pomoxis nigromaculatus',
    size: '8–14 inches', lakes: 'Bass Lake',
    fact: 'Silvery body randomly speckled with dark blotches and a tall arching dorsal fin. Schools tightly around submerged trees and logs, suspending in mid-water — drop a nymph slowly through them.',
    flies: ['Nymph'],
  },
  {
    id: 'yellowPerch', name: 'Yellow Perch', latin: 'Perca flavescens',
    size: '6–12 inches', lakes: 'Bass Lake · Alpine Lake',
    fact: 'Golden-yellow flanks with six to nine bold dark vertical bars and bright orange lower fins. Travels in tight schools through cool weedy water, equally at home in warm farm ponds and high mountain lakes.',
    flies: ['Nymph'],
  },
  {
    id: 'bass', name: 'Largemouth Bass', latin: 'Micropterus salmoides',
    size: '12–22 inches', lakes: 'Bass Lake',
    fact: 'The classic warmwater predator: dark olive-green back, broken horizontal band along the side, and a jaw that extends past the eye. Ambushes prey from cover — lay a wooly bugger near a log and strip it past.',
    flies: ['Wooly Bugger'],
  },
  {
    id: 'smallmouthBass', name: 'Smallmouth Bass', latin: 'Micropterus dolomieu',
    size: '10–18 inches', lakes: 'Bass Lake',
    fact: 'Bronze body with broken vertical bars and red-tinged eyes; jaw stops at mid-eye, hence "smallmouth." Prefers cooler, rockier water than its largemouth cousin and fights pound-for-pound harder than almost anything.',
    flies: ['Wooly Bugger'],
  },
  {
    id: 'chainPickerel', name: 'Chain Pickerel', latin: 'Esox niger',
    size: '18–26 inches', lakes: 'Bass Lake',
    fact: 'Olive flanks crossed by a striking dark chain-link pattern, with a duck-billed snout full of needle teeth. Solitary ambush hunter that lies motionless along weed edges, then strikes with explosive speed.',
    flies: ['Wooly Bugger'],
  },
  {
    id: 'northernPike', name: 'Northern Pike', latin: 'Esox lucius',
    size: '24–40+ inches', lakes: 'Bass Lake',
    fact: 'A torpedo of teeth — dark green flanks marked with rows of pale bean-shaped spots. Apex freshwater predator; mostly eats fish but won\'t hesitate at frogs, ducklings, or other pike. Use heavy leader.',
    flies: ['Wooly Bugger'],
  },
  {
    id: 'rainbowTrout', name: 'Rainbow Trout', latin: 'Oncorhynchus mykiss',
    size: '8–20 inches', lakes: 'Alpine Lake',
    fact: 'Silvery body shot through with a pink-to-crimson lateral band and densely freckled with small black spots. Native to Pacific drainages; widely stocked across the world for sport fishing.',
    flies: ['Dry Fly'],
  },
  {
    id: 'brookTrout', name: 'Brook Trout', latin: 'Salvelinus fontinalis',
    size: '6–14 inches', lakes: 'Alpine Lake',
    fact: 'Technically a char, not a true trout. Dark olive back with wormlike yellow vermiculations, red spots circled by blue halos, and snow-white edges on the lower fins. Eastern North America\'s native salmonid.',
    flies: ['Nymph'],
  },
  {
    id: 'brownTrout', name: 'Brown Trout', latin: 'Salmo trutta',
    size: '10–22 inches', lakes: 'Alpine Lake',
    fact: 'European introduction now naturalized across cold waters worldwide. Yellow-gold flanks dotted with large black and red spots ringed in pale halos. Wary, long-lived, and gets considerably bigger than other trout in the same water.',
    flies: ['Wooly Bugger'],
  },
  {
    id: 'cutthroatTrout', name: 'Cutthroat Trout', latin: 'Oncorhynchus clarkii',
    size: '8–16 inches', lakes: 'Alpine Lake',
    fact: 'Named for the bright orange-red slash mark under each side of the lower jaw. Native to western North America\'s clear cold streams; the state fish of seven U.S. states.',
    flies: ['Wooly Bugger'],
  },
];

let guideIndex = 0;

function wireFieldGuide() {
  const modal = document.getElementById('guide');
  if (!modal) return;
  const openBtn  = document.getElementById('guide-button');
  const closeBtn = document.getElementById('guide-close-x');
  const prevBtn  = document.getElementById('guide-prev');
  const nextBtn  = document.getElementById('guide-next');

  openBtn?.addEventListener('click', () => {
    modal.classList.remove('hidden');
    renderGuide();
  });
  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  prevBtn?.addEventListener('click', () => {
    guideIndex = (guideIndex - 1 + FIELD_GUIDE.length) % FIELD_GUIDE.length;
    renderGuide();
  });
  nextBtn?.addEventListener('click', () => {
    guideIndex = (guideIndex + 1) % FIELD_GUIDE.length;
    renderGuide();
  });

  // Keyboard arrows when the guide is open
  window.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'ArrowLeft')  { prevBtn?.click(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { nextBtn?.click(); e.preventDefault(); }
    if (e.key === 'Escape')     { modal.classList.add('hidden'); }
  });

  // Build the thumbnail strip once (it doesn't change)
  const thumbs = document.getElementById('guide-thumbs');
  if (thumbs) {
    thumbs.innerHTML = FIELD_GUIDE.map((entry, i) =>
      `<button class="guide-thumb" data-i="${i}" title="${escapeHtmlGlobal(entry.name)}">` +
        `<img src="${escapeHtmlGlobal(speciesPortraits[entry.id] || '')}" alt="" />` +
      `</button>`
    ).join('');
    thumbs.querySelectorAll('.guide-thumb').forEach(b => {
      b.addEventListener('click', () => {
        guideIndex = parseInt(b.dataset.i, 10) || 0;
        renderGuide();
      });
    });
  }
}

function renderGuide() {
  const e = FIELD_GUIDE[guideIndex];
  if (!e) return;
  const $ = (id) => document.getElementById(id);
  const portrait = speciesPortraits[e.id] || '';
  const img = $('guide-portrait');
  if (img) { img.src = portrait; img.alt = e.name; }
  if ($('guide-name'))   $('guide-name').textContent  = e.name;
  if ($('guide-latin'))  $('guide-latin').textContent = e.latin;
  if ($('guide-meta'))   $('guide-meta').innerHTML =
    `<span>Size</span><span>${escapeHtmlGlobal(e.size)}</span>` +
    `<span>Found in</span><span>${escapeHtmlGlobal(e.lakes)}</span>`;
  if ($('guide-fact'))   $('guide-fact').textContent = e.fact;
  if ($('guide-flies'))  $('guide-flies').innerHTML  = (e.flies || [])
    .map(f => `<span class="guide-fly-chip">${escapeHtmlGlobal(f)}</span>`).join('');
  if ($('guide-pageno')) $('guide-pageno').textContent = `${guideIndex + 1} / ${FIELD_GUIDE.length}`;
  // Highlight current thumb + scroll it into view
  document.querySelectorAll('#guide-thumbs .guide-thumb').forEach((b, i) => {
    b.classList.toggle('active', i === guideIndex);
    if (i === guideIndex) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });
}

function drawChatBubble(cx, cy, text) {
  push();
  translate(cx, cy - 56);
  if (typeof zoom === 'number' && zoom > 0) scale(1 / zoom);
  textAlign(CENTER, CENTER);
  textSize(12);
  textFont('-apple-system, system-ui, sans-serif');
  const w = Math.max(40, textWidth(text) + 18);
  const h = 22;
  noStroke();
  fill(245, 245, 240, 235);
  rectMode(CENTER);
  rect(0, 0, w, h, 6);
  // Pointer below
  triangle(-5, h/2 - 1, 5, h/2 - 1, 0, h/2 + 6);
  rectMode(CORNER);
  fill(30, 40, 35, 240);
  text(text, 0, 1);
  pop();
}

