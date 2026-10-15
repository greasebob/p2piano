-- P2Piano accounts (Cloudflare D1). Apply with: npx wrangler d1 execute p2piano --remote --file schema.sql

CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, created INTEGER NOT NULL);
-- An account merged into another: certificates made for the old id still count.
CREATE TABLE IF NOT EXISTS aliases (old TEXT PRIMARY KEY, account TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logins (provider TEXT NOT NULL, sub TEXT NOT NULL, account TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (provider, sub));
CREATE INDEX IF NOT EXISTS logins_account ON logins (account);
-- Only a hash of each session token is kept.
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, account TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account);
-- A sign-in on its way through Discord or Roblox, and the one-time code that hands its session to the page.
CREATE TABLE IF NOT EXISTS pending (state TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL, link TEXT, back TEXT NOT NULL, extra TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, token TEXT NOT NULL, created INTEGER NOT NULL);
-- Keyed hashes of the addresses an account signed in from in the last week, for merge suggestions.
CREATE TABLE IF NOT EXISTS seen (account TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account, ip));
CREATE INDEX IF NOT EXISTS seen_ip ON seen (ip);
CREATE TABLE IF NOT EXISTS ipcheck (ip TEXT PRIMARY KEY, vpn INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS merges (asker TEXT NOT NULL, other TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (asker, other));
CREATE TABLE IF NOT EXISTS declined (account TEXT NOT NULL, other TEXT NOT NULL, PRIMARY KEY (account, other));
-- Tag certificates for accounts, so tags follow a player to every browser, and the untags that took some back.
CREATE TABLE IF NOT EXISTS certs (account TEXT NOT NULL, tag TEXT NOT NULL, n INTEGER NOT NULL, cert TEXT NOT NULL, PRIMARY KEY (account, tag));
CREATE TABLE IF NOT EXISTS untags (sub TEXT NOT NULL, tag TEXT NOT NULL, n INTEGER NOT NULL, cert TEXT NOT NULL, PRIMARY KEY (sub, tag));
-- Sound bank downloads a month (YYYY-MM), counted so R2's free reads are never passed.
CREATE TABLE IF NOT EXISTS bank_reads (month TEXT PRIMARY KEY, n INTEGER NOT NULL);
