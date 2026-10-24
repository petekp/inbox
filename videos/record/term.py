"""Records a terminal app headless. It runs the app in a private tmux server that draws nowhere, reads its screen with
colors about 60 times a second, sends keys to it, and logs every screen and key on one clock.

    python3 record/term.py <video> <take> [--size COLSxROWS] [--cwd DIR] [--env NAME=VALUE ...] -- <command ...>

Commands come on stdin, one a line, and each runs as soon as it is read. A line that starts with @<seconds> waits
until that many seconds after the recorder started the app, so a file of timed lines plays a scripted take:

    key <names>     tmux key names, such as Enter, Escape, Tab, Down or C-c, separated by spaces
    type <text>     types the text as it is
    mark <name>     logs a named moment, such as the end of a turn
    wait <seconds>  waits that long before the next line
    stop            ends the take, as the end of stdin does

The take is saved to takes/<video>/<take>.term.jsonl: a header line with the size and command, then a line for each
screen that differs from the one before, each key and each mark. `t` is seconds on the recorder's clock from its
start. Each screen line is tmux's capture of that row, with its colors as escape sequences. cut.py turns the log into
the JSON that TerminalTake draws.

The app's environment is this process's, with each --env on top. Give the app a fresh HOME there when it would
otherwise read or write your own settings.
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# How often the screen is read, in seconds.
POLL = 1 / 60
# The private tmux server's settings: no status line, a size that stays as given, and colors passed through.
TMUX_CONF = """set -g status off
set -g window-size manual
set -g default-terminal tmux-256color
set -as terminal-features ',*:RGB'
set -g escape-time 0
"""


class Tmux:
    """One control-mode connection to the private server. Each command's reply is read before the next is sent."""

    def __init__(self, server, conf):
        self.server, self.conf = server, conf
        self.lock = threading.Lock()
        self.proc = None

    def run(self, *args):
        return subprocess.run(['tmux', '-L', self.server, '-f', self.conf, *args], capture_output=True, text=True)

    def attach(self, session):
        self.proc = subprocess.Popen(['tmux', '-L', self.server, '-f', self.conf, '-C', 'attach', '-f', 'no-output',
                                      '-t', session], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                     bufsize=1, errors='replace')
        self.read_reply()

    def command(self, line):
        """Sends one tmux command and returns its output lines, or None once the session has ended."""
        with self.lock:
            if self.proc.poll() is not None:
                return None
            try:
                self.proc.stdin.write(line + '\n')
                self.proc.stdin.flush()
            except BrokenPipeError:
                return None
            return self.read_reply()

    def read_reply(self):
        lines, inside = [], False
        while True:
            line = self.proc.stdout.readline()
            if not line:
                return None
            line = line.rstrip('\n')
            if line.startswith('%begin'):
                inside, lines = True, []
            elif line.startswith('%end') or line.startswith('%error'):
                if inside:
                    return lines
            elif line.startswith('%exit'):
                return None
            elif inside:
                lines.append(line)


def quote(text):
    """Quotes text as one argument for a tmux command line."""
    return "'" + text.replace("'", "'\\''") + "'"


def main():
    args = sys.argv[1:]
    if '--' not in args or len(args) < 3:
        sys.exit(__doc__)
    split = args.index('--')
    (video, take, *options), command = args[:split], args[split + 1:]
    cols, rows, cwd, env = 120, 36, os.getcwd(), {}
    for i, option in enumerate(options):
        value = options[i + 1] if i + 1 < len(options) else ''
        if option == '--size':
            cols, rows = (int(n) for n in value.split('x'))
        elif option == '--cwd':
            cwd = value
        elif option == '--env':
            name, _, setting = value.partition('=')
            env[name] = setting

    takes = os.path.join(ROOT, 'takes', video)
    os.makedirs(takes, exist_ok=True)
    log = open(os.path.join(takes, take + '.term.jsonl'), 'w')
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    conf.write(TMUX_CONF)
    conf.close()
    tmux = Tmux(f'video-{video}-{take}-{os.getpid()}', conf.name)
    app = ' '.join(['env', *(quote(f'{k}={v}') for k, v in env.items()), *(quote(a) for a in command)])
    started = tmux.run('new-session', '-d', '-s', 'take', '-x', str(cols), '-y', str(rows), '-c', cwd, app)
    if started.returncode != 0:
        sys.exit(f'term: tmux could not start: {started.stderr.strip()}')
    tmux.attach('take')
    clock = time.monotonic()
    write_lock = threading.Lock()

    def write(entry):
        with write_lock:
            log.write(json.dumps({'t': round(time.monotonic() - clock, 4), **entry}, ensure_ascii=False) + '\n')
            log.flush()

    log.write(json.dumps({'cols': cols, 'rows': rows, 'command': command, 'cwd': cwd}) + '\n')
    done = threading.Event()

    def poll():
        last = None
        while not done.is_set():
            screen = tmux.command('capture-pane -p -e -N -t take')
            cursor = tmux.command("display -p -t take '#{cursor_x} #{cursor_y} #{cursor_flag}'")
            if screen is None or cursor is None:
                print('term: the app ended', flush=True)
                done.set()
                break
            x, y, shown = (int(n) for n in cursor[0].split())
            state = {'lines': screen[:rows] + [''] * (rows - len(screen)), 'cursor': [x, y, shown == 1]}
            if state != last:
                write(state)
                last = state
            time.sleep(POLL)

    poller = threading.Thread(target=poll, daemon=True)
    poller.start()
    try:
        for line in sys.stdin:
            if done.is_set():
                break
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if line.startswith('@'):
                due, _, line = line[1:].partition(' ')
                time.sleep(max(0.0, clock + float(due) - time.monotonic()))
            verb, _, rest = line.partition(' ')
            if verb == 'stop':
                break
            if verb == 'wait':
                time.sleep(float(rest))
            elif verb == 'mark':
                write({'mark': rest})
            elif verb == 'key':
                tmux.command(f'send-keys -t take {rest}')
                write({'key': rest})
            elif verb == 'type':
                tmux.command(f'send-keys -t take -l {quote(rest)}')
                write({'key': rest, 'typed': True})
            else:
                print(f'term: unknown command: {line}', flush=True)
    finally:
        done.set()
        poller.join(timeout=2)
        tmux.run('kill-server')
        os.unlink(conf.name)
        log.close()
    print(f'{log.name}: {time.monotonic() - clock:.1f} s')


main()
