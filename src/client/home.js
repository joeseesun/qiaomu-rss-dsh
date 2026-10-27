import {createHomeProvider} from '../original/home';
/** Original RSS Home presentation, with snapshot and navigation supplied by Harness. */
export function createRssHomeProvider({load,open,subscribe}) {
  const provider = snapshot => createHomeProvider({
    state:{readIds:snapshot.readIds,favorites:Object.fromEntries(snapshot.entries.filter(entry=>snapshot.favoriteIds.includes(entry.id)).map(entry=>[entry.id,{entry}])),savedArticles:{}},
    homeEntries:()=>snapshot.entries,
    articleHidden:()=>false,
    openHomeEntry:entry=>open({kind:'article',key:entry.id}),
    openReader:()=>open({kind:'reader'}),
    manageSubscriptions:()=>open({kind:'subscriptions'}),
  });
  return {
    protocol:'qiaomu-home',version:1,subscribe,
    async sections(){return provider(await load()).sections();},
    actions(){return provider({entries:[],readIds:[],favoriteIds:[]}).actions();},
    async search(query,limit=6){if(!query?.trim())return [];return provider(await load()).search(query.trim(),Math.max(1,Math.min(Number(limit)||6,20)));},
  };
}
export function createHomeActions(){
  let handler,pending,disposed=false;const listeners=new Set();
  return {
    changed(){if(!disposed)for(const fn of listeners)fn();},
    subscribe(fn){if(disposed)return()=>{};listeners.add(fn);return()=>listeners.delete(fn);},
    send(action){if(disposed)return;if(handler)handler(action);else pending=action;},
    attach(next){if(disposed)return()=>{};handler=next;if(pending){const action=pending;pending=null;next(action);}return()=>{if(handler===next)handler=null;};},
    dispose(){disposed=true;handler=null;pending=null;listeners.clear();},
  };
}
