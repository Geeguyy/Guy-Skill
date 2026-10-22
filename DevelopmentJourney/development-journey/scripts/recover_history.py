#!/usr/bin/env python3
"""Recover actual embedded image blocks from explicitly selected JSONL logs."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import tempfile
from datetime import datetime, timezone

from PIL import Image

DATA_URL = re.compile(r'data:image/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)')
FORMATS = {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp', 'GIF': 'gif',
           'BMP': 'bmp', 'TIFF': 'tiff', 'AVIF': 'avif'}


def normal_time(value):
    try:
        if isinstance(value, (int, float)):
            value = value / 1000 if value > 100000000000 else value
            return datetime.fromtimestamp(value, timezone.utc).isoformat()
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return dt.astimezone(timezone.utc).isoformat() if dt.tzinfo is not None else None
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def image_blocks(obj, qa=False, depth=0):
    if depth > 40:
        return
    if isinstance(obj, list):
        for item in obj:
            yield from image_blocks(item, qa, depth + 1)
    elif isinstance(obj, dict):
        if obj.get('type') in {'input_image', 'image', 'image_url'}:
            url = obj.get('image_url', obj.get('url'))
            if isinstance(url, dict):
                url = url.get('url')
            if not url and str(obj.get('mimeType', '')).startswith('image/'):
                url = 'data:{};base64,{}'.format(obj['mimeType'], obj.get('data', ''))
            if isinstance(url, str):
                yield url, obj.get('type')
            return
        for key, value in obj.items():
            if qa and key in {'dataUrl', 'previewPng', 'screenshotDataUrl'} and isinstance(value, str):
                yield value, key
            elif isinstance(value, (dict, list)) and key not in {'arguments', 'input', 'tools'}:
                yield from image_blocks(value, qa, depth + 1)
            elif key in {'output', 'result'} and isinstance(value, str) and value[:1] in '[{':
                try:
                    parsed = json.loads(value)
                except ValueError:
                    continue
                yield from image_blocks(parsed, qa, depth + 1)


def recover(histories, output, title='Recovered development evidence'):
    output = Path(output).expanduser().absolute()
    if output.exists():
        raise ValueError('Output already exists; choose a new recovery folder.')
    inputs = [Path(p).expanduser().resolve(strict=True) for p in histories]
    output.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=output.name + '.recovering-', dir=str(output.parent)))
    images = work / 'images'
    images.mkdir()
    found, errors, events = {}, [], 0
    try:
        for path in inputs:
            calls = {}
            with path.open(encoding='utf-8') as src:
                for number, line in enumerate(src, 1):
                    try:
                        record = json.loads(line)
                    except ValueError:
                        errors.append({'source': str(path), 'line': number, 'error': 'Invalid JSON record'})
                        continue
                    if not isinstance(record, dict):
                        continue
                    typ = record.get('type')
                    if typ in {'compacted', 'session_meta', 'turn_context', 'event_msg'}:
                        continue
                    stamp = record.get('timestamp', record.get('at'))
                    role, tool = None, None
                    if typ == 'response_item':
                        payload = record.get('payload', {})
                        ptype = payload.get('type')
                        if ptype in {'function_call', 'custom_tool_call'}:
                            calls[payload.get('call_id')] = payload.get('name')
                            continue
                        if ptype == 'message' and payload.get('role') == 'user':
                            content = payload.get('content', [])
                            role = 'user-attachment'
                        elif ptype in {'function_call_output', 'custom_tool_call_output'}:
                            content = payload.get('output')
                            tool = calls.get(payload.get('call_id'))
                            role = 'tool-image'
                        else:
                            continue
                        blocks = image_blocks(content)
                    else:
                        # Explicit image capture fields in a QA record, not raw code data URIs.
                        blocks = image_blocks(record, qa=True)
                        role = 'qa-capture'
                    for url, field in blocks:
                        match = DATA_URL.fullmatch(url.strip())
                        if not match:
                            continue
                        if len(match[1]) > 90 * 1024 * 1024:
                            errors.append({'source': str(path), 'line': number, 'error': 'Image exceeds recovery limit'})
                            continue
                        try:
                            raw = base64.b64decode(re.sub(r'\s+', '', match[1]), validate=True)
                            with Image.open(io.BytesIO(raw)) as im:
                                fmt = im.format
                                im.verify()
                            ext = FORMATS.get(fmt)
                            if not ext:
                                raise ValueError('Unsupported image format')
                        except (ValueError, OSError, SyntaxError) as exc:
                            errors.append({'source': str(path), 'line': number, 'error': str(exc)})
                            continue
                        sha = hashlib.sha256(raw).hexdigest()
                        ts = normal_time(stamp)
                        origin = {'source': str(path), 'line': number, 'method': role, 'field': field}
                        if ts:
                            origin['timestamp'] = ts
                        if tool:
                            origin['tool'] = tool
                        if sha not in found:
                            rel = 'images/' + sha[:24] + '.' + ext
                            (work / rel).write_bytes(raw)
                            found[sha] = {'file': rel, 'title': 'Recovered image ' + sha[:10],
                                          'kind': 'reference' if role == 'user-attachment' else 'screenshot',
                                          'chapter': 'Recovered evidence — review before curation',
                                          'recovered': True, 'origins': []}
                        item = found[sha]
                        item['origins'].append(origin)
                        if ts and (not item.get('timestamp') or ts < item['timestamp']):
                            item.update(timestamp=ts, time_basis='event')
                        events += 1
        manifest = {'title': title, 'description': 'Draft recovery; review relevance, captions, and categories.',
                    'items': list(found.values())}
        (work / 'recovered-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        report = {'logs_scanned': len(inputs), 'image_events': events, 'unique_images': len(found),
                  'classification_required': True, 'errors': errors}
        (work / 'recovery-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        if output.exists():
            raise ValueError('Output was created during recovery; refusing to replace it.')
        work.rename(output)
        return dict(report, output=str(output))
    except BaseException:
        shutil.rmtree(work)
        raise


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--history', required=True, action='append')
    p.add_argument('--output', required=True)
    p.add_argument('--title', default='Recovered development evidence')
    args = p.parse_args()
    try:
        result = recover(args.history, args.output, args.title)
    except (OSError, ValueError) as exc:
        p.exit(1, 'History recovery failed: {}\n'.format(exc))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
