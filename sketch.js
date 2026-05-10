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
let player;        // the kayak the user controls
let cast = null;   // active fly cast (null when not cast)
let MAX_CAST_RANGE = 220;       // current cast range (depends on rod tier)
const KAYAK_BASE_SPEED = 3.4;   // multiplied by kayak tier speed factor

// ---- FLY TYPES ----
// Each fly catches certain species. The player picks one with 1/2/3.
const FLY_CONFIG = {
  fly: {
    label: 'Dry Fly',
    catches: { bluegill: true, pumpkinseed: true },
    flyColor: [220, 200, 130],
    legsColor: [120, 100, 60],
    sinks: false,                  // floats high on the surface
    biteRange: 22,
    interestRange: 80,
    shortcut: '1',
  },
  nymph: {
    label: 'Nymph',
    catches: { crappie: true },
    flyColor: [120, 95, 60],
    legsColor: [70, 55, 35],
    sinks: true,                   // drifts a bit deeper
    biteRange: 28,
    interestRange: 110,
    shortcut: '2',
  },
  woolyBugger: {
    label: 'Wooly Bugger',
    catches: { bass: true },
    flyColor: [40, 32, 28],
    legsColor: [25, 20, 18],
    sinks: true,
    biteRange: 36,
    interestRange: 160,
    shortcut: '3',
  },
};
let selectedFly = 'fly';
let catchCount = { bluegill: 0, pumpkinseed: 0, crappie: 0, bass: 0 };
let lastCatchToast = null;        // { species, time } for brief on-screen popup
let lastMissToast = null;         // { reason, time } when a fish escapes

// ---- PROGRESSION ----
// Player state — earned/spent through gameplay, saved to localStorage so it
// persists across sessions. Start with the smallest setup; everything else
// is bought from the tackle shop on the menu screen.
const PROGRESS_KEY = 'bassLakeState_v1';
let playerState = {
  money: 0,
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
}
function loadProgress() {
  try {
    let data = localStorage.getItem(PROGRESS_KEY);
    if (data) {
      let parsed = JSON.parse(data);
      // shallow-merge so new fields added later get default values
      if (parsed.money != null) playerState.money = parsed.money;
      if (parsed.unlocks) {
        if (parsed.unlocks.flies) Object.assign(playerState.unlocks.flies, parsed.unlocks.flies);
        if (parsed.unlocks.rod   != null) playerState.unlocks.rod = parsed.unlocks.rod;
        if (parsed.unlocks.kayak != null) playerState.unlocks.kayak = parsed.unlocks.kayak;
        if (parsed.unlocks.sonar != null) playerState.unlocks.sonar = parsed.unlocks.sonar;
      }
    }
  } catch {}
}

// Pre-baked static world image — drawn once at setup, then sub-region blitted
// every frame. Contains: forest floor, dirt/sand specks, trees, lake water +
// surface patches, tree shadows, shoreline edge, rocks, logs.
let staticImg = null;
const STATIC_SCALE = 0.5;

