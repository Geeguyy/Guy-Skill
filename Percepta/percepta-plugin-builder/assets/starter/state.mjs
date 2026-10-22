const clone=value=>structuredClone(value),validRevision=value=>Number.isSafeInteger(value)&&value>=0;

// Persisted view is user intent (seek/play), not the transient animation clock.
export function createDraft(initial,validate){
  let project=clone(validate(initial)),history=[],future=[],view={time:.35,playing:false},effectId=null,effectRevision=null,revision=0,saved=0,generation=0;
  const increment=()=>{if(!Number.isSafeInteger(revision+1))throw Error('Draft revision exhausted. Export recovery and reopen.');revision++;};
  function snapshot(){return clone({schemaVersion:'1.0.0',project,history,future,view,effectId,effectRevision,editRevision:revision});}
  return{
    snapshot,get dirty(){return revision>saved;},get revision(){return revision;},
    capture(){const captured=generation;return()=>captured===generation;},
    edit(change){const next=clone(project);change(next);validate(next);if(JSON.stringify(next)===JSON.stringify(project))return false;history.push(clone(project));history=history.slice(-40);future=[];project=next;increment();return true;},
    undo(){if(!history.length)return false;future.push(project);project=history.pop();increment();return true;},
    redo(){if(!future.length)return false;history.push(project);project=future.pop();increment();return true;},
    setView(next){const candidate={...view,...next};if(!Number.isFinite(candidate.time)||candidate.time<0||candidate.time>project.duration||typeof candidate.playing!=='boolean')throw Error('Invalid preview view.');if(JSON.stringify(candidate)!==JSON.stringify(view)){view=candidate;increment();}},
    target(id,version){if(typeof id!=='string'||!id.startsWith('vfx:')||!validRevision(version))throw Error('Invalid native effect target.');if(effectId!==id||effectRevision!==version){effectId=id;effectRevision=version;increment();}},
    restore(value,{initial=false}={}){
      const next=clone(value);if(!next||next.schemaVersion!=='1.0.0'||!validRevision(next.editRevision))throw Error('Unsupported draft schema/revision. Download recovery before migration.');
      validate(next.project);for(const key of ['history','future']){if(!Array.isArray(next[key])||next[key].length>40)throw Error('Invalid draft history.');next[key].forEach(validate);}
      if(!next.view||!Number.isFinite(next.view.time)||next.view.time<0||next.view.time>next.project.duration||typeof next.view.playing!=='boolean')throw Error('Invalid draft view.');
      if(next.effectId!==null&&(typeof next.effectId!=='string'||!next.effectId.startsWith('vfx:')||!validRevision(next.effectRevision)))throw Error('Invalid saved target.');
      generation++;project=next.project;history=next.history;future=next.future;view=next.view;effectId=next.effectId;effectRevision=next.effectRevision;revision=Math.max(revision,next.editRevision);if(initial)saved=revision;else increment();
    },
    replace(next,{effectId:id=null,effectRevision:version=null}={}){this.restore({schemaVersion:'1.0.0',project:next,history:[],future:[],view:{time:Math.min(.35,next.duration),playing:false},effectId:id,effectRevision:version,editRevision:revision});},
    acknowledge(result,captured){if(result?.stale===true)return false;if(result?.saved!==true||result.editRevision!==captured||!validRevision(captured)||captured>revision)throw Error('Draft was not acknowledged at its captured revision.');saved=Math.max(saved,captured);return true;}
  };
}
