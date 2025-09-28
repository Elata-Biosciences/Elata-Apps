/* eslint-env jest */
const { start, stop, __constants } = require('../server');
const { io } = require('socket.io-client');

jest.setTimeout(20000);

function connectNS(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

describe('input rate limiting and clamping', () => {
  let port; let base;
  beforeAll(async () => { port = await start(0); base = `http://localhost:${port}`; });
  afterAll(async () => { await stop(); });

  test('drops excessive inputs over token bucket limit', async () => {
    const a = await connectNS(base + '/game');
    const roomId = 'rl1';
    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    const mySide = ackA.side;

    // Capture state updates
    let lastState = null;
    a.on('state', (s) => { lastState = s; });

    // Flood with many inputs quickly
    let sentSeq = 0;
    for (let i = 0; i < 100; i++) {
      a.emit('input', { action: 'move', direction: 'down', seq: ++sentSeq });
    }

    // Wait a short time to allow processing
    await new Promise(r => setTimeout(r, 600));

    expect(lastState).toBeTruthy();
    const lastSeq = lastState && lastState.lastSeq && lastState.lastSeq[mySide];
    expect(typeof lastSeq).toBe('number');

    // With INPUT_BURST + about INPUTS_PER_SEC * 0.6 seconds, expected upper bound:
    const upperBound = __constants.INPUT_BURST + Math.ceil(__constants.INPUTS_PER_SEC * 0.6) + 2; // padding
    expect(lastSeq).toBeLessThanOrEqual(upperBound);
    expect(lastSeq).toBeLessThan(sentSeq); // not all accepted

    a.disconnect();
  });

  test('clamps absolute paddleY to [0..1]', async () => {
    const a = await connectNS(base + '/game');
    const roomId = 'rl2';
    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    const mySide = ackA.side;

    let got;
    await new Promise((resolve) => {
      a.once('state', (s) => { got = s; resolve(); });
      // Send an out-of-range absolute position
      a.emit('input', { paddleY: 2 });
    });

    expect(got).toBeTruthy();
    const y = mySide === 'left' ? got.paddles.left : got.paddles.right;
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(1);

    a.disconnect();
  });
});

