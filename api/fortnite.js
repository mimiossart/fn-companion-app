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

      const statKeys="br_wins_total,br_kills_total,br_deaths_total,br_matches_total,br_kd,br_winrate,br_top3,br_top5,br_top10";
      const statsRes=await fetch(DATA_API+"/api/v2/stats/"+encodeURIComponent(accountId)+"?stats="+encodeURIComponent(statKeys),{headers});
      const stats=await readJson(statsRes);
      if(!stats.ok){
        const apiMsg=stats.data&&(stats.data.error||stats.data.message);
        return res.status(stats.status).json({error:apiMsg||"L'API n'a pas pu récupérer les statistiques de ce compte."});
      }

      const rawEnvelope=stats.data&&stats.data.data!==undefined?stats.data.data:stats.data;
      const raw=rawEnvelope&&rawEnvelope.stats&&typeof rawEnvelope.stats==="object"?rawEnvelope.stats:rawEnvelope;

      function deepFind(obj,keys){
        if(obj==null)return null;
        if(typeof obj==="object"){
          for(let i=0;i<keys.length;i++){
            if(Object.prototype.hasOwnProperty.call(obj,keys[i])&&obj[keys[i]]!=null){
              const v=obj[keys[i]];
              if(typeof v==="object"&&v.value!=null)return v.value;
              return v;
            }
          }
          const vals=Array.isArray(obj)?obj:Object.keys(obj).map(k=>obj[k]);
          for(let i=0;i<vals.length;i++){
            const found=deepFind(vals[i],keys);
            if(found!=null)return found;
          }
        }
        return null;
      }

      function normalizeStatKey(key){
        return String(key||"").toLowerCase().replace(/[^a-z0-9]/g,"");
      }

      function collectNumbers(obj,patterns){
        const out=[];
        if(obj==null||typeof obj!=="object")return out;
        (function walk(node){
          if(node==null||typeof node!=="object")return;
          if(Array.isArray(node)){node.forEach(walk);return}
          Object.keys(node).forEach(function(key){
            const nk=normalizeStatKey(key);
            if(patterns.some(function(pattern){return nk.indexOf(normalizeStatKey(pattern))>=0})){
              let v=node[key];
              if(v&&typeof v==="object"){
                if(v.value!=null)v=v.value;
                else if(v.total!=null)v=v.total;
              }
              if(typeof v==="number" && isFinite(v))out.push(v);
              else if(typeof v==="string"&&v.trim()!==""&&isFinite(Number(v)))out.push(Number(v));
            }
          });
          Object.keys(node).forEach(function(key){walk(node[key]);});
        })(obj);
        return out;
      }

      function sumStats(patterns){
        const values=collectNumbers(raw,patterns);
        if(!values.length)return null;
        return values.reduce(function(total,v){return total+v},0);
      }

      function directStat(patterns){
        const values=collectNumbers(raw,patterns);
        return values.length?values[0]:null;
      }

      const normalized={
        wins:sumStats(["br_placetop1","br_wins_total"]),
        kills:sumStats(["br_kills"]),
        deaths:sumStats(["br_deaths"]),
        matches:sumStats(["br_matchesplayed"]),
        minutes:sumStats(["br_minutesplayed"]),
        top3:sumStats(["br_placetop3"]),
        top5:sumStats(["br_placetop5"]),
        top10:sumStats(["br_placetop10"]),
        kd:directStat(["br_kd"]),
        winRate:directStat(["br_winrate"])
      };

      if(normalized.kd==null && normalized.kills!=null && normalized.deaths){
        normalized.kd=normalized.kills/normalized.deaths;
      }
      if(normalized.winRate==null && normalized.wins!=null && normalized.matches){
        normalized.winRate=(normalized.wins/normalized.matches)*100;
      }

      let seasonStats=null,progress=null,ranked=null;
      try{
        const seasonRes=await fetch(DATA_API+"/api/v1/profile/stats?displayName="+encodeURIComponent(name)+"&timeWindow=season",{headers});
        if(seasonRes.ok){
          const seasonJson=await seasonRes.json();
          seasonStats=seasonJson.data!==undefined?seasonJson.data:seasonJson;
        }
      }catch(_){}
      try{
        const progressRes=await fetch(DATA_API+"/api/v1/profile/progress?displayName="+encodeURIComponent(name),{headers});
        if(progressRes.ok){
          const progressJson=await progressRes.json();
          progress=progressJson.data!==undefined?progressJson.data:progressJson;
        }
      }catch(_){}
      try{
        const rankedRes=await fetch(DATA_API+"/api/v1/profile/ranked?displayName="+encodeURIComponent(name),{headers});
        if(rankedRes.ok){
          const rankedJson=await rankedRes.json();
          ranked=rankedJson.data!==undefined?rankedJson.data:rankedJson;
        }
      }catch(_){}

      return res.status(200).json({
        ok:true,
        account:accountData,
        accountId:accountId,
        stats:raw,
        rawStatsEnvelope:rawEnvelope,
        normalized:normalized,
        seasonStats:seasonStats,
        progress:progress,
        ranked:ranked
      });
    }catch(e){
      return res.status(502).json({error:e.message||"API stats indisponible."});
    }
  }

  if(type==="quests"){
    if(!name)return res.status(400).json({error:"Nom de joueur manquant."});
    if(!key)return res.status(503).json({error:"FORTNITE_API_KEY n'est pas configurée dans Vercel."});
    try{
      const accountRes=await fetch(DATA_API+"/api/v1/account/displayName/"+encodeURIComponent(name),{
        headers:{"x-api-key":key}
      });
      const account=await readJson(accountRes);
      if(!account.ok){
        const msg=account.data&&(account.data.error||account.data.message);
        return res.status(account.status).json({error:msg||"Joueur introuvable."});
      }

      const root=account.data&&account.data.data!==undefined?account.data.data:account.data;
      const accountData=root&&root.account?root.account:root;
      const accountId=(accountData&&(accountData.id||accountData.accountId))||(root&&(root.id||root.accountId));
      if(!accountId)return res.status(502).json({error:"ID Epic introuvable."});

      // The current API is documented as using one x-api-key for all endpoints,
      // including Pro Quests. Try the quests endpoint directly first.
      const questRes=await fetch(DATA_API+"/api/v2/quests/"+encodeURIComponent(accountId),{
        headers:{"x-api-key":key}
      });
      const body=await questRes.text();

      if(!questRes.ok){
        let detail=body;
        try{
          const parsed=JSON.parse(body);
          detail=parsed.error||parsed.message||body;
        }catch(_){}
        if(questRes.status===401||questRes.status===403){
          return res.status(questRes.status).json({
            error:"L'API des quêtes refuse la clé API ("+questRes.status+"). Réponse : "+String(detail).slice(0,500)
          });
        }
        return res.status(questRes.status).setHeader("Content-Type",questRes.headers.get("content-type")||"application/json").send(body);
      }

      res.setHeader("Cache-Control","no-store");
      res.status(200).setHeader("Content-Type",questRes.headers.get("content-type")||"application/json").send(body);
      return;
    }catch(e){
      return res.status(502).json({error:e.message||"Quêtes indisponibles."});
    }
  }

  if(type==="map"){
    if(!key)return res.status(503).json({error:"FORTNITE_API_KEY n'est pas configurée dans Vercel."});
    try{
      const headers={"x-api-key":key};
      const mapRes=await fetch(DATA_API+"/api/v1/map",{headers});
      const mapText=await mapRes.text();
      if(!mapRes.ok){
        let msg=mapText;
        try{const j=JSON.parse(mapText);msg=j.error||j.message||mapText}catch(_){}
        return res.status(mapRes.status).json({error:String(msg).slice(0,500)});
      }

      let mapData;
      try{mapData=JSON.parse(mapText)}catch(e){return res.status(502).json({error:"Réponse carte invalide."})}

      let imageUrl=null;
      try{
        const imageRes=await fetch(DATA_API+"/api/v1/map/image",{headers,redirect:"follow"});
        if(imageRes.ok)imageUrl=imageRes.url;
      }catch(_){}

      const payload=mapData&&mapData.data!==undefined?mapData.data:mapData;
      return res.status(200).json({
        data:payload,
        image:imageUrl,
        source:"api-fortnite.com",
        fetchedAt:new Date().toISOString()
      });
    }catch(e){
      return res.status(502).json({error:e.message||"Carte indisponible."});
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
