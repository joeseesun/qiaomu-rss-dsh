// Narrow native-DOM host boundary for the original Qiaomu UI components.
// No Obsidian runtime or global Element prototype modifications.
import {icons,createElement as svgElement} from 'lucide';
type AnyElement = HTMLElement & Record<string, any>;
const cleanups = new Map<HTMLElement, Set<()=>void>>();
let observer: MutationObserver | null = null;
const surfaces = new Set<{close:()=>void}>();
export function onRemove(el: HTMLElement,fn:()=>void) {
 if(!cleanups.has(el))cleanups.set(el,new Set());cleanups.get(el)!.add(fn);
 if(!observer){observer=new MutationObserver(()=>{for(const [el,callbacks] of cleanups)if(!el.isConnected){callbacks.forEach(fn=>fn());cleanups.delete(el);}});observer.observe(document.body,{childList:true,subtree:true});}
}
export function disposeSurfaces() {for(const s of [...surfaces])s.close();for(const callbacks of cleanups.values())callbacks.forEach(fn=>fn());cleanups.clear();observer?.disconnect();observer=null;}
export function enhance<T extends HTMLElement>(element:T):T & Record<string,any> {
 const el=element as AnyElement;if(el.createDiv)return el as any;
 Object.assign(el,{
  createEl:(tag:string,options:any={},callback?:any)=>{const child=createEl(tag,options);el.appendChild(child);callback?.(child);return child;},
  createDiv:(options:any={},callback?:any)=>el.createEl('div',options,callback),
  createSpan:(options:any={},callback?:any)=>el.createEl('span',options,callback),
  empty:()=>{el.replaceChildren();return el;},setText:(text:any)=>{el.textContent=String(text??'');return el;},appendText:(text:any)=>{el.append(document.createTextNode(String(text)));return el;},
  addClass:(...names:string[])=>{el.classList.add(...names.flatMap(n=>n.split(/\s+/)).filter(Boolean));return el;},
  removeClass:(...names:string[])=>{el.classList.remove(...names);return el;},
  hasClass:(name:string)=>el.classList.contains(name),toggleClass:(name:string,on:boolean)=>{el.classList.toggle(name,on);return el;},
  setAttr:(name:string,value:any)=>{if(value==null)el.removeAttribute(name);else el.setAttribute(name,String(value));return el;},getAttr:(name:string)=>el.getAttribute(name),
  setCssProps:(values:Record<string,string>)=>{for(const [name,value] of Object.entries(values))el.style.setProperty(name,value);return el;},
  hide:()=>{el.style.display='none';},show:()=>{el.style.removeProperty('display');},
 });return el as any;
}
export function createEl(tag:string,options:any={}) {
 const el=enhance(document.createElement(tag));if(typeof options==='string')options={cls:options};
 if(options.cls)el.className=options.cls;if(options.text!=null)el.textContent=String(options.text);
 for(const key of ['type','placeholder','href','title','value'])if(options[key]!=null)el.setAttribute(key,String(options[key]));
 for(const [k,v] of Object.entries(options.attr||{}))el.setAttr(k,v);
 if(tag==='a'){el.setAttribute('rel','noopener noreferrer');}
 return el;
}
export function setIcon(el:HTMLElement,name:string) {const key=name.replace(/(^|-)(\w)/g,(_,dash,c)=>c.toUpperCase());const data=(icons as any)[key];el.replaceChildren();if(!data)return;const svg=svgElement(data,{class:'svg-icon',width:18,height:18,'aria-hidden':'true'});el.append(svg);}
export class Notice {
 el:AnyElement;timer:any;
 constructor(text:string,duration=4500){this.el=createEl('div',{cls:'qaudio-dsh-toast',text,attr:{role:'status'}});document.body.append(this.el);surfaces.add(this);if(duration)this.timer=setTimeout(()=>this.hide(),duration);}
 hide(){clearTimeout(this.timer);this.el.remove();surfaces.delete(this);}close(){this.hide();}
}
export class ItemView {
 contentEl:AnyElement;containerEl:AnyElement;app:any;
 constructor(leaf:any){this.contentEl=enhance(leaf.contentEl);this.containerEl=this.contentEl;this.app=leaf.app;}
}
export class Modal {
 app:any;modalEl:AnyElement;contentEl:AnyElement;containerEl:AnyElement;scope:any;previous:Element|null=null;keys:any[]=[];opened=false;
 constructor(app:any){this.app=app;this.containerEl=createEl('div',{cls:'qaudio-dsh-surface qaudio-dsh-overlay modal-container'});this.modalEl=this.containerEl.createDiv({cls:'modal',attr:{role:'dialog','aria-modal':'true',tabindex:'-1'}});const close=this.modalEl.createEl('button',{cls:'modal-close-button',attr:{'aria-label':'关闭 / Close'}});setIcon(close,'x');close.onclick=()=>this.close();this.contentEl=this.modalEl.createDiv('modal-content');this.scope={register:(_mods:any,key:string,fn:any)=>this.keys.push({key,fn})};this.containerEl.addEventListener('pointerdown',e=>{if(e.target===this.containerEl)this.close();});}
 onKey=(e:KeyboardEvent)=>{if([...surfaces].filter(s=>s instanceof Modal).at(-1)!==this)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.close();return;}if(e.key==='Tab'){const nodes=[...this.modalEl.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===this.modalEl)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 for(const binding of this.keys)if(e.key===binding.key&&binding.fn()===false){e.preventDefault();e.stopPropagation();}};
 open(){if(this.opened)return;this.opened=true;this.previous=document.activeElement;surfaces.add(this);document.body.append(this.containerEl);applyHostTheme();document.addEventListener('keydown',this.onKey,true);try{this.onOpen();}catch(e:any){new Notice(e.message);this.close();throw e;}this.modalEl.focus();}
 close(){if(!this.opened)return;this.opened=false;this.onClose();document.removeEventListener('keydown',this.onKey,true);this.containerEl.remove();surfaces.delete(this);if(this.previous instanceof HTMLElement&&this.previous.isConnected)this.previous.focus();}
 setTitle(text:string){let title=this.modalEl.querySelector('.modal-title') as AnyElement;if(!title){title=this.modalEl.createDiv('modal-title');this.modalEl.insertBefore(title,this.contentEl);}title.setText(text);this.modalEl.setAttribute('aria-label',text);return this;}
 onOpen(){}onClose(){}
}
class MenuItem {
 el:AnyElement;label:AnyElement;icon:AnyElement;action?:()=>any;
 constructor(root:AnyElement){this.el=root.createEl('button',{cls:'qaudio-dsh-menu-item',attr:{role:'menuitem'}});this.icon=this.el.createSpan();this.label=this.el.createSpan();}
 setDisabled(on:boolean){this.el.disabled=on;return this;}setTitle(text:string){this.label.setText(text);return this;}setIcon(icon:string){setIcon(this.icon,icon);return this;}setChecked(on:boolean){this.el.setAttr('aria-checked',on);this.el.setAttr('role','menuitemcheckbox');if(on)setIcon(this.icon,'check');return this;}onClick(fn:()=>any){this.action=fn;return this;}
}
export class Menu {
 el=createEl('div',{cls:'qaudio-dsh-surface qaudio-dsh-menu',attr:{role:'menu'}});items:MenuItem[]=[];previous:Element|null=null;
 addItem(fn:(item:MenuItem)=>any){const item=new MenuItem(this.el);fn(item);item.el.onclick=()=>{this.close();Promise.resolve().then(()=>item.action?.()).catch(e=>new Notice(e.message));};this.items.push(item);return this;}
 setUseNativeMenu(_on:boolean){return this;}addSeparator(){this.el.createEl('hr');return this;}
 outside=(e:Event)=>{if(!this.el.contains(e.target as Node))this.close();};
 key=(e:KeyboardEvent)=>{const index=this.items.findIndex(i=>i.el===document.activeElement);if(e.key==='Escape'){e.preventDefault();this.close();}else if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();this.items[(index+(e.key==='ArrowDown'?1:-1)+this.items.length)%this.items.length]?.el.focus();}};
 showAtMouseEvent(e:MouseEvent){this.showAtPosition({x:e.clientX,y:e.clientY});}
 showAtPosition({x,y}:{x:number,y:number}){this.previous=document.activeElement;document.body.append(this.el);surfaces.add(this);this.el.style.left=Math.min(x,innerWidth-this.el.offsetWidth-8)+'px';this.el.style.top=Math.min(y,innerHeight-this.el.offsetHeight-8)+'px';queueMicrotask(()=>document.addEventListener('pointerdown',this.outside));document.addEventListener('keydown',this.key,true);this.items[0]?.el.focus();}
 close(){this.el.remove();document.removeEventListener('pointerdown',this.outside);document.removeEventListener('keydown',this.key,true);surfaces.delete(this);if(this.previous instanceof HTMLElement&&this.previous.isConnected)this.previous.focus();}
}
export class PluginSettingTab {containerEl:AnyElement;constructor(public app:any,public plugin:any){this.containerEl=createEl('div');}}
class Control {
 constructor(public el:any){} get inputEl(){return this.el;}get selectEl(){return this.el;}get buttonEl(){return this.el;}get sliderEl(){return this.el;}get toggleEl(){return this.el;}getValue(){return this.el.type==='checkbox'?this.el.checked:this.el.value;}setDisabled(on:boolean){this.el.disabled=on;return this;}setCta(){this.el.addClass('mod-cta');return this;}setLimits(min:number,max:number,step:number){Object.assign(this.el,{min,max,step});return this;}setDynamicTooltip(){return this;}setValue(value:any){if(this.el.type==='checkbox')this.el.checked=!!value;else this.el.value=value;return this;}
 setPlaceholder(text:string){this.el.placeholder=text;return this;}addOption(value:string,text:string){this.el.createEl('option',{text,attr:{value}});return this;}
 onChange(fn:any){this.el.addEventListener(this.el.tagName==='INPUT'&&this.el.type!=='checkbox'?'input':'change',()=>Promise.resolve(fn(this.el.type==='checkbox'?this.el.checked:this.el.value)).catch(e=>new Notice(e.message)));return this;}
 setButtonText(text:string){this.el.setText(text);return this;}setIcon(icon:string){const span=this.el.createSpan();setIcon(span,icon);return this;}onClick(fn:any){this.el.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>new Notice(e.message)));return this;}setWarning(){this.el.addClass('mod-warning');return this;}
}
export class Setting {
 el:AnyElement;name:AnyElement;desc:AnyElement;controls:AnyElement;
 constructor(root:AnyElement){this.el=root.createDiv('setting-item');const info=this.el.createDiv('setting-item-info');this.name=info.createDiv('setting-item-name');this.desc=info.createDiv('setting-item-description');this.controls=this.el.createDiv('setting-item-control');}
 get settingEl(){return this.el;}get nameEl(){return this.name;}get descEl(){return this.desc;}get controlEl(){return this.controls;}setHeading(){this.el.classList.add('setting-item-heading');return this;}setClass(name:string){this.el.addClass(name);return this;}setDisabled(on:boolean){this.controls.querySelectorAll('input,select,button').forEach((el:any)=>el.disabled=on);return this;}addSlider(fn:any){fn(new Control(this.controls.createEl('input',{type:'range'})));return this;}addTextArea(fn:any){fn(new Control(this.controls.createEl('textarea')));return this;}setName(s:string){this.name.setText(s);return this;}setDesc(s:any){if(s instanceof Node)this.desc.replaceChildren(s);else this.desc.setText(s);return this;}
 addDropdown(fn:any){fn(new Control(this.controls.createEl('select')));return this;}addText(fn:any){fn(new Control(this.controls.createEl('input',{type:'text'})));return this;}addToggle(fn:any){fn(new Control(this.controls.createEl('input',{type:'checkbox'})));return this;}addButton(fn:any){fn(new Control(this.controls.createEl('button')));return this;}
}
export const normalizePath=(p:string)=>p.replace(/\\/g,'/').replace(/\/+/g,'/');

