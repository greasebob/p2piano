// A lookahead brickwall limiter. The output never passes the ceiling, and the gain changes
// smoothly over the lookahead, so a loud chord is turned down before it arrives instead of
// clipped or distorted when it does.
//
// For each sample it works out the gain that keeps that sample under the ceiling, holds the
// lowest such gain over the lookahead, lets it recover slowly, and averages it over the
// lookahead. The audio is delayed by the lookahead, so every sample meets a gain at or below
// the one it needs.

const LOOKAHEAD_S = 0.005;
const RELEASE_S = 0.2;

class Limiter extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.ceiling = options.processorOptions?.ceiling ?? 0.89; // -1 dBFS
        this.n = Math.max(1, Math.round(LOOKAHEAD_S * sampleRate));
        this.recover = 1 - Math.exp(-1 / (RELEASE_S * sampleRate));
        this.delay = [new Float32Array(this.n), new Float32Array(this.n)];
        this.at = 0; // position in the delay and box rings
        // The lowest wanted gain over the lookahead: a queue of (gain, sample index), gains rising
        this.minGain = new Float32Array(this.n + 2);
        this.minIdx = new Float64Array(this.n + 2);
        this.head = 0;
        this.size = 0;
        this.i = 0; // samples seen
        this.held = 1; // the held gain, recovering towards 1
        this.box = new Float32Array(this.n).fill(1);
        this.sum = this.n;
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        const inL = input[0], inR = input[1] ?? input[0];
        const outL = output[0], outR = output[1];
        const frames = outL.length;
        const { n, ceiling, delay, box, minGain, minIdx } = this;
        const cap = n + 2;
        for (let k = 0; k < frames; k++) {
            const l = inL ? inL[k] : 0, r = inR ? inR[k] : 0;
            const peak = Math.max(Math.abs(l), Math.abs(r));
            const want = peak > ceiling ? ceiling / peak : 1;
            // Push into the queue, dropping gains at or above it; drop gains older than the lookahead and one sample
            while (this.size && minGain[(this.head + this.size - 1) % cap] >= want) this.size--;
            const tail = (this.head + this.size) % cap;
            minGain[tail] = want;
            minIdx[tail] = this.i;
            this.size++;
            if (minIdx[this.head] < this.i - n) { this.head = (this.head + 1) % cap; this.size--; }
            const lowest = minGain[this.head];
            this.held = Math.min(lowest, this.held + (1 - this.held) * this.recover);
            this.sum += this.held - box[this.at];
            box[this.at] = this.held;
            const gain = Math.min(1, this.sum / n);
            const dl = delay[0][this.at], dr = delay[1][this.at];
            delay[0][this.at] = l;
            delay[1][this.at] = r;
            this.at = (this.at + 1) % n;
            this.i++;
            outL[k] = dl * gain;
            if (outR) outR[k] = dr * gain;
        }
        // Keep the running sum from drifting
        if (this.i % 48000 < frames) { let s = 0; for (let j = 0; j < n; j++) s += box[j]; this.sum = s; }
        return true;
    }
}

registerProcessor('brickwall-limiter', Limiter);
