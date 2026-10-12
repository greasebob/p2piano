import { joinRoom, selfId } from 'trystero/nostr';

// Room protocol v1 (see PROTOCOL.md). Peers meet through public Nostr relays and connect
// directly over WebRTC.
export const APP_ID = 'quartzmidi-piano-room';
const HEARTBEAT_MS = 1000;
const PING_MS = 3000;
const LATENESS_WINDOW = 48;
const MAX_HOLD_MS = 80;

export { selfId };

/**
 * Joins a room.
 * handlers: onPeer(id, info), onLeave(id), onMidi(id, status, a, b, holdMs), onPing(id, ms)
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

    // Message: [sendTime, status, a, b, status, a, b, ...]. Clocks differ by an unknown offset,
    // so each message is held until the 90th percentile of recent lateness to smooth jitter.
    ev.onMessage = (msg, { peerId }) => {
        if (!Array.isArray(msg) || typeof msg[0] !== 'number') return;
        const p = peer(peerId);
        const late = performance.now() - msg[0];
        p.lateness.push(late);
        if (p.lateness.length > LATENESS_WINDOW) p.lateness.shift();
        const sorted = [...p.lateness].sort((x, y) => x - y);
        const target = sorted[Math.floor(sorted.length * 0.9)];
        const hold = Math.min(MAX_HOLD_MS, Math.max(0, target - late));
        for (let i = 1; i + 2 < msg.length; i += 3) handlers.onMidi(peerId, msg[i] | 0, msg[i + 1] | 0, msg[i + 2] | 0, hold);
    };

    const beat = setInterval(() => ev.send([performance.now()]), HEARTBEAT_MS);
    const pings = setInterval(() => {
        for (const id of peers.keys()) room.ping(id).then(ms => handlers.onPing(id, ms), () => {});
    }, PING_MS);

    return {
        /** Queues a MIDI message. Messages queued in the same task are sent together. */
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
