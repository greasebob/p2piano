// node velcurve.mjs <bank> : loudness (dB, RMS of the first 300 ms) per velocity
import { readFileSync } from 'node:fs';
const core = await import('spessasynth_core');
const { SoundBankLoader, SpessaSynthProcessor } = core;

const buf = readFileSync(process.argv[2]);
const bank = SoundBankLoader.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const sr = 44100;
const synth = new SpessaSynthProcessor(sr, { effectsEnabled: false });
synth.soundBankManager.addSoundBank(bank, 'main');
await synth.processorInitialized;

function render(note, vel, seconds = 0.3) {
    synth.stopAllChannels(true);
    const L = new Float32Array(sr * seconds), R = new Float32Array(sr * seconds);
    synth.noteOn(0, note, vel);
    for (let i = 0; i < L.length; i += 128) synth.process(L, R, i, Math.min(128, L.length - i));
    synth.noteOff(0, note);
    const flush = new Float32Array(sr * 2);
    for (let i = 0; i < flush.length; i += 128) synth.process(flush, flush, i, 128);
    let s = 0;
    for (let i = 0; i < L.length; i++) s += L[i] * L[i] + R[i] * R[i];
    return 10 * Math.log10(s / (2 * L.length) + 1e-20);
}
const vels = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 10, 20, 30, 36, 37, 46, 47, 56, 57, 64, 72, 73, 80, 88, 89, 96, 104, 105, 112, 120, 121, 127];
for (const note of [33, 60, 84]) {
    const t0 = performance.now();
    const row = vels.map(v => `${v}:${render(note, v).toFixed(1)}`);
    console.log(`note ${note}`, row.join(' '), `(${(performance.now() - t0).toFixed(0)} ms)`);
}
