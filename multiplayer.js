// Bass Lake — multiplayer layer (Supabase).
//
// Phase 2: connect to Supabase and sign the player in anonymously so every
// later phase (lobbies, ghost kayaks, leaderboards) has an identity to work
// with. No game logic here yet — this just establishes the connection.
//
// The publishable key below is meant to live in client code; it only grants
// the row-level-security-limited access defined in supabase-schema.sql.
// Never put the service_role / secret key in here.

const SUPABASE_URL  = 'https://vopffkxpthzgwsafwtvt.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_7VSOHFTXEC_2xg32PnvWIA_B3fTnTiy';

// The whole multiplayer subsystem hangs off this object so sketch.js can
// check `MP.ready` / `MP.userId` without caring how the connection was made.
const MP = {
  client:  null,   // supabase-js client
  userId:  null,   // this player's anonymous auth UID
  ready:   false,  // true once signed in
  error:   null,   // connection error, if any
  _readyResolvers: [],
};

// Resolves once the player is signed in (or rejects on failure).
MP.whenReady = function () {
  if (MP.ready)  return Promise.resolve(MP);
  if (MP.error)  return Promise.reject(MP.error);
  return new Promise((resolve, reject) => {
    MP._readyResolvers.push({ resolve, reject });
  });
};

MP._settle = function (err) {
  MP.error = err || null;
  MP.ready = !err;
  for (const r of MP._readyResolvers) {
    err ? r.reject(err) : r.resolve(MP);
  }
  MP._readyResolvers = [];
};

(async function initMultiplayer() {
  try {
    // supabase-js UMD bundle exposes a global `supabase` with createClient.
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      throw new Error('supabase-js failed to load from the CDN');
    }

    MP.client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    // Reuse an existing session if the player has one, else sign in anew.
    let { data: sessionData } = await MP.client.auth.getSession();
    if (!sessionData.session) {
      const { error } = await MP.client.auth.signInAnonymously();
      if (error) throw error;
      ({ data: sessionData } = await MP.client.auth.getSession());
    }

    MP.userId = sessionData.session?.user?.id || null;
    if (!MP.userId) throw new Error('signed in but got no user id');

    MP._settle(null);
    console.log('[MP] connected — anonymous id', MP.userId);
  } catch (err) {
    console.warn('[MP] connection failed — staying single-player only:', err.message || err);
    MP._settle(err);
  }
})();

// ---------------------------------------------------------------------------
// Player identity (persisted across sessions — anonymous UID never changes)
// ---------------------------------------------------------------------------

const NAME_KEY = 'bassLake.playerName';
MP.getPlayerName = function () {
  let n = localStorage.getItem(NAME_KEY);
  if (n) return n;
  n = 'Angler ' + (Math.floor(Math.random() * 9000) + 1000);
  localStorage.setItem(NAME_KEY, n);
  return n;
};
MP.setPlayerName = function (n) {
  n = (n || '').trim().slice(0, 24);
  if (n) localStorage.setItem(NAME_KEY, n);
};

// ---------------------------------------------------------------------------
// Pin + seed helpers
// ---------------------------------------------------------------------------

const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
function genPin(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += PIN_ALPHABET[Math.floor(Math.random() * PIN_ALPHABET.length)];
  return s;
}
// FNV-1a — same algorithm as sketch.js's hashSeed so pin -> seed agrees
// across the boot path and the multiplayer module.
function mpHashSeed(str) {
  str = String(str);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1e9;
}

// ---------------------------------------------------------------------------
// Lobby state — populated when in a derby
// ---------------------------------------------------------------------------

MP.currentDerby = null;   // row from `derbies`, null when not in one
MP.roster       = [];     // rows from `derby_players` for the current derby
MP._lobbyCh     = null;   // realtime channel
MP._listeners   = [];

MP.onLobbyChange = function (fn) {
  MP._listeners.push(fn);
  return () => { MP._listeners = MP._listeners.filter(f => f !== fn); };
};
MP._emit = function () {
  const payload = { derby: MP.currentDerby, roster: MP.roster };
  for (const fn of MP._listeners) { try { fn(payload); } catch (e) { console.warn(e); } }
};

// ---------------------------------------------------------------------------
// Derby API
// ---------------------------------------------------------------------------

