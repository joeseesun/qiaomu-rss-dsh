import {parse as parseYaml} from 'yaml';
import path from 'node:path';
import {mkdir,open,unlink,readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NotesStore} from './notes-store.js';
import {originalEntry,cachedEntries,hiddenArticle} from './library.js';
import {articleFolderPath,linkAttachments} from '../original/vault-paths';
import {appendDailyNoteLink,captureMoment,dailyNotePath,renderDailyNoteTemplate} from '../original/daily-note';
const digest=text=>createHash('sha256').update(text).digest('hex');
const MAX_NOTE=2*1024*1024, MAX_IMAGE=12*1024*1024;
const types={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/avif':'avif'};
function plain(value,limit,label){if(typeof value!=='string'||Buffer.byteLength(value)>limit||value.includes('\0'))throw Error(`Invalid ${label}`);return value;}
function preferences(raw={}){return{articleFolder:typeof raw.articleFolder==='string'?raw.articleFolder:'Articles',dailyFolder:typeof raw.dailyFolder==='string'?raw.dailyFolder:'Daily',dailyFormat:typeof raw.dailyFormat==='string'?raw.dailyFormat:'YYYY-MM-DD',dailyTemplate:typeof raw.dailyTemplate==='string'?raw.dailyTemplate:'',selectionPopup:raw.selectionPopup!==false};}
// A narrow, Markdown-only directory boundary; never exposes an arbitrary OS file API.
export function createNotesHost(store,root,{fetchImage=fetch,now=()=>new Date()}={}){
 let files,lane=Promise.resolve();const notes=()=>files??=new NotesStore(root);
 async function writeNew(relative,content){if(relative.endsWith('.md')&&Buffer.byteLength(content)>MAX_NOTE)throw Error('Note exceeds 2 MB');const filename=await notes().resolve(relative,{directory:!relative.endsWith('.md')});await mkdir(path.dirname(filename),{recursive:true,mode:0o700});await notes().resolve(relative,{directory:!relative.endsWith('.md')});const handle=await open(filename,'wx',0o600);try{await handle.writeFile(content);await handle.sync();}catch(error){await handle.close();await unlink(filename).catch(()=>{});throw error;}await handle.close();return filename;}
 async function image(url){let target=new URL(plain(url,8192,'image URL'));if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw Error('Unsupported image URL');const response=await fetchImage(target.href,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{Accept:'image/*'}});if(!response.ok)throw Error(`Image HTTP ${response.status}`);const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),extension=types[type];if(!extension){await response.body?.cancel();throw Error('Unsupported image format');}if(Number(response.headers.get('content-length'))>MAX_IMAGE){await response.body?.cancel();throw Error('Image exceeds 12 MB');}const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>MAX_IMAGE){await response.body.cancel?.().catch(()=>{});throw Error('Image exceeds 12 MB');}chunks.push(chunk);}const buffer=Buffer.concat(chunks);if(!buffer.length)throw Error('Empty image');return{buffer,extension};}
 async function snapshot(){const entries=[],folders=['/'];const walk=async(folder,depth)=>{if(depth>16||entries.length+folders.length>=3000)return;const listing=await notes().list(folder);for(const item of listing.entries){const relative=folder?`${folder}/${item.name}`:item.name;if(item.directory){folders.push(relative);await walk(relative,depth+1);}else entries.push({path:relative});if(entries.length+folders.length>=3000)break;}};await walk('',0);return{root:notes().root,entries,folders,settings:preferences(store.data.notes)};}
 async function save(request){
  plain(request.key,1000,'article');const entry=cachedEntries(store.data).get(request.key);if(!entry||hiddenArticle(store.data,entry))throw Error('Article is not available');
  if(!['original','translation','rewrite'].includes(request.mode))throw Error('Invalid reading version');const markdown=plain(request.markdown,MAX_NOTE,'Markdown');if(!markdown.trim())throw Error('No exportable content');
  const folder=articleFolderPath(plain(request.folder??preferences(store.data.notes).articleFolder,500,'folder'));
  let name=plain(request.name,512,'filename');while(Buffer.byteLength(name)>210)name=[...name].slice(0,-1).join('');if(!name.trim()||/[\\/:*?"<>|\x00-\x1f]/.test(name)||name.startsWith('.'))throw Error('Invalid filename');
  const images=request.images??[];if(!Array.isArray(images)||images.length>100)throw Error('Too many images');
  const links=new Map(),created=[];let missingImages=0,total=0;
  try{
   for(const [index,url] of images.entries()){
    const token=`qrs-asset-${index}`;plain(url,8192,'image URL');const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Unsupported image URL');links.set(token,`![image](<${url.replace(/[<>\r\n]/g,'')}>)`);
    try{if(total>=64*1024*1024)throw Error("Article images exceed 64 MB");const {buffer,extension}=await image(url);total+=buffer.length;if(total>64*1024*1024)throw Error('Article images exceed 64 MB');const relative=`${folder?folder+'/':''}attachments/${digest(buffer)}.${extension}`;let filename;try{filename=await writeNew(relative,buffer);created.push(filename);}catch(error){if(error.code!=='EEXIST')throw error;filename=await notes().resolve(relative,{directory:true});const bytes=await readFile(filename);if(digest(bytes)!==digest(buffer))throw Error('Existing attachment differs');}links.set(token,`![image](<attachments/${path.basename(relative)}>)`);}catch{missingImages++;}
   }
   const content=linkAttachments(markdown,links);let relative,absolute;
   for(let n=1;n<=10000;n++){relative=`${folder?folder+'/':''}${name}${n>1?' ('+n+')':''}.md`;try{absolute=await writeNew(relative,content);break;}catch(error){if(error.code!=='EEXIST'||n===10000)throw error;}}
   return{path:relative,absolute,missingImages};
  }catch(error){for(const filename of created)await unlink(filename).catch(()=>{});throw error;}
 }
 async function capture(request){
  const entry=cachedEntries(store.data).get(plain(request.key,1000,'article'));if(!entry||hiddenArticle(store.data,entry))throw Error('Article is not available');
  if(!['original','translation','rewrite'].includes(request.mode))throw Error('Invalid reading version');const markdown=plain(request.markdown,MAX_NOTE,'Markdown');if(!markdown.trim())throw Error('No exportable content');const excerpt=plain(request.excerpt??'',128*1024,'excerpt');
  const settings=preferences(store.data.notes),date=captureMoment(now());const relative=request.target?plain(request.target,1000,'target note').replace(/\\/g,'/'):dailyNotePath({folder:settings.dailyFolder,format:settings.dailyFormat,template:settings.dailyTemplate},date);
  await notes().resolve(relative);let existing;try{existing=await notes().read(relative);}catch(error){if(error.code!=='ENOENT'||request.target)throw error;}
  let text=existing?.text||'';if(!existing&&settings.dailyTemplate){const template=await notes().read(settings.dailyTemplate);text=renderDailyNoteTemplate(template.text,path.posix.basename(relative,'.md'),date);}
  const identity=digest((entry.collectionOrigin||store.data.settings?.origin||'')+'|'+entry.key);
  const saved=`Articles/Snapshots/${identity}-${request.mode}-${digest(markdown).slice(0,16)}.md`;let created;
  try{try{created=await writeNew(saved,markdown);}catch(error){if(error.code!=='EEXIST')throw error;const cached=await notes().read(saved);if(cached.text!==markdown)throw Error('Saved article was changed; preserving your file');}
   const snapshot=path.posix.relative(path.posix.dirname(relative),saved).split('/').map(encodeURIComponent).join('/')+'#qrs-article-'+identity;
   const next=appendDailyNoteLink(text,originalEntry(entry,store.data),{article:identity,mode:request.mode,excerpt,snapshot});
   if(next.content!==existing?.text){if(existing)await notes().write({path:relative,text:next.content,etag:existing.etag});else await writeNew(relative,next.content);}
   return{path:relative,absolute:await notes().resolve(relative),added:next.added};
  }catch(error){if(created)await unlink(created).catch(()=>{});throw error;}
 }
 return request=>{const task=lane.then(async()=>{
  if(!request||typeof request.action!=='string')throw Error('Invalid notes operation');
  if(request.action==='snapshot')return snapshot();
  if(request.action==='read')return notes().read(plain(request.path,1000,'note path'));
  if(request.action==='entries'){
   const folder=plain(request.folder,1000,'note source');if(folder!=='/')await notes().resolve(folder,{directory:true});const listing=await snapshot();const entries=[];
   for(const item of listing.entries){if(folder!=='/'&&item.path!==folder&&!item.path.startsWith(folder+'/'))continue;
    try{const filename=await notes().resolve(item.path),stat=await lstat(filename);if(!stat.isFile()||stat.size>MAX_NOTE)throw Error('Note exceeds 2 MB or is not a file');const handle=await open(filename,'r');let header;try{const buffer=Buffer.alloc(Math.min(stat.size,65536));const result=await handle.read(buffer,0,buffer.length,0);header=buffer.subarray(0,result.bytesRead).toString('utf8');}finally{await handle.close();}const front=/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(header);let meta={};if(front){try{const parsed=parseYaml(front[1],{maxAliasCount:20});if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))meta=parsed;}catch{}}
     const title=typeof meta.title==='string'?meta.title:path.posix.basename(item.path,'.md');let url;for(const key of ['source','url']){if(typeof meta[key]==='string'){try{const parsed=new URL(meta[key]);if(['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password){url=parsed.href;break;}}catch{}}}
     entries.push({path:item.path,title,url,publishedAt:new Date(stat.mtimeMs).toISOString()});
    }catch(error){if(error.code!=='ENOENT')entries.push({path:item.path,title:path.posix.basename(item.path,'.md'),error:error.message});}
   }return{entries:entries.sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0))};
  }
  if(request.action==='save')return save(request);
  if(request.action==='capture')return capture(request);
  if(request.action==='settings'){
   const previous=store.data.notes,next=preferences(previous);for(const [key,value] of Object.entries(request.patch||{})){
    if(['articleFolder','dailyFolder'].includes(key)){next[key]=articleFolderPath(plain(value,500,key));await notes().resolve(next[key],{directory:true});}
    else if(key==='dailyTemplate'){next[key]=plain(value,1000,key).trim();if(next[key])await notes().resolve(next[key]);}
    else if(key==='dailyFormat'){next[key]=plain(value,200,key).trim();if(!next[key])throw Error('Date format is required');await notes().resolve(dailyNotePath({folder:next.dailyFolder,format:next[key]},captureMoment(now())));}
    else if(key==='selectionPopup'){if(typeof value!=='boolean')throw Error('Invalid selection popup setting');next[key]=value;}
   }
   store.data.notes=next;try{await store.flush();}catch(error){store.data.notes=previous;throw error;}return next;
  }
  throw Error('Unknown notes operation');
 });lane=task.catch(()=>{});return task;};
}
