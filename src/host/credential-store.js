import {platformCredentials} from './platform-credentials.js';
import {spawn} from 'node:child_process';

const SERVICE = 'ai.qiaomu.rss.dsh';
const validId = id => typeof id === 'string' && /^[a-z0-9-]{1,100}$/.test(id);
function run(args, input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/security',args,{stdio:['pipe','pipe','pipe']});
    let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Keychain operation timed out'));},15000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>131072)child.kill();});
    // Never forward security's diagnostics: interactive commands can contain secrets.
    child.stderr.resume();child.once('error',()=>{clearTimeout(timer);reject(Error('Keychain is unavailable'));});
    child.once('close',code=>{clearTimeout(timer);resolve({code,output});});child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export class CredentialStore {
  constructor({platform=process.platform,execute=run,executePlatform}={}){this.platform=platform;this.execute=execute;this.backend=platform==='darwin'?null:platformCredentials(platform,executePlatform);this.lane=Promise.resolve();}
  validate(id){if(!validId(id))throw Error('Invalid credential identifier');}
  async get(id){this.validate(id);if(this.backend)return this.backend.get(id);const result=await this.execute(['find-generic-password','-a',id,'-s',SERVICE,'-w']);if(result.code===44)return '';if(result.code!==0)throw Error('Could not read credential from Keychain');const value=result.output.trim();if(!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid credential encoding');return Buffer.from(value,'base64').toString('utf8');}
  set(id,value){this.validate(id);if(typeof value!=='string'||Buffer.byteLength(value)>65536)throw Error('Invalid credential');const task=this.lane.then(async()=>{if(this.backend){await this.backend.set(id,value);if(await this.backend.get(id)!==value)throw Error('System credential storage did not retain credential');return;}if(!value){const r=await this.execute(['delete-generic-password','-a',id,'-s',SERVICE]);if(r.code!==0&&r.code!==44)throw Error('Could not remove credential');return;}
    // Base64 travels on stdin, not process arguments or shell source. IDs are validated above.
    const encoded=Buffer.from(value,'utf8').toString('base64');
    await this.execute(['-i'],`add-generic-password -U -a ${id} -s ${SERVICE} -w ${encoded}\n`);
    if(await this.get(id)!==value)throw Error('Keychain did not retain credential');
  });this.lane=task.catch(()=>{});return task;}
}
