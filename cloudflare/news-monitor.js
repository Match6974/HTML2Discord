const NEWS = "https://mhaur.bn-ent.net/news/";
export async function fetchNews() {
  const response = await fetch(NEWS,{redirect:"manual",signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error("NEWS HTTP "+response.status);
  const ids = new Set();
  const parser = new HTMLRewriter().on("a[href]",{element(e){
    try {
      const u = new URL(e.getAttribute("href"),NEWS);
      const id = u.searchParams.get("p");
      if(u.origin===new URL(NEWS).origin && u.pathname==="/news/" && /^[1-9][0-9]*$/.test(id??"") && u.searchParams.getAll("p").length===1) ids.add(id);
    } catch {}
  }});
  await parser.transform(response).text();
  if(!ids.size) throw new Error("No NEWS article links found");
  return [...ids];
}
export async function dispatchNews(env,id) {
  if(!env.GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN");
  const response=await fetch("https://api.github.com/repos/Match6974/HTML2Discord/actions/workflows/news-monitor-dispatch.yml/dispatches",{
    method:"POST",redirect:"manual",signal:AbortSignal.timeout(20000),
    headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","User-Agent":"HTML2Discord","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},
    body:JSON.stringify({ref:"main",inputs:{news_url:NEWS+"?p="+id}})
  });
  if(!response.ok) throw new Error("GitHub dispatch HTTP "+response.status);
}
