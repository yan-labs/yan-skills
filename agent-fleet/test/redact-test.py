#!/usr/bin/env python3
"""Only synthetic, runtime-assembled fixtures; never print unfiltered failures."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / 'bin'
env = {**os.environ, 'PATH': str(BIN) + os.pathsep + os.environ['PATH']}
checks = 0


def check(condition, label):
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1


def run(text, *args):
    return subprocess.run(['redact', *args], input=text, text=True,
                          capture_output=True, env=env)


def main():
    secret = 'fake' + '-value-for-redaction'
    keys = ['password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key',
            'access_key', 'private_key', 'credential', 'auth']
    lines = []
    for key in keys:
        for name in (key, 'PREFIX_' + key.upper()):
            lines.extend([name + '=' + secret, '"' + name + '": "' + secret + '",',
                          name + ": '" + secret + "'"])
    for scheme in ('redis', 'rediss', 'amqp', 'amqps', 'postgres', 'postgresql',
                   'mysql', 'mongodb', 'mongodb+srv', 'https'):
        lines.append(scheme + '://' + 'fake-user' + ':' + secret + '@localhost/db')
    database_schemes = ('redis', 'rediss', 'amqp', 'amqps', 'postgres', 'postgresql',
                        'mysql', 'mongodb', 'mongodb+srv')
    for scheme in database_schemes:
        for username in ('', 'fake-user'):
            for password in (secret, 'fake%25value', 'fake%40value', 'fake%25%40value'):
                prefix = scheme + '://' + username + ':'
                url = prefix + password + '@localhost:6379/db'
                check(run(url).stdout == prefix + '<redacted:password>@localhost:6379/db',
                      'database URL password masked with authority preserved')
    aws = ['AKIA' + 'FAKE000000000000', 'ASIA' + 'FAKE000000000000']
    cloud_ids = [(prefix + 'Fake0000000000000000', kind)
                 for prefix, kind in [('LTAI', 'aliyun_access_key'), ('AKID', 'tencent_secret_id')]]
    cloud_ids += [(value, 'aws_access_key') for value in aws]
    for value, kind in cloud_ids:
        for prefix, suffix in [('', ''), ('error: ', ' invalid'),
                               ('{"AccessKeyId":"', '"}'),
                               ('AccessKeyId=', '&Action=GetCallerIdentity'),
                               ('AccessKeyId%3D', '%26Action%3DGetCallerIdentity'),
                               ('AccessKeyId%3d', '%26Action%3dGetCallerIdentity')]:
            check(run(prefix + value + suffix).stdout ==
                  prefix + '<redacted:' + kind + '>' + suffix,
                  'cloud key masked with surrounding structure preserved')
        for ordinary_value in ('word' + value, value[:4] + 'ordinary'):
            check(run(ordinary_value).stdout == ordinary_value, 'cloud-like ordinary word preserved')
    redis_secret = 'fake' + '-redis-pass'
    redis_cases = [
        ('requirepass ' + redis_secret, 'requirepass <redacted:password>'),
        ('  REQUIREPASS "' + redis_secret + ' x"', '  REQUIREPASS "<redacted:password>"'),
        ('requirepass=' + redis_secret, 'requirepass=<redacted:requirepass>'),
        ('requirepass: ' + redis_secret, 'requirepass: <redacted:requirepass>'),
        ('masterauth ' + redis_secret, 'masterauth <redacted:password>'),
        ('REDIS_PASS=' + redis_secret, 'REDIS_PASS=<redacted:redis_pass>'),
        ('sentinel auth-pass mymaster ' + redis_secret, 'sentinel auth-pass mymaster <redacted:password>'),
        ('SENTINEL SET mymaster auth-pass ' + redis_secret, 'SENTINEL SET mymaster auth-pass <redacted:password>'),
        ('tls-key-file-pass ' + redis_secret, 'tls-key-file-pass <redacted:password>'),
        ('CONFIG SET requirepass ' + redis_secret, 'CONFIG SET requirepass <redacted:password>'),
        ('redis-server --requirepass ' + redis_secret, 'redis-server --requirepass <redacted:password>'),
        ('user alice on >' + redis_secret + ' ~* +@all', 'user alice on ><redacted:password> ~* +@all'),
        ('user bob on #' + 'ab' * 32 + ' ~* +@all', 'user bob on #<redacted:password_hash> ~* +@all'),
        ('ACL SETUSER alice on >' + redis_secret + ' <old-' + redis_secret,
         'ACL SETUSER alice on ><redacted:password> <<redacted:password>'),
        ('AUTH ' + redis_secret, 'AUTH <redacted:password>'),
        ('AUTH fake-user ' + redis_secret, 'AUTH fake-user <redacted:password>'),
        ('127.0.0.1:6379> auth "' + redis_secret + '"', '127.0.0.1:6379> auth "<redacted:password>"'),
        ('redis-cli -h cache -a ' + redis_secret + ' --no-auth-warning',
         'redis-cli -h cache -a <redacted:password> --no-auth-warning'),
        ("redis-cli -a '" + redis_secret + "' ping", "redis-cli -a '<redacted:password>' ping"),
        ('redis-cli --user fake-user --pass=' + redis_secret, 'redis-cli --user fake-user --pass=<redacted:password>'),
        ('redis-benchmark -a ' + redis_secret + ' -n 10', 'redis-benchmark -a <redacted:password> -n 10'),
    ]
    for source, expected in redis_cases:
        got = run(source + '\n').stdout
        check(got == expected + '\n', 'redis credential masked: ' + expected)
        check(redis_secret not in got and 'old-' + redis_secret not in got, 'redis credential removed')
        check(run(got).stdout == got, 'redis redaction idempotent')
    redis_ordinary = '\n'.join([
        'ls -a /tmp', 'tar -a file.tar', 'grep -a pattern file', 'user alice logged in',
        'user alice on ~* +@all nopass', 'port 6379', 'maxmemory 256mb', 'requirepass', 'masterauth',
        'redis-cli -h cache -p 6379 ping', 'redis-cli --no-auth-warning info', 'AUTH', 'auth failed for user alice',
        'bind 127.0.0.1', 'sentinel monitor mymaster 127.0.0.1 6379 2', 'ACL SETUSER alice on ~* +@all',
    ]) + '\n'
    check(run(redis_ordinary).stdout == redis_ordinary, 'redis-flavoured ordinary lines preserved byte-for-byte')
    bearer = 'fake' + '-bearer-value'
    jwt = '.'.join(['eyJ' + 'mYWtl', 'ZmFrZQ', 'ZmFrZQ'])
    random_value = ('Fake0' + 'aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT')
    base64_value = random_value[:16] + '/' + random_value[16:] + '='
    pem_begin = '-----BEGIN ' + 'RSA PRIVATE KEY-----'
    pem_end = '-----END ' + 'RSA PRIVATE KEY-----'
    pem_body = 'fake' + '-private-body'
    lines += aws + ['Bearer ' + bearer, jwt, random_value, base64_value,
                    pem_begin, pem_body, pem_end]
    text = '\n'.join(lines) + '\n'
    result = run(text)
    check(result.returncode == 0, 'redact exit')
    output = result.stdout
    for value in [secret, *aws, bearer, jwt, random_value, base64_value, pem_body]:
        check(value not in output, 'synthetic credential removed')
    check(len(text.splitlines()) == len(output.splitlines()), 'line count preserved')
    for key in keys:
        check(key + '=<redacted:' in output, 'assignment name preserved')
    check('https://fake-user:<redacted:password>@localhost/db' in output,
          'URL password masked')
    ordinary = '\n'.join(['PATH=/usr/local/bin:/bin', 'file=release-2026-Final.tar.gz',
                           'digest=sha256:' + 'abcdef0123456789' * 4,
                           'url=https://example.com/files/report.json',
                           'url=https://example.com:8080/path',
                           'url=https://fake-user@example.com/db', 'port=8080', '', 'tail'])
    check(run(ordinary).stdout == ordinary, 'ordinary configuration byte-for-byte')
    check(run('port=8080\r\n\r\n').stdout == 'port=8080\n\n', 'CRLF subprocess text translation')
    raw = subprocess.run(['redact'], input=b'port=8080\r\n\r\n', capture_output=True, env=env)
    check(raw.stdout == b'port=8080\r\n\r\n', 'CRLF bytes preserved')
    check(run(output).stdout == output, 'redaction idempotent')
    check(random_value not in run('opaque=' + random_value).stdout, 'random secret under unknown key')
    check(base64_value not in run('opaque=' + base64_value).stdout, 'base64 secret under unknown key')
    check(run('path=/Users/fake/ProjectA1234567890LongDirectoryName').stdout ==
          'path=/Users/fake/ProjectA1234567890LongDirectoryName', 'long ordinary path preserved')
    with tempfile.TemporaryDirectory(prefix='redact-', dir=os.environ.get('TMPDIR', '/tmp')) as directory:
        fixture = Path(directory) / 'fixture.conf'
        fixture.write_text('before=normal\n' + 'password' + '=' + secret + '\nafter=normal\n' +
                           pem_begin + '\n' + pem_body + '\n' + pem_end + '\n')
        (Path(directory) / '.env').write_text('token' + '=' + secret + '\n')
        (Path(directory) / '.gitignore').write_text('.env\n')
        hidden = subprocess.run(['safe-grep', 'token', directory], capture_output=True, text=True, env=env)
        check(hidden.returncode == 0 and '.env:1:token=<redacted:token>' in hidden.stdout
              and secret not in hidden.stdout, 'hidden ignored configuration included')
        (Path(directory) / 'redis.conf').write_text('port 6379\nrequirepass ' + redis_secret + '\n')
        redis_grep = subprocess.run(['safe-grep', 'requirepass', directory], capture_output=True, text=True, env=env)
        check(redis_grep.returncode == 0 and 'redis.conf:2:requirepass <redacted:password>' in redis_grep.stdout
              and redis_secret not in redis_grep.stdout, 'safe-grep masks redis.conf requirepass')
        grep = subprocess.run(['safe-grep', 'password|' + pem_body, directory],
                              capture_output=True, text=True, env=env)
        check(grep.returncode == 0, 'safe-grep success')
        check(secret not in grep.stdout and pem_body not in grep.stdout, 'safe-grep masked')
        check(len(grep.stdout.splitlines()) == 2, 'safe-grep zero context')
        check(':2:password=<redacted:password>' in grep.stdout, 'safe-grep line number')
        check(':5:<redacted:private_key>' in grep.stdout, 'PEM body-only match masked')
        check(subprocess.run(['safe-grep', 'absent', directory], capture_output=True, env=env).returncode == 1,
              'safe-grep no match status')
        failure = subprocess.run(['safe-grep', '[', directory], capture_output=True, text=True, env=env)
        check(failure.returncode == 2 and '[' not in failure.stderr, 'safe-grep errors suppressed')
        print('假凭据输出示例（已脱敏）：')
        print('\n'.join(output.splitlines()[-10:]))
        print('普通配置输出（原样）：')
        print(ordinary)
        print('safe-grep 输出（仅命中行）：')
        print(grep.stdout, end='')
    print(f'PASS: {checks} checks')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('FAIL:', str(error) if isinstance(error, AssertionError) else type(error).__name__, '(fixture values suppressed)')
        raise SystemExit(1)
