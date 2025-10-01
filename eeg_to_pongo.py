#!/usr/bin/env python3
import sys
import asyncio
import socketio
import json
import time
import argparse
from collections import deque

# --- Configuration ---
UPDATE_INTERVAL = 1.0 / 60.0  # 60 Hz
HISTORY_SIZE = 10  # Number of recent predictions to consider
SMOOTHING_FACTOR = 0.3  # How much to blend new predictions with history (0-1)

# --- Global State ---
sio = socketio.AsyncClient()
current_paddle_x = 0.5
prediction_history = deque(maxlen=HISTORY_SIZE)  # Store recent probability vectors

async def send_paddle_command(room):
    """Sends the current paddle position to the server via Socket.IO."""
    try:
        # The server expects the room in the 'join' event, not every input event.
        # Sending paddleX is sufficient as per the client-side implementation.
        await sio.emit('input', {'paddleX': current_paddle_x}, namespace='/relay')
    except socketio.exceptions.BadNamespaceError:
        print("Error: Not connected to the '/relay' namespace.", file=sys.stderr)
    except Exception as e:
        print(f"An error occurred while sending command: {e}", file=sys.stderr)

async def control_loop(room):
    """The main loop that continuously sends paddle position updates."""
    while True:
        await send_paddle_command(room)
        await asyncio.sleep(UPDATE_INTERVAL)

async def listen_for_eeg_data():
    """Listens for JSON data from stdin and updates the target paddle position."""
    global current_paddle_x
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    print("Listening for EEG data on stdin...", file=sys.stderr)

    while True:
        line = await reader.readline()
        if not line:
            break
        try:
            data = json.loads(line)
            if 'probs' in data and isinstance(data['probs'], list) and len(data['probs']) == 3:
                probs = data['probs']
                
                # Add to history
                prediction_history.append(probs)
                
                # Calculate smoothed probabilities using exponential moving average
                if len(prediction_history) > 0:
                    # Start with the most recent prediction
                    smoothed_probs = list(probs)
                    
                    # Blend with historical predictions
                    for hist_probs in list(prediction_history)[:-1]:  # Exclude the most recent one
                        for i in range(3):
                            smoothed_probs[i] = (smoothed_probs[i] * SMOOTHING_FACTOR + 
                                               hist_probs[i] * (1 - SMOOTHING_FACTOR))
                    
                    # Normalize
                    total = sum(smoothed_probs)
                    if total > 0:
                        smoothed_probs = [p/total for p in smoothed_probs]
                    
                    # Calculate target position using smoothed probabilities
                    # probs[0] = left, probs[1] = center, probs[2] = right
                    # Map to x-positions: 0.15 (left), 0.5 (center), 0.85 (right)
                    target_x = (smoothed_probs[0] * 0.15) + (smoothed_probs[1] * 0.5) + (smoothed_probs[2] * 0.85)
                    
                    # Only update if the change is significant (reduce micro-jitters)
                    if abs(target_x - current_paddle_x) > 0.02:
                        current_paddle_x = target_x
                    
        except json.JSONDecodeError:
            pass # Ignore non-JSON lines
        except Exception as e:
            print(f"An error occurred processing EEG data: {e}", file=sys.stderr)

@sio.event
async def connect():
    # This is a general connection event, the room is joined in main()
    print("Connected to server.", file=sys.stderr)

@sio.event
async def disconnect():
    print("Disconnected from server.", file=sys.stderr)

async def main(room):
    """Main function to connect to the server and start the loops."""
    try:
        await sio.connect('http://localhost:3000', namespaces=['/relay'])
        print(f"Joining room '{room}' in '/relay' namespace.", file=sys.stderr)
        await sio.emit('join', {'roomId': room, 'name': 'EEG Script'}, namespace='/relay')
        
        # Start the main loops
        control_task = asyncio.create_task(control_loop(room))
        eeg_task = asyncio.create_task(listen_for_eeg_data())
        await asyncio.gather(control_task, eeg_task)

    except socketio.exceptions.ConnectionError as e:
        print(f"Connection failed: {e}", file=sys.stderr)
        print("Is the Node.js server running on port 3000?", file=sys.stderr)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
    finally:
        if sio.connected:
            await sio.disconnect()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Send EEG paddle controls to Pongo game.')
    parser.add_argument('--room', type=str, default='default', help='The room ID to join.')
    args = parser.parse_args()

    try:
        asyncio.run(main(args.room))
    except KeyboardInterrupt:
        print("\nScript terminated by user.", file=sys.stderr)