MP.createDerby = async function ({ level = 'bassLake', duration = 300, isPublic = true } = {}) {
  await MP.whenReady();
  // up to 5 tries to dodge pin collisions (the unique constraint catches them)
  for (let i = 0; i < 5; i++) {
    const pin  = genPin();
    const seed = mpHashSeed(pin);
    const { data, error } = await MP.client.from('derbies').insert({
      pin, host_id: MP.userId, level, lake_seed: seed,
      duration_secs: duration, is_public: isPublic,
    }).select().single();
    if (!error) {
      MP.currentDerby = data;
      await MP._joinSelf(data.id);
      await MP._subscribeLobby(data.id);
      return data;
    }
    if (error.code !== '23505') throw error; // not a unique-violation -> bail
  }
  throw new Error('could not allocate a pin');
};

MP.joinDerbyByPin = async function (pin) {
  await MP.whenReady();
  pin = (pin || '').toUpperCase().trim();
  if (!pin) throw new Error('enter a pin');
  const { data, error } = await MP.client.from('derbies').select('*').eq('pin', pin).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('no derby with that pin');
  if (data.status === 'done') throw new Error('that derby is already over');
  MP.currentDerby = data;
  await MP._joinSelf(data.id);
  await MP._subscribeLobby(data.id);
  return data;
};

MP.joinDerbyById = async function (derbyId) {
  await MP.whenReady();
  const { data, error } = await MP.client.from('derbies').select('*').eq('id', derbyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('derby disappeared');
  if (data.status === 'done') throw new Error('that derby is already over');
  MP.currentDerby = data;
  await MP._joinSelf(data.id);
  await MP._subscribeLobby(data.id);
  return data;
};

MP._joinSelf = async function (derbyId) {
  const { error } = await MP.client.from('derby_players').upsert(
    { derby_id: derbyId, player_id: MP.userId, name: MP.getPlayerName() },
    { onConflict: 'derby_id,player_id' }
  );
  if (error) throw error;
};

MP.leaveDerby = async function () {
  if (!MP.currentDerby) return;
  const did = MP.currentDerby.id;
  try { await MP.client.from('derby_players').delete().eq('derby_id', did).eq('player_id', MP.userId); } catch {}
  if (MP._lobbyCh) { try { await MP.client.removeChannel(MP._lobbyCh); } catch {} }
  MP._lobbyCh = null;
  MP.currentDerby = null;
  MP.roster = [];
  if (MP.ghosts) MP.ghosts.clear();
  MP._emit();
};

MP.listOpenDerbies = async function () {
  await MP.whenReady();
  const { data, error } = await MP.client.from('derbies')
    .select('*, derby_players(player_id)')
    .eq('is_public', true).eq('status', 'lobby')
    .order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return data || [];
};

MP.startDerby = async function () {
  if (!MP.currentDerby) throw new Error('not in a derby');
  if (MP.currentDerby.host_id !== MP.userId) throw new Error('only the host can start');
  const now = new Date();
  const end = new Date(now.getTime() + MP.currentDerby.duration_secs * 1000);
  const { data, error } = await MP.client.from('derbies').update({
    status: 'live', start_at: now.toISOString(), end_at: end.toISOString(),
  }).eq('id', MP.currentDerby.id).select().single();
  if (error) throw error;
  MP.currentDerby = data;
  MP._emit();
  return data;
};

MP._subscribeLobby = async function (derbyId) {
  if (MP._lobbyCh) { try { await MP.client.removeChannel(MP._lobbyCh); } catch {} }
  MP.roster = [];
  MP.ghosts.clear();
  // self:false means we don't echo our own position broadcasts back to ourselves
  const ch = MP.client.channel('lobby-' + derbyId, { config: { broadcast: { self: false } } });
  ch.on('postgres_changes',
    { event: '*', schema: 'public', table: 'derby_players', filter: 'derby_id=eq.' + derbyId },
    () => MP._refreshRoster()
  );
  ch.on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'derbies', filter: 'id=eq.' + derbyId },
    (payload) => { MP.currentDerby = payload.new; MP._emit(); }
  );
  ch.on('broadcast', { event: 'pos' }, MP._handlePos);
  await ch.subscribe();
  MP._lobbyCh = ch;
  await MP._refreshRoster();
};

