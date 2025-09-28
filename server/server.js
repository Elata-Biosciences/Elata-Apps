'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (req, res) => res.send('ok'));
// Serve static landing + demos from top-level public/
app.use(express.static(path.join(__dirname, '..', 'public')));
// Ensure /apps routes are served from top-level public/apps
app.use('/apps', express.static(path.join(__dirname, '..', 'public', 'apps')));
// Expose repo docs as static under /docs for on-site viewing
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

// Expose Pongo assets (built CSS, vendor libs, favicon) without copying
app.use('/assets/pongo/dist', express.static(path.join(__dirname, '..', 'Pongo', 'dist')));
app.use('/assets/pongo/vendor', express.static(path.join(__dirname, '..', 'Pongo', 'vendor')));
app.get('/assets/pongo/favicon.svg', (_req, res) => res.sendFile(path.join(__dirname, '..', 'Pongo', 'favicon.svg')));

// --- File logging to /logs (auto-enabled unless NO_FILE_LOG=1) ---
(function setupFileLogging(){
  try {
    if (process.env.NO_FILE_LOG === '1') return;
    const logDir = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const d = new Date();
    const pad = (n)=> String(n).padStart(2,'0');
    const fname = `server-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.log`;
    const fpath = path.join(logDir, fname);
    const stream = fs.createWriteStream(fpath, { flags: 'a' });
    const origLog = console.log.bind(console);
    const origErr = console.error.bind(console);
    const stamp = ()=>{
      try{ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}:${pad(new Date().getSeconds())}`; }catch{ return new Date().toISOString(); }
    };
    const write = (level, args)=>{
      const msg = args.map(a=>{
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      try { stream.write(`${stamp()} [${level}] ${msg}\n`); } catch {}
    };
    console.log = (...args)=>{ write('INFO', args); origLog(...args); };
    console.error = (...args)=>{ write('ERROR', args); origErr(...args); };
    origLog(`[log] file logging enabled: ${fpath}`);
  } catch (e) {
    // If file logging fails, continue with console only
  }
})();

// Expose server gameplay constants to clients (HTTP)
app.get('/game/config', (_req, res) => {
  res.json({
    TICK_RATE,
    PADDLE_SPEED,
    PADDLE_HEIGHT,
    PADDLE_WIDTH,
    BALL_RADIUS,
    INPUTS_PER_SEC,
    INPUT_BURST,
    MAX_INPUT_QUEUE,
    DEFAULT_MAX_PLAYERS: 2,
  });
});

// Clean URLs for app rooms: /:app/:roomId -> serve the app's HTML
app.get('/:app/:roomId', (req, res, next) => {
  const appSlug = String(req.params.app || '').toLowerCase();
  if (appSlug === 'game') return next(); // allow /game/* endpoints to pass through
  const publicDir = path.join(__dirname, '..', 'public', 'apps');
  const candidates = [
    path.join(publicDir, `${appSlug}.html`),
    path.join(publicDir, appSlug, 'index.html'),
  ];
  const target = candidates.find(p => fs.existsSync(p));
  if (!target) return next();
  res.sendFile(target);
});




const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ORIGIN,
    methods: ['GET', 'POST']
  }
});

// Root namespace: connectivity sanity
io.on('connection', (socket) => {
  console.log('[root] connected', socket.id);
  socket.on('ping', (msg) => socket.emit('pong', msg));
  socket.on('disconnect', (reason) => {
    console.log('[root] disconnected', socket.id, reason);
  });
});

// =========================
// Generic control relay namespace
// =========================
const relay = io.of('/relay');
relay.on('connection', (socket) => {
  let roomId = null;
  socket.on('join', (p = {}, ack) => {
    roomId = String(p.roomId || 'default'); socket.join(roomId);
    ack && ack({ ok: true, roomId, userId: socket.id });
    socket.to(roomId).emit('user:join', { userId: socket.id, name: p.name || 'anon' });
  });
  socket.on('input', (msg = {}) => { if (!roomId) return; relay.to(roomId).emit('input', { from: socket.id, ...msg }); });
  socket.on('state', (msg = {}) => { if (!roomId) return; socket.to(roomId).emit('state', msg); });
  socket.on('disconnect', () => { if (roomId) socket.to(roomId).emit('user:leave', { userId: socket.id }); });
});


// =========================
// Multiplayer Pong namespace
// =========================
const game = io.of('/game');

// --- Game Constants ---
const PADDLE_HEIGHT = 0.2;
const PADDLE_WIDTH = 0.02;
const BALL_RADIUS = 0.015;
const PADDLE_SPEED = 0.5; // units per second
const INITIAL_BALL_SPEED = 0.4;
const BALL_SPEED_INCREASE_FACTOR = 1.05;
const MAX_BALL_SPEED = 1.5;
const COUNTDOWN_SECONDS = 3;
const TICK_RATE = 30; // 30 ticks per second
// Input rate limiting (token bucket)
const INPUTS_PER_SEC = 20; // steady rate
const INPUT_BURST = 10;    // max burst tokens
const MAX_INPUT_QUEUE = 8; // per player, per tick

// Debug toggle via env var; default on in development
const DEBUG_GAME = (process.env.DEBUG_GAME === '1') || (process.env.NODE_ENV === 'development');

// --- Game State ---
const rooms = new Map(); // roomId -> room state

function createInitialGameState(id) {
  return {
    id,
    players: new Map(), // socketId -> { name, side, inputs: [] }
    sides: { left: null, right: null },
    spectators: new Set(),
    paddles: {
      left: { y: 0.5 },
      right: { y: 0.5 }
    },
    ball: {
      x: 0.5,
      y: 0.5,
      vx: 0, // Start with 0 velocity
      vy: 0
    },
    scores: { left: 0, right: 0 },
    roundState: 'waiting', // 'waiting', 'countdown', 'playing'
    roundTimer: 0,
    lastTick: Date.now(),
    timer: null,
    maxPlayers: 2,
  };
}

function startLoop(room) {
  if (room.timer) return;
  room.lastTick = Date.now();
  console.log('[game] startLoop', room.id, 'state=', room.roundState);
  room.timer = setInterval(() => tick(room), 1000 / TICK_RATE);
}

function stopLoop(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function assignSide(room, socketId) {
  if (!room.sides.left) { room.sides.left = socketId; return 'left'; }
  if (!room.sides.right) { room.sides.right = socketId; return 'right'; }
  return null; // spectator
}

function removeSocketFromRoom(room, socketId) {
  const side = room.sides.left === socketId ? 'left' : room.sides.right === socketId ? 'right' : null;
  if (side) {
    room.sides[side] = null;
    room.players.delete(socketId);
  } else {
    room.spectators.delete(socketId);
  }
}

function tick(room) {
  const now = Date.now();
  const dt = 1 / TICK_RATE; // Use fixed delta time for determinism
  room.lastTick = now;

  // 1. Handle different round states
  switch (room.roundState) {
    case 'countdown':
      room.roundTimer -= dt;
      if (DEBUG_GAME && Math.abs(room.roundTimer - Math.round(room.roundTimer)) < 1e-3) {
        console.log('[game] countdown', room.id, 't=', room.roundTimer.toFixed(2));
      }
      if (room.roundTimer <= 0) {
        room.roundState = 'playing';
        const serveDirection = Math.random() > 0.5 ? 1 : -1;
        console.log('[game] start PLAYING', room.id, 'serve dir=', serveDirection);
        resetBall(room, serveDirection);
      }
      break;

    case 'playing':
      // 2. Process inputs for each player
      for (const [, player] of room.players.entries()) {
        const paddle = room.paddles[player.side];
        if (!paddle) continue;

        // Process all queued inputs
        player.inputs.forEach(input => {
          if (input.action === 'move') {
            const direction = input.direction === 'up' ? -1 : 1;
            paddle.y += direction * PADDLE_SPEED * dt;
            paddle.y = Math.max(PADDLE_HEIGHT / 2, Math.min(1 - PADDLE_HEIGHT / 2, paddle.y));
          }
        });
        // Clear inputs after processing
        player.inputs = [];
      }


      // 3. Update ball physics
      const padH = PADDLE_HEIGHT;
      room.ball.x += room.ball.vx * dt;
      room.ball.y += room.ball.vy * dt;

      // Collide with top/bottom
      if (room.ball.y <= BALL_RADIUS) { room.ball.y = BALL_RADIUS; room.ball.vy = Math.abs(room.ball.vy); }
      if (room.ball.y >= 1 - BALL_RADIUS) { room.ball.y = 1 - BALL_RADIUS; room.ball.vy = -Math.abs(room.ball.vy); }

      // Left paddle collision
      if (room.ball.vx < 0 && room.ball.x <= PADDLE_WIDTH + BALL_RADIUS) {


        if (Math.abs(room.ball.y - room.paddles.left.y) <= padH / 2) {
          room.ball.x = PADDLE_WIDTH + BALL_RADIUS;
          // Increase horizontal speed slightly on paddle hit
          room.ball.vx = Math.abs(room.ball.vx) * BALL_SPEED_INCREASE_FACTOR;
          if (Math.abs(room.ball.vx) > MAX_BALL_SPEED) room.ball.vx = Math.sign(room.ball.vx) * MAX_BALL_SPEED;

          const spin = (room.ball.y - room.paddles.left.y) / (padH / 2);
          room.ball.vy += spin * 0.3;
        } else if (room.ball.x < 0) {
          // Right scores
          console.log('[game] score', room.id, 'right', 'ball=', { x: room.ball.x.toFixed(3), y: room.ball.y.toFixed(3) });
          room.scores.right += 1;
          startNewRound(room);
        }
      }
      // Right paddle collision
      if (room.ball.vx > 0 && room.ball.x >= 1 - PADDLE_WIDTH - BALL_RADIUS) {
        if (Math.abs(room.ball.y - room.paddles.right.y) <= padH / 2) {
          room.ball.x = 1 - PADDLE_WIDTH - BALL_RADIUS;
          room.ball.vx = -Math.abs(room.ball.vx) * BALL_SPEED_INCREASE_FACTOR;
          if (Math.abs(room.ball.vx) > MAX_BALL_SPEED) room.ball.vx = Math.sign(room.ball.vx) * MAX_BALL_SPEED;

          const spin = (room.ball.y - room.paddles.right.y) / (padH / 2);
          room.ball.vy += spin * 0.3;
        } else if (room.ball.x > 1) {
          // Left scores
          console.log('[game] score', room.id, 'left', 'ball=', { x: room.ball.x.toFixed(3), y: room.ball.y.toFixed(3) });
          room.scores.left += 1;
          startNewRound(room);
        }
      }
      break;
  }


  // 4. Broadcast state
  const lastSeqBySide = {
    left: room.sides.left ? (room.players.get(room.sides.left)?.lastProcessedSeq || 0) : 0,
    right: room.sides.right ? (room.players.get(room.sides.right)?.lastProcessedSeq || 0) : 0,
  };
  const state = {
    t: now,
    paddles: { left: room.paddles.left.y, right: room.paddles.right.y },
    ball: room.ball,
    scores: room.scores,
    roundState: room.roundState,
    roundTimer: room.roundTimer,
    lastSeq: lastSeqBySide,
  };
  game.to(room.id).emit('state', state);
  game.to(room.id).emit('gameState', state);
  // Periodic debug snapshot (once per ~1s)
  if (DEBUG_GAME) {
    if (!room.__lastDebugLogAt) room.__lastDebugLogAt = 0;
    if ((now - room.__lastDebugLogAt) >= 1000) {
      try {
        console.log('[game] tick', room.id, JSON.stringify({
          state: room.roundState,
          timer: Number(room.roundTimer || 0).toFixed(2),
          ball: { x: Number(room.ball.x).toFixed(3), y: Number(room.ball.y).toFixed(3), vx: Number(room.ball.vx).toFixed(3), vy: Number(room.ball.vy).toFixed(3) },
          paddles: { left: Number(room.paddles.left.y).toFixed(3), right: Number(room.paddles.right.y).toFixed(3) },
          scores: room.scores,
          players: room.players.size,
          sides: room.sides,
        }));
      } catch {}
      room.__lastDebugLogAt = now;
    }
  }

}

function startNewRound(room) {
  room.roundState = 'countdown';
  room.roundTimer = COUNTDOWN_SECONDS;
  room.ball.x = 0.5;
  room.ball.y = 0.5;
  room.ball.vx = 0;
  room.ball.vy = 0;
  console.log('[game] startNewRound', room.id, 'countdown', COUNTDOWN_SECONDS);
}

function resetBall(room, dir) {
  room.ball.x = 0.5;
  room.ball.y = 0.5;
  room.ball.vx = dir * INITIAL_BALL_SPEED;
  room.ball.vy = (Math.random() * 0.4 - 0.2);
  console.log('[game] resetBall', room.id, 'vx=', room.ball.vx.toFixed(3), 'vy=', room.ball.vy.toFixed(3));
}

game.on('connection', (socket) => {
  let roomId = null;
  let side = null;

  socket.on('join', (payload = {}, ack) => {
    try {
      const id = String(payload.roomId || 'default');
      const name = payload.name ? String(payload.name) : 'anon';
      if (!rooms.has(id)) rooms.set(id, createInitialGameState(id));
      const room = rooms.get(id);
      console.log('[game] join', { room: id, socket: socket.id, players: room.players.size, spectators: room.spectators.size });

      // Join socket.io room
      socket.join(id);
      roomId = id;

      // Enforce per-room max players (default 2)
      const canSeat = room.players.size < room.maxPlayers;

      // Assign side or spectator
      const assigned = canSeat ? assignSide(room, socket.id) : null;
      if (assigned) {
        side = assigned;
        room.players.set(socket.id, {
          name, side, inputs: [], lastProcessedSeq: 0, socketId: socket.id,
          rl: { tokens: INPUT_BURST, lastRefill: Date.now() }
        });
      } else {
        room.spectators.add(socket.id);
      }

      // Start the game if two players are present
      if (room.players.size === 2 && room.roundState === 'waiting') {
        startNewRound(room);
      }

      startLoop(room);


      // Accept client-side logs for correlation (saved to server file logs)
      socket.on('client:log', (msg = {}) => {
        try {
          const m = typeof msg === 'object' ? msg : { message: String(msg) };
          console.log('[client]', roomId, side, socket.id, m.event || m.message || '', m.data || {});
        } catch (e) {
          console.error('[client] log error', e);
        }
      });

      ack && ack({ ok: true, playerId: socket.id, side: side, role: side ? 'player' : 'spectator', maxPlayers: room.maxPlayers });
      // Notify others someone joined
      socket.to(id).emit('player:join', { playerId: socket.id, side, name });
    } catch (e) {
      ack && ack({ ok: false, error: 'bad join payload' });
    }
  });

  // Backward compatible input handler + queued input with rate limiting
  socket.on('input', (payload = {}) => {
    if (!roomId || !side) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(socket.id);

    // Helper: token-bucket rate limit per player
    const now = Date.now();
    const rl = player && player.rl;
    if (rl) {
      const elapsed = (now - rl.lastRefill) / 1000;
      rl.lastRefill = now;
      rl.tokens = Math.min(INPUT_BURST, rl.tokens + elapsed * INPUTS_PER_SEC);
    }

    // New model: queued move input with seq
    const hasSeq = Number.isFinite(Number(payload.seq));
    if (player && hasSeq && (payload.action === 'move') && (payload.direction === 'up' || payload.direction === 'down')) {
      if (rl && rl.tokens < 1) return; // drop if over rate
      const seq = Number(payload.seq);
      if (seq > player.lastProcessedSeq) {
        if (player.inputs.length < MAX_INPUT_QUEUE) {
          player.inputs.push({ action: 'move', direction: payload.direction, seq });
          player.lastProcessedSeq = seq;
          if (rl) rl.tokens -= 1;
        }
      }
      return;
    }

    // Legacy: absolute paddle position from client (clamped)
    const y = Number(payload.paddleY);
    if (Number.isFinite(y)) {
      const clampY = Math.max(PADDLE_HEIGHT / 2, Math.min(1 - PADDLE_HEIGHT / 2, y));
      room.paddles[side].y = clampY;
      socket.to(roomId).emit('input', { side, paddleY: clampY });
      return;
    }

    // Legacy: directional step inputs without seq
    if (typeof payload.dir === 'string') {
      const d = payload.dir.toLowerCase();
      if (d === 'up' || d === 'down') {
        if (rl && rl.tokens < 1) return; // rate limit legacy too
        const step = Number.isFinite(payload.step) ? Math.max(0, Math.min(0.2, Number(payload.step))) : 0.04;
        const dy = d === 'up' ? -step : step;
        const current = room.paddles[side].y;
        const next = Math.max(PADDLE_HEIGHT / 2, Math.min(1 - PADDLE_HEIGHT / 2, current + dy));
        room.paddles[side].y = next;
        socket.to(roomId).emit('input', { side, paddleY: next, dir: d });
        if (rl) rl.tokens -= 1;
      }
      return;
    }
  });

  // New explicit event alias for inputs (same handling as above)
  socket.on('playerInput', (payload = {}) => {
    socket.emit('input', payload);
  });

  socket.on('disconnect', () => {
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    removeSocketFromRoom(room, socket.id);
    socket.to(roomId).emit('player:leave', { playerId: socket.id, side });
    // Stop loop if room empty (no players and no spectators)
    if (!room.sides.left && !room.sides.right && room.spectators.size === 0) {
      stopLoop(room);
      rooms.delete(roomId);
    } else if (room.players.size < 2) {
      // Pause game if a player leaves
      room.roundState = 'waiting';
      room.ball.vx = 0;
      room.ball.vy = 0;
    }
  });
});

// =========================
// EEG namespace (producer/observer pattern)
// =========================
const eeg = io.of('/eeg');

eeg.on('connection', (socket) => {
  console.log('[eeg] connected', socket.id);

  let sessionId = null; // room key to group producer + observers
  let meta = null;      // {channels, srate, units, deviceId}

  // Producer sends metadata first
  socket.on('hello', (info = {}, ack) => {
    try {
      const channels = Array.isArray(info.channels) ? info.channels.map(String) : [];
      const srate = Number.isFinite(info.srate) ? Number(info.srate) : undefined;
      const units = info.units ? String(info.units) : undefined;
      const deviceId = info.deviceId ? String(info.deviceId) : undefined;
      sessionId = info.sessionId ? String(info.sessionId) : socket.id;
      if (!channels.length || !srate) {
        const err = 'invalid hello: requires channels[] and srate';
        return ack && ack({ ok: false, error: err });
      }
      meta = { channels, srate, units, deviceId, sessionId, t0: Date.now() };
      socket.join(sessionId);
      ack && ack({ ok: true, sessionId, meta });
      // inform observers in the room
      socket.to(sessionId).emit('meta', meta);
      console.log('[eeg] hello', { sessionId, channels: channels.length, srate, deviceId });
    } catch (e) {
      ack && ack({ ok: false, error: 'bad hello payload' });
    }
  });

  // JSON sample packet
  socket.on('eeg:sample', (packet = {}) => {
    if (!sessionId) return; // ignore until hello
    const t = Number(packet.t ?? Date.now());
    const samples = packet.samples;
    if (!samples || (typeof samples !== 'object')) return;
    const count = Array.isArray(samples) ? samples.length : 0;
    if (count === 0 || count > 1e6) return; // guard
    eeg.to(sessionId).emit('eeg:sample', { t, samples, seq: packet.seq });
  });

  // Binary chunk for efficiency
  socket.on('eeg:chunk', (buf) => {
    if (!sessionId) return;
    const byteLength = (buf && (buf.byteLength || buf.length)) || 0;
    if (!byteLength || byteLength > 2 * 1024 * 1024) return; // 2MB guard
    eeg.to(sessionId).emit('eeg:chunk', buf);
  });

  // Observers join a session to receive streams
  socket.on('observe', (id, ack) => {
    try {
      const room = String(id || '');
      if (!room) return ack && ack({ ok: false, error: 'missing session id' });
      socket.join(room);
      ack && ack({ ok: true, meta });
      if (meta && meta.sessionId === room) socket.emit('meta', meta);
      console.log('[eeg] observer joined', room, socket.id);
    } catch {
      ack && ack({ ok: false, error: 'invalid room' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[eeg] disconnected', socket.id, reason);
  });
});

function start(port = PORT) {
  return new Promise((resolve, reject) => {
    // Attach a one-time error handler so listen errors (EADDRINUSE etc.) are
    // reported with a timestamp instead of crashing with an uncaught exception.
    const onError = (err) => {
      const ts = typeof formatTimestamp === 'function' ? formatTimestamp(new Date()) : new Date().toISOString();
      console.error(`Realtime server error: ${err && err.message ? err.message : String(err)}`);
      reject(err);
    };
    server.once('error', onError);

    server.listen(port, () => {
      server.removeListener('error', onError);
      const addr = server.address();
      const ts = formatTimestamp(new Date());
      console.log(`${ts} realtime server listening on localhost:${addr && addr.port}`);
      resolve(addr && addr.port);
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// Helper: human-readable timestamp
function pad(n) { return String(n).padStart(2, '0'); }
function formatTimestamp(d) {
  try {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return (new Date()).toISOString();
  }
}

if (require.main === module) {
  // When run directly (or restarted by a watcher), print a labelled restart message
  console.log(`Restarting 'server.js' ${formatTimestamp(new Date())}`);
  start();
}

module.exports = { app, io, server, start, stop, __constants: { TICK_RATE, PADDLE_SPEED, PADDLE_HEIGHT, INPUTS_PER_SEC, INPUT_BURST, MAX_INPUT_QUEUE } };
