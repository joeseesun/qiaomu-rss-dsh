import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'qrs-notes-'));after(()=>rm(temp,{recursive:true,force:true}));
const result=await build({stdin:{contents:`export {createNotesHost} from './src/host/notes.js';export {noteMaterial,createNotesClient} from './src/client/notes.js';export {disposeSurfaces} from './src/client/original-ui.ts';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'}});
await writeFile(join(temp,'bundle.mjs'),result.outputFiles[0].text);
const dom=new JSDOM('<html lang="zh-CN"><body></body></html>',{pretendToBeVisual:true});for(const key of ['document','HTMLElement','Element','Node','MutationObserver','getComputedStyle','Event','CustomEvent'])globalThis[key]=key==='getComputedStyle'?dom.window.getComputedStyle:dom.window[key];globalThis.window=dom.window;
const {createNotesHost,noteMaterial,createNotesClient,disposeSurfaces}=await import(pathToFileURL(join(temp,'bundle.mjs')));
after(()=>{disposeSurfaces();dom.window.close();});
function fixture(name,options={}){const root=join(temp,name);const store={data:{articles:{one:{key:'one',title:'标题',url:'https://example.test/story',channelName:'测试源'}},settings:{origin:'https://rss.qiaomu.ai'}},flush:async()=>{}};return{root,store,host:createNotesHost(store,root,{now:()=>new Date(2026,9,28,1,30),...options})};}
const request={key:'one',mode:'original',name:'标题 - 原文',markdown:'# 标题\n\n正文\n',folder:'Articles'};
test('original Markdown converter keeps tables, bold Chinese, source facts and removes active HTML',()=>{
 const prose=document.createElement('div');prose.innerHTML='<script>bad()</script><h2>章节</h2><p><strong>重要。</strong>中文</p><img src="/cover.png" onerror="bad()"><table><thead><tr><th>列</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table>';
 const material=noteMaterial({key:'one',title:'标题',url:'https://example.test/story',author:'作者',channelName:'来源'},'translation',prose);
 assert.match(material.markdown,/\*\*重要。\*\* 中文/);assert.match(material.markdown,/https:\/\/example.test\/cover.png/);assert.match(material.markdown,/\| 列 \|/);assert.match(material.markdown,/作者/);assert.doesNotMatch(material.markdown,/bad\(\)|onerror|<script/);assert.match(material.name,/中文翻译/);
});
test('article exports use exclusive filenames, retain failed image URLs and reject traversals/symlinks',async()=>{
 const f=fixture('export',{fetchImage:async url=>url.includes('missing')?new Response('no',{status:404}):new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}})});
 const payload={...request,action:'save',markdown:'![first](qrs-asset-0)\n![second](qrs-asset-1)\n',images:['https://example.test/cover.png','https://example.test/missing.png']};
 const [a,b]=await Promise.all([f.host(payload),f.host(payload)]);assert.notEqual(a.path,b.path);assert.equal(a.missingImages,1);const saved=await readFile(a.absolute,'utf8');assert.match(saved,/attachments\/[0-9a-f]+.png/);assert.match(saved,/https:\/\/example.test\/missing.png/);assert.equal((await readdir(join(f.root,'Articles','attachments'))).length,1);
 await assert.rejects(f.host({...request,action:'save',folder:'../outside'}));await mkdir(join(temp,'external'),{recursive:true});await symlink(join(temp,'external'),join(f.root,'linked'));await assert.rejects(f.host({...request,action:'save',folder:'linked'}),/Symbolic/);await assert.rejects(f.host({...request,action:'save',key:'unknown'}));
});
test('daily capture preserves user text/template, deduplicates excerpts across versions and survives a fresh host',async()=>{
 const f=fixture('daily');await f.host({action:'snapshot'});await mkdir(join(f.root,'Templates'));await writeFile(join(f.root,'Templates','daily.md'),'# {{title}}\n{{date}} {{time}}\n用户模板\n');await f.host({action:'settings',patch:{dailyTemplate:'Templates/daily.md',dailyFolder:'Journal'}});
 const payload={...request,action:'capture',excerpt:'第一条 **选文**'};const a=await f.host(payload),b=await f.host(payload);assert.equal(a.added,true);assert.equal(b.added,false);let text=await readFile(a.absolute,'utf8');assert.match(text,/2026-10-28 01:30/);assert.match(text,/用户模板/);assert.match(text,/Snapshots\/.+#qrs-article-/);assert.doesNotMatch(text,/obsidian:\/\//);await writeFile(a.absolute,text+'\n手写内容\n');
 const restarted=createNotesHost(f.store,f.root,{now:()=>new Date(2026,9,28,2,0)});const c=await restarted({...payload,mode:'rewrite',markdown:'# 改写\n新版本',excerpt:'第二条'});assert.equal(c.added,true);text=await readFile(a.absolute,'utf8');assert.match(text,/手写内容/);assert.match(text,/第一条/);assert.match(text,/第二条/);assert.equal((text.match(/#qrs-article-/g)||[]).length,1);assert.match(text,/-rewrite-/);
 const same=await restarted({...payload,mode:'rewrite',markdown:'# 改写\n新版本',excerpt:'第二条'});assert.equal(same.added,false);
});
test('explicit target appends without creating missing notes; settings failure rolls back',async()=>{
 const f=fixture('target');await f.host({action:'snapshot'});await writeFile(join(f.root,'existing.md'),'---\ntitle: 我的笔记\n---\n\n保留我\n');const result=await f.host({...request,action:'capture',target:'existing.md',excerpt:'摘录'});assert.match(await readFile(result.absolute,'utf8'),/^---\ntitle: 我的笔记/);await assert.rejects(f.host({...request,action:'capture',target:'missing.md'}),/ENOENT/);assert.equal((await f.host({action:'snapshot'})).entries.some(e=>e.path==='missing.md'),false);
 const before=f.store.data.notes;f.store.flush=async()=>{throw Error('disk full');};await assert.rejects(f.host({action:'settings',patch:{dailyFolder:'new'}}),/disk full/);assert.equal(f.store.data.notes,before);await assert.rejects(f.host({action:'settings',patch:{dailyFormat:'[../../outside]'}}));
});
test('failed note writes clean only newly created attachments, never shared files',async()=>{
 const f=fixture('rollback',{fetchImage:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}})});await f.host({action:'snapshot'});await mkdir(join(f.root,'Articles'),{recursive:true});await assert.rejects(f.host({...request,action:'save',name:'blocked',images:['https://example.test/a.png'],markdown:'A'.repeat(2*1024*1024-40)+'![a](qrs-asset-0)'}));assert.deepEqual(await readdir(join(f.root,'Articles','attachments')),[]);
});
test('original location modal saves via Host and ignores a late open after disposal',async()=>{
 const f=fixture('modal'),api={notesOperation:f.host,openNote:async()=>{}};const client=createNotesClient(api);const prose=document.createElement('div');prose.innerHTML='<p>文章</p>';const material=noteMaterial({key:'one',title:'标题'},'original',prose);await client.save(material);assert.ok(document.querySelector('.qrs-note-location'));const button=[...document.querySelectorAll('.qrs-note-location button')].find(el=>el.textContent==='保存');assert.ok(button);button.click();for(let n=0;n<100&&document.querySelector('.qrs-note-location');n++)await new Promise(r=>setTimeout(r,5));assert.equal(document.querySelector('.qrs-note-location'),null);assert.equal((await f.host({action:'snapshot'})).entries.length,1);client.dispose();
 let release;const slow=createNotesClient({notesOperation:()=>new Promise(resolve=>release=resolve)});const open=slow.save(material);slow.dispose();release({folders:['/'],entries:[],settings:{articleFolder:'Articles'}});await open;assert.equal(document.querySelector('.qrs-note-location'),null);
});
