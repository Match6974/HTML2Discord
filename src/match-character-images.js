const norm=s=>String(s??'').normalize('NFKC').trim();
const normCharacter=s=>norm(s).replace(/[・･\s]/gu,'');
export const isAllStyles = style => /^(?:全バトルスタイル|全スタイル)(?:共通)?$/.test(norm(style));
export function match(name,style,scope,catalog){
 if(isAllStyles(style)){style=null;scope='all';}
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
  let u;try{u=new URL(s.imageUrl);}catch{warnings.push('Invalid image URL: '+s.styleId);continue;}
  if(u.origin!=='https://jp.ultrarumble.com'||!u.pathname.startsWith('/assets/Character/')){warnings.push('Unexpected image URL: '+s.styleId);continue;}
  images.push({characterId:c.characterId,styleId:s.styleId,nameJa:s.nameJa,url:s.imageUrl});
 }
 if(!images.length&&!warnings.length)warnings.push('No eligible images');
 return {images,warnings};
}
