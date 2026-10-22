#!/usr/bin/env python3
"""Create an independent plugin project. Uses only this portable skill and Python stdlib."""
import argparse
import json
from pathlib import Path
import re
import shutil

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--id', required=True, help='Unique stable plugin identity, e.g. acme.my-tool')
    parser.add_argument('--name', required=True)
    parser.add_argument('--version', default='0.1.0')
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*', args.id) or len(args.id) > 80:
        parser.error('Use a lowercase portable plugin ID, at most80 characters.')
    if not re.fullmatch(r'(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})', args.version):
        parser.error('Use exact numeric major.minor.patch with no leading zeros.')
    if not args.name.strip() or len(args.name.encode('utf-16-le'))//2 > 80 or any(ord(c) < 32 or ord(c) == 127 for c in args.name):
        parser.error('Name must be nonempty, at most80 UTF-16 units, without control characters.')
    target = args.out.expanduser().absolute()
    if target.exists():
        parser.error('Output already exists; choose a new directory. Existing work is never overwritten.')
    source = Path(__file__).resolve().parents[1] / 'assets' / 'starter'
    shutil.copytree(source, target)
    manifest_path = target/'plugin.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest.update(id=args.id, name=args.name, version=args.version)
    manifest['contribution']['label'] = args.name
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    package_path = target/'package.json'
    package = json.loads(package_path.read_text(encoding='utf-8'))
    package.update(name=args.id, version=args.version)
    package_path.write_text(json.dumps(package, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'project':str(target),'next':['npm test','npm run package'],'install':'Percepta → Plugins → Install ZIP → dist/'+args.id+'-'+args.version+'.zip'},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
