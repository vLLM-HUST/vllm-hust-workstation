"""Read-only host serving evidence. Never import vLLM/GPU code or expose env/argv.

This checks live service identity and on-disk source, not process-memory attestation.
No capture is reused: every observation binds the configured unit to its listener,
model catalog, import origin, canonical repository and source/artifact fingerprint.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request

SCHEMA = 'vllm-hust.workstation-host-observation/v1'
CANONICAL = 'https://github.com/vLLM-HUST/vllm-hust'


def run(*args, cwd=None, env=None):
    return subprocess.check_output(args, cwd=cwd, env=env, text=True,
                                   stderr=subprocess.DEVNULL, timeout=5).strip()


def identity(service):
    values = dict(line.split('=', 1) for line in run(
        'systemctl', '--user', 'show', service, '-p', 'MainPID', '-p', 'ActiveState',
        '-p', 'WorkingDirectory').splitlines())
    if values.get('ActiveState') != 'active' or not values.get('MainPID', '').isdigit():
        raise ValueError('configured serving service is not active')
    pid = int(values['MainPID'])
    if pid <= 1:
        raise ValueError('configured serving service has no process')
    proc = Path(f'/proc/{pid}')
    stat = proc.joinpath('stat').read_text().rsplit(')', 1)[1].split()
    root = proc.joinpath('cwd').resolve(strict=True)
    if root != Path(values['WorkingDirectory']).resolve(strict=True):
        raise ValueError('service working directory differs from process')
    return {'pid': pid, 'startTicks': stat[19],
            'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'executable': str(proc.joinpath('exe').resolve(strict=True)), 'root': str(root)}


def source_evidence(root, started_at):
    root = Path(root)
    remote = run('git', 'remote', 'get-url', 'origin', cwd=root).removesuffix('.git')
    if remote == 'git@github.com:vLLM-HUST/vllm-hust':
        remote = CANONICAL
    if remote != CANONICAL:
        raise ValueError('source repository is not canonical vLLM-HUST')
    commit = run('git', 'rev-parse', 'HEAD', cwd=root)
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('invalid source commit')
    # A modified working tree is not silently described as its base commit.
    if run('git', 'status', '--porcelain', '--untracked-files=all', '--', 'vllm', 'csrc', 'setup.py', 'pyproject.toml', cwd=root):
        raise ValueError('serving source tree has uncommitted changes')
    tracked = run('git', 'ls-files', '-z', '--', 'vllm', 'csrc', 'setup.py', 'pyproject.toml', cwd=root).split('\0')
    files = {root / name for name in tracked if name}
    # Native build outputs are often ignored by git; include their actual bytes.
    native = set(root.joinpath('vllm').rglob('*.so'))
    files |= native
    if not files or not native:
        raise ValueError('serving source or native artifacts missing')
    digest = hashlib.sha256()
    for file in sorted(files):
        if file.is_symlink() or not file.is_file():
            raise ValueError('source manifest contains missing or symlinked files')
        before = file.stat()
        if before.st_mtime > started_at:
            raise ValueError('source/artifact changed after serving process started')
        content_hash = hashlib.sha256(file.read_bytes()).digest()
        after = file.stat()
        if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
            raise ValueError('source changed during observation')
        digest.update(str(file.relative_to(root)).encode() + b'\0' + content_hash)
    return {'repository': remote, 'commit': commit, 'commitUrl': f'{remote}/commit/{commit}',
            'sourceDigest': 'sha256:' + digest.hexdigest(), 'trackedAndNativeFiles': len(files),
            'nativeArtifacts': len(native), 'dirty': False}


def read_bound_routes(routes_file, expected_file, started_at):
    routes_path = Path(routes_file).resolve(strict=True)
    if Path(expected_file).resolve() != routes_path:
        raise ValueError('route file differs from running gateway configuration')
    route_stat = routes_path.stat()
    if route_stat.st_mtime > started_at:
        raise ValueError('route configuration changed after gateway started')
    route_bytes = routes_path.read_bytes()
    return routes_path, route_stat, route_bytes, json.loads(route_bytes)


def observe(service, routes_file, router_service):
    if not all(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.@-]*\.service', name) for name in (service, router_service)):
        raise ValueError('invalid configured service')
    before = identity(service)
    proc = Path(f'/proc/{before["pid"]}')
    argv = [p.decode() for p in proc.joinpath('cmdline').read_bytes().split(b'\0') if p]
    if '-m' not in argv or argv[argv.index('-m') + 1] != 'vllm.entrypoints.cli.main' or 'serve' not in argv:
        raise ValueError('service is not the expected vLLM CLI server')
    port = int(argv[argv.index('--port') + 1])
    model = argv[argv.index('--served-model-name') + 1]
    sockets = {p.readlink().name for p in proc.joinpath('fd').iterdir() if p.is_symlink()}
    listeners = [line.split() for line in Path('/proc/net/tcp').read_text().splitlines()[1:]]
    if not any(fields[1] == f'0100007F:{port:04X}' and fields[3] == '0A' and f'socket:[{fields[9]}]' in sockets for fields in listeners):
        raise ValueError('model listener is not owned by serving process')
    env = dict(p.decode().split('=', 1) for p in proc.joinpath('environ').read_bytes().split(b'\0') if b'=' in p)
    safe_env = {key: env[key] for key in ('PATH', 'PYTHONPATH') if key in env}
    # find_spec('vllm') does not import vllm, torch or allocate GPU memory.
    metadata = json.loads(run(before['executable'], '-c',
        "import importlib.util,importlib.metadata,json;print(json.dumps({'origin':importlib.util.find_spec('vllm').origin,'version':importlib.metadata.version('vllm')}))",
        cwd=before['root'], env=safe_env))
    if Path(metadata['origin']).resolve() != Path(before['root']) / 'vllm/__init__.py':
        raise ValueError('module resolves outside serving source tree')
    boot = int(next(line.split()[1] for line in Path('/proc/stat').read_text().splitlines() if line.startswith('btime ')))
    started_at = boot + int(before['startTicks']) / os.sysconf('SC_CLK_TCK')
    source = source_evidence(before['root'], started_at)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(f'http://127.0.0.1:{port}/v1/models', timeout=3) as response:
        models = json.load(response)
    if model not in [item['id'] for item in models['data']]:
        raise ValueError('live model catalog differs from serving arguments')
    router = identity(router_service)
    router_env = dict(p.decode().split('=', 1) for p in Path(f'/proc/{router["pid"]}/environ').read_bytes().split(b'\0') if b'=' in p)
    router_started_at = boot + int(router['startTicks']) / os.sysconf('SC_CLK_TCK')
    routes_path, route_stat, route_bytes, routes = read_bound_routes(
        routes_file, router_env.get('SAGE_ROUTER_ROUTES_CONFIG', '/nonexistent'), router_started_at)
    covered = sorted({alias for route in routes['models']
                      if route['backend_url'].rstrip('/') == f'http://127.0.0.1:{port}' and route['backend_model'] == model
                      for alias in [route['id'], *route.get('aliases', [])]})
    if not covered:
        raise ValueError('no gateway route bound to the observed model listener')
    after = identity(service)
    route_after = routes_path.stat()
    if before != after or router != identity(router_service) or (
            route_stat.st_mtime_ns, route_stat.st_size, route_stat.st_ino) != (
            route_after.st_mtime_ns, route_after.st_size, route_after.st_ino):
        raise ValueError('serving process changed during observation')
    # Only explicitly public evidence; no env, argv, model paths or credentials.
    return {'schema': SCHEMA, 'service': service, 'pid': before['pid'],
            'startTicks': before['startTicks'], 'bootId': before['bootId'],
            'model': model, 'coveredModels': covered,
            'routerService': router_service, 'routerPid': router['pid'],
            'routeDigest': 'sha256:' + hashlib.sha256(route_bytes).hexdigest(),
            'startedAt': datetime.datetime.fromtimestamp(started_at, datetime.timezone.utc).isoformat(),
            'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'version': metadata['version'], **source}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--service', required=True)
    parser.add_argument('--routes-file', required=True)
    parser.add_argument('--router-service', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(observe(args.service, args.routes_file, args.router_service)))
    except Exception as error:
        # Exception text can contain private paths; report only known validation
        # errors, never raw subprocess argv, environment or response bodies.
        print(json.dumps({'error': str(error) if isinstance(error, ValueError) else 'host observation failed'}))
        raise SystemExit(1)
