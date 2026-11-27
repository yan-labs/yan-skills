#!/usr/bin/env python3
"""Task-scoped fleet control proxy on a GCP workspace worker."""
import json
import os
from pathlib import Path
import socket
import sys

MAX_MESSAGE = 1024 * 1024

def main():
    argv = sys.argv[1:]
    if argv[:1] == ['heavy']:
        command = argv[1:]
        if command[:1] == ['--gcp']: command = command[1:]
        if command[:1] != ['--'] or len(command) < 2:
            raise ValueError('usage: fleet heavy [--gcp] -- <command> [args]')
        os.execvp(command[1], command[1:])
    config = json.loads(Path(os.environ['FLEET_GCP_BRIDGE_FILE']).read_text())
    request = {'token': config['token'], 'argv': argv}
    indexes = [i for i, arg in enumerate(argv) if arg == '--file']
    if indexes:
        if len(indexes) != 1 or indexes[0] + 1 >= len(argv): raise ValueError('invalid --file argument')
        path = Path(argv[indexes[0] + 1])
        if path.stat().st_size > 256 * 1024: raise ValueError('control file too large')
        request['file'] = path.read_text()
    payload = json.dumps(request, ensure_ascii=False).encode() + b'\n'
    if len(payload) > MAX_MESSAGE: raise ValueError('control request too large')
    with socket.create_connection(('127.0.0.1', config['port'])) as sock:
        sock.sendall(payload)
        data = bytearray()
        while b'\n' not in data:
            chunk = sock.recv(65536)
            if not chunk: raise ConnectionError('control bridge disconnected')
            data.extend(chunk)
            if len(data) > MAX_MESSAGE: raise ValueError('control response too large')
    response = json.loads(data.partition(b'\n')[0])
    sys.stdout.write(response.get('stdout', ''))
    sys.stderr.write(response.get('stderr', ''))
    return int(response['code'])

if __name__ == '__main__':
    try: sys.exit(main())
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print('fleet GCP bridge: ' + str(error), file=sys.stderr); sys.exit(1)
