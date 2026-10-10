#!/usr/bin/env python3
"""Prepare, sign and validate a CSign IPA using the existing zsign installation."""
import argparse
from datetime import datetime, timezone
import fnmatch
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile


def profile_info(provision):
    result = subprocess.run(
        ['openssl', 'cms', '-verify', '-noverify', '-inform', 'DER', '-in', str(provision)],
        capture_output=True, check=False,
    )
    if result.returncode:
        raise ValueError('Không đọc được provisioning profile của chứng chỉ.')
    return plistlib.loads(result.stdout)


def bundle_identifier(profile, requested):
    app_id = profile.get('Entitlements', {}).get('application-identifier', '')
    if '.' not in app_id:
        raise ValueError('Provisioning profile không có application-identifier hợp lệ.')
    allowed = app_id.split('.', 1)[1]
    if '*' not in allowed:
        return allowed
    if fnmatch.fnmatchcase(requested, allowed):
        return requested
    candidate = allowed.replace('*', 'csign')
    if not fnmatch.fnmatchcase(candidate, allowed):
        raise ValueError('Không chọn được Bundle ID phù hợp với provisioning profile.')
    return candidate


def sign(args):
    provision = Path(args.provision).resolve()
    certificate = Path(args.certificate).resolve()
    output = Path(args.output).resolve()
    profile = profile_info(provision)
    bundle_id = bundle_identifier(profile, args.bundle_id)
    if args.udid and not profile.get('ProvisionsAllDevices'):
        devices = {d.lower() for d in profile.get('ProvisionedDevices', [])}
        if args.udid.lower() not in devices:
            raise ValueError('Chứng chỉ chưa cấp quyền cài đặt cho UDID này.')
    if args.udid and profile.get('ExpirationDate', datetime.min) <= datetime.now(timezone.utc).replace(tzinfo=None):
        raise ValueError('Provisioning profile của chứng chỉ đã hết hạn; cần gia hạn trước khi cài CSign.')
    # Password travels over stdin, never through a shell command or the zsign log.
    password = json.load(sys.stdin)['password']
    certificate_data = subprocess.run([
        'openssl', 'pkcs12', '-legacy', '-in', str(certificate),
        '-passin', 'env:CSIGN_P12_PASSWORD', '-nokeys', '-clcerts',
    ], env={**os.environ, 'CSIGN_P12_PASSWORD': password}, capture_output=True)
    public_certificate = subprocess.run(
        ['openssl', 'x509', '-outform', 'DER'], input=certificate_data.stdout, capture_output=True,
    )
    if certificate_data.returncode or public_certificate.returncode:
        raise ValueError('Không mở được chứng chỉ .p12; kiểm tra mật khẩu chứng chỉ.')
    if public_certificate.stdout not in profile.get('DeveloperCertificates', []):
        raise ValueError('Chứng chỉ .p12 không khớp với provisioning profile.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='csign_', dir=output.parent) as tmp:
        tmp = Path(tmp)
        original_modes = {}
        with zipfile.ZipFile(args.template) as archive:
            if archive.testzip() is not None:
                raise ValueError('IPA nguồn bị hỏng.')
            archive.extractall(tmp)
            # zipfile.extractall does not preserve executable modes or symbolic links.
            for item in archive.infolist():
                dest = tmp / item.filename
                mode = item.external_attr >> 16
                original_modes[item.filename] = mode
                if (mode & 0o170000) == 0o120000:
                    dest.unlink()
                    dest.symlink_to(archive.read(item).decode('utf-8'))
                elif mode & 0o777:
                    dest.chmod(mode & 0o777)
        app = tmp / 'Payload/CSign.app'
        info_path = app / 'Info.plist'
        info = plistlib.loads(info_path.read_bytes())
        # A template must not leak a certificate from another installation.
        assets = app / 'signing-assets'
        if assets.exists():
            shutil.rmtree(assets)
        safe_name = re.sub(r'[^a-zA-Z0-9 _-]', '', args.cert_name).strip() or 'Cert'
        assets = assets / safe_name
        assets.mkdir(parents=True)
        shutil.copy2(certificate, assets / 'cert.p12')
        shutil.copy2(provision, assets / 'cert.mobileprovision')
        (assets / 'cert.txt').write_text(password, encoding='utf-8')
        result = subprocess.run([
            'zsign', '-q', '-f', '-k', str(certificate), '-p', password,
            '-m', str(provision), '-b', bundle_id,
            str(app),
        ], cwd=tmp, capture_output=True, check=False, timeout=180)
        if result.returncode:
            # zsign can print the password in its banner. Never return its raw output.
            raise ValueError('zsign không ký được CSign; kiểm tra mật khẩu và cặp chứng chỉ/profile.')
        # zsign also replaces signed binaries with new files, losing their modes.
        for filename, mode in original_modes.items():
            resource = tmp / filename
            if resource.exists() and not resource.is_symlink() and mode & 0o777:
                resource.chmod(mode & 0o777)
        (app / info['CFBundleExecutable']).chmod(0o755)
        staged = tmp / 'signed.ipa'
        # This zsign build drops UNIX modes when it writes a ZIP. Package the signed
        # folder ourselves so iOS gets an executable binary and intact symlinks.
        with zipfile.ZipFile(staged, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.write(app.parent, 'Payload/')
            archive.write(app, 'Payload/CSign.app/')
            for resource in sorted(app.rglob('*')):
                name = 'Payload/CSign.app/' + resource.relative_to(app).as_posix()
                if resource.is_symlink():
                    item = zipfile.ZipInfo(name)
                    item.create_system = 3
                    item.external_attr = resource.lstat().st_mode << 16
                    item.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(item, os.readlink(resource).encode('utf-8'))
                else:
                    archive.write(resource, name)
        with zipfile.ZipFile(staged) as archive:
            if archive.testzip() is not None:
                raise ValueError('IPA sau ký bị hỏng.')
            signed_info = plistlib.loads(archive.read('Payload/CSign.app/Info.plist'))
            executable = archive.getinfo('Payload/CSign.app/' + signed_info['CFBundleExecutable'])
            if not executable.external_attr >> 16 & stat.S_IXUSR:
                raise ValueError('IPA bị thiếu quyền thực thi của CSign.')
            if signed_info['CFBundleIdentifier'] != bundle_id:
                raise ValueError('Bundle ID của IPA không khớp provisioning profile.')
            if archive.read('Payload/CSign.app/embedded.mobileprovision') != provision.read_bytes():
                raise ValueError('Provisioning profile không được nhúng đúng vào IPA.')
            for filename in ['cert.p12', 'cert.mobileprovision', 'cert.txt']:
                expected = (assets / filename).read_bytes()
                if archive.read(f'Payload/CSign.app/signing-assets/{safe_name}/{filename}') != expected:
                    raise ValueError('Chứng chỉ tích hợp trong CSign không khớp.')
        os.replace(staged, output)
    return {'bundleId': bundle_id, 'bundleVersion': str(info['CFBundleVersion']),
            'version': info['CFBundleShortVersionString'], 'size': output.stat().st_size,
            'expiration': profile['ExpirationDate'].isoformat(),
            'allDevices': bool(profile.get('ProvisionsAllDevices'))}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['template', 'certificate', 'provision', 'output', 'bundle-id', 'cert-name']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--udid')
    args = parser.parse_args()
    try:
        print(json.dumps(sign(args)))
    except subprocess.TimeoutExpired:
        print('Ký CSign quá thời gian cho phép; hãy thử lại.', file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
