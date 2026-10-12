import { joinRoom, selfId } from 'trystero/nostr';

// Room protocol, version 1 (PROTOCOL.md). Peers find each other through public Nostr relays
// and then talk directly over WebRTC data channels.
export const APP_ID = 'quartzmidi-piano-room';
const HEARTBEAT_MS = 1000;
const WINDOW = 48;
const MAX_HOLD_MS = 80;

export { selfId };

/**
 * Joins a room. `handlers`: onPeer(id, info), onLeave(id), onMidi(id, status, a, b, delayMs),
 * onPing(id, ms).
 */
export function connect(roomId, me, handlers) {
    const room = joinRoom({ appId: APP_ID }, roomId);
    const hi = room.makeAction('hi');
    const ev = room.makeAction('ev');
    const peers = new Map(); // id -> { lateness: number[] }
    let queue = null;

    const peer = id => {
        if (!peers.has(id)) peers.set(id, { lateness: [] });
        return peers.get(id);
    };

    room.onPeerJoin = id => {
        peer(id);
        hi.send(me, { target: id });
    };
    room.onPeerLeave = id => {
        peers.delete(id);
        handlers.onLeave(id);
    };
    hi.onMessage = (info, { peerId }) => {
        peer(peerId);
        handlers.onPeer(peerId, info);
    };

    // [t, status, a, b, status, a, b, ...]: t is the sender's clock in ms. Arrival minus t is
    // the network delay plus an unknown clock offset; holding each message until the 90th
    // percentile of that keeps the sender's rhythm while the offset cancels out.
    ev.onMessage = (msg, { peerId }) => {
        if (!Array.isArray(msg) || typeof msg[0] !== 'number') return;
        const p = peer(peerId);
        const late = performance.now() - msg[0];
        p.lateness.push(late);
        if (p.lateness.length > WINDOW) p.lateness.shift();
        const sorted = [...p.lateness].sort((x, y) => x - y);
        const target = sorted[Math.floor(sorted.length * 0.9)];
        const hold = Math.min(MAX_HOLD_MS, Math.max(0, target - late));
        for (let i = 1; i + 2 < msg.length; i += 3) handlers.onMidi(peerId, msg[i] | 0, msg[i + 1] | 0, msg[i + 2] | 0, hold);
    };

    const beat = setInterval(() => ev.send([performance.now()]), HEARTBEAT_MS);
    const pings = setInterval(() => {
        for (const id of peers.keys()) room.ping(id).then(ms => handlers.onPing(id, ms), () => {});
    }, 3000);

    return {
        /** Queues one MIDI message; everything queued in the same task goes as one message. */
        send(status, a, b) {
            if (!queue) {
                queue = [performance.now()];
                queueMicrotask(() => { ev.send(queue); queue = null; });
            }
            queue.push(status, a, b);
        },
        setMe(info) {
            me = info;
            hi.send(me);
        },
        leave() {
            clearInterval(beat);
            clearInterval(pings);
            room.leave();
        },
    };
}
