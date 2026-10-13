import { WorkletSynthesizer } from 'spessasynth_lib';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';
import limiterUrl from './limiter.worklet.js?url&no-inline';

// Selectable pianos. `strikes` has one velocity per sample layer, used to preload samples.
// `level` in dB evens out how loud they are, so the louder Amethyst banks do not drive the limiter hard.
const SOUNDFONTS = `${import.meta.env.BASE_URL}soundfonts`;
export const BANKS = {
    'salamander-8': { url: `${SOUNDFONTS}/salamander-grand-v1.sf3`, strikes: [20, 40, 50, 64, 80, 96, 112, 125] },
    'salamander-16': { url: `${SOUNDFONTS}/salamander-grand-16-v1.sf3`, strikes: [13, 30, 35, 40, 45, 48, 53, 60, 68, 76, 84, 92, 100, 108, 116, 124] },
    'amethyst-studio': { url: `${SOUNDFONTS}/amethyst-studio-v1.sf3`, strikes: [100], level: -2 },
    'amethyst-hall': { url: `${SOUNDFONTS}/amethyst-hall-v1.sf3`, strikes: [100], level: -4.5 },
    // A soundfont the player opened from their own computer. It stays in this browser and is never sent.
    // Its layers are unknown, so the preload strikes a spread of velocities.
    own: { url: `${SOUNDFONTS}/own`, strikes: [8, 24, 40, 56, 72, 88, 104, 120] },
};
const CACHE = 'piano-room-banks-v1';
const PRELOAD_CHANNEL = 15;
const SOFT_PEDAL_SCALE = 0.6;
// The synth's default of 350 voices was too few for a held pedal; past this it cuts the quietest fading sounds
const VOICE_CAP = 512;
// The synth queues a message timed ahead but plays one that is due at once, even while earlier ones
// still wait, so a release could land before its strike and leave the note ringing. Each message on a
// key comes at least this long after the key's last one, longer than a render block, so it cannot.
const KEY_ORDER_S = 0.01;

/** Downloads a bank, or reads it from Cache Storage if it was downloaded before. */
export async function loadBank(url, onProgress) {
    let cache = null;
    try {
        cache = await caches.open(CACHE);
        const hit = await cache.match(url);
        if (hit) {
            onProgress(1);
            return await hit.arrayBuffer();
        }
    } catch { /* Cache Storage unavailable */ }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sound bank: HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        if (total) onProgress(got / total);
    }
    const blob = new Blob(parts);
    if (cache) {
        try {
            await cache.put(url, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } }));
            const keys = await cache.keys();
            const known = Object.values(BANKS).map(b => new URL(b.url, location.href).href);
            await Promise.all(keys.filter(k => !known.includes(k.url)).map(k => cache.delete(k)));
        } catch { /* over quota; not cached */ }
    }
    onProgress(1);
    return await blob.arrayBuffer();
}

/** Keeps the player's own soundfont in Cache Storage for their next visit; returns false when it does not fit. */
export async function keepOwnBank(buffer) {
    try {
        const cache = await caches.open(CACHE);
        await cache.put(BANKS.own.url, new Response(buffer, { headers: { 'content-type': 'application/octet-stream' } }));
        return true;
    } catch {
        return false;
    }
}

/** The player's own soundfont from Cache Storage, or null. */
export async function ownBank() {
    try {
        const hit = await (await caches.open(CACHE)).match(BANKS.own.url);
        return hit ? await hit.arrayBuffer() : null;
    } catch {
        return null;
    }
}

/** Whether the bytes start as an SF2, SF3 or DLS file. */
export function isSoundBank(buffer) {
    const tag = (at) => String.fromCharCode(...new Uint8Array(buffer, at, 4));
    return buffer.byteLength > 12 && tag(0) === 'RIFF' && ['sfbk', 'DLS '].includes(tag(8));
}

/**
 * Creates the synth and its output chain: synth -> volume -> limiter -> speakers.
 * All samples are decoded up front so the first note of each does not stall.
 */
export async function createPiano(ctx, buffer, bank, onPreload) {
    await Promise.all([ctx.audioWorklet.addModule(processorUrl), ctx.audioWorklet.addModule(limiterUrl)]);
    const synth = new WorkletSynthesizer(ctx);
    const volume = ctx.createGain();
    const limiter = new AudioWorkletNode(ctx, 'brickwall-limiter', { outputChannelCount: [2] });
    synth.connect(volume);
    volume.connect(limiter).connect(ctx.destination);
    await synth.soundBankManager.addSoundBank(buffer, 'main');
    await synth.isReady;
    synth.setSystemParameter('interpolationType', 2); // hermite
    synth.setSystemParameter('voiceCap', VOICE_CAP);
    await preload(synth, bank.strikes, onPreload);
    let v = 1, level = bank.level ?? 0;
    const apply = () => { volume.gain.value = 3 * v * v * 10 ** (level / 20); };

    return {
        synth,
        setVolume(to) { v = to; apply(); },
        setReverb(v) { for (let ch = 0; ch < 16; ch++) synth.controllerChange(ch, 91, v); },
        async setBank(buffer, bank, onPreload) {
            await synth.soundBankManager.addSoundBank(buffer, 'main'); // replaces the current bank
            level = bank.level ?? 0;
            apply();
            await preload(synth, bank.strikes, onPreload);
        },
    };
}

