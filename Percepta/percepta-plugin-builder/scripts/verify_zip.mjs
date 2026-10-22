import fs from 'node:fs/promises';
import {readPluginZip} from '../assets/starter/compat/zip-node.mjs';

if(process.argv.length!==3)throw Error('Usage: node scripts/verify_zip.mjs /path/to/plugin.zip');
const checked=readPluginZip(await fs.readFile(process.argv[2]));
console.log(JSON.stringify({valid:true,manifest:checked.manifest,sha256:checked.hash,archiveBytes:checked.archiveBytes,expandedBytes:checked.totalBytes,files:[...checked.files.keys()],scope:'ZIP and manifest validity only; SDK/native/UI behavior is not certified.'},null,2));
