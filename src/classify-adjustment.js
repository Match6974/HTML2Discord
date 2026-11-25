export function classifyAdjustment(raw) {
  const text = raw.normalize('NFKC');
  const metrics = ['リロード時間','リロード速度','ダメージ','HP','弾数'].filter(m => text.includes(m));
  const metric = metrics.length === 1 ? metrics[0] : null;
  const up = /増加|上昇|増や|引き上げ/.test(text);
  const down = /減少|低下|短縮|減ら/.test(text);
  const direction = up === down ? 'unknown' : up ? 'increase' : 'decrease';
  const effect = !metric || direction === 'unknown' ? 'unknown' : (direction === 'increase') !== (metric === 'リロード時間') ? 'buff' : 'nerf';
  const color = effect === 'unknown' ? null : metric === 'リロード時間' ? (effect === 'buff' ? 'purple' : 'blue') : effect === 'buff' ? 'green' : 'red';
  const value = metric && text.match(new RegExp(metric + '(?:を|が)?\\s*(\\d+(?:\\.\\d+)?)(?:発|秒|%|に|になる)'));
  return { metric, direction, effect, color, before: null, after: value ? Number(value[1]) : null };
}
