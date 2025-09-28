/* eslint-env jest */

// Ensure assist is enabled and deterministic for this test
process.env.ASSIST_ENABLED = '1';
process.env.ASSIST_PROB = '1';

const { io } = require('socket.io-client');

jest.setTimeout(20000);

function connectNS(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

describe('assist rescue on near-miss', () => {
  let start, stop; let port; let base;

  beforeAll(async () => {
    ({ start, stop } = require('../server'));
    port = await start(0);
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await stop();
  });

  test('rescues left side miss (reflects ball to the right instead of scoring)', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const roomId = 'assist-left-1';
    await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    // Put game into playing and force a left miss
    await new Promise((resolve) => a.emit('test:set', { roundState: 'playing', ball: { x: -0.02, y: 0.5, vx: -0.3, vy: 0 } }, resolve));

    const state = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('no state after assist')), 2000);
      a.once('state', (s) => { clearTimeout(to); resolve(s); });
    });

    // Expect ball going right after rescue; no immediate score increment to right
    expect(state.ball.vx).toBeGreaterThan(0);
  
    a.disconnect();
    b.disconnect();
  });

  test('rescues right side miss (reflects ball to the left instead of scoring)', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const roomId = 'assist-right-1';
    await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    // Put game into playing and force a right miss
    await new Promise((resolve) => a.emit('test:set', { roundState: 'playing', ball: { x: 1.02, y: 0.5, vx: 0.3, vy: 0 } }, resolve));

    const state = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('no state after assist')), 2000);
      a.once('state', (s) => { clearTimeout(to); resolve(s); });
    });

    // Expect ball going left after rescue
    expect(state.ball.vx).toBeLessThan(0);

    a.disconnect();
    b.disconnect();
  });
});

