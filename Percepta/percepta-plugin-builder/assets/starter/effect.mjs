import {assertProject} from './runtime/project.mjs';

export function createExample(name='My pulse'){
  return {format:'easyvfx.project',version:'1.0.0',id:'draft-'+crypto.randomUUID(),name,preset:'custom',seed:17,duration:1.2,loop:false,
    controls:{color:'#66bbff',size:1,intensity:1},assets:[],
    layers:[{id:'pulse-ring',name:'Pulse',kind:'ring',start:0,end:1.2,x:0,y:0,width:180,height:100,blend:'add',opacity:.8,
      curves:{scale:[[0,.3],[1,1.2]],opacity:[[0,1],[1,0]]}}]};
}

export function validateExample(project){
  assertProject(project);
  const layerKeys=['id','name','kind','start','end','x','y','width','height','blend','opacity','color','rotation','fadeIn','fadeOut','curves','enabled'];
  if(project.assets.length||Object.keys(project.controls).some(key=>!['color','size','intensity'].includes(key))||project.layers.some(layer=>layer.kind!=='ring'||Object.keys(layer).some(key=>!layerKeys.includes(key))))throw Error('This starter handles the shared image-free ring recipe subset. Extend and test the adapter/preview before loading other content.');
  if(project.layers.length>16)throw Error('Starter limit:16 layers.');
  return project;
}
