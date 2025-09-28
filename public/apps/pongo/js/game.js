// Pongo/js/game.js

// Game constants
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 100;
const BALL_RADIUS = 10;
const WINNING_SCORE = 5;
const PADDLE_COLOR = '#00ffff';
const BALL_COLOR = '#ffffff';
const PADDLE_COLOR_SELF = '#ff00ff';
const PADDLE_COLOR_OPP = PADDLE_COLOR;

// Tuning: how fast the ball accelerates after each paddle hit and max speed cap
const SPEED_INCREMENT = 1.08;
const MAX_SPEED_MULTIPLIER = 1.35;

// Speed multiplier controlled by UI slider (1.0 = default)
let speedMultiplier = 1.0;

// Game objects
export let player = {
    x: 0,
    y: 0,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: PADDLE_COLOR_SELF,
    score: 0
};

export let computer = {
    x: 0,
    y: 0,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: PADDLE_COLOR_OPP,
    score: 0
};

export let ball = {
    x: 0,
    y: 0,
    radius: BALL_RADIUS,
    speed: 7,
    velocityX: 5,
    velocityY: 5,
    color: BALL_COLOR
};

let canvas, ctx;

export function initGame(canvasElement, context) {
    canvas = canvasElement;
    ctx = context;
    player.x = PADDLE_WIDTH;
    computer.x = canvas.width - (PADDLE_WIDTH * 2);
    resetBall();
}

export function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speed = 7;
    ball.velocityX = (Math.random() > 0.5 ? 1 : -1) * 5;
    ball.velocityY = (Math.random() > 0.5 ? 1 : -1) * 5;
}

export function updateGame(useAI) {
    if (useAI) {
        // AI paddle movement
        let targetY = ball.y - computer.height / 2;
        computer.y += (targetY - computer.y) * 0.1;
    }

    // Ball movement
    ball.x += ball.velocityX * speedMultiplier;
    ball.y += ball.velocityY * speedMultiplier;

    // Ball collision with top/bottom walls
    if (ball.y + ball.radius > canvas.height || ball.y - ball.radius < 0) {
        ball.velocityY = -ball.velocityY;
    }

    // Ball collision with paddles
    let paddle = (ball.x < canvas.width / 2) ? player : computer;
    if (collision(ball, paddle)) {
        let collidePoint = (ball.y - (paddle.y + paddle.height / 2));
        collidePoint = collidePoint / (paddle.height / 2);
        let angleRad = (Math.PI / 4) * collidePoint;
        let direction = (ball.x < canvas.width / 2) ? 1 : -1;
        ball.velocityX = direction * ball.speed * Math.cos(angleRad);
        ball.velocityY = ball.speed * Math.sin(angleRad);
        ball.speed += SPEED_INCREMENT;
        if (ball.speed > 7 * MAX_SPEED_MULTIPLIER) {
            ball.speed = 7 * MAX_SPEED_MULTIPLIER;
        }
    }

    // Scoring
    if (ball.x - ball.radius < 0) {
        computer.score++;
        resetBall();
    } else if (ball.x + ball.radius > canvas.width) {
        player.score++;
        resetBall();
    }
}

function collision(b, p) {
    p.top = p.y;
    p.bottom = p.y + p.height;
    p.left = p.x;
    p.right = p.x + p.width;

    b.top = b.y - b.radius;
    b.bottom = b.y + b.radius;
    b.left = b.x - b.radius;
    b.right = b.x + b.radius;

    return p.left < b.right && p.top < b.bottom && p.right > b.left && p.bottom > b.top;
}

export function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRect(player.x, player.y, player.width, player.height, player.color);
    drawRect(computer.x, computer.y, computer.width, computer.height, computer.color);
    drawCircle(ball.x, ball.y, ball.radius, ball.color);
}

function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function drawCircle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
}

export function setSpeedMultiplier(multiplier) {
    speedMultiplier = multiplier;
}
