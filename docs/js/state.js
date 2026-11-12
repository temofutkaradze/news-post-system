// SPDX-License-Identifier: AGPL-3.0-or-later
import { circleRect } from './geometry.js';
export const photoSlot=()=>({source:null,mask:null,region:null,focal:{x:.5,y:.5,zoom:1},revision:0});
let nextId=0;
export function createCircle(){const number=++nextId;return {...photoSlot(),id:`circle-${number}`,label:`Circle ${number}`,focal:{x:.5,y:.3,zoom:1},layout:{x:30,y:22,size:40,border:7},pop:false,smart:false,popHeight:50};}
export function createState(){
  const first=createCircle();
  const state={editorial:{template:'none',headline:'',subtitle:''},background:photoSlot(),circles:[first],activeId:first.id,selectedIds:new Set([first.id])};
  // A single inspector edits the active circle, never all circles implicitly.
  Object.defineProperty(state,'circle',{get:()=>state.circles.find(c=>c.id===state.activeId)||state.circles[0]});
  for(const key of ['layout','pop','smart','popHeight'])Object.defineProperty(state,key,{get:()=>state.circle[key],set:value=>state.circle[key]=value});
  return state;
}
export function selectCircle(state,id,extend=false){
  if(!state.circles.some(c=>c.id===id))return;
  state.activeId=id;
  if(!extend)state.selectedIds=new Set([id]);else if(state.selectedIds.has(id)&&state.selectedIds.size>1){state.selectedIds.delete(id);state.activeId=[...state.selectedIds].at(-1);}else state.selectedIds.add(id);
}
export function addCircle(state){const circle=createCircle();circle.layout.x=state.circles.filter(c=>c.source).length%2?70:30;state.circles.push(circle);selectCircle(state,circle.id);return circle;}
export function removeCircle(state,id){
  const i=state.circles.findIndex(c=>c.id===id);if(i<0)return;
  const [removed]=state.circles.splice(i,1);removed.revision++;state.selectedIds.delete(id);
  // Keep an empty upload slot for the familiar one-circle workflow.
  if(!state.circles.length)state.circles.push(createCircle());
  if(state.activeId===id)state.activeId=state.circles[Math.min(i,state.circles.length-1)].id;
  if(state.selectedIds.size&&!state.selectedIds.has(state.activeId))state.activeId=[...state.selectedIds].at(-1);
  if(!state.selectedIds.size)state.selectedIds.add(state.activeId);
  return removed;
}
export function reorderCircle(state,id,step){const i=state.circles.findIndex(c=>c.id===id),j=Math.max(0,Math.min(state.circles.length-1,i+step));if(i<0||i===j)return;const[c]=state.circles.splice(i,1);state.circles.splice(j,0,c);}
export function bulkEffect(state,key,value){if(!['pop','smart'].includes(key))throw Error('Unknown effect');for(const c of state.circles)if(state.selectedIds.has(c.id))c[key]=value;}
export function hitCircle(state,x,y){return [...state.circles].reverse().find(c=>{if(!c.source)return false;const r=circleRect(c.layout);return Math.hypot(x-r.x-r.w/2,y-r.y-r.h/2)<=r.w/2+c.layout.border;});}
export function projectEstimate(state,target=null,replacement=null){
  let bytes=0;for(const slot of [state.background,...state.circles]){const source=slot===target?replacement:(slot.pendingSource||slot.source);if(!source)continue;const scale=Math.min(1,2048/Math.max(source.width,source.height));bytes+=source.width*source.height*4+(source.file?.size||0)+Math.round(source.width*scale)*Math.round(source.height*scale)*12;}
  return bytes;
}
export function projectBudget(deviceGiB=4){return Math.max(128,Math.min(384,deviceGiB*64))*1048576;}
export function missingMasks(state){const missing=[];for(const c of state.circles)if(c.source){if(c.pop&&!c.mask)missing.push(`${c.label} Pop-out`);if(c.smart&&!state.background.mask&&!missing.includes('shared background foreground'))missing.push('shared background foreground');}return missing;}
