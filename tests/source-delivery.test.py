"""Ensure source-delivery verification rejects corruption and unsafe members."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'delivery', Path(__file__).resolve().parents[1] / 'scripts/prepare-electron-source-delivery.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


class VerifyBundleTests(unittest.TestCase):
    def bundle(self, directory, change=None):
        files = {'STATUS.json': b'{"completeCorrespondingSource":false}',
                 'archives/source.txt': b'original source'}
        manifest = {'files': [{'path': name, 'bytes': len(data),
                               'sha256': hashlib.sha256(data).hexdigest()}
                              for name, data in files.items()]}
        files['MANIFEST.json'] = json.dumps(manifest).encode()
        if change:
            change(files)
        path = Path(directory) / 'bundle.tar.gz'
        with tarfile.open(path, 'w:gz') as archive:
            for name, data in files.items():
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        return path

    def test_valid_bundle_is_not_completeness_certification(self):
        with tempfile.TemporaryDirectory() as directory:
            result = delivery.verify(self.bundle(directory))
            self.assertFalse(result['completeCorrespondingSource'])

    def test_modified_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.bundle(directory, lambda f: f.update({'archives/source.txt': b'modified source'}))
            with self.assertRaisesRegex(ValueError, 'Content mismatch'):
                delivery.verify(archive)

    def test_missing_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.bundle(directory, lambda f: f.pop('archives/source.txt'))
            with self.assertRaisesRegex(ValueError, 'member set mismatch'):
                delivery.verify(archive)

    def test_unlisted_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.bundle(directory, lambda f: f.update({'unexpected.txt': b'x'}))
            with self.assertRaisesRegex(ValueError, 'member set mismatch'):
                delivery.verify(archive)

    def test_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.bundle(directory, lambda f: f.update({'../outside': b'x'}))
            with self.assertRaisesRegex(ValueError, 'Unsafe member'):
                delivery.verify(archive)


if __name__ == '__main__':
    unittest.main()
