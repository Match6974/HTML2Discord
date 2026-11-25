import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchNews } from './fetch-news.js';
import { parseNews, parseLines } from './parse-news.js';
import { classifyAdjustment } from './classify-adjustment.js';

await mkdir('output/news-parse', { recursive: true });
try {
  for (const [raw,color] of [['ダメージを増加','green'],['ダメージを減少','red'],['リロード時間を増加','blue'],['リロード時間を短縮','purple'],['リロード速度を上昇','green'],['リロード速度を低下','red'],['HPを300に増加','green'],['弾数を3に減少','red'],['弾数2になるように変更',null]]) assert.equal(classifyAdjustment(raw).color,color);
  const sample = ['■バトルスタイル調整','【テスト（オリジナル）】','未知の書式'].map((text,i)=>({text,number:i+1}));
  assert.equal(parseLines(sample).status,'incomplete');
  for (const [id,expected] of [[1573,'ok'],[1566,'no-target']]) {
    const {html,url} = await fetchNews('https://mhaur.bn-ent.net/news/?p='+id);
    await writeFile('output/news-parse/'+id+'.html',html);
    const result = await parseNews(html);
    await writeFile('output/news-parse/'+id+'.json',JSON.stringify({url,...result},null,2));
    assert.equal(result.status,expected);
    if(id===1573) {
      assert.equal(result.characters.length,8);
      assert.deepEqual(result.characters.map(c=>c.adjustments.length),[4,3,1,4,4,5,2,1]);
    }
    console.log(id, result.status, result.characters.map(c=>[c.name,c.style,c.adjustments.length]));
  }
} catch(error) {
  await writeFile('output/news-parse/error.txt',String(error.stack ?? error));
  throw error;
}
