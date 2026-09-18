(() => {
 'use strict';
 const root=document.documentElement;
 const mobile=matchMedia('(pointer: coarse), (max-width: 1024px), (max-height: 620px)');
 let frame=0,previousWidth=window.innerWidth,restHeight=window.innerHeight;
 const isInput=element=>element instanceof HTMLElement && element.matches('input:not([type=range]),textarea,[contenteditable="true"]');
 function update(){
  frame=0;
  if(!mobile.matches){
   root.style.removeProperty('--app-height');
   root.style.removeProperty('--viewport-top');
   root.classList.remove('input-open');
   return;
  }
  const vv=window.visualViewport;
  const focused=isInput(document.activeElement);
  const width=window.innerWidth;
  if(Math.abs(width-previousWidth)>80){restHeight=window.innerHeight;previousWidth=width;}
  if(!focused)restHeight=window.innerHeight;
  // Ignore pinch zoom: do not resize or reposition the game while the player zooms.
  if(vv&&Math.abs(vv.scale-1)>.05)return;
  const height=Math.round(vv?Math.min(vv.height,window.innerHeight):window.innerHeight);
  const keyboard=focused && restHeight-height>100;
  root.style.setProperty('--app-height',height+'px');
  root.style.setProperty('--viewport-top',(keyboard&&vv?Math.round(vv.offsetTop):0)+'px');
  root.classList.toggle('input-open',keyboard);
  if(keyboard){
   const input=document.activeElement;
   const panel=input.closest('.puzzle,.modal>article');
   if(panel){
    const rect=input.getBoundingClientRect(),bounds=panel.getBoundingClientRect();
    if(rect.bottom>bounds.bottom-20)panel.scrollTop+=rect.bottom-bounds.bottom+24;
    else if(rect.top<bounds.top+16)panel.scrollTop-=bounds.top+20-rect.top;
   }
  }
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 window.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('orientationchange',()=>{schedule();setTimeout(schedule,250);},{passive:true});
 window.addEventListener('pageshow',schedule,{passive:true});
 document.addEventListener('focusin',schedule);
 document.addEventListener('focusout',()=>{schedule();setTimeout(schedule,200);});
 if(window.visualViewport){
  window.visualViewport.addEventListener('resize',schedule,{passive:true});
  window.visualViewport.addEventListener('scroll',schedule,{passive:true});
 }
 if(mobile.addEventListener)mobile.addEventListener('change',schedule);
 schedule();
})();
