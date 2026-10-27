import {Notice} from './original-ui';
import {t} from '../original/i18n';
import {DeletedArticlesModal} from '../original/deleted-articles';
export function createLibraryClient(api){let disposed=false,modal,generation=0;return{
 async delete(key){const result=await api.libraryOperation({action:'delete',key});if(disposed)return;api.homeActions.send({kind:'refresh',deletedKey:key});const notice=new Notice(t('localDelete.done'),8000);const undo=notice.el.createEl('button',{text:t('localDelete.undo')});undo.onclick=async()=>{undo.disabled=true;try{await api.libraryOperation({action:'restore',keys:result.record.keys});if(disposed)return;notice.hide();api.homeActions.send({kind:'refresh'});}catch(error){if(disposed)return;undo.disabled=false;new Notice(error.message);}};},
 async deleted(){const ticket=++generation;const state=await api.libraryOperation({action:'snapshot'});if(disposed||ticket!==generation)return;modal?.close();const plugin={app:{},state,async restoreLocalArticles(records){await api.libraryOperation({action:'restore',keys:records.flatMap(record=>record.keys)});if(disposed)return;Object.assign(state,await api.libraryOperation({action:'snapshot'}));api.homeActions.changed();api.homeActions.send({kind:'refresh'});}};modal=new DeletedArticlesModal(plugin);modal.open();},
 dispose(){disposed=true;generation++;modal?.close();modal=null;}
};}
