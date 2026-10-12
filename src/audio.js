import { WorkletSynthesizer } from 'spessasynth_lib';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';

// Selectable pianos. `strikes` has one velocity per sample layer, used to preload samples.
const SOUNDFONTS = `${import.meta.env.BASE_URL}soundfonts`;
export const BANKS = {
    'salamander-8': { url: `${SOUNDFONTS}/salamander-grand-v1.sf3`, strikes: [20, 40, 50, 64, 80, 96, 112, 125] },
    'salamander-16': { url: `${SOUNDFONTS}/salamander-grand-16-v1.sf3`, strikes: [13, 30, 35, 40, 45, 48, 53, 60, 68, 76, 84, 92, 100, 108, 116, 124] },
    'amethyst-studio': { url: `${SOUNDFONTS}/amethyst-studio-v1.sf3`, strikes: [100] },
    'amethyst-hall': { url: `${SOUNDFONTS}/amethyst-hall-v1.sf3`, strikes: [100] },
};
const CACHE = 'piano-room-banks-v1';
const PRELOAD_CHANNEL = 15;
const SOFT_PEDAL_SCALE = 0.6;

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

/**
 * Creates the synth and its output chain: synth -> volume -> limiter -> speakers.
 * All samples are decoded up front so the first note of each does not stall.
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

    return {
        synth,
        setVolume(v) { volume.gain.value = 3 * v * v; },
        setReverb(v) { for (let ch = 0; ch < 16; ch++) synth.controllerChange(ch, 91, v); },
        async setBank(buffer, strikes, onPreload) {
            await synth.soundBankManager.addSoundBank(buffer, 'main'); // replaces the current bank
            await preload(synth, strikes, onPreload);
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
 * One player's notes on one MIDI channel. The synth only handles sustain, so sostenuto and
 * the soft pedal are implemented here.
 */
export class Hand {
    constructor(synth, channel, onKey) {
        this.synth = synth;
        this.ch = channel;
        this.onKey = onKey; // (note, velocity, delayMs); velocity 0 is a release
        this.down = new Set(); // keys held
        this.caught = new Set(); // keys held when sostenuto went down
        this.waiting = new Set(); // caught keys released, sounding until sostenuto lifts
        this.sostenuto = false;
        this.soft = false;
    }

    /** Handles one MIDI message. `at` is an AudioContext time; `delay` is the same in ms from now. */
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

    /** Releases all keys and pedals. */
    release() {
        for (const n of [...this.down, ...this.waiting]) {
            this.synth.noteOff(this.ch, n);
            this.onKey(n, 0, 0);
        }
        this.synth.controllerChange(this.ch, 64, 0);
        this.down.clear();
        this.caught.clear();
        this.waiting.clear();
        this.sostenuto = false;
        this.soft = false;
    }
}
