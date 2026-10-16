// P2Piano accounts: sign in with Discord or Roblox so tags and bans follow a player to every browser.
// Rooms stay peer to peer; this only vouches for which account a browser key belongs to, by signing
// attestations every player can check with the public key built into the page (see src/certs.js).
//
// Environment (wrangler.toml and secrets):
//   PUBLIC_URL      this worker's own address, for the sign-in redirects
//   RETURNS         the page addresses a sign-in may return to, comma separated
//   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, ROBLOX_CLIENT_ID, ROBLOX_CLIENT_SECRET
//   ROBLOX_REDIRECT optional: a page that forwards to /callback/roblox, as Roblox refuses workers.dev
//   ATTEST_KEY      the ECDSA P-256 private key (JWK) attestations are signed with
//   IP_SALT         the secret addresses are hashed with; addresses themselves are never stored
//   FAKE_LOGIN      '1' only for local tests: a 'fake' provider that signs in whoever is named
//   BANKS           the R2 bucket of sound banks too big for the site, served at /banks/<file>

import { b64, verify } from '../../src/identity.js';
import { attText, checkCert, MAX_VIA } from '../../src/certs.js';

const DAY = 86400e3;
const ATT_MS = DAY;
const SEEN_MS = 7 * DAY;
const PENDING_MS = 10 * 60e3;
const CODE_MS = 60e3;
const ATTEST_SKEW_MS = 5 * 60e3;
const MAX_UNTAGS = 200;
const BANK_FILES = new Set(['bitklavier-grand-v2.sf3']);
const BANK_READS_PER_MONTH = 9e6;
const enc = new TextEncoder();

const PROVIDERS = {
    discord: {
        authorize: 'https://discord.com/oauth2/authorize',
        token: 'https://discord.com/api/oauth2/token',
        scope: 'identify',
        async user(token) {
            const u = await getJson('https://discord.com/api/users/@me', token);
            return { sub: String(u.id), name: u.global_name || u.username };
        },
    },
    roblox: {
        authorize: 'https://apis.roblox.com/oauth/v1/authorize',
        token: 'https://apis.roblox.com/oauth/v1/token',
        scope: 'openid profile',
        async user(token) {
            const u = await getJson('https://apis.roblox.com/oauth/v1/userinfo', token);
            return { sub: String(u.sub), name: u.preferred_username || u.name };
        },
    },
};

async function getJson(url, token) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
}

const random = n => b64(crypto.getRandomValues(new Uint8Array(n)));
const sha = async text => b64(await crypto.subtle.digest('SHA-256', enc.encode(text)));

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = corsHeaders(request, env);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        try {
            const res = await route(request, env, url);
            for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
            return res;
        } catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            if (status === 500) console.error(err);
            return json({ error: status === 500 ? 'server error' : err.message }, status, cors);
        }
    },
};

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function returns(env) {
    return String(env.RETURNS ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = returns(env).map(r => new URL(r).origin);
    if (!origin || !allowed.includes(origin)) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

async function route(request, env, url) {
    const [, first, second] = url.pathname.split('/');
    const post = request.method === 'POST';
    if (!post && first === 'providers') return json({ providers: Object.keys(PROVIDERS).filter(n => env[`${n.toUpperCase()}_CLIENT_ID`]) });
    if (!post && first === 'login') return login(env, url, second);
    if (!post && first === 'callback') return callback(request, env, url, second);
    if (!post && first === 'banks') return bank(env, second);
    if (post && first === 'redeem') return redeem(env, await body(request));
    if (post && first === 'certs') return putCert(env, await body(request));
    if (post) {
        const acct = await sessionAccount(request, env);
        const data = await body(request);
        if (first === 'me') return me(request, env, acct);
        if (first === 'link') return link(env, acct, second, data);
        if (first === 'attest') return attest(env, acct, data);
        if (first === 'merge') return merge(request, env, acct, data, second === 'decline');
        if (first === 'unlink') return unlink(env, acct, data);
        if (first === 'logout') return logout(request, env);
    }
    throw new HttpError(404, 'not found');
}

/**
 * Serves a sound bank too big for the site from the R2 bucket, the only way into it. R2 bills reads
 * past 10 million a month, so past BANK_READS_PER_MONTH the worker stops serving banks until the
 * month turns; on the free plan its 100,000 requests a day keep reads under that anyway.
 */
async function bank(env, name) {
    if (!BANK_FILES.has(name)) throw new HttpError(404, 'no such bank');
    const month = new Date().toISOString().slice(0, 7);
    const row = await env.DB.prepare('INSERT INTO bank_reads (month, n) VALUES (?, 1) ON CONFLICT (month) DO UPDATE SET n = n + 1 RETURNING n')
        .bind(month).first();
    if (row.n > BANK_READS_PER_MONTH) throw new HttpError(503, 'banks resting until next month');
    const obj = await env.BANKS.get(name);
    if (!obj) throw new HttpError(404, 'no such bank');
    return new Response(obj.body, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(obj.size), 'Cache-Control': 'public, max-age=31536000, immutable', ETag: obj.httpEtag },
    });
}

