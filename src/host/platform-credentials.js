import {spawn} from 'node:child_process';
// The script is static. The credential request goes to stdin, never command arguments.
const WINDOWS_SCRIPT=String.raw`
$ErrorActionPreference='Stop'
try {
 Add-Type -AssemblyName System.Security
 $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
 if ($request.id -notmatch '^[a-z0-9-]{1,100}$') {throw 'Invalid credential identifier'}
 $directory=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Qiaomu/DeepSeekHarness/RSS/Credentials'
 $path=Join-Path $directory ($request.id+'.bin')
 if ($request.operation -eq 'get') {
  if (Test-Path -LiteralPath $path) {
   $encrypted=[IO.File]::ReadAllBytes($path)
   $plain=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
   [Console]::Out.Write([Convert]::ToBase64String($plain))
  }
 } elseif ($request.operation -eq 'set') {
  if ($request.value -eq '') {if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}} else {
   [IO.Directory]::CreateDirectory($directory) | Out-Null
   $plain=[Text.Encoding]::UTF8.GetBytes($request.value)
   $encrypted=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
   $temp=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
   [IO.File]::WriteAllBytes($temp,$encrypted)
   Move-Item -LiteralPath $temp -Destination $path -Force
  }
 } else {throw 'Invalid operation'}
 exit 0
} catch {exit 1}
`;
export function executeCredentialCommand(command,args,input='') {
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',settled=false;
  const fail=message=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();reject(Error(message));};
  const timer=setTimeout(()=>fail('Credential operation timed out'),15000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536)fail('Credential response exceeds limit');});
  child.stderr.resume();child.once('error',()=>fail('System credential storage is unavailable'));
  child.once('close',code=>{if(settled)return;settled=true;clearTimeout(timer);resolve({code,output});});child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export function platformCredentials(platform,execute=executeCredentialCommand) {
 const service='ai.qiaomu.rss.dsh';
 if(platform==='win32')return {
  async get(id){const r=await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(WINDOWS_SCRIPT,'utf16le').toString('base64')],JSON.stringify({operation:'get',id}));if(r.code!==0)throw Error('Could not read Windows protected credential');return Buffer.from(r.output.trim(),'base64').toString('utf8');},
  async set(id,value){const r=await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(WINDOWS_SCRIPT,'utf16le').toString('base64')],JSON.stringify({operation:'set',id,value}));if(r.code!==0)throw Error('Could not store Windows protected credential');},
 };
 if(platform==='linux')return {
  async get(id){const r=await execute('secret-tool',['lookup','service',service,'account',id]);if(r.code===1&&!r.output)return '';if(r.code!==0)throw Error('Could not read Secret Service credential');return r.output.replace(/\r?\n$/,'');},
  async set(id,value){const r=value?await execute('secret-tool',['store','--label=Qiaomu Cover Design for DeepSeek Harness','service',service,'account',id],value):await execute('secret-tool',['clear','service',service,'account',id]);if(r.code!==0&&!(r.code===1&&!value))throw Error('Could not store Secret Service credential');},
 };
 throw Error('System credential storage is unavailable on this platform');
}
