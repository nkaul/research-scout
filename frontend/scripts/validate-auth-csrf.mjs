import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';

// Execute the actual TypeScript clients against a synthetic HTTP protocol.
// No server, account, provider, model, credential or browser is contacted.
const root=path.resolve(import.meta.dirname,'../..');
let current='first-session',configReads=0,deny=false;
const mutations=[];
const fetch=async(url,init={})=>{
  if(url==='/api/auth/config'){configReads++;return{ok:true,json:async()=>({enabled:true,csrf_token:current})};}
  if(url==='/api/auth/google'){current='linked-session';return{ok:true,json:async()=>({authenticated:true,csrf_token:current})};}
  const method=init.method||'GET';
  if(method!=='GET'){
    const header=init.headers.get('X-CSRF-Token');mutations.push(header);
    assert.equal(header,deny?'linked-session':current,'A mutation used an obsolete session proof');
    if(deny)return{ok:false,status:403,json:async()=>({detail:'Authentication request could not be verified.'})};
  }
  return{ok:true,status:200,json:async()=>({ok:true})};
};
function load(file,require){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const sandbox={exports:{},fetch,Headers,URL,require};vm.runInNewContext(code,sandbox);return sandbox.exports;
}
const auth=load('frontend/src/lib/auth-client.ts',()=>{throw Error('Unexpected dependency');});
const api=load('frontend/src/lib/api.ts',name=>{assert.equal(name,'./auth-client');return auth;});
await api.request('/projects');assert.equal(configReads,0,'Saved reads must not prepare a mutation');
await api.request('/projects',{method:'POST',body:'{}'});assert.equal(configReads,1);
await auth.authPost('google',{credential:'synthetic'},'first-session');
await api.request('/projects',{method:'POST',body:'{}'});assert.equal(configReads,1,'Rotation should reuse the newly returned proof');
deny=true;await assert.rejects(api.request('/projects',{method:'POST',body:'{}'}));assert.equal(mutations.length,3,'An uncertain mutation must not be automatically repeated');
deny=false;current='refreshed-session';await api.request('/projects',{method:'POST',body:'{}'});assert.equal(configReads,2);
assert.deepEqual(mutations,['first-session','linked-session','linked-session','refreshed-session']);
const files=['frontend/src/lib/auth-client.ts','frontend/src/lib/api.ts'];
const report={date:'2026-11-15',passed:true,scope:'Synthetic HTTP protocol: saved reads, explicit Google session rotation, next mutation proof, rejection invalidation and no automatic retry.',network_calls:0,sourceHashes:files.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}))};
fs.writeFileSync(path.join(root,'docs/validation/landing-auth-2026-11-15-csrf-rotation.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({passed:true,network_calls:0,mutations_checked:mutations.length})+'\n');
