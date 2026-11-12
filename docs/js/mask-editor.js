// SPDX-License-Identifier: AGPL-3.0-or-later
import { blankMask, brush, keepConnected } from './masks.js';
import { clamp } from './geometry.js';
/** Source-coordinate correction UI. No brush stroke alters photograph RGB. */
export class MaskEditor {
  constructor(dialog, changed) {
    this.dialog=dialog;this.changed=changed;this.canvas=dialog.querySelector('canvas');this.g=this.canvas.getContext('2d');
    this.zoom=1;this.center={x:.5,y:.5};this.tool='add';
    dialog.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{this.tool=b.dataset.tool;this.buttons();});
    dialog.querySelector('[data-undo]').onclick=()=>{this.slot.mask.undo();this.draw();this.changed();};
    dialog.querySelector('[data-clear-region]').onclick=()=>{this.slot.region=null;this.draw();};
    dialog.querySelector('[data-zoom]').oninput=e=>{this.zoom=+e.target.value;this.draw();};
    this.canvas.onpointerdown=e=>this.down(e);this.canvas.onpointermove=e=>this.move(e);
    this.canvas.onpointerup=this.canvas.onpointercancel=e=>this.up(e);
    dialog.addEventListener('close',()=>{this.pointer=null;this.slot=null;this.g.clearRect(0,0,this.canvas.width,this.canvas.height);});
  }
  open(slot,label) {
    this.slot=slot;if(!slot.mask)slot.mask=blankMask(slot.source);
    this.zoom=1;this.center={x:.5,y:.5};this.dialog.querySelector('[data-zoom]').value=1;
    this.dialog.querySelector('h2').textContent=label;this.dialog.showModal();this.buttons();this.draw();
  }
  buttons(){this.dialog.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool===this.tool));}
  geometry(){const s=this.slot.source,scale=Math.min(900/s.width,740/s.height)*this.zoom;
    return {scale,x:this.canvas.width/2-this.center.x*s.width*scale,y:this.canvas.height/2-this.center.y*s.height*scale};}
  point(e){const r=this.canvas.getBoundingClientRect(),t=this.geometry();return {x:((e.clientX-r.left)*this.canvas.width/r.width-t.x)/t.scale,y:((e.clientY-r.top)*this.canvas.height/r.height-t.y)/t.scale};}
  down(e){if(!this.slot)return;this.canvas.setPointerCapture(e.pointerId);const p=this.point(e);this.pointer={last:p,start:p,clientX:e.clientX,clientY:e.clientY};
    if(['add','erase','person'].includes(this.tool))this.slot.mask.snapshot();
    if(this.tool==='person'){try{const m=this.slot.mask,s=this.slot.source;keepConnected(m,p.x/s.width*m.width,p.y/s.height*m.height);this.changed();}catch(error){this.dialog.querySelector('[data-help]').textContent=error.message;}this.draw();}
    else if(this.tool==='add'||this.tool==='erase')this.stroke(p,p);
  }
  stroke(a,b){const m=this.slot.mask,s=this.slot.source,ratio=m.width/s.width;
    const radius=+this.dialog.querySelector('[data-brush]').value/this.geometry().scale*ratio;
    const x=a.x*ratio,y=a.y*ratio,xx=b.x*ratio,yy=b.y*ratio;
    const count=Math.max(1,Math.ceil(Math.hypot(xx-x,yy-y)/Math.max(1,radius/3)));
    for(let i=0;i<=count;i++)brush(m,x+(xx-x)*i/count,y+(yy-y)*i/count,radius,this.tool==='add',+.01*this.dialog.querySelector('[data-soft]').value);
    this.draw();this.changed();
  }
  move(e){if(!this.pointer||!this.slot)return;const p=this.point(e),s=this.slot.source;
    if(this.tool==='pan'){const r=this.canvas.getBoundingClientRect(),t=this.geometry();this.center.x=clamp(this.center.x-(e.clientX-this.pointer.clientX)*this.canvas.width/r.width/t.scale/s.width,0,1);this.center.y=clamp(this.center.y-(e.clientY-this.pointer.clientY)*this.canvas.height/r.height/t.scale/s.height,0,1);this.draw();}
    else if(this.tool==='add'||this.tool==='erase')this.stroke(this.pointer.last,p);
    else if(this.tool==='region'){const a=this.pointer.start;this.slot.region={x:clamp(Math.min(a.x,p.x),0,s.width),y:clamp(Math.min(a.y,p.y),0,s.height),w:0,h:0};this.slot.region.w=clamp(Math.max(a.x,p.x),0,s.width)-this.slot.region.x;this.slot.region.h=clamp(Math.max(a.y,p.y),0,s.height)-this.slot.region.y;this.draw();}
    this.pointer.last=p;this.pointer.clientX=e.clientX;this.pointer.clientY=e.clientY;
  }
  up(){if(this.slot?.region&&(this.slot.region.w<32||this.slot.region.h<32))this.slot.region=null;this.pointer=null;if(this.slot)this.draw();}
  draw(){if(!this.slot)return;const s=this.slot.source,t=this.geometry(),g=this.g;
    g.clearRect(0,0,this.canvas.width,this.canvas.height);g.fillStyle='#101319';g.fillRect(0,0,this.canvas.width,this.canvas.height);
    g.drawImage(s.bitmap,t.x,t.y,s.width*t.scale,s.height*t.scale);
    g.save();g.globalAlpha=.42;g.drawImage(this.slot.mask.paintCanvas(),t.x,t.y,s.width*t.scale,s.height*t.scale);g.restore();
    if(this.slot.region){const r=this.slot.region;g.strokeStyle='#d6ff69';g.lineWidth=2;g.setLineDash([8,5]);g.strokeRect(t.x+r.x*t.scale,t.y+r.y*t.scale,r.w*t.scale,r.h*t.scale);g.setLineDash([]);}
  }
}
