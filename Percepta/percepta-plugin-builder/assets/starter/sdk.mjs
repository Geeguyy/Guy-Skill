const TYPE='percepta.plugin',SDK='1.0.0';
const originOK=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.origin===value;}catch{return false;}};

// Generic browser-only bridge. Model validation belongs to the plugin callbacks.
export function connectPercepta({getState,setState,onAction=()=>false,onVisibility=()=>{},requestTimeout=20000}={}){
  const query=new URLSearchParams(window.location.search),origin=query.get('pluginHostOrigin'),token=query.get('pluginToken'),instanceId=query.get('pluginInstanceId');
  if(window.parent===window||!originOK(origin)||!token||!instanceId)return{hosted:false,dispose(){}};
  if(query.get('pluginSdkVersion')!==SDK)throw Error('Unsupported Percepta plugin SDK.');
  if(typeof getState!=='function'||typeof setState!=='function')throw Error('Supply draft snapshot and validated restore callbacks.');
  const pending=new Map();let disposed=false;
  const identity={type:TYPE,sdkVersion:SDK,token,instanceId};
  function send(value){if(disposed)throw Error('Percepta connection closed.');window.parent.postMessage({...identity,...value},origin);}
  function request(op,value,timeout=requestTimeout){return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(requestId);const error=Error('Percepta did not answer '+op+'. Outcome may be unknown; reconcile before retrying Apply.');error.code='SDK_TIMEOUT';reject(error);},timeout);
    pending.set(requestId,{resolve,reject,timer});try{send({op,value,requestId});}catch(error){clearTimeout(timer);pending.delete(requestId);reject(error);}
  });}
  async function receive(event){
    if(disposed||event.source!==window.parent||event.origin!==origin)return;
    const msg=event.data;if(msg?.type!==TYPE||msg.sdkVersion!==SDK||msg.token!==token||msg.instanceId!==instanceId)return;
    if(msg.op==='result'){
      const item=pending.get(msg.requestId);if(!item)return;pending.delete(msg.requestId);clearTimeout(item.timer);
      msg.ok===true?item.resolve(msg.value):item.reject(Error(String(msg.error||'Percepta rejected the request.')));return;
    }
    if(['view.pause','view.resume'].includes(msg.op)&&!msg.requestId){onVisibility(msg.op==='view.resume');return;}
    if(typeof msg.requestId!=='string'||msg.requestId.length>100||!['draft.save','project.load','history.undo','history.redo','playback.toggle','interaction.cancel'].includes(msg.op))return;
    try{let value;
      if(msg.op==='draft.save')value=await getState();
      else if(msg.op==='project.load'){await setState(msg.value);value={loaded:true};}
      else{const action={'history.undo':'undo','history.redo':'redo','playback.toggle':'togglePlay','interaction.cancel':'cancel'}[msg.op],handled=await onAction(action)===true;value=action==='cancel'?{handled}:{accepted:handled};}
      if(!disposed)send({op:'result',requestId:msg.requestId,ok:true,value});
    }catch(error){if(!disposed)send({op:'result',requestId:msg.requestId,ok:false,error:String(error.message).slice(0,1024)});}
  }
  const focus=()=>{if(!disposed)send({op:'state.changed',value:{focused:true}});},blur=()=>{if(!disposed)send({op:'state.changed',value:{focused:false}});};
  window.addEventListener('message',receive);window.addEventListener('focus',focus);window.addEventListener('blur',blur);
  const ready=request('ready');ready.catch(()=>{});
  return{hosted:true,ready,notifyState:value=>send({op:'state.changed',value}),
    saveDraft:value=>{if(!value?.project||!Number.isSafeInteger(value.editRevision)||value.editRevision<0)return Promise.reject(Error('Draft needs project and captured editRevision.'));return request('draft.put',value);},
    applyEffect:value=>request('effect.apply',value,60000),loadEffect:effectId=>request('effect.load',{effectId}),
    dispose(){if(disposed)return;disposed=true;window.removeEventListener('message',receive);window.removeEventListener('focus',focus);window.removeEventListener('blur',blur);for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Percepta connection closed.'));}pending.clear();}
  };
}
