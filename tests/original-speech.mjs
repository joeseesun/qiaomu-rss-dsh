import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const result=await build({stdin:{contents:`export {RssSpeech} from './src/original/speech.ts';export {createRssSpeechClient} from './src/client/speech.js';export {createRssSpeechHost} from './src/host/speech.js';export {enhance,disposeSurfaces} from './src/client/original-ui.ts';export {articleHeadings} from './src/original/article-outline.ts';export {articleSpeechSource} from './src/original/speech-source.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',alias:{'@qiaomu/speech/speech':'./src/shared-audio/shared.js','@qiaomu/speech/speech/text':'./src/shared-audio/core/tts/text.js','@qiaomu/speech/speech/progress':'./src/shared-audio/shared/progress.js'}});
const generated=await mkdtemp(join(tmpdir(),'qrs-original-tests-'));const bundle=join(generated,'original.mjs');await writeFile(bundle,result.outputFiles[0].text);after(()=>rm(generated,{recursive:true,force:true}));
const {RssSpeech,createRssSpeechClient,createRssSpeechHost,enhance,disposeSurfaces,articleHeadings,articleSpeechSource}=await import(pathToFileURL(bundle));
const dom=new JSDOM('<html lang="zh-CN"><body></body></html>',{pretendToBeVisual:true,url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Node','CustomEvent','MutationObserver','Element'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
dom.window.matchMedia=()=>({matches:true});
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.HTMLElement.prototype.scrollBy=function(){};
dom.window.Range.prototype.getBoundingClientRect=()=>({top:0,bottom:0,height:0});
const audios=[];
class Audio extends dom.window.EventTarget{constructor(){super();this.currentTime=0;this.duration=2;this.paused=true;audios.push(this);}play(){this.paused=false;this.dispatchEvent(new dom.window.Event('playing'));return Promise.resolve();}pause(){this.paused=true;}load(){}removeAttribute(){}}
dom.window.Audio=Audio;
let latestSpeech;const originalStart=RssSpeech.prototype.start;RssSpeech.prototype.start=function(...args){latestSpeech=this;return originalStart.apply(this,args);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const settings=()=>({tts:{provider:'macos',profiles:{macos:{voice:'Linfei'}},rate:1,welcomed:true}});
function fixture({bridgeGate}={}){
 let closed=0,saves=0,provider;const calls=[],keys=new Map();
 const store={data:{speech:{settings:settings(),speechProgress:{}}},touch(){},async flush(){saves++;}};
 const host=createRssSpeechHost(store,{credentials:{get:async id=>keys.get(id)||'',set:async(id,value)=>keys.set(id,value)}});
 const service={registerSpeechSource(id,value){assert.equal(id,'qiaomu-rss-dsh');provider=value;return()=>{provider=null;};},async createSpeechBridge(){if(bridgeGate)await bridgeGate.promise;return{platform:'darwin',dispose(){closed++;},async speech(profile,text){calls.push({profile,text});return{bytes:new Uint8Array([82,73,70,70]),mime:'audio/wav'};},voices:async()=>({voices:[{id:'Linfei',label:'林飞'}]}),subscribe:()=>()=>{}};},exportSpeechSettings:async({includeSecrets}={})=>includeSecrets?{tts:settings().tts,secrets:{}}:settings().tts};
 const client=createRssSpeechClient({speechOperation:host});const root=enhance(document.createElement('div'));root.innerHTML='<div class="qrs-reader"><div class="qrs-actions"></div><div class="qrs-prose"><h2>第一节</h2><p>第一句。第二句。</p><h3>小节</h3><p>后续正文。</p></div></div>';document.body.append(root);
 const toolbar=root.querySelector('.qrs-actions'),prose=root.querySelector('.qrs-prose');
 return{client,host,service,store,calls,keys,root,toolbar,prose,context:()=>({id:'fixture:article',mode:'original',prose,loading:false}),counts:()=>({closed,saves,provider}),cleanup(){client.dispose();root.remove();disposeSurfaces();}};
}
test('original CSS remains byte-for-byte and speech uses real heading/selection source',async()=>{
 const css=await readFile(new URL('../src/original/styles.css',import.meta.url));assert.equal(createHash('sha256').update(css).digest('hex'),'91dc5ccf1bec8660e29b68f3a7b1228278da67de59957d8b1fd4a5c1987b17c1');
 const f=fixture();try{assert.deepEqual(articleHeadings(f.prose).map(x=>[x.text,x.depth]),[['第一节',0],['小节',1]]);const text=f.prose.querySelector('p').firstChild,range=document.createRange();range.setStart(text,4);range.setEnd(text,8);const source=articleSpeechSource(f.prose,240,false,range);assert.equal(source.items.map(x=>x.text).join(''),'第二句。');}finally{f.cleanup();}
});
test('original controls narrate, coordinate ownership, retain progress and clean up',async()=>{
 const f=fixture();try{f.client.connect(f.service);const unmount=await f.client.mount(f.root,f.toolbar,f.context);const button=f.toolbar.querySelector('.qrs-speech-button');assert.ok(button.querySelector('svg'));button.click();await tick();assert.ok(f.calls.length);assert.ok(f.toolbar.querySelector('.qrs-speech-bar'));assert.equal(button.getAttribute('aria-pressed'),'true',latestSpeech.speech.controller.error?.message);document.dispatchEvent(new CustomEvent('qiaomu-speech:claim-v1',{detail:{}}));await tick();assert.equal(button.getAttribute('aria-pressed'),'false');await new Promise(r=>setTimeout(r,650));assert.ok(Object.keys(f.store.data.speech.speechProgress).length);unmount();assert.equal(f.toolbar.childElementCount,0);assert.ok(audios.every(a=>a.paused));}finally{f.cleanup();}assert.equal(f.counts().closed,1);assert.equal(f.counts().provider,null);
});
test('selected speech leaves whole-article progress intact',async()=>{
 const f=fixture();f.store.data.speech.speechProgress={'saved':{fingerprint:'original',offset:9,at:1,ended:false}};try{f.client.connect(f.service);await f.client.mount(f.root,f.toolbar,f.context);const node=f.prose.querySelector('p').firstChild,range=document.createRange();range.setStart(node,4);range.setEnd(node,8);window.getSelection().removeAllRanges();window.getSelection().addRange(range);const button=f.toolbar.querySelector('.qrs-speech-button');button.onpointerdown();button.click();await tick();assert.equal(f.calls[0].text,'第二句。');await new Promise(r=>setTimeout(r,650));assert.deepEqual(f.store.data.speech.speechProgress,{saved:{fingerprint:'original',offset:9,at:1,ended:false}});}finally{window.getSelection().removeAllRanges();f.cleanup();}
});
test('late bridge initialization is discarded and reconnect can mount a fresh toolbar',async()=>{
 const gate=deferred(),f=fixture({bridgeGate:gate});let changes=0;const unwatch=f.client.subscribe(()=>changes++);const disconnect=f.client.connect(f.service),pending=f.client.mount(f.root,f.toolbar,f.context);disconnect();gate.resolve();await assert.rejects(pending,/disconnected/);assert.equal(f.toolbar.childElementCount,0);const newer=fixture();try{f.client.connect(newer.service);await f.client.mount(f.root,f.toolbar,f.context);assert.ok(f.toolbar.querySelector('.qrs-speech-button'));assert.equal(changes,3);}finally{unwatch();f.cleanup();newer.cleanup();}assert.equal(f.counts().closed,1);
});
test('speech persistence strips secrets, serializes saves, rolls back failed writes',async()=>{
 let fail=false;const store={data:{},touch(){},async flush(){if(fail)throw Error('disk full');}};const keys=new Map(),host=createRssSpeechHost(store,{credentials:{get:async id=>keys.get(id)||'',set:async(id,value)=>keys.set(id,value)}});
 await host({action:'save',state:{settings:{tts:{provider:'openai',key:'private',profiles:{openai:{voice:'alloy',key:'private'}}},speechHighlight:{style:'invalid',color:'url(private)'}},speechProgress:{}}});assert.ok(!JSON.stringify(store.data).includes('private'));assert.equal(store.data.speech.settings.speechHighlight.color,'#e0a400');const previous=structuredClone(store.data);fail=true;await assert.rejects(host({action:'save',state:{settings:settings()}}),/disk full/);assert.deepEqual(store.data,previous);
 await assert.rejects(host({action:'secret',operation:'get',id:'qiaomu-reader-dsh-tts-openai'}),/Invalid/);await host({action:'secret',operation:'set',id:'qiaomu-rss-dsh-tts-openai',value:'fixture'});assert.equal((await host({action:'secret',operation:'get',id:'qiaomu-rss-dsh-tts-openai'})).value,'fixture');assert.ok(!JSON.stringify(store.data).includes('fixture'));
});
