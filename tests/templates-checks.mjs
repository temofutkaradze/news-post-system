// Focused real-Canvas checks; no segmentation or external model downloads.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),docs=path.join(root,'docs'),out=path.join(root,'.test-output/templates');
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(docs,'.'+(new URL(req.url,'http://local').pathname==='/'?'/index.html':new URL(req.url,'http://local').pathname));if(!file.startsWith(docs+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--disable-gpu','--renderer-process-limit=1']});
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.STUDIO_BASE_URL||`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>document.querySelector('#background-tag').value);
  const fixture=process.env.STUDIO_PHOTO?await fs.readFile(process.env.STUDIO_PHOTO):Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1080;c.height=1350;const g=c.getContext('2d'),grad=g.createLinearGradient(0,0,1080,1350);grad.addColorStop(0,'#227c96');grad.addColorStop(1,'#899556');g.fillStyle=grad;g.fillRect(0,0,1080,1350);return c.toDataURL().split(',')[1];}),'base64');
  await page.locator('#background-file').setInputFiles({name:'authorized-photo.png',mimeType:'image/png',buffer:fixture});
  await page.waitForFunction(()=>!document.querySelector('#export').disabled);
  await page.evaluate(async()=>{window.s=(await import(document.querySelector('script[type=module]').src)).state;window.t=await import('./js/templates.js');window.r=await import('./js/render.js?v=editorial-templates-1');await t.readyTemplateFont();});
  assert.equal(await page.locator('#template option').count(),5);
  assert.equal(await page.locator('#editorial-fields').isVisible(),false);
  const originals=await page.evaluate(()=>{const c=document.createElement('canvas'),renderer=new r.Renderer();renderer.render(c,s);const before=c.toDataURL();renderer.render(c,{...s,editorial:undefined});const identical=before===c.toDataURL();renderer.dispose();return identical;});assert.ok(originals,'Original composition is pixel-identical');
  const texts={
    'headline-subtitle':['DE BRUYNE HAS A STRANGE\nGAP ON HIS *RESUME*','He has won Premier League Player of the Season\ntwice, but never once won Player of the Month'],
    'large-headline':['SPAIN WIN THE 2010\nWORLD CUP WITH\nJUST *EIGHT GOALS*',''],
    'news-red':['THE ONLY PLAYER TO SCORE\nIN *FIVE DIFFERENT WORLD CUPS.*',''],
    'did-you-know':['THE ONLY PLAYER TO SCORE\nIN *FIVE DIFFERENT WORLD CUPS.*','']
  };
  for(const [template,[headline,subtitle]]of Object.entries(texts)){
    await page.selectOption('#template',template);await page.fill('#headline',headline);
    if(template==='headline-subtitle')await page.fill('#subtitle',subtitle);
    assert.equal(await page.locator('#subtitle-field').isVisible(),template==='headline-subtitle');
    const result=await page.evaluate(async()=>{
      const c=document.createElement('canvas'),renderer=new r.Renderer();renderer.render(c,s);const baseline=c.toDataURL();
      const blob=await r.exportPoster(s),bitmap=await createImageBitmap(blob),d=document.createElement('canvas');d.width=bitmap.width;d.height=bitmap.height;d.getContext('2d').drawImage(bitmap,0,0);
      const pixels=d.getContext('2d').getImageData(0,0,1080,1350).data;let yellow=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>240&&pixels[i+1]>240&&pixels[i+2]<15)yellow++;
      const chars=t.markedText('*FIVE\nDIFFERENT* WORLD');
      const wrapped=t.fitText(c.getContext('2d'),'LONGWORD'.repeat(35),{width:880,height:166,size:60});
      const checks={width:bitmap.width,height:bitmap.height,identical:baseline===d.toDataURL(),yellow,asterisk:chars.some(c=>c.char==='*'),multiline:chars.filter(c=>c.yellow&&c.char!=='\n').length,fits:wrapped.height<=166};
      bitmap.close();renderer.dispose();return{...checks,png:d.toDataURL().split(',')[1]};
    });
    assert.equal(result.width,1080);assert.equal(result.height,1350);assert.equal(result.identical,true);assert.ok(result.yellow>100);assert.equal(result.asterisk,false);assert.equal(result.multiline,13);assert.equal(result.fits,true);
    await fs.writeFile(path.join(out,`${template}.png`),Buffer.from(result.png,'base64'));
    await page.selectOption('#export-type','image/jpeg');const download=page.waitForEvent('download');await page.click('#export');const file=await download;await file.saveAs(path.join(out,`${template}.jpg`));
    console.log(`PASS ${template}: canonical PNG, JPEG UI export, multiline highlights, text fitting, preview/export renderer parity`);
  }
  // Default circles/effects continue using the same compositor under the overlay.
  for(const viewport of [{width:1366,height:768},{width:1280,height:950},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>{scrollTo(0,0);document.querySelector('.inspector').scrollTop=0;});
    const metrics=await page.evaluate(()=>{const p=document.querySelector('#poster').getBoundingClientRect(),m=document.querySelector('#modes').getBoundingClientRect();return{ratio:p.width/p.height,above:m.bottom<=p.top,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.ok(Math.abs(metrics.ratio-.8)<.002);assert.ok(metrics.above);assert.equal(metrics.overflow,false);
    await page.screenshot({path:path.join(out,`editor-${viewport.width}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('PASS original pixels unchanged without template; desktop/mobile toolbar, aspect ratio and no horizontal overflow; no browser errors');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
