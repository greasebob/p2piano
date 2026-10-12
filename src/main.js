import './style.css';
import { createIcons, Link, Check, Maximize, Minimize, Settings, Piano, LogIn, Plus, Keyboard } from 'lucide';
import { BANKS, loadBank, createPiano, Hand } from './audio.js';
import { connect, selfId } from './net.js';
import { PianoView } from './view.js';
import { keyAction, keyLabels, levelVelocity, SUSTAIN_CODE, SOSTENUTO_CODE } from './keys.js';

const ICONS = { Link, Check, Maximize, Minimize, Settings, Piano, LogIn, Plus, Keyboard };
const icons = () => createIcons({ icons: ICONS });
const $ = id => document.getElementById(id);
const COLORS = ['#f2b84b', '#5ec7e8', '#ef6f8e', '#8bd17c', '#b28cf2', '#f58d4e', '#4fd1b5', '#e8e15e'];
const PEER_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14];

const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

const roomFromHash = () => (/^#([a-z0-9]{4,32})$/.exec(location.hash) || [])[1] || null;
let roomId = roomFromHash();
let me = { name: store.get('pr-name', ''), color: store.get('pr-color', COLORS[Math.floor(Math.random() * COLORS.length)]) };
store.set('pr-color', me.color);

/** A player's own colour, or the next one nobody else here shows, so no two players look alike. */
function freeColor(id, wanted) {
    const taken = new Set([me.color, ...[...peers.values()].filter(p => p.id !== id).map(p => p.info.color)]);
    const start = Math.max(0, COLORS.indexOf(wanted));
    for (let i = 0; i < COLORS.length; i++) {
        const c = COLORS[(start + i) % COLORS.length];
        if (!taken.has(c)) return c;
    }
    return COLORS[start];
}

$('name').value = me.name;
$('go').innerHTML = roomId ? '<i data-lucide="log-in"></i><span>Join room</span>' : '<i data-lucide="plus"></i><span>Create room</span>';
icons();
$('start-form').addEventListener('submit', e => {
    e.preventDefault();
    me.name = $('name').value.trim() || 'Player';
    store.set('pr-name', me.name);
    if (!roomId) {
        roomId = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
        history.replaceState(null, '', `#${roomId}`);
    }
    enter();
});
window.addEventListener('hashchange', () => { if (roomFromHash() !== roomId) location.reload(); });

// ---------------------------------------------------------------------------------------------

let ctx, piano = null, net, view;
let myHand = null;
const peers = new Map(); // id -> { info, hand, ping }

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
        onMidi(id, status, a, b, hold) {
            const p = peer(id);
            if (!p.hand) {
                if ((status & 0xf0) === 0x90 && b > 0) view.key(id, a, b, p.info.color);
                else if ((status & 0xf0) !== 0xb0) view.key(id, a, 0);
                return;
            }
            p.hand.midi(status, a, b, hold > 0 ? ctx.currentTime + hold / 1000 : 0, hold);
        },
        onPing(id, ms) {
            const p = peers.get(id);
            if (p) { p.ping = Math.round(ms); renderPeople(); }
        },
    });
    renderPeople();
    bindKeyboard();
    bindMidi();
    bindControls();
    start().catch(err => setStatus(`${err.message || err}`, true));
}

async function start() {
    const layers = $('layers').value;
    setStatus('Piano', false, 0);
    const bank = await loadBank(BANKS[layers].url, f => setStatus('Piano', false, f * 0.8));
    piano = await createPiano(ctx, bank, BANKS[layers].strikes, f => setStatus('Piano', false, 0.8 + f * 0.2));
    loadedLayers = layers;
    piano.setVolume(+$('volume').value / 100);
    piano.setReverb(+$('reverb').value);
    myHand = new Hand(piano.synth, 0, (note, vel, delay) => view.key(selfId, note, vel, me.color));
    for (const p of peers.values()) attachHand(p);
    setStatus(null);
    changeLayers(); // in case they were changed while the first piano loaded
    if (ctx.state !== 'running') await ctx.resume();
}

let loadedLayers = null;
let bankJob = Promise.resolve();

/** Loads the piano with the chosen layer count, one switch at a time. */
function changeLayers() {
    bankJob = bankJob.then(async () => {
        const layers = $('layers').value;
        if (!piano || layers === loadedLayers) return;
        setStatus('Piano', false, 0);
        const bank = await loadBank(BANKS[layers].url, f => setStatus('Piano', false, f * 0.8));
        if ($('layers').value === layers) {
            await piano.setBank(bank, BANKS[layers].strikes, f => setStatus('Piano', false, 0.8 + f * 0.2));
            loadedLayers = layers;
        }
        setStatus(null);
        changeLayers(); // they may have changed again meanwhile
    }).catch(err => setStatus(`${err.message || err}`, true));
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
    if (ch === undefined) return; // more players than channels: seen, not heard
    p.hand = new Hand(piano.synth, ch, (note, vel, delay) => {
        const show = () => view.key(p.id, note, vel, p.info.color);
        if (delay > 0) setTimeout(show, delay); else show();
    });
}

