// Combine the standalone Refined template and independently authored mockup parts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const parts=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(parts,'../hybrid-refined-v2.html');
const start='<!-- BEGIN HYBRID PREVIEW EXTENSIONS -->';
const end='<!-- END HYBRID PREVIEW EXTENSIONS -->';
let html=await fs.readFile(output,'utf8');
const oldStart=html.indexOf(start),oldEnd=html.indexOf(end);
if(oldStart>=0){if(oldEnd<oldStart)throw new Error('Incomplete previous extension block');html=html.slice(0,oldStart)+html.slice(oldEnd+end.length);}
const scripts=[];
for(const name of['hybrid-visual.js','hybrid-query.js','hybrid-performance.js','hybrid-preview.js']){
  const script=await fs.readFile(path.join(parts,name),'utf8');
  if(/<\/script\s*>/i.test(script))throw new Error('Unexpected inline script terminator in '+name);
  scripts.push('<script>\n'+script+'\n</script>');
}
if(!html.includes('id="hybrid-trace-host"')||!html.includes('id="hybrid-performance-host"'))throw new Error('Required prototype mount missing');
const closing=html.lastIndexOf('</body>');if(closing<0)throw new Error('Body missing');
html=html.slice(0,closing)+'\n'+start+'\n'+scripts.join('\n')+'\n'+end+'\n'+html.slice(closing);
await fs.writeFile(output,html);
console.log('Assembled standalone Refined + Workbench mockup.');
