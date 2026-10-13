import { joinRoom, selfId } from 'trystero/nostr';
import { b64, keyId, verify } from './identity.js';

// Room protocol v2 (see PROTOCOL.md). Peers meet through public Nostr relays and connect
// directly over WebRTC, or through a TURN relay when they cannot.
export const APP_ID = 'quartzmidi-piano-room';
const HEARTBEAT_MS = 1000;
const PING_MS = 3000;
const LATENESS_WINDOW = 48;
export const MAX_CHAT = 300;
const MAX_HOLD_MS = 80;
const CLOSE_DELAY_MS = 1000; // a refused handshake stays open this long so the refusal arrives

// Metered TURN relays, used only when two players cannot connect directly (strict NATs on some
// carriers and school or work networks). Over port 443 too, which firewalls rarely block.
// The login comes from the build (VITE_TURN_USER and VITE_TURN_PASS: repository secrets for
// Pages, .env.local when running locally) so it stays out of the source.
const TURN_USER = import.meta.env.VITE_TURN_USER;
const TURN_PASS = import.meta.env.VITE_TURN_PASS;
const TURN = !TURN_USER || !TURN_PASS ? [] : [
    'turn:na.relay.metered.ca:80',
    'turn:na.relay.metered.ca:80?transport=tcp',
    'turn:na.relay.metered.ca:443',
    'turns:na.relay.metered.ca:443?transport=tcp',
].map(urls => ({ urls, username: TURN_USER, credential: TURN_PASS }));

export { selfId };

/** The text a player signs to show `to` that `from` holds its key. */
const helloText = (roomId, from, to) => `p2piano|hello|${roomId}|${from}|${to}`;

/** Proof of knowing the room's password, answering a peer's nonce; the password itself is never sent. */
async function passProof(roomId, nonce, password) {
    const text = new TextEncoder().encode(`p2piano|pass|${roomId}|${nonce}|${password}`);
    return b64(await crypto.subtle.digest('SHA-256', text));
}

/**
 * Joins a room. `ident` is this browser's identity, `since` when this player entered the room.
 * handlers:
 *   onPeer(id, info), onLeave(id), onMidi(id, status, a, b, holdMs), onPing(id, ms), onChat(id, text),
 *   onRoom(id, state), onMod(id, msg), onCert(id, cert),
 *   chain() the ownership chain to hand on, offerChain(chain) one a peer handed on,
 *   att() this player's account attestation or null, accountOf(att, key) the account ids a peer's proves or null,
 *   refuse(id, them) 'ban', 'kick' or null for a peer about to join,
 *   onRefused(them, why) when a peer would not let this player in,
 *   password() the room's password as this player knows it ('' for none),
 *   onWrongPassword(them) when a peer knows another password.
 */
