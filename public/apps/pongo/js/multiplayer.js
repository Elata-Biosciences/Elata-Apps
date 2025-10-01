// Pongo/js/multiplayer.js
import { showMessage, hideMessage, updateCountdown, hideCountdown, hideStartOverlay, showToast } from './ui.js';

let sock = null;
let side = null;
let leftTimer = null;
let rightTimer = null;
let mySeq = 0;
const pending = [];
let TICK_RATE = 30;
let PADDLE_SPEED = 0.5;
let DT = 1 / TICK_RATE;
let PADDLE_HEIGHT_NORM = 0.2;
let PADDLE_WIDTH_NORM = 0.2;
let DEBUG_MP = false;

const STATE_BUFFER = [];
const RENDER_BUFFER_MS = 100;
let __lastRoundState = null;
let __lastAckSeqLog = -1;
let __lastPendingLog = -1;


// Render smoothing + jump detection
const EASE_MS = 90; // ~90ms exponential approach for local paddle
const PADDLE_JUMP_FRAC = 0.12; // 12% of canvas height
const BALL_JUMP_FRAC = 0.18;   // 18% of canvas diagonal
const RENDER = { lastNow: 0, lastBall: { x: null, y: null }, lastSelfX: null };

function dbg(event, data) {
  if (!DEBUG_MP) return;
  try {
    console.debug('[mp]', event, data || {});
    if (sock) sock.emit('client:log', { event, data });
  } catch {}
}

let SELF_BASE = null; // { selfX, ackSeq, side, _at }
function onRectify(msg){
  try {
    const x = Number(msg && msg.selfX);
    const ack = Number(msg && msg.ackSeq);
    if (Number.isFinite(x)) {
      SELF_BASE = { selfX: Math.max(0, Math.min(1, x)), ackSeq: Number.isFinite(ack)?ack:0, side: msg.side, _at: performance.now(), serverT: Number(msg && msg.t) };
    }
    if (Number.isFinite(ack)) {
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].seq <= ack) pending.splice(i, 1);
      }
    }
  } catch {}
}


// --- Time sync (server clock vs client clock) ---
let SERVER_OFFSET_MS = 0; // serverNow ≈ Date.now() + SERVER_OFFSET_MS
let SERVER_RTT_MS = 0;
function syncTime(){
  try{
    if(!sock) return;
    const c0 = Date.now();
    sock.emit('time', { c0 }, (res)=>{
      const c1 = Date.now();
      if(!res || typeof res.serverNow !== 'number') return;
      const rtt = Math.max(0, c1 - c0);
      const est = res.serverNow - (c0 + rtt/2);
      SERVER_RTT_MS = rtt;
      // Simple exponential smoothing on offset to reduce jitter
      const alpha = 0.3;
      SERVER_OFFSET_MS = (1-alpha)*SERVER_OFFSET_MS + alpha*est;
      if (DEBUG_MP) console.log('[mp] time sync', { rtt, offset: Math.round(SERVER_OFFSET_MS) });
    });
  } catch{}
}


export function initMultiplayer(debug) {
    DEBUG_MP = debug;
    loadServerConfig();
}

function loadServerConfig() {
    fetch('/game/config')
        .then(r => r.json())
        .then(cfg => {
            if (cfg && typeof cfg.TICK_RATE === 'number') TICK_RATE = cfg.TICK_RATE;
            if (cfg && typeof cfg.PADDLE_SPEED === 'number') PADDLE_SPEED = cfg.PADDLE_SPEED;
            if (cfg && typeof cfg.PADDLE_HEIGHT === 'number') PADDLE_HEIGHT_NORM = cfg.PADDLE_HEIGHT;
            if (cfg && typeof cfg.PADDLE_WIDTH === 'number') PADDLE_WIDTH_NORM = cfg.PADDLE_WIDTH;
            DT = 1 / TICK_RATE;
            if (DEBUG_MP) console.log('[mp] config', { TICK_RATE, PADDLE_SPEED, PADDLE_HEIGHT_NORM, PADDLE_WIDTH_NORM });
        })
        .catch(e => {
            if (DEBUG_MP) console.warn('[mp] config fetch failed', e);
        });
}

function sendMove(direction) {
    if (!sock) return;
    const seq = ++mySeq;
    sock.emit('input', { action: 'move', direction, seq });
    pending.push({ seq, direction });
}

function startRepeat(dir) {
    if ((dir === 'left' && leftTimer) || (dir === 'right' && rightTimer)) return;
    const send = () => sendMove(dir);
    if (dir === 'left') {
        leftTimer = setInterval(send, 60);
        send();
    }
    if (dir === 'right') {
        rightTimer = setInterval(send, 60);
        send();
    }
}

function stopRepeat(dir) {
    if (dir === 'left' && leftTimer) {
        clearInterval(leftTimer);
        leftTimer = null;
    }
    if (dir === 'right' && rightTimer) {
        clearInterval(rightTimer);
        rightTimer = null;
    }
}

