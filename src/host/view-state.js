import {z} from 'zod';
import {channelStateSchema} from '../original/model';
// Original channel fields, without duplicating article bodies or feed entries.
export const viewSchema=channelStateSchema.pick({filter:true,query:true,mode:true,listTop:true,readerTop:true}).extend({query:z.string().max(2000),key:z.string().max(1000).nullable(),listCount:z.number().int().min(0).max(500),platform:z.string().max(100).default('all'),searchOpen:z.boolean().default(false),listTop:z.number().min(0).max(10000000),readerTop:z.number().min(0).max(10000000)});
export function createViewStateHost(store){let lane=Promise.resolve();return request=>{const task=lane.then(async()=>{
 if(!request||typeof request.channel!=='string'||request.channel.length>1000)throw Error('Invalid channel');
 const origin=new URL(request.origin||store.data.settings.origin||'https://rss.qiaomu.ai');if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Invalid channel scope');
 const key=JSON.stringify([origin.href.replace(/\/$/,''),request.channel]);const states=store.data.channelViews||{};
 if(request.action==='load')return states[key]?.value?structuredClone(states[key].value):null;
 if(request.action!=='save')throw Error('Unknown channel operation');const value=viewSchema.parse(request.value),previous=store.data.channelViews;
 const next={...states,[key]:{value,at:Date.now()}};for(const [old] of Object.entries(next).sort((a,b)=>b[1].at-a[1].at).slice(100))delete next[old];store.data.channelViews=next;
 try{await store.flush();}catch(error){if(store.data.channelViews===next)store.data.channelViews=previous;throw error;}return value;
 });lane=task.catch(()=>{});return task;};}
