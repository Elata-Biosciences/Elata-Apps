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

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // simple echo for sanity
  socket.on('ping', (msg) => socket.emit('pong', msg));

  socket.on('disconnect', (reason) => {
    console.log('socket disconnected', socket.id, reason);
  });
});

server.listen(PORT, () => {
  console.log(`realtime server listening on :${PORT}`);
});

