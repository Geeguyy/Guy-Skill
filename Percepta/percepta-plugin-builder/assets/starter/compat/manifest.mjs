export const PLUGIN_FORMAT='percepta.plugin';
export const PLUGIN_MANIFEST_VERSION='1.0.0';
export const PLUGIN_SDK_VERSION='1.0.0';
export const PLUGIN_PERMISSIONS=Object.freeze(['storage','project.read','project.write']);
export const PLUGIN_LIMITS=Object.freeze({archiveBytes:64*1024*1024,totalBytes:128*1024*1024,fileBytes:16*1024*1024,files:2048,manifestBytes:64*1024,storageValueBytes:64*1024*1024,storageTotalBytes:128*1024*1024});
export const pluginError=code=>{throw Error('PLUGIN_'+code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,required,optional=[])=>object(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
export const validPluginId=value=>typeof value==='string'&&/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(value)&&value.length<=80;
export const validPluginVersion=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value)&&value.split('.').every(part=>part.length<=9&&String(Number(part))===part);

/** Portable POSIX archive paths only; never pass a user-supplied filesystem path. */
export function pluginPath(value,{directory=false}={}){
 if(typeof value!=='string'||!value.length||value.length>240||value.includes('\\')||value.startsWith('/')||/[:\u0000-\u001f\u007f]/.test(value))pluginError('PATH');
 const name=directory&&value.endsWith('/')?value.slice(0,-1):value;
 if(!name||name.split('/').some(part=>!part||part==='.'||part==='..'||!/^[A-Za-z0-9._ -]+$/.test(part)||part.endsWith('.')||part.endsWith(' ')||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))pluginError('PATH');
 return name;
}

export function validatePluginManifest(value){
 if(!fields(value,['format','manifestVersion','id','name','version','entry','sdkVersion','permissions','contribution'],['description']))pluginError('MANIFEST_FIELDS');
 if(value.format!==PLUGIN_FORMAT||value.manifestVersion!==PLUGIN_MANIFEST_VERSION||value.sdkVersion!==PLUGIN_SDK_VERSION)pluginError('MANIFEST_VERSION');
 if(!validPluginId(value.id)||!validPluginVersion(value.version)||!text(value.name,100))pluginError('MANIFEST_IDENTITY');
 pluginPath(value.entry);if(!/\.html$/i.test(value.entry))pluginError('MANIFEST_ENTRY');
 if(value.description!==undefined&&!text(value.description,500))pluginError('MANIFEST_DESCRIPTION');
 if(!Array.isArray(value.permissions)||value.permissions.length>PLUGIN_PERMISSIONS.length||new Set(value.permissions).size!==value.permissions.length||value.permissions.some(permission=>!PLUGIN_PERMISSIONS.includes(permission)))pluginError('MANIFEST_PERMISSIONS');
 if(!fields(value.contribution,['icon','label'])||!text(value.contribution.icon,160)||!text(value.contribution.label,80))pluginError('MANIFEST_CONTRIBUTION');
 // A short glyph is preferred. Paths may name a packaged icon, never a URL.
 if(value.contribution.icon.includes('/')||/\.(?:png|svg|webp)$/i.test(value.contribution.icon))pluginPath(value.contribution.icon);
 else if(value.contribution.icon.length>16||value.contribution.icon.includes(':'))pluginError('MANIFEST_ICON');
 return JSON.parse(JSON.stringify(value));
}

export function parsePluginManifest(bytes){
 if(bytes.byteLength>PLUGIN_LIMITS.manifestBytes)pluginError('MANIFEST_SIZE');
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{pluginError('MANIFEST_JSON');}
 return validatePluginManifest(value);
}
