"""Records one take of a beat in the VM. It starts the window recorder on this Mac, sends each of the beat's clicks
into the VM at the time the video's timeline gives it, and logs them on the recorder's clock.

    python3 record/drive.py <video> <beat> [look] [cut]

<beat> is a beat's id in the video's timeline, such as side-by-side. A beat that shows several apps takes the app's
look, such as terminal. Before a take, set the app up in the VM in the state the beat starts from. For the launch
video's side-by-side beat, that is the inbox docked, in the demo, on Needs you with the first question open. The take
is saved to takes/<video>/<beat>-<look>.mov, or takes/<video>/<beat>.mov, with the recorder's sidecar and the click
log beside it. cut.py turns it into the clip the video plays.

VM names the tart VM, inbox-ui by default. VM_HOST names its SSH address, admin@<ip> by default from `tart ip`.
"""
import json
import os
import signal
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RECORDER = os.path.join(ROOT, 'out', 'record')
VM = os.environ.get('VM', 'inbox-ui')
# Seconds recorded before the beat's first frame and after its last.
LEAD, TAIL = 2.0, 1.0
# How long before each click the pointer moves onto its target, so the target's hover state is in the take when the
# pointer the video draws arrives.
HOVER_LEAD = 0.3


def vm_host():
    if os.environ.get('VM_HOST'):
        return os.environ['VM_HOST']
    ip = subprocess.run(['tart', 'ip', VM], capture_output=True, text=True, check=True).stdout.strip()
    return f'admin@{ip}'


def front_window(host):
    """The front app's name and its first window's bounds in VM screen points: x, y, w, h."""
    script = ('const p = Application("System Events").processes.whose({frontmost: true})[0]; '
              'const w = p.windows[0]; JSON.stringify([p.name(), ...w.position(), ...w.size()])')
    out = subprocess.run(['ssh', '-o', 'BatchMode=yes', host, f"osascript -l JavaScript -e '{script}'"],
                         capture_output=True, text=True, check=True).stdout
    app, *bounds = json.loads(out)
    return app, bounds


def beat_states(video, beat_id, look, cut):
    """One beat's states, for one look when the beat shows several, from the timeline the video is rendered from."""
    subprocess.run(['node', 'scripts/check.mjs', video], cwd=ROOT, capture_output=True, check=True)
    code = (
        "import { TIMELINES } from './out/videos.mjs'\n"
        f"const beat = TIMELINES[{json.dumps(video)}].timeline({json.dumps(cut)}).find(b => b.id === {json.dumps(beat_id)})\n"
        f"const states = Array.isArray(beat.states) ? beat.states : beat.states[{json.dumps(look)}]\n"
        "console.log(JSON.stringify({ length: beat.length, states }))"
    )
    out = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, capture_output=True, text=True,
                         check=True).stdout
    return json.loads(out)


def main():
    video, beat_id, look, cut = (sys.argv[1:] + [None, None])[:4]
    cut = cut or video
    beat = beat_states(video, beat_id, look, cut)
    clicks = [s for s in beat['states'] if s.get('click') or s.get('move')]

    host = vm_host()
    app, bounds = front_window(host)
    print(f'{app} window at {bounds}', flush=True)
    takes = os.path.join(ROOT, 'takes', video)
    os.makedirs(takes, exist_ok=True)
    name = f'{beat_id}-{look}' if look else beat_id
    movie = os.path.join(takes, name + '.mov')
    recorder = subprocess.Popen([RECORDER, VM, movie], stdout=subprocess.PIPE, text=True)
    print(recorder.stdout.readline().strip(), flush=True)
    hand = subprocess.Popen(['ssh', '-o', 'BatchMode=yes', host, 'osascript -l JavaScript hand.js'],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
    log = []

    def send(command):
        sent = time.monotonic()
        hand.stdin.write(command + '\n')
        hand.stdin.flush()
        ack = hand.stdout.readline().strip()
        if not ack.startswith('ok '):
            raise SystemExit(f'drive: {command}: {ack}')
        return sent, time.monotonic()

    try:
        start = time.monotonic() + LEAD
        for s in clicks:
            if s.get('move'):
                x, y = s['move']
                time.sleep(max(0.0, start + s['at'] - time.monotonic()))
                send(f'move {x} {y}')
                continue
            x, y = s['click']
            # The click goes this much early, so its result shows at the state's time.
            due = start + s['at'] - s.get('lead', 0)
            time.sleep(max(0.0, due - HOVER_LEAD - time.monotonic()))
            send(f'move {x} {y}')
            time.sleep(max(0.0, due - time.monotonic()))
            command = f'click {x} {y}'
            sent, acked = send(command)
            log.append({'at': s['at'], 'command': command, 'due': due, 'sent': sent, 'acked': acked})
            print(f"  {s['at']:6.2f} {command}  sent {sent - start:6.2f}, late {1000 * (sent - due):.0f} ms, "
                  f'ack {1000 * (acked - sent):.0f} ms', flush=True)
        time.sleep(max(0.0, start + beat['length'] + TAIL - time.monotonic()))
    finally:
        recorder.send_signal(signal.SIGINT)
        print(recorder.communicate()[0].strip(), flush=True)
        hand.stdin.close()
        hand.wait()

    sidecar = json.load(open(os.path.join(takes, name + '.json')))
    first = sidecar['firstFrameHostTime']
    record = {
        'video': video,
        'beat': beat_id,
        'look': look,
        'cut': cut,
        'movie': os.path.basename(movie),
        'app': app,
        # The app window's bounds in VM screen points: x, y, w, h.
        'window': bounds,
        # Seconds into the movie where the beat's first frame falls.
        'beatStartsAt': start - first,
        'presses': [{**p, 'due': p['due'] - first, 'sent': p['sent'] - first, 'acked': p['acked'] - first} for p in log],
    }
    json.dump(record, open(os.path.join(takes, name + '.presses.json'), 'w'), indent=1)
    print(f"beat starts {record['beatStartsAt']:.3f} s into {movie}")


main()
