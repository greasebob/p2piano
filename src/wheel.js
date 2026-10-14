// A radial colour picker over a plain <input>: the input keeps the colour as #rrggbb and
// gets an 'input' event on every change, so whoever listens to it needs to know nothing.
// Hue runs around the wheel, saturation from centre to edge, and the slider is brightness.

const SIZE = 176; // wheel diameter in CSS pixels

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function hsvToRgb(h, s, v) {
    const f = n => {
        const k = (n + h / 60) % 6;
        return v - v * s * clamp(Math.min(k, 4 - k), 0, 1);
    };
    return [f(5), f(3), f(1)].map(c => Math.round(c * 255));
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    return [h, max ? d / max : 0, max];
}

const toHex = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
const parseHex = hex => (/^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) : null);

function paintWheel(canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const n = Math.round(SIZE * dpr);
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(n, n);
    const c = n / 2, R = n / 2;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const dx = x + 0.5 - c, dy = y + 0.5 - c;
            const dist = Math.hypot(dx, dy);
            const alpha = clamp(R - dist, 0, 1); // one device pixel of soft edge
            if (!alpha) continue;
            const h = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
            const [r, g, b] = hsvToRgb(h, Math.min(1, dist / R), 1);
            const i = (y * n + x) * 4;
            img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = alpha * 255;
        }
    }
    ctx.putImageData(img, 0, 0);
}

/**
 * Turns `input` into a swatch that opens a colour wheel. Returns { refresh } to re-read input.value.
 * Given `brightness` (a range input) and `light` (hex, 0-1 -> hex), the slider is that input in
 * place of the colour's own brightness, and the wheel picks colours at full brightness.
 */
export function colorWheel(input, { brightness = null, light = null } = {}) {
    input.type = 'hidden';
    let h = 0, s = 0, v = 1;

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'wheel-swatch';
    swatch.ariaLabel = input.closest('label')?.textContent.trim() || 'Color';
    swatch.innerHTML = '<span></span>';
    input.before(swatch);

    const pop = document.createElement('div');
    pop.className = 'wheel-pop';
    pop.popover = 'auto';
    pop.innerHTML = `
        <div class="wheel-disc"><canvas tabindex="0" role="application" aria-roledescription="color wheel"></canvas><span class="wheel-mark"></span></div>
        <input type="range" min="0" max="100" step="0.5" aria-label="Brightness">
        <div class="wheel-rgb">${['R', 'G', 'B'].map(c => `<label><span>${c}</span><input type="text" inputmode="numeric" maxlength="3" autocomplete="off" spellcheck="false"></label>`).join('')}</div>`;
    // Beside the label, not in it: a click in the popover must not reach the label's button
    (input.closest('label') || input).after(pop);
    swatch.popoverTargetElement = pop;
    swatch.popoverTargetAction = 'toggle';

    const canvas = pop.querySelector('canvas');
    const mark = pop.querySelector('.wheel-mark');
    const slider = pop.querySelector('input');
    const fields = [...pop.querySelectorAll('.wheel-rgb input')];
    let painted = false;

    const hex = () => toHex(hsvToRgb(h, s, v));
    const show = () => {
        const color = hex();
        swatch.firstChild.style.background = color;
        mark.style.background = color;
        const a = h * Math.PI / 180, r = s * SIZE / 2;
        mark.style.left = `${SIZE / 2 + Math.cos(a) * r}px`;
        mark.style.top = `${SIZE / 2 - Math.sin(a) * r}px`;
        if (brightness) {
            slider.value = brightness.value;
            slider.style.background = `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(k => light(color, k)).join(', ')})`;
        } else {
            slider.value = String(v * 100);
            slider.style.setProperty('--full', toHex(hsvToRgb(h, s, 1)));
        }
        canvas.ariaValueText = color;
        // The field being typed in keeps what was typed
        hsvToRgb(h, s, v).forEach((c, i) => { if (document.activeElement !== fields[i]) fields[i].value = c; });
    };
    const emit = () => {
        show();
        const color = hex();
        if (input.value.toLowerCase() === color) return;
        input.value = color;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const refresh = () => {
        const rgb = parseHex(input.value);
        // Same colour as shown: keep h and s, which grey and black would otherwise lose
        if (rgb && toHex(rgb) !== hex()) [h, s, v] = rgbToHsv(...rgb);
        show();
    };

    // Picking on the wheel
    const pick = e => {
        const box = canvas.getBoundingClientRect();
        const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
        h = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
        s = clamp(Math.hypot(dx, dy) / (box.width / 2), 0, 1);
        if (v < 0.05 || brightness) v = 1; // picking a colour while black would show nothing
        emit();
    };
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(e.pointerId);
        pick(e);
    });
    canvas.addEventListener('pointermove', e => {
        if (canvas.hasPointerCapture(e.pointerId)) pick(e);
    });
    canvas.addEventListener('keydown', e => {
        const big = e.shiftKey;
        const step = {
            ArrowRight: () => { h = (h + (big ? 15 : 3) + 360) % 360; },
            ArrowLeft: () => { h = (h - (big ? 15 : 3) + 360) % 360; },
            ArrowUp: () => { s = clamp(s + (big ? 0.1 : 0.02), 0, 1); },
            ArrowDown: () => { s = clamp(s - (big ? 0.1 : 0.02), 0, 1); },
        }[e.key];
        if (!step) return;
        e.preventDefault();
        e.stopPropagation(); // the arrows move the marker, not the piano
        step();
        emit();
    });
    slider.addEventListener('input', () => {
        if (brightness) {
            brightness.value = slider.value;
            brightness.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        v = +slider.value / 100;
        emit();
    });
    if (brightness) slider.step = brightness.step || '1';

    // Typing red, green and blue, 0 to 255; Up and Down step by 1, or 10 with Shift
    const typed = () => {
        const rgb = fields.map(f => (/^\d{1,3}$/.test(f.value) ? Math.min(255, +f.value) : null));
        if (rgb.includes(null)) return;
        const [nh, ns, nv] = rgbToHsv(...rgb);
        if (ns) h = nh; // grey has no hue; keep the last
        if (nv) s = ns;
        v = nv;
        emit();
    };
    for (const f of fields) {
        f.addEventListener('input', typed);
        f.addEventListener('change', show); // tidies a field left empty or over 255
        f.addEventListener('keydown', e => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            f.value = clamp((parseInt(f.value, 10) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, 255);
            typed();
        });
    }

    // Opening: read the input afresh and sit under the swatch, inside the window
    const place = (w, ht) => {
        const b = swatch.getBoundingClientRect();
        const left = clamp(b.left, 8, window.innerWidth - w - 8);
        const below = b.bottom + 6;
        const top = below + ht + 8 > window.innerHeight ? Math.max(8, b.top - ht - 6) : below;
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
    };
    pop.addEventListener('beforetoggle', e => {
        if (e.newState !== 'open') return;
        if (!painted) { paintWheel(canvas); painted = true; }
        refresh();
        place(SIZE + 26, SIZE + 110);
    });
    pop.addEventListener('toggle', e => {
        if (e.newState === 'open') place(pop.offsetWidth, pop.offsetHeight);
    });
    // The swatch moves with a scrolled panel; the popover would be left behind
    swatch.closest('[popover]')?.addEventListener('scroll', () => {
        if (pop.matches(':popover-open')) pop.hidePopover();
    });
    window.addEventListener('resize', () => {
        if (pop.matches(':popover-open')) place(pop.offsetWidth, pop.offsetHeight);
    });

    refresh();
    return { refresh };
}