/** Plays every sample once at zero volume on an unused channel, which decodes it. */
async function preload(synth, strikes, onProgress) {
    synth.controllerChange(PRELOAD_CHANNEL, 7, 0);
    synth.controllerChange(PRELOAD_CHANNEL, 11, 0);
    for (let i = 0; i < strikes.length; i++) {
        for (let note = 21; note <= 108; note++) synth.noteOn(PRELOAD_CHANNEL, note, strikes[i]);
        for (let note = 21; note <= 108; note++) synth.noteOff(PRELOAD_CHANNEL, note);
        await synth.getSnapshot(); // resolves after the worklet has processed the notes above
        onProgress((i + 1) / strikes.length);
    }
    synth.controllerChange(PRELOAD_CHANNEL, 120, 0); // all sound off
}

/**
 * One player's notes on one MIDI channel. The pedals are implemented here, not in the synth: a key
 * struck again while the pedal holds it lets its old sound fade, as the string's own does, instead
 * of piling up voices until the synth cuts the oldest (the bass first) to make room.
 */
export class Hand {
    constructor(synth, channel, onKey) {
        this.synth = synth;
        this.ch = channel;
        this.onKey = onKey; // (note, velocity, delayMs); velocity 0 is a release
        this.down = new Set(); // keys held
        this.caught = new Set(); // keys held when sostenuto went down
        this.waiting = new Set(); // caught keys released, sounding until sostenuto lifts
        this.ringing = new Set(); // keys released while sustain is down, sounding until it lifts
        this.sustain = false;
        this.sostenuto = false;
        this.soft = false;
        this.keyAt = new Map(); // key -> AudioContext time of its last message to the synth
    }

    /** The timing for a message on a key at `at` (0 for now), kept after the key's last message. */
    timed(note, at) {
        const last = this.keyAt.get(note);
        const now = this.synth.currentTime;
        const time = last === undefined ? at : Math.max(at || now, last + KEY_ORDER_S);
        this.keyAt.set(note, Math.max(time, now));
        return time > now ? { time } : undefined;
    }

    on(note, vel, at) { this.synth.noteOn(this.ch, note, vel, this.timed(note, at)); }

    off(note, at) { this.synth.noteOff(this.ch, note, this.timed(note, at)); }

    /** Handles one MIDI message. `at` is an AudioContext time, or 0 for now; `delay` is the same in ms from now. */
    midi(status, a, b, at, delay = 0) {
        const type = status & 0xf0;
        if (type === 0x90 && b > 0) {
            const vel = this.soft ? Math.max(1, Math.round(b * SOFT_PEDAL_SCALE)) : b;
            this.down.add(a);
            // The key's last sound, still held by a pedal, fades under the new one
            if (this.waiting.delete(a) | this.ringing.delete(a)) this.off(a, at);
            this.on(a, vel, at);
            this.onKey(a, b, delay);
        } else if (type === 0x80 || type === 0x90) {
            this.down.delete(a);
            this.onKey(a, 0, delay);
            if (this.caught.has(a)) this.waiting.add(a);
            else if (this.sustain) this.ringing.add(a);
            else this.off(a, at);
        } else if (type === 0xb0) {
            if (a === 64) {
                this.sustain = b >= 64;
                if (!this.sustain) {
                    for (const n of this.ringing) this.off(n, at);
                    this.ringing.clear();
                }
            } else if (a === 66) {
                const on = b >= 64;
                if (on && !this.sostenuto) this.caught = new Set(this.down);
                if (!on && this.sostenuto) {
                    for (const n of this.waiting) {
                        if (this.sustain) this.ringing.add(n);
                        else this.off(n, at);
                    }
                    this.waiting.clear();
                    this.caught.clear();
                }
                this.sostenuto = on;
            } else if (a === 67) {
                this.soft = b >= 64;
            }
        }
    }

    /** Releases all keys and pedals. */
    release() {
        for (const n of this.down) this.onKey(n, 0, 0);
        for (const n of new Set([...this.down, ...this.waiting, ...this.ringing])) this.off(n, 0);
        this.down.clear();
        this.caught.clear();
        this.waiting.clear();
        this.ringing.clear();
        this.sustain = false;
        this.sostenuto = false;
        this.soft = false;
    }
}
