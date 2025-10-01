import { playSound } from './audio.js';

const PADDLE_WIDTH = 100;  // Now horizontal width
const PADDLE_HEIGHT = 15;  // Now horizontal height
const BALL_RADIUS = 10;
const WINNING_SCORE = 100;
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
let player = {
    x: 0,
    y: 0,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: PADDLE_COLOR_SELF,
    score: 0
};

let opponent = {
    x: 0,
    y: 0,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: PADDLE_COLOR_OPP,
    score: 0
};

let ball = {
    x: 0,
    y: 0,
    radius: BALL_RADIUS,
    speed: 7,
    velocityX: 5,
    velocityY: 5,
    color: BALL_COLOR
};

let canvas, ctx;

function initGame(canvasElement, context) {
    canvas = canvasElement;
    ctx = context;
    // Position paddles horizontally - player at bottom, computer at top
    player.y = canvas.height - (PADDLE_HEIGHT * 2);
    player.x = canvas.width / 2 - PADDLE_WIDTH / 2;
    opponent.y = PADDLE_HEIGHT;
    opponent.x = canvas.width / 2 - PADDLE_WIDTH / 2;
    resetBall();
}

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speed = 7;
    // Ball now moves vertically - X velocity is random, Y velocity determines direction
    ball.velocityX = (Math.random() > 0.5 ? 1 : -1) * 5;
    ball.velocityY = (Math.random() > 0.5 ? 1 : -1) * 5;
}

function updateGameState(useAI) {
    if (useAI) {
        // AI paddle movement - now horizontal movement following ball X position
        let targetX = ball.x - opponent.width / 2;
        opponent.x += (targetX - opponent.x) * 0.1;
        // Keep computer paddle within bounds
        opponent.x = Math.max(0, Math.min(canvas.width - opponent.width, opponent.x));
    }

    // Ball movement
    ball.x += ball.velocityX * speedMultiplier;
    ball.y += ball.velocityY * speedMultiplier;

    // Ball collision with left/right walls (now bounces horizontally)
    if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
        ball.velocityX = -ball.velocityX;
        playSound('wallBounce');

        // Add jitter to prevent horizontal loops
        if (Math.abs(ball.velocityY) < 0.5) {
            ball.velocityY += (Math.random() - 0.5) * 2; // Add a random vertical push
        }
    }

    // Ball collision with paddles (now top/bottom paddles)
    let currentPaddle = (ball.y < canvas.height / 2) ? opponent : player;
    if (collision(ball, currentPaddle)) {
        playSound('paddleHit');
        let collidePoint = (ball.x - (currentPaddle.x + currentPaddle.width / 2));
        collidePoint = collidePoint / (currentPaddle.width / 2);
        let angleRad = (Math.PI / 4) * collidePoint;
        let direction = (ball.y < canvas.height / 2) ? 1 : -1;
        ball.velocityY = direction * ball.speed * Math.cos(angleRad);
        ball.velocityX = ball.speed * Math.sin(angleRad);
        ball.speed += SPEED_INCREMENT;
        if (ball.speed > 7 * MAX_SPEED_MULTIPLIER) {
            ball.speed = 7 * MAX_SPEED_MULTIPLIER;
        }
    }

    // Scoring (now when ball exits top/bottom)
    if (ball.y - ball.radius < 0) {
        player.score++;  // Player scores when ball exits top
        playSound('playerScore');
        resetBall();
    } else if (ball.y + ball.radius > canvas.height) {
        opponent.score++; // Computer scores when ball exits bottom
        playSound('computerScore');
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

function draw() {
    // Clear canvas with a semi-transparent black for motion blur effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawNet();

    // Draw paddles with glow
    drawRect(player.x, player.y, player.width, player.height, PADDLE_COLOR);
    drawRect(opponent.x, opponent.y, opponent.width, opponent.height, PADDLE_COLOR);

    // Draw ball with glow
    drawCircle(ball.x, ball.y, ball.radius, BALL_COLOR);
}

function drawNet() {
    // Draw horizontal net across the middle
    for (let i = 0; i < canvas.width; i += 30) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(i, canvas.height / 2 - 1, 15, 2);
    }
}

function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
}

function drawCircle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
}

function setSpeedMultiplier(multiplier) {
    speedMultiplier = multiplier;
}

export {
    initGame,
    resetBall,
    updateGameState,
    draw,
    setSpeedMultiplier,
    player,
    opponent,
    ball,
    WINNING_SCORE
};
