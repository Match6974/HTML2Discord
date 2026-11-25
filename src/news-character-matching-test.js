import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fetchNews} from './fetch-news.js';
import {parseNews} from './parse-news.js';
const dir='output/news-character-matching';
await mkdir(dir,{recursive:true});
const master=JSON.parse(await readFile('output/character-master/master.json','utf8'));
const norm=s=>String(s??'').normalize('NFKC').trim();
const normCharacter=s=>norm(s).replace(/[・･\s]/gu,'');
function match(name,style,scope,catalog=master){
 const chars=catalog.filter(c=>normCharacter(c.nameJa)===normCharacter(name));
 if(chars.length!==1)return {images:[],warnings:['Character missing or ambiguous']};
 const c=chars[0];
 if(!style&&scope!=='all')return {images:[],warnings:['Style scope unknown']};
 const candidates=style?c.styles.filter(s=>norm(s.nameJa)===norm(style)):c.styles;
 if(style&&candidates.length!==1)return {images:[],warnings:['Style missing or ambiguous']};
 const images=[],warnings=[];
 for(const s of [...candidates].sort((a,b)=>a.styleId.localeCompare(b.styleId,'en',{numeric:true}))){
  if(s.releaseStatus==='upcoming'){if(style)warnings.push('Upcoming style: '+s.styleId);continue;}
  if(!s.ready||s.releaseStatus!=='listed'||!s.imageUrl){warnings.push('Unavailable style: '+s.styleId);continue;}
  const u=new URL(s.imageUrl);
  if(u.origin!=='https://jp.ultrarumble.com'||!u.pathname.startsWith('/assets/Character/')){warnings.push('Unexpected image URL: '+s.styleId);continue;}
  images.push({characterId:c.characterId,styleId:s.styleId,nameJa:s.nameJa,url:s.imageUrl});
 }
 if(!images.length&&!warnings.length)warnings.push('No eligible images');
 return {images,warnings};
}
const fixture=[{characterId:1,nameJa:'テスト',styles:['オリジナル','別スタイル','予定'].map((nameJa,i)=>({styleId:'Variant-'+i,nameJa,ready:true,releaseStatus:i===2?'upcoming':'listed',imageUrl:'https://jp.ultrarumble.com/assets/Character/test'+i+'.png'}))}];
assert.equal(match('テスト','別スタイル','specified',fixture).images.length,1);
assert.equal(match('テスト',null,'all',fixture).images.length,2);
assert.equal(match('テスト',null,'unknown',fixture).images.length,0);
assert.equal(match('テスト','予定','specified',fixture).images.length,0);
assert.equal(match('不明',null,'all',fixture).images.length,0);
const aliasFixture=[{...fixture[0],nameJa:'オール・フォー・ワン'}];
assert.equal(match('オールフォーワン','オリジナル','specified',aliasFixture).images.length,1);
assert.equal(match('オール フォー ワン','オリジナル','specified',aliasFixture).images.length,1);
assert.equal(match('オールフォーワン(青年期)','オリジナル','specified',aliasFixture).images.length,0);
assert.equal(match('オールフォーワン','オリジナル','specified',[...aliasFixture,{...aliasFixture[0],characterId:2,nameJa:'オールフォーワン'}]).images.length,0);
const results=[];
for(const id of ['1573','1552','1485','1566']){
 const {url,html}=await fetchNews('https://mhaur.bn-ent.net/news/?p='+id);
 const parsed=await parseNews(html);
 assert.notEqual(parsed.status,'incomplete',url);
 const matches=[];
 for(const c of parsed.characters)for(const a of c.adjustments)matches.push({kind:'individual',name:c.name,style:c.style,line:a.line,scope:a.styleScope,...match(c.name,c.style,a.styleScope)});
 for(const g of parsed.shared??[]){
  if(g.kind==='general'){matches.push({kind:'general',line:g.line,images:[],warnings:[]});continue;}
  for(const t of g.targets)matches.push({kind:'shared',name:t.name,style:t.style,line:g.line,scope:t.styleScope,...match(t.name,t.style,t.styleScope)});
 }
 const result={url,status:parsed.status,matches,warnings:matches.flatMap(m=>m.warnings.map(w=>({name:m.name,style:m.style,line:m.line,warning:w})))};
 await writeFile(dir+'/p'+id+'.json',JSON.stringify(result,null,2));
 results.push({id,status:parsed.status,targets:matches.length,matched:matches.filter(m=>m.images.length).length,warnings:result.warnings.length});
}
await writeFile(dir+'/result.json',JSON.stringify(results,null,2));
