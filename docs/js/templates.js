// SPDX-License-Identifier: AGPL-3.0-or-later
// Typography is laid out once in canonical 1080 x 1350 coordinates at every scale.
export const TEMPLATES=['none','headline-subtitle','large-headline','news-red','did-you-know'];
export const HEADLINE_FONT='"Studio Anton", "Arial Narrow", sans-serif';
export async function readyTemplateFont(){
  if(typeof document!=='undefined'&&document.fonts)await document.fonts.load(`64px ${HEADLINE_FONT}`);
}

/** Asterisks are markup, including across explicit line breaks. Never draw them. */
export function markedText(text,{uppercase=false}={}){
  let yellow=false;const chars=[];
  for(const character of String(text||'')){
    if(character==='*'){yellow=!yellow;continue;}
    for(const char of uppercase?character.toUpperCase():character)chars.push({char,yellow});
  }
  return chars;
}
const lineWidth=(g,line)=>g.measureText(line.map(c=>c.char).join('')).width;
export function wrapText(g,chars,width){
  const lines=[];let line=[],word=[];
  const trim=()=>{while(line.at(-1)?.char===' ')line.pop();};
  const flushWord=()=>{
    if(!word.length)return;
    if(line.length&&lineWidth(g,[...line,...word])>width){trim();lines.push(line);line=[];}
    // Long unbroken words are split instead of clipped or horizontally distorted.
    for(const c of word){if(line.length&&lineWidth(g,[...line,c])>width){lines.push(line);line=[];}line.push(c);}word=[];
  };
  for(const c of chars){
    if(c.char==='\n'){flushWord();trim();lines.push(line);line=[];}
    else if(/\s/.test(c.char)){flushWord();if(line.length)line.push({...c,char:' '});}
    else word.push(c);
  }
  flushWord();trim();lines.push(line);return lines;
}
export function fitText(g,text,{width,height,size,font=HEADLINE_FONT,uppercase=true,leading=1.15}){
  const chars=markedText(text,{uppercase});let lines;
  // No ellipses or lost words: bounded editor input can always shrink to fit.
  for(;size>=4;size--){g.font=`${size}px ${font}`;lines=wrapText(g,chars,width);if(lines.length*size*leading<=height&&lines.every(l=>lineWidth(g,l)<=width))break;}
  return {lines,size,height:lines.length*size*leading,lineHeight:size*leading,font};
}
function paintText(g,block,cx,top){
  g.font=`${block.size}px ${block.font}`;g.textAlign='left';g.textBaseline='alphabetic';
  block.lines.forEach((line,i)=>{
    let x=cx-lineWidth(g,line)/2;const y=top+block.size+i*block.lineHeight;
    // Prefix advances preserve kerning/spacing across highlight boundaries.
    let prefix='';for(let start=0;start<line.length;){let end=start+1;while(end<line.length&&line[end].yellow===line[start].yellow)end++;
      const run=line.slice(start,end).map(c=>c.char).join('');g.fillStyle=line[start].yellow?'#ffff00':'#ffffff';g.fillText(run,x+g.measureText(prefix).width,y);prefix+=run;start=end;
    }
  });
}
export function renderTemplate(g,editorial){
  if(!editorial||!TEMPLATES.includes(editorial.template)||editorial.template==='none')return;
  const {template,headline='',subtitle=''}=editorial,framed=template==='news-red'||template==='did-you-know';
  g.save();
  const gradient=g.createLinearGradient(0,framed?790:660,0,1350);
  gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(.38,framed?'rgba(0,0,0,.12)':'rgba(0,0,0,.5)');gradient.addColorStop(1,framed?'rgba(0,0,0,.48)':'rgba(0,0,0,.98)');
  g.fillStyle=gradient;g.fillRect(0,framed?790:660,1080,1350);
  if(framed){
    const color=template==='news-red'?'#a22e2a':'#f5d428',label=template==='news-red'?'NEWS':'DID YOU KNOW';
    const x=64,y=1014,w=952,h=244;g.strokeStyle=color;g.lineWidth=2.5;
    g.font=`${template==='news-red'?62:48}px ${HEADLINE_FONT}`;
    const tracking=template==='news-red'?12:0,labelWidth=g.measureText(label).width+tracking*(label.length-1),gap=labelWidth/2+22;
    // Open top edge lets the label sit on the photo, with no opaque cover patch.
    g.beginPath();g.moveTo(540-gap,y);g.lineTo(x,y);g.lineTo(x,y+h);g.lineTo(x+w,y+h);g.lineTo(x+w,y);g.lineTo(540+gap,y);g.stroke();
    g.textAlign='left';g.textBaseline='middle';g.fillStyle=color;
    let labelX=540-labelWidth/2;for(const char of label){g.fillText(char,labelX,y);labelX+=g.measureText(char).width+tracking;}
    const block=fitText(g,headline,{width:880,height:166,size:60});paintText(g,block,540,y+51+(166-block.height)/2);
  }else if(template==='headline-subtitle'){
    const sub=fitText(g,subtitle,{width:940,height:112,size:39,font:'Arial, sans-serif',uppercase:false,leading:1.2});
    const title=fitText(g,headline,{width:940,height:210,size:80});
    const bottom=1258,subHeight=subtitle.trim()?sub.height:0;
    if(subHeight)paintText(g,sub,540,bottom-subHeight);
    paintText(g,title,540,bottom-subHeight-(subHeight?32:0)-title.height);
  }else{
    const block=fitText(g,headline,{width:930,height:310,size:94});paintText(g,block,540,1252-block.height);
  }
  g.restore();
}
