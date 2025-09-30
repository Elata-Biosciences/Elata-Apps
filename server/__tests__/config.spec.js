/* eslint-env jest */
const http = require('http');
const { start, stop, __constants } = require('../server');

jest.setTimeout(20000);

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

describe('/game/config endpoint', () => {
  let port; let base;
  beforeAll(async () => { port = await start(0); base = `http://localhost:${port}`; });
  afterAll(async () => { await stop(); });

  test('returns gameplay constants matching server exports', async () => {
    const cfg = await getJson(base + '/game/config');
    expect(cfg).toEqual(expect.objectContaining({
      TICK_RATE: __constants.TICK_RATE,
      PADDLE_SPEED: __constants.PADDLE_SPEED,
      PADDLE_HEIGHT: __constants.PADDLE_HEIGHT,
      PADDLE_WIDTH: expect.any(Number),
      BALL_RADIUS: expect.any(Number),
      INPUTS_PER_SEC: __constants.INPUTS_PER_SEC,
      INPUT_BURST: __constants.INPUT_BURST,
      MAX_INPUT_QUEUE: __constants.MAX_INPUT_QUEUE,
      DEFAULT_MAX_PLAYERS: 2,
    }));
  });
});

