// Tags and accounts, as signed certificates any player can check without asking anyone.
//
// A tag certificate { kind: 'tag' | 'untag', tag, sub, n, by?, sig } gives or takes back a tag. Its
// subject is a browser key (k:<key id>) or an account (a:<account id>), and n is when it was made, so
// an untag takes back every tag certificate for the same tag and subject made no later than it.
// The root key (the dev's) signs certificates itself; anyone whose account the root made Dev signs
// them with `by` set to the accounts service's attestation of its key and that Dev certificate.
//
// An attestation { ids, key, exp, sig } is the accounts service saying a browser key belongs to an
// account until exp. ids is the account's id, then the ids of the accounts merged into it.

import { verify } from './identity.js';

export const ROOT_KEY = 'BOmfIhE9ZOFHXAdm2wCn9iHrULtPf9qc20uLaXo2DV6XSTEIiafLMLQ1F6k82wnPzcTMtrQbAP2zhSnjPGaCD4A';
export const ROOT_ID = 'ZYo5K3u3LA4sUD6g';

export const TAGS = {
    dev: { label: 'Dev' },
    trusted: { label: 'Trusted' },
    tester: { label: 'Tester' },
};
/** The tags a Dev gives and takes back from the player menu. Dev itself only the root gives. */
export const GIVEN = ['trusted', 'tester'];
const MAX_UNTAGS = 500;

export const tagText = (kind, tag, sub, n) => `p2piano|${kind}|${tag}|${sub}|${n}`;
export const attText = (ids, key, exp) => `p2piano|att|${ids.join(',')}|${key}|${exp}`;
const SUB = /^[ka]:[\w-]{1,32}$/;

/** The account ids an attestation puts `key` in, its own first, or null. Leave `now` null to accept an expired one. */
export async function checkAtt(att, accountsKey, key = null, now = Date.now()) {
    if (!accountsKey || !att || !Array.isArray(att.ids) || !att.ids.length || att.ids.length > 20 || !att.ids.every(i => typeof i === 'string' && /^[\w-]{1,32}$/.test(i))) return null;
    if (typeof att.key !== 'string' || typeof att.sig !== 'string' || !Number.isSafeInteger(att.exp)) return null;
    if (key !== null && att.key !== key) return null;
    if (now !== null && att.exp < now) return null;
    return await verify(accountsKey, att.sig, attText(att.ids, att.key, att.exp)) ? att.ids : null;
}

function wellFormed(cert) {
    return cert && (cert.kind === 'tag' || cert.kind === 'untag') && Object.hasOwn(TAGS, cert.tag)
        && typeof cert.sub === 'string' && SUB.test(cert.sub) && Number.isSafeInteger(cert.n) && typeof cert.sig === 'string';
}

/** Whether a certificate is signed by the root, or by a Dev's key. Does not look at untags. */
export async function checkCert(cert, accountsKey) {
    if (!wellFormed(cert)) return false;
    const text = tagText(cert.kind, cert.tag, cert.sub, cert.n);
    if (!cert.by) return verify(ROOT_KEY, cert.sig, text);
    if (cert.tag === 'dev') return false;
    const { att, dev } = cert.by;
    const ids = await checkAtt(att, accountsKey, null, null);
    if (!ids || !wellFormed(dev) || dev.kind !== 'tag' || dev.tag !== 'dev' || !ids.includes(dev.sub.slice(2)) || dev.sub[0] !== 'a' || dev.by) return false;
    return await verify(ROOT_KEY, dev.sig, tagText('tag', 'dev', dev.sub, dev.n)) && verify(att.key, cert.sig, text);
}

/** Signs a certificate with this browser's key, as the root or as a Dev (`by`). */
export async function makeCert(ident, kind, tag, sub, by = null) {
    const n = Date.now();
    return { kind, tag, sub, n, ...by ? { by } : {}, sig: await ident.sign(tagText(kind, tag, sub, n)) };
}

/** The untags a player has seen, kept so a taken-back tag stays taken back. */
export class TagBook {
    constructor(store, accountsKey) {
        this.store = store;
        this.accountsKey = accountsKey;
        this.untags = new Map(); // `${tag}|${sub}` -> the untag certificate with the highest n
        let saved = [];
        try { saved = JSON.parse(store.get('pr-untags', '[]')); } catch { /* unreadable */ }
        for (const c of Array.isArray(saved) ? saved : []) if (wellFormed(c) && c.kind === 'untag') this.untags.set(`${c.tag}|${c.sub}`, c);
    }

    /** Keeps an untag when it is valid and newer than the one kept. Returns whether it was. */
    async add(cert) {
        if (!wellFormed(cert) || cert.kind !== 'untag') return false;
        const had = this.untags.get(`${cert.tag}|${cert.sub}`);
        if (had && had.n >= cert.n) return false;
        if (!await checkCert(cert, this.accountsKey)) return false;
        this.untags.set(`${cert.tag}|${cert.sub}`, cert);
        const list = [...this.untags.values()].sort((a, b) => b.n - a.n).slice(0, MAX_UNTAGS);
        this.store.set('pr-untags', JSON.stringify(list));
        return true;
    }

    all() {
        return [...this.untags.values()];
    }

    revoked(tag, sub, n) {
        return (this.untags.get(`${tag}|${sub}`)?.n ?? -1) >= n;
    }

    /** Whether a tag certificate still stands: valid, not taken back, and its issuer still a Dev. */
    async stands(cert) {
        if (!wellFormed(cert) || cert.kind !== 'tag' || this.revoked(cert.tag, cert.sub, cert.n)) return false;
        if (cert.by?.dev && this.revoked('dev', cert.by.dev.sub, cert.by.dev.n)) return false;
        return checkCert(cert, this.accountsKey);
    }

    /** The tags `certs` give the player with key id `id` and account ids `ids` (or null). */
    async holds(certs, id, ids) {
        const held = new Set(id === ROOT_ID ? ['dev'] : []);
        const subs = new Set([`k:${id}`, ...(ids ?? []).map(a => `a:${a}`)]);
        for (const c of Array.isArray(certs) ? certs.slice(0, 20) : []) {
            if (subs.has(c?.sub) && !held.has(c.tag) && await this.stands(c)) held.add(c.tag);
        }
        return held;
    }
}
