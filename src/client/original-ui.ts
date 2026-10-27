export * from './harness-ui';
import {ItemView as HostItemView} from './harness-ui';
// The original outline owns its DOM; the Harness mounting leaf owns its lifetime.
export class ItemView extends HostItemView {leaf:any;private cleanups:Array<()=>void>=[];constructor(leaf:any){super(leaf);this.leaf=leaf;}register(fn:()=>void){this.cleanups.push(fn);}registerEvent(ref:any){if(typeof ref==='function')this.register(ref);}unload(){for(const cleanup of this.cleanups.splice(0))cleanup();}}

export class TFolder {constructor(public path:string){}}
export class TFile {extension="md";basename:string;constructor(public path:string,public stat:any={}){this.basename=path.split("/").at(-1)!.replace(/\.md$/i, "");}}
