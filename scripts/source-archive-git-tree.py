#!/usr/bin/env python3
"""Compute a Git tree ID from a rootless source tar without extracting it.

For Gitiles archives with no submodules or generated/export-substituted files.
Reject unsupported entry types; preserve file bytes, executable bits and symlinks.
"""
import hashlib
from pathlib import PurePosixPath
import sys
import tarfile


def object_id(kind, data):
    return hashlib.sha1(kind + b' ' + str(len(data)).encode() + b'\0' + data).digest()


def archive_tree(filename):
    tree = {}
    with tarfile.open(filename, 'r:*') as tar:
        for member in tar:
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Unsafe archive path')
            if member.isdir():
                continue
            if member.isfile():
                mode = b'100755' if member.mode & 0o111 else b'100644'
                data = tar.extractfile(member).read()
            elif member.issym():
                mode, data = b'120000', member.linkname.encode()
            else:
                raise ValueError(f'Unsupported entry type: {member.name}')
            parent = tree
            for part in path.parts[:-1]:
                parent = parent.setdefault(part, {})
            if path.name in parent:
                raise ValueError(f'Duplicate archive entry: {member.name}')
            parent[path.name] = (mode, object_id(b'blob', data))

    def digest_tree(node):
        entries = []
        for name, value in node.items():
            directory = isinstance(value, dict)
            mode, digest = (b'40000', digest_tree(value)) if directory else value
            key = name.encode() + (b'/' if directory else b'')
            entries.append((key, mode + b' ' + name.encode() + b'\0' + digest))
        return object_id(b'tree', b''.join(value for _, value in sorted(entries)))

    return digest_tree(tree).hex()


if __name__ == '__main__':
    print(archive_tree(sys.argv[1]))
