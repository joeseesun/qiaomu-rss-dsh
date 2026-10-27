// Network boundary for original feed-resolver. Each mounted client supplies its
// own Host transport; no singleton bridge or browser CORS workaround.
export interface ImportDocument {url:string;text:string;headers?:Record<string,string>;finalUrl?:string}
export function importUrl(value:string){const url=new URL(value);if(url.hostname==='github.com'&&/^\/[^/]+\/[^/]+\/blob\//.test(url.pathname)){url.hostname='raw.githubusercontent.com';url.pathname=url.pathname.replace('/blob/','/');}return url.href;}
export async function readImportUrl():Promise<ImportDocument>{throw Error('Harness source transport is not attached');}
