// The 88-key keyboard and the notes rising from it.

const LOW = 21, HIGH = 108;
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
const WHITES = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter(n => !isBlack(n)).length;
export const DEFAULT_SPEED = 280; // how fast the notes rise, in pixels a second
const BLOOM_SCALE = 4; // the bloom is blurred at a quarter of the stage's resolution
const TOUCH_KEY_PX = 36; // a white key's width on a touch screen, which shows part of the keyboard
const LABEL_MIN_PX = 13; // narrower white keys hide their labels
const MIDDLE_C = 23; // middle C's place among the white keys

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
export function light(hex, brightness) {
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

/** Radial-gradient corona sprites, cached per color. */
const sprites = new Map();
function sprite(color) {
    if (sprites.has(color)) return sprites.get(color);
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const base = rgb(color);
    const stops = [[0, '#ffffff'], [0.1, rgba(scale(base, 1, 80), 0.95)], [0.3, rgba(base, 0.7)], [0.6, rgba(base, 0.3)], [1, rgba(base, 0)]];
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    sprites.set(color, c);
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
     * @param {HTMLCanvasElement} map  the whole keyboard in small, to move along it when it does not fit
     */
    constructor(keysEl, canvas, labels, onPress, map) {
        this.canvas = canvas;
        this.map = map;
        this.keysEl = keysEl;
        this.root = keysEl.parentElement;
        this.bed = document.createElement('div');
        this.bed.className = 'keybed';
        keysEl.append(this.bed);
        this.range = { first: 0, count: WHITES }; // the white keys shown
        this.mapDirty = true;
        this.keys = new Map();
        this.held = new Map(); // note -> [{ who, look, vel }]
        this.trails = [];
        this.bloom = document.createElement('canvas');
        this.style = 'glow';
        this.glow = 0.5; // the brighter of the two, for the bloom
        this.glows = [0.5, 0.5]; // white keys, black keys
        this.speed = DEFAULT_SPEED;
        this.lights = [new Map(), new Map()]; // white keys, black keys: color -> color at their brightness
        for (let n = LOW; n <= HIGH; n++) {
            const el = document.createElement('div');
            const box = BOXES.get(n);
            el.className = isBlack(n) ? 'key black' : 'key white';
            el.style.left = `${box.x * 100}%`;
            el.style.width = `${box.w * 100}%`;
            el.dataset.note = n;
            el.append(document.createElement('span'));
            this.bed.append(el);
            this.keys.set(n, el);
        }
        this.setLabels(labels);
        this.setStyle(this.style);
        this.bindPointer(keysEl, onPress);
        this.bindMap();
        this.fit();
        new ResizeObserver(() => this.fit()).observe(keysEl);
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
        this.mapDirty = true;
    }

    /** On a touch screen, shows as many keys as fit at a finger's width; elsewhere all 88. */
    fit() {
        const width = this.keysEl.clientWidth;
        if (!width) return;
        let count = WHITES;
        if (matchMedia('(pointer: coarse)').matches) {
            count = Math.max(7, Math.round(width / TOUCH_KEY_PX));
            if (count > WHITES * 0.85) count = WHITES;
        }
        if (count !== this.range.count) {
            let center = NaN;
            try { center = parseFloat(localStorage.getItem('pr-keys-center')); } catch { /* storage blocked */ }
            // By default from the C at or below middle C, an octave lower for each two more shown
            if (!Number.isFinite(center)) center = MIDDLE_C - 7 * Math.floor((count - 7) / 14) + count / 2;
            this.setRange(center - count / 2, count);
        }
        this.root.toggleAttribute('data-narrow', width / count < LABEL_MIN_PX);
    }

    setRange(first, count) {
        first = Math.max(0, Math.min(WHITES - count, Math.round(first)));
        this.range = { first, count };
        this.bed.style.width = `${WHITES / count * 100}%`;
        this.bed.style.left = `${-first / count * 100}%`;
        this.map.hidden = count >= WHITES;
        this.mapDirty = true;
    }

    /** Dragging the small keyboard moves the keys shown along it. */
    bindMap() {
        const map = this.map;
        let grab = 0; // where in the shown range the finger holds it, in white keys
        const whiteAt = e => {
            const r = map.getBoundingClientRect();
            return (e.clientX - r.left) / r.width * WHITES;
        };
        const move = e => {
            this.setRange(whiteAt(e) - grab, this.range.count);
            try { localStorage.setItem('pr-keys-center', String(this.range.first + this.range.count / 2)); } catch { /* storage blocked */ }
        };
        map.addEventListener('pointerdown', e => {
            const at = whiteAt(e), { first, count } = this.range;
            grab = at >= first && at <= first + count ? at - first : count / 2;
            map.setPointerCapture(e.pointerId);
            move(e);
        });
        map.addEventListener('pointermove', e => {
            if (map.hasPointerCapture(e.pointerId)) move(e);
        });
    }

    /** Paints the held keys again, once a player's look changed. */
    repaint() {
        for (const [note, list] of this.held) this.paint(note, list[list.length - 1]);
    }

    /** Sets how fast the notes rise, in pixels a second. */
    setSpeed(pxPerS) {
        this.speed = pxPerS;
    }

    /** Sets the brightness of the notes and lit keys, 0 to 1, of white keys and of black keys. */
    setBrightness(white, black = white) {
        this.glows = [white, black];
        this.glow = Math.max(white, black);
        for (const lit of this.lights) lit.clear();
        this.root.style.setProperty('--glow-white', String(white));
        this.root.style.setProperty('--glow-black', String(black));
        for (const [note, list] of this.held) this.paint(note, list[list.length - 1]);
    }

    glowOf(note) {
        return this.glows[isBlack(note) ? 1 : 0];
    }

    /**
     * A note's colour in a player's look { color, notes }: notes.mode 'rainbow' colours by key,
     * 'custom' by white and black keys (notes.white, notes.black), anything else in the player's colour.
     */
    colorOf(note, look) {
        const n = look.notes;
        const color = n?.mode === 'rainbow' ? RAINBOW.get(note) : n?.mode === 'custom' ? (isBlack(note) ? n.black : n.white) : look.color;
        const black = isBlack(note);
        const lit = black ? this.lights[1] : this.lights[0];
        if (!lit.has(color)) lit.set(color, light(color, this.glows[black ? 1 : 0]));
        return lit.get(color);
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
        keysEl.addEventListener('contextmenu', e => e.preventDefault()); // a long press holds a note
    }

    /** A player's key went down (vel > 0) or up. `look` is the player's { color, notes }. */
    key(who, note, vel, look) {
        const el = this.keys.get(note);
        if (!el) return;
        let list = this.held.get(note) ?? [];
        list = list.filter(h => h.who !== who);
        const now = performance.now();
        for (const t of this.trails) if (t.who === who && t.note === note && t.end === null) t.end = now;
        if (vel > 0) {
            list.push({ who, look, vel });
            this.trails.push({ who, note, look, alpha: 0.35 + 0.65 * vel / 127, start: now, end: null });
        }
        this.held.set(note, list);
        this.paint(note, list[list.length - 1]);
    }

    paint(note, top) {
        const el = this.keys.get(note);
        el.classList.toggle('on', !!top);
        this.mapDirty = true;
        if (top) {
            el.style.setProperty('--c', this.colorOf(note, top.look));
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
        const glow = this.style === 'glow';
        this.trails = this.trails.filter(t => t.end === null || (now - t.end) / 1000 * this.speed < h);

        const notes = NOTES[this.style];
        const zoom = WHITES / this.range.count, off = this.range.first / WHITES;
        // Notes of black keys are drawn over those of white keys.
        for (const black of [false, true]) {
            const paths = new Map(); // glow notes are solid, so each color is filled once as one path
            for (const t of this.trails) {
                if (isBlack(t.note) !== black) continue;
                const box = BOXES.get(t.note);
                const bottom = h - (t.end === null ? 0 : (now - t.end) / 1000 * this.speed);
                const top = Math.max(h - (now - t.start) / 1000 * this.speed, -4);
                const x = (box.x - off) * zoom * w + 1, bw = Math.max(2, box.w * zoom * w - 2), bh = Math.max(2, bottom - top);
                if (x + bw < 0 || x > w) continue;
                const color = this.colorOf(t.note, t.look);
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
            this.drawBloom(g, dpr);
            g.globalCompositeOperation = 'lighter';
            this.drawCoronas(g, w, h, now, zoom, off);
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = 1;
        }
        this.drawMap();
        requestAnimationFrame(() => this.draw());
    }

    /** The whole keyboard in small, its lit keys and the part shown, redrawn only when one changes. */
    drawMap() {
        const m = this.map;
        if (m.hidden) return;
        const dpr = devicePixelRatio || 1;
        const w = m.clientWidth, h = m.clientHeight;
        if (!w || !h) return;
        if (m.width !== Math.round(w * dpr) || m.height !== Math.round(h * dpr)) {
            m.width = Math.round(w * dpr);
            m.height = Math.round(h * dpr);
            this.mapDirty = true;
        }
        if (!this.mapDirty) return;
        this.mapDirty = false;
        const g = m.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        for (const black of [false, true]) {
            for (const [note, box] of BOXES) {
                if (isBlack(note) !== black) continue;
                const list = this.held.get(note);
                const top = list?.[list.length - 1];
                g.fillStyle = top ? this.colorOf(note, top.look) : black ? '#1f1f22' : '#d9d9d5';
                g.fillRect(box.x * w + (black ? 0 : 0.5), 0, box.w * w - (black ? 0 : 1), black ? h * 0.6 : h);
            }
        }
        const x0 = this.range.first / WHITES * w, x1 = (this.range.first + this.range.count) / WHITES * w;
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, 0, x0, h);
        g.fillRect(x1, 0, w - x1, h);
        g.strokeStyle = getComputedStyle(this.root).getPropertyValue('--accent').trim() || '#f2b84b';
        g.lineWidth = 2;
        g.strokeRect(x0 + 1, 1, x1 - x0 - 2, h - 2);
    }

    /**
     * A blurred copy of everything drawn so far, laid behind it: faint at medium brightness and a
     * strong bloom above it. One blur for the whole stage, so its cost does not grow with the notes.
     */
    drawBloom(g, dpr) {
        const k = this.glow / 0.5;
        let strength = k <= 1 ? 0.6 * k ** 3 : 0.6 + 1.4 * (k - 1);
        const src = this.canvas, b = this.bloom;
        if (strength < 0.01 || !src.width || !src.height) return; // a hidden stage has no size to blur
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
    drawCoronas(g, w, h, now, zoom, off) {
        const lit = new Map(); // note -> { level, look }
        for (const t of this.trails) {
            const fade = t.end === null ? Math.min(1, (now - t.start) / 150) : 1 - (now - t.end) / 250;
            const level = fade * t.alpha;
            if (level > (lit.get(t.note)?.level ?? 0)) lit.set(t.note, { level, look: t.look });
        }
        for (const [note, { level, look }] of lit) {
            const box = BOXES.get(note);
            const r = box.w * zoom * w * 1.6;
            g.globalAlpha = level * this.glowOf(note);
            g.drawImage(sprite(this.colorOf(note, look)), (box.x + box.w / 2 - off) * zoom * w - r, h - r, 2 * r, 2 * r);
        }
    }
}
