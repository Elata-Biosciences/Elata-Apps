// Pongo/js/main.js

import { initUI, updateScores, showMessage, showToast, hideStartOverlay, hideMessage, updateCountdown, hideCountdown, updateGameTimer } from './ui.js';
import { initGame, updateGameState, draw, player, opponent, ball, resetBall, WINNING_SCORE, setPlayerTargetX } from './game.js';
import { initAudio, playSound, toggleMute } from './audio.js';

const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

let useMultiplayer = false;
let gameRunning = false;
let eegControlActive = false; // New state variable
let animationFrameId;
let gameTimerId;
let gameTimeRemaining = 300; // 5 minutes in seconds

function getRoomId() {
    // Prioritize URL query parameter for room selection
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        return roomFromUrl;
    }

    try {
        const parts = (location.pathname || '/').split('/').filter(Boolean);
        return parts[1] || 'default';
    } catch {
        return 'default';
    }
}

function init() {
    console.log('[main] init() called');

    // Fixed internal resolution - CSS will scale it
    canvas.width = 800;
    canvas.height = 600;

    const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);

    initGame(canvas, ctx);
    initUI(restartGame, startGame);
    // Don't init audio here - wait for user gesture in startGame()
    initMultiplayer(isLocalDev);

    // Mouse movement for player paddle (now horizontal)
    canvas.addEventListener('mousemove', (evt) => {
        // Only allow mouse control if EEG is not active
        if (!eegControlActive && !useMultiplayer) {
            let rect = canvas.getBoundingClientRect();
            const centerPx = evt.clientX - rect.left;
            const leftPx = Math.max(0, Math.min(canvas.width - player.width, centerPx - player.width / 2));
            setPlayerTargetX(leftPx); // Use the new function to set target
        }
    });

    // EEG relay socket: listen for external inputs on /relay namespace and apply to Player 1
    let relaySock;
    try {
        relaySock = io('/relay');
        relaySock.on('connect', () => {
            const room = getRoomId();
            try { relaySock.emit('join', { roomId: room, name: 'EEG Relay' }, (ack)=>{
                console.log('[EEG][client] relay join ack', ack);
            }); } catch (e) { console.warn('[EEG][client] relay join error', e); }
        });
        relaySock.on('input', (msg = {}) => {
            console.log('[EEG][client] relay input', msg);
            // On first valid input, activate EEG control and notify user
            if (!eegControlActive) {
                eegControlActive = true;
                showToast("EEG Control Active");
            }

            // Support normalized center position: paddleX in [0,1]
            let xNorm = null;
            if (typeof msg.paddleX === 'number') xNorm = msg.paddleX;
            if (typeof msg.command === 'string') {
                const c = msg.command.toLowerCase();
                if (c === 'left') xNorm = 0.2;
                else if (c === 'right') xNorm = 0.8;
                else if (c === 'neutral' || c === 'center' || c === 'centre') xNorm = 0.5;
            }
            if (xNorm !== null && Number.isFinite(xNorm)) {
                const clamped = Math.max(0, Math.min(1, Number(xNorm)));
                const centerPx = clamped * canvas.width;
                const leftPx = Math.max(0, Math.min(canvas.width - player.width, centerPx - player.width / 2));
                setPlayerTargetX(leftPx); // Use the new function to set target
                try { relaySock.emit('client:log', { event: 'eeg_input_applied', data: { xNorm: clamped, leftPx } }); } catch {}
            } else {
                console.warn('[EEG][client] invalid input payload, missing command/paddleX');
                try { relaySock.emit('client:log', { event: 'eeg_input_invalid', data: { msg } }); } catch {}
            }
        });

        // Global error logging to server logs via relay namespace
        window.addEventListener('error', (e) => {
            try { relaySock.emit('client:log', { event: 'window_error', data: { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno } }); } catch {}
        });
        window.addEventListener('unhandledrejection', (e) => {
            try { relaySock.emit('client:log', { event: 'unhandledrejection', data: { reason: String(e.reason) } }); } catch {}
        });
    } catch (e) {
        console.warn('[EEG][client] relay setup failed', e);
    }

    // Check if start overlay exists
    const startOverlay = document.getElementById('startOverlay');
    const startButton = document.getElementById('startButton');
    console.log('[main] Start overlay exists:', !!startOverlay, 'visible:', startOverlay ? !startOverlay.classList.contains('hidden') : false);
    console.log('[main] Start button exists:', !!startButton);
    console.log('[main] gameRunning:', gameRunning);

    gameLoop();
}

