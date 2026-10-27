export function createViewMemory(api){const cache=new Map(),pending=new Map();let lane=Promise.resolve(),disposed=false;
 const id=(origin,channel)=>JSON.stringify([origin,channel]);
 return{
  async load(origin,channel){const key=id(origin,channel);if(cache.has(key))return structuredClone(cache.get(key));if(!pending.has(key)){const job=api.viewOperation({action:'load',origin,channel}).then(value=>{if(!disposed&&!cache.has(key))cache.set(key,value);return structuredClone(cache.has(key)?cache.get(key):value);}).finally(()=>pending.delete(key));pending.set(key,job);}return pending.get(key);},
  save(origin,channel,value){if(disposed||channel==='collection')return Promise.resolve();const key=id(origin,channel),next=structuredClone(value);if(JSON.stringify(cache.get(key))===JSON.stringify(next))return lane;cache.set(key,next);const task=lane.catch(()=>{}).then(()=>api.viewOperation({action:'save',origin,channel,value:next})).catch(error=>{if(cache.get(key)===next)cache.delete(key);throw error;});lane=task;return task;},
  dispose(){disposed=true;pending.clear();cache.clear();return lane.catch(()=>{});}
 };
}
