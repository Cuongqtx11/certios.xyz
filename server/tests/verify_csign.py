"""Verify real IPA outputs: signed executable pages, CMS, resources and OTA metadata."""
import hashlib
from pathlib import Path
import plistlib
import struct
import subprocess
import sys
import tempfile
import zipfile


def macho_blob(data):
    assert data[:4] == b'\xcf\xfa\xed\xfe', 'Expected arm64 Mach-O'
    count = struct.unpack_from('<I', data, 16)[0]
    offset = 32
    for _ in range(count):
        command, size = struct.unpack_from('<II', data, offset)
        if command == 0x1D:
            begin, length = struct.unpack_from('<II', data, offset + 8)
            return data[begin:begin + length]
        offset += size
    raise AssertionError('Code signature missing')


def text_section(data):
    count = struct.unpack_from('<I', data, 16)[0]
    offset = 32
    for _ in range(count):
        command, size = struct.unpack_from('<II', data, offset)
        if command == 0x19:
            nsects = struct.unpack_from('<I', data, offset + 64)[0]
            for i in range(nsects):
                start = offset + 72 + i * 80
                if data[start:start + 16].rstrip(b'\0') == b'__text':
                    length = struct.unpack_from('<Q', data, start + 40)[0]
                    begin = struct.unpack_from('<I', data, start + 48)[0]
                    return data[begin:begin + length]
        offset += size
    raise AssertionError('Executable code missing')


def verify(ipa, source=None, manifest=None):
    with zipfile.ZipFile(ipa) as archive:
        assert archive.testzip() is None, 'ZIP CRC invalid'
        prefix = 'Payload/CSign.app/'
        info_bytes = archive.read(prefix + 'Info.plist')
        info = plistlib.loads(info_bytes)
        executable = archive.read(prefix + info['CFBundleExecutable'])
        assert archive.getinfo(prefix + info['CFBundleExecutable']).external_attr >> 16 & 0o111, 'Executable mode lost'
        if source:
            with zipfile.ZipFile(source) as original:
                assert text_section(executable) == text_section(original.read(prefix + 'CSign')), 'Not the new CSign executable'
        blob = macho_blob(executable)
        magic, length, count = struct.unpack_from('>III', blob)
        assert magic == 0xFADE0CC0
        slots = {}
        for index in range(count):
            kind, offset = struct.unpack_from('>II', blob, 12 + index * 8)
            size = struct.unpack_from('>I', blob, offset + 4)[0]
            slots[kind] = blob[offset:offset + size]
        directory = slots[0]
        hash_offset, ident_offset, special_count, page_count, code_limit = struct.unpack_from('>IIIII', directory, 16)
        hash_size, hash_type, _, page_power = struct.unpack_from('>BBBB', directory, 36)
        assert hash_type == 2 and hash_size == 32, 'Expected SHA256 code directory'
        page_size = 1 << page_power
        for page in range(page_count):
            expected = directory[hash_offset + page * hash_size:hash_offset + (page + 1) * hash_size]
            actual = hashlib.sha256(executable[page * page_size:min((page + 1) * page_size, code_limit)]).digest()
            assert expected == actual, 'Executable signature page mismatch'
        for slot, resource in [(1, info_bytes), (3, archive.read(prefix + '_CodeSignature/CodeResources'))]:
            assert directory[hash_offset - slot * hash_size:hash_offset - (slot - 1) * hash_size] == hashlib.sha256(resource).digest(), 'Special-slot hash mismatch'
        assert 0x10000 in slots, 'Certificate CMS missing'
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            (temp / 'signature.der').write_bytes(slots[0x10000][8:])
            (temp / 'directory').write_bytes(directory)
            result = subprocess.run(['openssl', 'cms', '-verify', '-binary', '-inform', 'DER',
                '-in', str(temp / 'signature.der'), '-content', str(temp / 'directory'), '-noverify', '-signer', str(temp / 'signer.pem')], capture_output=True)
            assert result.returncode == 0, 'CMS cryptographic signature invalid'
            signer = subprocess.run(['openssl', 'x509', '-in', str(temp / 'signer.pem'), '-outform', 'DER'], capture_output=True, check=True).stdout
        resources = plistlib.loads(archive.read(prefix + '_CodeSignature/CodeResources'))
        checked = 0
        for filename, item in resources.get('files2', {}).items():
            if isinstance(item, bytes):
                item = {'hash': item}
            if not isinstance(item, dict) or not any(key in item for key in ['hash', 'hash2']):
                continue
            content = archive.read(prefix + filename)
            for key, algorithm in [('hash', hashlib.sha1), ('hash2', hashlib.sha256)]:
                if key in item:
                    assert item[key] == algorithm(content).digest(), 'Resource hash mismatch: ' + filename
            checked += 1
        assert checked > 0
        profile_data = archive.read(prefix + 'embedded.mobileprovision')
        profile = subprocess.run(['openssl', 'cms', '-verify', '-inform', 'DER', '-noverify'], input=profile_data, capture_output=True)
        assert profile.returncode == 0
        profile = plistlib.loads(profile.stdout)
        assert signer in profile['DeveloperCertificates'], 'Signer not permitted by provisioning profile'
        entitlements = plistlib.loads(slots[5][8:])
        permitted_id = profile['Entitlements']['application-identifier']
        assert entitlements['application-identifier'] == permitted_id.split('.', 1)[0] + '.' + info['CFBundleIdentifier'], 'Signed app ID does not match profile'
        allowed = permitted_id.split('.', 1)[1]
        import fnmatch
        assert fnmatch.fnmatchcase(info['CFBundleIdentifier'], allowed)
        if manifest:
            item = plistlib.loads(Path(manifest).read_bytes())['items'][0]
            assert item['metadata']['bundle-identifier'] == info['CFBundleIdentifier']
            assert item['metadata']['bundle-version'] == str(info['CFBundleVersion'])
        print(f'PASS {Path(ipa).name}: new code, signed pages, CMS, {checked} resources, profile and manifest')


if __name__ == '__main__':
    verify(*sys.argv[1:])
