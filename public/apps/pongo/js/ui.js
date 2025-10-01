// Pongo/js/ui.js

import { setSpeedMultiplier } from './game.js';

let playerScoreElem, computerScoreElem, messageBox, messageText, restartButton, muteButton, speedButton, speedModal, closeSpeedModal, countdownElem, startOverlay, toast, gameTimerElem;

export function initUI(onRestart, onStart) {
    playerScoreElem = document.getElementById('player-score');
    computerScoreElem = document.getElementById('computer-score');
    gameTimerElem = document.getElementById('game-timer');
    messageBox = document.getElementById('messageBox');
    messageText = document.getElementById('messageText');
    restartButton = document.getElementById('restartButton');
    muteButton = document.getElementById('muteButton');
    speedButton = document.getElementById('speedButton');
    speedModal = document.getElementById('speedModal');
    closeSpeedModal = document.getElementById('closeSpeedModal');
    countdownElem = document.getElementById('countdown');
    startOverlay = document.getElementById('startOverlay');
    toast = document.getElementById('toast');

    // Connect both restart buttons
    restartButton.addEventListener('click', onRestart);
    const restartGameButton = document.getElementById('restartGameButton');
    if (restartGameButton) {
        restartGameButton.addEventListener('click', onRestart);
    }

    // Ball Speed button - open modal
    if (speedButton) {
        speedButton.addEventListener('click', () => {
            speedModal.style.display = 'flex';
        });
    }

    // Close speed modal
    if (closeSpeedModal) {
        closeSpeedModal.addEventListener('click', () => {
            speedModal.style.display = 'none';
        });
    }

    // Speed choice buttons
    const speedChoices = document.querySelectorAll('.speed-choice');
    speedChoices.forEach(button => {
        button.addEventListener('click', () => {
            const speed = parseFloat(button.dataset.speed);
            setSpeedMultiplier(speed);
            speedModal.style.display = 'none';
            const speedLabel = button.textContent;
            showToast(`Ball speed set to ${speedLabel}`);
        });
    });

    const startButton = document.getElementById('startButton');
    if (startButton && typeof onStart === 'function') {
        startButton.addEventListener('click', onStart);
    }

    // Mute button (will be wired to audio in main.js)
    if (muteButton) {
        muteButton.addEventListener('click', () => {
            // This will be handled by importing toggleMute from audio
            if (window.toggleGameMute) {
                window.toggleGameMute();
            }
        });
    }
}

export function updateScores(playerScore, computerScore) {
    playerScoreElem.textContent = playerScore;
    computerScoreElem.textContent = computerScore;
}

export function updateGameTimer(minutes, seconds) {
    if (gameTimerElem) {
        gameTimerElem.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

export function showMessage(message, showButton = true) {
    console.log('[ui] showMessage() called with:', message, 'showButton:', showButton);
    console.log('[ui] messageBox exists:', !!messageBox);
    console.log('[ui] messageText exists:', !!messageText);
    
    if (messageText) {
        messageText.textContent = message;
    }
    if (messageBox) {
        messageBox.classList.remove('hidden');
        messageBox.style.display = 'flex'; // Force display
        console.log('[ui] Set messageBox display to flex');
    }
    if (showButton && restartButton) {
        restartButton.classList.remove('hidden');
        restartButton.style.display = 'block';
    } else if (restartButton) {
        restartButton.classList.add('hidden');
        restartButton.style.display = 'none';
    }
}

export function hideMessage() {
    if (messageBox) {
        messageBox.classList.add('hidden');
        messageBox.style.display = 'none';
    }
}

export function hideStartOverlay() {
    startOverlay.classList.add('hidden');
}

export function updateMuteButton(isMuted) {
    muteButton.textContent = isMuted ? '🔇' : '🔊';
}

export function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

export function updateCountdown(t) {
    const n = Math.max(1, Math.ceil(t));
    countdownElem.textContent = String(n);
    countdownElem.style.display = 'flex';
}

export function hideCountdown() {
    countdownElem.style.display = 'none';
}
