import test from 'node:test';
import assert from 'node:assert/strict';
import {connectPercepta} from '../sdk.mjs';
import {createDraft} from '../state.mjs';
import {createExample,validateExample} from '../effect.mjs';

function fakeWindow(){
  const listeners=new Map(),sent=[],parent={postMessage:(value,origin)=>sent.push({value,origin})},previous=globalThis.window;
  const win={parent,location:{search:'?pluginHostOrigin=http%3A%2F%2F127.0.0.1%3A8807&pluginToken=token&pluginInstanceId=instance&pluginSdkVersion=1.0.0'},addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn)};
  globalThis.window=win;
  return{win,parent,sent,async message(value,overrides={}){await Promise.all([...listeners.get('message')||[]].map(fn=>fn({source:parent,origin:'http://127.0.0.1:8807',data:{type:'percepta.plugin',sdkVersion:'1.0.0',token:'token',instanceId:'instance',...value},...overrides})));},cleanup(){if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}};
}
test('SDK rejects foreign messages and resolves only the matching trusted request',async()=>{
  const env=fakeWindow(),client=connectPercepta({getState:()=>({project:{},editRevision:0}),setState:()=>{}});try{
    const ready=env.sent[0].value;assert.equal(env.sent[0].origin,'http://127.0.0.1:8807');let resolved=false;client.ready.then(()=>resolved=true);
    const reply={op:'result',requestId:ready.requestId,ok:true,value:{draft:null}};
    for(const override of [{origin:'http://evil.invalid'},{source:{}},{data:{...reply,type:'percepta.plugin',sdkVersion:'1.0.0',token:'wrong',instanceId:'instance'}},{data:{...reply,type:'percepta.plugin',sdkVersion:'1.0.0',token:'token',instanceId:'wrong'}},{data:{...reply,type:'percepta.plugin',sdkVersion:'9.0.0',token:'token',instanceId:'instance'}}])await env.message(reply,override);
    assert.equal(resolved,false);await env.message(reply);assert.deepEqual(await client.ready,{draft:null});
    const saving=client.saveDraft({project:{name:'captured'},editRevision:2}),message=env.sent.at(-1).value;assert.equal(message.op,'draft.put');
    await env.message({op:'result',requestId:message.requestId,ok:true,value:{saved:true,editRevision:2}});assert.equal((await saving).editRevision,2);
  }finally{client.dispose();env.cleanup();}
});
test('SDK handles host save/restore/visibility/actions with validation errors',async()=>{
  const env=fakeWindow();let visible=true,restored=false;const client=connectPercepta({getState:()=>({project:{name:'snapshot'},editRevision:3}),setState:value=>{if(!value.project)throw Error('Invalid project');restored=true;},onAction:action=>action==='undo',onVisibility:value=>visible=value});
  try{await env.message({op:'result',requestId:env.sent[0].value.requestId,ok:true,value:{}});await client.ready;
    await env.message({op:'draft.save',requestId:'save'});assert.equal(env.sent.at(-1).value.value.editRevision,3);
    await env.message({op:'project.load',requestId:'bad',value:{}});assert.equal(env.sent.at(-1).value.ok,false);
    await env.message({op:'project.load',requestId:'good',value:{project:{}}});assert.equal(restored,true);
    await env.message({op:'view.pause'});assert.equal(visible,false);await env.message({op:'view.resume'});assert.equal(visible,true);
    await env.message({op:'history.undo',requestId:'undo'});assert.deepEqual(env.sent.at(-1).value.value,{accepted:true});
    await env.message({op:'interaction.cancel',requestId:'cancel'});assert.deepEqual(env.sent.at(-1).value.value,{handled:false});
  }finally{client.dispose();env.cleanup();}
});
test('SDK propagates rejection, times out and rejects pending requests on disposal',async()=>{
  const env=fakeWindow(),client=connectPercepta({getState:()=>({project:{},editRevision:0}),setState:()=>{}});
  try{await env.message({op:'result',requestId:env.sent[0].value.requestId,ok:true,value:{}});await client.ready;
    const loading=client.loadEffect('vfx:test');await env.message({op:'result',requestId:env.sent.at(-1).value.requestId,ok:false,error:'STALE_EFFECT'});await assert.rejects(loading,/STALE_EFFECT/);
    const pending=client.loadEffect('vfx:test');client.dispose();await assert.rejects(pending,/closed/);
  }finally{client.dispose();env.cleanup();}
  const timeoutEnv=fakeWindow(),timeoutClient=connectPercepta({getState:()=>({}),setState:()=>{},requestTimeout:5});try{await assert.rejects(timeoutClient.ready,error=>error.code==='SDK_TIMEOUT');}finally{timeoutClient.dispose();timeoutEnv.cleanup();}
});
test('captured saves and target metadata do not clear or overwrite newer edits',()=>{
  const state=createDraft(createExample(),validateExample);state.edit(project=>project.name='first');const first=state.snapshot();state.edit(project=>project.controls.size=1.5);state.acknowledge({saved:true,editRevision:first.editRevision},first.editRevision);assert.equal(state.dirty,true);assert.equal(first.project.controls.size,1);
  const beforeTarget=state.snapshot();state.target('vfx:example',1);const linked=state.snapshot();assert.ok(linked.editRevision>beforeTarget.editRevision);state.acknowledge({saved:true,editRevision:linked.editRevision},linked.editRevision);state.acknowledge({stale:true},beforeTarget.editRevision);assert.equal(state.dirty,false);assert.equal(state.snapshot().effectId,'vfx:example');
  state.undo();assert.equal(state.dirty,true);state.redo();assert.equal(state.snapshot().project.controls.size,1.5);
});
test('New with the same document ID invalidates an in-flight Apply; ordinary edits retain session',async()=>{
  const state=createDraft(createExample(),validateExample),sameId=state.snapshot().project.id,current=state.capture();state.edit(project=>project.name='edited');assert.equal(current(),true);
  let finish;const native=new Promise(resolve=>finish=resolve),apply=(async()=>{const result=await native;if(current())state.target(result.effectId,result.effectRevision);})();
  const next=createExample();next.id=sameId;state.replace(next);finish({effectId:'vfx:old',effectRevision:0});await apply;assert.equal(current(),false);assert.equal(state.snapshot().effectId,null);
});
test('startup restores saved revision clean, live restore advances and validates atomically',()=>{
  const state=createDraft(createExample(),validateExample),draft=state.snapshot();draft.editRevision=12;state.restore(draft,{initial:true});assert.equal(state.dirty,false);state.restore(draft);assert.equal(state.revision,13);assert.equal(state.dirty,true);
  const before=state.snapshot();assert.throws(()=>state.restore({...draft,history:[{}]}));assert.deepEqual(state.snapshot(),before);
});
test('starter rejects unsupported native extensions instead of previewing silently without them',()=>{
  const project=createExample();project.layers[0].shield={radius:100};assert.throws(()=>validateExample(project),/shared image-free ring/);
});
