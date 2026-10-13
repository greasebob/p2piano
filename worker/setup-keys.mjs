// Makes the service's signing key and address salt and stores them as Worker secrets, so the
// private key is never shown or written to disk. Prints the public key the page is built with.
//   node setup-keys.mjs            refuses when the Worker already has a key
//   node setup-keys.mjs --replace  makes a new one: everyone signs in again within a day
import { spawnSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const b64 = bytes => Buffer.from(bytes).toString('base64url');
const wrangler = (args, input) => spawnSync('npx', ['wrangler', ...args], { input, encoding: 'utf8', shell: true });

const listed = wrangler(['secret', 'list']);
if (listed.status !== 0) {
    console.error(listed.stderr || listed.stdout);
    console.error('Deploy the Worker first (npx wrangler deploy), then run this again.');
    process.exit(1);
}
if (/"ATTEST_KEY"/.test(listed.stdout) && !process.argv.includes('--replace')) {
    console.error('The Worker already has ATTEST_KEY. Run with --replace to make a new one.');
    process.exit(1);
}

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const secrets = {
    ATTEST_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    IP_SALT: b64(crypto.getRandomValues(new Uint8Array(24))),
};
for (const [name, value] of Object.entries(secrets)) {
    const put = wrangler(['secret', 'put', name], value);
    if (put.status !== 0) {
        console.error(put.stderr || put.stdout);
        process.exit(1);
    }
    console.log(`${name} stored`);
}
console.log(`ACCOUNTS_KEY ${b64(await crypto.subtle.exportKey('raw', pair.publicKey))}`);