function gameLoop() {
    if (!gameRunning) {
        // console.log('[main] gameLoop() called, but game is not running.');
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    updateGameState(!useMultiplayer);
    draw();

    if (player.score >= WINNING_SCORE) {
        endGame(`You win! Final Score: ${player.score} - ${opponent.score}`);
    } else if (opponent.score >= WINNING_SCORE) {
        endGame(`Computer wins! Final Score: ${opponent.score} - ${player.score}`);
    }

    if (gameRunning) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

function initMultiplayer(isLocal) {
    const sock = io('/game');
    const roomId = getRoomId(); // Use the consistent room ID function

    sock.on('connect', () => {
        console.log(`[multiplayer] Connected to /game with id ${sock.id}`);
        sock.emit('join', { roomId, name: 'Player' });
    });

    sock.on('assign', (msg) => {
        if (msg.p1) {
            useMultiplayer = true;
            player.isP1 = true;
            console.log('[multiplayer] Assigned as P1');
        }
        if (msg.p2) {
            useMultiplayer = true;
            opponent.isP2 = true;
            console.log('[multiplayer] Assigned as P2');
        }
    });

    sock.on('state', (msg) => {
        if (!useMultiplayer) return;

        // Update game state from server
        ball.x = msg.ball.x;
        ball.y = msg.ball.y;

        if (player.isP1) {
            // We are P1, server is sending P2's state
            opponent.y = msg.p2.y;
            opponent.score = msg.p2.score;
            player.score = msg.p1.score;
        } else if (opponent.isP2) {
            // We are P2, server is sending P1's state
            player.y = msg.p1.y;
            player.score = msg.p2.score;
            opponent.score = msg.p1.score;
        }
        updateScores(player.score, opponent.score);
    });

    // Send our paddle position to the server
    setInterval(() => {
        if (useMultiplayer) {
            // For horizontal pong, we send x, not y
            sock.emit('input', { x: player.x });
        }
    }, 1000 / 60); // 60 times a second
}


async function startGame() {
    console.log('[main] startGame() called');
    hideMessage();
    hideStartOverlay();

    // Initialize audio on the first user gesture
    initAudio().then(success => {
        console.log('[main] Audio initialized:', success);
        if (success) {
            // Start countdown after audio is ready
            startCountdown(3);
        } else {
            // If audio fails, still start countdown
            startCountdown(3);
        }
    });
}

function startCountdown(seconds) {
    let count = seconds;
    const countdownInterval = setInterval(() => {
        updateCountdown(count);
        playSound('countdown');
        count--;
        if (count < 0) {
            clearInterval(countdownInterval);
            hideCountdown();
            actuallyStartGame();
        }
    }, 1000);
}

function actuallyStartGame() {
    player.score = 0;
    opponent.score = 0;
    updateScores(player.score, opponent.score);
    resetBall();
    gameRunning = true;
    gameTimeRemaining = 300;
    updateTimerDisplay();
    startTimer();
    // The gameLoop is already running via requestAnimationFrame,
    // it will pick up the gameRunning = true state.
}

function startTimer() {
    if (gameTimerId) clearInterval(gameTimerId);
    gameTimerId = setInterval(() => {
        gameTimeRemaining--;
        updateTimerDisplay();
        if (gameTimeRemaining <= 0) {
            endGame("Time's up!");
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(gameTimeRemaining / 60);
    const seconds = gameTimeRemaining % 60;
    updateGameTimer(minutes, seconds);
}

function endGame(message) {
    gameRunning = false;
    if (gameTimerId) clearInterval(gameTimerId);
    showMessage(message);
}

function restartGame() {
    console.log('[main] restartGame() called');
    endGame(); // Clear timers and stop loop
    hideMessage();
    player.score = 0;
    opponent.score = 0;
    updateScores(player.score, opponent.score);
    resetBall();
    startCountdown(3);
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        init();
    } catch (e) {
        console.error('[main] init error', e);
    }
});
