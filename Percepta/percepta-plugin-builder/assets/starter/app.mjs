import {connectPercepta} from './sdk.mjs';
import {createDraft} from './state.mjs';
import {createExample,validateExample} from './effect.mjs';
import {createRenderer} from './runtime/runtime.mjs';

const $=id=>document.getElementById(id),state=createDraft(createExample(),validateExample),renderer=createRenderer($('preview'),{readback:true});
let host,initialized=false,visible=true,raf=0,baseTime=.35,started=0,playing=false,saveTimer,busy=false,unknownCommit=false,unrestoredDraft=null;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
const notify=()=>host?.hosted&&host.notifyState({dirty:state.dirty,editRevision:state.revision});
function sync(){const draft=state.snapshot();$('name').value=draft.project.name;$('color').value=draft.project.controls.color;$('size').value=draft.project.controls.size;$('target').value=draft.effectId||'';$('undo').disabled=!draft.history.length;$('redo').disabled=!draft.future.length;$('apply').disabled=busy||unknownCommit||!initialized;$('load').disabled=busy;$('time').max=draft.project.duration;$('time').value=draft.view.time;playing=draft.view.playing;baseTime=draft.view.time;started=performance.now();$('play').textContent=playing?'Pause preview':'Play preview';render();}
function render(){if(!visible)return;const draft=state.snapshot(),time=playing?(baseTime+(performance.now()-started)/1000)%draft.project.duration:baseTime;renderer.render(draft.project,time,new Map(),{background:'#111727',grid:true});if(playing&&!raf)raf=requestAnimationFrame(()=>{raf=0;render();});}
function changed(){notify();sync();clearTimeout(saveTimer);if(initialized)saveTimer=setTimeout(()=>save().catch(error=>status(error.message,true)),250);}
async function save(){const snapshot=state.snapshot(),result=await host.saveDraft(snapshot);const accepted=state.acknowledge(result,snapshot.editRevision);notify();if(accepted)status(state.dirty?'Newer edits are still unsaved.':'Draft saved in this Studio project.');return snapshot;}
function action(name){if(!initialized)return false;if(name==='undo'||name==='redo'){if(state[name]())changed();return true;}if(name==='togglePlay'){togglePlay();return true;}return false;}
function togglePlay(){const time=playing?(baseTime+(performance.now()-started)/1000)%state.snapshot().project.duration:baseTime;state.setView({time,playing:!playing});changed();}
async function restore(input,{initial=false}={}){if(input.schemaVersion){state.restore(input,{initial});}else{validateExample(input.project);state.replace(input.project,{effectId:input.effectId,effectRevision:input.effectRevision});}unknownCommit=false;if(initial)sync();else changed();}
async function apply(){if(busy||unknownCommit)return;busy=true;sync();const current=state.capture(),draft=state.snapshot();
  try{const result=await host.applyEffect({project:draft.project,normalizedAssets:[],...(draft.effectId?{effectId:draft.effectId,expectedEffectRevision:draft.effectRevision}:{})});
    if(!current())return;state.target(result.effectId,result.effectRevision);notify();await save();if(current())status('Applied to Studio. Save the Studio project to retain native content.');
  }catch(error){if(current()){if(error.code==='SDK_TIMEOUT')unknownCommit=true;status(error.message,true);}}finally{busy=false;sync();}
}
async function load(){const id=$('target').value.trim();if(!id)return status('Enter a native effect ID or Apply first.',true);const current=state.capture();busy=true;sync();
  try{const value=await host.loadEffect(id);if(current())await restore(value);}catch(error){if(current())status(error.message,true);}finally{busy=false;sync();}
}
function downloadRecovery(){const url=URL.createObjectURL(new Blob([JSON.stringify(unrestoredDraft||state.snapshot(),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='plugin-draft-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function main(){
  const manifest=await(await fetch('./plugin.json')).json();document.title=manifest.name;$('tool-name').textContent=manifest.name;
  host=connectPercepta({getState:()=>state.snapshot(),setState:value=>restore(value),onAction:action,onVisibility:value=>{visible=value;if(!value){if(playing)baseTime=(baseTime+(performance.now()-started)/1000)%state.snapshot().project.duration;cancelAnimationFrame(raf);raf=0;}else{started=performance.now();render();}}});
  if(!host.hosted){status('Open this tool from Percepta Plugins. Standalone editing is not enabled in this starter.',true);document.querySelectorAll('button,input').forEach(node=>node.disabled=true);render();return;}
  $('recovery').onclick=downloadRecovery;const ready=await host.ready;if(ready.draft){unrestoredDraft=ready.draft;await restore(ready.draft,{initial:true});unrestoredDraft=null;}initialized=true;host.notifyState({initialized:true,dirty:state.dirty,editRevision:state.revision});sync();status('Ready. Drafts are private until Apply.');
  $('name').addEventListener('change',()=>{try{state.edit(project=>project.name=$('name').value.trim()||'Untitled effect');changed();}catch(error){status(error.message,true);sync();}});
  for(const id of ['color','size'])$(id).addEventListener('input',()=>{state.edit(project=>project.controls[id==="color"?'color':'size']=id==='color'?$('color').value:Number($('size').value));changed();});
  $('new').onclick=()=>{state.replace(createExample());unknownCommit=false;changed();};$('undo').onclick=()=>action('undo');$('redo').onclick=()=>action('redo');$('save').onclick=()=>save().catch(error=>status(error.message,true));$('recovery').onclick=downloadRecovery;$('apply').onclick=apply;$('load').onclick=load;$('play').onclick=togglePlay;
  $('open-recovery').onclick=()=>$('recovery-file').click();$('recovery-file').addEventListener('change',async()=>{const file=$('recovery-file').files[0];$('recovery-file').value='';if(!file)return;try{if(file.size>1024*1024)throw Error('Starter recovery limit:1MiB.');const value=JSON.parse(await file.text());value.effectId=null;value.effectRevision=null;await restore(value);status('Recovery opened as a new unsent effect; its previous native target was detached.');}catch(error){status(error.message,true);}});
  $('time').addEventListener('input',()=>{state.setView({time:Number($('time').value),playing:false});changed();});
  window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save().catch(error=>status(error.message,true));}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!/^(INPUT|TEXTAREA)$/.test(event.target.tagName)){event.preventDefault();action(event.shiftKey?'redo':'undo');}});
}
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);cancelAnimationFrame(raf);renderer.dispose();host?.dispose();},{once:true});
main().catch(error=>{status(error.message+(unrestoredDraft?' Download recovery before changing this incompatible draft.':''),true);document.querySelectorAll('button,input').forEach(node=>node.disabled=node.id!=='recovery');});
