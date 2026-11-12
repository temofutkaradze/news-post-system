// SPDX-License-Identifier: AGPL-3.0-or-later
/** Small thumbnail canvases; never keep additional full-resolution decoded images. */
export class CircleList {
  constructor(container,select){this.container=container;this.select=select;this.rows=new Map();this.order='';}
  render(state){
    const ids=new Set(state.circles.map(c=>c.id));
    for(const[id,row]of this.rows)if(!ids.has(id)){row.element.remove();this.rows.delete(id);}
    for(const circle of state.circles){
      let row=this.rows.get(circle.id);
      if(!row){
        const element=document.createElement('div'),checkbox=document.createElement('input'),button=document.createElement('button'),thumb=document.createElement('canvas'),text=document.createElement('span');
        element.className='circle-item';element.dataset.circleId=circle.id;checkbox.type='checkbox';checkbox.className='circle-select';checkbox.setAttribute('aria-label',`Include ${circle.label} in bulk actions`);
        thumb.width=thumb.height=40;thumb.setAttribute('aria-hidden','true');button.type='button';button.className='circle-choice';button.append(thumb,text);element.append(checkbox,button);
        checkbox.onchange=()=>this.select(circle.id,true);button.onclick=e=>this.select(circle.id,e.ctrlKey||e.metaKey||e.shiftKey);
        row={element,checkbox,button,thumb,text,source:null};this.rows.set(circle.id,row);
      }
      row.checkbox.checked=state.selectedIds.has(circle.id);row.button.setAttribute('aria-pressed',String(state.activeId===circle.id));row.element.classList.toggle('active',state.activeId===circle.id);
      row.text.textContent=`${circle.label}${circle.source?'':' · add photo'}${circle.pop?' · Pop-out':''}${circle.smart?' · Foreground':''}`;
      if(row.source!==circle.source){row.source=circle.source;const g=row.thumb.getContext('2d');g.clearRect(0,0,40,40);if(circle.source){const s=circle.source,scale=Math.max(40/s.width,40/s.height);g.drawImage(s.bitmap,(40-s.width*scale)/2,(40-s.height*scale)/2,s.width*scale,s.height*scale);}}
    }
    const order=state.circles.map(c=>c.id).reverse().join(',');
    if(order!==this.order){for(const c of [...state.circles].reverse())this.container.append(this.rows.get(c.id).element);this.order=order;}
    this.container.classList.toggle('single',state.circles.length===1);
  }
}
