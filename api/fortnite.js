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

      // Endpoint documenté : récupération complète des statistiques par account ID.
      const statsRes=await fetch(DATA_API+"/api/v2/stats/"+encodeURIComponent(accountId),{headers});
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

      function firstStat(patterns){
        const values=collectNumbers(raw,patterns);
        return values.length?values[0]:null;
      }

      function sumStats(patterns){
        const values=collectNumbers(raw,patterns);
        if(!values.length)return null;
        return values.reduce(function(total,v){return total+v},0);
      }

      function statTotal(totalPatterns, detailPatterns){
        const total=firstStat(totalPatterns);
        return total!=null?total:sumStats(detailPatterns);
      }

      const normalized={
        // Prefer the API lifetime totals. Only sum playlist/detail fields when
        // the lifetime total is absent, preventing the same value being counted twice.
        wins:statTotal(['br_wins_total'],['br_placetop1']),
        kills:statTotal(['br_kills_total'],['br_kills','kills','eliminations']),
        deaths:statTotal(['br_deaths_total'],['br_deaths','deaths']),
        matches:statTotal(['br_matches_total'],['br_matches','br_matchesplayed']),
        minutes:statTotal(['br_minutes_total'],['br_minutesplayed']),
        top3:statTotal(['br_top3'],['br_placetop3']),
        top5:statTotal(['br_top5'],['br_placetop5']),
        top10:statTotal(['br_top10'],['br_placetop10']),
        kd:firstStat(['br_kd','killdeathratio','kdratio']),
        winRate:firstStat(['br_winrate','winrate'])
      };

      if(normalized.kd==null && normalized.kills!=null && normalized.deaths!=null && Number(normalized.deaths)>0){
        normalized.kd=Number(normalized.kills)/Number(normalized.deaths);
      }
      if(normalized.kd==null && normalized.kills!=null && normalized.matches!=null && Number(normalized.matches)>Number(normalized.wins||0)){
        const estimatedDeaths=Number(normalized.matches)-Number(normalized.wins||0);
        if(estimatedDeaths>0)normalized.kd=Number(normalized.kills)/estimatedDeaths;
      }
      if(normalized.winRate==null && normalized.wins!=null && normalized.matches!=null && Number(normalized.matches)>0){
        normalized.winRate=(Number(normalized.wins)/Number(normalized.matches))*100;
      }
      let seasonStats=null,progress=null,ranked=null;
      let progressNormalized={level:null,xp:null};
      let progressError=null,rankedError=null;

      function findNumericByPattern(obj,patterns){
        let found=null;
        const wanted=patterns.map(function(p){return normalizeKey(p)});
        function normalizeKey(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"")}
        function walk(node){
          if(found!=null||node==null||typeof node!=="object")return;
          if(Array.isArray(node)){node.forEach(walk);return}
          Object.keys(node).forEach(function(key){
            if(found!=null)return;
            const nk=normalizeKey(key);
            if(wanted.some(function(p){return nk===p||nk.indexOf(p)>=0})){
              let v=node[key];
              if(v&&typeof v==="object"){
                v=v.value!=null?v.value:(v.current!=null?v.current:(v.total!=null?v.total:null));
              }
              if(v!=null&&v!==""&&!isNaN(Number(v)))found=Number(v);
            }
          });
          if(found==null)Object.keys(node).forEach(function(key){walk(node[key])});
        }
        walk(obj);
        return found;
      }
      try{
        const seasonRes=await fetch(DATA_API+"/api/v1/profile/stats?displayName="+encodeURIComponent(name)+"&timeWindow=season",{headers});
        const seasonText=await seasonRes.text();
        if(seasonRes.ok){
          let seasonJson=null;try{seasonJson=JSON.parse(seasonText)}catch(_){}
          seasonStats=seasonJson&&seasonJson.data!==undefined?seasonJson.data:seasonJson;
        }
      }catch(_){}
      try{
        const candidates=[
          DATA_API+"/api/v1/profile/level?displayName="+encodeURIComponent(name),
          DATA_API+"/api/v1/profile/progress?displayName="+encodeURIComponent(name),
          DATA_API+"/api/v1/profile/level/"+encodeURIComponent(accountId),
          DATA_API+"/api/v1/profile/progress?accountId="+encodeURIComponent(accountId),
          DATA_API+"/api/v1/profile/progress/"+encodeURIComponent(accountId)
        ];
        const successful=[];
        let lastError=null;
        for(let i=0;i<candidates.length;i++){
          const r=await fetch(candidates[i],{headers});
          const text=await r.text();
          let json=null;try{json=JSON.parse(text)}catch(_){}
          if(r.ok){
            const payload=json&&json.data!==undefined?json.data:json;
            if(payload!=null)successful.push(payload);
          }else{
            lastError={status:r.status,message:(json&&(json.error||json.message))||text.slice(0,500),url:candidates[i]};
          }
        }
        if(successful.length){
          progress=successful;
          progressNormalized.level=findNumericByPattern(successful,["level","currentLevel","accountLevel","seasonLevel","profileLevel"]);
          progressNormalized.xp=findNumericByPattern(successful,["xp","experience","currentXp","seasonXp","experiencePoints","totalXp"]);
        }else if(lastError)progressError=lastError;
      }catch(e){progressError={status:0,message:e.message||'Erreur réseau'}}
      try{
        const rankedRes=await fetch(DATA_API+"/api/v1/profile/ranked?displayName="+encodeURIComponent(name),{headers});
        const rankedText=await rankedRes.text();
        let rankedJson=null;try{rankedJson=JSON.parse(rankedText)}catch(_){}
        if(rankedRes.ok){
          ranked=rankedJson&&rankedJson.data!==undefined?rankedJson.data:rankedJson;
        }else{
          rankedError={status:rankedRes.status,message:(rankedJson&&(rankedJson.error||rankedJson.message))||rankedText.slice(0,500)};
        }
      }catch(e){rankedError={status:0,message:e.message||'Erreur réseau'}}

      return res.status(200).json({
        ok:true,
        account:accountData,
        accountId:accountId,
        stats:raw,
        rawStatsEnvelope:rawEnvelope,
        normalized:normalized,
        seasonStats:seasonStats,
        progress:progress,
        progressNormalized:progressNormalized,
        progressError:progressError,
        ranked:ranked,
        rankedError:rankedError
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
    cosmetics:"/api/v2/cosmetics/all?page=1&pageSize=60&lang=fr"
  };
  if(!paths[type])return res.status(400).json({error:"Type inconnu."});

  try{
    const r=await fetch(DATA_API+paths[type],{headers:{"x-api-key":key}});
    const text=await r.text();
    let payload=null;
    try{payload=JSON.parse(text)}catch(_){ }
    if(!r.ok){
      const msg=payload&&(payload.error||payload.message);
      return res.status(r.status).json({error:msg||("Erreur API cosmetics : "+r.status)});
    }
    const data=payload&&payload.data!==undefined?payload.data:payload;
    const items=Array.isArray(data)?data:(data&&Array.isArray(data.items)?data.items:[]);
    res.setHeader("Cache-Control","s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json(items);
  }catch(e){
    return res.status(502).json({error:e.message||"API cosmetics indisponible"});
  }
}
