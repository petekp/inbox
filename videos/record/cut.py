"""Turns a recorded take into the clip the video plays, in public/<video>/takes/, and records it in
src/<video>/takes.json.

    python3 record/cut.py <video> <take> [x y w h] [--mask x,y,w,h ...]

<take> is a name in takes/<video>/, such as side-by-side-terminal.

A VM recording, <take>.mov, is cropped to one app's window and resampled to the video's 60 frames a second. The
window's place on the VM's screen, and where the beat starts in the clip, go in takes.json. x, y, w, h are the app
window's bounds in VM screen points. They default to the bounds drive.py logged, and a take act.py logged needs them.
Each --mask covers a part of the window, in VM screen points, with the color just above it, such as an account picture.

A terminal take, <take>.term.jsonl from term.py, becomes the screens and keys TerminalTake draws, as JSON.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FPS = 60
# Seconds the clip holds its last frame.
HOLD = 20
# Where the VM's 1024-point-wide screen sits in a recording of the tart window at 1512x1010 points,
# in pixels.
TART_POINTS = [1512, 1010]
LEFT, TOP, SCALE = 202, 55, 2620 / 1024


def even(n):
    return int(n) // 2 * 2


def main():
    args = sys.argv[1:]
    masks = [tuple(float(v) for v in args[i + 1].split(',')) for i, a in enumerate(args) if a == '--mask']
    args = [a for i, a in enumerate(args) if a != '--mask' and (i == 0 or args[i - 1] != '--mask')]
    video, take = args[0], args[1]
    args = args[1:]
    takes = os.path.join(ROOT, 'takes', video)
    clips = os.path.join(ROOT, 'public', video, 'takes')
    index_path = os.path.join(ROOT, 'src', video, 'takes.json')
    os.makedirs(clips, exist_ok=True)
    terminal = os.path.join(takes, take + '.term.jsonl')
    if os.path.exists(terminal):
        info = cut_terminal(terminal, os.path.join(clips, take + '.json'))
        write_index(index_path, take, {'src': f'{video}/takes/{take}.json', **info})
        return
    sidecar = json.load(open(os.path.join(takes, take + '.json')))
    if sidecar['points'] != TART_POINTS:
        sys.exit(f"cut: the tart window was {sidecar['points']} points, and LEFT, TOP and SCALE are for {TART_POINTS}")
    presses_path = os.path.join(takes, take + '.presses.json')
    presses = json.load(open(presses_path)) if os.path.exists(presses_path) else None
    x, y, w, h = (float(v) for v in args[1:5]) if len(args) > 1 else presses['window']

    left, top = round(LEFT + x * SCALE), round(TOP + y * SCALE)
    width, height = even(round(w * SCALE)), even(round(h * SCALE))
    movie = os.path.join(takes, take + '.mov')
    filters = [f'crop={width}:{height}:{left}:{top}']
    for mx, my, mw, mh in masks:
        box = [round((mx - x) * SCALE), round((my - y) * SCALE), round(mw * SCALE), round(mh * SCALE)]
        color = color_at(movie, left + box[0] + box[2] // 2, top + box[1] - 6)
        filters.append(f'drawbox=x={box[0]}:y={box[1]}:w={box[2]}:h={box[3]}:color=0x{color}:t=fill')
    # The recorder writes a frame only when the window changes, so the last one is held to cover the beat.
    filters += [f'fps={FPS}', f'tpad=stop_mode=clone:stop_duration={HOLD}']
    clip = os.path.join(clips, take + '.mp4')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-i', movie, '-vf', ','.join(filters),
        '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-movflags', '+faststart', clip,
    ], check=True)

    info = {'src': f'{video}/takes/{take}.mp4', 'width': width, 'height': height, 'window': [x, y, w, h]}
    if presses:
        info['beatStartsAt'] = round(presses['beatStartsAt'], 4)
    write_index(index_path, take, info)
    print(f'{clip}: {width}x{height}')
    if presses:
        report_latency(presses, takes)


def write_index(path, take, info):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    index = json.load(open(path)) if os.path.exists(path) else {}
    index[take] = info
    with open(path, 'w') as f:
        json.dump(index, f, indent=2)
        f.write('\n')


def cut_terminal(log_path, clip):
    """Gathers term.py's log into one JSON file: the terminal's size, each screen and when it showed, and each key
    and mark, in seconds from the first screen."""
    entries = [json.loads(line) for line in open(log_path)]
    header, events = entries[0], entries[1:]
    screens = [e for e in events if 'lines' in e]
    if not screens:
        sys.exit(f'cut: {log_path} has no screens')
    start = screens[0]['t']
    at = lambda e: round(e['t'] - start, 4)
    out = {
        'cols': header['cols'],
        'rows': header['rows'],
        'screens': [{'t': at(e), 'lines': e['lines'], 'cursor': e['cursor']} for e in screens],
        'keys': [{'t': at(e), 'key': e['key']} for e in events if 'key' in e],
        'marks': [{'t': at(e), 'mark': e['mark']} for e in events if 'mark' in e],
    }
    with open(clip, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f"{clip}: {header['cols']}x{header['rows']} cells, {len(out['screens'])} screens over "
          f"{out['screens'][-1]['t']:.2f} s, {len(out['keys'])} keys")
    return {'kind': 'terminal', 'cols': header['cols'], 'rows': header['rows']}


def color_at(movie, px, py):
    """The color of one pixel of the movie's first frame, as RRGGBB."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', movie, '-frames:v', '1', '-vf', f'format=rgb24,crop=1:1:{px}:{py}',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return raw[:3].hex()


def report_latency(presses, takes):
    """Prints how long after each press the window first changed, which the timeline's `lead` should match. The
    recorder writes a frame only on a change, so the first frame after a press is the earliest its result shows."""
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time',
                          '-of', 'csv=p=0', os.path.join(takes, presses['movie'])],
                         capture_output=True, text=True, check=True).stdout
    times = sorted(float(t) for t in out.split())
    start = presses['beatStartsAt']
    for p in presses['presses']:
        changed = next((t for t in times if t > p['sent']), None)
        shown = f'{1000 * (changed - p["sent"]):.0f} ms after it was sent, at {changed - start:.2f} s' if changed else 'never'
        print(f"  {p['at']:6.2f} {p['command']}: first change {shown}")


main()
