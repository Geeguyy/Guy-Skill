#!/usr/bin/env python3
"""Behavioral checks for copy integrity, deduplication, chronology, and recovery."""
import base64
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from build_journey import build
from recover_history import recover


class JourneyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='journey-test-')
        self.root = Path(self.temp.name)
        self.image = self.root / 'first.png'
        Image.new('RGB', (400, 260), '#275549').save(self.image)

    def tearDown(self):
        self.temp.cleanup()

    def manifest(self, rows):
        path = self.root / 'manifest.json'
        path.write_text(json.dumps({'title': 'Example journey', 'items': rows}), encoding='utf-8')
        return path

    def test_exact_duplicates_merge_origins_and_highlight_metadata(self):
        duplicate = self.root / 'copy.png'
        duplicate.write_bytes(self.image.read_bytes())
        before = hashlib.sha256(self.image.read_bytes()).hexdigest()
        manifest = self.manifest([
            {'file': str(self.image), 'title': 'Generic filename', 'timestamp': '2026-10-23T02:00:00Z', 'time_basis': 'filename'},
            {'file': str(duplicate), 'title': 'First working editor', 'caption': 'Visible iteration',
             'highlight': True, 'timestamp': '2026-10-21T22:00:00+07:00', 'time_basis': 'event'}])
        out = self.root / 'journey'
        report = build(manifest, out, 'Asia/Bangkok')
        self.assertEqual((report['unique_images'], report['highlights'], report['exact_duplicates_merged']), (1, 1, 1))
        row = json.loads((out / '04-Manifest/catalog.json').read_text())[0]
        self.assertEqual(row['title'], 'First working editor')
        self.assertEqual(row['time'], '2026-10-21T22:00:00+07:00')
        self.assertEqual(row['origin_count'], 2)
        self.assertEqual(hashlib.sha256((out / row['file']).read_bytes()).hexdigest(), before)
        self.assertEqual(hashlib.sha256((out / row['highlight_file']).read_bytes()).hexdigest(), before)
        self.assertEqual(hashlib.sha256(self.image.read_bytes()).hexdigest(), before)

    def test_wrong_extension_is_corrected_without_reencoding(self):
        disguised = self.root / 'actually-jpeg.png'
        Image.new('RGB', (350, 240), '#59452b').save(disguised, format='JPEG')
        manifest = self.manifest([{'file': str(disguised)}])
        out = self.root / 'jpeg-journey'
        build(manifest, out, 'UTC')
        row = json.loads((out / '04-Manifest/catalog.json').read_text())[0]
        self.assertTrue(row['file'].endswith('.jpg'))
        self.assertEqual((out / row['file']).read_bytes(), disguised.read_bytes())
        self.assertEqual(row['time_basis'], 'file-mtime')

    def test_existing_output_and_invalid_images_are_preserved(self):
        out = self.root / 'existing'
        out.mkdir()
        sentinel = out / 'keep.txt'
        sentinel.write_text('keep')
        manifest = self.manifest([{'file': str(self.image)}])
        with self.assertRaises(ValueError):
            build(manifest, out, 'UTC')
        self.assertEqual(sentinel.read_text(), 'keep')
        invalid = self.root / 'corrupt.png'
        invalid.write_bytes(b'this is not an image')
        manifest = self.manifest([{'file': str(invalid)}])
        with self.assertRaises(OSError):
            build(manifest, self.root / 'failed-build', 'UTC')
        self.assertFalse((self.root / 'failed-build').exists())
        self.assertFalse(list(self.root.glob('failed-build.building-*')))

    def test_chronology_uses_instants_across_dst_offsets(self):
        other = self.root / 'other.png'
        Image.new('RGB', (400, 260), '#452b59').save(other)
        manifest = self.manifest([
            {'file': str(self.image), 'timestamp': '2026-11-01T01:10:00-05:00', 'time_basis': 'event'},
            {'file': str(other), 'timestamp': '2026-11-01T01:50:00-04:00', 'time_basis': 'event'}])
        out = self.root / 'dst'
        build(manifest, out, 'America/New_York')
        rows = json.loads((out / '04-Manifest/catalog.json').read_text())
        self.assertEqual(rows[0]['original_name'], 'other.png')

    def test_recovery_uses_image_blocks_and_explicit_qa_captures_only(self):
        url = 'data:image/png;base64,' + base64.b64encode(self.image.read_bytes()).decode()
        different = self.root / 'inherited.png'
        Image.new('RGB', (400, 260), '#aa1122').save(different)
        inherited_url = 'data:image/png;base64,' + base64.b64encode(different.read_bytes()).decode()
        image = {'type': 'input_image', 'image_url': url}
        records = [
            {'type': 'compacted', 'payload': {'replacement_history': [{'type': 'input_image', 'image_url': inherited_url}]}},
            {'type': 'response_item', 'timestamp': '2026-10-22T01:00:00+07:00',
             'payload': {'type': 'message', 'role': 'user', 'content': [image]}},
            {'type': 'response_item', 'payload': {'type': 'function_call', 'arguments': json.dumps({'image': inherited_url})}},
            {'type': 'response_item', 'timestamp': '2026-10-21T20:00:00Z',
             'payload': {'type': 'function_call_output', 'output': [image]}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant', 'content': [image]}},
            {'text': 'const icon = "' + inherited_url + '";'},
            {'dataUrl': url, 'at': '2026-10-21T19:00:00Z'}]
        history = self.root / 'session.jsonl'
        history.write_text('\n'.join(json.dumps(x) for x in records) + '\n', encoding='utf-8')
        out = self.root / 'recovered'
        report = recover([history], out)
        self.assertEqual((report['unique_images'], report['image_events']), (1, 3))
        row = json.loads((out / 'recovered-manifest.json').read_text())['items'][0]
        self.assertEqual(row['timestamp'], '2026-10-21T18:00:00+00:00')
        self.assertEqual(len(row['origins']), 3)
        self.assertEqual((out / row['file']).read_bytes(), self.image.read_bytes())
        self.assertTrue(report['classification_required'])


if __name__ == '__main__':
    unittest.main()
