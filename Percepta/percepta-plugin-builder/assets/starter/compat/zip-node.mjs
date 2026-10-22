import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {PLUGIN_LIMITS,pluginError,pluginPath,parsePluginManifest} from './manifest.mjs';

const table=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(bytes,at,size)=>Number.isSafeInteger(at)&&Number.isSafeInteger(size)&&at>=0&&size>=0&&at+size<=bytes.length;
function extra(bytes,start,length){
 let at=start;const end=start+length;
 while(at<end){if(at+4>end)pluginError('ZIP_EXTRA');const id=bytes.readUInt16LE(at),size=bytes.readUInt16LE(at+2);at+=4;if(at+size>end||id===1)pluginError('ZIP_EXTRA');at+=size;}
}

/** Parse and verify before touching disk. Supports ordinary stored/deflated ZIPs, not ZIP64/encryption. */
export function readPluginZip(input){
 if(!(input instanceof Uint8Array)||input.length<22||input.length>PLUGIN_LIMITS.archiveBytes)pluginError('ZIP_SIZE');
 const bytes=Buffer.from(input);let end=-1;
 for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50&&at+22+bytes.readUInt16LE(at+20)===bytes.length){end=at;break;}
 if(end<0)pluginError('ZIP_END');
 const count=bytes.readUInt16LE(end+10),centralSize=bytes.readUInt32LE(end+12),centralOffset=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0||bytes.readUInt16LE(end+8)!==count||count<1||count>PLUGIN_LIMITS.files||count===0xffff||centralOffset+centralSize!==end)pluginError('ZIP_DIRECTORY');
 const entries=[],names=new Set();let at=centralOffset,total=0;
 for(let i=0;i<count;i++){
  if(!within(bytes,at,46)||bytes.readUInt32LE(at)!==0x02014b50)pluginError('ZIP_CENTRAL_HEADER');
  const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16),compressed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extraLength=bytes.readUInt16LE(at+30),commentLength=bytes.readUInt16LE(at+32),diskStart=bytes.readUInt16LE(at+34),attributes=bytes.readUInt32LE(at+38),offset=bytes.readUInt32LE(at+42);
  if(flags&~0x808||![0,8].includes(method)||diskStart!==0||size===0xffffffff||compressed===0xffffffff||offset===0xffffffff||!nameLength||!within(bytes,at+46,nameLength+extraLength+commentLength)||at+46+nameLength+extraLength+commentLength>end)pluginError('ZIP_ENTRY');
  const rawName=bytes.subarray(at+46,at+46+nameLength);let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(rawName);}catch{pluginError('ZIP_NAME');}
  const directory=name.endsWith('/'),relative=pluginPath(name,{directory}),key=relative.toLowerCase();
  if(names.has(key))pluginError('ZIP_DUPLICATE');names.add(key);
  const mode=(attributes>>>16)&0xffff,type=mode&0o170000;
  if(type&&type!==(directory?0o040000:0o100000)||Boolean(attributes&0x10)!==directory&&attributes&0x10)pluginError('ZIP_FILE_TYPE');
  if(size>PLUGIN_LIMITS.fileBytes||(total+=size)>PLUGIN_LIMITS.totalBytes||directory&&size!==0)pluginError('ZIP_BUDGET');
  extra(bytes,at+46+nameLength,extraLength);
  entries.push({relative,directory,flags,method,crc,compressed,size,offset,rawName});
  at+=46+nameLength+extraLength+commentLength;
 }
 if(at!==end)pluginError('ZIP_DIRECTORY_SIZE');
 for(const entry of entries)for(const parent of entry.relative.split('/').slice(0,-1).map((_,i)=>entry.relative.split('/').slice(0,i+1).join('/').toLowerCase())){
  const conflicting=entries.find(row=>row.relative.toLowerCase()===parent&&!row.directory);if(conflicting)pluginError('ZIP_PATH_COLLISION');
 }
 const files=new Map();let localEnd=0;
 for(const entry of [...entries].sort((a,b)=>a.offset-b.offset)){
  const pos=entry.offset;if(pos!==localEnd||!within(bytes,pos,30)||bytes.readUInt32LE(pos)!==0x04034b50)pluginError('ZIP_LOCAL_HEADER');
  const flags=bytes.readUInt16LE(pos+6),method=bytes.readUInt16LE(pos+8),crc=bytes.readUInt32LE(pos+14),compressed=bytes.readUInt32LE(pos+18),size=bytes.readUInt32LE(pos+22),nameLength=bytes.readUInt16LE(pos+26),extraLength=bytes.readUInt16LE(pos+28),data=pos+30+nameLength+extraLength;
  if(flags!==entry.flags||method!==entry.method||!within(bytes,pos+30,nameLength+extraLength)||!bytes.subarray(pos+30,pos+30+nameLength).equals(entry.rawName)||!within(bytes,data,entry.compressed)||data+entry.compressed>centralOffset)pluginError('ZIP_LOCAL_MISMATCH');
  if(flags&8){if((crc!==0&&crc!==entry.crc)||(compressed!==0&&compressed!==entry.compressed)||(size!==0&&size!==entry.size))pluginError('ZIP_LOCAL_MISMATCH');}
  else if(crc!==entry.crc||compressed!==entry.compressed||size!==entry.size)pluginError('ZIP_LOCAL_MISMATCH');
  extra(bytes,pos+30+nameLength,extraLength);
  let output;try{output=method===0?Buffer.from(bytes.subarray(data,data+entry.compressed)):inflateRawSync(bytes.subarray(data,data+entry.compressed),{maxOutputLength:Math.max(1,entry.size+1)});}catch{pluginError('ZIP_DEFLATE');}
  if(output.length!==entry.size||crc32(output)!==entry.crc)pluginError('ZIP_CRC');
  localEnd=data+entry.compressed;
  if(flags&8){const signed=within(bytes,localEnd,4)&&bytes.readUInt32LE(localEnd)===0x08074b50,start=localEnd+(signed?4:0);if(!within(bytes,start,12)||bytes.readUInt32LE(start)!==entry.crc||bytes.readUInt32LE(start+4)!==entry.compressed||bytes.readUInt32LE(start+8)!==entry.size)pluginError('ZIP_DESCRIPTOR');localEnd=start+12;}
  if(localEnd>centralOffset)pluginError('ZIP_OVERLAP');
  if(!entry.directory)files.set(entry.relative,{bytes:output,sha256:hash(output),size:output.length});
 }
 if(localEnd!==centralOffset)pluginError('ZIP_UNLISTED_DATA');
 if(!files.has('plugin.json'))pluginError('MANIFEST_MISSING');
 const manifest=parsePluginManifest(files.get('plugin.json').bytes);
 if(!files.has(manifest.entry))pluginError('ENTRY_MISSING');
 const icon=manifest.contribution.icon;if((icon.includes('/')||/\.(?:png|svg|webp)$/i.test(icon))&&!files.has(icon))pluginError('ICON_MISSING');
 return {hash:hash(bytes),archiveBytes:bytes.length,manifest,files,totalBytes:total};
}
