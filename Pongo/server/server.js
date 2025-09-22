'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (req, res) => res.send('ok'));

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

// EEG namespace for realtime EEG ingestion and broadcast
const eeg = io.of('/eeg');

eeg.on('connection', (socket) => {
  console.log('[eeg] connected', socket.id);

  // per-connection session/metadata
  let sessionId = null; // room key to group producer + observers
  let meta = null;      // {channels, srate, units, deviceId}

  // Producer/Client sends metadata first
  // payload example: { sessionId?: string, channels: ["Fp1","Fp2",...], srate: 250, units: "uV", deviceId: "muse-2" }
  socket.on('hello', (info = {}, ack) => {
    try {
      const channels = Array.isArray(info.channels) ? info.channels.map(String) : [];
      const srate = Number.isFinite(info.srate) ? Number(info.srate) : undefined;
      const units = info.units ? String(info.units) : undefined;
      const deviceId = info.deviceId ? String(info.deviceId) : undefined;
      sessionId = info.sessionId ? String(info.sessionId) : socket.id; // default unique session

      if (!channels.length || !srate) {
        const err = 'invalid hello: requires channels[] and srate';
        ack && ack({ ok: false, error: err });
        return;
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

  // JSON sample packet: { t: ms_epoch | relative_ms, samples: number[] | number[][] }
  // - If flat array, order is channel-major per sample chunk
  // - Optionally add seq number to detect drops: { seq: n }
  socket.on('eeg:sample', (packet = {}) => {
    if (!sessionId) return; // ignore until hello
    const t = Number(packet.t ?? Date.now());
    const samples = packet.samples;
    if (!samples || (typeof samples !== 'object')) return;

    // lightweight size guard
    const count = Array.isArray(samples) ? samples.length : 0;
    if (count === 0 || count > 1e6) return; // drop absurd payloads

    // rebroadcast to observers in the same session
    eeg.to(sessionId).emit('eeg:sample', { t, samples, seq: packet.seq });
  });

  // Binary chunk for efficiency: Float32Array (channels x N) or Int16Array, etc.
  // The server does not mutate the buffer; it relays to observers in the session.
  socket.on('eeg:chunk', (buf) => {
    if (!sessionId) return;
    const byteLength = (buf && (buf.byteLength || buf.length)) || 0;
    if (!byteLength || byteLength > 2 * 1024 * 1024) return; // 2MB guard
    eeg.to(sessionId).emit('eeg:chunk', buf);
  });

  // Observers can join a session to receive streams
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

