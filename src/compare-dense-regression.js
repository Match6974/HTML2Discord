import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
const read=p=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch{return null;}};
const baseline=read('output/news-general/result.json');
const dense=read('output/news-dense/result.json');
const errors=[];
if(process.env.BASELINE_OUTCOME!=='success')errors.push('Baseline render failed');
if(process.env.DENSE_OUTCOME!=='success')errors.push('Dense render failed');
if(!baseline||!dense)errors.push('Missing result JSON');
if(baseline&&dense){
 if(baseline.url!==dense.url)errors.push('URL mismatch');
 if(baseline.status!==dense.status||!['ok','no-target'].includes(dense.status))errors.push('Status mismatch');
 if(dense.status==='ok'){
  for(const key of ['cards','segments'])if(baseline[key]!==dense[key])errors.push(key+' mismatch');
  if(!Number.isInteger(dense.total)||dense.total<1||!Number.isInteger(baseline.total)||baseline.total<1)errors.push('Invalid page count');
 }else if(dense.status==='no-target'&&(dense.pages!==0||baseline.pages!==0))errors.push('Expected zero pages');
}
const oldPages=baseline?.total??baseline?.pages??null;
const newPages=dense?.total??dense?.pages??null;
const result={status:errors.length?'failed':dense.status,baseline,dense,oldPages,newPages,savedPages:oldPages===null||newPages===null?null:oldPages-newPages,reductionPercent:oldPages>0&&newPages!==null?Math.round((oldPages-newPages)/oldPages*1000)/10:null,errors};
mkdirSync('output/dense-regression',{recursive:true});
writeFileSync('output/dense-regression/comparison.json',JSON.stringify(result,null,2));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'| Status | Baseline pages | Dense pages | Saved | Reduction % |\n|---|---:|---:|---:|---:|\n| '+[result.status,oldPages,newPages,result.savedPages,result.reductionPercent].join(' | ')+' |\n'+errors.join('\n'));
if(errors.length)process.exitCode=1;
