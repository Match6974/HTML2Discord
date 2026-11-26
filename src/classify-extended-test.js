import assert from 'node:assert/strict';
import {classifyAdjustment} from './classify-adjustment.js';
for(const [raw,color] of [
 ['相手が吹っ飛びにくくなるように調整','yellow'],['相手が吹っ飛びやすくなるように調整','orange'],
 ['事前入力を受け付けるように変更','green'],['事前入力を受け付けないように変更','red'],
 ['ひるむように変更','green'],['ひるまないように変更','red'],
 ['スーパーアーマーが付くように変更','green'],['アーマーが付かないように変更','red'],
 ['前隙を減少','purple'],['後隙を増加','blue'],['弾速を上昇','green'],['弾速を下降','red'],
 ['弾のサイズを拡大','green'],['弾のサイズを縮小','red'],['回復量を増加','green'],['回復量を減少','red'],
 ['リロード時間を減少','purple'],['リロード時間を増加','blue'],['ダメージを増加','green']
])assert.equal(classifyAdjustment(raw).color,color,raw);
assert.equal(classifyAdjustment('吹っ飛びにくくなるように調整',{name:'緑谷出久',style:'オリジナル',skill:'特殊アクション「おんぶ」'}).hideArrow,true);
assert.equal(classifyAdjustment('吹っ飛びやすくなるように変更').color,'orange');
assert.equal(classifyAdjustment('吹っ飛びにくくなるように調整').color,'yellow');
assert.equal(classifyAdjustment('相手が吹っ飛びにくくなるように調整',{skill:'特殊アクション「おんぶ」'}).color,'yellow');
console.log('Classification tests passed');
