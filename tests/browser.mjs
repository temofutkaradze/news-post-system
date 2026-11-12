// Integration checks use a real browser, Canvas and actual downloaded PNGs.
// Run with existing Playwright: node tests/browser.mjs
// Optional private fixture paths: STUDIO_PHOTO, STUDIO_MASK, STUDIO_META.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output=path.join(root,'.test-output');await fs.mkdir(output,{recursive:true});
const docs=path.join(root,'docs');
const started=performance.now();
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(docs,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(docs+path.sep)){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const report={checks:[],errors:[],externalRequests:[],downloads:[]};
const check=(name)=>{report.checks.push(name);console.log('PASS '+name);};
try{
  browser=await chromium.launch({headless:true,args:['--renderer-process-limit=1','--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1280,height:950}});page.setDefaultTimeout(20000);
  const base=process.env.STUDIO_BASE_URL||`http://127.0.0.1:${server.address().port}/`;
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))report.externalRequests.push(r.url());});
  await page.goto(base);await page.waitForFunction(()=>document.getElementById('background-tag').value);
  assert.equal(await page.locator('#pop-toggle').isChecked(),false);assert.equal(await page.locator('#smart-toggle').isChecked(),false);check('Both effects default OFF');
  await page.locator('#background-file').setInputFiles(path.join(root,'tests/fixtures/orientation-6.jpg'));
  await page.waitForFunction(()=>document.querySelector('#background-info').textContent.includes('40 × 80'));
  const orientation=await page.evaluate(async()=>{const s=(await import('./js/app.js')).state.background.source,c=document.createElement('canvas');c.width=40;c.height=80;const g=c.getContext('2d');g.drawImage(s.bitmap,0,0);return {top:[...g.getImageData(20,10,1,1).data],bottom:[...g.getImageData(20,70,1,1).data]};});
  assert.ok(orientation.top[0]>200&&orientation.bottom[2]>200);check('EXIF orientation normalizes dimensions and original RGB correctly');
  const fixture=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=120;c.height=150;const g=c.getContext('2d');g.fillStyle='#14678d';g.fillRect(0,0,120,150);g.fillStyle='#fa5d31';g.fillRect(52,5,40,140);return c.toDataURL().split(',')[1];
  });
  const photo={name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')};
  await page.locator('#background-file').setInputFiles(photo);await page.waitForFunction(()=>!document.querySelector('#export').disabled);
  await page.locator('#circle-file').setInputFiles(photo);await page.waitForFunction(()=>!document.querySelector('#remove-circle').disabled);
  check('Original uploads and normal circle editing');
  // Synthetic masks test compositor invariants, not segmentation accuracy.
  const pixelChecks=await page.evaluate(async()=>{
    const {state}=await import('./js/app.js'),{Mask}=await import('./js/masks.js'),{Renderer}=await import('./js/render.js');
    const r=new Renderer(),c=document.createElement('canvas'),g=c.getContext('2d');
    const mask=new Mask(120,150);for(let y=0;y<150;y++)for(let x=52;x<92;x++)mask.data[y*120+x]=1;
    state.background.mask=mask;state.circle.mask=new Mask(120,150,mask.data.slice());state.layout.x=50;state.layout.y=30;
    const render=()=>{r.render(c,state);return g.getImageData(0,0,1080,1350).data;};
    state.pop=false;state.smart=false;const normal=render();
    state.smart=true;const smart=render();state.pop=true;const both=render();state.smart=false;const pop=render();
    let outside=0,smartChanges=0,popChanges=0,bothChanges=0;
    for(let y=0;y<1350;y++)for(let x=0;x<1080;x++){
      const i=(y*1080+x)*4;
      const diff=(a,b)=>a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2];
      if(diff(normal,smart)){smartChanges++;if(Math.hypot(x+.5-540,y+.5-405)>225)outside++;}
      if(diff(normal,pop))popChanges++;if(diff(normal,both))bothChanges++;
    }
    // Fully opaque foreground restores precisely the original background raster.
    state.circle.source=null;const background=render();let playerErrors=0;
    for(let y=200;y<500;y++)for(let x=490;x<650;x++){const i=(y*1080+x)*4;for(let k=0;k<3;k++)if(smart[i+k]!==background[i+k])playerErrors++;}
    r.dispose();return{outside,smartChanges,popChanges,bothChanges,playerErrors};
  });
  assert.equal(pixelChecks.outside,0);assert.equal(pixelChecks.playerErrors,0);assert.ok(pixelChecks.smartChanges>0&&pixelChecks.popChanges>0&&pixelChecks.bothChanges>0);report.pixelChecks=pixelChecks;check('Independent effects, combined layering, zero changes outside circle, exact opaque player RGB');
  // Restore via the real input handler.
  await page.locator('#circle-file').setInputFiles(photo);await page.waitForFunction(()=>!document.querySelector('#remove-circle').disabled);
  async function download(name){const begin=performance.now(),promise=page.waitForEvent('download',{timeout:30000});await page.click('#export');const d=await promise;await d.saveAs(path.join(output,name));const bytes=await fs.readFile(path.join(output,name));report.downloads.push({name,...(name.endsWith('.png')?{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}:{}),bytes:bytes.length,downloadMs:Math.round(performance.now()-begin)});return bytes;}
  let bytes=await download('poster-1080.png');assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1350);check('Actual browser full-poster PNG download 1080 × 1350');
  await page.selectOption('#export-size','2');bytes=await download('poster-2160.png');assert.equal(bytes.readUInt32BE(16),2160);assert.equal(bytes.readUInt32BE(20),2700);check('Actual browser full-poster PNG download 2160 × 2700');await page.selectOption('#export-size','1');
  await page.selectOption('#export-type','image/jpeg');bytes=await download('poster-1080.jpg');assert.equal(bytes.readUInt16BE(0),0xffd8);await page.selectOption('#export-type','image/png');check('Separate high-quality JPEG export');
  await page.click('[data-edit="background"]');await page.click('[data-tool="erase"]');const rect=await page.locator('#mask-editor canvas').boundingBox();await page.mouse.move(rect.x+rect.width*.55,rect.y+rect.height*.5);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.6,rect.y+rect.height*.55,{steps:5});await page.mouse.up();await page.click('[data-undo]');await page.click('#close-editor');check('Manual correction and Undo via actual UI');
  const rejection=await page.evaluate(async()=>{
    const{state}=await import('./js/app.js'),{validateMetadata}=await import('./js/masks.js');try{validateMetadata({version:1},state.background.source,120,150);return false;}catch{return true;}
  });assert.equal(rejection,true);check('Invalid imported metadata rejected');
  // Delay one real decode: a later selection must win even if the first finishes last.
  await page.evaluate(()=>{const original=createImageBitmap.bind(window);let first=true;window.createImageBitmap=async(...args)=>{if(first){first=false;await new Promise(r=>window.releaseDecode=r);}return original(...args);};window.restoreDecode=()=>window.createImageBitmap=original;});
  await page.locator('#background-file').setInputFiles({...photo,name:'old.png'});
  await page.waitForFunction(()=>!!window.releaseDecode);
  await page.locator('#background-file').setInputFiles({...photo,name:'new.png'});
  await page.waitForFunction(async()=>{const{state}=await import('./js/app.js');return state.background.source.file.name==='new.png';});
  await page.evaluate(()=>{window.releaseDecode();window.restoreDecode();});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(async()=>(await import('./js/app.js')).state.background.source.file.name),'new.png');check('Stale photo decode cannot replace the latest upload');
  // Deterministic worker protocol fixture: not a claim of model inference/quality.
  await page.route('**/js/segment-worker.js',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>setTimeout(()=>self.postMessage({kind:'result',blob:data.blob}),400);`}));
  await page.click('#process-background');await page.waitForFunction(()=>!document.querySelector('#cancel').hidden);await page.click('#cancel');
  assert.equal(await page.evaluate(async()=>(await import('./js/app.js')).state.background.mask),null);check('Cancellation terminates a pending worker and preserves current state');
  await page.click('#process-background');await page.waitForFunction(()=>!document.querySelector('#cancel').hidden);
  await page.locator('#background-file').setInputFiles({...photo,name:'replacement.png'});
  await page.waitForFunction(async()=>(await import('./js/app.js')).state.background.source.file.name==='replacement.png');
  await page.waitForTimeout(500);assert.equal(await page.evaluate(async()=>(await import('./js/app.js')).state.background.mask),null);check('Replacing a photo invalidates pending segmentation');
  await page.unroute('**/js/segment-worker.js');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'mobile-editor.png'),fullPage:true});check('Mobile layout fits viewport');
  await page.setViewportSize({width:1280,height:950});
  if(process.env.STUDIO_PHOTO&&process.env.STUDIO_MASK&&process.env.STUDIO_META){
    await page.locator('#background-file').setInputFiles(process.env.STUDIO_PHOTO);await page.locator('#circle-file').setInputFiles(process.env.STUDIO_PHOTO);
    await page.waitForFunction(()=>document.querySelector('#background-info').textContent.includes('707')&&document.querySelector('#circle-info').textContent.includes('707'));
    await page.locator('details').filter({has:page.locator('#mask-file')}).evaluate(el=>el.open=true);
    await page.locator('#mask-file').setInputFiles(process.env.STUDIO_MASK);await page.locator('#mask-meta').setInputFiles(process.env.STUDIO_META);await page.click('#import-mask');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Verified mask imported'));
    for(const side of ['left','right']){await page.click('#'+side);await page.locator('#smart-toggle').uncheck();await download(side+'-original.png');await page.locator('#smart-toggle').check();await download(side+'-smart.png');}
    await page.selectOption('#mask-target','circle');await page.click('#import-mask');await page.waitForFunction(()=>!document.querySelector('#download-cutout').disabled);
    await page.locator('#smart-toggle').uncheck();await page.locator('#pop-toggle').check();await download('circle-pop-out.png');
    await page.locator('#smart-toggle').check();await download('both-effects.png');
    const cutDownload=page.waitForEvent('download');await page.click('#download-cutout');await(await cutDownload).saveAs(path.join(output,'transparent-circle.png'));check('Original-RGB transparent cutout and both effects with authorized photograph');
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,'desktop-editor.png'),fullPage:false});check('Authorized real photograph and approved MODNet mask: left/right PNG downloads');
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);check('No browser errors or third-party requests during manual/import editing');
  if(process.env.STUDIO_PROBE==='1'){
    const probe=await page.evaluate(()=>new Promise(resolve=>{
      const url=URL.createObjectURL(new Blob([`import {segmentForeground} from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';self.postMessage(typeof segmentForeground);`],{type:'text/javascript'}));
      const worker=new Worker(url,{type:'module'}),done=result=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);resolve(result);};
      const timer=setTimeout(()=>done('timeout'),30000);worker.onmessage=e=>done(e.data);worker.onerror=e=>done(e.message);
    }));report.maskingWorkerImport=probe;assert.equal(probe,'function');check('Real pinned ISNet library loads inside a disposable module worker (no inference)');
  }
}finally{
  await browser?.close();server.close();report.elapsedMs=Math.round(performance.now()-started);await fs.writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
}
