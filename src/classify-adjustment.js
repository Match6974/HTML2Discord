export function classifyAdjustment(raw, context = {}) {
  const text = raw.normalize('NFKC');
  if (/吹っ飛び(?:にくく|やすく)/.test(text)) {
    const self=/(?:自分|自身|使用者|自キャラ)(?:が|は|の|を).*吹っ飛び/.test(text);
    const opponent=/(?:相手|敵|対象)(?:が|は|の|を).*吹っ飛び/.test(text);
    const carry=/おんぶ/.test(String(context.skill??'')+' '+text);
    const target=self&&opponent?'unknown':self?'self':opponent?'opponent':carry?'self':'unknown';
    const up=/吹っ飛びにくく/.test(text),down=/吹っ飛びやすく/.test(text);
    const effect=target==='opponent'&&up!==down?(up?'combo-up':'combo-down'):'unknown';
    return {metric:null,direction:'unknown',effect,color:effect==='combo-up'?'yellow':effect==='combo-down'?'orange':null,before:null,after:null,knockbackTarget:target,hideArrow:target==='self'};
  }
  const rules=[
    [/事前入力.*受け付けない/, 'nerf','red','unknown'],
    [/事前入力.*受け付ける/, 'buff','green','unknown'],
    [/ひるまない/, 'nerf','red','unknown'],
    [/ひるむ/, 'buff','green','unknown'],
    [/アーマー.*(?:付かない|つかない|付与されない)/, 'nerf','red','unknown'],
    [/アーマー.*(?:付く|つく|付与される)/, 'buff','green','unknown']
  ];
  const hits=rules.filter(([pattern])=>pattern.test(text));
  if(hits.length===1){const [,effect,color,direction]=hits[0];return {metric:null,direction,effect,color,before:null,after:null};}
  if(hits.length>1)return {metric:null,direction:'unknown',effect:'unknown',color:null,before:null,after:null};
  const metrics = ['リロード時間','リロード速度','ダメージ','HP','弾数','前隙','後隙','弾速','弾のサイズ','回復量'].filter(m => text.includes(m));
  const metric = metrics.length === 1 ? metrics[0] : null;
  const up = /増加|上昇|増や|引き上げ|拡大/.test(text);
  const down = /減少|低下|下降|短縮|減ら|縮小/.test(text);
  const direction = up === down ? 'unknown' : up ? 'increase' : 'decrease';
  const effect = !metric || direction === 'unknown' ? 'unknown' : (direction === 'increase') !== (['リロード時間','前隙','後隙'].includes(metric)) ? 'buff' : 'nerf';
  const color = effect === 'unknown' ? null : ['リロード時間','前隙','後隙'].includes(metric) ? (effect === 'buff' ? 'purple' : 'blue') : effect === 'buff' ? 'green' : 'red';
  const value = metric && text.match(new RegExp(metric + '(?:を|が)?\\s*(\\d+(?:\\.\\d+)?)(?:発|秒|%|に|になる)'));
  return { metric, direction, effect, color, before: null, after: value ? Number(value[1]) : null };
}
