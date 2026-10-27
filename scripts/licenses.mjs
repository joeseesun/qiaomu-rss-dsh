import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
let output='# Dependency license texts\n\nGenerated from package-lock.json. Includes production packages present in this distribution/build environment and bundled Lucide icons. Optional packages absent from the environment are not bundled.\n';
for(const [dir,entry] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
 if(!dir||entry.dev&&!['node_modules/lucide','node_modules/lucide-react'].includes(dir)||entry.peer)continue;
 let names;try{names=await readdir(dir);}catch(error){if(entry.optional&&error.code==='ENOENT')continue;throw error;}
 const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
 const files=names.filter(name=>/^(licen[cs]e|copying|notice)([.\-_]|$)/i.test(name));
 let texts=[];for(const file of files){if((await stat(path.join(dir,file))).isFile())texts.push(`### ${file}\n\n${await readFile(path.join(dir,file),'utf8')}`);}
 if(!texts.length&&pkg.name==='isarray'){const readme=await readFile(path.join(dir,'README.md'),'utf8');texts=[readme.slice(readme.indexOf('## License')).replaceAll('&lt;','<').replaceAll('&gt;','>')];}
 if(!texts.length&&pkg.name.startsWith('@napi-rs/canvas-'))texts=[await readFile('node_modules/@napi-rs/canvas/LICENSE','utf8')];
 if(!texts.length&&pkg.name==='saxes')texts=[await readFile('licenses/saxes-ISC.txt','utf8')];
 if(!texts.length)throw Error(`Missing full license text: ${dir}`);
 output+=`\n## ${pkg.name} ${pkg.version}\n\n${pkg.license||pkg.licenses?.map(v=>v.type).join(', ')||entry.license||'See terms below'}\n\n${texts.join('\n\n')}\n`;
}
await writeFile('licenses/DEPENDENCIES.md',output.replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n');
console.log('Dependency notices generated.');
