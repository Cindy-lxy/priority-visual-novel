'use strict';
const ASSET_BASE=new URL('assets/',document.currentScript.src||location.href).href;
const $=s=>document.querySelector(s),copy=v=>JSON.parse(JSON.stringify(v));
const SAVE_KEY='vn:'+GAME_ID+':v3';
const fresh=()=>({schema:3,storyRevision:7,c:0,n:0,b:null,flags:{},progress:{},collected:[],log:[],seen:[],unlocked:0,checkpoints:{},decisions:{},decisionOrder:[],lastDecision:null,endings:[],ended:false,endingId:null,gate:true});
let state=fresh(),review=false,mainState=null,storageOK=true,lastFocus=null,typeTimer=null,typing=false,fullLine='',lastTypedKey='',displayedBG='';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)L(e,text);return e;}
function btn(text,cls,fn){const b=el('button',cls,text);b.type='button';b.onclick=e=>{e.stopPropagation();fn();};return b;}
function current(){const n=CHAPTERS[state.c].nodes[state.n];return state.b?n.options[state.b.option].branch[state.b.cursor]:n;}
function key(){return `${state.c}:${state.n}`+(state.b?`:b:${state.b.option}:${state.b.cursor}`:'');}
function prog(){return state.progress[key()]||(state.progress[key()]={});}
function toast(t){L($('#toast'),t);$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2500);}
function save(){if(review)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));storageOK=true;}catch(e){storageOK=false;toast('当前浏览器无法保存，进度暂留在本页');}}
function nodeForKey(k){const a=k.split(':'),n=CHAPTERS[Number(a[0])]?.nodes[Number(a[1])];return a[2]==='b'?n?.options?.[Number(a[3])]?.branch?.[Number(a[4])]:n;}
function valid(s){if(!s||s.schema!==3||!Number.isInteger(s.c)||!Number.isInteger(s.n)||!CHAPTERS[s.c]?.nodes[s.n]||!s.flags||!s.progress||!s.checkpoints||!Array.isArray(s.collected)||!Array.isArray(s.log)||!Array.isArray(s.seen)||!Array.isArray(s.endings)||!Number.isInteger(s.unlocked)||s.unlocked<0||s.unlocked>=CHAPTERS.length||s.ended&&!ENDINGS[s.endingId])return false;if(s.b&&!CHAPTERS[s.c].nodes[s.n]?.options?.[s.b.option]?.branch?.[s.b.cursor])return false;for(const [k,p] of Object.entries(s.progress)){const n=nodeForKey(k);if(!n||!p||typeof p!=='object')return false;if(p.i!==undefined&&(!Number.isInteger(p.i)||p.i<0||p.i>(n.messages?.length??n.steps?.length??100)))return false;if(p.selected!==undefined&&!n.options?.[p.selected])return false;if(p.found&&(!Array.isArray(p.found)||p.found.some(x=>!n.items?.some(i=>i.id===x))))return false;}return true;}
function load(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;const s=JSON.parse(raw);migrateFinalStory(s);if(!valid(s))throw Error('bad save');state=s;normalizeDecisions();return true;}catch(e){toast('存档无法读取，可以重新开始；旧版存档不会被删除');return false;}}
function migrateStoryV3(s){
  if(!s||typeof s!=='object'||s.storyRevision>=3)return;
  const fromV1=s.storyRevision!==2;
  let remap=k=>k;
  if(fromV1){
    // Revision 2 expanded chapter-two chat and inserted one task.
    const messageMap=[0,1,10,11,12,13,14,15,16,23];
    remap=k=>{if(typeof k!=='string')return k;const a=k.split(':');if(a[0]==='1'){if(a[1]==='1'&&a[2]==='chat'&&messageMap[Number(a[3])]!==undefined)a[3]=String(messageMap[Number(a[3])]);else if(a[1]==='1'&&a[2]==='reply'&&messageMap[Number(a[3])-1]!==undefined)a[3]=String(messageMap[Number(a[3])-1]+1);else if(Number(a[1])>=3)a[1]=String(Number(a[1])+1);}return a.join(':');};
    if(s.c===1&&s.n>=3)s.n++;
    if(s.progress&&typeof s.progress==='object')s.progress=Object.fromEntries(Object.entries(s.progress).map(([k,p])=>{if(k==='1:1'&&p&&typeof p==='object'){if(p.i>0&&messageMap[p.i-1]!==undefined)p.i=messageMap[p.i-1]+1;if(p.replies)p.replies=Object.fromEntries(Object.entries(p.replies).map(([j,v])=>[messageMap[Number(j)]??j,v]));}return [k,p];}));
  }
  // Revision 3 inserts the transfer-night sequence before chapter-six's boarding-gate clue.
  const shiftAirport=k=>{if(typeof k!=='string'||!k.startsWith('5:'))return k;const a=k.split(':');if(Number(a[1])>=4)a[1]=String(Number(a[1])+26);return a.join(':');};
  const migrateKey=k=>shiftAirport(remap(k));
  if(s.c===5&&s.n>=4)s.n+=26;
  if(s.progress&&typeof s.progress==='object')s.progress=Object.fromEntries(Object.entries(s.progress).map(([k,p])=>[migrateKey(k),p]));
  if(Array.isArray(s.seen)){
    s.seen=s.seen.map(migrateKey);
    if(fromV1&&Array.isArray(s.log))s.seen.forEach((id,i)=>{const m=/^1:1:chat:(\d+)$/.exec(id);if(m&&s.log[i]){const entry=CHAPTERS[1].nodes[1].messages[Number(m[1])];if(entry)s.log[i]={who:entry.who,text:entry.text};}});
  }
  if(s.checkpoints&&typeof s.checkpoints==='object')Object.values(s.checkpoints).forEach(migrateStoryV3);
  if(s.decisions&&typeof s.decisions==='object'){Object.values(s.decisions).forEach(migrateStoryV3);s.decisions=Object.fromEntries(Object.entries(s.decisions).map(([id,v])=>[migrateKey(id),v]));}
  if(Array.isArray(s.decisionOrder))s.decisionOrder=s.decisionOrder.map(migrateKey);
  s.lastDecision=migrateKey(s.lastDecision);
  s.storyRevision=3;
}
function migrateStoryV4(s){
 if(!s||typeof s!=='object'||s.storyRevision>=4)return;
 migrateStoryV3(s);
 const mapKey=k=>{if(typeof k!=='string')return k;const a=k.split(':');if(REV4_INDEX[+a[0]]?.[+a[1]]!==undefined)a[1]=String(REV4_INDEX[+a[0]][+a[1]]);return a.join(':');};
 if(REV4_INDEX[s.c]?.[s.n]!==undefined)s.n=REV4_INDEX[s.c][s.n];
 if(s.progress)s.progress=Object.fromEntries(Object.entries(s.progress).map(([k,v])=>[mapKey(k),v]));
 if(Array.isArray(s.seen))s.seen=s.seen.map(mapKey);
 if(s.checkpoints)Object.values(s.checkpoints).forEach(migrateStoryV4);
 if(s.decisions){Object.values(s.decisions).forEach(migrateStoryV4);s.decisions=Object.fromEntries(Object.entries(s.decisions).map(([k,v])=>[mapKey(k),v]));}
 if(Array.isArray(s.decisionOrder))s.decisionOrder=s.decisionOrder.map(mapKey);
 s.lastDecision=mapKey(s.lastDecision);s.storyRevision=4;
}
function returnChapterCheckpoint(source){
 const flags=copy(source.flags||{}),laterItems=new Set();
 const visit=n=>{if(n.collect)laterItems.add(n.collect);(n.options||[]).forEach(o=>{if(o.flag)delete flags[o.flag];(o.branch||[]).forEach(visit);});(n.messages||[]).forEach(m=>(m.options||[]).forEach(o=>{if(o.flag)delete flags[o.flag];}));};
 CHAPTERS.slice(6).forEach(c=>c.nodes.forEach(visit));
 const seen=[],log=[];(source.seen||[]).forEach((k,i)=>{if(Number(k.split(':')[0])<6){seen.push(k);if(source.log?.[i])log.push(copy(source.log[i]));}});
 return {storyRevision:6,c:6,n:0,b:null,flags,progress:copy(Object.fromEntries(Object.entries(source.progress||{}).filter(([k])=>Number(k.split(':')[0])<6))),collected:(source.collected||[]).filter(t=>!laterItems.has(t)),seen,log,ended:false,endingId:null,gate:true};
}
function migrateStory(s){
 if(!s||typeof s!=='object'||s.storyRevision>=5)return;
 migrateStoryV4(s);
 const oldC=s.c,oldN=s.n;
 const mapKey=k=>{if(typeof k!=='string')return k;const a=k.split(':'),to=REV5_INDEX[+a[0]]?.[+a[1]];if(to){a[0]=String(to[0]);a[1]=String(to[1]);}return a.join(':');};
 const to=REV5_INDEX[oldC]?.[oldN];if(to){s.c=to[0];s.n=to[1];}
 if(s.progress)s.progress=Object.fromEntries(Object.entries(s.progress).map(([k,v])=>[mapKey(k),v]));
 if(Array.isArray(s.seen))s.seen=s.seen.map(mapKey);
 if(s.checkpoints){Object.values(s.checkpoints).forEach(migrateStory);s.checkpoints=Object.fromEntries(Object.values(s.checkpoints).map(v=>[v.c,v]));}
 if(s.decisions){Object.values(s.decisions).forEach(migrateStory);s.decisions=Object.fromEntries(Object.entries(s.decisions).map(([k,v])=>[mapKey(k),v]));}
 if(Array.isArray(s.decisionOrder))s.decisionOrder=s.decisionOrder.map(mapKey);
 s.lastDecision=mapKey(s.lastDecision);
 if(Number.isInteger(s.unlocked)){if(s.unlocked>=6)s.unlocked++;if(oldC===5&&oldN>=RETURN_START_V4)s.unlocked=Math.max(s.unlocked,6);s.unlocked=Math.max(s.unlocked,s.c);}
 s.storyRevision=5;
 if(s.checkpoints&&s.unlocked>=6&&!s.checkpoints[6]){
  const source=Object.values(s.decisions||{}).filter(v=>v.c===6).sort((a,b)=>a.n-b.n)[0]||s.checkpoints[7]||s;
  s.checkpoints[6]=returnChapterCheckpoint(source);
 }
 s.storyRevision=5;
}
function migrateStoryV6(s){
 if(!s||typeof s!=='object'||s.storyRevision>=6)return;
 migrateStory(s);
 const bc=CHAPTERS.find(c=>c.id==='fivepm'),bn=bc?.nodes.find(n=>n.type==='chat'&&n.messageRevision==='short-boundary-v1');
 if(bc&&bn){
  const chatKey=CHAPTERS.indexOf(bc)+':'+bc.nodes.indexOf(bn),ends=bn.previousMessageEnds,p=s.progress?.[chatKey];
  if(p&&Number.isInteger(p.i)&&p.i>=0&&p.i<ends.length){p.i=ends[p.i];p.done=p.i===bn.messages.length;}
  const prefix=chatKey+':chat:';
  if(Array.isArray(s.seen)&&Array.isArray(s.log)){
   const seen=[],logs=[];
   s.seen.forEach((id,i)=>{
    const j=typeof id==='string'&&id.startsWith(prefix)?Number(id.slice(prefix.length)):-1;
    if(Number.isInteger(j)&&j>=0&&j<ends.length-1){
     const start=j===0?0:ends[j];
     for(let k=start;k<ends[j+1];k++){const msg=bn.messages[k];seen.push(prefix+k);logs.push({who:msg.who,text:msg.text});}
    }else{seen.push(id);logs.push(s.log[i]);}
   });
   s.seen=seen;s.log=logs;
  }
 }
 if(s.checkpoints)Object.values(s.checkpoints).forEach(migrateStoryV6);
 if(s.decisions)Object.values(s.decisions).forEach(migrateStoryV6);
 s.storyRevision=6;
}
function migrateStoryV7(s){
 if(!s||typeof s!=='object'||s.storyRevision>=7)return;
 migrateStoryV6(s);
 const mapKey=k=>{if(typeof k!=='string')return k;const a=k.split(':'),m=REV7_INDEX[+a[0]]?.[+a[1]];if(Number.isInteger(m)&&m>=0)a[1]=String(m);return a.join(':');};
 const m=REV7_INDEX[s.c]?.[s.n];if(Number.isInteger(m)&&m>=0)s.n=m;
 if(s.progress)s.progress=Object.fromEntries(Object.entries(s.progress).map(([k,v])=>[mapKey(k),v]));
 if(Array.isArray(s.seen))s.seen=s.seen.map(mapKey);
 if(s.checkpoints){Object.values(s.checkpoints).forEach(migrateStoryV7);s.checkpoints=Object.fromEntries(Object.values(s.checkpoints).map(v=>[v.c,v]));}
 if(s.decisions){Object.values(s.decisions).forEach(migrateStoryV7);s.decisions=Object.fromEntries(Object.entries(s.decisions).map(([k,v])=>[mapKey(k),v]));}
 if(Array.isArray(s.decisionOrder))s.decisionOrder=s.decisionOrder.map(mapKey);
 s.lastDecision=mapKey(s.lastDecision);
 s.storyRevision=7;
}
const migrateFinalStory=migrateStoryV7;
function log(id,who,text){if(state.seen.includes(id))return;state.seen.push(id);state.log.push({who,text});}
function collect(t){if(t&&!state.collected.includes(t))state.collected.push(t);}
function checkpoint(){return copy({storyRevision:7,c:state.c,n:0,b:null,flags:state.flags,progress:state.progress,collected:state.collected,log:state.log,seen:state.seen,ended:false,endingId:null,gate:true});}
// Decision snapshots contain timeline data only, never nested snapshot maps.
function decisionCatalog(){const entries=[];CHAPTERS.forEach((c,ci)=>c.nodes.forEach((n,ni)=>{const visit=(node,k)=>{if(node.type==='choice')entries.push({id:k,c:ci,label:node.text,kind:'剧情选择'});if(node.type==='chat')node.messages.forEach((m,j)=>{if(m.options)entries.push({id:k+':chat:'+j,c:ci,label:m.text,kind:'聊天选择'});});if(ci===0&&node.kind==='connect')entries.push({id:k,c:ci,label:node.title,kind:'好友申请'});};const k=ci+':'+ni;visit(n,k);(n.options||[]).forEach((o,oi)=>(o.branch||[]).forEach((b,bi)=>visit(b,k+':b:'+oi+':'+bi)));}));return entries;}
function timeline(){return copy({storyRevision:7,c:state.c,n:state.n,b:state.b,flags:state.flags,progress:state.progress,collected:state.collected,log:state.log,seen:state.seen,unlocked:state.unlocked,ended:false,endingId:null,gate:false});}
function rememberDecision(id=key()){if(!state.decisions[id]){state.decisions[id]=timeline();state.decisionOrder.push(id);}state.lastDecision=id;}
function normalizeDecisions(){const catalog=decisionCatalog(),old=state.decisions;state.decisions={};state.decisionOrder=Array.isArray(state.decisionOrder)?state.decisionOrder:[];state.decisionOrder=[...new Set(state.decisionOrder)].filter(id=>{const s=old?.[id];if(!catalog.some(x=>x.id===id)||!s||!valid({...fresh(),...s,checkpoints:{},endings:state.endings}))return false;state.decisions[id]=s;return true;});if(!state.decisions[state.lastDecision])state.lastDecision=state.decisionOrder.at(-1)||null;
// Older saves already at an early ending can reconstruct that exact local decision.
if(state.ended&&state.endingId==='missed'&&!state.lastDecision){const n=current(),id=key();if(n.type==='choice'||n.kind==='connect'){const snap=timeline(),p=snap.progress[id]||{};if(n.type==='choice'){n.options.forEach(o=>{delete snap.flags[o.flag];});delete p.selected;delete p.reply;}else{delete p.done;snap.collected=snap.collected.filter(x=>x!==n.collect);}snap.progress[id]=p;const removed=snap.seen.map((x,i)=>x===id+':selection'||x===id+':reply'||x===id+':solved'?i:-1).filter(i=>i>=0);snap.log=snap.log.filter((_,i)=>!removed.includes(i));snap.seen=snap.seen.filter((_,i)=>!removed.includes(i));state.decisions[id]=snap;state.decisionOrder=[id];state.lastDecision=id;}}}
function decisionState(source,id){const snap=source.decisions[id];if(!snap)return null;const at=source.decisionOrder.indexOf(id),order=source.decisionOrder.slice(0,at+1);return {...fresh(),...copy(snap),checkpoints:copy(Object.fromEntries(Object.entries(source.checkpoints).filter(([c])=>Number(c)<=snap.c))),decisions:copy(Object.fromEntries(order.map(k=>[k,source.decisions[k]]))),decisionOrder:order,lastDecision:id,endings:source.endings.slice()};}
function restoreDecision(id,mode='retry'){const source=mode==='retry'?state:(review?mainState:state),next=decisionState(source,id);if(!next){toast('这个选择点还没有记录，请先经过这里');return;}if(mode==='review'){if(!review)mainState=copy(state);review=true;}else if(mode==='main'){review=false;mainState=null;}state=next;lastTypedKey='';closeModal();render();}
function chooseDecision(id){const main=review?mainState:state,entry=decisionCatalog().find(x=>x.id===id);if(!main.decisions[id])return;const root=openModal('回到这个选择？');root.append(el('p','decision-question',entry.label),el('p','modal-intro','重新选择会回到这一刻，之后的主线进度将重置；已发现的结局保留。也可以独立回看，不改动当前进度。'),btn('从这里重新选择','gold decision-resume',()=>restoreDecision(id,'main')),btn('独立回看，不覆盖主线','ghost decision-review',()=>restoreDecision(id,'review')));}
function stopTyping(){clearInterval(typeTimer);typing=false;if(fullLine)L($('#lineText'),fullLine);L($('#nextBtn'),'继续 ▾');}
function setLine(text,k){stopTyping();fullLine=text;L($('#lineText'),text);if(lastTypedKey===k||matchMedia('(prefers-reduced-motion: reduce)').matches)return;lastTypedKey=k;const chars=Array.from(T(text));let i=0;typing=true;$('#lineText').textContent='';L($('#nextBtn'),'显示整句 ▾');typeTimer=setInterval(()=>{i+=2;$('#lineText').textContent=chars.slice(0,i).join('');if(i>=chars.length)stopTyping();},24);}
function scene(bg){if(displayedBG!==bg){displayedBG=bg;const im=$('#sceneImage');im.src=ASSET_BASE+bg+'.webp';im.dataset.bg=bg;$('.stage').style.setProperty('--scene',`url("${ASSET_BASE+bg}.webp")`);im.classList.remove('arrive');void im.offsetWidth;im.classList.add('arrive');}A($('#sceneImage'),'alt',CHAPTERS[state.c].title+' · 故事场景');}
function restoreScene(){const c=CHAPTERS[state.c];let bg=c.bg,time=c.time;c.nodes.slice(0,state.n+1).forEach(n=>{if(n.bg)bg=n.bg;if(n.time)time=n.time;});if(state.b){CHAPTERS[state.c].nodes[state.n].options[state.b.option].branch.slice(0,state.b.cursor+1).forEach(n=>{if(n.bg)bg=n.bg;});}const n=current(),p=prog();if(n.kind==='memories'&&p.last&&!p.done)bg=n.items.find(x=>x.id===p.last)?.bg||bg;scene(bg);L($('#chTime'),time);}
function render(){stopTyping();const c=CHAPTERS[state.c],n=current();$('#cover').hidden=true;$('#play').hidden=false;document.body.classList.add('playing');$('#dialogue').hidden=true;$('#chat').hidden=true;$('#task').hidden=true;$('#ending').hidden=true;$('#chapterGate').hidden=true;$('#choices').replaceChildren();$('#reviewBar').hidden=!review;L($('#collectionCount'),(review?mainState:state).collected.length);L($('#chTitle'),c.title);L($('#sceneBadge'),c.token);L($('#nodeCount'),state.b?'支线 · '+(state.b.cursor+1):'CH '+String(state.c+1).padStart(2,'0'));$('#progressFill').style.width=(state.n+1)/c.nodes.length*100+'%';restoreScene();L($('#hint'),state.b?'支线 · 这一刻由你选择':'点击画面继续 · 空格亦可');
if(state.ended){renderEnding();save();return;}if(state.gate){renderGate();save();return;}
if(n.type==='chat')renderChat(n);else if(n.type==='task')renderTask(n);else renderLine(n);save();}
function renderGate(){const root=$('#chapterGate'),c=CHAPTERS[state.c];root.replaceChildren();root.hidden=false;root.append(el('p','kicker','CHAPTER '+String(state.c+1).padStart(2,'0')),el('span','gate-ornament','✳'),el('h2','',c.title),el('p','gate-time',c.time),btn('进入这一章 →','gold gate-start',()=>{state.gate=false;lastTypedKey='';render();}));L($('#hint'),'一个故事，一段新的选择');}
function renderLine(n){$('#dialogue').hidden=false;const p=prog();$('#dialogue').classList.toggle('is-choice',n.type==='choice'&&p.selected===undefined);const who=CHARACTERS[n.who]||CHARACTERS.narrator;L($('#speaker'),who.name);$('#speaker').style.color=who.color;log(key(),n.who,n.text);$('#responseText').hidden=true;$('#nextBtn').hidden=n.type==='choice'&&p.selected===undefined;
if(n.type==='choice'&&p.selected===undefined){rememberDecision();fullLine=n.text;L($('#lineText'),n.text);n.options.forEach((o,i)=>$('#choices').append(btn(o.text,'choice',()=>{p.selected=i;p.reply=o.reply;state.flags[o.flag]=true;log(key()+':selection','girl',o.text);log(key()+':reply','girl',o.reply);if(o.ending){finish(o.ending);return;}render();})));L($('#hint'),'请选择 · 不同选择会打开不同经历');}
else if(n.type==='choice')setLine(p.reply,key()+':reply');else setLine(n.text,key());}
function advance(){if(!$('#modal').hidden||$('#play').hidden||state.gate||state.ended)return;if(typing){stopTyping();return;}const n=current(),p=prog();if(n.type==='choice'&&p.selected===undefined)return;if(['task','chat'].includes(n.type)&&!p.done)return;
if(state.b){const branch=CHAPTERS[state.c].nodes[state.n].options[state.b.option].branch;state.b.cursor++;if(state.b.cursor<branch.length){render();return;}state.b=null;state.n++;}
else if(n.type==='choice'){const o=n.options[p.selected];if(o.ending){finish(o.ending);return;}if(o.branch?.length){state.b={option:p.selected,cursor:0};render();return;}if(o.next){state.c=o.next.c;state.n=o.next.n;}else state.n++;}
else state.n++;
if(state.n>=CHAPTERS[state.c].nodes.length){if(state.c===CHAPTERS.length-1){state.n=CHAPTERS[state.c].nodes.length-1;finish('be-yourself');return;}state.c++;state.n=0;state.b=null;state.gate=true;state.unlocked=Math.max(state.unlocked,state.c);state.checkpoints[state.c]=checkpoint();}render();}
function taskFinish(n,p){p.done=true;collect(n.collect);log(key()+':solved','system',n.done);render();}
function renderChat(n){const root=$('#chat');root.hidden=false;root.replaceChildren();const p=prog();if(p.i===undefined)p.i=1;if(!p.replies)p.replies={};root.append(el('div','phone-notch'),el('div','phone-header',n.title));const body=el('div','chat-body');body.id='chatBody';n.messages.slice(0,p.i).forEach((m,j)=>{const bubble=el('div','bubble '+m.who),speaker=el('small','',CHARACTERS[m.who]?.name||'');bubble.append(speaker,el('p','',m.text));if(m.photo){const photo=btn('','chat-photo-button',()=>showPhoto(m.photo,m.caption)),im=el('img','chat-photo');A(photo,'aria-label','放大：'+(m.caption||'故事照片'));im.src=ASSET_BASE+m.photo+'.webp';A(im,'alt',m.caption||'故事照片');im.onload=()=>{body.scrollTop=body.scrollHeight;};photo.append(im,el('small','photo-caption','轻点查看照片'));bubble.append(photo);}body.append(bubble);log(key()+':chat:'+j,m.who,m.text);if(p.replies[j]!==undefined){const o=m.options[p.replies[j]],reply=el('div','bubble girl');reply.append(el('p','',o.text),el('small','inner-reply',o.reply));body.append(reply);}});const controls=el('div','chat-controls'),m=n.messages[p.i-1];if(m.options&&p.replies[p.i-1]===undefined){rememberDecision(key()+':chat:'+(p.i-1));m.options.forEach((o,i)=>controls.append(btn(o.text,'chat-choice',()=>{p.replies[p.i-1]=i;state.flags[o.flag]=true;log(key()+':reply:'+p.i,'girl',o.text+' '+o.reply);render();})));}else if(p.i<n.messages.length)controls.append(btn('读下一条消息 ↓','chat-next',()=>{p.i++;render();}));else{p.done=true;controls.append(btn('收起手机，继续 →','chat-finish',advance));}root.append(body,controls);requestAnimationFrame(()=>{body.scrollTop=body.scrollHeight;});L($('#hint'),'聊天为剧情模拟 · 不连接真实账号');}
function reordered(length){return Array.from({length},(_,i)=>(i+1)%length);}
function renderTask(n){const root=$('#task');root.hidden=false;root.replaceChildren();const p=prog();root.append(el('p','kicker',state.b?'SIDE STORY · 支线互动':'A LITTLE MYSTERY · 轻解谜'),el('h2','',n.title),el('p','task-description',n.description));L($('#hint'),'线索都在这一刻里 · 答错可以再试');
if(n.kind!=='focus'||p.done){const bg=n.photo||displayedBG||CHAPTERS[state.c].bg,photo=btn('','puzzle-photo-button',()=>showPhoto(bg,n.caption||n.title)),im=el('img','puzzle-photo');A(photo,'aria-label','放大：'+(n.caption||n.title));im.src=ASSET_BASE+bg+'.webp';A(im,'alt',n.caption||n.title+' · 场景画面');photo.append(im,el('span','puzzle-photo-caption',n.photo?'观察图片 · 轻点放大':'这一刻的场景 · 轻点放大'));root.append(photo);}
if(p.done){if(n.letter)appendLetter(root,n);root.append(el('div','task-done','✓ '+n.done),btn('继续故事 →','gold task-next',advance));return;}
const feedback=()=>{if(p.feedback)root.append(el('p','task-feedback',p.feedback));};
if(n.kind==='connect'){if(state.c===0&&!state.b)rememberDecision();root.append(el('div','connect-symbol','◇'),btn(n.button,'gold connect-btn',()=>taskFinish(n,p)));if(state.c===0&&!state.b)root.append(btn('还是不加了，离开摊位','text-btn cancel-connect',()=>{rememberDecision();finish('missed');}));}
else if(n.kind==='clue'){root.append(el('p','clue-question',n.question));const list=el('div','puzzle-options');reordered(n.options.length).forEach(i=>{const o=n.options[i],b=btn(o.text,'clue-option',()=>{if(o.correct){p.answer=i;taskFinish(n,p);}else{p.feedback=o.wrong||'再看看线索。';p.attempts=(p.attempts||0)+1;render();}});b.dataset.answer=i;list.append(b);});root.append(list);feedback();}
else if(['sequence','pdf','wait'].includes(n.kind)){if(p.i===undefined)p.i=0;root.append(el('div','task-track',p.i+' / '+n.steps.length));if(n.kind==='pdf'){const pre=el('div','pdf-preview');pre.append(el('small','','比赛材料.pdf'),el('p','',p.i>=3?'▤ 图像已嵌入，准备导出':'预览空白 · 还未排除原因'));root.append(pre);}
if(n.kind==='wait'){root.append(el('div','clock',(n.steps[Math.max(0,p.i-1)]||'').slice(0,5)));}
const list=el('div','step-list'),order=n.kind==='wait'?n.steps.map((_,i)=>i):reordered(n.steps.length);order.forEach(i=>{const b=btn((i<p.i?'✓ ':'')+n.steps[i],'step'+(i<p.i?' completed':''),()=>{if(i!==p.i){p.feedback=n.wrong;render();return;}p.i++;p.feedback='';if(p.i===n.steps.length)taskFinish(n,p);else render();});b.dataset.step=i;b.disabled=i<p.i;list.append(b);});root.append(list);if(n.kind==='pdf')root.append(btn('不改设置，再导出一次','text-btn wrong-option',()=>{p.feedback=n.wrong;render();}));feedback();}
else if(n.kind==='focus'){if(p.value===undefined)p.value=15;const frame=el('div','focus-preview');const im=el('img');im.src=ASSET_BASE+(n.photo||'scene2')+'.webp';A(im,'alt',n.caption||'摄影练习 · 教学楼的光');const reticle=el('span','reticle','＋');frame.append(im,reticle);const label=el('label','focus-label','焦点 '),value=el('output','',String(p.value));label.append(value);const input=el('input');input.type='range';input.min='0';input.max='100';input.step='1';input.value=p.value;input.id='focusRange';A(input,'aria-label','焦点位置');const update=()=>{im.style.filter=`blur(${Math.min(8,Math.abs(p.value-n.target)/7)}px)`;reticle.classList.toggle('sharp',Math.abs(p.value-n.target)<=5);value.value=String(p.value);L(value,String(p.value));};input.oninput=()=>{p.value=Number(input.value);update();save();};update();root.append(frame,label,input,btn('按下快门','gold shutter',()=>{if(Math.abs(p.value-n.target)<=5)taskFinish(n,p);else{p.feedback='还没有对清。把滑块移到 65 附近，让框变亮。';render();}}));feedback();}
else if(n.kind==='pin'){const input=el('input','pin-input');input.inputMode='numeric';input.maxLength=n.length;input.placeholder='·'.repeat(n.length);input.value=p.input||'';input.id='pinInput';A(input,'aria-label',F('输入{length}位密码',{length:n.length}));input.oninput=()=>{p.input=input.value.replace(/\D/g,'').slice(0,n.length);input.value=p.input;save();};root.append(input,btn('确认打开','gold pin-submit',()=>{if(input.value===n.code)taskFinish(n,p);else{p.feedback='密码不对。'+n.hint;render();}}),btn('看一下线索','text-btn pin-hint',()=>{p.feedback=n.hint;render();}));feedback();}
else if(['box','memories','stamps'].includes(n.kind)){if(!p.found)p.found=[];root.append(el('div','task-track',p.found.length+' / '+n.items.length));const grid=el('div','memory-grid');n.items.forEach((item,i)=>{const b=btn('','memory-card'+(p.found.includes(item.id)?' found':''),()=>{if(n.kind==='memories'&&!p.found.includes(item.id)&&i!==p.found.length){p.feedback='先从最初的那段记忆开始。';render();return;}if(!p.found.includes(item.id))p.found.push(item.id);p.last=item.id;p.feedback=item.text;log(key()+':memory:'+item.id,'narrator',item.text);render();});b.dataset.memory=item.id;b.append(el('span','memory-symbol',p.found.includes(item.id)?'✓':item.icon),el('span','',item.name));grid.append(b);});root.append(grid);feedback();if(p.found.length===n.items.length)root.append(btn(n.kind==='memories'?'回到此刻 →':'合上回忆盒 →','gold collect-finish',()=>taskFinish(n,p)));}
else if(n.kind==='meal')renderMeal(root,n,p);
else if(n.kind==='archive')renderArchive(root,n,p);
else throw Error('Unknown task kind '+n.kind);
}
function appendLetter(root,n){const paper=el('article','letter-paper');paper.append(el('h3','',n.letterTitle));n.letter.forEach(t=>paper.append(el('p','',t)));root.append(paper);}
function renderArchive(root,n,p){
 const validDate=v=>/^\d{4}$/.test(v)&&+v.slice(0,2)>=1&&+v.slice(0,2)<=12&&+v.slice(2)>=1&&+v.slice(2)<=[31,29,31,30,31,30,31,31,30,31,30,31][+v.slice(0,2)-1];
 if(!p.locked){const label=el('label','archive-label',n.datePrompt),input=el('input','pin-input');input.id='anniversaryInput';input.inputMode='numeric';input.maxLength=4;input.value=p.date||'';input.placeholder='MMDD';A(input,'aria-label',n.datePrompt);input.oninput=()=>{p.date=input.value.replace(/\D/g,'').slice(0,4);input.value=p.date;save();};label.append(input);root.append(label,btn(n.lockLabel,'gold archive-lock',()=>{if(validDate(p.date||'')){p.locked=true;p.feedback='';render();}else{p.feedback=n.dateError;render();}}));}
 else{root.append(el('p','anniversary-note',F('初遇日便签：{month} 月 {day} 日',{month:p.date.slice(0,2),day:p.date.slice(2)})));const label=el('label','archive-label',n.passwordPrompt),input=el('input','pin-input');input.id='archivePassword';input.inputMode='numeric';input.maxLength=4;input.value=p.input||'';A(input,'aria-label',n.passwordPrompt);input.oninput=()=>{p.input=input.value.replace(/\D/g,'').slice(0,4);input.value=p.input;save();};label.append(input);root.append(label,btn(n.unlockLabel,'gold archive-unlock',()=>{if(p.input===p.date){taskFinish(n,p);root.scrollTop=0;}else{p.feedback=n.passwordError;render();}}));}
 if(p.feedback)root.append(el('p','task-feedback',p.feedback));
}
function renderMeal(root,n,p){
 const list=el('div','meal-menu');n.foods.forEach((food,i)=>{const b=btn(food.icon+' '+food.name,'meal-choice'+(p.food===i?' active':''),()=>{p.food=i;p.bites=0;render();});b.dataset.food=i;b.setAttribute('aria-pressed',String(p.food===i));list.append(b);});root.append(list);
 if(p.food===undefined)return;
 const food=n.foods[p.food],plate=el('div','meal-plate'),remaining=3-(p.bites||0);for(let i=0;i<remaining;i++)plate.append(el('span','food-piece',food.icon));if(!remaining)plate.append(el('span','plate-empty','✓ 吃完啦'));
 const status=el('p','meal-status',remaining?F('{name} · 还剩 {count} 口',{name:food.name,count:remaining}):food.taste);status.setAttribute('aria-live','polite');root.append(plate,status);
 if(remaining){const eat=btn(n.eatLabel,'gold eat-bite',()=>{eat.disabled=true;L(eat,'正在吃…');eat.setAttribute('aria-busy','true');eat.classList.add('is-eating');list.classList.add('menu-locked');list.querySelectorAll('button').forEach(b=>b.disabled=true);const piece=plate.lastElementChild;piece.classList.add('being-eaten');p.bites=(p.bites||0)+1;save();const snapshot=state;setTimeout(()=>{if(state===snapshot&&prog()===p&&plate.isConnected)render();},matchMedia('(prefers-reduced-motion: reduce)').matches?40:650);});root.append(eat);}
 else root.append(btn(n.finishLabel,'gold meal-finish',()=>taskFinish(n,p)));
}
function finish(id){stopTyping();state.ended=true;state.endingId=id;state.gate=false;if(!state.endings.includes(id))state.endings.push(id);render();}
function renderEnding(){const e=ENDINGS[state.endingId];scene(state.endingId==='missed'?'scene1':'scene8');$('#ending').hidden=false;L($('#endingTag'),e.tag);L($('#endingTitle'),e.title);L($('#endingText'),e.text);L($('#endingNote'),e.note);$('#rewindBtn').hidden=!state.decisions[state.lastDecision];L($('#rewindBtn'),state.endingId==='missed'?'回到刚才的选择':'回到最近的选择');L($('#hint'),'已记录结局 · 重选不必从头开始');}
function startNew(){const known=(review?mainState:state).endings.slice();review=false;mainState=null;state=fresh();state.endings=known;state.checkpoints[0]=checkpoint();lastTypedKey='';closeModal();render();}
function requestNew(){if(!state.seen.length&&!state.ended){startNew();return;}const root=openModal('重新开始这段故事？');root.append(el('p','','本次阅读进度将从第一章开始，已经看过的结局会保留。旧版本存档不受影响。'),btn('从第一章重新开始','gold restart-confirm',startNew),btn('继续当前故事','text-btn',()=>{closeModal();render();}));}
function cover(){if(review){state=mainState;mainState=null;review=false;}stopTyping();$('#play').hidden=true;$('#cover').hidden=false;document.body.classList.remove('playing');$('#continueBtn').hidden=!state.seen.length&&!state.gate;$('#continueBtn').hidden=state.seen.length===0&&Object.keys(state.checkpoints).length===0;L($('#collectionCount'),state.collected.length);save();}
function openModal(title){stopTyping();lastFocus=document.activeElement;L($('#modalTitle'),title);$('#modalBody').replaceChildren();$('#modal').hidden=false;$('#closeModal').focus();return $('#modalBody');}
function closeModal(){$('#modal').hidden=true;if(lastFocus&&document.contains(lastFocus))lastFocus.focus();}
function openChapters(){const main=review?mainState:state,root=openModal('章节与选择节点'),catalog=decisionCatalog();root.append(el('p','modal-intro','点击章节从章首独立回看；点击已到达的选择点，可以直接重选或独立回看。灰色节点需先经过，旧存档未记录的节点需重新经过。'));CHAPTERS.forEach((c,i)=>{const section=el('section','chapter-section'),b=btn('','chapter-link',()=>{if(!main.checkpoints[i])return;if(!review)mainState=copy(state);state={...fresh(),...copy(main.checkpoints[i]),unlocked:main.unlocked,checkpoints:copy(main.checkpoints),endings:main.endings.slice()};review=true;lastTypedKey='';closeModal();render();});b.append(el('span','chapter-no',String(i+1).padStart(2,'0')),el('span','',c.title),el('small','',i<=main.unlocked?'章首回看 →':'未解锁'));b.disabled=i>main.unlocked||!main.checkpoints[i];section.append(b);const list=el('div','decision-list');catalog.filter(d=>d.c===i).forEach(d=>{const reached=!!main.decisions[d.id],node=btn('','decision-link',()=>chooseDecision(d.id));node.dataset.decision=d.id;node.disabled=!reached;node.append(el('span','decision-marker',reached?'◇':'·'),el('span','decision-label',d.kind+' · '+d.label),el('small','',reached?'可重选 →':'未到达'));list.append(node);});section.append(list);root.append(section);});}
function exitReview(){if(!review)return;state=mainState;mainState=null;review=false;lastTypedKey='';closeModal();render();}
function openLog(){const root=openModal('对白回看');if(!state.log.length)root.append(el('p','','开始阅读后，走过的对白会留在这里。'));state.log.forEach(l=>{const row=el('div','log-entry');row.append(el('small','',CHARACTERS[l.who]?.name||'旁白'),el('p','',l.text));root.append(row);});}
function showPhoto(bg,caption){const root=openModal(caption||'回忆画面'),im=el('img','gallery-photo');im.src=ASSET_BASE+bg+'.webp';A(im,'alt',caption||'场景插画');root.append(im);}
function showMemory(name){
 const available=(review?mainState:state).collected;
 if(!available.includes(name))return;
 const panel=$('#modal > article'),scroll=panel.scrollTop,root=openModal(name),card=el('div','memory-detail');
 card.append(el('div','memory-symbol-large','✧'),el('p','memory-note',COLLECTION_NOTES[name]||'这是这段旅程留下的一件小小回忆。'),btn('返回回忆盒','gold memory-close',()=>{openCollection();panel.scrollTop=scroll;const button=[...root.querySelectorAll('.memory-open')].find(x=>x.dataset.memoryName===name);button?.focus({preventScroll:true});}));
 root.append(card);panel.scrollTop=0;
}
function openCollection(){const s=review?mainState:state,root=openModal('结局与回忆');root.append(el('p','modal-intro','分支改变经历，不改变你值得被认真对待。'));const grid=el('div','endings-grid');Object.entries(ENDINGS).forEach(([id,e])=>{const card=el('div','ending-entry');card.append(el('small','',s.endings.includes(id)?'已读结局':'尚未解锁'),el('h3','',s.endings.includes(id)?e.title:'另一种可能'));grid.append(card);});root.append(grid);const items=el('div','collection-grid');s.collected.forEach(t=>{const button=btn('✧ '+t,'collection-item memory-open',()=>showMemory(t));button.dataset.memoryName=t;button.setAttribute('aria-haspopup','dialog');items.append(button);});root.append(el('h3','','本次旅程的痕迹'),el('p','memory-instruction',s.collected.length?'点击一件回忆，打开它的故事。':'还没有收集到回忆，继续故事便会慢慢点亮。'),items);if(s.endings.includes('be-yourself'))CHAPTERS.forEach(c=>root.append(btn(c.title,'gallery-link',()=>showPhoto(c.bg,c.title))));}
const gate=el('div','chapter-gate');gate.id='chapterGate';gate.hidden=true;$('.dialogue-layer').append(gate);
$('#startBtn').onclick=requestNew;$('#continueBtn').onclick=()=>render();$('#replayBtn').onclick=requestNew;$('#rewindBtn').onclick=()=>restoreDecision(state.lastDecision);$('#endingGallery').onclick=openCollection;$('#nextBtn').onclick=e=>{e.stopPropagation();advance();};$('#homeBtn').onclick=cover;$('#chapterBtn').onclick=openChapters;$('#logBtn').onclick=openLog;$('#collectionBtn').onclick=openCollection;$('#helpBtn').onclick=()=>openModal('玩法说明').append(el('p','help-copy',HELP));$('#exitReview').onclick=exitReview;$('#saveBtn').onclick=()=>{save();toast(review?'回看不覆盖主线':storageOK?'已保存，下次继续这一刻':'当前浏览器无法保存');};$('#closeModal').onclick=closeModal;$('.modal-shade').onclick=closeModal;
$('#dialogue').onclick=e=>{if(!e.target.closest('button,input'))advance();};$('.stage').onclick=e=>{if(!e.target.closest('button')&&!$('#dialogue').hidden)advance();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();return;}if(!$('#modal').hidden){if(e.key==='Tab'){const all=[...$('#modal').querySelectorAll('button:not(:disabled),input')],first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}if(e.repeat||![' ','Enter'].includes(e.key)||e.target.closest('button,input,textarea,select,[contenteditable]'))return;if(!$('#dialogue').hidden){e.preventDefault();advance();}});
$('#sceneImage').onerror=()=>toast('场景图片暂未加载，检查网络后可刷新续读');
load();$('#continueBtn').hidden=Object.keys(state.checkpoints).length===0;L($('#collectionCount'),state.collected.length);

initLanguageUI();