function applyState(s) { try { hideStartOverlay(); } catch {}
    try {
        if (side && s.lastSeq) {
            const ackSeq = s.lastSeq[side];
            for (let i = pending.length - 1; i >= 0; i--) {
                if (pending[i].seq <= ackSeq) pending.splice(i, 1);
            }
        }
        const snap = {
            _at: performance.now(),
            t: s.t,
            paddles: { left: Number(s.paddles.left) || 0.5, right: Number(s.paddles.right) || 0.5 },
            ball: { x: Number(s.ball.x) || 0.5, y: Number(s.ball.y) || 0.5 },
            scores: s.scores || { left: 0, right: 0 },
            roundState: s.roundState || 'waiting',
            roundTimer: Number(s.roundTimer) || 0
        };
        // UI: waiting / countdown display
        if (snap.roundState === 'waiting') {
            showMessage(`Waiting for another player to join${(typeof window!=='undefined' && window.location && window.location.pathname)?` in room ${(window.location.pathname.split('/').filter(Boolean)[1]||'default')}`:''}…`, false);
            hideCountdown();
        } else {
            hideMessage();
            if (snap.roundState === 'countdown') {
                console.log('[ui] countdown show', { t: snap.roundTimer, n: Math.max(1, Math.ceil(snap.roundTimer||0)) });
                updateCountdown(snap.roundTimer);
            } else {
                console.log('[ui] countdown hidden (state=', snap.roundState, ')');
                hideCountdown();
            }
        }
        STATE_BUFFER.push(snap);
        if (STATE_BUFFER.length > 60) STATE_BUFFER.splice(0, STATE_BUFFER.length - 60);
        __lastRoundState = snap.roundState;
    } catch (e) {
        if (DEBUG_MP) console.warn('[mp] applyState error', e);
    }
}

export function stepMultiplayer(now, player, computer, ball, canvas) {
    if (!STATE_BUFFER || STATE_BUFFER.length === 0) return;
    // Compute target in server time using offset-synchronized clocks
    const serverNowEst = Date.now() + SERVER_OFFSET_MS;
    const targetServerT = serverNowEst - RENDER_BUFFER_MS;
    let a = STATE_BUFFER[0], b = STATE_BUFFER[STATE_BUFFER.length - 1];
    for (let i = 0; i < STATE_BUFFER.length - 1; i++) {
        if (STATE_BUFFER[i].t <= targetServerT && targetServerT <= STATE_BUFFER[i + 1].t) {
            a = STATE_BUFFER[i]; b = STATE_BUFFER[i + 1]; break;
        }
    }
    const span = Math.max(1, b.t - a.t);
    const t = Math.max(0, Math.min(1, (targetServerT - a.t) / span));
    const lerp = (x0, x1) => x0 + (x1 - x0) * t;

    // Interpolated normalized state - now using top/bottom instead of left/right
    const topX = lerp(a.paddles.top, b.paddles.top);
    const bottomX = lerp(a.paddles.bottom, b.paddles.bottom);
    const ballX = lerp(a.ball.x, b.ball.x);
    const ballY = lerp(a.ball.y, b.ball.y);

    // Predict local paddle from server baseline (or EEG override)
    // Prefer server-provided self baseline when available (recent rectify), else use interpolated
    const isBaseFresh = (SELF_BASE && (Math.abs((Date.now() + SERVER_OFFSET_MS) - (Number(SELF_BASE.serverT)||0)) < 250));
    let baseSelf = isBaseFresh ? SELF_BASE.selfX : (side === 'top' ? topX : bottomX);

    // EEG override (client-side control, not sent to server)
    try {
      const eegAt = (typeof window !== 'undefined' && window.__EEG_X_AT) || 0;
      if (eegAt && (performance.now() - eegAt) < 800) {
        const eegX = Number(window.__EEG_X_NORM);
        if (Number.isFinite(eegX)) {
          baseSelf = Math.max(PADDLE_WIDTH_NORM / 2, Math.min(1 - PADDLE_WIDTH_NORM / 2, eegX));
        }
      }
    } catch {}

    let selfX = side ? applyPrediction(baseSelf) : baseSelf;

    if (baseSelf !== (side === 'top' ? topX : bottomX)) {
      console.debug('[EEG][client] applying EEG override for self paddle', { baseSelf, side });
      if (!side) console.warn('[EEG][client] override present but side not yet assigned (spectating).');
    }

    const PADDLE_W = PADDLE_WIDTH_NORM * canvas.width;
    const localTarget = centerNormToPxLeft(selfX, PADDLE_W, canvas.width);
    const otherTargetTop = centerNormToPxLeft(topX, PADDLE_W, canvas.width);
    const otherTargetBottom = centerNormToPxLeft(bottomX, PADDLE_W, canvas.width);

    // Exponential smoothing for local paddle to hide corrections
    const dtMs = Math.max(0, now - (RENDER.lastNow || now));
    const alpha = 1 - Math.exp(-dtMs / EASE_MS);
    if (RENDER.lastSelfX === null) RENDER.lastSelfX = localTarget;
    RENDER.lastSelfX += (localTarget - RENDER.lastSelfX) * alpha;

    // Detect large jumps in ball position (teleports) and reset smoothing
    const ballPxX = normToPxX(ballX, canvas.width);
    const ballPxY = normToPxYFull(ballY, canvas.height);
    if (RENDER.lastBall.x !== null) {
      const dx = ballPxX - RENDER.lastBall.x;
      const dy = ballPxY - RENDER.lastBall.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const maxJump = BALL_JUMP_FRAC * Math.sqrt(canvas.width*canvas.width + canvas.height*canvas.height);
      if (dist > maxJump) {
        dbg('ball jump', { dist: Math.round(dist), max: Math.round(maxJump) });
        RENDER.lastBall.x = null; // Reset to cause snap
      }
    }

    // Exponential smoothing for ball
    const ballAlpha = 1 - Math.exp(-dtMs / 45); // Faster smoothing for ball
    if (RENDER.lastBall.x === null) {
      RENDER.lastBall.x = ballPxX;
      RENDER.lastBall.y = ballPxY;
    }
    RENDER.lastBall.x += (ballPxX - RENDER.lastBall.x) * ballAlpha;
    RENDER.lastBall.y += (ballPxY - RENDER.lastBall.y) * ballAlpha;

    // --- Write to scene ---
    if (side === 'bottom') {
        player.x = RENDER.lastSelfX;
        computer.x = otherTargetTop;
    } else if (side === 'top') {
        player.x = RENDER.lastSelfX;
        computer.x = otherTargetBottom;
    }
    ball.x = RENDER.lastBall.x;
    ball.y = RENDER.lastBall.y;
    RENDER.lastNow = now;
}

