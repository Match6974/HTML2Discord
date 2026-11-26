export function classifyAdjustment(raw, context = {}) {
  const text = raw.normalize('NFKC');
  if (/(?:吹っ飛び|ふっとび|吹っ飛び|ふっ飛び)(?:にくく|やすく)/.test(text)) {
    const originalDeku=context.name==='緑谷出久'&&context.style==='オリジナル';
    const carry=/おんぶ/.test(String(context.skill??'')+' '+text);
    const target=originalDeku&&carry?'self':'opponent';
    const up=/(?:吹っ飛び|ふっとび|吹っ飛び|ふっ飛び)にくく/.test(text),down=/(?:吹っ飛び|ふっとび|吹っ飛び|ふっ飛び)やすく/.test(text);
    const effect=target==='opponent'&&up!==down?(up?'combo-up':'combo-down'):'unknown';
    return {metric:null,direction:'unknown',effect,color:effect==='combo-up'?'yellow':effect==='combo-down'?'orange':null,before:null,after:null,knockbackTarget:target,hideArrow:target==='self'};
  }
  const rules=[
    [/(?:事前|先行)入力.*(?:受け付けない|対応しない|廃止|非対応)/, 'nerf','red','unknown'],
    [/(?:事前|先行)入力.*(?:受け付ける|対応(?!しない|しなく|できない))/, 'buff','green','unknown'],
    [/ひるまない/, 'nerf','red','unknown'],
    [/ひるむ/, 'buff','green','unknown'],
    [/アーマー[^。\n]*?(?:付かない|つかない|付与(?:を)?(?:しない|されない|しなく|されなく)|付与(?:を)?(?:行わない|しなくなる))/, 'nerf','red','unknown'],
    [/アーマー[^。\n]*?(?:付く|つく|付与(?!を?(?:しない|されない|しなく|されなく|行わない|なし|無し)))/, 'buff','green','unknown']
  ];
  const hits=rules.filter(([pattern])=>pattern.test(text));
  if(hits.length===1){const [,effect,color,direction]=hits[0];return {metric:null,direction,effect,color,before:null,after:null};}
  if(hits.length>1)return {metric:null,direction:'unknown',effect:'unknown',color:null,before:null,after:null};
  const metrics = ['リロード時間','リロード速度','ダメージ','HP','弾数','前隙','後隙','ヒット間隔','弾速','弾のサイズ','回復量','射程','落下速度','追従','連射速度','攻撃範囲'].filter(m => text.includes(m));
  const metric = metrics.length === 1 ? metrics[0] : metrics.length===2 && metrics.includes('前隙') && metrics.includes('後隙') && /前隙(?:と|・|および|及び|、)後隙|後隙(?:と|・|および|及び|、)前隙/.test(text) ? '前隙・後隙' : null;
  const up = /増加|上昇|増や|引き上げ|拡大|延長|長くする/.test(text) || (metric === '追従' && /強化/.test(text));
  const down = /減少|低下|下降|短縮|減ら|縮小|短くする/.test(text) || (metric === '追従' && /弱体化/.test(text));
  const direction = up === down ? 'unknown' : up ? 'increase' : 'decrease';
  const effect = !metric || direction === 'unknown' ? 'unknown' : (direction === 'increase') !== (['リロード時間','前隙','後隙','前隙・後隙','ヒット間隔'].includes(metric)) ? 'buff' : 'nerf';
  const color = effect === 'unknown' ? null : ['リロード時間','前隙','後隙','前隙・後隙','ヒット間隔'].includes(metric) ? (effect === 'buff' ? 'purple' : 'blue') : effect === 'buff' ? 'green' : 'red';
  const value = metric && text.match(new RegExp(metric + '(?:を|が)?\\s*(\\d+(?:\\.\\d+)?)(?:発|秒|%|に|になる)'));
  return { metric, direction, effect, color, before: null, after: value ? Number(value[1]) : null };
}
