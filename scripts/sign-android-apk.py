#!/usr/bin/env python3
"""Prepare a Builder APK for Sugo automation and sign it with Android SDK tools."""

import argparse
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import zipfile


PERMISSION = 'android.permission.ACCESS_MOCK_LOCATION'
SUGO_PACKAGE = 'com.voicemaker.android'
MANIFEST = 'AndroidManifest.xml'
PROJECT = 'assets/project/project.json'
LOCATION = 'assets/project/lib/location.js'


def u16(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def u32(data, offset):
    return struct.unpack_from('<I', data, offset)[0]


def put32(data, offset, value):
    struct.pack_into('<I', data, offset, value)


def chunks(data):
    offset = u16(data, 2)
    while offset < len(data):
        size = u32(data, offset + 4)
        if size < 8 or offset + size > len(data):
            raise ValueError('Geçersiz Android manifest parçası')
        yield data[offset:offset + size]
        offset += size


class StringPool:
    def __init__(self, data):
        self.data = data
        self.header = u16(data, 2)
        self.count, self.styles, self.flags, self.start, self.style_start = struct.unpack_from('<5I', data, 8)

    def get(self, index):
        pos = self.start + u32(self.data, self.header + index * 4)
        if self.flags & 0x100:
            pos += 2 if self.data[pos] & 0x80 else 1
            length = self.data[pos]
            pos += 1
            if length & 0x80:
                length = ((length & 0x7f) << 8) | self.data[pos]
                pos += 1
            return self.data[pos:pos + length].decode('utf-8')
        length = u16(self.data, pos)
        pos += 2
        if length & 0x8000:
            length = ((length & 0x7fff) << 16) | u16(self.data, pos)
            pos += 2
        return self.data[pos:pos + 2 * length].decode('utf-16le')

    def append(self, text):
        # Both manifest declarations use short ASCII strings.
        length = len(text)
        if self.flags & 0x100:
            encoded = bytes([length, length]) + text.encode() + b'\0'
        else:
            encoded = struct.pack('<H', length) + text.encode('utf-16le') + b'\0\0'
        strings_end = self.style_start or len(self.data)
        strings = self.data[self.start:strings_end]
        extra = encoded + bytes(-len(encoded) % 4)
        offsets_end = self.header + self.count * 4
        result = bytearray(self.data[:offsets_end] + struct.pack('<I', len(strings))
                           + self.data[offsets_end:self.start] + strings + extra + self.data[strings_end:])
        put32(result, 4, len(result))
        put32(result, 8, self.count + 1)
        put32(result, 16, self.flags & ~1)
        put32(result, 20, self.start + 4)
        if self.style_start:
            put32(result, 24, self.style_start + 4 + len(extra))
        return result


def add_named_node(manifest, parent, element, existing, added):
    parts = list(chunks(manifest))
    if u16(manifest, 0) != 3 or not parts or u16(parts[0], 0) != 1:
        raise ValueError('İkili Android manifest bekleniyor')
    pool = StringPool(parts[0])
    ancestors = []
    example = None
    for index, part in enumerate(parts):
        kind = u16(part, 0)
        if kind == 0x0103:
            ancestors.pop()
        if kind != 0x0102:
            continue
        ancestors.append(pool.get(u32(part, 20)))
        if ancestors != [*parent, element]:
            continue
        start, size, count = struct.unpack_from('<HHH', part, 24)
        for offset in range(16 + start, 16 + start + size * count, size):
            namespace, name = struct.unpack_from('<II', part, offset)
            if namespace == 0xffffffff or pool.get(namespace) != 'http://schemas.android.com/apk/res/android':
                continue
            if pool.get(name) != 'name' or part[offset + 15] != 3:
                continue
            value = pool.get(u32(part, offset + 16))
            if value == added:
                return manifest
            if value == existing and count == 1:
                example = index, offset
    if example is None:
        raise ValueError(f'Manifest içinde örnek {element} girdisi bulunamadı')
    index, offset = example
    if u16(parts[index + 1], 0) != 0x0103:
        raise ValueError(f'Beklenmeyen {element} manifest yapısı')
    start = bytearray(parts[index])
    put32(start, offset + 8, pool.count)
    put32(start, offset + 16, pool.count)
    parts[0] = pool.append(added)
    parts[index:index] = [start, parts[index + 1]]
    result = bytearray(manifest[:u16(manifest, 2)] + b''.join(parts))
    put32(result, 4, len(result))
    return result


def patch_manifest(manifest):
    manifest = add_named_node(manifest, ['manifest'], 'uses-permission', 'android.permission.INTERNET', PERMISSION)
    return add_named_node(manifest, ['manifest', 'queries'], 'package', 'org.autojs.autojs6', SUGO_PACKAGE)


def patch_project(data):
    project = json.loads(data)
    launch = project.setdefault('launchConfig', {})
    if launch.get('requiresSharedStorage') is False:
        return data
    launch['requiresSharedStorage'] = False
    return (json.dumps(project, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def prepare(source, target):
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w') as output:
        members = set(original.namelist())
        if PROJECT not in members:
            raise ValueError('APK içinde AutoJs6 proje ayarları bulunamadı')
        if LOCATION not in members:
            raise ValueError('APK içinde konum modülü (lib/location.js) bulunamadı. Güncel projeyi paketleyin.')
        for entry in original.infolist():
            name = entry.filename
            upper = name.upper()
            if upper.startswith('META-INF/') and (
                upper.endswith(('.SF', '.RSA', '.DSA', '.EC', '/MANIFEST.MF')) or upper.startswith('META-INF/SIG-')
            ):
                continue
            data = original.read(entry)
            if name == MANIFEST:
                data = patch_manifest(data)
            elif name == PROJECT:
                data = patch_project(data)
            output.writestr(entry, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--build-tools', type=Path, required=True)
    parser.add_argument('--keystore', type=Path, required=True)
    parser.add_argument('--alias')
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error('Girdi ve çıktı farklı dosyalar olmalı')
    if args.output.exists():
        parser.error('Çıktı zaten var')

    def sdk(tool, *options, **kwargs):
        return subprocess.run([str(args.build_tools.resolve() / tool), *map(str, options)], check=True, **kwargs)

    with tempfile.TemporaryDirectory(dir=args.output.resolve().parent) as directory:
        unsigned, aligned, signed = (Path(directory) / name for name in ('unsigned.apk', 'aligned.apk', 'signed.apk'))
        prepare(args.input, unsigned)
        sdk('zipalign', '-P', 16, 4, unsigned, aligned)
        signing = ['--ks', args.keystore]
        if args.alias:
            signing.extend(['--ks-key-alias', args.alias])
        for flag, variable in (('--ks-pass', 'SUGO_APK_STORE_PASSWORD'), ('--key-pass', 'SUGO_APK_KEY_PASSWORD')):
            if variable in os.environ:
                signing.extend([flag, 'env:' + variable])
        sdk('apksigner', 'sign', *signing, '--out', signed, aligned)
        sdk('apksigner', 'verify', signed)
        manifest = sdk('aapt', 'dump', 'permissions', signed, capture_output=True, text=True).stdout
        if "uses-permission: name='" + PERMISSION + "'" not in manifest:
            raise ValueError('APK manifest’inde test konumu izni doğrulanamadı')
        with zipfile.ZipFile(signed) as apk:
            if json.loads(apk.read(PROJECT))['launchConfig']['requiresSharedStorage'] is not False:
                raise ValueError('APK açılışında paylaşılan depolama gereksinimi kapatılamadı')
        signed.rename(args.output)


if __name__ == '__main__':
    main()