function applyPrediction(baseX) {
    let x = baseX;
    for (const inp of pending) {
        const dx = inp.direction === 'left' ? -PADDLE_SPEED * DT : PADDLE_SPEED * DT;
        x = clamp(x + dx, 0 + PADDLE_WIDTH_NORM / 2, 1 - PADDLE_WIDTH_NORM / 2);
    }
    return x;
}

export function setupSocket(roomId, opts = {}) {
    if (sock) return;
    sock = io('/game');
    sock.on('connect', () => {
        if (DEBUG_MP) console.log('[mp] socket connected', sock.id);
    });
    sock.on('system:restart', (msg)=>{
        if (msg && msg.ok) { try { showToast('Server restarted round'); } catch {} }
    });
    sock.on('disconnect', (r) => {
        if (DEBUG_MP) console.log('[mp] socket disconnected', r);
    });
    const joinPayload = { roomId, name: 'Player' };
    if (opts && typeof opts.maxPlayers === 'number') joinPayload.maxPlayers = opts.maxPlayers;
    if (opts && opts.autoDetect) joinPayload.autoDetect = true;

    sock.emit('join', joinPayload, (ack) => {
        side = ack && ack.side;
        const playerCount = (ack && ack.playerCount) || 0;
        const isAlone = playerCount <= 1;

        if (DEBUG_MP) console.log('[mp] joined', {
            roomId,
            side,
            role: ack && ack.role,
            maxPlayers: ack && ack.maxPlayers,
            playerCount,
            isAlone
        });

        // Call the onRoomState callback if provided
        if (opts && typeof opts.onRoomState === 'function') {
            opts.onRoomState({ playerCount, isAlone, side, role: ack && ack.role });
        }
    });
    sock.on('state', applyState);
    sock.on('gameState', applyState);
    sock.on('rectify', onRectify);
    sock.on('reconnect', () => {
        if (DEBUG_MP) console.log('[mp] reconnect, clearing buffer');
        STATE_BUFFER.length = 0;
        try { syncTime(); } catch{}
    });

    // Listen for player join events to switch from AI to multiplayer
    sock.on('player:join', (msg) => {
        if (DEBUG_MP) console.log('[mp] player joined', msg);
        if (opts && typeof opts.onRoomState === 'function') {
            // Someone joined, we're no longer alone
            opts.onRoomState({ playerCount: 2, isAlone: false, newPlayer: msg });
        }
    });

    try { syncTime(); } catch{}
    try { setInterval(syncTime, 3000); } catch{}

    window.addEventListener('keydown', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
            startRepeat('left');
            e.preventDefault();
        }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') {
            startRepeat('right');
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') stopRepeat('left');
        if (k === 'ArrowRight' || k === 'd' || k === 'D') stopRepeat('right');
    });
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function requestRestart() {
    if (sock) sock.emit('game:restart', {});
}

function normToPxX(n, width) {
    return clamp(n, 0, 1) * width;
}

function normToPxYFull(n, height) {
    return Math.max(0, Math.min(1, n)) * height;
}

function centerNormToPxTop(n, rectH, height) {
    const v = Math.max(0, Math.min(1, n));
    const center = v * height;
    const top = center - rectH / 2;
    return Math.max(0, Math.min(height - rectH, top));
}

function centerNormToPxLeft(n, rectW, width) {
    const v = Math.max(0, Math.min(1, n));
    const center = v * width;
    const left = center - rectW / 2;
    return Math.max(0, Math.min(width - rectW, left));
}
