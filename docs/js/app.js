// News Post Studio — Copyright (C) 2026 temofutkaradze
// SPDX-License-Identifier: AGPL-3.0-or-later
import { WIDTH, HEIGHT, clamp, fit, cropTags, circleRect } from './geometry.js';
import { loadImage, disposeSource, inferenceInput, save } from './images.js?v=editorial-templates-1';
import { maskFromImage } from './masks.js';
import { Renderer, exportPoster, exportCutout } from './render.js?v=editorial-templates-1';
import { Segmenter } from './segmentation.js';
import { MaskEditor } from './mask-editor.js';
import { createState, addCircle, selectCircle, removeCircle, reorderCircle, bulkEffect, hitCircle, projectEstimate, projectBudget } from './state.js?v=editorial-templates-1';
import { CircleList } from './circle-list.js';

import { readyTemplateFont } from './templates.js';

const $=id=>document.getElementById(id);
export const state=createState();
const renderer=new Renderer(),segmenter=new Segmenter();
let mode='layout',plain=false,frame=0,busy=false,exporting=false,jobRevision=0;
let pendingMasks=[],draining=false,queueRevision=0;
const editor=new MaskEditor($('mask-editor'),()=>{sync();draw();});
const circlesUI=new CircleList($('circle-list'),(id,extend)=>{selectCircle(state,id,extend);if(mode==='background')setMode('layout');sync();draw();});

