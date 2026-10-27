import {RssSpeech} from '../original/speech';
import {SpeechSettingsModal} from '../original/speech-settings';
import {speechHighlightSchema} from '../original/speech-highlight';
import {normalizeSettings,ttsSecretId} from '../shared-audio/settings.js';
import {initLanguage} from '../shared-audio/i18n.js';
import {enhance,setPlatform,disposeSurfaces,watchHostTheme} from './original-ui';
const workspace=()=>({on(name,fn){const listener=event=>fn(event.detail);document.addEventListener(name,listener);return{name,listener};},offref(ref){document.removeEventListener(ref.name,ref.listener);},trigger(name,value){document.dispatchEvent(new CustomEvent(name,{detail:value}));}});
export function createRssSpeechClient(api){let service,plugin,initializing,disposed=false,generation=0,unregister,mountId=0;const modals=new Set(),watchers=new Set();let unwatchTheme;const changed=()=>{for(const fn of watchers)fn();};
 const secret=async(provider)=>(await api.speechOperation({action:'secret',operation:'get',id:ttsSecretId(provider,'qiaomu-rss-dsh')})).value;
 const read=async()=>plugin?.state?.settings?.tts||(await api.speechOperation({action:'load'})).settings?.tts;
 const reset=()=>{generation++;mountId++;for(const modal of modals)modal.close();modals.clear();plugin?.speech.dispose();plugin?.bridge.dispose();plugin?.clearSecrets();plugin=null;initializing=null;};
 async function initialize(){if(plugin)return plugin;if(initializing)return initializing;if(!service?.createSpeechBridge)throw Error('请启用乔木 Audio 0.1.1 或更新版本。');const token=generation;
 const task=(async()=>{const bridge=await service.createSpeechBridge();try{const saved=await api.speechOperation({action:'load'});if(disposed||token!==generation)throw Error('RSS speech disconnected');setPlatform({platform:bridge.platform});initLanguage();unwatchTheme ||= watchHostTheme();const secrets=new Map();const settings={...saved.settings,tts:normalizeSettings({tts:saved.settings?.tts}).tts,speechHighlight:speechHighlightSchema.parse(saved.settings?.speechHighlight)};await Promise.all([...new Set([settings.tts.provider,...Object.keys(settings.tts.profiles)])].filter(id=>!['system','macos','edge','localModel'].includes(id)).map(async id=>secrets.set(ttsSecretId(id,'qiaomu-rss-dsh'),await secret(id))));if(disposed||token!==generation)throw Error('RSS speech disconnected');let saving=Promise.resolve();
 const current={manifest:{id:'qiaomu-rss-dsh'},state:{settings,speechProgress:saved.speechProgress||{}},bridge,clearSecrets:()=>secrets.clear(),app:{workspace:workspace(),vault:{adapter:{}},speechSettings:source=>source==='qiaomu-audio'?service?.exportSpeechSettings?.():null,secretStorage:{getSecret:id=>secrets.get(id)||'',async setSecret(id,value){await api.speechOperation({action:'secret',operation:'set',id,value});if(!disposed&&token===generation)secrets.set(id,value);}}},
 persist(){const state=structuredClone(current.state);const task=saving.then(()=>api.speechOperation({action:'save',state}));saving=task.catch(()=>{});return task;},
 openSpeechSettings(onReady){const modal=new SpeechSettingsModal(current,onReady);modals.add(modal);modal.open();},
 };
 bridge.importSpeech=async(source)=>{if(source!=='qiaomu-audio'||!service?.exportSpeechSettings)return null;const imported=await service.exportSpeechSettings({includeSecrets:true});if(disposed||token!==generation)throw Error('RSS speech disconnected');let keys=0;for(const [provider,value] of Object.entries(imported.secrets||{})){const id=ttsSecretId(provider,'qiaomu-rss-dsh');if(!secrets.get(id)&&value){await current.app.secretStorage.setSecret(id,value);keys++;}}return{tts:normalizeSettings({tts:imported.tts}).tts,keys};};
 current.speech=new RssSpeech(current);plugin=current;return current;
 }catch(error){bridge.dispose();throw error;}})().finally(()=>{if(initializing===task)initializing=null;});initializing=task;return task;}
 return {subscribe(fn){watchers.add(fn);return()=>watchers.delete(fn);},connect(next){if(disposed)return()=>{};reset();unregister?.();service=next;unregister=service.registerSpeechSource('qiaomu-rss-dsh',{read,getSecret:secret});changed();return()=>{if(service!==next)return;unregister?.();unregister=null;service=null;reset();changed();};},
 async mount(root,toolbar,context){const ticket=++mountId,current=await initialize();if(disposed||ticket!==mountId||!toolbar.isConnected)return()=>{};const cleanups=[];const view={contentEl:enhance(root),speechContext:()=>{const value=context();if(value?.prose){enhance(value.prose);for(const el of value.prose.querySelectorAll('*'))enhance(el);}return value;},register:fn=>cleanups.push(fn)};current.speech.attach(view,enhance(toolbar));return()=>{current.speech.detach(view);for(const clean of cleanups)clean();toolbar.replaceChildren();};},
 async settings(){(await initialize()).openSpeechSettings();},
 dispose(){disposed=true;unregister?.();reset();service=null;watchers.clear();unwatchTheme?.();disposeSurfaces();},
 };
}
