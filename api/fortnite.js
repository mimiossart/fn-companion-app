const UPSTREAM = "https://fortnite-api.com";
const DATA_API = "https://prod.api-fortnite.com";

async function readJson(r){
  const text=await r.text();
  let data=null;
  try{data=JSON.parse(text)}catch{}
  return {ok:r.ok,status:r.status,data,raw:text};
}

export default async function handler(req,res){
  const type=(req.query&&req.query.type)||"cosmetics";
  const name=((req.query&&req.query.name)||"").trim();
  const key=process.env.FORTNITE_API_KEY||"";

  if(type==="stats"){
    if(!name)return res.status(400).json({error:"Nom de joueur manquant."});
    if(!key)return res.status(503).json({error:"FORTNITE_API_KEY n'est pas configurée dans Vercel."});
    try{
      const headers={"x-api-key":key};
      const accountRes=await fetch(DATA_API+"/api/v1/account/displayName/"+encodeURIComponent(name),{headers});
      const account=await readJson(accountRes);
      if(!account.ok)return res.status(account.status).json({error:account.data&&account.data.error||"Joueur introuvable."});
      const accountData=account.data&&account.data.data?account.data.data:account.data;
      const accountId=accountData&&(accountData.id||accountData.accountId);
      if(!accountId)return res.status(502).json({error:"L'API n'a pas renvoyé d'ID Epic."});

      const statsRes=await fetch(DATA_API+"/api/v2/stats/"+encodeURIComponent(accountId),{headers});
      const stats=await readJson(statsRes);
      if(!stats.ok)return res.status(stats.status).json({error:"Impossible de récupérer les statistiques."});

      let ranked=null,progress=null;
      const rankedRes=await fetch(DATA_API+"/api/v1/profile/ranked?displayName="+encodeURIComponent(name),{headers});
      if(rankedRes.ok){ranked=await rankedRes.json()} 
      const progressRes=await fetch(DATA_API+"/api/v1/profile/progress?displayName="+encodeURIComponent(name),{headers});
      if(progressRes.ok){progress=await progressRes.json()}

      return res.status(200).json({account:accountData,stats:stats.data,ranked:ranked,progress:progress});
    }catch(e){
      return res.status(502).json({error:e.message||"API stats indisponible."});
    }
  }

  const paths={
    cosmetics:"/v2/cosmetics/br?language=fr",
    map:"/v1/map",
    shop:"/v2/shop?language=fr",
    news:"/v2/news"
  };
  if(!paths[type])return res.status(400).json({error:"Type inconnu."});

  try{
    const headers=key?{authorization:key}:{};
    const r=await fetch(UPSTREAM+paths[type],{headers});
    const text=await r.text();
    res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=600");
    res.status(r.status).setHeader("Content-Type",r.headers.get("content-type")||"application/json").send(text);
  }catch(e){
    res.status(502).json({error:e.message||"API indisponible"});
  }
}
