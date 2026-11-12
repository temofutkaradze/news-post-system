// SPDX-License-Identifier: AGPL-3.0-or-later
import { canvas, releaseCanvas, loadImage } from './images.js';
import { clamp } from './geometry.js';

/** Float32 working alpha. Only the Canvas paint cache is quantized to alpha8. */
export class Mask {
  constructor(width, height, data = new Float32Array(width * height)) {
    this.width = width; this.height = height; this.data = data; this.dirty = true; this.history = [];
  }
  paintCanvas() {
    if (!this.cache) this.cache = canvas(this.width, this.height);
    if (this.dirty) {
      const g = this.cache.getContext('2d'), pixels = g.createImageData(this.width, this.height);
      for (let i = 0; i < this.data.length; i++) {
        pixels.data[i*4] = pixels.data[i*4+1] = pixels.data[i*4+2] = 255;
        pixels.data[i*4+3] = Math.round(clamp(this.data[i], 0, 1) * 255);
      }
      g.putImageData(pixels, 0, 0); this.dirty = false;
    }
    return this.cache;
  }
  snapshot() {
    // One undo per operation; at most 16 MiB, independent of edit count.
    this.history = [this.data.slice()];
  }
  undo() { if (this.history.length) { this.data = this.history.pop(); this.dirty = true; } }
  dispose() { releaseCanvas(this.cache); this.cache = null; this.data = new Float32Array(); this.history = []; }
}
export function blankMask(source) {
  const s = Math.min(1, 2048 / Math.max(source.width, source.height));
  return new Mask(Math.round(source.width*s), Math.round(source.height*s));
}
export function brush(mask, x, y, radius, add, softness) {
  const minX = Math.max(0, Math.floor(x-radius)), maxX = Math.min(mask.width-1, Math.ceil(x+radius));
  const minY = Math.max(0, Math.floor(y-radius)), maxY = Math.min(mask.height-1, Math.ceil(y+radius));
  for (let yy=minY; yy<=maxY; yy++) for (let xx=minX; xx<=maxX; xx++) {
    const d = Math.hypot(xx+.5-x, yy+.5-y) / radius;
    if (d >= 1) continue;
    const coverage = d <= 1-softness ? 1 : (1-d)/Math.max(.001,softness);
    const i=yy*mask.width+xx;
    mask.data[i] = add ? Math.max(mask.data[i], coverage) : Math.min(mask.data[i], 1-coverage);
  }
  mask.dirty=true;
}
/** Optional connected-person selection. Never automatically claims to identify the intended person. */
export function keepConnected(mask, x, y) {
  const w=mask.width, h=mask.height, seed=clamp(Math.floor(y),0,h-1)*w+clamp(Math.floor(x),0,w-1);
  if (mask.data[seed] < .35) throw Error('Click inside an opaque part of the person. Use Add to restore disconnected hands.');
  const seen=new Uint8Array(w*h), queue=new Int32Array(w*h);let head=0,tail=1;queue[0]=seed;seen[seed]=1;
  while(head<tail){const i=queue[head++],xx=i%w;
    for(const n of [xx>0?i-1:-1,xx<w-1?i+1:-1,i-w,i+w]) if(n>=0&&n<w*h&&!seen[n]&&mask.data[n]>=.1){seen[n]=1;queue[tail++]=n;}
  }
  // Preserve the soft fringe of the selected component, not isolated spectators.
  for(let i=0;i<w*h;i++) if(!seen[i]) {
    const xx=i%w,yy=Math.floor(i/w);let near=false;
    for(let dy=-2;dy<=2&&!near;dy++)for(let dx=-2;dx<=2;dx++){
      const nx=xx+dx,ny=yy+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h&&seen[ny*w+nx]){near=true;break;}
    }
    if(!near)mask.data[i]=0;
  }
  mask.dirty=true;
}
export function validateMetadata(meta, source, width, height) {
  if (meta?.version!==1 || meta.coordinates!=='oriented-full-source' || meta.orientation!=='browser-exif-normalized' || !['gray8','alpha8'].includes(meta.encoding))
    throw Error('Mask metadata must declare oriented full-source coordinates and gray8/alpha8 encoding.');
  if(meta.sourceSha256!==source.hash || meta.sourceWidth!==source.width || meta.sourceHeight!==source.height || width!==source.width || height!==source.height)
    throw Error('This mask belongs to another photograph, orientation or resolution. Your current mask was kept.');
}
export async function maskFromImage(blob, source, { metadata, cutout=false, region }={}) {
  const image=await loadImage(blob);
  try {
    if(metadata)validateMetadata(metadata,source,image.width,image.height);
    if(cutout&&(image.width!==source.width||image.height!==source.height))throw Error('Cutout dimensions must match the oriented original circle photograph.');
    const mask=blankMask(source), c=canvas(mask.width,mask.height),g=c.getContext('2d',{willReadFrequently:true});
    try {
      const r=region||{x:0,y:0,w:source.width,h:source.height};
      g.drawImage(image.bitmap,r.x/source.width*mask.width,r.y/source.height*mask.height,r.w/source.width*mask.width,r.h/source.height*mask.height);
      const rgba=g.getImageData(0,0,mask.width,mask.height).data;
      let transparent=false;
      for(let i=0;i<mask.data.length;i++){
        if(metadata?.encoding==='gray8'){
          if(rgba[i*4+3]!==255)throw Error('gray8 masks must be opaque grayscale. Use alpha8 metadata for transparency masks.');
          if(Math.abs(rgba[i*4]-rgba[i*4+1])>1||Math.abs(rgba[i*4]-rgba[i*4+2])>1)throw Error('The imported gray8 mask is not grayscale.');
          mask.data[i]=rgba[i*4]/255;
        }else mask.data[i]=rgba[i*4+3]/255;
        if(rgba[i*4+3]<255)transparent=true;
      }
      if(cutout&&!transparent)throw Error('This PNG has no transparent cutout. Import a transparent subject PNG or create a mask.');
      return mask;
    } finally {releaseCanvas(c);}
  } finally {image.bitmap.close();}
}
