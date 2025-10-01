# EEG Control for Pongo Game

Control the Pongo paddle using EEG brain signals!

## Setup

### 1. Install Python Dependencies

```bash
pip install -r requirements-eeg.txt
```

### 2. Start the Pongo Server

```bash
./run dev
```

The server will start on `http://localhost:3000`

### 3. Open the Game in Browser

Open the game in a named room (the roomId is the last path segment):

- http://localhost:3000/pongo/brain-room

In this example the roomId is `brain-room`.

## Quick start: Simulated EEG → relay → browser (horizontal paddleX)

Run the simulated EEG pipeline in another terminal:

```bash
python3 test_eeg_stream.py | python3 eeg_to_pongo.py --room brain-room
```

This streams left/neutral/right class predictions that are mapped to paddleX ≈ 0.2 / 0.5 / 0.8.
Player 1’s paddle in the browser will move left/center/right accordingly.


## Usage

### With Real EEG Data

Pipe your EEG prediction output directly to the controller:

```bash
python your_eeg_script.py | python eeg_to_pongo.py
```

### With Test Data (for testing)

Use the test simulator to generate fake predictions:

```bash
python test_eeg_stream.py | python eeg_to_pongo.py
```

Or test with the sample data file:

```bash
cat data.txt | python eeg_to_pongo.py
```

## Command Mapping

The default mapping is:

- **Class 0** → `left` (horizontal, paddleX ≈ 0.2)
- **Class 1** → `right` (horizontal, paddleX ≈ 0.8)
- **Class 2** → `neutral` (horizontal, paddleX ≈ 0.5)

### Custom Mapping

You can customize the command mapping:

```bash
python your_eeg_script.py | python eeg_to_pongo.py --map neutral left right
```

This would map:
- Class 0 → neutral
- Class 1 → left
- Class 2 → right

## Options

```bash
python eeg_to_pongo.py --help
```

Available options:

- `--server URL` - Pongo server URL (default: http://localhost:3000)
- `--room ROOM` - Room ID to join (default: eeg-control)
- `--use-raw` - Use raw predictions instead of smoothed
- `--map C0 C1 C2` - Custom command mapping

## Examples

### Connect to a different room:

```bash
python your_eeg_script.py | python eeg_to_pongo.py --room my-room
```

Then open: `http://localhost:3000/pongo/my-room`

### Use raw predictions instead of smoothed:

```bash
python your_eeg_script.py | python eeg_to_pongo.py --use-raw
```

### Connect to remote server:

```bash
python your_eeg_script.py | python eeg_to_pongo.py --server https://your-server.com
```

## Data Format

The controller expects input lines in this format:

```
[pred] raw=0 smoothed=0 probs=[0.944, 0.015, 0.041] | fs=250.0Hz win=250 hop=62 | Fp1=ch3 Fp2=ch6
```

It will extract either the `smoothed` or `raw` prediction value (0, 1, or 2) and map it to a paddle command.

## Troubleshooting

### "Connection refused"

Make sure the Pongo server is running:

```bash
./run dev
```

### "No predictions being sent"

Check that your EEG script is outputting data in the correct format. You should see lines like:

```
[pred] raw=X smoothed=Y probs=[...] | ...
```

### "Paddle not moving"

1. Make sure you've opened the game in your browser at the correct room URL (e.g., http://localhost:3000/pongo/brain-room)
2. Check the EEG controller output - you should see `Joined room 'brain-room'` (or your room)
3. Verify predictions are being received - you should see messages like `[EEG] -> P1 left (x=0.20)`

### Testing the connection

Use the test simulator to verify everything works:

```bash
# Terminal 1: Start server
./run dev

# Terminal 2: Start EEG controller with test data
python test_eeg_stream.py | python eeg_to_pongo.py

# Browser: Open http://localhost:3000/pongo/eeg-control
```

You should see the paddle moving automatically based on the simulated predictions.

## How It Works

1. **EEG Predictions** → Your EEG classifier outputs predictions (0, 1, or 2) every ~500ms
2. **Parser** → `eeg_to_pongo.py` parses the prediction from each line
3. **Mapper** → Maps the prediction class to a paddle command (left/right/neutral)
4. **WebSocket** → Sends the command to the Pongo server via Socket.IO
5. **Game** → The server updates your paddle position in real-time

## Advanced: Adjusting Paddle Positions

Edit `eeg_to_pongo.py` and modify the `send_paddle_command` function:

```python
if command == 'neutral':
    target_y = 0.5  # Center (0.0 = top, 1.0 = bottom)
elif command == 'left':
    target_y = 0.2  # Upper position
elif command == 'right':
    target_y = 0.8  # Lower position
```

You can adjust these values to fine-tune the paddle positions.

## Training with 8 Channels

If you're training with 8 EEG channels, make sure your model outputs 3 classes:
- Class 0: Left motor imagery
- Class 1: Right motor imagery
- Class 2: Neutral/rest state

The controller will work with any number of input channels as long as the output format matches the expected prediction line format.

