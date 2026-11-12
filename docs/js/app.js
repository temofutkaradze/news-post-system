// News Post Studio — Copyright (C) 2026 temofutkaradze
// SPDX-License-Identifier: AGPL-3.0-or-later
import { WIDTH, HEIGHT, clamp, fit, cropTags } from './geometry.js';
import { loadImage, disposeSource, inferenceInput, save } from './images.js';
import { maskFromImage } from './masks.js';
import { Renderer, exportPoster, exportCutout } from './render.js';
import { Segmenter } from './segmentation.js';
import { MaskEditor } from './mask-editor.js';

const $=id=>document.getElementById(id);
const slot=()=>({source:null,mask:null,region:null,focal:{x:.5,y:.5,zoom:1},revision:0});
export const state={background:slot(),circle:slot(),layout:{x:30,y:22,size:40,border:7},pop:false,smart:false,popHeight:50};
state.circle.focal.y=.3;
const renderer=new Renderer(),segmenter=new Segmenter();
let mode='layout',plain=false,frame=0,busy=false,exporting=false,jobRevision=0;
const editor=new MaskEditor($('mask-editor'),()=>{sync();draw();});

function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function draw(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;renderer.render($('poster'),state,{plain,scale:.5});});}
function currentFocal(){return state[mode==='background'?'background':'circle'].focal;}
function sync(){
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
  $('remove-circle').disabled=!state.circle.source;
  $('download-cutout').disabled=exporting||!state.circle.source||!state.circle.mask;
  $('cancel').hidden=!busy;
  const tags=cropTags(state);$('background-tag').value=tags.background;$('circle-tag').value=tags.circle;
}
function cancel(){jobRevision++;segmenter.cancel();busy=false;sync();}
async function replacePhoto(key,file){
  if(!file)return;cancel();const target=state[key],revision=++target.revision;
  status('Opening original photograph…');
  try{
    const source=await loadImage(file);
    if(revision!==target.revision){disposeSource(source);return;}
    disposeSource(target.source);target.mask?.dispose();target.source=source;target.mask=null;target.region=null;
    target.focal={x:.5,y:key==='circle'?.3:.5,zoom:1};
    if(key==='circle')state.pop=false;else state.smart=false;
    status('Original photograph loaded. Position your circle, then enable an effect when you want it.');sync();draw();
  }catch(error){if(revision===target.revision)status(error.message,true);}
}
function installMask(target,mask){target.mask?.dispose();target.mask=mask;sync();draw();}
async function process(key){
  const target=state[key],source=target.source;if(!source)return;
  cancel();const id=++jobRevision,revision=target.revision;busy=true;sync();
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
    status(`Mask ready in ${((performance.now()-started)/1000).toFixed(1)}s including loading. Enable ${key==='circle'?'Circle Pop-out':'Smart Foreground'} and inspect hands, hair and spectators. Refine repairs the mask without changing photo pixels.`);
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
for(const key of ['background','circle'])$(key+'-file').onchange=e=>{replacePhoto(key,e.target.files[0]);e.target.value='';};
$('remove-circle').onclick=()=>{cancel();const t=state.circle;t.revision++;disposeSource(t.source);t.mask?.dispose();t.source=t.mask=t.region=null;state.pop=false;sync();draw();};
$('cancel').onclick=()=>{cancel();status('Processing cancelled. Your photographs and previous masks are safe.');};
document.querySelectorAll('[data-process]').forEach(b=>b.onclick=()=>process(b.dataset.process));
document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const key=b.dataset.edit;if(!state[key].source)return;cancel();editor.open(state[key],key==='background'?'Refine the background player':'Refine the circle subject');sync();});
$('close-editor').onclick=()=>{$('mask-editor').close();sync();draw();};
for(const [id,key,slotName] of [['pop-toggle','pop','circle'],['smart-toggle','smart','background']])$(id).onchange=e=>{
  state[key]=e.target.checked;if(state[key]&&!state[slotName].mask)status('Effect enabled. Create a mask, import one, or use Refine to paint the foreground.');sync();draw();
};
$('pop-height').oninput=e=>{state.popHeight=+e.target.value;sync();draw();};
$('cutout-file').onchange=e=>{if(e.target.files[0])importCutout(e.target.files[0]);e.target.value='';};
$('import-mask').onclick=importAdvanced;
$('mask-template').onclick=async()=>{const s=state[$('mask-target').value].source;if(!s){status('Load the corresponding source photograph first.',true);return;}
  const meta={version:1,coordinates:'oriented-full-source',encoding:'gray8',orientation:'browser-exif-normalized',sourceSha256:s.hash,sourceWidth:s.width,sourceHeight:s.height};
  await save(new Blob([JSON.stringify(meta,null,2)],{type:'application/json'}),'source-mask-metadata.json');
};
$('export').onclick=()=>downloadPoster();$('share').onclick=()=>downloadPoster(true);
$('download-cutout').onclick=async()=>{if(exporting)return;exporting=true;sync();try{await save(await exportCutout(state.circle),'circle-cutout.png');status('Transparent circle cutout downloaded. Use Download complete image for the full poster.');}catch(e){status(e.message,true);}finally{exporting=false;sync();}};
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy($(b.dataset.copy).value));$('copy-tags').onclick=()=>copy($('background-tag').value+' '+$('circle-tag').value);
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{const selected=x===b;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',selected);});sync();});
$('before').onclick=()=>{plain=!plain;$('before').setAttribute('aria-pressed',plain);$('before').classList.toggle('selected',plain);$('before').textContent=plain?'Show effects':'Compare original';draw();};
$('left').onclick=()=>{state.layout.x=30;sync();draw();};$('right').onclick=()=>{state.layout.x=70;sync();draw();};
$('reset-layout').onclick=()=>{state.layout={x:30,y:22,size:40,border:7};state.background.focal={x:.5,y:.5,zoom:1};state.circle.focal={x:.5,y:.3,zoom:1};sync();draw();};
$('size').oninput=e=>{state.layout.size=+e.target.value;sync();draw();};$('zoom').oninput=e=>{currentFocal().zoom=+e.target.value;sync();draw();};
for(const [id,key] of [['circle-x','x'],['circle-y','y']])$(id).oninput=e=>{state.layout[key]=clamp(Number(e.target.value)||0,0,100);draw();};
for(const [id,key] of [['focal-x','x'],['focal-y','y']])$(id).oninput=e=>{currentFocal()[key]=clamp(Number(e.target.value)||0,0,100)/100;draw();};
for(const id of ['circle-x','circle-y','focal-x','focal-y'])$(id).onchange=sync;
const pointers=new Map();let pinchDistance=1,pinchStart=1;
const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y)||1;};
const setScale=value=>{if(mode==='layout')state.layout.size=clamp(value,15,80);else currentFocal().zoom=clamp(value,1,4);};
$('poster').onpointerdown=e=>{$('poster').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){pinchDistance=distance();pinchStart=mode==='layout'?state.layout.size:currentFocal().zoom;}e.preventDefault();};
$('poster').onpointermove=e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=(e.clientX-old.x)*WIDTH/$('poster').clientWidth,dy=(e.clientY-old.y)*HEIGHT/$('poster').clientHeight;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2)setScale(pinchStart*distance()/pinchDistance);
  else if(mode==='layout'){state.layout.x=clamp(state.layout.x+dx/WIDTH*100,0,100);state.layout.y=clamp(state.layout.y+dy/HEIGHT*100,0,100);}
  else{const t=state[mode],s=t.source;if(s){const d=WIDTH*state.layout.size/100,r=fit(s.width,s.height,mode==='background'?WIDTH:d,mode==='background'?HEIGHT:d,t.focal);t.focal.x=clamp(t.focal.x-dx/r.w,0,1);t.focal.y=clamp(t.focal.y-dy/r.h,0,1);}}
  sync();draw();e.preventDefault();};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('poster').addEventListener(name,e=>pointers.delete(e.pointerId));
$('poster').addEventListener('wheel',e=>{e.preventDefault();setScale((mode==='layout'?state.layout.size:currentFocal().zoom)*Math.exp(-e.deltaY*.002));sync();draw();},{passive:false});
window.addEventListener('pagehide',()=>{segmenter.cancel();renderer.dispose();for(const key of ['background','circle']){disposeSource(state[key].source);state[key].mask?.dispose();}cancelAnimationFrame(frame);});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
sync();draw();
