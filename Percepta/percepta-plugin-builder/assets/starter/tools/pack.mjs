import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {crc32,readPluginZip} from '../compat/zip-node.mjs';
import {pluginPath,PLUGIN_LIMITS} from '../compat/manifest.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=JSON.parse(await fs.readFile(path.join(root,'plugin.files.json'),'utf8'));
if(!Array.isArray(files)||!files.length||files.length>PLUGIN_LIMITS.files||files.some(name=>typeof name!=='string'))throw Error('Invalid plugin.files.json allowlist.');
const rows=[];let total=0;
for(const name of [...files].sort()){
  pluginPath(name);let cursor=root;
  for(const part of name.split('/')){if(part.startsWith('.'))throw Error('Hidden release path is forbidden: '+name);cursor=path.join(cursor,part);const info=await fs.lstat(cursor);if(info.isSymbolicLink())throw Error('Symlinks are forbidden: '+name);}
  const info=await fs.stat(cursor);if(!info.isFile()||info.size>PLUGIN_LIMITS.fileBytes||(total+=info.size)>PLUGIN_LIMITS.totalBytes)throw Error('Release file budget exceeded: '+name);
  rows.push({name,bytes:await fs.readFile(cursor)});
}
// Stable ordinary stored ZIP. No timestamps, permissions or wrapper directory vary by machine.
const locals=[],centrals=[];let offset=0;
for(const row of rows){
  const name=Buffer.from(row.name,'utf8'),crc=crc32(row.bytes),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(row.bytes.length,18);local.writeUInt32LE(row.bytes.length,22);local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x0314,4);central.writeUInt16LE(20,6);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(row.bytes.length,20);central.writeUInt32LE(row.bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE((0o100644*65536)>>>0,38);central.writeUInt32LE(offset,42);
  locals.push(local,name,row.bytes);centrals.push(central,name);offset+=local.length+name.length+row.bytes.length;
}
const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(rows.length,8);end.writeUInt16LE(rows.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...locals,directory,end]),checked=readPluginZip(archive),dist=path.join(root,'dist'),filename=checked.manifest.id+'-'+checked.manifest.version+'.zip',output=path.join(dist,filename);
await fs.mkdir(dist,{recursive:true});
try{await fs.writeFile(output,archive,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const old=await fs.readFile(output);if(!archive.equals(old))throw Error('Release bytes changed at an existing version. Bump plugin.json version; do not overwrite '+filename);}
const receipt={format:'percepta.plugin-package-receipt',version:'1.0.0',pluginId:checked.manifest.id,pluginVersion:checked.manifest.version,sdkVersion:checked.manifest.sdkVersion,manifestVersion:checked.manifest.manifestVersion,zip:filename,sha256:checked.hash,archiveBytes:archive.length,expandedBytes:checked.totalBytes,files:[...checked.files].map(([name,item])=>({name,bytes:item.size,sha256:item.sha256})),scope:'Package validation only. Install/SDK/native/UI/lifecycle acceptance must be tested separately.'};
await fs.writeFile(path.join(dist,filename+'.receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({zip:output,sha256:checked.hash,files:checked.files.size,bytes:archive.length},null,2));
