/* MemoFlow - optional cloud sync via Supabase (Postgres + Realtime + Auth)
 *
 * Fully optional: with no Supabase project configured the app behaves exactly
 * as the local-only version. The user supplies their own Project URL and
 * anon key through the Sync settings dialog; both are stored only in this
 * browser's localStorage, never committed to the repository.
 *
 * Sync model: one JSON blob per signed-in user (table `memoflow_workspaces`).
 * Local saves are pushed after a short debounce; a Postgres Realtime
 * subscription pulls in changes made from other signed-in devices. Conflicts
 * are resolved by last-write-wins on the workspace's `updatedAt` timestamp -
 * fine for one person's own devices used one at a time, not for true
 * concurrent multi-user editing.
 */
(function (global) {
  'use strict';

  var U = global.Util;
  var S = global.Store;

  var TABLE = 'memoflow_workspaces';
  var CONFIG_KEY = 'memoflow.cloud.config';
  var DEVICE_KEY = 'memoflow.cloud.deviceId';
  var AUTOSYNC_KEY = 'memoflow.cloud.autosync';
  var PUSH_DEBOUNCE_MS = 1500;

  var client = null;
  var session = null;
  var channel = null;
  var status = 'unconfigured'; // unconfigured | signed-out | syncing | synced | error
  var lastError = '';
  var lastSyncedAt = null;
  var applyingRemote = false; // guard against feeding a pulled update back out
  var pushTimer = null;
  var listeners = [];
  var authSub = null; // supabase auth-state subscription, torn down on disconnect/reconfigure
  var deviceId = readDeviceId();

  function readDeviceId() {
    var id = null;
    try { id = global.localStorage.getItem(DEVICE_KEY); } catch (e) { /* ignore */ }
    if (!id) {
      id = U.uid('dev');
      try { global.localStorage.setItem(DEVICE_KEY, id); } catch (e) { /* ignore */ }
    }
    return id;
  }

  function getConfig() {
    try {
      var raw = global.localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setConfig(cfg) {
    try { global.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  function clearConfig() {
    try { global.localStorage.removeItem(CONFIG_KEY); } catch (e) { /* ignore */ }
  }

  function isAutoSyncOn() {
    try { return global.localStorage.getItem(AUTOSYNC_KEY) !== 'off'; } catch (e) { return true; }
  }
  function setAutoSync(on) {
    try { global.localStorage.setItem(AUTOSYNC_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  function setStatus(next, err) {
    status = next;
    lastError = err || '';
    var snap = snapshot();
    listeners.forEach(function (fn) { fn(snap); });
  }
  function snapshot() {
    return {
      available: !!(global.supabase && global.supabase.createClient),
      configured: !!getConfig(),
      status: status,
      error: lastError,
      email: (session && session.user && session.user.email) || '',
      lastSyncedAt: lastSyncedAt,
      autoSync: isAutoSyncOn()
    };
  }

  /* ---------------- lifecycle ---------------- */

  var generation = 0; // bumped on every init(); lets a stale async response from a
                       // superseded client (rapid reconfigure/disconnect) recognize
                       // it no longer speaks for the current one and stay quiet.

  function init() {
    var gen = ++generation;
    if (!global.supabase || !global.supabase.createClient) {
      setStatus('unconfigured', 'ライブラリを読み込めませんでした');
      return;
    }
    var cfg = getConfig();
    if (!cfg || !cfg.url || !cfg.anonKey) { setStatus('unconfigured'); return; }
    try {
      client = global.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    } catch (e) {
      client = null;
      setStatus('error', '接続設定を確認してください: ' + e.message);
      return;
    }

    client.auth.getSession().then(function (res) {
      if (gen !== generation) return;
      session = res.data && res.data.session;
      if (session) { setStatus('signed-in'); afterSignIn(); }
      else setStatus('signed-out');
    }, function (e) { if (gen === generation) setStatus('error', e.message); });

    var authResult = client.auth.onAuthStateChange(function (event, sess) {
      session = sess;
      if (sess) { setStatus('signed-in'); afterSignIn(); }
      else { teardownRealtime(); setStatus('signed-out'); }
    });
    authSub = authResult && authResult.data && authResult.data.subscription;

    S.onSave(function () { schedulePush(); });
  }

  /** Stop the current client from reacting to anything further (its signOut
   *  call still resolves asynchronously, so without this its stale auth
   *  event would otherwise overwrite the status set right after). */
  function teardownClient() {
    if (authSub) { try { authSub.unsubscribe(); } catch (e) { /* ignore */ } }
    authSub = null;
    teardownRealtime();
    client = null;
    session = null;
  }

  function configure(url, anonKey) {
    setConfig({ url: (url || '').trim(), anonKey: (anonKey || '').trim() });
    teardownClient();
    init();
  }

  function disconnect() {
    var oldClient = client;
    teardownClient();
    if (oldClient) { try { oldClient.auth.signOut(); } catch (e) { /* ignore */ } }
    clearConfig();
    setStatus('unconfigured');
  }

  /* ---------------- auth ---------------- */

  function signInWithEmail(email) {
    if (!client) return Promise.reject(new Error('先に接続情報を保存してください'));
    var redirect = global.location.href.split('#')[0].split('?')[0];
    return client.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: redirect }
    });
  }

  function signOut() {
    if (!client) return Promise.resolve();
    teardownRealtime();
    return client.auth.signOut();
  }

  /* ---------------- realtime ---------------- */

  function afterSignIn() {
    pullThenReconcile();
    setupRealtime();
  }

  function setupRealtime() {
    if (!client || !session) return;
    teardownRealtime();
    channel = client
      .channel('memoflow-sync-' + session.user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: TABLE,
        filter: 'user_id=eq.' + session.user.id
      }, function (payload) {
        var row = payload && payload.new;
        if (!row || row.device === deviceId) return; // our own write echoing back
        reconcileRemote(row);
      })
      .subscribe();
  }
  function teardownRealtime() {
    if (channel && client) { try { client.removeChannel(channel); } catch (e) { /* ignore */ } }
    channel = null;
  }

  /* ---------------- push / pull ---------------- */

  function reconcileRemote(row) {
    if (!row || !row.data) return;
    var remoteUpdated = row.data.updatedAt || row.updated_at;
    var localUpdated = S.state.updatedAt;
    if (remoteUpdated && localUpdated && String(remoteUpdated) <= String(localUpdated)) {
      setStatus('synced');
      return; // local copy is already the same age or newer
    }
    applyingRemote = true;
    S.replaceWorkspace(row.data, 'replace');
    applyingRemote = false;
    lastSyncedAt = U.nowISO();
    setStatus('synced');
    U.toast('他の端末での変更を同期しました');
  }

  function pullThenReconcile() {
    if (!client || !session) return Promise.resolve();
    setStatus('syncing');
    return client.from(TABLE).select('*').eq('user_id', session.user.id).maybeSingle()
      .then(function (res) {
        if (res.error) { setStatus('error', res.error.message); return; }
        if (res.data) { reconcileRemote(res.data); return; }
        return pushNow(); // no cloud copy yet: seed it from this device
      }, function (e) { setStatus('error', e.message); });
  }

  function schedulePush() {
    if (!client || !session || applyingRemote || !isAutoSyncOn()) return;
    global.clearTimeout(pushTimer);
    pushTimer = global.setTimeout(pushNow, PUSH_DEBOUNCE_MS);
  }

  function pushNow() {
    if (!client || !session) return Promise.reject(new Error('サインインしていません'));
    setStatus('syncing');
    var payload = {
      user_id: session.user.id,
      data: {
        app: 'MemoFlow', schema: S.SCHEMA, name: S.state.name,
        pages: S.state.pages, updatedAt: S.state.updatedAt
      },
      device: deviceId,
      updated_at: new Date().toISOString()
    };
    return client.from(TABLE).upsert(payload, { onConflict: 'user_id' }).then(function (res) {
      if (res.error) { setStatus('error', res.error.message); throw res.error; }
      lastSyncedAt = U.nowISO();
      setStatus('synced');
    }, function (e) { setStatus('error', e.message); throw e; });
  }

  function pullNow() {
    if (!client || !session) return Promise.reject(new Error('サインインしていません'));
    setStatus('syncing');
    return client.from(TABLE).select('*').eq('user_id', session.user.id).maybeSingle()
      .then(function (res) {
        if (res.error) { setStatus('error', res.error.message); throw res.error; }
        if (!res.data) { setStatus('signed-in'); U.toast('クラウドにまだデータがありません'); return; }
        applyingRemote = true;
        S.replaceWorkspace(res.data.data, 'replace');
        applyingRemote = false;
        lastSyncedAt = U.nowISO();
        setStatus('synced');
        U.toast('クラウドから取得しました');
      });
  }

  global.Cloud = {
    init: init,
    configure: configure,
    disconnect: disconnect,
    getConfig: getConfig,
    signInWithEmail: signInWithEmail,
    signOut: signOut,
    pushNow: pushNow,
    pullNow: pullNow,
    isAutoSyncOn: isAutoSyncOn,
    setAutoSync: setAutoSync,
    subscribe: subscribe,
    snapshot: snapshot,
    get deviceId() { return deviceId; }
  };
})(window);