async function body(request) {
    try { return await request.json(); } catch { return {}; }
}

function provider(env, name) {
    if (name === 'fake' && env.FAKE_LOGIN === '1') return { fake: true };
    const p = PROVIDERS[name];
    const id = env[`${name?.toUpperCase()}_CLIENT_ID`];
    if (!p || !id) throw new HttpError(404, 'no such sign-in');
    const redirect = env[`${name.toUpperCase()}_REDIRECT`] || `${env.PUBLIC_URL}/callback/${name}`;
    return { ...p, id, redirect, secret: env[`${name.toUpperCase()}_CLIENT_SECRET`] };
}

// Signing in

/** Starts a sign-in: GET /login/<provider>?back=<page>, or ?ticket=<from /link> to add a login. */
async function login(env, url, name) {
    const p = provider(env, name);
    const db = env.DB;
    let state = url.searchParams.get('ticket');
    if (state) {
        const row = await db.prepare('SELECT * FROM pending WHERE state = ? AND provider = ? AND created > ?').bind(state, name, Date.now() - PENDING_MS).first();
        if (!row) throw new HttpError(400, 'sign-in expired');
    } else {
        const back = url.searchParams.get('back');
        if (!returns(env).includes(back)) throw new HttpError(400, 'unknown page');
        state = random(24);
        await db.prepare('INSERT INTO pending (state, provider, verifier, link, back, extra, created) VALUES (?, ?, ?, NULL, ?, ?, ?)')
            .bind(state, name, random(48), back, url.searchParams.get('user'), Date.now()).run();
    }
    const row = await db.prepare('SELECT * FROM pending WHERE state = ?').bind(state).first();
    if (p.fake) {
        const to = new URL(`${env.PUBLIC_URL}/callback/fake`);
        to.searchParams.set('state', state);
        to.searchParams.set('code', row.extra || 'tester');
        return Response.redirect(to, 302);
    }
    const to = new URL(p.authorize);
    to.searchParams.set('client_id', p.id);
    to.searchParams.set('redirect_uri', p.redirect);
    to.searchParams.set('response_type', 'code');
    to.searchParams.set('scope', p.scope);
    to.searchParams.set('state', state);
    to.searchParams.set('code_challenge', b64(await crypto.subtle.digest('SHA-256', enc.encode(row.verifier))));
    to.searchParams.set('code_challenge_method', 'S256');
    if (name === 'discord') to.searchParams.set('prompt', 'none'); // no second consent screen for someone who allowed it before
    return Response.redirect(to, 302);
}

/** Where Discord or Roblox sends the player back: finds or makes the account and hands the page a code. */
async function callback(request, env, url, name) {
    const p = provider(env, name);
    const db = env.DB;
    const now = Date.now();
    await db.batch([
        db.prepare('DELETE FROM pending WHERE created < ?').bind(now - PENDING_MS),
        db.prepare('DELETE FROM codes WHERE created < ?').bind(now - CODE_MS),
    ]);
    const state = url.searchParams.get('state');
    const row = state && await db.prepare('SELECT * FROM pending WHERE state = ? AND provider = ?').bind(state, name).first();
    if (!row) throw new HttpError(400, 'sign-in expired');
    await db.prepare('DELETE FROM pending WHERE state = ?').bind(state).run();
    const failed = () => Response.redirect(`${row.back}#login-failed`, 302);
    const code = url.searchParams.get('code');
    if (!code) return failed();

    let user;
    if (p.fake) {
        user = { sub: code, name: code };
    } else {
        const r = await fetch(p.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code', code, redirect_uri: p.redirect,
                client_id: p.id, client_secret: p.secret, code_verifier: row.verifier,
            }),
        });
        if (!r.ok) return failed();
        user = await p.user((await r.json()).access_token).catch(() => null);
        if (!user?.sub) return failed();
    }
    const shown = String(user.name || user.sub).slice(0, 40);

    // A login already in an account signs in to it; adding it to another account proves both are one player's.
    const had = await db.prepare('SELECT account FROM logins WHERE provider = ? AND sub = ?').bind(name, user.sub).first();
    let acct = had?.account ?? null;
    const into = row.link ? await current(db, row.link) : null;
    if (acct && into && acct !== into) acct = await mergeAccounts(db, acct, into);
    if (!acct) acct = into ?? await newAccount(db);
    await db.prepare('INSERT INTO logins (provider, sub, account, name) VALUES (?, ?, ?, ?) ON CONFLICT (provider, sub) DO UPDATE SET account = excluded.account, name = excluded.name')
        .bind(name, user.sub, acct, shown).run();
    await see(request, env, acct);

    const token = random(32);
    const once = random(24);
    await db.batch([
        db.prepare('INSERT INTO sessions (hash, account, created) VALUES (?, ?, ?)').bind(await sha(token), acct, now),
        db.prepare('INSERT INTO codes (code, token, created) VALUES (?, ?, ?)').bind(once, token, now),
    ]);
    return Response.redirect(`${row.back}#login=${once}`, 302);
}

