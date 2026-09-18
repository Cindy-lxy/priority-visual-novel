'use strict';
// Translation is presentation-only. No chapter, node, answer, or saved value is translated.
const LANGUAGE_KEY='vn:'+GAME_ID+':language';
let currentLanguage='zh';
try{currentLanguage=localStorage.getItem(LANGUAGE_KEY)==='en'?'en':'zh';}catch(error){/* Language stays available without storage. */}
const requestedLanguage=new URL(location.href).searchParams.get('lang');
if(requestedLanguage==='en'||requestedLanguage==='zh')currentLanguage=requestedLanguage;
const textSources=new WeakMap(),attributeSources=new WeakMap();
const translationKeys=Object.keys(I18N_EN).sort((a,b)=>b.length-a.length);
const translationPattern=new RegExp(translationKeys.map(key=>key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
function F(template,vars){return {localeTemplate:template,vars};}
function T(value){
 if(value&&typeof value==='object'&&value.localeTemplate){
  const template=currentLanguage==='en'?(I18N_EN[value.localeTemplate]||value.localeTemplate):value.localeTemplate;
  return template.replace(/\{(\w+)\}/g,(match,key)=>Object.hasOwn(value.vars,key)?T(value.vars[key]):match);
 }
 const source=String(value??'');
 if(currentLanguage==='zh')return source;
 if(Object.hasOwn(I18N_EN,source))return I18N_EN[source];
 // Joined labels/log entries use longest-match replacements once; never translate translated output again.
 return source.replace(translationPattern,key=>I18N_EN[key]);
}
function L(element,source){
 element.textContent=T(source);
 if(element.firstChild)textSources.set(element.firstChild,source);
 return source;
}
function A(element,name,source){
 let attrs=attributeSources.get(element);
 if(!attrs){attrs=new Map();attributeSources.set(element,attrs);}
 attrs.set(name,source);
 element.setAttribute(name,T(source));
 return source;
}
function updateLanguageButtons(){
 document.documentElement.lang=currentLanguage==='en'?'en':'zh-CN';
 document.documentElement.classList.toggle('lang-en',currentLanguage==='en');
 const picker=document.getElementById('langBtn');
 if(picker){
  picker.textContent=currentLanguage==='en'?'EN':'中';
  picker.setAttribute('title',currentLanguage==='en'?'Language: English':'当前语言：中文');
 }
}
function refreshDisplayedLanguage(){
 const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;
  if(textSources.has(node))node.nodeValue=T(textSources.get(node));
 }
 document.querySelectorAll('*').forEach(element=>{
  const attrs=attributeSources.get(element);
  if(attrs)attrs.forEach((source,name)=>element.setAttribute(name,T(source)));
 });
 updateLanguageButtons();
}
function setLanguage(lang){
 if(lang!=='zh'&&lang!=='en')return;
 // Complete the current sentence, but never advance, rerender, or touch the save timeline.
 if(typeof stopTyping==='function')stopTyping();
 currentLanguage=lang;
 try{localStorage.setItem(LANGUAGE_KEY,currentLanguage);}catch(error){/* Switching still works in memory. */}
 refreshDisplayedLanguage();
 // Keep a supplied optional language hint in sync without navigation.
 if(requestedLanguage){try{const url=new URL(location.href);url.searchParams.set('lang',currentLanguage);history.replaceState(history.state,'',url);}catch(error){}}
}
function initLanguageUI(){
 document.querySelectorAll('[data-i18n][data-zh]').forEach(element=>{
  // A dynamic renderer may already have populated this element (e.g. an error toast).
  const mode=element.dataset.i18n,source=element.dataset.zh;
  if(mode==='text'){
   if(!element.firstChild||!textSources.has(element.firstChild))L(element,source);
  }else A(element,mode==='aria'?'aria-label':mode,source);
 });
 updateLanguageButtons();
}

function openLanguagePicker(event){
 event?.stopPropagation();
 const root=openModal(currentLanguage==='en'?'Language':'选择语言');
 const options=el('div','lang-options');
 options.setAttribute('role','group');
 options.setAttribute('aria-label','Language');
 [['zh','中文'],['en','English']].forEach(([lang,label])=>{
  const selected=lang===currentLanguage;
  const button=btn('',selected?'gold':'ghost',()=>{setLanguage(lang);closeModal();});
  // Native language names must remain recognizable in either display language.
  button.textContent=(selected?'✓  ':'')+label;
  button.setAttribute('aria-pressed',String(selected));
  button.lang=lang==='zh'?'zh-CN':'en';
  options.append(button);
 });
 root.append(options);
}
document.getElementById('langBtn').onclick=openLanguagePicker;
