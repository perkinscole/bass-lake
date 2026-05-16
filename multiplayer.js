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

// Expose globally for sketch.js.
window.MP = MP;
