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

function waitForEvent(sock, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    sock.once(event, (msg) => { clearTimeout(timer); resolve(msg); });
  });
}

describe('EEG -> relay -> browser-listener -> game pipeline', () => {
  let port; let base;

  beforeAll(async () => {
    port = await start(0);
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await stop();
  });

  test('EEG command drives Player 1 paddle via relay listener', async () => {
    const roomId = 'eeg-pipeline-1';

    // Browser: game client joins /game as Player 1
    const gameClient = await connectNS(base + '/game');
    const ackGame = await new Promise((resolve) => gameClient.emit('join', { roomId, name: 'browser' }, resolve));
    expect(ackGame && ackGame.ok).toBe(true);

    // Browser: relay listener joins /relay to receive EEG inputs, then forwards to /game
    const relayListener = await connectNS(base + '/relay');
    const ackRelay = await new Promise((resolve) => relayListener.emit('join', { roomId, name: 'browser-relay' }, resolve));
    expect(ackRelay && ackRelay.ok).toBe(true);

    // Map EEG commands to absolute paddleX positions for the server (0..1)
    const mapCommandToX = (cmd) => {
      if (cmd === 'left') return 0.2;
      if (cmd === 'right') return 0.8;
      return 0.5; // neutral
    };

    // Relay listener forwards EEG input to server-authoritative game as absolute paddleX
    relayListener.on('input', (msg = {}) => {
      const c = typeof msg.command === 'string' ? msg.command.toLowerCase() : 'neutral';
      const x = Number.isFinite(msg.paddleX) ? msg.paddleX : mapCommandToX(c);
      gameClient.emit('input', { paddleX: x });
    });

    // EEG emitter joins /relay
    const eeg = await connectNS(base + '/relay');
    const ackEEG = await new Promise((resolve) => eeg.emit('join', { roomId, name: 'eeg' }, resolve));
    expect(ackEEG && ackEEG.ok).toBe(true);

    // 1) Send LEFT -> expect paddle goes near 0.2
    eeg.emit('input', { command: 'left' });
    const s1 = await waitForEvent(gameClient, 'state', 2000);
    expect(typeof s1).toBe('object');
    expect(s1 && s1.paddles && typeof s1.paddles.left === 'number').toBe(true);
    expect(s1.paddles.left).toBeLessThan(0.35);

    // 2) Send RIGHT -> expect paddle goes near 0.8
    eeg.emit('input', { command: 'right' });
    const s2 = await waitForEvent(gameClient, 'state', 2000);
    expect(typeof s2).toBe('object');
    expect(s2 && s2.paddles && typeof s2.paddles.left === 'number').toBe(true);
    expect(s2.paddles.left).toBeGreaterThan(0.65);

    // Cleanup
    eeg.disconnect();
    relayListener.disconnect();
    gameClient.disconnect();
  });
});

