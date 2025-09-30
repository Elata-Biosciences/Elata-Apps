# Multiplayer Pong Server – Client Integration Guide

This document explains how to connect a client (browser or Node) to the multiplayer Pong server powered by Socket.IO.

Server features:
- Socket.IO namespace: `/game`
- Room-based play: 2 players per room (left/right), extra connections become spectators
- Server-authoritative physics loop (30 Hz) broadcasting `state`
- Input relay so peers can animate instantly

Default deployment URLs:
- Local: `http://localhost:3000`
- Render: `https://pongo-multiplayer-server.onrender.com`

Health check: `GET /health` returns `ok`.

---

## 1) Connect to the game namespace

Browser (via CDN):

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
  const BASE = 'https://pongo-multiplayer-server.onrender.com'; // or http://localhost:3000
  const game = io(BASE + '/game', { transports: ['websocket'] });
  game.on('connect', () => console.log('connected as', game.id));
  game.on('connect_error', (e) => console.error('connect_error', e));
</script>
```

Node (CommonJS):

```js
const { io } = require('socket.io-client');
const BASE = process.env.BASE || 'http://localhost:3000';
const game = io(BASE + '/game', { transports: ['websocket'] });
```

---

## 2) Join a room

Clients should immediately `join` a room. The first two joiners get `side: "left" | "right"`; others join as spectators.

Client → Server:
- `join` payload: `{ roomId: string, name?: string }`
- ack: `{ ok: boolean, playerId: string, side: 'left'|'right'|null, role: 'player'|'spectator' }`

Example:

```js
game.emit('join', { roomId: 'arena-1', name: 'Alice' }, (ack) => {
  if (!ack?.ok) return console.error('join failed', ack);
  console.log('joined', ack);
});
```

Server also emits:
- `player:join` → `{ playerId, side, name }`
- `player:leave` → `{ playerId, side }`

---

## 3) Send inputs (players only)

Send normalized paddle position in `[0, 1]` where `0` is left and `1` is right.

Client → Server:
- `input` payload: `{ roomId: string, paddleX: number }`

Example (browser):

```js
window.addEventListener('mousemove', (e) => {
  const x = e.clientX / window.innerWidth; // 0..1
  game.emit('input', { roomId: 'arena-1', paddleX: x });
});
```

Server → Client (relay so peers update instantly):
- `input` → `{ side: 'top'|'bottom', paddleX: number }`

---

---

## 3b) Directional inputs (keyboard-friendly)

You can also send discrete directional inputs instead of an absolute position. The server will step the paddle by a small amount per input.

Client → Server:
- `input` payload: `{ roomId: string, dir: 'up'|'down'|'left'|'right', step?: number }`
  - `step` is optional; defaults to `0.04` (in normalized units)

Example (keyboard in browser):

```js
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w') {
    game.emit('input', { roomId: ROOM, dir: 'up' });
  } else if (e.key === 'ArrowDown' || e.key === 's') {
    game.emit('input', { roomId: ROOM, dir: 'down' });
  }
});
```

Server → Client (relay):
- `input` → `{ side: 'left'|'right', paddleY: number, dir?: string }`


## 4) Receive server state

The server runs a 30 Hz physics loop and broadcasts `state` to everyone in the room.

Server → Client:
- `state`: `{ t: number, paddles: {left:number, right:number}, ball: {x:number, y:number, vx:number, vy:number}, scores: {left:number, right:number} }`

Example:

```js
game.on('state', (s) => {
  // render paddles using s.paddles.left/right ∈ [0,1]
  // render ball using s.ball.x/y ∈ [0,1]
  // use s.scores.left/right for scoreboard
});
```

Coordinate system: all positions are normalized to `[0,1]` in both axes.

---

## 5) Minimal canvas demo (browser)

```html
<canvas id="pong" width="640" height="360"></canvas>
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
  const BASE = 'http://localhost:3000';
  const ROOM = 'arena-1';
  const ctx = document.getElementById('pong').getContext('2d');
  const game = io(BASE + '/game', { transports: ['websocket'] });
  let state = null;
  game.on('connect', () => game.emit('join', { roomId: ROOM, name: 'Player' }, (ack)=>console.log(ack)));
  game.on('state', (s) => { state = s; });
  window.addEventListener('mousemove', (e) => game.emit('input', { roomId: ROOM, paddleY: e.clientY / innerHeight }));
  function draw(){
    ctx.clearRect(0,0,640,360);
    if(!state) return requestAnimationFrame(draw);
    // paddles
    const padH = 0.2, padW = 8;
    ctx.fillStyle = '#fff';
    // left
    ctx.fillRect(20, (state.paddles.left - padH/2)*360, padW, padH*360);
    // right
    ctx.fillRect(640-20-padW, (state.paddles.right - padH/2)*360, padW, padH*360);
    // ball
    ctx.beginPath();
    ctx.arc(state.ball.x*640, state.ball.y*360, 6, 0, Math.PI*2);
    ctx.fill();
    requestAnimationFrame(draw);
  }
  draw();
</script>
```

---

## 6) Spectators

Anyone who joins a room after two players will be a spectator (`role: 'spectator'`, `side: null`). Spectators receive all `state` updates and `input` relays and can render the match.

---

## 7) Local vs Render

- Local
  - Start server: `cd Pongo/server && npm start`
  - Connect to `http://localhost:3000/game`
- Render (deployed)
  - Use your Render URL: `https://pongo-multiplayer-server.onrender.com/game`

CORS: The server allows `*` by default via `CORS_ORIGIN`. If you need to lock it down, set `CORS_ORIGIN` to your site origin and serve your client from that origin.

---

## 8) Events summary

Client → Server
- `join`: `{ roomId, name? }` → ack `{ ok, playerId, side|null, role }`
- `input` (absolute): `{ roomId, paddleY }`
- `input` (directional): `{ roomId, dir: 'up'|'down'|'left'|'right', step?: number }`

Server → Client
- `state`: authoritative game state (30 Hz)
- `input`: relayed peer input `{ side, paddleY, dir? }`
- `player:join`: `{ playerId, side, name }`
- `player:leave`: `{ playerId, side }`

---

## 9) EEG control (optional)

If you want to drive a paddle using EEG data, see `elata-eeg/scripts/README.md` for the bridge that forwards EEG to the Render server. You can map EEG-derived values to `paddleY` and emit `input` the same way as a mouse.