export function connect(roomId, me, ident, since, handlers) {
    const idents = new Map(); // id -> { key, id, since, ids }, checked in the handshake
    const blocked = new Set(); // ids this player no longer talks to

    // Each side proves its key, then that it knows the password, and says whether it lets the other in.
    const handshake = async (peerId, send, receive) => {
        const nonce = b64(crypto.getRandomValues(new Uint8Array(18)));
        await send({ key: ident.key, sig: await ident.sign(helloText(roomId, selfId, peerId)), since, chain: handlers.chain(), att: handlers.att(), nonce });
        const { data } = await receive();
        if (!data || typeof data.key !== 'string' || typeof data.sig !== 'string' || !Number.isFinite(data.since) || typeof data.nonce !== 'string') throw new Error('no identity');
        if (!await verify(data.key, data.sig, helloText(roomId, peerId, selfId))) throw new Error('identity not proven');
        const them = { key: data.key, id: await keyId(data.key), since: data.since, ids: await handlers.accountOf(data.att, data.key) };
        await handlers.offerChain(data.chain);
        const refusal = blocked.has(peerId) ? 'kick' : handlers.refuse(peerId, them);
        await send({ proof: await passProof(roomId, data.nonce, handlers.password()), ...refusal ? { refuse: refusal } : {} });
        const { data: verdict } = await receive();
        if (verdict?.proof !== await passProof(roomId, nonce, handlers.password())) {
            handlers.onWrongPassword(them);
            await new Promise(r => setTimeout(r, CLOSE_DELAY_MS)); // lets this side's proof reach the other first
            throw new Error('wrong password');
        }
        if (verdict.refuse) handlers.onRefused(them, verdict.refuse);
        if (refusal || verdict.refuse) {
            await new Promise(r => setTimeout(r, CLOSE_DELAY_MS));
            throw new Error('refused');
        }
        idents.set(peerId, them);
    };

    const room = joinRoom({ appId: APP_ID, turnConfig: TURN }, roomId, { onPeerHandshake: handshake });
    const hi = room.makeAction('hi');
    const ev = room.makeAction('ev');
    const chat = room.makeAction('chat');
    const state = room.makeAction('room');
    const mod = room.makeAction('mod');
    const cert = room.makeAction('cert');
    const peers = new Map(); // id -> { lateness: number[] }
    let queue = null;

    const open = () => [...peers.keys()].filter(id => !blocked.has(id));
    const from = f => (data, { peerId }) => { if (!blocked.has(peerId) && peers.has(peerId)) f(data, peerId); };
    const peer = id => {
        if (!peers.has(id)) peers.set(id, { lateness: [] });
        return peers.get(id);
    };

    room.onPeerJoin = id => {
        if (blocked.has(id) || !idents.has(id)) return;
        peer(id);
        hi.send(me, { target: id });
        state.send(handlers.state(), { target: id });
    };
    room.onPeerLeave = id => {
        idents.delete(id);
        if (!peers.delete(id)) return;
        handlers.onLeave(id);
    };
    hi.onMessage = from((info, peerId) => handlers.onPeer(peerId, info));
    state.onMessage = from((data, peerId) => handlers.onRoom(peerId, data));
    mod.onMessage = from((data, peerId) => handlers.onMod(peerId, data));
    cert.onMessage = from((data, peerId) => handlers.onCert(peerId, data));

    // Message: [sendTime, status, a, b, status, a, b, ...]. Clocks differ by an unknown offset,
    // so each message is held until the 90th percentile of recent lateness to smooth jitter.
    ev.onMessage = from((msg, peerId) => {
        if (!Array.isArray(msg) || typeof msg[0] !== 'number') return;
        const p = peer(peerId);
        const late = performance.now() - msg[0];
        p.lateness.push(late);
        if (p.lateness.length > LATENESS_WINDOW) p.lateness.shift();
        const sorted = [...p.lateness].sort((x, y) => x - y);
        const target = sorted[Math.floor(sorted.length * 0.9)];
        const hold = Math.min(MAX_HOLD_MS, Math.max(0, target - late));
        for (let i = 1; i + 2 < msg.length; i += 3) handlers.onMidi(peerId, msg[i] | 0, msg[i + 1] | 0, msg[i + 2] | 0, hold);
    });

    chat.onMessage = from((text, peerId) => {
        if (typeof text === 'string' && text.trim()) handlers.onChat(peerId, text.trim().slice(0, MAX_CHAT));
    });

    const everyone = (action, data) => {
        const target = open();
        if (target.length) action.send(data, { target });
    };
    const beat = setInterval(() => everyone(ev, [performance.now()]), HEARTBEAT_MS);
    const pings = setInterval(() => {
        for (const id of open()) room.ping(id).then(ms => handlers.onPing(id, ms), () => {});
    }, PING_MS);

    return {
        /** The identity a peer proved in its handshake. */
        ident: id => idents.get(id) ?? null,
        /** Queues a MIDI message. Messages queued in the same task are sent together. */
        send(status, a, b) {
            if (!queue) {
                queue = [performance.now()];
                queueMicrotask(() => { everyone(ev, queue); queue = null; });
            }
            queue.push(status, a, b);
        },
        say(text) {
            everyone(chat, text);
        },
        setMe(info) {
            me = info;
            everyone(hi, me);
        },
        /** Sends the room's state (ownership and bans) to everyone. */
        shareState() {
            everyone(state, handlers.state());
        },
        /** Sends a host message to one peer, or to everyone. */
        mod(data, target = null) {
            if (target) mod.send(data, { target });
            else everyone(mod, data);
        },
        /** Sends a tag certificate to one peer, or to everyone. */
        cert(data, target = null) {
            if (target) cert.send(data, { target });
            else everyone(cert, data);
        },
        /** Stops talking to a peer; it is refused if it connects again. */
        block(id) {
            blocked.add(id);
            peers.delete(id);
        },
        leave() {
            clearInterval(beat);
            clearInterval(pings);
            return room.leave();
        },
    };
}