async function newAccount(db) {
    const id = random(12);
    await db.prepare('INSERT INTO accounts (id, created) VALUES (?, ?)').bind(id, Date.now()).run();
    return id;
}

/** The account an id now belongs to, following merges. */
async function current(db, id) {
    const alias = await db.prepare('SELECT account FROM aliases WHERE old = ?').bind(id).first();
    return alias?.account ?? id;
}

/** The page trades its one-time code for the session token, which it keeps. */
async function redeem(env, data) {
    const db = env.DB;
    const row = typeof data.code === 'string' && await db.prepare('SELECT token FROM codes WHERE code = ? AND created > ?').bind(data.code, Date.now() - CODE_MS).first();
    if (!row) throw new HttpError(400, 'code expired');
    await db.prepare('DELETE FROM codes WHERE code = ?').bind(data.code).run();
    return json({ session: row.token });
}

async function sessionAccount(request, env) {
    const token = /^Bearer ([\w-]{20,64})$/.exec(request.headers.get('Authorization') ?? '')?.[1];
    const row = token && await env.DB.prepare('SELECT account FROM sessions WHERE hash = ?').bind(await sha(token)).first();
    if (!row) throw new HttpError(401, 'signed out');
    return row.account;
}

/** Starts adding another login to this account: returns where to send the player. */
async function link(env, acct, name, data) {
    provider(env, name);
    if (!returns(env).includes(data.back)) throw new HttpError(400, 'unknown page');
    const state = random(24);
    await env.DB.prepare('INSERT INTO pending (state, provider, verifier, link, back, extra, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(state, name, random(48), acct, data.back, typeof data.user === 'string' ? data.user : null, Date.now()).run();
    return json({ url: `${env.PUBLIC_URL}/login/${name}?ticket=${state}` });
}

async function logout(request, env) {
    const token = /^Bearer ([\w-]{20,64})$/.exec(request.headers.get('Authorization') ?? '')[1];
    await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha(token)).run();
    return json({ ok: true });
}

async function unlink(env, acct, data) {
    const db = env.DB;
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM logins WHERE account = ?').bind(acct).first();
    if (n < 2) throw new HttpError(400, 'last login');
    await db.prepare('DELETE FROM logins WHERE account = ? AND provider = ? AND sub = ?').bind(acct, data.provider, data.sub).run();
    return me(null, env, acct);
}

// The account and its merge suggestions

async function logins(db, acct) {
    const { results } = await db.prepare('SELECT provider, sub, name FROM logins WHERE account = ? ORDER BY provider').bind(acct).all();
    return results;
}

/** Shows enough of a name for its owner to know it, not enough for someone sharing their network to learn it. */
const masked = name => (name.length <= 3 ? `${name[0]}••` : `${name.slice(0, 2)}${'•'.repeat(Math.min(6, name.length - 3))}${name.slice(-1)}`);

async function me(request, env, acct) {
    const db = env.DB;
    const suggest = [];
    const seenHere = request ? await see(request, env, acct) : null;
    // Accounts signed in from this address in the last week, unless it is a VPN, proxy or data centre
    const near = seenHere && !seenHere.vpn
        ? (await db.prepare('SELECT DISTINCT account FROM seen WHERE ip = ? AND account != ? AND at > ?').bind(seenHere.ip, acct, Date.now() - SEEN_MS).all()).results.map(r => r.account)
        : [];
    const asked = (await db.prepare('SELECT asker FROM merges WHERE other = ?').bind(acct).all()).results.map(r => r.asker);
    const mine = new Set((await db.prepare('SELECT other FROM merges WHERE asker = ?').bind(acct).all()).results.map(r => r.other));
    const declined = new Set((await db.prepare('SELECT other FROM declined WHERE account = ?').bind(acct).all()).results.map(r => r.other));
    for (const other of new Set([...asked, ...near])) {
        if (declined.has(other)) continue;
        const list = await logins(db, other);
        if (!list.length) continue;
        suggest.push({ acct: other, logins: list.map(l => ({ provider: l.provider, name: masked(l.name) })), asked: asked.includes(other), sent: mine.has(other) });
    }
    return json({ acct, logins: (await logins(db, acct)).map(l => ({ provider: l.provider, sub: l.sub, name: l.name })), suggest });
}

