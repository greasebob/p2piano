import './style.css';
import { createIcons, Link, Check, Maximize, Minimize, Settings, Piano, LogIn, Plus, Keyboard } from 'lucide';
import { BANKS, loadBank, createPiano, Hand } from './audio.js';
import { connect, selfId } from './net.js';
import { PianoView } from './view.js';
import { keyAction, keyLabels, levelVelocity, SUSTAIN_CODE, SOSTENUTO_CODE } from './keys.js';

const ICONS = { Link, Check, Maximize, Minimize, Settings, Piano, LogIn, Plus, Keyboard };
const COLORS = ['#f2b84b', '#5ec7e8', '#ef6f8e', '#8bd17c', '#b28cf2', '#f58d4e', '#4fd1b5', '#e8e15e'];
const PEER_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]; // 0 is ours, 9 is drums, 15 preloads
const ROOM_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

const $ = id => document.getElementById(id);
const icons = () => createIcons({ icons: ICONS });
const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const roomFromHash = () => (/^#([a-z0-9]{4,32})$/.exec(location.hash) || [])[1] || null;

let roomId = roomFromHash();
let me = { name: store.get('pr-name', ''), color: store.get('pr-color', COLORS[Math.floor(Math.random() * COLORS.length)]) };
store.set('pr-color', me.color);

let ctx, net, view;
let piano = null;
let myHand = null;
let loadedLayers = null;
let bankJob = Promise.resolve();
let keyboardVelocity = 100;
const peers = new Map(); // id -> { id, info, hand, ping }

// Start screen

$('name').value = me.name;
$('go').innerHTML = roomId
    ? '<i data-lucide="log-in"></i><span>Join room</span>'
    : '<i data-lucide="plus"></i><span>Create room</span>';
icons();

$('start-form').addEventListener('submit', e => {
    e.preventDefault();
    me.name = $('name').value.trim() || 'Player';
    store.set('pr-name', me.name);
    if (!roomId) {
        roomId = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ROOM_CHARS[b % ROOM_CHARS.length]).join('');
        history.replaceState(null, '', `#${roomId}`);
    }
    enter();
});
window.addEventListener('hashchange', () => { if (roomFromHash() !== roomId) location.reload(); });

// Room

function enter() {
    $('start').hidden = true;
    $('room').hidden = false;
    $('room-name').textContent = roomId;
    window.addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = ''; });

    ctx = new AudioContext({ latencyHint: 'interactive' });
    view = new PianoView($('keys'), $('rise'), keyLabels(), (note, vel) => local(vel ? 0x90 : 0x80, note, vel));
    net = connect(roomId, me, {
        onPeer(id, info) {
            const p = peer(id);
            p.info = { name: String(info?.name ?? 'Player').slice(0, 24), color: freeColor(id, info?.color) };
            renderPeople();
        },
        onLeave(id) {
            const p = peers.get(id);
            if (!p) return;
            p.hand?.release();
            view.clear(id);
            peers.delete(id);
            renderPeople();
        },
        onMidi(id, status, a, b, holdMs) {
            const p = peer(id);
            if (p.hand) {
                p.hand.midi(status, a, b, holdMs > 0 ? ctx.currentTime + holdMs / 1000 : 0, holdMs);
                return;
            }
            const type = status & 0xf0;
            if (type === 0x90 && b > 0) view.key(id, a, b, p.info.color);
            else if (type !== 0xb0) view.key(id, a, 0);
        },
        onPing(id, ms) {
            const p = peers.get(id);
            if (!p) return;
            p.ping = Math.round(ms);
            renderPeople();
        },
    });
    renderPeople();
    bindKeyboard();
    bindMidi();
    bindControls();
    start().catch(showError);
}

async function start() {
    const layers = $('layers').value;
    piano = await createPiano(ctx, await fetchBank(layers), BANKS[layers].strikes, preloadProgress);
    loadedLayers = layers;
    piano.setVolume(+$('volume').value / 100);
    piano.setReverb(+$('reverb').value);
    myHand = new Hand(piano.synth, 0, (note, vel) => view.key(selfId, note, vel, me.color));
    for (const p of peers.values()) attachHand(p);
    setStatus(null);
    changeLayers(); // applies a change made while loading
    if (ctx.state !== 'running') await ctx.resume();
}

function fetchBank(layers) {
    setStatus('Piano', false, 0);
    return loadBank(BANKS[layers].url, f => setStatus('Piano', false, f * 0.8));
}

