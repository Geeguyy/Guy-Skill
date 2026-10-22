#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build an offline development story from explicitly selected evidence."""
import argparse
import collections
import csv
import hashlib
import json
import math
from pathlib import Path
import shutil
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont, ImageOps

KINDS = {'screenshot', 'render', 'reference', 'video-frame', 'video'}
BASES = {'event', 'capture', 'filename', 'commit', 'unknown', 'file-mtime'}
RANK = {'capture': 0, 'event': 0, 'filename': 1, 'commit': 2, 'unknown': 3, 'file-mtime': 4}


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def timestamp(item, source, tz):
    raw = item.get('timestamp')
    naive = False
    if raw is None:
        dt = datetime.fromtimestamp(source.stat().st_mtime, tz)
        basis = 'file-mtime'
    else:
        dt = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
        naive = dt.tzinfo is None
        if naive:
            dt = dt.replace(tzinfo=tz)
        basis = item.get('time_basis', 'unknown')
    if basis not in BASES:
        raise ValueError('Unsupported time_basis: ' + str(basis))
    return dt.astimezone(tz).isoformat(timespec='seconds'), basis, naive


def font(size):
    choices = ['/System/Library/Fonts/Menlo.ttc',
               '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for name in choices:
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def preview(path, bounds):
    with Image.open(path) as src:
        im = ImageOps.exif_transpose(src).convert('RGBA')
        im.thumbnail(bounds)
        bg = Image.new('RGBA', im.size, '#161d1d')
        bg.alpha_composite(im)
        return bg.convert('RGB')


def make_sheets(work, images):
    folder = work / '05-Contact-Sheets'
    folder.mkdir(exist_ok=True)
    index = []
    for page in range(math.ceil(len(images) / 30)):
        sheet = Image.new('RGB', (1500, 1320), '#e8e5df')
        draw = ImageDraw.Draw(sheet)
        for j, row in enumerate(images[page * 30:(page + 1) * 30]):
            x, y = (j % 5) * 300, (j // 5) * 220
            im = preview(work / row['file'], (292, 184))
            sheet.paste(im, (x + (300 - im.width) // 2, y))
            text = '{:04d} {}\n{}'.format(page * 30 + j + 1, row['time'][:16], row['sha256'][:16])
            draw.text((x + 5, y + 186), text, font=font(12), fill='#181c1d')
            index.append({'number': page * 30 + j + 1, 'sheet': 'contact-{:02d}.jpg'.format(page + 1),
                          'file': row['file'], 'sha256': row['sha256']})
        sheet.save(folder / 'contact-{:02d}.jpg'.format(page + 1), quality=87)
    return index


def make_overview(work, selected):
    # Sample across the entire story so later stages are represented.
    if len(selected) > 6:
        selected = [selected[round(i * (len(selected) - 1) / 5)] for i in range(6)]
    rows = max(1, math.ceil(len(selected) / 2))
    canvas = Image.new('RGB', (1800, 145 + rows * 520), '#141718')
    draw = ImageDraw.Draw(canvas)
    draw.text((30, 24), 'DEVELOPMENT JOURNEY', font=font(42), fill='#efeee9')
    draw.text((33, 88), 'SURVIVING EVIDENCE / CHRONOLOGICAL MILESTONES', font=font(19), fill='#bbcbbb')
    for i, row in enumerate(selected):
        x, y = (i % 2) * 900 + 20, (i // 2) * 520 + 145
        im = preview(work / row['file'], (850, 435))
        canvas.paste(im, (x + (860 - im.width) // 2, y + (435 - im.height) // 2))
        draw.text((x + 8, y + 448), '{:02d} / {}'.format(i + 1, row['kind'].upper()),
                  font=font(20), fill='#f3b17a')
        draw.text((x + 8, y + 480), row['time'][:16].replace('T', ' '), font=font(18), fill='#aab3af')
    canvas.save(work / '00-JOURNEY-OVERVIEW.jpg', quality=91)


def dump_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def build(manifest, output, timezone):
    manifest = Path(manifest).expanduser().resolve(strict=True)
    output = Path(output).expanduser().absolute()
    if output.exists():
        raise ValueError('Output already exists; choose a new archive version: ' + str(output))
    spec = json.loads(manifest.read_text(encoding='utf-8-sig'))
    if not isinstance(spec, dict) or not isinstance(spec.get('items'), list) or not spec['items']:
        raise ValueError('Manifest requires a nonempty items list.')
    tz = ZoneInfo(timezone)
    title = str(spec.get('title') or 'Development Journey')
    output.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=output.name + '.building-', dir=str(output.parent)))
    try:
        for name in ['01-Story-Highlights', '02-Journey-Images', '03-Videos', '04-Manifest',
                     '05-Contact-Sheets/thumbnails']:
            (work / name).mkdir(parents=True, exist_ok=True)
        records, provenance, warnings = {}, [], []
        for order, item in enumerate(spec['items']):
            if not isinstance(item, dict) or not item.get('file'):
                raise ValueError('Each item requires a file path.')
            kind = item.get('kind', 'screenshot')
            if kind not in KINDS:
                raise ValueError('Unsupported kind: ' + str(kind))
            source = Path(item['file']).expanduser()
            if not source.is_absolute():
                source = manifest.parent / source
            source = source.resolve(strict=True)
            if not source.is_file():
                raise ValueError('Not a file: ' + str(source))
            ts, basis, naive = timestamp(item, source, tz)
            if naive:
                warnings.append('Interpreted timezone for item {} as {}'.format(order + 1, timezone))
            candidate = work / ('source-' + str(order))
            shutil.copyfile(source, candidate)
            sha = digest(candidate)
            origins = item.get('origins') or [{'source': str(source), 'method': 'project-file'}]
            if not isinstance(origins, list) or not all(isinstance(o, dict) for o in origins):
                raise ValueError('origins must be a list of objects.')
            origins = [dict(o, input_file=str(source), timestamp=ts, time_basis=basis) for o in origins]
            if kind == 'video-frame' and item.get('recording'):
                origins.append({'source': item['recording'], 'method': 'video-frame',
                                'offset_seconds': item.get('offset_seconds')})
            for origin in origins:
                provenance.append(dict(origin, sha256=sha))
            if sha in records:
                row = records[sha]
                candidate.unlink()
                if kind != row['kind']:
                    row.setdefault('alternate_kinds', []).append(kind)
                row['origins'].extend(origins)
                row['recovered'] = row['recovered'] or bool(item.get('recovered'))
                if item.get('highlight'):
                    row['highlight'] = row['kind'] != 'video'
                    for key in ['title', 'caption', 'chapter']:
                        if item.get(key):
                            row[key] = str(item[key])
                if (RANK[basis], datetime.fromisoformat(ts).timestamp()) < (RANK[row['time_basis']], datetime.fromisoformat(row['time']).timestamp()):
                    row['time'], row['time_basis'] = ts, basis
                continue
            if kind == 'video':
                ext = source.suffix.lower().lstrip('.')
                if ext not in {'mov', 'mp4', 'm4v', 'webm', 'avi', 'mkv'}:
                    raise ValueError('Unsupported recording extension: ' + source.suffix)
                width = height = 0
                fmt = ext.upper()
            else:
                with Image.open(candidate) as im:
                    width, height = im.size
                    fmt = im.format
                    im.verify()
                ext = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp', 'GIF': 'gif',
                       'BMP': 'bmp', 'TIFF': 'tiff', 'AVIF': 'avif'}.get(fmt)
                if not ext:
                    raise ValueError('Unsupported image format: ' + str(fmt))
            rel = ('03-Videos/' if kind == 'video' else '02-Journey-Images/') + sha[:24] + '.' + ext
            candidate.rename(work / rel)
            records[sha] = {'sha256': sha, 'file': rel, 'original_name': source.name,
                            'kind': kind, 'title': str(item.get('title') or source.stem),
                            'caption': str(item.get('caption') or ''),
                            'chapter': str(item.get('chapter') or 'Development'),
                            'time': ts, 'time_basis': basis, 'width': width, 'height': height,
                            'format': fmt, 'size': (work / rel).stat().st_size,
                            'highlight': bool(item.get('highlight')) and kind != 'video',
                            'recovered': bool(item.get('recovered')), 'origins': origins,
                            '_order': order}
        catalog = sorted(records.values(), key=lambda r: (datetime.fromisoformat(r['time']).timestamp(), r['_order']))
        images = [r for r in catalog if r['kind'] != 'video']
        if not images:
            raise ValueError('A visual Journey requires at least one image.')
        highlights = [r for r in images if r['highlight']]
        for row in catalog:
            row.pop('_order')
            row['origin_count'] = len(row['origins'])
            row['source'] = str(row['origins'][0].get('source', row['original_name']))
            if row['kind'] != 'video':
                rel = '05-Contact-Sheets/thumbnails/' + row['sha256'][:24] + '.jpg'
                preview(work / row['file'], (680, 420)).save(work / rel, quality=83)
                row['thumb'] = rel
        for n, row in enumerate(highlights, 1):
            name = '{:03d}--{}--{}{}'.format(n, row['time'][:10], row['sha256'][:12], Path(row['file']).suffix)
            rel = '01-Story-Highlights/' + name
            shutil.copyfile(work / row['file'], work / rel)
            row['highlight_file'] = rel
        meta = work / '04-Manifest'
        sheet_index = make_sheets(work, images)
        make_overview(work, highlights or images)
        dump_json(meta / 'catalog.json', catalog)
        dump_json(meta / 'contact-sheet-index.json', sheet_index)
        with (meta / 'all-origins.jsonl').open('w', encoding='utf-8') as f:
            for row in provenance:
                f.write(json.dumps(row, ensure_ascii=False) + '\n')
        fields = ['file', 'title', 'caption', 'kind', 'chapter', 'time', 'time_basis', 'width',
                  'height', 'sha256', 'origin_count', 'source']
        for filename, rows in [('all-images.csv', catalog), ('story-captions.csv', highlights)]:
            with (meta / filename).open('w', newline='', encoding='utf-8-sig') as f:
                w = csv.DictWriter(f, fieldnames=(['order', 'highlight_file'] if rows is highlights else []) + fields,
                                   extrasaction='ignore')
                w.writeheader()
                for n, row in enumerate(rows, 1):
                    w.writerow(dict(row, order=n))
        template = Path(__file__).resolve().parent.parent / 'assets' / 'gallery.html'
        shutil.copyfile(template, work / '00-START-HERE.html')
        compact = [{k: v for k, v in r.items() if k != 'origins'} for r in catalog]
        data = {'title': title, 'description': str(spec.get('description') or ''),
                'timezone': timezone, 'items': compact}
        (work / 'data.js').write_text('window.JOURNEY=' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
        # Verify the actual archived bytes, including numbered editing copies.
        for row in catalog:
            if digest(work / row['file']) != row['sha256']:
                raise ValueError('Archived hash verification failed: ' + row['file'])
            if row.get('highlight_file') and digest(work / row['highlight_file']) != row['sha256']:
                raise ValueError('Highlight hash verification failed.')
        report = {'result': 'PASS', 'title': title, 'timezone': timezone, 'input_items': len(spec['items']),
                  'unique_images': len(images), 'highlights': len(highlights),
                  'videos': len(catalog) - len(images), 'exact_duplicates_merged': len(spec['items']) - len(catalog),
                  'recovered_images': sum(bool(r['recovered']) for r in images),
                  'groups': dict(collections.Counter(r['kind'] for r in catalog)),
                  'contact_sheets': math.ceil(len(images) / 30), 'all_original_hashes_verified': True,
                  'all_highlight_hashes_verified': True, 'image_readability_verified': True,
                  'video_codecs_verified': False, 'browser_render_verified': False, 'warnings': warnings}
        dump_json(meta / 'VERIFICATION.json', report)
        (work / 'README-TH.txt').write_text(
            '{}\n\nเปิด 00-START-HERE.html ด้วย browser บนเครื่อง ไม่ต้องเปิด server\n'
            '{} ภาพไม่ซ้ำ / {} ภาพคัดเล่าเรื่อง / {} วิดีโอ\n'
            '01-Story-Highlights: ภาพเรียงลำดับสำหรับตัดต่อ\n'
            '04-Manifest: คำบรรยาย CSV, แหล่งที่มา, hashes และผลตรวจ\n'
            '05-Contact-Sheets: ภาพรวมหลายภาพต่อหน้า\n\n'
            'ภาพต้นฉบับไม่เปลี่ยน bytes ตัดซ้ำเฉพาะ SHA-256 ตรงกัน\n'
            'เวลา file-mtime คือเวลาแก้ไขไฟล์ ไม่ยืนยันเวลาถ่าย\n'
            'ภาพอ้างอิงและเฟรมวิดีโอติดหมวดแยก ไม่สร้างภาพย้อนหลังแทนหลักฐานที่หาย\n'
            'ผลตรวจไฟล์ไม่ใช่ผลตรวจ browser render หรือการรับรองฟีเจอร์ของโปรเจกต์\n'.format(
                title, len(images), len(highlights), len(catalog) - len(images)), encoding='utf-8')
        if output.exists():
            raise ValueError('Output was created during the build; refusing to replace it.')
        work.rename(output)
        return dict(report, output=str(output))
    except BaseException:
        shutil.rmtree(work)
        raise


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--timezone', default='UTC')
    args = p.parse_args()
    try:
        result = build(args.manifest, args.output, args.timezone)
    except (ValueError, OSError, KeyError) as exc:
        p.exit(1, 'Journey build failed: {}\n'.format(exc))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
