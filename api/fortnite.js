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

    const headers={"x-api-key":key};
    try{
      const accountRes=await fetch(DATA_API+"/api/v1/account/displayName/"+encodeURIComponent(name),{headers});
      const account=await readJson(accountRes);
      if(!account.ok){
        const apiMsg=account.data&&(account.data.error||account.data.message);
        return res.status(account.status).json({error:apiMsg||("Impossible de trouver le joueur \""+name+"\".")});
      }

      const accountRoot=account.data&&account.data.data!==undefined?account.data.data:account.data;
      const accountData=accountRoot&&accountRoot.account?accountRoot.account:accountRoot;
      const accountId=(accountData&&(accountData.id||accountData.accountId))
        ||(accountRoot&&(accountRoot.id||accountRoot.accountId));
      if(!accountId)return res.status(502).json({error:"Le service a trouvé le compte mais n'a pas renvoyé son ID Epic."});

      const statsRes=await fetch(DATA_API+"/api/v2/stats/"+encodeURIComponent(accountId),{headers});
      const stats=await readJson(statsRes);
      if(!stats.ok){
        const apiMsg=stats.data&&(stats.data.error||stats.data.message);
        return res.status(stats.status).json({error:apiMsg||"L'API n'a pas pu récupérer les statistiques de ce compte."});
      }

      const raw=stats.data&&stats.data.data!==undefined?stats.data.data:stats.data;

      function deepFind(obj,keys){
        if(obj==null)return null;
        for(let i=0;i<keys.length;i++){
          if(typeof obj==="object"&&Object.prototype.hasOwnProperty.call(obj,keys[i])&&obj[keys[i]]!=null)return obj[keys[i]];
        }
        if(typeof obj!=="object")return null;
        const vals=Array.isArray(obj)?obj:Object.keys(obj).map(k=>obj[k]);
        for(let i=0;i<vals.length;i++){
          const found=deepFind(vals[i],keys);
          if(found!=null)return found;
        }
        return null;
      }

      const normalized={
        wins:deepFind(raw,["br_wins_total","wins","victories"]),
        kills:deepFind(raw,["br_kills_total","kills","eliminations"]),
        deaths:deepFind(raw,["br_deaths_total","deaths"]),
        matches:deepFind(raw,["br_matches_total","matches","matchesPlayed"]),
        kd:deepFind(raw,["br_kd","kd","kdratio","killDeathRatio"]),
        winRate:deepFind(raw,["br_win_rate","br_winrate","winRate","winrate"]),
        top3:deepFind(raw,["br_top3","br_top3_total","top3"]),
        top5:deepFind(raw,["br_top5","br_top5_total","top5"]),
        top10:deepFind(raw,["br_top10","br_top10_total","top10"])
      };

      return res.status(200).json({
        ok:true,
        account:accountData,
        accountId:accountId,
        stats:raw,
        normalized:normalized
      });
    }catch(e){
      return res.status(502).json({error:e.message||"API stats indisponible."});
    }
  }

  if(type==="shop"){
    if(!key)return res.status(503).json({error:"FORTNITE_API_KEY n'est pas configurée dans Vercel."});
    try{
      const shopRes=await fetch(DATA_API+"/api/v1/shop?lang=fr",{headers:{"x-api-key":key}});
      const body=await shopRes.text();
      res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=3600");
      res.status(shopRes.status).setHeader("Content-Type",shopRes.headers.get("content-type")||"application/json").send(body);
      return;
    }catch(e){
      return res.status(502).json({error:e.message||"Boutique indisponible."});
    }
  }

  const paths={
    cosmetics:"/v2/cosmetics/br?language=fr",
    map:"/v1/map",
    news:"/v2/news"
  };
  if(!paths[type])return res.status(400).json({error:"Type inconnu."});

  try{
    const r=await fetch(UPSTREAM+paths[type]);
    const text=await r.text();
    res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=600");
    res.status(r.status).setHeader("Content-Type",r.headers.get("content-type")||"application/json").send(text);
  }catch(e){
    res.status(502).json({error:e.message||"API indisponible"});
  }
}
