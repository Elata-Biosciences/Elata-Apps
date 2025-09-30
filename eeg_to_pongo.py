#!/usr/bin/env python3
"""
EEG to Pongo Controller
Reads EEG predictions from stdin and sends paddle commands to Pongo game via WebSocket.

Usage:
    python your_eeg_script.py | python eeg_to_pongo.py
    # or
    cat data.txt | python eeg_to_pongo.py
"""

import sys
import re
import asyncio
import socketio
import argparse

# Command mapping: prediction class -> paddle command
# Adjust these mappings based on your training labels
CLASS_TO_COMMAND = {
    0: 'left',     # Move paddle left (or up)
    1: 'right',    # Move paddle right (or down)
    2: 'neutral',  # No movement / center
}

# WebSocket configuration
DEFAULT_SERVER_URL = 'http://localhost:3000'
DEFAULT_ROOM = 'eeg-control'

class EEGPongoController:
    def __init__(self, server_url, room_id, use_smoothed=True):
        self.server_url = server_url
        self.room_id = room_id
        self.use_smoothed = use_smoothed
        self.sio = socketio.AsyncClient()
        self.connected = False
        self.player_id = None
        self.side = None
        
        # Setup event handlers
        self.sio.on('connect', self.on_connect)
        self.sio.on('disconnect', self.on_disconnect)
        self.sio.on('joined', self.on_joined)
        
    async def on_connect(self):
        print(f"[EEG] Connected to {self.server_url}", file=sys.stderr)
        self.connected = True
        
    async def on_disconnect(self):
        print("[EEG] Disconnected from server", file=sys.stderr)
        self.connected = False
        
    async def on_joined(self, data):
        self.player_id = data.get('playerId')
        self.side = data.get('side')
        print(f"[EEG] Joined room '{self.room_id}' as {self.side} paddle (ID: {self.player_id})", file=sys.stderr)
        
    async def connect(self):
        """Connect to the Pongo server and join a room as a spectator/input device"""
        try:
            await self.sio.connect(self.server_url, namespaces=['/game'])
            # Join as spectator but send input for left paddle (Player 1)
            await self.sio.emit('join', {
                'roomId': self.room_id,
                'name': 'EEG Controller',
                'spectator': True  # Join as spectator, not as a player
            }, namespace='/game')
            print(f"[EEG] Joining room: {self.room_id} (as input device for Player 1)", file=sys.stderr)
        except Exception as e:
            print(f"[EEG] Error connecting: {e}", file=sys.stderr)
            raise
            
    async def send_paddle_command(self, command, paddle_y=None):
        """Send paddle movement command to server"""
        if not self.connected:
            return

        try:
            # Map command to paddle position (0.0 to 1.0)
            if command == 'neutral':
                # Center position
                target_y = 0.5
            elif command == 'left':
                # Move paddle up (y=0.2)
                target_y = 0.2
            elif command == 'right':
                # Move paddle down (y=0.8)
                target_y = 0.8
            else:
                return
                
            # Send paddle input to server for Player 1 (left paddle)
            await self.sio.emit('input', {
                'paddleY': target_y,
                'side': 'left'  # explicitly control Player 1
            }, namespace='/game')

            print(f"[EEG] → P1 {command} (y={target_y:.2f})", file=sys.stderr)

        except Exception as e:
            print(f"[EEG] Error sending command: {e}", file=sys.stderr)
            
    async def disconnect(self):
        """Disconnect from server"""
        if self.connected:
            await self.sio.disconnect()
            
    def parse_prediction_line(self, line):
        """
        Parse a prediction line and extract the smoothed or raw prediction.
        
        Example line:
        [pred] raw=0 smoothed=0 probs=[0.944, 0.015, 0.041] | fs=250.0Hz win=250 hop=62 | Fp1=ch3 Fp2=ch6
        
        Returns:
            int: Prediction class (0, 1, or 2) or None if parsing fails
        """
        try:
            # Extract smoothed or raw prediction
            if self.use_smoothed:
                match = re.search(r'smoothed=(\d+)', line)
            else:
                match = re.search(r'raw=(\d+)', line)
                
            if match:
                pred_class = int(match.group(1))
                return pred_class
            return None
        except Exception as e:
            print(f"[EEG] Error parsing line: {e}", file=sys.stderr)
            return None
            
    async def process_stdin(self):
        """Read predictions from stdin and send commands"""
        print("[EEG] Reading predictions from stdin...", file=sys.stderr)
        print("[EEG] Mapping: 0=left/up, 1=right/down, 2=neutral/center", file=sys.stderr)
        
        loop = asyncio.get_event_loop()
        
        while True:
            try:
                # Read line from stdin (non-blocking)
                line = await loop.run_in_executor(None, sys.stdin.readline)
                
                if not line:
                    # EOF reached
                    print("[EEG] End of input stream", file=sys.stderr)
                    break
                    
                line = line.strip()
                if not line:
                    continue
                    
                # Parse prediction
                pred_class = self.parse_prediction_line(line)
                
                if pred_class is not None:
                    # Map to command
                    command = CLASS_TO_COMMAND.get(pred_class, 'rest')
                    
                    # Send command to Pongo
                    await self.send_paddle_command(command)
                    
            except KeyboardInterrupt:
                print("\n[EEG] Interrupted by user", file=sys.stderr)
                break
            except Exception as e:
                print(f"[EEG] Error processing input: {e}", file=sys.stderr)
                await asyncio.sleep(0.1)
                
        await self.disconnect()

async def main():
    parser = argparse.ArgumentParser(description='EEG to Pongo Controller')
    parser.add_argument('--server', default=DEFAULT_SERVER_URL, 
                        help=f'Pongo server URL (default: {DEFAULT_SERVER_URL})')
    parser.add_argument('--room', default=DEFAULT_ROOM,
                        help=f'Room ID to join (default: {DEFAULT_ROOM})')
    parser.add_argument('--use-raw', action='store_true',
                        help='Use raw predictions instead of smoothed')
    parser.add_argument('--map', nargs=3, metavar=('CLASS0', 'CLASS1', 'CLASS2'),
                        help='Custom command mapping (e.g., --map rest up down)')
    
    args = parser.parse_args()
    
    # Update command mapping if provided
    if args.map:
        CLASS_TO_COMMAND[0] = args.map[0]
        CLASS_TO_COMMAND[1] = args.map[1]
        CLASS_TO_COMMAND[2] = args.map[2]
        print(f"[EEG] Custom mapping: 0={args.map[0]}, 1={args.map[1]}, 2={args.map[2]}", file=sys.stderr)
    
    # Create controller
    controller = EEGPongoController(
        server_url=args.server,
        room_id=args.room,
        use_smoothed=not args.use_raw
    )
    
    # Connect to server
    await controller.connect()
    
    # Wait for connection
    await asyncio.sleep(1)
    
    # Process stdin
    await controller.process_stdin()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EEG] Exiting...", file=sys.stderr)
        sys.exit(0)

