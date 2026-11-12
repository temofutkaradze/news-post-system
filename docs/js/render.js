// SPDX-License-Identifier: AGPL-3.0-or-later
import { WIDTH, HEIGHT, fit, circleRect } from './geometry.js';
import { canvas, releaseCanvas, toBlob } from './images.js';
import { missingMasks } from './state.js';
import { renderTemplate, readyTemplateFont } from './templates.js';
const image=(g,bitmap,r)=>g.drawImage(bitmap,r.x,r.y,r.w,r.h);

/** One geometry and layer order for preview and both export sizes. Original RGB only. */
export class Renderer {
  constructor(){this.layer=canvas(1,1);this.cut=canvas(1,1);}
  render(target,state,{plain=false,scale=1}={}) {
    const width=WIDTH*scale,height=HEIGHT*scale;
    if(target.width!==width||target.height!==height){target.width=width;target.height=height;}
    for(const c of [this.layer,this.cut])if(c.width!==width||c.height!==height){c.width=width;c.height=height;}
    const g=target.getContext('2d'),l=this.layer.getContext('2d'),cut=this.cut.getContext('2d');
    for(const x of [g,l,cut]){x.resetTransform();x.clearRect(0,0,width,height);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.scale(scale,scale);}
    g.fillStyle='#10151b';g.fillRect(0,0,WIDTH,HEIGHT);
    const bg=state.background.source;
    let br;if(bg){br=fit(bg.width,bg.height,WIDTH,HEIGHT,state.background.focal);image(g,bg.bitmap,br);}
    for(const circle of state.circles){
      const ci=circle.source;if(!ci)continue;
      // Reuse scratch surfaces instead of retaining a full-poster canvas per inset.
      l.clearRect(0,0,WIDTH,HEIGHT);cut.clearRect(0,0,WIDTH,HEIGHT);
      const r=circleRect(circle.layout),f=fit(ci.width,ci.height,r.w,r.h,circle.focal),cr={...f,x:f.x+r.x,y:f.y+r.y};
      l.save();l.beginPath();l.arc(r.x+r.w/2,r.y+r.h/2,r.w/2,0,Math.PI*2);l.clip();image(l,ci.bitmap,cr);l.restore();
      l.strokeStyle='#fff';l.lineWidth=circle.layout.border;l.beginPath();l.arc(r.x+r.w/2,r.y+r.h/2,r.w/2+circle.layout.border/2,0,Math.PI*2);l.stroke();
      if(!plain&&circle.pop&&circle.mask){
        // Cutout RGB is taken from the original inset, not the segmentation output.
        image(cut,ci.bitmap,cr);cut.globalCompositeOperation='destination-in';image(cut,circle.mask.paintCanvas(),cr);cut.globalCompositeOperation='source-over';
        l.save();l.beginPath();l.rect(0,0,WIDTH,Math.max(0,r.y+r.h*circle.popHeight/100));l.clip();l.drawImage(this.cut,0,0,WIDTH,HEIGHT);l.restore();
      }
      if(!plain&&circle.smart&&state.background.mask&&br){
        // Destructive alpha on the inset layer only. The original background is untouched.
        l.globalCompositeOperation='destination-out';image(l,state.background.mask.paintCanvas(),br);l.globalCompositeOperation='source-over';
      }
      g.drawImage(this.layer,0,0,WIDTH,HEIGHT);
    }
    if(!plain)renderTemplate(g,state.editorial);
  }
  dispose(){releaseCanvas(this.layer);releaseCanvas(this.cut);}
}
export async function exportPoster(state,{scale=1,type='image/png'}={}){
  const missing=missingMasks(state);if(missing.length)throw Error(`Create or import masks for ${missing.join(', ')}, or disable those effects before exporting.`);
  if(state.editorial?.template&&state.editorial.template!=='none')await readyTemplateFont();
  const out=canvas(WIDTH*scale,HEIGHT*scale),renderer=new Renderer();
  try{renderer.render(out,state,{scale});return await toBlob(out,type,.96);}
  finally{renderer.dispose();releaseCanvas(out);}
}
export async function exportCutout(slot){
  if(!slot.source||!slot.mask)throw Error('Create a circle mask first.');
  const {width,height,bitmap}=slot.source,c=canvas(width,height),g=c.getContext('2d');
  try{g.drawImage(bitmap,0,0);g.globalCompositeOperation='destination-in';g.drawImage(slot.mask.paintCanvas(),0,0,width,height);return await toBlob(c);}
  finally{releaseCanvas(c);}
}