function preloadProgress(f) {
    setStatus('Piano', false, 0.8 + f * 0.2);
}

/** Switches to the selected layer count. Switches run one at a time. */
function changeLayers() {
    bankJob = bankJob.then(async () => {
        const layers = $('layers').value;
        if (!piano || layers === loadedLayers) return;
        const bank = await fetchBank(layers);
        if ($('layers').value === layers) {
            await piano.setBank(bank, BANKS[layers].strikes, preloadProgress);
            loadedLayers = layers;
        }
        setStatus(null);
        changeLayers(); // applies a change made while loading
    }).catch(showError);
}

function peer(id) {
    if (!peers.has(id)) {
        const p = { id, info: { name: '…', color: '#888888' }, hand: null, ping: null };
        peers.set(id, p);
        attachHand(p);
    }
    return peers.get(id);
}

function attachHand(p) {
    if (!piano || p.hand) return;
    const used = new Set([...peers.values()].map(q => q.hand?.ch));
    const ch = PEER_CHANNELS.find(c => !used.has(c));
    if (ch === undefined) return; // no free channel: the player is shown but not heard
    p.hand = new Hand(piano.synth, ch, (note, vel, delayMs) => {
        const show = () => view.key(p.id, note, vel, p.info.color);
        if (delayMs > 0) setTimeout(show, delayMs);
        else show();
    });
}

/** Returns the wanted colour, or the next one no other player is shown in. */
function freeColor(id, wanted) {
    const taken = new Set([me.color, ...[...peers.values()].filter(p => p.id !== id).map(p => p.info.color)]);
    const start = Math.max(0, COLORS.indexOf(wanted));
    for (let i = 0; i < COLORS.length; i++) {
        const c = COLORS[(start + i) % COLORS.length];
        if (!taken.has(c)) return c;
    }
    return COLORS[start];
}

/** Plays a MIDI message from this player and sends it to the room. */
function local(status, a, b) {
    net.send(status, a, b);
    if (myHand) myHand.midi(status, a, b, 0);
    else if (status !== 0xb0) view.key(selfId, a, status === 0x90 ? b : 0, me.color);
    if (status === 0x90 && b > 0) $('vel-last').textContent = b;
    if (status === 0xb0) {
        const chip = { 64: 'ped-sus', 66: 'ped-sos', 67: 'ped-soft' }[a];
        if (chip) $(chip).classList.toggle('on', a === 64 ? b > 0 : b >= 64);
    }
}

// Computer keyboard

function bindKeyboard() {
    const held = new Map(); // key code -> notes
    const pedals = new Set(); // key codes
    const isText = el => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text');
    const isAlt = code => code === 'AltLeft' || code === 'AltRight';
    const pedalCC = code => (code === SUSTAIN_CODE ? 64 : 66);
    $('vel-key').textContent = keyboardVelocity;

    window.addEventListener('keydown', e => {
        if (isText(e.target)) return;
        if (isAlt(e.code)) {
            e.preventDefault(); // keeps the browser menu from taking focus
            return;
        }
        if (e.code === SUSTAIN_CODE || e.code === SOSTENUTO_CODE) {
            e.preventDefault();
            if (!pedals.has(e.code)) {
                pedals.add(e.code);
                local(0xb0, pedalCC(e.code), 127);
            }
            return;
        }
        const action = keyAction(e);
        if (!action) {
            if ((e.ctrlKey || e.altKey) && /^(Key|Digit)/.test(e.code)) e.preventDefault();
            return;
        }
        e.preventDefault();
        if ('level' in action) {
            keyboardVelocity = levelVelocity(action.level);
            $('vel-key').textContent = keyboardVelocity;
            return;
        }
        const notes = held.get(e.code) ?? [];
        if (notes.includes(action.note)) {
            if (e.repeat) return;
            local(0x80, action.note, 0); // pressed again without a release: restrike
        } else {
            notes.push(action.note);
        }
        held.set(e.code, notes);
        local(0x90, action.note, keyboardVelocity);
    });

    window.addEventListener('keyup', e => {
        if (isAlt(e.code)) {
            e.preventDefault();
            return;
        }
        if (pedals.delete(e.code)) {
            local(0xb0, pedalCC(e.code), 0);
            return;
        }
        const notes = held.get(e.code);
        if (!notes) return;
        held.delete(e.code);
        for (const n of notes) local(0x80, n, 0);
    });

    // Key releases are lost while the window is unfocused, so release everything.
    window.addEventListener('blur', () => {
        for (const notes of held.values()) for (const n of notes) local(0x80, n, 0);
        held.clear();
        for (const code of pedals) local(0xb0, pedalCC(code), 0);
        pedals.clear();
    });
}

