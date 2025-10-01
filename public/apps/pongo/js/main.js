// Pongo/js/main.js

import { initGame, updateGame, draw, player, computer, resetBall, ball, WINNING_SCORE } from './game.js';
import { initUI, updateScores, showMessage, hideMessage, hideStartOverlay, updateMuteButton, showToast } from './ui.js';
import { initAudio, playSound, toggleMute } from './audio.js';
import { initMultiplayer, setupSocket, stepMultiplayer, requestRestart } from './multiplayer.js';

const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

let useMultiplayer = false;
let gameRunning = false;
let animationFrameId;

function getRoomId() {
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
        if (!useMultiplayer) {
            let rect = canvas.getBoundingClientRect();
            player.x = evt.clientX - rect.left - player.width / 2;
            // Keep player paddle within bounds
            player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
        }
    });

    // EEG relay socket: listen for external inputs on /relay namespace.
    // In single-player: apply directly to Player 1 paddle.
    // In multiplayer: set a global override so rendering uses EEG position client-side (not server physics).
    try {
        const relaySock = io('/relay');
        relaySock.on('connect', () => {
            const room = getRoomId();
            console.log('[EEG][client] relay connected, joining room', room);
            try { relaySock.emit('join', { roomId: room, name: 'EEG Relay' }, (ack)=>{
                console.log('[EEG][client] relay join ack', ack);
                try { relaySock.emit('client:log', { event: 'relay_join', data: { room, ack } }); } catch {}
            }); } catch (e) {
                console.warn('[EEG][client] relay join error', e);
                try { relaySock.emit('client:log', { event: 'relay_join_error', data: { room, error: String(e && e.message || e) } }); } catch {}
            }
        });
        relaySock.on('input', (msg = {}) => {
            console.log('[EEG][client] relay input', msg);
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
                // Expose global normalized center for multiplayer override
                try { window.__EEG_X_NORM = clamped; window.__EEG_X_AT = performance.now(); } catch {}
                // Apply directly only in single-player mode
                if (!useMultiplayer) {
                    const centerPx = clamped * canvas.width;
                    const leftPx = Math.max(0, Math.min(canvas.width - player.width, centerPx - player.width / 2));
                    player.x = leftPx;
                    console.log('[EEG][client] applied to single-player paddle', { xNorm: clamped, leftPx, width: canvas.width });
                    try { relaySock.emit('client:log', { event: 'eeg_input_applied', data: { xNorm: clamped, leftPx } }); } catch {}
                } else {
                    console.log('[EEG][client] multiplayer mode: not directly applying; multiplayer renderer will override');
                    try { relaySock.emit('client:log', { event: 'eeg_input_override', data: { xNorm: clamped } }); } catch {}
                }
            } else {
                console.warn('[EEG][client] invalid input payload, missing command/paddleX');
                try { relaySock.emit('client:log', { event: 'eeg_input_invalid', data: { msg } }); } catch {}
            }
        });
    } catch {}

    // Check if start overlay exists
    const startOverlay = document.getElementById('startOverlay');
    const startButton = document.getElementById('startButton');
    console.log('[main] Start overlay exists:', !!startOverlay, 'visible:', startOverlay ? !startOverlay.classList.contains('hidden') : false);
    console.log('[main] Start button exists:', !!startButton);
    console.log('[main] gameRunning:', gameRunning);

    gameLoop();
}

function gameLoop(now) {
    if (gameRunning) {
        if (useMultiplayer) {
            stepMultiplayer(now, player, computer, ball, canvas);
        } else {
            updateGame(!useMultiplayer);
        }
        draw();
        updateScores(player.score, computer.score);

        if (player.score >= WINNING_SCORE || computer.score >= WINNING_SCORE) {
            const message = player.score >= WINNING_SCORE ? "You Win!" : "Computer Wins!";
            showMessage(message);
            gameRunning = false;
        }
    }
    animationFrameId = requestAnimationFrame(gameLoop);
}

async function startGame() {
    console.log('[main] startGame() called');

    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = 'Loading...';
    }

    console.log('[main] Initializing audio...');
    const audioInitialized = await initAudio();
    console.log('[main] Audio initialized:', audioInitialized);

    if (!audioInitialized) {
        showToast("Audio could not be initialized.");
    }

    hideStartOverlay();
    gameRunning = true;
    startSinglePlayer();
}

function restartGame() {
    player.score = 0;
    computer.score = 0;
    resetBall();
    hideMessage();
    gameRunning = true;
}

function startSinglePlayer() {
    useMultiplayer = false;
    hideStartOverlay();
    gameRunning = true;
    showToast("Single player mode (vs AI)");
}

function startMultiplayer(n = 2) {
    useMultiplayer = true;
    setupSocket(getRoomId(), { maxPlayers: Math.max(2, Math.min(4, Number(n)||2)) });
    hideStartOverlay();
    gameRunning = true;
    const playerCount = Math.max(2, Math.min(4, Number(n)||2));
    showToast(`Multiplayer mode (${playerCount} player${playerCount > 1 ? 's' : ''})`);
}

function selectPlayers(n) {
    if (Number(n) === 1) startSinglePlayer();
    else startMultiplayer(n);
}

function autoDetectMode() {
    // This is now the default action for the main start button
    hideStartOverlay();
    gameRunning = true;
    showToast("Connecting to server...");

    // Join the room first to see if anyone is there
    let hasStarted = false;

    setupSocket(getRoomId(), {
        autoDetect: true,
        onRoomState: (state) => {
            // state will contain: { playerCount, isAlone, newPlayer }
            if (!hasStarted) {
                // Initial join
                if (state.isAlone) {
                    // Nobody else in room, start in AI mode
                    useMultiplayer = false;
                    showToast("Playing vs AI (waiting for opponent...)");
                } else {
                    // Someone else is here, start in multiplayer
                    useMultiplayer = true;
                    showToast("Multiplayer mode");
                }
                hasStarted = true;
            } else if (state.newPlayer && !state.isAlone) {
                // Someone joined while we were playing AI
                if (!useMultiplayer) {
                    useMultiplayer = true;
                    showToast("Opponent joined! Switching to multiplayer");
                }
            }
        }
    });
}

// Initialize the game when the script is loaded

// Toolbar restart button handler
const restartGameButton = document.getElementById('restartGameButton');
if (restartGameButton) restartGameButton.addEventListener('click', () => {
    if (useMultiplayer) {
        try { requestRestart(); } catch {}
        showToast('Restart requested…');
    } else {
        restartGame();
        showToast('Restarted');
    }
});

init();
