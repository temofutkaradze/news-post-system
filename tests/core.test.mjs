import test from 'node:test';
import assert from 'node:assert/strict';
import { fit, circleRect, cropTags } from '../docs/js/geometry.js';
import { dimensions } from '../docs/js/images.js';
import { Mask, brush, keepConnected, validateMetadata } from '../docs/js/masks.js';
import { createState, addCircle, selectCircle, removeCircle, reorderCircle, bulkEffect, hitCircle, projectEstimate, projectBudget, missingMasks } from '../docs/js/state.js';

test('stable circle identities, independent settings, bulk selection and layer order',()=>{
  const s=createState(),a=s.circle,b=addCircle(s),c=addCircle(s);a.source=b.source=c.source={width:120,height:150};
  a.pop=true;b.smart=true;assert.equal(c.pop,false);assert.equal(c.smart,false);
  selectCircle(s,a.id);s.layout.x=45;assert.equal(b.layout.x,30);assert.equal(c.layout.x,30);
  selectCircle(s,c.id,true);bulkEffect(s,'pop',true);assert.equal(a.pop,true);assert.equal(c.pop,true);assert.equal(b.pop,false);
  reorderCircle(s,a.id,1);assert.equal(s.circles[1],a);const id=c.id;removeCircle(s,c.id);assert.ok(!s.circles.some(x=>x.id===id));assert.notEqual(addCircle(s).id,id);
  assert.ok(s.selectedIds.has(s.activeId));
});
test('hit selection follows front-to-back order and memory is image-based, not a three-circle cap',()=>{
  const s=createState();for(let i=0;i<5;i++){const c=i?addCircle(s):s.circle;c.source={width:100,height:100};c.layout.x=30;}
  assert.equal(hitCircle(s,324,297),s.circles.at(-1));assert.equal(s.circles.length,5);assert.ok(projectEstimate(s)<projectBudget(2));
  assert.ok(projectEstimate(s,s.circle,{width:16000,height:16000})>projectBudget(2));
});
test('missing masks are reported per enabled circle and shared background only once',()=>{
  const s=createState(),a=s.circle,b=addCircle(s);a.source=b.source={width:10,height:10};a.pop=true;a.smart=b.smart=true;
  assert.deepEqual(missingMasks(s),[`${a.label} Pop-out`,'shared background foreground']);s.background.mask={};a.mask={};assert.deepEqual(missingMasks(s),[]);
});

test('cover geometry preserves aspect and clamps focal points without empty bars',()=>{
  assert.deepEqual(fit(100,100,100,200,{x:.5,y:.5,zoom:1}),{x:-50,y:0,w:200,h:200});
  const r=fit(700,1000,1080,1350,{x:.2,y:.8,zoom:2});assert.equal(r.w/r.h,.7);assert.ok(r.x<=0&&r.x+r.w>=1080);assert.ok(r.y<=0&&r.y+r.h>=1350);
});
test('left and right use the same canonical radius; existing tag format retained',()=>{
  const l=circleRect({x:30,y:22,size:40}),r=circleRect({x:70,y:22,size:40});assert.equal(l.w,432);assert.equal(r.x-l.x,432);assert.equal(l.y,r.y);
  const f={x:.5,y:.3,zoom:1};assert.deepEqual(cropTags({background:{focal:f},circle:{focal:f},layout:{x:30,y:22,size:40},pop:false,popHeight:50}),{background:'[b:50,30,1.00]',circle:'[c:50,30,1.00,40,30,22,0,50]'});
});
test('mask validation binds exact source bytes, oriented size and encoding',()=>{
  const s={hash:'abc',width:707,height:1000},m={version:1,coordinates:'oriented-full-source',orientation:'browser-exif-normalized',encoding:'gray8',sourceSha256:'abc',sourceWidth:707,sourceHeight:1000};
  validateMetadata(m,s,707,1000);for(const patch of [{sourceSha256:'wrong'},{sourceHeight:999},{coordinates:'crop'},{encoding:'unknown'},{orientation:'raw'}])assert.throws(()=>validateMetadata({...m,...patch},s,707,1000));assert.throws(()=>validateMetadata(m,s,512,512));
});
test('brush edits alpha locally, keeps Float32 precision, and supports bounded undo',()=>{
  const m=new Mask(20,20);m.snapshot();brush(m,10,10,4,true,.5);assert.equal(m.data[0],0);assert.equal(m.data[10*20+10],1);assert.ok(m.data.some(x=>x>0&&x<1));brush(m,10,10,2,false,0);assert.equal(m.data[210],0);m.undo();assert.ok(m.data.every(x=>x===0));assert.equal(m.history.length,0);
});
test('explicit connected-person selection removes disconnected spectators',()=>{
  const m=new Mask(30,20);for(let y=2;y<15;y++)for(let x=2;x<10;x++)m.data[y*30+x]=1;for(let y=2;y<15;y++)for(let x=20;x<27;x++)m.data[y*30+x]=1;keepConnected(m,4,4);assert.equal(m.data[4*30+4],1);assert.equal(m.data[4*30+22],0);assert.throws(()=>keepConnected(m,28,18));
});
test('image headers checked before decode; unsupported or corrupt images rejected',()=>{
  const b=new ArrayBuffer(30),v=new DataView(b);v.setUint32(0,0x89504e47);v.setUint32(4,0x0d0a1a0a);v.setUint32(16,1080);v.setUint32(20,1350);assert.deepEqual(dimensions(b),{width:1080,height:1350,type:'image/png'});assert.throws(()=>dimensions(new ArrayBuffer(2)));assert.throws(()=>dimensions(new ArrayBuffer(40)));
});
