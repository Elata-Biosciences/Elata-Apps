// Pongo/js/main.js

import { initGame, updateGame, draw, player, computer, resetBall, ball } from './game.js';
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
    // Fixed internal resolution - CSS will scale it
    canvas.width = 800;
    canvas.height = 600;

    const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);

    initGame(canvas, ctx);
    initUI(restartGame, startGame);
    // Don't init audio here - wait for user gesture in startGame()
    initMultiplayer(isLocalDev);

    // Mouse movement for player paddle
    canvas.addEventListener('mousemove', (evt) => {
        if (!useMultiplayer) {
            let rect = canvas.getBoundingClientRect();
            player.y = evt.clientY - rect.top - player.height / 2;
        }
    });

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

        if (player.score >= 5 || computer.score >= 5) {
            const message = player.score >= 5 ? "You Win!" : "Computer Wins!";
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