// Pre-rendered species sprites as data URLs — used by the catch-toast HUD
// element to show a picture of the fish you just caught.
let speciesPortraits = {};
let menuOpen = true;     // game ignores input while menu is up

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
  lake = new Lake(WORLD_W, WORLD_H);

  // spawn the kayak in the first basin and center the camera on it
  let b = lake.basins[0];
  player = new Kayak(b.x, b.y);
  cam.x = constrain(player.pos.x - width / (2 * zoom), 0, WORLD_W - width / zoom);
  cam.y = constrain(player.pos.y - height / (2 * zoom), 0, WORLD_H - height / zoom);

  // Mix of bluegill (most common), pumpkinseed (lily-pad lovers), crappie (deep-water schoolers)
  // Spawned in habitat-appropriate spots so they start near their preferred structure.
  for (let i = 0; i < NUM_BASS; i++) {
    let p = lake.randomEdgePoint();
    bass.push(new Bass(p.x, p.y));
  }
  for (let i = 0; i < 200; i++) {
    let p = lake.randomEdgePoint(random(0.78, 0.92));
    lilypads.push({ x: p.x, y: p.y, r: random(14, 30), a: random(TWO_PI) });
  }
  for (let i = 0; i < 700; i++) {
    let p = lake.randomEdgePoint(random(0.7, 0.85));
    weeds.push({ x: p.x, y: p.y, h: random(20, 60), sway: random(TWO_PI) });
  }
  for (let i = 0; i < 300; i++) {
    let p = lake.randomEdgePoint(random(0.86, 0.98));
    cattails.push({ x: p.x, y: p.y, h: random(28, 55), sway: random(TWO_PI) });
  }

  // Trees in the dirt around the lake — overhanging cast shadows over water
  for (let i = 0; i < 250; i++) {
    let p = randomShorePoint(random(40, 320));
    trees.push({
      x: p.x,
      y: p.y,
      r: random(40, 95),
      shade: random(0.15, 0.35),
      hue: 50 + random(-12, 12),
      val: 80 + random(-20, 20),
      tone: 50 + random(-15, 15),
    });
  }

  // Fallen logs partially in water
  for (let i = 0; i < 30; i++) {
    let p = lake.randomEdgePoint(random(0.85, 1.02));
    let inward = lake.inwardNormal(p.x, p.y);
    let angle = inward.heading() + random(-0.6, 0.6);
    logs.push({
      x: p.x,
      y: p.y,
      len: random(80, 160),
      thick: random(10, 18),
      a: angle,
    });
  }

  // Rocks scattered along shore and shallows
  for (let i = 0; i < 110; i++) {
    let p = lake.randomEdgePoint(random(0.88, 1.03));
    rocks.push({
      x: p.x, y: p.y,
      r: random(6, 18),
      shade: 60 + random(-20, 30),
    });
  }

  // Spawn panfish AFTER habitat structures so each species can pick its preferred target.
  // Bluegill: most numerous, near weed beds.
  let nBluegill = floor(NUM_PANFISH * 0.45);
  let nPumpkin  = floor(NUM_PANFISH * 0.25);
  let nCrappie  = NUM_PANFISH - nBluegill - nPumpkin;
  for (let i = 0; i < nBluegill; i++) {
    let p = (weeds.length > 0 && random() < 0.7)
      ? jitterAround(random(weeds), 60)
      : lake.randomEdgePoint(random(0.6, 0.85));
    if (lake.contains(p.x, p.y, 20)) panfish.push(new Panfish(p.x, p.y, 'bluegill'));
    else { let q = lake.randomInteriorPoint(); panfish.push(new Panfish(q.x, q.y, 'bluegill')); }
  }
  for (let i = 0; i < nPumpkin; i++) {
    let p = (lilypads.length > 0 && random() < 0.7)
      ? jitterAround(random(lilypads), 50)
      : lake.randomEdgePoint(random(0.6, 0.82));
    if (lake.contains(p.x, p.y, 20)) panfish.push(new Panfish(p.x, p.y, 'pumpkinseed'));
    else { let q = lake.randomInteriorPoint(); panfish.push(new Panfish(q.x, q.y, 'pumpkinseed')); }
  }
  for (let i = 0; i < nCrappie; i++) {
    // crappie prefer deeper water — spawn near interior, near logs if available
    let p;
    if (logs.length > 0 && random() < 0.5) {
      p = jitterAround(random(logs), 70);
    } else {
      p = lake.randomEdgePoint(random(0.2, 0.55));
    }
    if (lake.contains(p.x, p.y, 30)) panfish.push(new Panfish(p.x, p.y, 'crappie'));
    else { let q = lake.randomInteriorPoint(); panfish.push(new Panfish(q.x, q.y, 'crappie')); }
  }

  buildStaticImage();
  buildSpeciesPortraits();
  populateMenuFlyGrid();
  initSonar();
  refreshUnlocks();
  let btn = document.getElementById('start-button');
  if (btn) btn.addEventListener('click', () => {
    document.getElementById('menu').classList.add('hidden');
    menuOpen = false;
  });
  let shopBtn = document.getElementById('shop-button');
  if (shopBtn) shopBtn.addEventListener('click', () => {
    populateShop();
    document.getElementById('shop').classList.remove('hidden');
  });
  let shopClose = document.getElementById('shop-close');
  if (shopClose) shopClose.addEventListener('click', () => {
    document.getElementById('shop').classList.add('hidden');
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
    let nx = dx / MAX_R, ny = dy / MAX_R;
    keys.left  = nx < -DEADZONE;
    keys.right = nx >  DEADZONE;
    keys.up    = ny < -DEADZONE;
    keys.down  = ny >  DEADZONE;
  };
  let resetStick = () => {
    stick.style.transform = 'translate(0,0)';
    keys.left = keys.right = keys.up = keys.down = false;
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

  // Cast button — touch and hold to false-cast, release to deliver. On mobile
  // the cast goes in the direction of the kayak's current heading (no cursor).
  let castBtn = document.getElementById('cast-btn');
  let castPointer = null;
  castBtn.addEventListener('pointerdown', e => {
    if (menuOpen) return;
    castPointer = e.pointerId;
    castBtn.setPointerCapture(e.pointerId);
    castBtn.classList.add('charging');
    // Fish on the line — hold-to-reel during the fight (apply tension)
    if (cast && cast.state === 'hooked') {
      cast.reeling = true;
      return;
    }
    if (cast && cast.state === 'fishing') {
      cast.startReel();
      castBtn.classList.remove('charging');
      return;
    }
    if (cast && cast.state !== 'done') return;
    // Aim the cast toward the bow of the kayak by faking the mouse position
    // ahead of the kayak. The aim helpers in FlyCast read mouseX/mouseY/zoom/cam.
    let aheadDist = MAX_CAST_RANGE * 0.9;
    let wx = player.pos.x + Math.cos(player.heading) * aheadDist;
    let wy = player.pos.y + Math.sin(player.heading) * aheadDist;
    window.mouseX = (wx - cam.x) * zoom;
    window.mouseY = (wy - cam.y) * zoom;
    cast = new FlyCast();
    e.preventDefault();
  });
  let endCast = (e) => {
    if (e.pointerId !== castPointer) return;
    castBtn.classList.remove('charging');
    castPointer = null;
    if (cast && cast.state === 'aerial') cast.release();
    if (cast && cast.state === 'hooked') cast.reeling = false;
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
      populateMenuFlyGrid();   // unlocked fly visuals
      populateShop();          // refresh prices/buttons
    });
  });
}

