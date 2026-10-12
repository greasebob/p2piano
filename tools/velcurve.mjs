// Prints loudness per velocity (dB, RMS of the first 300 ms) for a few notes.
// usage: node velcurve.mjs <bank> [velocities, comma-separated]
import { readFileSync } from 'node:fs';
const { SoundBankLoader, SpessaSynthProcessor } = await import('spessasynth_core');

const RATE = 44100;
const BLOCK = 128;
const NOTES = [33, 60, 84];
const DEFAULT_VELOCITIES = [1, 10, 20, 30, 36, 37, 46, 47, 56, 57, 64, 72, 73, 80, 88, 89, 96, 104, 105, 112, 120, 121, 127];

const buf = readFileSync(process.argv[2]);
const bank = SoundBankLoader.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const synth = new SpessaSynthProcessor(RATE, { effectsEnabled: false });
synth.soundBankManager.addSoundBank(bank, 'main');
await synth.processorInitialized;

function loudness(note, vel, seconds = 0.3) {
    synth.stopAllChannels(true);
    const left = new Float32Array(RATE * seconds);
    const right = new Float32Array(RATE * seconds);
    synth.noteOn(0, note, vel);
    for (let i = 0; i < left.length; i += BLOCK) synth.process(left, right, i, Math.min(BLOCK, left.length - i));
    synth.noteOff(0, note);
    const flush = new Float32Array(RATE * 2);
    for (let i = 0; i < flush.length; i += BLOCK) synth.process(flush, flush, i, BLOCK);
    let sum = 0;
    for (let i = 0; i < left.length; i++) sum += left[i] ** 2 + right[i] ** 2;
    return 10 * Math.log10(sum / (2 * left.length) + 1e-20);
}

const velocities = process.argv[3] ? process.argv[3].split(',').map(Number) : DEFAULT_VELOCITIES;
for (const note of NOTES) {
    const row = velocities.map(v => `${v}:${loudness(note, v).toFixed(1)}`);
    console.log(`note ${note}`, row.join(' '));
}
