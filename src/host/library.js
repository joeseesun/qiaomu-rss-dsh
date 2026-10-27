import {localDeletion,localDeletionMatcher} from '../original/local-deletions';
export function cachedEntries(data){
  const entries=new Map();const add=entry=>{if(entry?.key&&!entries.has(entry.key))entries.set(entry.key,entry);};
  for(const entry of Object.values(data.articles||{}))add(entry);
  for(const entry of data.qiaomuStream?.entries||[])add(entry);
  for(const cache of Object.values(data.qiaomuChannels||{}))for(const entry of cache.entries||[])add(entry);
  for(const sub of data.subscriptions||[])for(const entry of sub.entries||[])if(entry?.key)entries.set(entry.key,{...entry,...entries.get(entry.key),channelKey:`feed:${sub.id}`,channelName:sub.name});
  for(const entry of data.podcastEntries||[])add(entry);
  return entries;
}
export function originalEntry(entry,data={}){
 const local=entry.key.startsWith('feed:');const feed=local?(data.subscriptions||[]).find(sub=>(sub.entries||[]).some(item=>item.key===entry.key)):null;const sourceId=feed?`feed:${feed.id}`:entry.channelKey?.startsWith('feed:')?entry.channelKey:entry.key;return{id:entry.key,sourceId:local?sourceId:entry.channelKey||'qiaomu',origin:local?'local':entry.markdownPath?'vault':'qiaomu',sourceName:entry.channelName||'',title:entry.title||'',titleZh:entry.titleZh,link:entry.url,publishedTs:Date.parse(entry.publishedAt)||undefined,markdownPath:entry.markdownPath};
}
function deletionState(data,entry){return{settings:{baseUrl:entry?.collectionOrigin||data.settings?.origin||'https://rss.qiaomu.ai',podcastNames:{}},sources:[],subscriptions:[],localDeletedEntries:data.localDeletedEntries||[]};}
export function hiddenArticle(data,entry){return localDeletionMatcher(deletionState(data,entry))(originalEntry(entry,data));}
export function laterEntries(data){const entries=cachedEntries(data);return(data.readLater||[]).map(key=>entries.get(key)).filter(entry=>entry&&!hiddenArticle(data,entry));}
export function createLibraryHost(store){let lane=Promise.resolve();return request=>{
 const task=lane.then(async()=>{
  if(!request||typeof request.action!=='string')throw Error('Invalid library operation');
  if(request.action==='snapshot')return structuredClone({readLater:store.data.readLater||[],localDeletedEntries:store.data.localDeletedEntries||[]});
  const previous={readLater:store.data.readLater,localDeletedEntries:store.data.localDeletedEntries};
  let result;const rollbacks=[];
  if(request.action==='later'||request.action==='delete'){
   if(typeof request.key!=='string'||request.key.length>1000)throw Error('Invalid article key');const entry=cachedEntries(store.data).get(request.key);if(!entry)throw Error('Article is not cached');
   if(request.action==='later'){
    if(hiddenArticle(store.data,entry))throw Error('Restore this article before adding it to read later');const queued=store.data.readLater||[],exists=queued.includes(entry.key);const active=typeof request.value==='boolean'?request.value:!exists;
    store.data.readLater=active?[...queued.filter(key=>key!==entry.key),entry.key].slice(-200):queued.filter(key=>key!==entry.key);result={later:active};
   }else{
    const record=localDeletion(deletionState(store.data,entry),originalEntry(entry,store.data));if(!record)throw Error('Workspace files are not deleted from RSS');
    store.data.localDeletedEntries=hiddenArticle(store.data,entry)?store.data.localDeletedEntries:[...(store.data.localDeletedEntries||[]),record];result={deleted:true,record};
   }
  }else if(request.action==='restore'){
   if(!Array.isArray(request.keys)||request.keys.length>10000||request.keys.some(key=>typeof key!=='string'||key.length>2000))throw Error('Invalid restore keys');const keys=new Set(request.keys);const records=store.data.localDeletedEntries||[];const restored=records.filter(record=>record.keys.some(key=>keys.has(key)));
   store.data.localDeletedEntries=records.filter(record=>!restored.includes(record));
   const cached=cachedEntries(store.data);
   for(const record of restored){
    if(cached.has(record.entry.id)||(!record.scope.startsWith('local:')&&record.scope!==(store.data.settings?.origin||'https://rss.qiaomu.ai')))continue;
    const entry=record.entry,restoredEntry={key:entry.id,channelKey:entry.sourceId,channelName:entry.sourceName,title:entry.title,titleZh:entry.titleZh,url:entry.link,publishedAt:Number.isFinite(entry.publishedTs)?new Date(entry.publishedTs).toISOString():undefined};
    const articleMap=store.data.articles||(store.data.articles={});articleMap[entry.id]=restoredEntry;rollbacks.push(()=>{if(articleMap[entry.id]===restoredEntry)delete articleMap[entry.id];});
    const target=entry.origin==='local'?(store.data.subscriptions||[]).find(feed=>`feed:${feed.id}`===entry.sourceId):store.data.qiaomuStream;
    if(target){const before=target.entries||[];const after=[...before,restoredEntry];target.entries=after;rollbacks.push(()=>{if(target.entries===after)target.entries=before;});}
   }
   result={restored:restored.length};
  }else throw Error('Unknown library operation');
  try{await store.flush();}catch(error){Object.assign(store.data,previous);for(const undo of rollbacks.reverse())undo();throw error;}return result;
 });lane=task.catch(()=>{});return task;
};}
