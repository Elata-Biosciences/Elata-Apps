# Server Input Usage (Quick Guide)

This guide shows how to connect to the `/game` namespace and control a paddle using either absolute positions or keyboard-friendly directional inputs. See also: `docs/pong-input-standard.md`.

## Connect and join a room

Browser (CDN):
```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
  const BASE = 'http://localhost:3000'; // or your Render URL
  const ROOM = 'arena-1';
  const game = io(BASE + '/game', { transports: ['websocket'] });
  game.on('connect', () => {
    game.emit('join', { roomId: ROOM, name: 'Player' }, (ack) => console.log('joined:', ack));
  });
</script>
```

Node:
```js
const { io } = require('socket.io-client');
const BASE = 'http://localhost:3000';
const game = io(BASE + '/game', { transports: ['websocket'] });
game.on('connect', () => game.emit('join', { roomId: 'arena-1', name: 'Bot' }, console.log));
```

## Send input

Two message shapes are supported. Use what fits your input device.

1) Absolute position (normalized)
```js
// 0 = left, 1 = right
const x = 0.85;
game.emit('input', { roomId: 'arena-1', paddleX: x });
```

2) Directional step (keyboard/controller)
```js
// Left/right movement by step amount (default step is 0.04 if omitted)
game.emit('input', { roomId: 'arena-1', dir: 'left', step: 0.05 });
game.emit('input', { roomId: 'arena-1', dir: 'right' });
```

## Observe state and peer input

```js
game.on('state', (s) => {
  // s.paddles.top/bottom in [0,1]
  // s.ball.x/y in [0,1]
});

game.on('input', (msg) => {
  // peer input relay: { side, paddleX, dir? }
});
```

## Demo keyboard hook (browser)

```js
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') game.emit('input', { roomId: 'arena-1', dir: 'left' });
  if (e.key === 'ArrowRight' || e.key === 'd') game.emit('input', { roomId: 'arena-1', dir: 'right' });
});
```

## Test the behavior

A Jest test `Pongo/server/__tests__/input_control.spec.js` connects clients, sends both absolute and directional inputs, and asserts the authoritative server `state` reflects paddle movement accordingly. Run:

```bash
cd Pongo/server
npm test
```

