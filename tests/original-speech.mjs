import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const result=await build({stdin:{contents:`export {createLibraryHost,hiddenArticle,laterEntries} from './src/host/library.js';export {createLibraryClient} from './src/client/library.js';export {createRssHomeProvider,createHomeActions} from './src/client/home.js';export {rssHomeSnapshot} from './src/host/home.js';export {RssSpeech} from './src/original/speech.ts';export {createRssSpeechClient} from './src/client/speech.js';export {createRssSpeechHost} from './src/host/speech.js';export {enhance,disposeSurfaces} from './src/client/original-ui.ts';export {articleHeadings} from './src/original/article-outline.ts';export {articleSpeechSource} from './src/original/speech-source.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',alias:{'@qiaomu/speech/speech':'./src/shared-audio/shared.js','@qiaomu/speech/speech/text':'./src/shared-audio/core/tts/text.js','@qiaomu/speech/speech/progress':'./src/shared-audio/shared/progress.js'}});
const generated=await mkdtemp(join(tmpdir(),'qrs-original-tests-'));const bundle=join(generated,'original.mjs');await writeFile(bundle,result.outputFiles[0].text);after(()=>rm(generated,{recursive:true,force:true}));
const {createLibraryHost,createLibraryClient,hiddenArticle,laterEntries,createRssHomeProvider,createHomeActions,rssHomeSnapshot,RssSpeech,createRssSpeechClient,createRssSpeechHost,enhance,disposeSurfaces,articleHeadings,articleSpeechSource}=await import(pathToFileURL(bundle));
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

test('original Home provider uses cached unread entries, saved search, navigation and actions',async()=>{
 const data={qiaomuSources:{sources:[{id:'hidden',enabled:false}]},qiaomuStream:{entries:[{key:'a',channelKey:'qiaomu:visible',title:'Original title',titleZh:'Translated title',publishedAt:'2026-10-01',image:'https://example.org/a.png'},{key:'hidden',channelKey:'qiaomu:hidden',title:'hidden'}]},qiaomuChannels:{visible:{entries:[{key:'a',title:'duplicate'}]}},subscriptions:[{name:'Personal feed',entries:[{key:'b',title:'Newest',publishedAt:'2026-10-02'}]}],articles:{saved:{key:'saved',title:'Saved fixture'}},favorites:{saved:{}},read:{b:1}};
 const before=structuredClone(data),snapshot=rssHomeSnapshot(data);assert.deepEqual(data,before);assert.deepEqual(snapshot.entries.map(x=>x.id),['b','a','saved']);let opened;const home=createRssHomeProvider({load:async()=>snapshot,open:value=>{opened=value;}});
 const sections=await home.sections();assert.equal(sections.length,1);assert.deepEqual(sections[0].items.map(x=>x.id),['a','saved']);assert.equal(sections[0].items[0].title,'Translated title');await sections[0].items[0].open();assert.deepEqual(opened,{kind:'article',key:'a'});home.actions()[0].run();assert.deepEqual(opened,{kind:'subscriptions'});const found=await home.search('Saved',2);assert.equal(found[0].id,'saved');assert.deepEqual(await home.search(' ',2),[]);
});
test('Home action before panel mount is delivered once and disconnected handlers do not run',()=>{
 const actions=createHomeActions();const seen=[];let notices=0;actions.subscribe(()=>notices++);actions.send({key:'early'});const old=actions.attach(value=>seen.push(value.key));assert.deepEqual(seen,['early']);const next=actions.attach(value=>seen.push('new:'+value.key));old();actions.send({key:'later'});assert.deepEqual(seen,['early','new:later']);actions.changed();assert.equal(notices,1);next();actions.dispose();actions.send({key:'closed'});actions.changed();assert.equal(notices,1);
});
test('default cloud voice loads its key even without a profile override',async()=>{
 const f=fixture();f.store.data.speech.settings={tts:{provider:'openai',profiles:{},welcomed:true}};f.keys.set('qiaomu-rss-dsh-tts-openai','fixture-default');try{f.client.connect(f.service);await f.client.mount(f.root,f.toolbar,f.context);f.toolbar.querySelector('.qrs-speech-button').click();await tick();assert.equal(f.calls[0].profile.key,'fixture-default');}finally{f.cleanup();}
});

function libraryFixture(){const entries=[{key:'qiaomu:one',channelKey:'qiaomu:news',title:'First',url:'https://example.org/story?id=1',publishedAt:'2026-10-01'},{key:'feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',channelKey:'feed:abc',title:'Second',url:'https://example.org/podcast'}];let fail=false;const store={data:{settings:{origin:'https://rss.qiaomu.ai'},articles:Object.fromEntries(entries.map(e=>[e.key,e])),qiaomuStream:{entries:[entries[0]]},subscriptions:[{id:'abc',entries:[entries[1]]}],favorites:{'qiaomu:one':{savedAt:1}},read:{'qiaomu:one':1},readLater:[],localDeletedEntries:[]},async flush(){if(fail)throw Error('disk full');}};return{entries,store,host:createLibraryHost(store),fail:()=>{fail=true;}};}
test('read-later is an ordered cross-source queue; deletion preserves saved and read data',async()=>{
 const f=libraryFixture();await f.host({action:'later',key:'feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'});await f.host({action:'later',key:'qiaomu:one'});assert.deepEqual(laterEntries(f.store.data).map(e=>e.key),['feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','qiaomu:one']);const deleted=await f.host({action:'delete',key:'qiaomu:one'});assert.equal(hiddenArticle(f.store.data,f.entries[0]),true);assert.deepEqual(laterEntries(f.store.data).map(e=>e.key),['feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']);assert.deepEqual(f.store.data.favorites,{'qiaomu:one':{savedAt:1}});assert.deepEqual(f.store.data.read,{'qiaomu:one':1});
 assert.equal(hiddenArticle(f.store.data,{...f.entries[0],key:'qiaomu:new-id',url:f.entries[0].url+'#section'}),true);assert.equal(hiddenArticle(f.store.data,{...f.entries[0],key:'qiaomu:other',url:'https://example.org/story?id=2'}),false);assert.equal(hiddenArticle(f.store.data,{...f.entries[0],key:'qiaomu:other-source',channelKey:'qiaomu:other'}),false);
 await f.host({action:'restore',keys:deleted.record.keys});assert.equal(hiddenArticle(f.store.data,f.entries[0]),false);
});
test('restoring an expired feed entry repopulates its metadata and failed changes roll back',async()=>{
 const f=libraryFixture();const result=await f.host({action:'delete',key:'feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'});delete f.store.data.articles['feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];f.store.data.subscriptions[0].entries=[];await f.host({action:'restore',keys:result.record.keys});assert.equal(f.store.data.subscriptions[0].entries[0].key,'feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');assert.equal(f.store.data.articles['feed:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'].title,'Second');const previous=structuredClone(f.store.data);f.fail();await assert.rejects(f.host({action:'delete',key:'qiaomu:one'}),/disk full/);assert.deepEqual(f.store.data,previous);await assert.rejects(f.host({action:'later',key:'qiaomu:one'}),/disk full/);assert.deepEqual(f.store.data,previous);
});
test('original deleted-articles modal restores a record and cleans up',async()=>{
 const f=libraryFixture();await f.host({action:'delete',key:'qiaomu:one'});let refreshed=0;const client=createLibraryClient({libraryOperation:f.host,homeActions:{changed(){},send(){refreshed++;}}});try{await client.deleted();assert.ok(document.querySelector('.qrs-deleted-modal'));assert.equal(document.querySelector('.qrs-deleted-row strong').textContent,'First');document.querySelector('.qrs-deleted-row button').click();await tick();assert.equal(f.store.data.localDeletedEntries.length,0);assert.equal(document.querySelectorAll('.qrs-deleted-row').length,0);assert.equal(refreshed,1);}finally{client.dispose();disposeSurfaces();}assert.equal(document.querySelector('.qrs-deleted-modal'),null);
});

test('local deletion is feed-scoped even when legacy cached metadata lacks the feed id',async()=>{
 const f=libraryFixture(),local=f.entries[1];delete local.channelKey;const result=await f.host({action:'delete',key:local.key});assert.equal(result.record.entry.sourceId,'feed:abc');assert.equal(hiddenArticle(f.store.data,{...local,key:'feed:new',channelKey:'feed:abc'}),true);assert.equal(hiddenArticle(f.store.data,{...local,key:'feed:other',channelKey:'feed:different'}),false);
});
