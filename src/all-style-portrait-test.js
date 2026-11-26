import assert from 'node:assert/strict';
import {match} from './match-character-images.js';
const style=(id,nameJa,releaseStatus='listed')=>({styleId:'Variant-'+id,nameJa,releaseStatus,ready:true,imageUrl:'https://jp.ultrarumble.com/assets/Character/test'+id+'.png'});
const catalog=[{characterId:1,nameJa:'テスト',styles:[style(2,'未実装','upcoming'),style(1,'別スタイル'),style(0,'オリジナル')]}];
for(const label of ['全バトルスタイル','全バトルスタイル共通','全スタイル','全スタイル共通']){
 const result=match('テスト',label,'specified',catalog);
 assert.deepEqual(result.images.map(x=>x.styleId),['Variant-0','Variant-1']);
 assert.deepEqual(result.warnings,[]);
}
assert.equal(match('テスト','別スタイル','specified',catalog).images.length,1);
assert.equal(match('テスト',null,'unknown',catalog).images.length,0);
assert.equal(match('テスト','未実装','specified',catalog).images.length,0);
assert.equal(match('テスト',null,'all',catalog).images.length,2);
console.log('All-style portrait tests passed');