// MIDI inputs

function bindMidi() {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then(access => {
        const off = new Set(JSON.parse(store.get('pr-midi-off', '[]')));
        const list = () => {
            const ul = $('midi-list');
            ul.replaceChildren();
            for (const input of access.inputs.values()) {
                input.onmidimessage = m => {
                    if (off.has(input.name)) return;
                    const [status, a = 0, b = 0] = m.data;
                    const type = status & 0xf0;
                    if (type === 0x90 && b > 0) local(0x90, a, b);
                    else if (type === 0x90 || type === 0x80) local(0x80, a, 0);
                    else if (type === 0xb0 && (a === 64 || a === 66 || a === 67)) local(0xb0, a, b);
                };
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = !off.has(input.name);
                box.onchange = () => {
                    if (box.checked) off.delete(input.name);
                    else off.add(input.name);
                    store.set('pr-midi-off', JSON.stringify([...off]));
                };
                const label = document.createElement('label');
                label.append(box, input.name);
                const li = document.createElement('li');
                li.append(label);
                ul.append(li);
            }
            $('midi-none').hidden = access.inputs.size > 0;
        };
        access.onstatechange = list;
        list();
    }, () => { $('midi-none').hidden = false; });
}

// Header and settings

function bindControls() {
    $('invite').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(location.href);
        } catch {
            prompt('Room link', location.href);
            return;
        }
        $('invite').innerHTML = '<i data-lucide="check"></i><span>Copied</span>';
        icons();
        setTimeout(() => {
            $('invite').innerHTML = '<i data-lucide="link"></i><span>Invite</span>';
            icons();
        }, 1500);
    });

    $('fullscreen').addEventListener('click', async () => {
        if (document.fullscreenElement) return document.exitFullscreen();
        await document.documentElement.requestFullscreen();
        // Keyboard lock lets Ctrl+W and Ctrl+T through to the page as notes.
        try { await navigator.keyboard?.lock?.(); } catch { /* unsupported */ }
    });
    document.addEventListener('fullscreenchange', () => {
        $('fullscreen').innerHTML = `<i data-lucide="${document.fullscreenElement ? 'minimize' : 'maximize'}"></i>`;
        icons();
    });

    $('my-name').value = me.name;
    $('my-name').addEventListener('change', () => {
        me.name = $('my-name').value.trim() || 'Player';
        store.set('pr-name', me.name);
        net.setMe(me);
        renderPeople();
    });

    $('volume').value = store.get('pr-volume', '80');
    $('volume').addEventListener('input', () => {
        store.set('pr-volume', $('volume').value);
        piano?.setVolume(+$('volume').value / 100);
    });
    $('reverb').value = store.get('pr-reverb', '40');
    $('reverb').addEventListener('input', () => {
        store.set('pr-reverb', $('reverb').value);
        piano?.setReverb(+$('reverb').value);
    });
    $('layers').value = store.get('pr-layers', '8') === '16' ? '16' : '8';
    $('layers').addEventListener('change', () => {
        store.set('pr-layers', $('layers').value);
        changeLayers();
    });

    // Browsers may keep audio suspended until the user interacts with the page.
    const resume = () => { if (ctx.state !== 'running') ctx.resume(); };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);
}

function renderPeople() {
    const ul = $('people');
    ul.replaceChildren();
    const chip = (info, ping, self) => {
        const li = document.createElement('li');
        if (self) li.className = 'self';
        const dot = document.createElement('i');
        dot.className = 'dot';
        dot.style.background = info.color;
        const name = document.createElement('span');
        name.textContent = info.name;
        li.append(dot, name);
        if (ping != null) {
            const ms = document.createElement('small');
            ms.textContent = `${ping} ms`;
            li.append(ms);
        }
        ul.append(li);
    };
    chip(me, null, true);
    for (const p of peers.values()) chip(p.info, p.ping, false);
}

/** Shows loading progress (0-1) or an error in the header; null text hides it. */
function setStatus(text, error = false, progress = null) {
    const el = $('loading');
    el.hidden = text == null;
    if (text == null) return;
    el.classList.toggle('error', error);
    $('loading-text').textContent = progress == null ? text : `${text} ${Math.round(progress * 100)}%`;
    $('loading-bar').style.width = `${(progress ?? 1) * 100}%`;
}

function showError(err) {
    setStatus(String(err?.message || err), true);
}
