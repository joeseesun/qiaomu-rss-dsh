export interface Entry {id:string;title:string;titleZh?:string;link?:string;videoUrl?:string;audio?:{url:string;type?:string}}
export function titleOf(entry:Entry){return entry.titleZh?.trim()||entry.title;}
export function safeUrl(value:string,base?:string):string|null{try{const url=new URL(value,base);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