/** One of my own MIDI messages: heard here and sent to the room. */
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

// --- computer keyboard ---------------------------------------------------------------------------

let keyboardVelocity = 100;

function bindKeyboard() {
    const held = new Map(); // code -> notes
    const pedals = new Set();
    const typing = e => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    $('vel-key').textContent = keyboardVelocity;

    window.addEventListener('keydown', e => {
        if (typing(e)) return;
        if (e.code === 'AltLeft' || e.code === 'AltRight') { e.preventDefault(); return; }
        if (e.code === SUSTAIN_CODE || e.code === SOSTENUTO_CODE) {
            e.preventDefault();
            if (!pedals.has(e.code)) {
                pedals.add(e.code);
                local(0xb0, e.code === SUSTAIN_CODE ? 64 : 66, 127);
            }
            return;
        }
        const act = keyAction(e);
        if (!act) {
            if ((e.ctrlKey || e.altKey) && /^(Key|Digit)/.test(e.code)) e.preventDefault();
            return;
        }
        e.preventDefault();
        if ('level' in act) {
            keyboardVelocity = levelVelocity(act.level);
            $('vel-key').textContent = keyboardVelocity;
            return;
        }
        const notes = held.get(e.code) ?? [];
        if (notes.includes(act.note)) {
            if (e.repeat) return;
            local(0x80, act.note, 0);
        } else notes.push(act.note);
        held.set(e.code, notes);
        local(0x90, act.note, keyboardVelocity);
    });
    window.addEventListener('keyup', e => {
        if (e.code === 'AltLeft' || e.code === 'AltRight') { e.preventDefault(); return; }
        if (pedals.delete(e.code)) {
            local(0xb0, e.code === SUSTAIN_CODE ? 64 : 66, 0);
            return;
        }
        const notes = held.get(e.code);
        if (!notes) return;
        held.delete(e.code);
        for (const n of notes) local(0x80, n, 0);
    });
    window.addEventListener('blur', () => {
        for (const notes of held.values()) for (const n of notes) local(0x80, n, 0);
        held.clear();
        for (const code of pedals) local(0xb0, code === SUSTAIN_CODE ? 64 : 66, 0);
        pedals.clear();
    });
}

// --- MIDI inputs ---------------------------------------------------------------------------------

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
                    const [s, a = 0, b = 0] = m.data;
                    const type = s & 0xf0;
                    if (type === 0x90 || type === 0x80) local(type === 0x90 && b > 0 ? 0x90 : 0x80, a, type === 0x90 ? b : 0);
                    else if (type === 0xb0 && (a === 64 || a === 66 || a === 67)) local(0xb0, a, b);
                };
                const li = document.createElement('li');
                const label = document.createElement('label');
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = !off.has(input.name);
                box.onchange = () => {
                    if (box.checked) off.delete(input.name); else off.add(input.name);
                    store.set('pr-midi-off', JSON.stringify([...off]));
                };
                label.append(box, input.name);
                li.append(label);
                ul.append(li);
            }
            $('midi-none').hidden = access.inputs.size > 0;
        };
        access.onstatechange = list;
        list();
    }, () => { $('midi-none').hidden = false; });
}

// --- top bar and settings ------------------------------------------------------------------------

function bindControls() {
    $('invite').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(location.href); } catch { prompt('Room link', location.href); return; }
        $('invite').innerHTML = '<i data-lucide="check"></i><span>Copied</span>';
        icons();
        setTimeout(() => { $('invite').innerHTML = '<i data-lucide="link"></i><span>Invite</span>'; icons(); }, 1500);
    });
    $('fullscreen').addEventListener('click', async () => {
        if (document.fullscreenElement) return document.exitFullscreen();
        await document.documentElement.requestFullscreen();
        // Ctrl+W and Ctrl+T are 88-key notes; only a locked keyboard keeps them from the browser.
        try { await navigator.keyboard?.lock?.(); } catch { /* not Chromium */ }
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
    $('reverb').value = store.get('pr-reverb', '40');
    $('volume').addEventListener('input', () => { store.set('pr-volume', $('volume').value); piano?.setVolume(+$('volume').value / 100); });
    $('reverb').addEventListener('input', () => { store.set('pr-reverb', $('reverb').value); piano?.setReverb(+$('reverb').value); });
    $('layers').value = store.get('pr-layers', '8') === '16' ? '16' : '8';
    $('layers').addEventListener('change', () => { store.set('pr-layers', $('layers').value); changeLayers(); });
    // The first click anywhere also wakes audio a browser started suspended.
    document.addEventListener('pointerdown', () => { if (ctx.state !== 'running') ctx.resume(); });
    document.addEventListener('keydown', () => { if (ctx.state !== 'running') ctx.resume(); });
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

function setStatus(text, error = false, progress = null) {
    const el = $('loading');
    el.hidden = text == null;
    if (text == null) return;
    el.classList.toggle('error', error);
    $('loading-text').textContent = progress == null ? text : `${text} ${Math.round(progress * 100)}%`;
    $('loading-bar').style.width = `${(progress ?? 1) * 100}%`;
}
