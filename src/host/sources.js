import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {stateSchema} from '../original/model';
import {migrateLibrary,ensureGroup} from '../original/personal-library';
import {originalEntry} from './library.js';
import {hashKey,parseFeed} from './feeds.js';
import {importUrl} from '../original/import-source';
const MAX=2000,hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const limited=(value,max,label)=>{if(typeof value!=='string'||value.length>max||value.includes('\0'))throw Error(`Invalid ${label}`);return value;};
const urlOf=value=>{const url=new URL(limited(value,8192,'URL'));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP(S) URL without embedded credentials');url.hash='';return url.href;};
const metadataSchema=stateSchema.pick({subscriptionGroups:true,sourceMeta:true,collapsedGroups:true}).extend({subscriptionGroups:z.array(z.object({id:z.string().max(200),name:z.string().min(1).max(100),order:z.number().finite()})).max(2000),collapsedGroups:z.array(z.string().max(200)).max(2000)});
function sourceState(data){
 const saved=data.sourceLibrary||{};
 const state={...structuredClone(saved),libraryVersion:1,subscriptionGroups:structuredClone(saved.subscriptionGroups||[]),sourceMeta:structuredClone(saved.sourceMeta||{}),collapsedGroups:[...(saved.collapsedGroups||[])],personalArticles:{},cache:{},sources:data.qiaomuSources?.sources||[],readIds:Object.keys(data.read||{}),settings:{baseUrl:data.settings?.origin||'https://rss.qiaomu.ai',remoteImages:data.settings?.showImages!==false,followedPodcasts:[...(saved.followedPodcasts||[])],podcastNames:{...(saved.podcastNames||{})},markdownFolders:[...(saved.markdownFolders||[])],lastSource:''},subscriptions:(data.subscriptions||[]).map(sub=>({id:sub.id,url:sub.url,name:sub.name,group:sub.group||'',site:sub.site,image:sub.image,paused:!!sub.paused,updatedAt:sub.lastFetchedAt||0,error:sub.lastError||'',entries:(sub.entries||[]).map(entry=>({...originalEntry({...entry,channelKey:`feed:${sub.id}`},data),sourceId:sub.id,origin:'local'}))}))};
 migrateLibrary(state);
 for(const sub of state.subscriptions){const meta=state.sourceMeta[sub.id],current=state.subscriptionGroups.find(group=>group.id===meta.groupId)?.name||'';if(current!==sub.group)meta.groupId=ensureGroup(state,sub.group);meta.name=sub.name;}
 return state;
}
function metadata(state){return{subscriptionGroups:state.subscriptionGroups,sourceMeta:state.sourceMeta,collapsedGroups:state.collapsedGroups,followedPodcasts:state.settings.followedPodcasts,podcastNames:state.settings.podcastNames,markdownFolders:state.settings.markdownFolders};}
function revision(data){return hash({library:data.sourceLibrary,subscriptions:(data.subscriptions||[]).map(({id,url,name,group,paused})=>({id,url,name,group,paused}))});}
function fingerprint(data,id){const sub=(data.subscriptions||[]).find(s=>s.id===id);return sub?hash({id:sub.id,url:sub.url,name:sub.name,group:sub.group,paused:sub.paused,registrationId:sub.registrationId,addedAt:sub.addedAt,meta:data.sourceLibrary?.sourceMeta?.[id]}):null;}
export function createSourcesHost(store,{fetcher=fetch,refresh,notes,api,clock=Date.now}={}){
 let lane=Promise.resolve(),closed=false;const pending=new Map(),documents=new Map(),controllers=new Set();
 async function transport(request){
  if(closed)throw Error('RSS closed');const url=urlOf(importUrl(request.url)),binary=request.binary===true;const key=`${binary?'image:':'text:'}${url}`;if(pending.has(key))return pending.get(key);
  const work=(async()=>{const control=new AbortController();controllers.add(control);const timer=setTimeout(()=>control.abort(),Math.min(30000,Math.max(1000,request.timeout||20000)));try{
   const response=await fetcher(url,{signal:control.signal,redirect:'follow',headers:binary?{Accept:'image/*'}:undefined});const max=binary?2*1024*1024:5*1024*1024;
   if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw Error('Source exceeds size limit');}
   const chunks=[];let size=0;for await(const chunk of response.body||[]){size+=chunk.length;if(size>max){control.abort();throw Error('Source exceeds size limit');}chunks.push(chunk);}
   const bytes=Buffer.concat(chunks),headers=Object.fromEntries(response.headers),type=(headers['content-type']||'').split(';')[0].trim();
   if(binary){if(!response.ok||!/^image\/(?:png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon)$/.test(type))throw Error('Image is unavailable');return{mime:type,base64:bytes.toString('base64')};}
   const charset=/charset=([\w-]+)/i.exec(headers['content-type']||'')?.[1]||'utf-8';let text;try{text=new TextDecoder(charset).decode(bytes);}catch{text=bytes.toString('utf8');}
   const result={url,text,status:response.status,headers,finalUrl:response.url||url};if(response.ok&&size<=1024*1024){documents.set(url,{...result,at:clock()});while(documents.size>12)documents.delete(documents.keys().next().value);}return result;
  }finally{clearTimeout(timer);controllers.delete(control);}})();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
 }
 async function initialize(){const previous=store.data.sourceLibrary,next=metadata(sourceState(store.data));if(JSON.stringify(previous)!==JSON.stringify(next)){store.data.sourceLibrary=next;try{await store.flush();}catch(error){store.data.sourceLibrary=previous;throw error;}}}
 function snapshot(){return{state:sourceState(store.data),revision:revision(store.data)};}
 async function commit(edit){const oldSubs=store.data.subscriptions,oldLibrary=store.data.sourceLibrary;store.data.subscriptions=structuredClone(oldSubs);store.data.sourceLibrary=structuredClone(oldLibrary);try{const result=edit();await store.flush();return result;}catch(error){store.data.subscriptions=oldSubs;store.data.sourceLibrary=oldLibrary;throw error;}}
 const operate=request=>{
  if(request?.action==='transport')return transport(request);
  if(request?.action==='api')return api(request);
  const task=lane.then(async()=>{
   if(closed)throw Error('RSS closed');await initialize();const data=store.data;
   if(request?.action==='snapshot')return snapshot();
   if(request?.action==='edit'){
    if(request.revision!==revision(data))throw Error('Subscriptions changed. Reopen the dialog and retry.');
    if(JSON.stringify(request.patch).length>512*1024)throw Error('Library metadata too large');const patch=metadataSchema.parse(request.patch);if(Object.keys(patch.sourceMeta).length>4000)throw Error('Too many sources');const ids=new Set(patch.subscriptionGroups.map(g=>g.id));if(ids.size!==patch.subscriptionGroups.length)throw Error('Duplicate groups');for(const [id,meta] of Object.entries(patch.sourceMeta)){if(id.length>1000||meta.name.length>200||!Number.isFinite(meta.order)||meta.groupId&&!ids.has(meta.groupId))throw Error('Invalid source metadata');}
    await commit(()=>{Object.assign(data.sourceLibrary,patch);for(const sub of data.subscriptions){const meta=patch.sourceMeta[sub.id];if(!meta)continue;if(meta.name.trim())sub.name=meta.name.trim();sub.group=patch.subscriptionGroups.find(g=>g.id===meta.groupId)?.name||undefined;for(const entry of sub.entries||[])entry.channelName=sub.name;}});return snapshot();
   }
   if(request?.action==='add'||request?.action==='import'){
    const inputs=request.action==='add'?[request]:request.feeds;if(!Array.isArray(inputs)||inputs.length>MAX)throw Error('Invalid feed list');const prepared=[];
    for(const input of inputs){const url=urlOf(input.url),group=limited(input.group||'',100,'group').trim();if(prepared.some(item=>item.url===url)||(data.subscriptions||[]).some(item=>item.url===url)){if(request.action==='add')throw Error('Feed already subscribed');continue;}
     let parsed;if(request.action==='add'){let cached=documents.get(url);if(!cached||clock()-cached.at>300000)cached=await transport({url});if(cached.status<200||cached.status>=300)throw Error(`Feed HTTP ${cached.status}`);parsed=parseFeed(cached.text,url);}
     const name=limited(input.name||parsed?.title||url,1000,'name').trim().slice(0,200),id=`feed:${hashKey(url)}`;prepared.push({id,url,name,registrationId:randomUUID(),group:group||undefined,entries:(parsed?.entries||[]).map(entry=>({...entry,channelKey:`feed:${id}`,channelName:name})),addedAt:clock(),lastFetchedAt:parsed?clock():undefined,status:parsed?'ok':undefined});
    }
    if(data.subscriptions.length+prepared.length>MAX)throw Error(`At most ${MAX} subscriptions`);
    await commit(()=>{data.subscriptions.push(...prepared);data.sourceLibrary=metadata(sourceState(data));if(prepared.length>60)data.sourceLibrary.collapsedGroups=[...new Set([...data.sourceLibrary.collapsedGroups,...prepared.map(sub=>data.sourceLibrary.sourceMeta[sub.id]?.groupId).filter(Boolean)])];});return{...snapshot(),ids:prepared.map(sub=>sub.id),receipt:prepared.map(sub=>({id:sub.id,fingerprint:fingerprint(data,sub.id)}))};
   }
   if(request?.action==='undo'){
    if(!Array.isArray(request.receipt)||request.receipt.length>MAX)throw Error('Invalid import receipt');let count=0;await commit(()=>{for(const record of request.receipt){if(fingerprint(data,record.id)!==record.fingerprint||!record.fingerprint)continue;data.subscriptions=data.subscriptions.filter(sub=>sub.id!==record.id);delete data.sourceLibrary.sourceMeta[record.id];count++;}});return{...snapshot(),count};
   }
   if(request?.action==='pause'){const sub=data.subscriptions.find(s=>s.id===request.id);if(!sub||typeof request.paused!=='boolean')throw Error('Unknown subscription');await commit(()=>{data.subscriptions.find(s=>s.id===request.id).paused=request.paused;});return snapshot();}
   if(request?.action==='remove'){
    if(!Array.isArray(request.ids)||request.ids.length>MAX||request.ids.some(id=>typeof id!=='string'))throw Error('Invalid source list');await commit(()=>{const ids=new Set(request.ids);data.subscriptions=data.subscriptions.filter(sub=>!ids.has(sub.id));data.sourceLibrary.followedPodcasts=data.sourceLibrary.followedPodcasts.filter(id=>!ids.has(id));data.sourceLibrary.markdownFolders=data.sourceLibrary.markdownFolders.filter(folder=>!ids.has(`@vault:${folder}`));for(const id of ids)delete data.sourceLibrary.sourceMeta[id];});return snapshot();
   }
   if(request?.action==='refresh'){if(!Array.isArray(request.ids)||request.ids.length>MAX)throw Error('Invalid source list');await refresh(request.ids,request.force!==false);return snapshot();}
   if(request?.action==='follow'){const id=limited(request.id,200,'podcast id'),name=limited(request.name,200,'podcast name');await commit(()=>{if(!data.sourceLibrary.followedPodcasts.includes(id)){if(data.sourceLibrary.followedPodcasts.length>=200)throw Error('At most 200 podcasts');data.sourceLibrary.followedPodcasts.push(id);}data.sourceLibrary.podcastNames[id]=name;data.sourceLibrary=metadata(sourceState(data));});return snapshot();}
   if(request?.action==='local'){const folder=limited(request.path,1000,'notes path');const state=await notes({action:'snapshot'});if(!state.folders.includes(folder)&&!state.entries.some(file=>file.path===folder))throw Error('Note or folder is missing');await commit(()=>{if(!data.sourceLibrary.markdownFolders.includes(folder)){if(data.sourceLibrary.markdownFolders.length>=200)throw Error('At most 200 note sources');data.sourceLibrary.markdownFolders.push(folder);}data.sourceLibrary=metadata(sourceState(data));});return snapshot();}
   throw Error('Unknown source operation');
  });lane=task.catch(()=>{});return task;
 };
 operate.legacy=fn=>{const task=lane.then(async()=>{if(closed)throw Error('RSS closed');const result=await fn();await initialize();return result;});lane=task.catch(()=>{});return task;};
 operate.dispose=()=>{closed=true;for(const control of controllers)control.abort();documents.clear();};return operate;
}
