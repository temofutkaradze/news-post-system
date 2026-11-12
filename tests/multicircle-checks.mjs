import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export async function checkMultiCircle(page,photo,check){
  await page.evaluate(async()=>{window.multiCircleState=(await import(document.querySelector('script[type=module]').src)).state;});
  // Compare against the actual pre-multi-circle renderer, not a rewritten test implementation.
  const legacy=execFileSync('git',['show','8d8244850ec2639e94dc3579d0aeacb95f8bf4ba:docs/js/render.js'],{encoding:'utf8'});
  const pixels=await page.evaluate(async legacy=>{
    const{createState,addCircle}=await import('./js/state.js'),{Mask}=await import('./js/masks.js'),{Renderer,exportPoster}=await import('./js/render.js');
    const oldSource=legacy.replaceAll("'./geometry.js'",JSON.stringify(new URL('./js/geometry.js',location.href).href)).replaceAll("'./images.js'",JSON.stringify(new URL('./js/images.js',location.href).href));
    const url=URL.createObjectURL(new Blob([oldSource],{type:'text/javascript'}));const {Renderer:OldRenderer}=await import(url);URL.revokeObjectURL(url);
    async function source(color){const c=document.createElement('canvas');c.width=c.height=100;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,100,100);return{width:100,height:100,bitmap:await createImageBitmap(c)};}
    const s=createState(),a=s.circle;s.background.source=await source('#204080');a.source=await source('#e02020');a.mask=new Mask(100,100);s.background.mask=new Mask(100,100);
    for(let i=0;i<10000;i++){a.mask.data[i]=i%100/99;s.background.mask.data[i]=(i%100<45)?.65:1;}
    a.focal.zoom=1.3;a.layout.y=40;
    const modern=new Renderer(),old=new OldRenderer(),c=document.createElement('canvas'),reference=document.createElement('canvas');let differences=0;
    for(const pop of [false,true])for(const smart of [false,true]){a.pop=pop;a.smart=smart;modern.render(c,s);old.render(reference,s);const x=c.getContext('2d').getImageData(0,0,1080,1350).data,y=reference.getContext('2d').getImageData(0,0,1080,1350).data;for(let i=0;i<x.length;i++)if(x[i]!==y[i])differences++;}
    a.pop=false;a.smart=false;a.focal.zoom=1;a.layout={x:50,y:50,size:40,border:7};a.mask.data.fill(1);a.mask.dirty=true;s.background.mask.data.fill(1);s.background.mask.dirty=true;
    const b=addCircle(s);b.source=await source('#20d040');b.layout={...a.layout};b.mask=new Mask(100,100,new Float32Array(10000).fill(1));
    const at=(x=540,y=675)=>{modern.render(c,s);return [...c.getContext('2d').getImageData(x,y,1,1).data].slice(0,3);};
    b.smart=true;const topSmart=at();a.smart=true;b.smart=false;const bottomSmart=at();b.smart=true;const bothSmart=at();
    const third=addCircle(s);third.source=await source('#e0c020');third.layout={...a.layout};const thirdVisible=at();s.circles.pop();third.source.bitmap.close();
    a.smart=b.smart=false;b.layout.x=80;a.layout.x=25;b.pop=true;a.pop=false;const onlyOtherPop=at(62,465);a.pop=true;const ownPop=at(62,465);a.smart=true;const ownBoth=at(62,465);
    a.mask=null;let missingBlocked=false;try{await exportPoster(s);}catch{missingBlocked=true;}
    modern.dispose();old.dispose();s.background.source.bitmap.close();a.source.bitmap.close();b.source.bitmap.close();
    return{differences,topSmart,bottomSmart,bothSmart,thirdVisible,onlyOtherPop,ownPop,ownBoth,missingBlocked};
  },legacy);
  assert.equal(pixels.differences,0,'All four one-circle effect combinations must match the original renderer byte-for-byte');
  assert.deepEqual(pixels.topSmart,[224,32,32]);assert.deepEqual(pixels.bottomSmart,[32,208,64]);assert.deepEqual(pixels.bothSmart,[32,64,128]);assert.deepEqual(pixels.thirdVisible,[224,192,32]);
  assert.deepEqual(pixels.onlyOtherPop,[32,64,128]);assert.deepEqual(pixels.ownPop,[224,32,32]);assert.deepEqual(pixels.ownBoth,[32,64,128]);assert.equal(pixels.missingBlocked,true);
  check('Multi-circle compositor preserves one-circle pixels; selective foreground, own Pop-out, overlap and missing-mask export guard');

  for(let i=0;i<4;i++){const chooser=page.waitForEvent('filechooser');await page.click('#add-circle');await(await chooser).setFiles({...photo,name:`circle-${i+2}.png`});await page.waitForFunction(name=>window.multiCircleState.circle.source?.file.name===name,`circle-${i+2}.png`);}
  const ids=await page.evaluate(async()=>{const{state}=await import(document.querySelector('script[type=module]').src),{Mask}=await import('./js/masks.js');state.background.mask=new Mask(120,150,new Float32Array(18000).fill(1));for(const c of state.circles){c.mask=new Mask(120,150,new Float32Array(18000).fill(1));c.pop=c.smart=false;}return state.circles.map(c=>c.id);});assert.equal(ids.length,5);
  await page.locator(`[data-circle-id="${ids[0]}"] .circle-choice`).click();await page.locator('#pop-toggle').check();
  await page.locator(`[data-circle-id="${ids[1]}"] .circle-choice`).click();await page.locator('#smart-toggle').check();
  const flags=await page.evaluate(async()=>(await import(document.querySelector('script[type=module]').src)).state.circles.map(c=>[c.pop,c.smart]));assert.deepEqual(flags,[[true,false],[false,true],[false,false],[false,false],[false,false]]);
  await page.locator(`[data-circle-id="${ids[0]}"] .circle-choice`).click();await page.locator(`[data-circle-id="${ids[2]}"] .circle-select`).check();await page.click('[data-bulk-effect="smart"][data-enabled="true"]');
  const smart=await page.evaluate(async()=>(await import(document.querySelector('script[type=module]').src)).state.circles.map(c=>c.smart));assert.deepEqual(smart,[true,true,true,false,false]);
  assert.equal(await page.locator('#copy-tags').isDisabled(),true);assert.equal(await page.locator('[data-copy="circle-tag"]').isDisabled(),true);
  await page.locator(`[data-circle-id="${ids[4]}"] .circle-choice`).click();await page.click('#send-backward');
  assert.equal(await page.evaluate(async()=>(await import(document.querySelector('script[type=module]').src)).state.circles[3].id),ids[4]);
  await page.evaluate(async()=>{const{state}=await import(document.querySelector('script[type=module]').src);window.deletedBitmap=state.circle.source.bitmap;});await page.click('#remove-circle');assert.equal(await page.evaluate(()=>window.deletedBitmap.width),0);
  // Active/frontmost hit selection on the actual canvas.
  await page.evaluate(async()=>{const{state}=await import(document.querySelector('script[type=module]').src);state.circles[0].layout={x:20,y:20,size:20,border:7};for(let i=1;i<state.circles.length;i++)state.circles[i].layout={x:75,y:70,size:20,border:7};});
  await page.click('[data-mode="layout"]');const rect=await page.locator('#poster').boundingBox();await page.mouse.click(rect.x+rect.width*.2,rect.y+rect.height*.2);
  assert.equal(await page.evaluate(async()=>(await import(document.querySelector('script[type=module]').src)).state.activeId),ids[0]);
  check('Five circles supported; list/canvas selection, per-circle and bulk effects, layer ordering, deletion cleanup, honest legacy tags');
  await page.evaluate(()=>{window.originalWorker=Worker;window.modelStarts=0;window.Worker=class extends window.originalWorker{postMessage(...args){window.modelStarts++;return super.postMessage(...args);}};});
  await page.route('**/js/segment-worker.js',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>setTimeout(()=>self.postMessage({kind:'result',blob:data.blob}),350);`}));
  await page.evaluate(async()=>{const{state}=await import(document.querySelector('script[type=module]').src);state.background.mask.dispose();state.background.mask=null;for(const c of state.circles)c.smart=false;});
  await page.locator(`[data-circle-id="${ids[0]}"] .circle-choice`).click();await page.locator('#smart-toggle').check();
  await page.locator(`[data-circle-id="${ids[1]}"] .circle-choice`).click();await page.locator('#smart-toggle').check();
  await page.waitForFunction(()=>!!window.multiCircleState.background.mask&&document.getElementById('cancel').hidden);
  assert.equal(await page.evaluate(()=>window.modelStarts),1,'The background model must run once for two requesting circles');
  await page.evaluate(async()=>{const{state}=await import(document.querySelector('script[type=module]').src);for(const c of state.circles.slice(0,2)){c.mask.dispose();c.mask=null;c.pop=false;}});
  assert.equal(await page.evaluate(async()=>(await import(document.querySelector('script[type=module]').src)).state.circles.filter(c=>!c.mask).length),2);
  await page.click('#select-all-circles');await page.click('[data-bulk-effect="pop"][data-enabled="true"]');
  await page.waitForFunction(()=>window.multiCircleState.circles.every(c=>!!c.mask)&&document.getElementById('cancel').hidden);
  const queueResult=await page.evaluate(async()=>({starts:window.modelStarts,circles:(await import(document.querySelector('script[type=module]').src)).state.circles.map(c=>({id:c.id,hasMask:!!c.mask,pop:c.pop})),status:document.getElementById('status').textContent}));
  assert.equal(queueResult.starts,3,JSON.stringify(queueResult));
  assert.equal(await page.evaluate(async()=>{const{state}=await import(document.querySelector('script[type=module]').src);return state.circles[0].mask!==state.circles[1].mask;}),true);
  await page.unroute('**/js/segment-worker.js');await page.evaluate(()=>window.Worker=window.originalWorker);check('Mock-worker regression: one shared background inference, only missing per-circle masks, sequential bulk processing');
  while(await page.locator('.circle-item').count()>1){await page.locator('.circle-choice').first().click();await page.click('#remove-circle');}
  await page.evaluate(async()=>{const{state}=await import(document.querySelector('script[type=module]').src);state.circle.pop=state.circle.smart=false;});
  await page.click('[data-mode="circle"]');await page.click('#reset-layout');
}
