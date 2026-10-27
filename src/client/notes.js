import {NoteLocationModal} from '../original/note-location';
import {VaultFilePicker} from '../original/vault-source';
import {articleExportBody,articleExportMarkdown,exportBaseName} from '../original/article-export';
import {SelectionCapture} from '../original/selection';
import {t} from '../original/i18n';
import {Modal,Setting,Notice,TFile,TFolder} from './original-ui';

export function noteMaterial(article,mode,prose,images=true){
 if(!article||!prose)throw Error(t('error.noExportableContent'));
 const bundle={entry:{id:article.key,title:article.title,titleZh:article.titleZh,sourceName:article.channelName,author:article.author,published:article.publishedAt,link:article.url,content:prose.innerHTML,origin:'qiaomu'},rewrite:null,translation:null};
 const body=articleExportBody(bundle,'original',prose.ownerDocument,images);
 const markdown=articleExportMarkdown(bundle,mode,body);if(!markdown)throw Error(t('error.noExportableContent'));
 return{bundle,body,markdown,key:article.key,mode,name:exportBaseName(bundle,mode)};
}
function vaultBoundary(snapshot){const files=[...snapshot.folders.map(path=>new TFolder(path)),...snapshot.entries.map(entry=>new TFile(entry.path))];return{vault:{getAbstractFileByPath:path=>files.find(file=>file.path===path),getAllLoadedFiles:()=>files,getMarkdownFiles:()=>files.filter(file=>file instanceof TFile)}};}
export function createNotesClient(api){let disposed=false,generation=0;const modals=new Set(),popups=new Set();let settings={selectionPopup:true};
 const show=modal=>{if(disposed)return;modals.add(modal);const close=modal.onClose.bind(modal);modal.onClose=()=>{modals.delete(modal);close();};modal.open();};
 const load=async()=>{const state=await api.notesOperation({action:'snapshot'});if(!state?.settings||!Array.isArray(state.entries)||!Array.isArray(state.folders))throw Error('RSS notes service is not ready');if(!disposed)settings=state.settings;return state;};
 const saved=result=>{if(disposed)return;const notice=new Notice(result.added===false?t('notice.alreadyInNote'):t('notice.appendedToNote',{name:result.path}),8000);const open=notice.el.createEl('button',{text:'打开笔记'});open.onclick=()=>void api.openNote(result.absolute).then(()=>notice.hide()).catch(error=>{if(!disposed)new Notice(error.message);});if(result.missingImages)new Notice(`已保存正文，${result.missingImages} 张图片未下载，保留原图链接。`);};
 const capture=async(material,excerpt='',target)=>{const result=await api.notesOperation({action:'capture',key:material.key,mode:material.mode,markdown:material.markdown,excerpt,target});saved(result);return result;};
 return{
  async save(material){const ticket=++generation,state=await load();if(disposed||ticket!==generation)return;show(new NoteLocationModal(vaultBoundary(state),state.settings.articleFolder,material.name,async(folder,remember)=>{
   if(disposed)throw Error('RSS closed');const body=material.body.cloneNode(true),images=[];for(const img of body.querySelectorAll('img[src]')){images.push(img.getAttribute('src'));img.setAttribute('src',`qrs-asset-${images.length-1}`);}
   const markdown=articleExportMarkdown(material.bundle,material.mode,body);const result=await api.notesOperation({action:'save',key:material.key,mode:material.mode,name:material.name,markdown,images,folder});saved(result);
   if(remember&&!disposed)try{settings=await api.notesOperation({action:'settings',patch:{articleFolder:folder}});}catch(error){new Notice(`笔记已保存，记住目录失败：${error.message}`);}
  }));},
  capture,
  async choose(material,excerpt=''){const ticket=++generation,state=await load();if(disposed||ticket!==generation)return;show(new VaultFilePicker(vaultBoundary(state),file=>{void capture(material,excerpt,file.path).catch(error=>{if(!disposed)new Notice(error.message);});}));},
  async settings(){const ticket=++generation,state=await load();if(disposed||ticket!==generation)return;
   class NotesSettings extends Modal{onOpen(){this.setTitle('笔记与摘录');const draft={...state.settings};new Setting(this.contentEl).setName('笔记目录').setDesc(state.root);
    for(const [key,label,desc] of [['articleFolder',t('settings.articleFolder.name'),t('note.folderHint')],['dailyFolder','日记目录','相对于笔记目录'],['dailyFormat','日记日期格式','YYYY-MM-DD'],['dailyTemplate','日记模板','笔记目录内的 Markdown 文件，相对路径']])new Setting(this.contentEl).setName(label).setDesc(desc).addText(input=>input.setValue(draft[key]).onChange(value=>draft[key]=value));
    new Setting(this.contentEl).setName('选文工具条').addToggle(toggle=>toggle.setValue(draft.selectionPopup).onChange(value=>draft.selectionPopup=value));
    new Setting(this.contentEl).addButton(button=>button.setButtonText(t('common.save')).setCta().onClick(async()=>{button.setDisabled(true);try{if(disposed)return;settings=await api.notesOperation({action:'settings',patch:draft});this.close();}finally{button.setDisabled(false);}}));
   }}show(new NotesSettings({}));
  },
  mount(root,context){const popup=new SelectionCapture(root.ownerDocument,()=>root,()=>{const value=context();if(!value||!settings.selectionPopup)return null;const material=value.material();const perform=fn=>async(...args)=>{try{if(!disposed)await fn(...args);}catch(error){if(!disposed)new Notice(error.message);}};return[
   {label:t('capture.appendDaily'),icon:'calendar-plus',save:perform(text=>capture(material,text))},
   {label:'追加到笔记…',icon:'file-pen-line',save:perform(text=>this.choose(material,text))},
   {label:t('speech.selection'),icon:'volume-2',save:perform((_text,range)=>value.speak(range))},
   {label:t('capture.askAi'),icon:'sparkles',save:perform(text=>value.ask(text))},
  ];});popups.add(popup);void load().catch(()=>{});return()=>{popup.dispose();popups.delete(popup);};},
  clear(){for(const popup of popups)popup.clear();},
  dispose(){disposed=true;generation++;for(const modal of modals)modal.close();modals.clear();for(const popup of popups)popup.dispose();popups.clear();}
 };
}