/** Notes that an account was used from this address. Returns the address's hash and whether it hides who is behind it. */
async function see(request, env, acct) {
    const addr = (env.FAKE_LOGIN === '1' && request.headers.get('X-Test-IP')) || request.headers.get('CF-Connecting-IP');
    if (!addr) return null;
    const db = env.DB;
    const key = await crypto.subtle.importKey('raw', enc.encode(env.IP_SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const ip = b64(await crypto.subtle.sign('HMAC', key, enc.encode(addr)));
    const now = Date.now();
    await db.batch([
        db.prepare('INSERT INTO seen (account, ip, at) VALUES (?, ?, ?) ON CONFLICT (account, ip) DO UPDATE SET at = excluded.at').bind(acct, ip, now),
        db.prepare('DELETE FROM seen WHERE at < ?').bind(now - SEEN_MS),
        db.prepare('DELETE FROM ipcheck WHERE at < ?').bind(now - DAY),
    ]);
    return { ip, vpn: await hidden(env, db, ip, addr) };
}

/** Whether an address is a VPN, proxy, Tor or data centre (ipapi.is), asked at most once a day per address. Unknown counts as hidden. */
async function hidden(env, db, ip, addr) {
    if (env.FAKE_LOGIN === '1') return addr.startsWith('vpn');
    const known = await db.prepare('SELECT vpn FROM ipcheck WHERE ip = ?').bind(ip).first();
    if (known) return Boolean(known.vpn);
    let vpn = true;
    try {
        const r = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(addr)}`);
        if (r.ok) {
            const j = await r.json();
            vpn = Boolean(j.is_vpn || j.is_proxy || j.is_tor || j.is_datacenter || j.is_abuser);
        }
    } catch { /* stays hidden */ }
    await db.prepare('INSERT OR REPLACE INTO ipcheck (ip, vpn, at) VALUES (?, ?, ?)').bind(ip, vpn ? 1 : 0, Date.now()).run();
    return vpn;
}

/**
 * Asks to merge with another account the player was suggested (POST /merge), or turns the suggestion
 * down (POST /merge/decline). Accounts merge once both have asked, so someone else on the same network
 * cannot take an account over.
 */
async function merge(request, env, acct, data, decline) {
    const db = env.DB;
    const other = typeof data.acct === 'string' ? data.acct : '';
    const offered = JSON.parse(await (await me(request, env, acct)).text()).suggest.some(s => s.acct === other);
    if (!offered) throw new HttpError(400, 'not suggested');
    if (decline) {
        await db.batch([
            db.prepare('INSERT OR IGNORE INTO declined (account, other) VALUES (?, ?)').bind(acct, other),
            db.prepare('DELETE FROM merges WHERE asker = ? AND other = ?').bind(other, acct),
        ]);
        return me(null, env, acct);
    }
    const theyAsked = await db.prepare('SELECT 1 AS y FROM merges WHERE asker = ? AND other = ?').bind(other, acct).first();
    if (!theyAsked) {
        await db.prepare('INSERT OR IGNORE INTO merges (asker, other, created) VALUES (?, ?, ?)').bind(acct, other, Date.now()).run();
        return me(null, env, acct);
    }
    return me(null, env, await mergeAccounts(db, acct, other));
}

/** Merges two accounts into the older one. Returns the one kept. */
async function mergeAccounts(db, a, b) {
    const rows = await db.prepare('SELECT id, created FROM accounts WHERE id IN (?, ?)').bind(a, b).all();
    const [keep, gone] = rows.results.length === 2 && rows.results.find(r => r.id === b).created < rows.results.find(r => r.id === a).created ? [b, a] : [a, b];
    await db.batch([
        db.prepare('UPDATE logins SET account = ? WHERE account = ?').bind(keep, gone),
        db.prepare('UPDATE sessions SET account = ? WHERE account = ?').bind(keep, gone),
        db.prepare('UPDATE OR IGNORE seen SET account = ? WHERE account = ?').bind(keep, gone),
        db.prepare('DELETE FROM seen WHERE account = ?').bind(gone),
        // The newer certificate of each tag is kept
        db.prepare('INSERT INTO certs (account, tag, n, cert) SELECT ?, tag, n, cert FROM certs WHERE account = ? ON CONFLICT (account, tag) DO UPDATE SET n = excluded.n, cert = excluded.cert WHERE excluded.n > certs.n').bind(keep, gone),
        db.prepare('DELETE FROM certs WHERE account = ?').bind(gone),
        db.prepare('DELETE FROM merges WHERE asker IN (?, ?) OR other IN (?, ?)').bind(keep, gone, keep, gone),
        db.prepare('DELETE FROM declined WHERE account = ? OR other = ?').bind(gone, gone),
        db.prepare('UPDATE aliases SET account = ? WHERE account = ?').bind(keep, gone),
        db.prepare('INSERT OR REPLACE INTO aliases (old, account) VALUES (?, ?)').bind(gone, keep),
        db.prepare('DELETE FROM accounts WHERE id = ?').bind(gone),
    ]);
    return keep;
}

// Attestations and tags

/** Signs that a browser key belongs to this account, for its handshake; the key proves itself by signing the time. */
async function attest(env, acct, data) {
    const { key, ts, sig } = data;
    if (typeof key !== 'string' || !Number.isSafeInteger(ts) || Math.abs(Date.now() - ts) > ATTEST_SKEW_MS) throw new HttpError(400, 'bad request');
    if (!await verify(key, sig, `p2piano|attest|${key}|${ts}`)) throw new HttpError(400, 'key not proven');
    const db = env.DB;
    const old = (await db.prepare('SELECT old FROM aliases WHERE account = ? LIMIT 19').bind(acct).all()).results.map(r => r.old);
    const ids = [acct, ...old];
    const exp = Date.now() + ATT_MS;
    const via = (await db.prepare('SELECT provider AS p, sub AS id, name AS n FROM logins WHERE account = ? ORDER BY provider, sub LIMIT ?').bind(acct, MAX_VIA).all())
        .results.filter(l => /^\d{1,24}$/.test(l.id)).map(l => ({ ...l, n: String(l.n ?? '').slice(0, 40) }));
    const priv = await crypto.subtle.importKey('jwk', JSON.parse(env.ATTEST_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const attSig = b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, enc.encode(attText(ids, key, exp, via))));
    const certs = (await db.prepare('SELECT cert FROM certs WHERE account = ?').bind(acct).all()).results.map(r => JSON.parse(r.cert));
    const untags = (await db.prepare('SELECT cert FROM untags ORDER BY n DESC LIMIT ?').bind(MAX_UNTAGS).all()).results.map(r => JSON.parse(r.cert));
    return json({ att: { ids, key, exp, ...via.length ? { via } : {}, sig: attSig }, certs, untags });
}

/** Keeps a tag certificate for an account, or takes tags back with an untag. Anyone may hand one in: they are signed. */
async function putCert(env, data) {
    const cert = data.cert;
    if (!await checkCert(cert, await publicKey(env))) throw new HttpError(400, 'bad certificate');
    const db = env.DB;
    const text = JSON.stringify(cert);
    if (cert.kind === 'untag') {
        await db.batch([
            db.prepare('INSERT INTO untags (sub, tag, n, cert) VALUES (?, ?, ?, ?) ON CONFLICT (sub, tag) DO UPDATE SET n = excluded.n, cert = excluded.cert WHERE excluded.n > untags.n').bind(cert.sub, cert.tag, cert.n, text),
            ...cert.sub.startsWith('a:') ? [db.prepare('DELETE FROM certs WHERE account = ? AND tag = ? AND n <= ?').bind(await current(db, cert.sub.slice(2)), cert.tag, cert.n)] : [],
        ]);
        return json({ ok: true });
    }
    if (!cert.sub.startsWith('a:')) throw new HttpError(400, 'not an account');
    const untag = await db.prepare('SELECT n FROM untags WHERE sub = ? AND tag = ?').bind(cert.sub, cert.tag).first();
    if (untag && untag.n >= cert.n) throw new HttpError(400, 'taken back');
    await db.prepare('INSERT INTO certs (account, tag, n, cert) VALUES (?, ?, ?, ?) ON CONFLICT (account, tag) DO UPDATE SET n = excluded.n, cert = excluded.cert WHERE excluded.n > certs.n')
        .bind(await current(db, cert.sub.slice(2)), cert.tag, cert.n, text).run();
    return json({ ok: true });
}

let pub = null;
async function publicKey(env) {
    if (!pub) {
        const { d, key_ops, ...jwk } = JSON.parse(env.ATTEST_KEY);
        const k = await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
        pub = b64(await crypto.subtle.exportKey('raw', k));
    }
    return pub;
}
