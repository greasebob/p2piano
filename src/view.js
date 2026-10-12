// The 88-key keyboard and the notes rising from it.

const LOW = 21, HIGH = 108;
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
const WHITES = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter(n => !isBlack(n)).length;
const RISE_PX_PER_S = 140;

/** Left edge and width of a key as fractions of the keyboard's width. */
function keyBox(n) {
    let whites = 0;
    for (let m = LOW; m < n; m++) if (!isBlack(m)) whites++;
    const w = 1 / WHITES;
    return isBlack(n) ? { x: whites * w - w * 0.3, w: w * 0.6 } : { x: whites * w, w };
}

export class PianoView {
    /**
     * @param {HTMLElement} keysEl
     * @param {HTMLCanvasElement} canvas
     * @param {Record<number,string>} labels
     * @param {(note:number, vel:number)=>void} onPress  vel 0 releases
     */
    constructor(keysEl, canvas, labels, onPress) {
        this.canvas = canvas;
        this.keys = new Map();
        this.held = new Map(); // note -> [{ who, color, vel }]
        this.trails = [];
        for (let n = LOW; n <= HIGH; n++) {
            const el = document.createElement('div');
            const box = keyBox(n);
            el.className = isBlack(n) ? 'key black' : 'key white';
            el.style.left = `${box.x * 100}%`;
            el.style.width = `${box.w * 100}%`;
            el.dataset.note = n;
            if (labels[n]) {
                const label = document.createElement('span');
                label.textContent = labels[n];
                el.append(label);
            }
            keysEl.append(el);
            this.keys.set(n, el);
        }
        this.bindPointer(keysEl, onPress);
        requestAnimationFrame(t => this.draw(t));
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
        const top = list[list.length - 1];
        el.classList.toggle('on', !!top);
        if (top) {
            el.style.setProperty('--c', top.color);
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
        this.trails = this.trails.filter(t => t.end === null || (now - t.end) / 1000 * RISE_PX_PER_S < h);
        for (const t of this.trails) {
            const box = keyBox(t.note);
            const bottom = h - (t.end === null ? 0 : (now - t.end) / 1000 * RISE_PX_PER_S);
            const top = h - (now - t.start) / 1000 * RISE_PX_PER_S;
            g.globalAlpha = t.alpha;
            g.fillStyle = t.color;
            const x = box.x * w + 1, bw = Math.max(2, box.w * w - 2);
            g.beginPath();
            g.roundRect(x, Math.max(top, -4), bw, Math.max(2, bottom - Math.max(top, -4)), 3);
            g.fill();
        }
        g.globalAlpha = 1;
        requestAnimationFrame(t => this.draw(t));
    }
}
