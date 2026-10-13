// Each browser keeps one ECDSA P-256 key. A player's key proves who they are to the room, so a
// host can be told apart from someone using the host's name, and a ban follows the player.

export const ROOM_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const enc = new TextEncoder();

export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

/** A short id for a public key, used for bans, mutes and tags. */
export async function keyId(key) {
    return b64(await sha256(unb64(key))).slice(0, 16);
}

/** Loads this browser's key, making one the first time. */
export async function loadIdentity(store) {
    let jwk = null;
    try { jwk = JSON.parse(store.get('pr-key', 'null')); } catch { /* unreadable */ }
    let priv = null;
    if (jwk?.d) {
        try { priv = await crypto.subtle.importKey('jwk', jwk, ALG, true, ['sign']); } catch { priv = null; }
    }
    if (!priv) {
        const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
        priv = pair.privateKey;
        jwk = await crypto.subtle.exportKey('jwk', priv);
        store.set('pr-key', JSON.stringify(jwk));
    }
    const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, ALG, true, ['verify']);
    const key = b64(await crypto.subtle.exportKey('raw', pub));
    return {
        key,
        id: await keyId(key),
        sign: async text => b64(await crypto.subtle.sign(SIGN, priv, enc.encode(text))),
    };
}

/** Replaces this browser's key with one given as `d.x.y` (base64url), as a dev link carries it. */
export async function importIdentity(store, text) {
    const [d, x, y] = String(text).split('.');
    const jwk = { kty: 'EC', crv: 'P-256', d, x, y, ext: true, key_ops: ['sign'] };
    await crypto.subtle.importKey('jwk', jwk, ALG, true, ['sign']); // throws when it is not a key
    store.set('pr-key', JSON.stringify(jwk));
}

const verifiers = new Map(); // key -> CryptoKey
export async function verify(key, sig, text) {
    try {
        if (!verifiers.has(key)) verifiers.set(key, await crypto.subtle.importKey('raw', unb64(key), ALG, false, ['verify']));
        return await crypto.subtle.verify(SIGN, verifiers.get(key), unb64(sig), enc.encode(text));
    } catch {
        return false;
    }
}

/** The room code a key and salt make. A room's creator proves the room is theirs by its code. */
export async function roomCode(key, salt) {
    const raw = unb64(key);
    const s = unb64(salt);
    const both = new Uint8Array(raw.length + s.length);
    both.set(raw);
    both.set(s, raw.length);
    return Array.from((await sha256(both)).slice(0, 8), b => ROOM_CHARS[b % ROOM_CHARS.length]).join('');
}

export function newSalt() {
    return b64(crypto.getRandomValues(new Uint8Array(9)));
}

/** The text an owner signs to hand the room to `to` as its `n`th handover. */
export const handoverText = (roomId, n, to) => `p2piano|host|${roomId}|${n}|${to}`;

/**
 * Checks an ownership chain, { key, salt, next: [{ to, sig }] }: the creator's key and salt make
 * the room code, and each handover is signed by the owner before it. Returns the owner's key.
 */
export async function chainOwner(chain, roomId) {
    if (!chain || typeof chain.key !== 'string' || typeof chain.salt !== 'string' || !Array.isArray(chain.next)) return null;
    try {
        if (await roomCode(chain.key, chain.salt) !== roomId) return null;
    } catch {
        return null;
    }
    let owner = chain.key;
    for (let i = 0; i < chain.next.length; i++) {
        const { to, sig } = chain.next[i] ?? {};
        if (typeof to !== 'string' || typeof sig !== 'string') return null;
        if (!await verify(owner, sig, handoverText(roomId, i, to))) return null;
        owner = to;
    }
    return owner;
}