// ---------------------------------------------------------------------------
// Ghost kayaks — broadcast position to everyone in the derby (Phase 4)
// ----------------------------------------------------------------------------
// We use Supabase Realtime's `broadcast` event (NOT the database) — ephemeral,
// no writes, ~10 Hz is fine for a casual fishing game. Each peer renders the
// others' kayaks with interpolation between the last two received positions.
// ---------------------------------------------------------------------------

MP.ghosts    = new Map();   // player_id -> interpolation-ready position snapshot
MP._lastSent = 0;

MP._handlePos = function (raw) {
  const p = raw && raw.payload;
  if (!p || !p.id || p.id === MP.userId) return;
  const now = performance.now();
  let g = MP.ghosts.get(p.id);
  if (!g) {
    g = {
      name: p.name || 'Angler',
      x: p.x, y: p.y, h: p.h, pp: p.pp || 0,
      prevX: p.x, prevY: p.y, prevH: p.h,
      recvT: now, prevRecvT: now - 100,
      lastSeen: now,
    };
    MP.ghosts.set(p.id, g);
  } else {
    g.prevX = g.x; g.prevY = g.y; g.prevH = g.h;
    g.prevRecvT = g.recvT;
    g.recvT = now;
    g.x = p.x; g.y = p.y; g.h = p.h; g.pp = p.pp || 0;
    if (p.name) g.name = p.name;
    g.lastSeen = now;
  }
};

MP.broadcastPosition = function ({ x, y, heading, paddlePhase }) {
  if (!MP._lobbyCh || !MP.currentDerby || MP.currentDerby.status !== 'live') return;
  const now = performance.now();
  if (now - MP._lastSent < 100) return;   // ~10 Hz cap
  MP._lastSent = now;
  MP._lobbyCh.send({
    type: 'broadcast', event: 'pos',
    payload: {
      id:   MP.userId,
      name: MP.getPlayerName(),
      x:    Math.round(x),
      y:    Math.round(y),
      h:    Math.round(heading * 1000) / 1000,
      pp:   Math.round((paddlePhase || 0) * 100) / 100,
    },
  });
};

// Drop ghosts we haven't heard from in 5s (tab closed, network blip, etc.)
setInterval(() => {
  const now = performance.now();
  for (const [id, g] of MP.ghosts) {
    if (now - g.lastSeen > 5000) MP.ghosts.delete(id);
  }
}, 1000);

// ---------------------------------------------------------------------------
// Scoring (Phase 5)
// ----------------------------------------------------------------------------
// recordCatch() inserts a row into `catches`; a Postgres trigger then sums
// that player's catches into derby_players.score atomically. Because
// authenticated users no longer have UPDATE rights on the score column,
// the only way to change your score is to actually land a fish.
// ---------------------------------------------------------------------------

MP.recordCatch = async function ({ species, weight, points }) {
  if (!MP.currentDerby || MP.currentDerby.status !== 'live') return;
  const { error } = await MP.client.from('catches').insert({
    derby_id:  MP.currentDerby.id,
    player_id: MP.userId,
    species,
    weight,
    points,
  });
  if (error) console.warn('[MP] recordCatch failed:', error.message);
};

// Host ends the derby — flips status to 'done', which every client gets via
// the existing realtime UPDATE subscription.
MP.endDerby = async function () {
  if (!MP.currentDerby) return;
  if (MP.currentDerby.host_id !== MP.userId) return;
  const { data, error } = await MP.client.from('derbies')
    .update({ status: 'done' })
    .eq('id', MP.currentDerby.id).select().single();
  if (error) { console.warn('[MP] endDerby failed:', error.message); return; }
  MP.currentDerby = data;
  MP._emit();
};

// Seconds remaining in the current derby (0 if over or not live).
MP.secondsRemaining = function () {
  const d = MP.currentDerby;
  if (!d || d.status !== 'live' || !d.end_at) return 0;
  const ms = new Date(d.end_at).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 1000));
};

MP._refreshRoster = async function () {
  if (!MP.currentDerby) return;
  const { data } = await MP.client.from('derby_players')
    .select('*').eq('derby_id', MP.currentDerby.id).order('joined_at');
  MP.roster = data || [];
  MP._emit();
};

// Expose globally for sketch.js.
window.MP = MP;
