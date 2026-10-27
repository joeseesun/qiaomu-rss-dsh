import {SubscriptionCenter} from '../original/subscription-center';
import {resolveSource,resolveDocument} from '../original/feed-resolver';
import {Component,TFile,TFolder,Notice} from './original-ui';
const download=(xml)=>{const url=URL.createObjectURL(new Blob([xml],{type:'text/xml'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='qiaomu-rss-subscriptions.opml';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
export function createSourcesClient(api){let disposed=false,modal,plugin,revision,generation=0,lane=Promise.resolve();const owner=new Component();owner.load();const receipts=new WeakMap();
 const apply=result=>{if(disposed)return result;if(plugin)Object.assign(plugin.state,result.state);revision=result.revision;modal?.refresh();return result;};
 const reload=async()=>apply(await api.sourcesOperation({action:'snapshot'}));
 const call=async request=>{if(disposed)throw Error('RSS closed');try{const result=await api.sourcesOperation(request);apply(result);if(!disposed)api.homeActions.send({kind:'refresh'});return result;}catch(error){await reload().catch(()=>{});throw error;}};
 const serialize=fn=>{const task=lane.catch(()=>{}).then(()=>{if(disposed)throw Error('RSS closed');return fn();});lane=task.catch(()=>{});return task;};
 async function initialize(ticket){const [snapshot,notes]=await Promise.all([api.sourcesOperation({action:'snapshot'}),api.notesOperation({action:'snapshot'})]);if(disposed||ticket!==generation)throw Error('RSS closed or opening superseded');revision=snapshot.revision;
  const files=[...notes.folders.map(path=>new TFolder(path)),...notes.entries.map(entry=>new TFile(entry.path))];
  const transport=request=>api.sourcesOperation({action:'transport',...request});
  const readImport=async(url,current=()=>true,timeout=30000)=>{if(!current()||disposed)throw Error('Source cancelled');const result=await transport({url,timeout});if(!current()||disposed)throw Error('Source cancelled');if(result.status<200||result.status>=300)throw Error(`HTTP ${result.status}`);return result;};
  plugin={state:snapshot.state,manifest:{id:'qiaomu-rss-dsh'},app:{vault:{configDir:'.harness',getAllLoadedFiles:()=>files,getMarkdownFiles:()=>files.filter(file=>file instanceof TFile),getAbstractFileByPath:path=>files.find(file=>file.path===path),adapter:{read:async()=>{throw Error('No imported catalog cache');}}}},
   readImport,requestUrl:transport,
   images:{async load(url){const result=await transport({url,binary:true});if(disposed)throw Error('RSS closed');return new Blob([Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0))],{type:result.mime});}},
   addChild:child=>owner.addChild(child),removeChild:child=>owner.removeChild(child),
   openDiscovery:()=>{modal?.show('discover');},saveOpml:async xml=>download(xml),
   async editLibrary(edit){return serialize(async()=>{const before=structuredClone(plugin.state);try{edit();const {subscriptionGroups,sourceMeta,collapsedGroups}=plugin.state;await call({action:'edit',revision,patch:{subscriptionGroups,sourceMeta,collapsedGroups}});}catch(error){Object.assign(plugin.state,before);await reload().catch(()=>{});throw error;}});},
   removePersonalSources:ids=>serialize(()=>call({action:'remove',ids})),
   addLocalSource:(path,groupId)=>serialize(async()=>{await call({action:'local',path});if(groupId){plugin.state.sourceMeta[`@vault:${path}`].groupId=groupId;const {subscriptionGroups,sourceMeta,collapsedGroups}=plugin.state;await call({action:'edit',revision,patch:{subscriptionGroups,sourceMeta,collapsedGroups}});}}),
   followPodcast:(id,name)=>serialize(()=>call({action:'follow',id,name})),
   articleHidden:()=>false,
   refreshPersonalViews:()=>{modal?.refresh();api.homeActions.send({kind:'refresh'});},persist:async()=>{},
   async openPersonalSource(id){if(disposed)return;modal?.close();api.homeActions.send({kind:'source',source:id});},
   api:()=>({sources:()=>api.sourcesOperation({action:'api',method:'sources'}),entries:id=>api.sourcesOperation({action:'api',method:'entries',id}),podcastEpisodes:id=>api.sourcesOperation({action:'api',method:'podcast',id})}),
  };
  plugin.subscriptions={
   async fetch(url,doc){const result=await resolveSource(url,doc,()=>!disposed,readImport);if(result.kind!=='feed')throw Error('Choose a feed first');return result.parsed;},
   addResolved:(source,group='',current=()=>true)=>serialize(async()=>{if(!current())throw Error('Source cancelled');const result=await call({action:'add',url:source.url,name:source.parsed.name,group});const feed=plugin.state.subscriptions.find(feed=>feed.id===result.ids[0]);receipts.set(feed,result.receipt);return feed;}),
   importAdded:(feeds,current=()=>true)=>serialize(async()=>{if(!current())throw Error('Import cancelled');const result=await call({action:'import',feeds});return result.ids.map(id=>{const feed=plugin.state.subscriptions.find(feed=>feed.id===id);receipts.set(feed,result.receipt.filter(record=>record.id===id));return feed;});}),
   receipt:feeds=>feeds.flatMap(feed=>receipts.get(feed)||[]),
   undoAdded:receipt=>serialize(async()=>(await call({action:'undo',receipt})).count),
   refresh:ids=>serialize(()=>call({action:'refresh',ids})),
   setPaused:(id,paused)=>serialize(()=>call({action:'pause',id,paused})),
  };return plugin;
 }
 return{
  async open(tab='library'){const ticket=++generation;const current=await initialize(ticket);if(disposed||ticket!==generation)return;modal?.close();modal=new SubscriptionCenter(current.app,current,tab);modal.open();},
  dispose(){disposed=true;generation++;modal?.close();modal=null;owner.unload();plugin=null;},
 };
}