function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function draw(){if(frame)return;frame=requestAnimationFrame(()=>{
  frame=0;renderer.render($('poster'),state,{plain,scale:.5});
  // Editor-only selection guides are deliberately outside the export compositor.
  if(state.circles.filter(c=>c.source).length>1&&!plain){const g=$('poster').getContext('2d');g.save();g.setLineDash([6,5]);g.lineWidth=2;g.strokeStyle='#d3fa79';for(const c of state.circles)if(c.source&&state.selectedIds.has(c.id)){const r=circleRect(c.layout);g.beginPath();g.arc(r.x+r.w/2,r.y+r.h/2,r.w/2+c.layout.border+6,0,Math.PI*2);g.stroke();}g.restore();}
});}
function currentFocal(){return state[mode==='background'?'background':'circle'].focal;}
function setMode(next){mode=next;document.querySelectorAll('[data-mode]').forEach(button=>{const selected=button.dataset.mode===mode;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',selected);});}
function sync(){
  circlesUI.render(state);$('active-circle').textContent=`Editing ${state.circle.label}`;
  $('circle-controls-title').textContent=state.circles.length>1?`${state.circle.label} · layout`:'Circle & layout';
  $('remove-circle').textContent=`Delete ${state.circle.label}`;
  $('mask-target').querySelector('option[value="circle"]').textContent=`${state.circle.label} subject`;
  $('bulk-actions').hidden=state.selectedIds.size<2;$('bulk-count').textContent=`Apply to ${state.selectedIds.size} selected circles`;
  $('pop-height').value=state.popHeight;
  $('empty').hidden=!!(state.background.source||state.circle.source);
  $('pop-toggle').checked=state.pop;$('smart-toggle').checked=state.smart;
  $('size').value=state.layout.size;$('size-value').value=state.layout.size+'%';
  $('zoom').value=currentFocal().zoom;$('zoom-value').value=currentFocal().zoom.toFixed(2)+'×';
  $('circle-x').value=Math.round(state.layout.x);$('circle-y').value=Math.round(state.layout.y);
  $('focal-x').value=Math.round(currentFocal().x*100);$('focal-y').value=Math.round(currentFocal().y*100);
  $('height-value').value=state.popHeight+'%';
  for(const key of ['background','circle']){
    const source=state[key].source;
    $('process-'+key).disabled=busy||!source;
    document.querySelector(`[data-edit="${key}"]`).disabled=busy||!source;
    $(key+'-info').textContent=source?`${source.width} × ${source.height} · original`:key==='background'?'Main photograph':'Inset photograph';
  }
  $('export').disabled=$('share').disabled=exporting||!state.background.source;
  $('remove-circle').disabled=state.circles.length===1&&!state.circle.source;
  $('send-backward').disabled=state.circles.indexOf(state.circle)===0;
  $('bring-forward').disabled=state.circles.indexOf(state.circle)===state.circles.length-1;
  $('download-cutout').textContent=`Download ${state.circle.label} transparent cutout`;
  $('download-cutout').disabled=exporting||!state.circle.source||!state.circle.mask;
  $('cancel').hidden=!busy;
  const visible=state.circles.filter(c=>c.source),legacy=visible[0]||state.circle;
  const tags=cropTags({background:state.background,circle:legacy,layout:legacy.layout,pop:legacy.pop,popHeight:legacy.popHeight}),multiple=visible.length>1;
  $('background-tag').value=tags.background;$('circle-tag').value=multiple?'Multiple circles require browser image export':tags.circle;
  $('copy-tags').disabled=multiple;document.querySelector('[data-copy="circle-tag"]').disabled=multiple;
  $('legacy-note').hidden=!multiple;
}
function cancel(clearQueue=true){if(clearQueue){pendingMasks=[];queueRevision++;}jobRevision++;segmenter.cancel();busy=false;sync();}
async function queueMasks(items){
  for(const item of items)if(item.target.source&&!pendingMasks.some(x=>x.target===item.target))pendingMasks.push({...item,revision:item.target.revision});
  if(draining)return;draining=true;
  try{while(pendingMasks.length){const item=pendingMasks.shift(),epoch=queueRevision;
    if(item.revision!==item.target.revision||(!item.force&&item.target.mask)||!item.target.source)continue;
    if(!item.force&&item.key==='circle'&&!item.target.pop)continue;
    if(!item.force&&item.key==='background'&&!state.circles.some(c=>c.smart))continue;
    const ok=await process(item.key,item.target);
    if(!ok&&epoch===queueRevision){pendingMasks=[];break;}
  }}finally{draining=false;sync();}
}
async function replacePhoto(key,file){
  if(!file)return;cancel();const target=state[key],revision=++target.revision;
  status('Opening original photograph…');
  try{
    const source=await loadImage(file,{beforeDecode:({width,height})=>{
      if(revision!==target.revision)throw new DOMException('Photo selection superseded','AbortError');
      if(projectEstimate(state,target,{width,height,file})>projectBudget(navigator.deviceMemory||4))throw Error('This photo would exceed the estimated project memory budget. Remove an unused circle or choose a smaller original. Your current design is unchanged.');
      target.pendingSource={width,height,file};
    }});
    if(revision!==target.revision){disposeSource(source);return;}
    disposeSource(target.source);target.mask?.dispose();target.source=source;target.mask=null;target.region=null;
    target.focal={x:.5,y:key==='circle'?.3:.5,zoom:1};
    if(key==='circle')target.pop=false;
    status('Original photograph loaded. Position your circle, then enable an effect when you want it.');sync();draw();
  }catch(error){if(revision===target.revision)status(error.message,true);}
  finally{if(revision===target.revision)target.pendingSource=null;}
}
function installMask(target,mask){target.mask?.dispose();target.mask=mask;sync();draw();}
async function process(key,target){
  const source=target.source;if(!source)return false;
  cancel(false);const id=++jobRevision,revision=target.revision;busy=true;sync();
  status('Preparing a lossless masking input. Your original photograph is kept separately…');
  try{
    const input=await inferenceInput(source,target.region);
    if(id!==jobRevision)return;
    const started=performance.now();
    const blob=await segmenter.run(input.blob,$('quality').value,p=>{
      if(id===jobRevision)status(`${p.downloading?'Downloading model':'Processing on your device'}${p.percent!==null?' · '+p.percent+'%':''}. You can cancel safely.`);
    });
    if(id!==jobRevision||revision!==target.revision)return;
    const mask=await maskFromImage(blob,source,{region:input.region});
    if(id!==jobRevision||revision!==target.revision){mask.dispose();return;}
    installMask(target,mask);
    status(`${key==='circle'?target.label:'Shared background'} mask ready in ${((performance.now()-started)/1000).toFixed(1)}s. Enable ${key==='circle'?'Circle Pop-out':'Smart Foreground on the intended circles'} and inspect edges. Refine repairs the mask without changing photo pixels.`);
    return true;
  }catch(error){if(id===jobRevision)status(error.name==='AbortError'?'Processing cancelled. Your previous mask is safe.':error.message,error.name!=='AbortError');}
  finally{if(id===jobRevision){busy=false;sync();}}
}
async function importAdvanced(){
  const key=$('mask-target').value,target=state[key],source=target.source;
  if(!source){status('Load the corresponding photograph first.',true);return;}
  const file=$('mask-file').files[0],json=$('mask-meta').files[0];
  if(!file||!json||json.size>8192){status('Choose a mask PNG and its JSON metadata (up to 8 KB).',true);return;}
  cancel();const id=++jobRevision,revision=target.revision;
  try{
    const metadata=JSON.parse(await json.text()),mask=await maskFromImage(file,source,{metadata});
    if(id!==jobRevision||revision!==target.revision){mask.dispose();return;}
    installMask(target,mask);status('Verified mask imported. Turn on the corresponding effect to review it.');
  }catch(error){if(id===jobRevision)status(error.message,true);}
}
async function importCutout(file){
  const target=state.circle,source=target.source;if(!source){status('Load the original circle photograph first.',true);return;}
  cancel();const id=++jobRevision,revision=target.revision;
  try{
    const mask=await maskFromImage(file,source,{cutout:true});
    if(id!==jobRevision||revision!==target.revision){mask.dispose();return;}
    installMask(target,mask);status('Cutout alpha imported; original circle RGB is preserved. Confirm its alignment, then enable Circle Pop-out.');
  }catch(error){if(id===jobRevision)status(error.message,true);}
}
async function downloadPoster(share=false){
  if(exporting||!state.background.source)return;exporting=true;sync();status('Rendering your complete image from the original photographs…');
  // Let the loading state paint before the synchronous Canvas composition.
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  try{
    const scale=+$('export-size').value,type=$('export-type').value;
    const blob=await exportPoster(state,{scale,type});
    await save(blob,`news-post-${WIDTH*scale}x${HEIGHT*scale}.${type==='image/png'?'png':'jpg'}`,share);
    status(`Complete image ready · ${WIDTH*scale} × ${HEIGHT*scale} · ${(blob.size/1048576).toFixed(1)} MB. Original photo detail, no AI reconstruction.`);
  }catch(error){status(error.message,true);}finally{exporting=false;sync();}
}
async function copy(text){
  try{await navigator.clipboard.writeText(text);status('Crop coordinates copied.');}
  catch{status('Clipboard unavailable. Select and copy the crop coordinates below.');}
}
function syncTemplate(){
  $('editorial-fields').hidden=state.editorial.template==='none';
  $('subtitle-field').hidden=state.editorial.template!=='headline-subtitle';
}
$('template').onchange=()=>{state.editorial.template=$('template').value;syncTemplate();draw();};
for(const field of ['headline','subtitle'])$(field).oninput=()=>{state.editorial[field]=$(field).value;draw();};
readyTemplateFont().then(draw).catch(()=>status('Headline font could not load. Reload before exporting a text template.',true));
syncTemplate();
for(const key of ['background','circle'])$(key+'-file').onchange=e=>{replacePhoto(key,e.target.files[0]);e.target.value='';};
$('remove-circle').onclick=()=>{cancel();const removed=removeCircle(state,state.activeId);disposeSource(removed.source);removed.mask?.dispose();sync();draw();};
$('add-circle').onclick=()=>{const empty=state.circles.find(c=>!c.source&&!c.pendingSource);if(empty)selectCircle(state,empty.id);else addCircle(state);setMode('layout');sync();draw();$('circle-file').click();};
$('select-all-circles').onclick=()=>{state.selectedIds=new Set(state.circles.map(c=>c.id));sync();draw();};
for(const[id,step]of [['send-backward',-1],['bring-forward',1]])$(id).onclick=()=>{reorderCircle(state,state.activeId,step);sync();draw();};
document.querySelectorAll('[data-bulk-effect]').forEach(button=>button.onclick=()=>{const key=button.dataset.bulkEffect,value=button.dataset.enabled==='true';bulkEffect(state,key,value);sync();draw();status('Effect settings updated only for the selected circles. Existing masks are reused.');if(value){const items=key==='smart'?[{key:'background',target:state.background}]:state.circles.filter(c=>state.selectedIds.has(c.id)).map(target=>({key:'circle',target}));queueMasks(items);}});
$('cancel').onclick=()=>{cancel();status('Processing cancelled. Your photographs and previous masks are safe.');};
document.querySelectorAll('[data-process]').forEach(b=>b.onclick=()=>queueMasks([{key:b.dataset.process,target:state[b.dataset.process],force:true}]));
document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const key=b.dataset.edit;if(!state[key].source)return;cancel();editor.open(state[key],key==='background'?'Refine the shared background mask':`Refine ${state.circle.label}`);sync();});
$('close-editor').onclick=()=>{$('mask-editor').close();sync();draw();};
for(const [id,key,slotName] of [['pop-toggle','pop','circle'],['smart-toggle','smart','background']])$(id).onchange=e=>{
  state[key]=e.target.checked;sync();draw();if(state[key]&&!state[slotName].mask){status('Creating the missing mask. You can cancel and use Refine or import a mask instead.');queueMasks([{key:slotName,target:state[slotName]}]);}
};
$('pop-height').oninput=e=>{state.popHeight=+e.target.value;sync();draw();};
$('cutout-file').onchange=e=>{if(e.target.files[0])importCutout(e.target.files[0]);e.target.value='';};
$('import-mask').onclick=importAdvanced;
$('mask-template').onclick=async()=>{const s=state[$('mask-target').value].source;if(!s){status('Load the corresponding source photograph first.',true);return;}
  const meta={version:1,coordinates:'oriented-full-source',encoding:'gray8',orientation:'browser-exif-normalized',sourceSha256:s.hash,sourceWidth:s.width,sourceHeight:s.height};
  await save(new Blob([JSON.stringify(meta,null,2)],{type:'application/json'}),'source-mask-metadata.json');
};
$('export').onclick=()=>downloadPoster();$('share').onclick=()=>downloadPoster(true);
$('download-cutout').onclick=async()=>{if(exporting)return;const circle=state.circle;exporting=true;sync();try{await save(await exportCutout(circle),`${circle.id}-cutout.png`);status(`${circle.label} transparent cutout downloaded. Use Download complete image for all circles.`);}catch(e){status(e.message,true);}finally{exporting=false;sync();}};
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy($(b.dataset.copy).value));$('copy-tags').onclick=()=>copy($('background-tag').value+' '+$('circle-tag').value);
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{setMode(b.dataset.mode);sync();});
$('before').onclick=()=>{plain=!plain;$('before').setAttribute('aria-pressed',plain);$('before').classList.toggle('selected',plain);$('before').textContent=plain?'Show effects':'Compare original';draw();};
$('left').onclick=()=>{state.layout.x=30;sync();draw();};$('right').onclick=()=>{state.layout.x=70;sync();draw();};
$('reset-layout').onclick=()=>{if(mode==='background')state.background.focal={x:.5,y:.5,zoom:1};else{state.layout={x:30,y:22,size:40,border:7};state.circle.focal={x:.5,y:.3,zoom:1};}sync();draw();};
$('size').oninput=e=>{state.layout.size=+e.target.value;sync();draw();};$('zoom').oninput=e=>{currentFocal().zoom=+e.target.value;sync();draw();};
for(const [id,key] of [['circle-x','x'],['circle-y','y']])$(id).oninput=e=>{state.layout[key]=clamp(Number(e.target.value)||0,0,100);draw();};
for(const [id,key] of [['focal-x','x'],['focal-y','y']])$(id).oninput=e=>{currentFocal()[key]=clamp(Number(e.target.value)||0,0,100)/100;draw();};
for(const id of ['circle-x','circle-y','focal-x','focal-y'])$(id).onchange=sync;
const pointers=new Map();let pinchDistance=1,pinchStart=1;
const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y)||1;};
const setScale=value=>{if(mode==='layout')state.layout.size=clamp(value,15,80);else currentFocal().zoom=clamp(value,1,4);};
$('poster').onpointerdown=e=>{
  if(mode!=='background'&&pointers.size===0){const r=$('poster').getBoundingClientRect(),hit=hitCircle(state,(e.clientX-r.left)*WIDTH/r.width,(e.clientY-r.top)*HEIGHT/r.height);if(hit){selectCircle(state,hit.id,e.ctrlKey||e.metaKey||e.shiftKey);sync();draw();}}
  $('poster').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){pinchDistance=distance();pinchStart=mode==='layout'?state.layout.size:currentFocal().zoom;}e.preventDefault();
};
$('poster').onpointermove=e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=(e.clientX-old.x)*WIDTH/$('poster').clientWidth,dy=(e.clientY-old.y)*HEIGHT/$('poster').clientHeight;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2)setScale(pinchStart*distance()/pinchDistance);
  else if(mode==='layout'){state.layout.x=clamp(state.layout.x+dx/WIDTH*100,0,100);state.layout.y=clamp(state.layout.y+dy/HEIGHT*100,0,100);}
  else{const t=state[mode],s=t.source;if(s){const d=WIDTH*state.layout.size/100,r=fit(s.width,s.height,mode==='background'?WIDTH:d,mode==='background'?HEIGHT:d,t.focal);t.focal.x=clamp(t.focal.x-dx/r.w,0,1);t.focal.y=clamp(t.focal.y-dy/r.h,0,1);}}
  sync();draw();e.preventDefault();};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('poster').addEventListener(name,e=>pointers.delete(e.pointerId));
$('poster').addEventListener('wheel',e=>{e.preventDefault();setScale((mode==='layout'?state.layout.size:currentFocal().zoom)*Math.exp(-e.deltaY*.002));sync();draw();},{passive:false});
window.addEventListener('pagehide',()=>{segmenter.cancel();renderer.dispose();for(const slot of [state.background,...state.circles]){disposeSource(slot.source);slot.mask?.dispose();}cancelAnimationFrame(frame);});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
sync();draw();
