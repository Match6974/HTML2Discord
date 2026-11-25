import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { fetchNews } from './fetch-news.js';
import { parseNews } from './parse-news.js';
import { structureAdjustments,parseScope } from './structure-adjustments.js';
await mkdir('output/news-structure',{recursive:true});
try {
  for(const [raw,type] of [['レベル1～8のリロード速度','range'],['レベル4から弾数','from'],['レベル9の弾数','single'],['全レベル','all'],['低レベル時','qualitative'],['ダメージ増加','unspecified']]) assert.equal(parseScope(raw).type,type);
  for(const id of [1573,1566]){
    const {html,url}=await fetchNews('https://mhaur.bn-ent.net/news/?p='+id);
    await writeFile('output/news-structure/'+id+'.html',html);
    const parsed=await parseNews(html);
    await writeFile('output/news-structure/'+id+'-parsed.json',JSON.stringify(parsed,null,2));
    const data=structureAdjustments(parsed);
    await writeFile('output/news-structure/'+id+'.json',JSON.stringify({url,...data},null,2));
    if(id===1566){assert.equal(data.status,'no-target');continue;}
    assert.equal(data.status,'ok');
    assert.equal(data.characters.length,8);
    const all=data.characters.flatMap(c=>c.adjustments);
    assert.equal(all.length,24);
    assert.equal(all.flatMap(a=>a.display.segments).length,26);
    const frog=data.characters.find(c=>c.name==='蛙吹梅雨');
    for(const a of frog.adjustments.filter(a=>a.metric==='弾数')){
      const [low,rest]=a.display.segments;
      assert.equal(low.before,1);assert.equal(low.after,2);assert.equal(low.color,'green');assert.equal(low.evidence.source,'調整意図');
      assert.equal(rest.before,null);assert.equal(rest.color,null);
    }
    const hp=all.find(a=>a.metric==='HP').display.segments[0];
    assert.equal(hp.after,300);assert.equal(hp.before,null);assert.equal(hp.mode,'after-only');
    assert.equal(all.find(a=>a.raw.includes('レベル4から')).display.segments[0].before,null);
    assert.equal(all.filter(a=>a.display.segments.some(s=>s.evidence.source==='調整意図')).length,2);
    console.log('Validated',all.length,'adjustments');
  }
} catch(e){await writeFile('output/news-structure/error.txt',String(e.stack??e));throw e;}
