'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

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
// Multiplayer Pong namespace
// =========================
const game = io.of('/game');

const rooms = new Map(); // roomId -> room state

function createRoom(id) {
  return {
    id,
    players: new Map(), // socketId -> { name, side }
    sides: { left: null, right: null },
    spectators: new Set(),
    paddles: { left: 0.5, right: 0.5 },
    ball: { x: 0.5, y: 0.5, vx: 0.35, vy: 0.22 },
    scores: { left: 0, right: 0 },
    lastTick: Date.now(),
    timer: null,
  };
}

function startLoop(room) {
  if (room.timer) return;
  room.lastTick = Date.now();
  room.timer = setInterval(() => tick(room), 1000 / 30);
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
  const dt = Math.min(0.05, (now - room.lastTick) / 1000);
  room.lastTick = now;

  // Basic physics in normalized [0,1]
  const padH = 0.2;
  room.ball.x += room.ball.vx * dt;
  room.ball.y += room.ball.vy * dt;

  // Collide with top/bottom
  if (room.ball.y <= 0) { room.ball.y = 0; room.ball.vy = Math.abs(room.ball.vy); }
  if (room.ball.y >= 1) { room.ball.y = 1; room.ball.vy = -Math.abs(room.ball.vy); }

  // Left paddle at x ~0.05
  if (room.ball.x <= 0.05) {
    if (Math.abs(room.ball.y - room.paddles.left) <= padH / 2) {
      room.ball.x = 0.05; room.ball.vx = Math.abs(room.ball.vx);
      const spin = (room.ball.y - room.paddles.left) * 1.2; room.ball.vy += spin;
    } else if (room.ball.x < -0.02) {
      // Right scores
      room.scores.right += 1; resetBall(room, -1);
    }
  }
  // Right paddle at x ~0.95
  if (room.ball.x >= 0.95) {
    if (Math.abs(room.ball.y - room.paddles.right) <= padH / 2) {
      room.ball.x = 0.95; room.ball.vx = -Math.abs(room.ball.vx);
      const spin = (room.ball.y - room.paddles.right) * 1.2; room.ball.vy += spin;
    } else if (room.ball.x > 1.02) {
      // Left scores
      room.scores.left += 1; resetBall(room, 1);
    }
  }

  // Broadcast state
  const state = {
    t: now,
    paddles: room.paddles,
    ball: room.ball,
    scores: room.scores,
  };
  game.to(room.id).emit('state', state);
}

function resetBall(room, dir) {
  room.ball.x = 0.5; room.ball.y = 0.5;
  const speed = 0.35;
  room.ball.vx = dir * speed;
  room.ball.vy = (Math.random() * 0.4 - 0.2);
}

game.on('connection', (socket) => {
  let roomId = null;
  let side = null;

  socket.on('join', (payload = {}, ack) => {
    try {
      const id = String(payload.roomId || 'default');
      const name = payload.name ? String(payload.name) : 'anon';
      if (!rooms.has(id)) rooms.set(id, createRoom(id));
      const room = rooms.get(id);

      // Join socket.io room
      socket.join(id);
      roomId = id;

      // Assign side or spectator
      const assigned = assignSide(room, socket.id);
      if (assigned) {
        side = assigned;
        room.players.set(socket.id, { name, side });
      } else {
        room.spectators.add(socket.id);
      }

      startLoop(room);

      ack && ack({ ok: true, playerId: socket.id, side: side, role: side ? 'player' : 'spectator' });
      // Notify others someone joined
      socket.to(id).emit('player:join', { playerId: socket.id, side, name });
    } catch (e) {
      ack && ack({ ok: false, error: 'bad join payload' });
    }
  });

  socket.on('input', (payload = {}) => {
    if (!roomId || !side) return;
    const room = rooms.get(roomId);

    // Support either absolute paddleY (0..1) OR discrete directional inputs
    if (typeof payload.dir === 'string') {
      const step = Number.isFinite(payload.step) ? Number(payload.step) : 0.04; // default step per input
      const d = payload.dir.toLowerCase();
      let dy = 0;
      if (d === 'up') dy = -step;
      else if (d === 'down') dy = step;
      // left/right reserved for future horizontal games; ignored for Pong
      const yNew = Math.max(0, Math.min(1, room.paddles[side] + dy));
      room.paddles[side] = yNew;
      socket.to(roomId).emit('input', { side, paddleY: yNew, dir: d });
      return;
    }

    const y = Number(payload.paddleY);
    if (!Number.isFinite(y)) return;
    room.paddles[side] = Math.max(0, Math.min(1, y));
    // Relay to others (so client can animate immediately)
    socket.to(roomId).emit('input', { side, paddleY: room.paddles[side] });
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
  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      console.log(`realtime server listening on :${addr && addr.port}`);
      resolve(addr && addr.port);
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, io, server, start, stop };
