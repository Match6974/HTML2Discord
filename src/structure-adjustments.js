// Preserve the parser output; add display segments without guessing values.
export function parseScope(raw) {
  const t = raw.normalize('NFKC');
  let m;
  if (/全レベル/.test(t)) return { type:'all', label:'全レベル' };
  if ((m=t.match(/レベル\s*(\d+)\s*[~〜～–-]\s*(\d+)/))) return { type:'range', min:+m[1], max:+m[2], label:'Lv.'+m[1]+'～'+m[2] };
  if ((m=t.match(/レベル\s*(\d+)\s*(?:から|以上)/))) return { type:'from', min:+m[1], label:'Lv.'+m[1]+'以上' };
  if ((m=t.match(/レベル\s*(\d+)\s*(?:の|で|時|のみ)/))) return { type:'single', min:+m[1], max:+m[1], label:'Lv.'+m[1] };
  if (/低レベル/.test(t)) return { type:'qualitative', label:'低レベル時' };
  return { type:'unspecified', label:null };
}
const labels = {buff:'強化',nerf:'弱体化',unknown:'判定保留','combo-up':'コンボしやすさUP','combo-down':'コンボしやすさDown'};
function segment(a, scope, evidence) {
  return {scope, hideArrow:a.hideArrow===true, knockbackTarget:a.knockbackTarget??null, before:a.before, after:a.after, unit:a.metric==='弾数'?(/\d\s*[%％]/.test(a.raw)?'%':'発'):a.metric==='リロード時間'?'秒':null, direction:a.direction,effect:a.effect,color:a.color,label:labels[a.effect], mode:a.before!==null&&a.after!==null?'before-after':a.after!==null?'after-only':'text', text:a.raw,evidence};
}
export function structureAdjustments(parsed) {
  if (!['ok','no-target'].includes(parsed.status)) throw new Error('Cannot structure incomplete article');
  return {...parsed, schemaVersion:1, characters:parsed.characters.map(c=>({...c, adjustments:c.adjustments.map(a=>{
    const scope=parseScope(a.raw);
    const evidence={source:'本文',line:a.line,text:a.raw};
    let segments=[segment(a,scope,evidence)];
        // Shared game rule confirmed by the user: full-gauge-only usage restriction.
        if (/^(?:弾数|ゲージ(?:残量)?)(?:が|は)?\s*100\s*%(?:(?:でないと|でなければ|じゃないと|の状態でないと)使用できないように|のときのみ使用可能になるように)(?:変更|調整)(?:しました)?。?$/.test(a.raw.normalize('NFKC').trim())) {
          segments=[{...segment({...a,before:'1～100',after:100,direction:'unknown',effect:'nerf',color:'red'},scope,{source:'ユーザー確認済み共通仕様',text:'変更前は1～100%で使用可能、変更後は100%のみ',body:evidence}),unit:'%'}];
        }
    // Narrow evidence rule: explicit shared beta/gamma low-level ammo statement.
    const reason=c.reason.join('');
    const match=reason.normalize('NFKC').match(/低レベル時に[“”"「」]?個性[“”"「」]?技β[、,]γの弾数が(\d+)発だった/);
    if (match && a.metric==='弾数' && scope.type==='all' && a.before===null && a.after!==null && a.direction==='unknown' && /^[“”"「」]?個性[“”"「」]?技[βγ]「/.test(a.skill??'') && c.adjustments.filter(x=>x.metric==='弾数'&&x.raw===a.raw&&/技[βγ]「/.test(x.skill??'')).length===2) {
      const before=Number(match[1]);
      const direction=a.after>before?'increase':a.after<before?'decrease':'unknown';
      const effect=direction==='increase'?'buff':direction==='decrease'?'nerf':'unknown';
      segments=[segment({...a,before,direction,effect,color:effect==='buff'?'green':effect==='nerf'?'red':null},{type:'qualitative',label:'低レベル時'},{source:'調整意図',text:c.reason.find(x=>x.includes('低レベル時'))??reason,body:evidence}),segment(a,{type:'remainder',label:'その他のレベル'},evidence)];
    }
    return {...a,scope,display:{segments}};
  })}))};
}