function buildSpeciesPortraits() {
  // External PNG portraits (place these files in /images/). The img tags load
  // them lazily; if a file is missing the toast falls back to no image.
  speciesPortraits = {
    bluegill:    'images/bluegill-removebg-preview.png',
    pumpkinseed: 'images/pumpkinseed-removebg-preview.png',
    crappie:     'images/blackcrappie-removebg-preview.png',
    bass:        'images/largemouth-removebg-preview.png',
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

  // trees: trunks then canopies (matches drawTrees)
  for (let t of trees) {
    g.fill(40, 30, 22, 220);
    g.ellipse(t.x, t.y, t.r * 0.35, t.r * 0.35);
  }
  for (let t of trees) {
    g.fill(0, 0, 0, 60);
    g.ellipse(t.x + 6, t.y + 8, t.r * 1.6, t.r * 1.4);
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

  // lake water polygon
  g.fill(28, 64, 52);
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
  g.stroke(40, 28, 18, 220);
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

  staticImg = g;
}

function jitterAround(obj, r) {
  return { x: obj.x + random(-r, r), y: obj.y + random(-r, r) };
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

  // lily pads on top so fish appear to swim under them
  for (let lp of lilypads) { if (inView(lp.x, lp.y, lp.r * 1.5)) drawLilypad(lp); }

  // kayak floats on top of lily pads (it's at the surface)
  player.draw();

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

  pop();

  // ---- HUD updates (HTML overlay) ----
  if (frameCount % 6 === 0) {
    let flyEl = document.getElementById('hud-fly');
    let moneyEl = document.getElementById('hud-money');
    let catchEl = document.getElementById('hud-catch');
    if (flyEl) {
      let flyLabels = ['fly', 'nymph', 'woolyBugger'].map((k, i) => {
        let unlocked = playerState.unlocks.flies[k];
        return `[${i + 1} ${FLY_CONFIG[k].label}${unlocked ? '' : ' 🔒'}]`;
      }).join(' ');
      flyEl.textContent = `Fly: ${FLY_CONFIG[selectedFly].label}  ${flyLabels}`;
    }
    if (moneyEl) moneyEl.textContent = `$${playerState.money}`;
    if (catchEl) {
      catchEl.textContent =
        `Caught — bluegill ${catchCount.bluegill}  ·  pumpkinseed ${catchCount.pumpkinseed}  ·  ` +
        `crappie ${catchCount.crappie}  ·  bass ${catchCount.bass}`;
    }
  }
  // Sonar — scroll one column per frame
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
        toast.textContent = lastMissToast.reason === 'snap' ? 'Line snapped!' : 'Got away!';
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
          let moneyTag = lastCatchToast.money ? `<div class="reward">+$${lastCatchToast.money}</div>` : '';
          toast.innerHTML =
            `<div class="card">${imgTag}` +
            `<div class="label">Catch!</div>` +
            `<div class="species">${lastCatchToast.species}</div>` +
            moneyTag +
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

  // respawn bass slowly when caught
  if (bass.length < NUM_BASS && frameCount % 600 === 0) {
    let p = lake.randomEdgePoint(random(0.78, 0.93));
    bass.push(new Bass(p.x, p.y));
  }

  // respawn panfish slowly so the lake stays alive — keep species roughly balanced
  if (panfish.length < NUM_PANFISH && frameCount % 90 === 0) {
    let counts = { bluegill: 0, pumpkinseed: 0, crappie: 0 };
    for (let f of panfish) counts[f.species]++;
    let weights = { bluegill: 0.45, pumpkinseed: 0.25, crappie: 0.30 };
    let lowest = 'bluegill', lowestRatio = Infinity;
    for (let sp of Object.keys(weights)) {
      let r = counts[sp] / (NUM_PANFISH * weights[sp]);
      if (r < lowestRatio) { lowestRatio = r; lowest = sp; }
    }
    let p = lake.randomInteriorPoint();
    panfish.push(new Panfish(p.x, p.y, lowest));
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() {
  if (menuOpen) return;
  if (keyCode === LEFT_ARROW || key === 'a' || key === 'A') keys.left = true;
  if (keyCode === RIGHT_ARROW || key === 'd' || key === 'D') keys.right = true;
  if (keyCode === UP_ARROW || key === 'w' || key === 'W') keys.up = true;
  if (keyCode === DOWN_ARROW || key === 's' || key === 'S') keys.down = true;
  if (key === '1') trySelectFly('fly');
  if (key === '2') trySelectFly('nymph');
  if (key === '3') trySelectFly('woolyBugger');
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
      let kind = n;  // 0..1
      let r, g, b, a;
      if (kind < 0.4) {
        // darker green — algae shadow / submerged weeds visible from above
        r = 18; g = 48; b = 38; a = 120 * m + 30;
      } else if (kind < 0.7) {
        // slightly brighter teal — clearer water spots
        r = 50; g = 95; b = 78; a = 90 * m + 30;
      } else {
        // brownish tannin tint near woody banks
        r = 60; g = 55; b = 30; a = 100 * m + 25;
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
    // Warm yellow-green forest floor — clearly distinct from cool teal water
    background(80, 95, 45);
    // Specks are tiny; skip drawing at low zoom where they aren't perceptible.
    if (zoom < 0.5) return;
    noStroke();
    for (let s of this.dirtSpecks) {
      if (!inView(s.x, s.y, 10)) continue;
      fill(s.c[0], s.c[1], s.c[2], 180);
      ellipse(s.x, s.y, s.r);
    }
    for (let s of this.sandSpecks) {
      if (!inView(s.x, s.y, 10)) continue;
      fill(195, 170, 115, 140);
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

    // Algae motes / surface scum
    for (let p of this.shimmerPoints) {
      if (!inView(p.x, p.y, 12)) continue;
      let a = noise(p.x * 0.01, p.y * 0.01, frameCount * 0.008);
      fill(140, 165, 100, a * 35);
      ellipse(p.x, p.y, 4 + a * 6, 2 + a * 3);
    }
  }
}

// ---------- PANFISH species config ----------
const SPECIES = {
  bluegill: {
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
    zRange: [0.15, 0.50],     // shallow-mid: edges of weed beds
  },
  pumpkinseed: {
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
    zRange: [0.40, 0.70],     // suspends mid-column near structure
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
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = createVector();
    this.acc = createVector();
    this.size = random(20, 28);
    this.dashSpeed = 7.0;
    this.state = 'lurk'; // 'lurk' | 'dash' | 'recover'
    this.target = null;
    this.cooldown = 0;
    this.lurkPoint = this._pickLurkPoint();
    this.lurkHeading = random(TWO_PI);
    this.wiggle = random(TWO_PI);
    this.strikeRange = random(70, 95);
    this.species = 'bass';
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
        this.cooldown = 240 + floor(random(360));
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

    noStroke();
    fill(0, 6, 14, baseA * 0.7);
    ellipse(0, 0, s * 2.6, s * 1.0);
    fill(0, 5, 12, baseA);
    ellipse(0, 0, s * 2.0, s * 0.78);
    push();
    translate(-s * 0.85, 0);
    rotate(tailW);
    fill(0, 6, 14, baseA * 0.85);
    triangle(0, 0, -s * 0.55, -s * 0.45, -s * 0.55, s * 0.45);
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
  }

  update() {
    // Rotation-based controls: A/D turn the hull, W/S paddle along the heading.
    // This gives free, any-angle movement instead of 8-cardinal directions.
    const TURN_RATE = 0.045;   // radians/frame at full input
    const FORWARD_ACC = 0.22;
    const BACKWARD_ACC = 0.13;

    let turn = 0;
    if (keys.left)  turn -= 1;
    if (keys.right) turn += 1;
    let thrust = 0;
    if (keys.up)    thrust += 1;
    if (keys.down)  thrust -= 0.7;     // backpaddle is weaker

    // turn rate scales slightly with speed so the kayak feels like it's
    // pivoting around the paddler, not on a dime
    let speedFactor = 0.6 + 0.4 * (1 - Math.min(this.vel.mag() / this.maxSpeed, 1));
    this.heading += turn * TURN_RATE * speedFactor;

    if (thrust !== 0) {
      let acc = thrust > 0 ? FORWARD_ACC : BACKWARD_ACC;
      this.vel.x += Math.cos(this.heading) * acc * thrust;
      this.vel.y += Math.sin(this.heading) * acc * thrust;
      this.paddlePhase += 0.22;
    }
    this.targetHeading = this.heading;   // hull always faces its current heading

    // friction & cap
    this.vel.mult(this.friction);
    this.vel.limit(this.maxSpeed);

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

    // Hull — long elongated shape, painted bright accent color so it's spottable
    fill(60, 70, 100);
    ellipse(0, 0, s * 2.5, s * 0.8);
    // accent stripe along upper edge (visible from above)
    fill(220, 110, 60);
    ellipse(0, -s * 0.18, s * 2.3, s * 0.16);
    // hull lip / rim
    fill(40, 50, 75);
    ellipse(0, 0, s * 2.5, s * 0.8);
    fill(95, 110, 145);
    ellipse(0, -s * 0.02, s * 2.2, s * 0.55);

    // cockpit opening (where the paddler sits) — dark oval
    fill(15, 20, 28);
    ellipse(s * 0.05, 0, s * 0.85, s * 0.42);

    // paddler torso + life jacket
    fill(200, 80, 50);                   // bright orange PFD
    ellipse(s * 0.05, 0, s * 0.55, s * 0.4);
    fill(170, 60, 40);                   // shadow side
    arc(s * 0.05, 0, s * 0.55, s * 0.4, -PI / 2, PI / 2);

    // arms — thin segments holding the paddle shaft
    let armReach = s * 0.18;
    let armSpread = sin(this.paddlePhase) * s * 0.12;
    fill(190, 75, 45);
    ellipse(s * 0.10,  armReach + armSpread * 0.3, s * 0.15, s * 0.12);
    ellipse(s * 0.10, -armReach - armSpread * 0.3, s * 0.15, s * 0.12);

    // head (tan skin tone) + cap
    fill(225, 195, 155);
    ellipse(s * 0.05, 0, s * 0.28, s * 0.28);
    fill(60, 110, 70);                  // green cap
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
    this.fightT = 0;                       // frames since hookset
    this.reeling = false;                  // player applying tension this frame
    this.tension = 0;                      // 0..1 — line load. >= 1 → snap
    this.fishStamina = 1;                  // 1 → fresh, 0 → played out
    this.runTimer = 0;                     // frames remaining in a fish run
    this.runCooldown = 0;                  // frames before another run can start
    this.runDir = { x: 0, y: 0 };          // direction the current run is pulling
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
      // Each full half-cycle (sin sign flip) extends the line a bit until max.
      const SWING_SPEED = 0.085;
      this.aerialPhase += SWING_SPEED;
      let halfCycle = Math.floor(this.aerialPhase / Math.PI);
      if (halfCycle > this.lastHalfCycle) {
        this.lineLength = Math.min(this.lineLength + 55, this.maxLineLength);
        this.lastHalfCycle = halfCycle;
      }
      let aim = this._aimDir();
      let extend = Math.sin(this.aerialPhase);   // -1..1
      this.flyX = r.x + aim.x * this.lineLength * extend;
      this.flyY = r.y + aim.y * this.lineLength * extend;
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
        // a fly lands gently — small ripple, no splash
        ripples.push(new Ripple(this.flyX, this.flyY, 14));
      }
    } else if (this.state === 'fishing') {
      // Fly drifts a touch on the water surface
      let n1 = noise(this.flyX * 0.005, this.flyY * 0.005, frameCount * 0.005 + this.driftSeed);
      let n2 = noise(this.flyX * 0.005 + 50, this.flyY * 0.005 + 50, frameCount * 0.005 + this.driftSeed);
      this.flyX += (n1 - 0.5) * 0.4;
      this.flyY += (n2 - 0.5) * 0.4;

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
    let r = this._rodTip();
    let aim = this._aimDir();
    // line length determines cast distance, clamped to mouse dist if shorter
    let castDist = Math.min(this.lineLength, aim.dist);
    if (castDist < 60) {
      // not enough load — abort cast
      this.state = 'done';
      return;
    }
    this.startX = this.flyX;
    this.startY = this.flyY;
    this.targetX = r.x + aim.x * castDist;
    this.targetY = r.y + aim.y * castDist;
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

  _findBitingFish() {
    let cfg = this.cfg;
    let bestD = cfg.biteRange;
    let best = null;
    // panfish first
    for (let f of panfish) {
      if (f.dead || f.hooked) continue;
      if (!cfg.catches[f.species]) continue;
      let d = Math.hypot(f.pos.x - this.flyX, f.pos.y - this.flyY);
      if (d < bestD) { bestD = d; best = f; }
    }
    // bass
    for (let b of bass) {
      if (b.hooked) continue;
      if (!cfg.catches.bass) continue;
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
    this.runCooldown = 90;     // grace period before the fish's first run
    ripples.push(new Ripple(this.flyX, this.flyY, 28));
    ripples.push(new Ripple(this.flyX, this.flyY, 14));
  }

  _onCatch() {
    if (this.hookedFish) {
      let species = this.hookedFish.species;
      catchCount[species] = (catchCount[species] || 0) + 1;
      let reward = REWARDS[species] || 0;
      playerState.money += reward;
      saveProgress();
      lastCatchToast = { species, time: frameCount, money: reward };
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
    // Line broke — fish escapes with the fly. Brief ripple + miss toast.
    if (this.hookedFish) {
      this.hookedFish.hooked = false;
      this.hookedFish = null;
    }
    ripples.push(new Ripple(this.flyX, this.flyY, 22));
    lastMissToast = { reason: 'snap', time: frameCount };
    this.state = 'done';
  }

  draw() {
    if (this.state === 'done') return;
    let r = this._rodTip();

    // Power meter (line length growing) shown above the kayak during false casts
    if (this.state === 'aerial') {
      let pct = (this.lineLength - 70) / (this.maxLineLength - 70);
      pct = constrain(pct, 0, 1);
      noStroke();
      fill(0, 0, 0, 140);
      rect(player.pos.x - 22, player.pos.y - 32, 44, 6, 2);
      fill(255, 200, 80);
      rect(player.pos.x - 21, player.pos.y - 31, 42 * pct, 4, 1);
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
  if (cast && cast.state === 'hooked') {
    cast.reeling = true;
    return;
  }
  if (cast && cast.state === 'fishing') {
    cast.startReel();
    return;
  }
  if (cast && cast.state !== 'done') return;   // mid-flight or retrieving
  cast = new FlyCast();
}

function mouseReleased() {
  if (menuOpen) return;
  if (cast && cast.state === 'aerial') cast.release();
  if (cast && cast.state === 'hooked') cast.reeling = false;
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