export const createDiv=(options:any={},callback?:any)=>{const el=createEl("div",options);callback?.(el);return el;};
export const createSpan=(options:any={},callback?:any)=>{const el=createEl("span",options);callback?.(el);return el;};

export const Platform={isDesktop:true,isDesktopApp:true,isMacOS:false};
export function setPlatform(value:any){Platform.isMacOS=value.platform==='darwin';}
export const getLanguage=()=>document.documentElement.lang||navigator.language;
export function createFragment(fn:any){const f=enhance(document.createElement('span'));fn(f);const fragment=document.createDocumentFragment();fragment.append(...f.childNodes);return fragment;}
export class Scope {bindings:any[]=[];constructor(_parent:any){}register(mods:any,key:string,fn:any){this.bindings.push({mods,key,fn});}handle=(event:KeyboardEvent)=>{for(const b of this.bindings)if(event.key===b.key&&b.fn(event)===false){event.preventDefault();event.stopPropagation();}};}
export class FuzzySuggestModal extends Modal {placeholder='';setPlaceholder(s:string){this.placeholder=s;}getItems():any[]{return [];}getItemText(item:any){return String(item);}onChooseItem(_item:any){}onOpen(){const input=this.contentEl.createEl('input',{type:'search',placeholder:this.placeholder});const list=this.contentEl.createDiv();const draw=()=>{list.empty();for(const item of this.getItems().filter(i=>this.getItemText(i).toLowerCase().includes(input.value.toLowerCase())).slice(0,200)){const b=list.createEl('button',{text:this.getItemText(item)});b.onclick=()=>{this.onChooseItem(item);this.close();};}};input.oninput=draw;draw();}}

export function applyHostTheme(){const value=getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim();let channels:number[]=[];if(/^#[0-9a-f]{6,8}$/i.test(value))channels=[1,3,5].map(at=>parseInt(value.slice(at,at+2),16));else if(value.startsWith('rgb'))channels=(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);const dark=channels.length===3&&(channels[0]*.2126+channels[1]*.7152+channels[2]*.0722)<128;for(const el of document.querySelectorAll('.qaudio-dsh-surface')){el.classList.toggle('theme-dark',dark);el.classList.toggle('theme-light',!dark);}}
export function watchHostTheme(){applyHostTheme();const observer=new MutationObserver(applyHostTheme);observer.observe(document.head,{subtree:true,childList:true,characterData:true,attributes:true});observer.observe(document.documentElement,{attributes:true});observer.observe(document.body,{attributes:true});return()=>observer.disconnect();}
