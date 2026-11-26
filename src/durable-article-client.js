const endpoint="https://mhaur-patchnote-discord.match6974.workers.dev/internal/article-state";
export function articleClient(articleId){
 const secret=process.env.ARTICLE_STATE_TEST_TOKEN;
 if(!secret||secret.length<32)throw Error("Missing article state credential");
 return async(action,input={})=>{
  const response=await fetch(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(30000),headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},body:JSON.stringify({action,input:{...input,articleId,destination:"test"}})});
  if(!response.ok)throw Error("Article state "+action+" HTTP "+response.status);
  const body=await response.json();
  if(body.status!=="ok")throw Error("Article state "+action+" failed");
  return body.result;
 };
}
