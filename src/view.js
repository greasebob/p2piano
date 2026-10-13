// The 88-key keyboard and the notes rising from it.

const LOW = 21, HIGH = 108;
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
const WHITES = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter(n => !isBlack(n)).length;
const RISE_PX_PER_S = 140;
const SPARKS_PER_S = 70; // per held key
const MAX_SPARKS = 800;
const BLOOM_SCALE = 4; // the bloom is blurred at a quarter of the stage's resolution

/** Left edge and width of each key as fractions of the keyboard's width. */
const BOXES = new Map();
for (let n = LOW, whites = 0, w = 1 / WHITES; n <= HIGH; n++) {
    if (isBlack(n)) {
        BOXES.set(n, { x: whites * w - w * 0.3, w: w * 0.6 });
    } else {
        BOXES.set(n, { x: whites * w, w });
        whites++;
    }
}

/** A color for each key, from red at the bottom to violet at the top. */
const RAINBOW = new Map();
for (let n = LOW; n <= HIGH; n++) RAINBOW.set(n, hsl(300 * (n - LOW) / (HIGH - LOW), 0.85, 0.6));

function hsl(h, s, l) {
    const f = k => {
        const a = s * Math.min(l, 1 - l);
        const v = l - a * Math.max(-1, Math.min((k + h / 30) % 12 - 3, 9 - (k + h / 30) % 12, 1));
        return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/**
 * A color seen as a light of the given brightness (0 to 1): black at 0, the color itself at 0.5,
 * and paler above that, its strongest channels saturating first.
 */
function light(hex, brightness) {
    const k = brightness / 0.5;
    const over = 0.3 * Math.max(0, k - 1); // at full brightness a pastel, still tinted
    return '#' + rgb(hex).map(v => {
        const lin = toLinear(v / 255);
        const out = k <= 1 ? lin * k ** 4 : 1 - (1 - lin) * (1 - over) ** (1 + 2 * lin);
        return Math.round(toSrgb(out) * 255).toString(16).padStart(2, '0');
    }).join('');
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const scale = (c, k, add = 0) => c.map(v => Math.min(255, Math.round(v * k + add)));

/** Radial-gradient sprites, cached per kind and color. */
const sprites = new Map();
function sprite(kind, color) {
    const id = `${kind}${color}`;
    if (sprites.has(id)) return sprites.get(id);
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const base = rgb(color);
    const stops = kind === 'spark'
        ? [[0, '#ffffff'], [0.25, rgba(base, 0.6)], [0.55, rgba(base, 0.15)], [1, rgba(base, 0)]]
        : [[0, '#ffffff'], [0.1, rgba(scale(base, 1, 80), 0.95)], [0.3, rgba(base, 0.7)], [0.6, rgba(base, 0.3)], [1, rgba(base, 0)]];
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    sprites.set(id, c);
    return c;
}

/** Note bodies for each style. `t` is the trail, `c` its color as [r, g, b]. */
const NOTES = {
    pfa(g, t, c, x, y, w, h) {
        // Piano From Above: a dark border and a fill shaded from left to right
        g.fillStyle = rgba(scale(c, 0.2), t.alpha);
        g.fillRect(x - 1, y, w + 2, h);
        if (w <= 2 || h <= 2) return;
        const fill = g.createLinearGradient(x, 0, x + w, 0);
        fill.addColorStop(0, rgba(c, t.alpha));
        fill.addColorStop(1, rgba(scale(c, 0.5), t.alpha));
        g.fillStyle = fill;
        g.fillRect(x, y + 1, w, h - 2);
    },
    flat(g, t, c, x, y, w, h) {
        g.fillStyle = rgba(c, t.alpha);
        g.beginPath();
        g.roundRect(x, y, w, h, 3);
        g.fill();
    },
    // Solid blocks filled one path per color by draw(); their halo is the stage's bloom
    glow: null,
};

export const STYLES = Object.keys(NOTES);

export class PianoView {
    /**
     * @param {HTMLElement} keysEl
     * @param {HTMLCanvasElement} canvas
     * @param {Record<number,{text:string, ctrl?:boolean}>} labels
     * @param {(note:number, vel:number)=>void} onPress  vel 0 releases
     */
    constructor(keysEl, canvas, labels, onPress) {
        this.canvas = canvas;
        this.root = keysEl.parentElement;
        this.keys = new Map();
        this.held = new Map(); // note -> [{ who, color, vel }]
        this.trails = [];
        this.sparks = [];
        this.bloom = document.createElement('canvas');
        this.emitted = new Map(); // note -> fractional sparks owed
        this.style = 'glow';
        this.colors = 'player';
        this.custom = { white: '#14e0b0', black: '#ff1a8c' };
        this.glow = 0.5;
        this.lights = new Map(); // color -> color at the current brightness
        this.last = performance.now();
        for (let n = LOW; n <= HIGH; n++) {
            const el = document.createElement('div');
            const box = BOXES.get(n);
            el.className = isBlack(n) ? 'key black' : 'key white';
            el.style.left = `${box.x * 100}%`;
            el.style.width = `${box.w * 100}%`;
            el.dataset.note = n;
            el.append(document.createElement('span'));
            keysEl.append(el);
            this.keys.set(n, el);
        }
        this.setLabels(labels);
        this.setStyle(this.style);
        this.bindPointer(keysEl, onPress);
        requestAnimationFrame(() => this.draw());
    }

    /** @param {Record<number,{text:string, ctrl?:boolean}>} labels */
    setLabels(labels) {
        for (const [n, el] of this.keys) {
            el.firstChild.textContent = labels[n]?.text ?? '';
            el.firstChild.classList.toggle('ctrl', !!labels[n]?.ctrl);
        }
    }

    /** @param {string} style one of STYLES */
    setStyle(style) {
        this.style = style in NOTES ? style : 'glow';
        this.root.dataset.style = this.style;
        this.sparks = [];
    }

    /**
     * Colors notes by player, by key ('rainbow') or by white and black keys ('custom').
     * @param {string} mode
     * @param {{white:string, black:string}} custom
     */
    setColors(mode, custom) {
        this.colors = mode;
        this.custom = custom;
        for (const [note, list] of this.held) this.paint(note, list[list.length - 1]);
    }

    /** Sets the brightness of the notes and lit keys, 0 to 1. */
    setBrightness(v) {
        this.glow = v;
        this.lights.clear();
        this.root.style.setProperty('--glow', String(v));
        for (const [note, list] of this.held) this.paint(note, list[list.length - 1]);
    }

    colorOf(note, color) {
        if (this.colors === 'rainbow') color = RAINBOW.get(note);
        else if (this.colors === 'custom') color = isBlack(note) ? this.custom.black : this.custom.white;
        if (!this.lights.has(color)) this.lights.set(color, light(color, this.glow));
        return this.lights.get(color);
    }

    bindPointer(keysEl, onPress) {
        const playing = new Map(); // pointerId -> note
        const at = e => {
            const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.key');
            if (!el || !keysEl.contains(el)) return null;
            const r = el.getBoundingClientRect();
            const depth = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
            return { note: +el.dataset.note, vel: Math.round(30 + 97 * depth) };
        };
        keysEl.addEventListener('pointerdown', e => {
            const hit = at(e);
            if (!hit) return;
            keysEl.setPointerCapture(e.pointerId);
            playing.set(e.pointerId, hit.note);
            onPress(hit.note, hit.vel);
        });
        keysEl.addEventListener('pointermove', e => {
            if (!playing.has(e.pointerId)) return;
            const hit = at(e);
            const old = playing.get(e.pointerId);
            if (!hit || hit.note === old) return;
            onPress(old, 0);
            playing.set(e.pointerId, hit.note);
            onPress(hit.note, hit.vel);
        });
        const end = e => {
            if (!playing.has(e.pointerId)) return;
            onPress(playing.get(e.pointerId), 0);
            playing.delete(e.pointerId);
        };
        keysEl.addEventListener('pointerup', end);
        keysEl.addEventListener('pointercancel', end);
    }

    /** A player's key went down (vel > 0) or up. */
    key(who, note, vel, color) {
        const el = this.keys.get(note);
        if (!el) return;
        let list = this.held.get(note) ?? [];
        list = list.filter(h => h.who !== who);
        const now = performance.now();
        for (const t of this.trails) if (t.who === who && t.note === note && t.end === null) t.end = now;
        if (vel > 0) {
            list.push({ who, color, vel });
            this.trails.push({ who, note, color, alpha: 0.35 + 0.65 * vel / 127, start: now, end: null });
        }
        this.held.set(note, list);
        this.paint(note, list[list.length - 1]);
    }

    paint(note, top) {
        const el = this.keys.get(note);
        el.classList.toggle('on', !!top);
        if (top) {
            el.style.setProperty('--c', this.colorOf(note, top.color));
            el.style.setProperty('--a', String(0.45 + 0.55 * top.vel / 127));
        }
    }

    /** Releases everything a player holds. */
    clear(who) {
        for (const [note, list] of this.held) if (list.some(h => h.who === who)) this.key(who, note, 0);
    }

    draw() {
        const c = this.canvas;
        const dpr = devicePixelRatio || 1;
        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
            c.width = Math.round(w * dpr);
            c.height = Math.round(h * dpr);
        }
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.last) / 1000);
        this.last = now;
        const glow = this.style === 'glow';
        this.trails = this.trails.filter(t => t.end === null || (now - t.end) / 1000 * RISE_PX_PER_S < h);

        const notes = NOTES[this.style];
        // Notes of black keys are drawn over those of white keys.
        for (const black of [false, true]) {
            const paths = new Map(); // glow notes are solid, so each color is filled once as one path
            for (const t of this.trails) {
                if (isBlack(t.note) !== black) continue;
                const box = BOXES.get(t.note);
                const bottom = h - (t.end === null ? 0 : (now - t.end) / 1000 * RISE_PX_PER_S);
                const top = Math.max(h - (now - t.start) / 1000 * RISE_PX_PER_S, -4);
                const x = box.x * w + 1, bw = Math.max(2, box.w * w - 2), bh = Math.max(2, bottom - top);
                const color = this.colorOf(t.note, t.color);
                if (!glow) {
                    notes(g, t, rgb(color), x, top, bw, bh);
                    continue;
                }
                if (!paths.has(color)) paths.set(color, new Path2D());
                paths.get(color).roundRect(x, top, bw, bh, Math.min(bw * 0.15, 2));
            }
            for (const [color, path] of paths) {
                g.fillStyle = color;
                g.fill(path);
            }
        }
        if (glow && this.glow > 0) {
            g.globalCompositeOperation = 'lighter';
            this.drawSparks(g, w, h, dt);
            this.drawBloom(g, dpr);
            g.globalCompositeOperation = 'lighter';
            this.drawCoronas(g, w, h, now);
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = 1;
        }
        requestAnimationFrame(() => this.draw());
    }

    /**
     * A blurred copy of everything drawn so far, laid behind it: faint at medium brightness and a
     * strong bloom above it. One blur for the whole stage, so its cost does not grow with the notes.
     */
    drawBloom(g, dpr) {
        const k = this.glow / 0.5;
        let strength = k <= 1 ? 0.6 * k ** 3 : 0.6 + 1.4 * (k - 1);
        if (strength < 0.01) return;
        const src = this.canvas, b = this.bloom;
        const bg = b.getContext('2d');
        const filtered = 'filter' in bg;
        const down = filtered ? BLOOM_SCALE : BLOOM_SCALE * 4; // without a blur filter, a coarser copy stands in for it
        const bw = Math.max(1, Math.ceil(src.width / down)), bh = Math.max(1, Math.ceil(src.height / down));
        if (b.width !== bw || b.height !== bh) {
            b.width = bw;
            b.height = bh;
        } else {
            bg.clearRect(0, 0, bw, bh);
        }
        if (filtered) bg.filter = `blur(${3 * k ** 2.5 * dpr / down}px)`;
        bg.drawImage(src, 0, 0, bw, bh);
        if (filtered) bg.filter = 'none';
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-over';
        for (; strength > 0; strength--) {
            g.globalAlpha = Math.min(1, strength);
            g.drawImage(b, 0, 0, src.width, src.height);
        }
        g.restore();
    }

    /** One corona above each lit key, as bright as its brightest note there. */
    drawCoronas(g, w, h, now) {
        const lit = new Map(); // note -> { level, color }
        for (const t of this.trails) {
            const fade = t.end === null ? Math.min(1, (now - t.start) / 150) : 1 - (now - t.end) / 250;
            const level = fade * t.alpha;
            if (level > (lit.get(t.note)?.level ?? 0)) lit.set(t.note, { level, color: t.color });
        }
        for (const [note, { level, color }] of lit) {
            const box = BOXES.get(note);
            const r = box.w * w * 1.6;
            g.globalAlpha = level * this.glow;
            g.drawImage(sprite('corona', this.colorOf(note, color)), (box.x + box.w / 2) * w - r, h - r, 2 * r, 2 * r);
        }
    }

    /** Sparks flying from each held key; the bloom gives them their halo. */
    drawSparks(g, w, h, dt) {
        for (const [note, list] of this.held) {
            if (!list.length) {
                this.emitted.delete(note);
                continue;
            }
            const box = BOXES.get(note);
            const top = list[list.length - 1];
            let owed = (this.emitted.get(note) ?? 0) + SPARKS_PER_S * dt;
            for (; owed >= 1 && this.sparks.length < MAX_SPARKS; owed--) {
                const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
                const speed = 150 + Math.random() * 180;
                const life = 0.3 + Math.random() * 0.25;
                this.sparks.push({
                    x: (box.x + Math.random() * box.w) * w, y: h,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    age: 0, life, size: 1.5 + Math.random() * 1.5, color: this.colorOf(note, top.color),
                });
            }
            this.emitted.set(note, owed % 1);
        }
        this.sparks = this.sparks.filter(s => (s.age += dt) < s.life);
        for (const s of this.sparks) {
            s.vx *= 1 - 2 * dt;
            s.vy *= 1 - 2 * dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            const p = s.age / s.life;
            const a = (p < 0.1 ? p / 0.1 : 1 - (p - 0.1) / 0.9) ** 2 * this.glow;
            g.globalAlpha = a;
            g.drawImage(sprite('spark', s.color), s.x - 2.5 * s.size, s.y - 2.5 * s.size, 5 * s.size, 5 * s.size);
        }
        g.globalAlpha = 1;
    }
}
