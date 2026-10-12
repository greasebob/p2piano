import { WorkletSynthesizer } from 'spessasynth_lib';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';

/** The pianos by velocity layer count, each with one velocity inside every layer to preload. */
export const BANKS = {
    8: { url: `${import.meta.env.BASE_URL}soundfonts/salamander-grand-v1.sf3`, strikes: [20, 40, 50, 64, 80, 96, 112, 125] },
    16: { url: `${import.meta.env.BASE_URL}soundfonts/salamander-grand-16-v1.sf3`, strikes: [13, 30, 35, 40, 45, 48, 53, 60, 68, 76, 84, 92, 100, 108, 116, 124] },
};
const CACHE = 'piano-room-banks-v1';
const PRELOAD_CHANNEL = 15;
const SOFT_PEDAL_SCALE = 0.6;

/** Downloads the sound bank once and keeps it in Cache Storage. */
export async function loadBank(url, onProgress) {
    let cache = null;
    try {
        cache = await caches.open(CACHE);
        const hit = await cache.match(url);
        if (hit) {
            onProgress(1);
            return await hit.arrayBuffer();
        }
    } catch { /* no Cache Storage here: plain download */ }
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
        } catch { /* quota: it downloads again next time */ }
    }
    onProgress(1);
    return await blob.arrayBuffer();
}

/**
 * The synth and the output chain: synth -> volume -> limiter -> speakers.
 * Every sample is decoded before play, so no first strike waits on a Vorbis decode.
 */
export async function createPiano(ctx, bank, strikes, onPreload) {
    await ctx.audioWorklet.addModule(processorUrl);
    const synth = new WorkletSynthesizer(ctx);
    const volume = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    synth.connect(volume);
    volume.connect(limiter).connect(ctx.destination);
    await synth.soundBankManager.addSoundBank(bank, 'main');
    await synth.isReady;
    synth.setSystemParameter('interpolationType', 2); // hermite
    await preload(synth, strikes, onPreload);

    const piano = {
        synth,
        setVolume(v) { volume.gain.value = 3 * v * v; },
        setReverb(v) { for (let ch = 0; ch < 16; ch++) synth.controllerChange(ch, 91, v); },
        /** Swaps in another bank; the one playing keeps sounding until the new one is decoded. */
        async setBank(buffer, strikes, onPreload) {
            await synth.soundBankManager.addSoundBank(buffer, 'main');
            await preload(synth, strikes, onPreload);
        },
    };
    return piano;
}

/** Strikes every sample once, silently, on a channel nobody plays. */
async function preload(synth, strikes, onProgress) {
    synth.controllerChange(PRELOAD_CHANNEL, 7, 0);
    synth.controllerChange(PRELOAD_CHANNEL, 11, 0);
    for (let i = 0; i < strikes.length; i++) {
        for (let note = 21; note <= 108; note += 3) synth.noteOn(PRELOAD_CHANNEL, note, strikes[i]);
        for (let note = 21; note <= 108; note += 3) synth.noteOff(PRELOAD_CHANNEL, note);
        await synth.getSnapshot(); // returns once the worklet has handled the strikes above
        onProgress((i + 1) / strikes.length);
    }
    synth.controllerChange(PRELOAD_CHANNEL, 120, 0); // all sound off, on this channel alone
}

/**
 * One player's notes on one MIDI channel. Sostenuto and the soft pedal are handled here:
 * the synth knows only sustain.
 */
export class Hand {
    constructor(synth, channel, onKey) {
        this.synth = synth;
        this.ch = channel;
        this.onKey = onKey; // (note, velocity or 0, delayMs)
        this.down = new Set();
        this.caught = new Set();
        this.waiting = new Set();
        this.sostenuto = false;
        this.soft = false;
        this.sustain = 0;
    }

    /** One MIDI message; `at` is an AudioContext time, `delay` the same in ms from now. */
    midi(status, a, b, at, delay = 0) {
        const opts = at ? { time: at } : undefined;
        const type = status & 0xf0;
        if (type === 0x90 && b > 0) {
            const vel = this.soft ? Math.max(1, Math.round(b * SOFT_PEDAL_SCALE)) : b;
            this.down.add(a);
            this.waiting.delete(a);
            this.synth.noteOn(this.ch, a, vel, opts);
            this.onKey(a, b, delay);
        } else if (type === 0x80 || type === 0x90) {
            this.down.delete(a);
            this.onKey(a, 0, delay);
            if (this.caught.has(a)) this.waiting.add(a);
            else this.synth.noteOff(this.ch, a, opts);
        } else if (type === 0xb0) {
            if (a === 64) {
                this.sustain = b;
                this.synth.controllerChange(this.ch, 64, b, opts);
            } else if (a === 66) {
                const on = b >= 64;
                if (on && !this.sostenuto) this.caught = new Set(this.down);
                if (!on && this.sostenuto) {
                    for (const n of this.waiting) this.synth.noteOff(this.ch, n, opts);
                    this.waiting.clear();
                    this.caught.clear();
                }
                this.sostenuto = on;
            } else if (a === 67) {
                this.soft = b >= 64;
            }
        }
    }

    release() {
        for (const n of [...this.down, ...this.waiting]) {
            this.synth.noteOff(this.ch, n);
            this.onKey(n, 0, 0);
        }
        this.synth.controllerChange(this.ch, 64, 0);
        this.down.clear(); this.caught.clear(); this.waiting.clear();
        this.sostenuto = this.soft = false;
        this.sustain = 0;
    }
}
