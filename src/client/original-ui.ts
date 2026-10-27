export * from './harness-ui';
import {ItemView as HostItemView} from './harness-ui';
// The original outline owns its DOM; the Harness mounting leaf owns its lifetime.
export class ItemView extends HostItemView {leaf:any;private cleanups:Array<()=>void>=[];constructor(leaf:any){super(leaf);this.leaf=leaf;}register(fn:()=>void){this.cleanups.push(fn);}registerEvent(ref:any){if(typeof ref==='function')this.register(ref);}unload(){for(const cleanup of this.cleanups.splice(0))cleanup();}}

export class TFolder {constructor(public path:string){}}
export class TFile {extension="md";basename:string;constructor(public path:string,public stat:any={}){this.basename=path.split("/").at(-1)!.replace(/\.md$/i, "");}}
export class Component {
 private loaded=false;private children=new Set<any>();private cleanups:Array<()=>void>=[];
 load(){if(this.loaded)return;this.loaded=true;this.onload();for(const child of this.children)child.load();}
 unload(){if(!this.loaded)return;this.loaded=false;this.onunload();for(const child of this.children)child.unload();for(const cleanup of this.cleanups.splice(0))cleanup();}
 onload(){}onunload(){}
 addChild<T extends {load:()=>void,unload:()=>void}>(child:T){this.children.add(child);if(this.loaded)child.load();return child;}
 removeChild(child:any){child.unload();this.children.delete(child);}
 register(fn:()=>void){this.cleanups.push(fn);}
 registerDomEvent(el:any,event:string,fn:any,options?:any){el.addEventListener(event,fn,options);this.register(()=>el.removeEventListener(event,fn,options));}
 registerInterval(id:any){this.register(()=>clearInterval(id));}
}
