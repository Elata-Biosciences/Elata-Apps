/* eslint-env jest */
const { start, stop } = require('../server');
const { io } = require('socket.io-client');

jest.setTimeout(20000);

function connectNS(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

describe('/game namespace', () => {
  let port; let base;

  beforeAll(async () => {
    port = await start(0);
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await stop();
  });

  test('two players can join a room and get distinct sides', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');

    const ackA = await new Promise((resolve) => a.emit('join', { roomId: 'room1', name: 'A' }, resolve));
    expect(ackA).toEqual(expect.objectContaining({ ok: true, playerId: expect.any(String) }));

    const ackB = await new Promise((resolve) => b.emit('join', { roomId: 'room1', name: 'B' }, resolve));
    expect(ackB).toEqual(expect.objectContaining({ ok: true, playerId: expect.any(String) }));

    expect(ackA.side).not.toBeNull();
    expect(ackB.side).not.toBeNull();
    expect(ackA.side).not.toEqual(ackB.side);

    a.disconnect();
    b.disconnect();
  });

  test('input from one player is relayed to the other', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const roomId = 'room2';

    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    const got = new Promise((resolve) => b.once('input', resolve));
    a.emit('input', { roomId, paddleY: 0.8 });
    const relayed = await got;
    expect(relayed).toEqual(expect.objectContaining({ side: ackA.side, paddleY: 0.8 }));

    a.disconnect();
    b.disconnect();
  });

  test('server broadcasts state periodically', async () => {
    const a = await connectNS(base + '/game');
    const roomId = 'room3';

    await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));

    const state = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no state received')), 2000);
      a.once('state', (s) => { clearTimeout(timer); resolve(s); });
    });

    expect(state).toEqual(expect.objectContaining({
      paddles: expect.any(Object),
      ball: expect.any(Object),
      scores: expect.any(Object),
      t: expect.any(Number),
    }));

    a.disconnect();
  });
});

