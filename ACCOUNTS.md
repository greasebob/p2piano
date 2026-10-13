# Accounts

Signing in with Discord or Roblox makes tags and bans follow a player to every browser.
Rooms stay peer to peer: the accounts service in `worker/` only vouches for which account a browser's key belongs to.
It runs on Cloudflare Workers with a D1 database, both on the free plan.

The page works without it, and without it has no sign-in.

## What it keeps

- Each account's logins: the provider, its user id and its name.
- Sessions, stored as hashes.
- The tag certificates given to accounts and the untags.
- Network addresses as HMAC hashes with a secret salt, kept 7 days, to suggest merging two accounts used from the same network.
  Each address is checked once a day with [ipapi.is](https://ipapi.is); VPNs, proxies, Tor and data centres are never matched.
  A merge happens only once both accounts ask for it.

## Setting it up

All commands run in `worker/`.

1. Make a Cloudflare account, then sign in and install:

   ```bash
   npm install
   ```

   ```bash
   npx wrangler login
   ```

2. Make the database:

   ```bash
   npx wrangler d1 create p2piano
   ```

   Put the `database_id` it prints into `wrangler.toml`, then make the tables:

   ```bash
   npx wrangler d1 execute p2piano --remote --file schema.sql
   ```

3. Deploy once to get the Worker's address:

   ```bash
   npx wrangler deploy
   ```

   If the address is not `https://p2piano-accounts.greasebob.workers.dev`, put it in `PUBLIC_URL` in `wrangler.toml`.
   Below, `<worker>` is that address.

4. Make the signing key and the address salt:

   ```bash
   node setup-keys.mjs
   ```

   It stores both as Worker secrets and prints `ACCOUNTS_KEY`, the public key the page checks with.

5. Discord: in the [Developer Portal](https://discord.com/developers/applications), make a New Application named P2Piano.
   Under OAuth2, add the redirect `<worker>/callback/discord`.
   Put the Client ID in `DISCORD_CLIENT_ID` in `wrangler.toml`, then store the Client Secret:

   ```bash
   npx wrangler secret put DISCORD_CLIENT_SECRET
   ```

6. Roblox: in the [Creator Dashboard](https://create.roblox.com/dashboard/credentials?activeTab=OAuthTab), make an OAuth 2.0 app named P2Piano.
   Add the redirect `<worker>/callback/roblox` and the scopes `openid` and `profile`.
   Put the Client ID in `ROBLOX_CLIENT_ID` in `wrangler.toml`, then store the Client Secret, which Roblox shows once:

   ```bash
   npx wrangler secret put ROBLOX_CLIENT_SECRET
   ```

   A new Roblox app signs in at most 10 people until Roblox reviews it.
   The review asks for a privacy policy, terms of service and a video of the sign-in of at most a minute.

7. Deploy with the client ids:

   ```bash
   npx wrangler deploy
   ```

8. In the GitHub repository's Settings, under Secrets and variables, Actions, Variables, add:

   - `ACCOUNTS_URL`: `<worker>`
   - `ACCOUNTS_KEY`: the key `setup-keys.mjs` printed

   Both are public; the next Pages build has sign-in.

A provider whose client id is empty is skipped, so Discord alone works until Roblox is set up.

## Running it locally

`worker/.dev.vars` holds the local secrets and is never committed:

```
FAKE_LOGIN="1"
PUBLIC_URL="http://localhost:8787"
IP_SALT="<random>"
ATTEST_KEY='<private JWK>'
```

The JWK goes in single quotes, unescaped.
`FAKE_LOGIN` adds a `fake` provider that signs in whoever is named, for tests only.

```bash
npx wrangler d1 execute p2piano --local --file schema.sql
```

```bash
npx wrangler dev --port 8787
```

The page then needs `VITE_ACCOUNTS_URL=http://localhost:8787` and `VITE_ACCOUNTS_KEY` (the JWK's public key, raw and base64url) in `.env.local`.
