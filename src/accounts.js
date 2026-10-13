// Signing in with Discord or Roblox through the accounts service (worker/), so tags and bans follow a
// player to every browser. Off when the build has no service (VITE_ACCOUNTS_URL, VITE_ACCOUNTS_KEY).

export const ACCOUNTS_URL = import.meta.env.VITE_ACCOUNTS_URL;
export const ACCOUNTS_KEY = import.meta.env.VITE_ACCOUNTS_KEY;
export const accountsOn = Boolean(ACCOUNTS_URL && ACCOUNTS_KEY);
export const PROVIDERS = ['discord', 'roblox'];

const ATT_MARGIN_MS = 60 * 60e3; // a new attestation is asked for an hour before the old one runs out
const page = () => location.origin + location.pathname;

export class Accounts {
    constructor(store, session) {
        this.store = store;
        this.session = session;
        this.token = store.get('pr-session', '') || null;
        this.info = null; // { acct, logins, suggest } from the service
        this.att = null;
        this.certs = [];
        this.untags = [];
    }

    get signedIn() {
        return Boolean(this.token);
    }

    async call(path, data = {}) {
        const r = await fetch(`${ACCOUNTS_URL}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.token ? { Authorization: `Bearer ${this.token}` } : {} },
            body: JSON.stringify(data),
        });
        if (r.status === 401 && this.token) this.forget();
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `accounts: ${r.status}`);
        return body;
    }

    forget() {
        this.token = null;
        this.info = null;
        this.att = null;
        this.certs = [];
        this.store.set('pr-session', '');
    }

    /** Finishes a sign-in the service sent back with #login=<code>. */
    async redeem(code) {
        const { session } = await this.call('redeem', { code });
        this.token = session;
        this.store.set('pr-session', session);
    }

    /** Leaves for Discord or Roblox, signing in, or adding a login to this account. The room link comes back after. */
    async go(provider, hash) {
        this.session.set('pr-return', hash);
        if (this.token) {
            const { url } = await this.call(`link/${provider}`, { back: page() });
            location.assign(url);
        } else {
            location.assign(`${ACCOUNTS_URL}/login/${provider}?back=${encodeURIComponent(page())}`);
        }
    }

    /** The sign-ins the service has set up, asked once. */
    providers() {
        this.offered ??= fetch(`${ACCOUNTS_URL}/providers`)
            .then(r => r.json())
            .then(b => PROVIDERS.filter(p => b.providers?.includes(p)))
            .catch(() => PROVIDERS);
        return this.offered;
    }

    async refresh() {
        if (!this.token) return null;
        this.info = await this.call('me');
        return this.info;
    }

    /** The service's attestation of this browser's key, with the account's tag certificates. */
    async attest(ident) {
        if (!this.token) return null;
        if (this.att && this.att.exp - Date.now() > ATT_MARGIN_MS) return this.att;
        const ts = Date.now();
        const r = await this.call('attest', { key: ident.key, ts, sig: await ident.sign(`p2piano|attest|${ident.key}|${ts}`) });
        this.att = r.att;
        this.certs = Array.isArray(r.certs) ? r.certs : [];
        this.untags = Array.isArray(r.untags) ? r.untags : [];
        return this.att;
    }

    async merge(acct, decline = false) {
        this.info = await this.call(decline ? 'merge/decline' : 'merge', { acct });
        this.att = null; // a merge changes the account's ids
    }

    async unlink(login) {
        this.info = await this.call('unlink', { provider: login.provider, sub: login.sub });
    }

    async logout() {
        try { await this.call('logout'); } catch { /* signed out anyway */ }
        this.forget();
    }

    /** Hands a tag certificate for an account to the service, so it reaches every browser of that account. */
    putCert(cert) {
        return fetch(`${ACCOUNTS_URL}/certs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cert }) }).catch(() => {});
    }
}
