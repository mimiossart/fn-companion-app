const UPSTREAM = "https://fortnite-api.com";
async function fetchWithTimeout(url,options,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs||8000);
  try{
    const opts=Object.assign({},options||{},{signal:controller.signal});
    return await fetch(url,opts);
  }finally{
    clearTimeout(timer);
  }
}

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
      const accountRes=await fetchWithTimeout(DATA_API+"/api/v1/account/displayName/"+encodeURIComponent(name),{headers});
      const account=await readJson(accountRes);
      if(!account.ok){
        const apiMsg=account.data&&(account.data.error||account.data.message||account.data.detail);
        return res.status(account.status).json({
          error:apiMsg||("Impossible de trouver le joueur \""+name+"\"."),
          upstreamStatus:account.status,
          upstreamResponse:account.raw?account.raw.slice(0,500):""
        });
      }

      const accountRoot=account.data&&account.data.data!==undefined?account.data.data:account.data;
      const accountData=accountRoot&&accountRoot.account?accountRoot.account:accountRoot;
      const accountId=(accountData&&(accountData.id||accountData.accountId))
        ||(accountRoot&&(accountRoot.id||accountRoot.accountId));
      if(!accountId)return res.status(502).json({error:"Le service a trouvé le compte mais n'a pas renvoyé son ID Epic."});

      // Endpoint documenté : récupération complète des statistiques par account ID.
      const statsRes=await fetchWithTimeout(DATA_API+"/api/v2/stats/"+encodeURIComponent(accountId),{headers});
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
      // Les statistiques principales sont retournées immédiatement.
      // Les données de profil (niveau/XP/ranked) restent optionnelles pour ne
      // jamais empêcher le chargement des victoires, K/D et parties.
      return res.status(200).json({
        ok:true,
        account:accountData,
        accountId:accountId,
        stats:raw,
        rawStatsEnvelope:rawEnvelope,
        normalized:normalized,
        seasonStats:null,
        progress:null,
        progressNormalized:{level:null,xp:null},
        progressError:{status:0,message:"Profil optionnel non chargé"},
        ranked:null,
        rankedError:null
      });
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
      const accountRes=await fetchWithTimeout(DATA_API+"/api/v1/account/displayName/"+encodeURIComponent(name),{
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
      const questRes=await fetchWithTimeout(DATA_API+"/api/v2/quests/"+encodeURIComponent(accountId),{
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
      // Les deux ressources sont demandées en parallèle pour éviter de dépasser
      // la durée maximale d'une Serverless Function Vercel.
      const results=await Promise.all([
        fetchWithTimeout(DATA_API+"/api/v1/map",{headers},4500),
        fetchWithTimeout(DATA_API+"/api/v1/map/image",{headers,redirect:"follow"},4500)
      ]);
      const mapRes=results[0],imageRes=results[1];
      const mapText=await mapRes.text();

      if(!mapRes.ok){
        let msg=mapText;
        try{const j=JSON.parse(mapText);msg=j.error||j.message||mapText}catch(_){}
        return res.status(mapRes.status).json({error:String(msg).slice(0,500)});
      }

      let mapData=null;
      try{mapData=JSON.parse(mapText)}catch(_){
        return res.status(502).json({error:"Réponse carte invalide."});
      }

      const payload=mapData&&mapData.data!==undefined?mapData.data:mapData;
      const imageUrl=imageRes&&imageRes.ok?imageRes.url:null;
      res.setHeader("Cache-Control","public, s-maxage=1800, stale-while-revalidate=21600, stale-if-error=21600");
      return res.status(200).json({
        data:payload,
        image:imageUrl,
        source:"api-fortnite.com",
        fetchedAt:new Date().toISOString()
      });
    }catch(e){
      return res.status(502).json({
        error:e.name==="AbortError"
          ?"Fortnite API Carte : délai dépassé."
          :(e.message||"Carte indisponible.")
      });
    }
  }
  if(type==="shop"){
    try{
      const sources=[];
      if(key)sources.push({url:DATA_API+"/api/v1/shop?lang=fr",headers:{"x-api-key":key,"accept":"application/json"}});
      sources.push({url:"https://fortnite-api.com/v2/shop?language=fr",headers:{"accept":"application/json"}});
      sources.push({url:"https://fortnite-api.com/v2/shop/br?language=fr",headers:{"accept":"application/json"}});

      let sourceJson=null;
      for(let i=0;i<sources.length;i++){
        try{
          const r=await fetchWithTimeout(sources[i].url,{headers:sources[i].headers},5000);
          const text=await r.text();
          if(r.ok){
            try{sourceJson=JSON.parse(text)}catch(_){sourceJson=null}
            if(sourceJson)break;
          }
        }catch(_){}
      }
      if(!sourceJson)return res.status(502).json({error:"La boutique Fortnite est temporairement indisponible."});

      const root=sourceJson&&sourceJson.data!==undefined?sourceJson.data:sourceJson;
      const out=[],seen={};
      function addOffer(entry,section){
        if(!entry||typeof entry!=="object")return;
        const items=Array.isArray(entry.items)?entry.items:[];
        const price=entry.finalPrice!=null?entry.finalPrice:(entry.price!=null?entry.price:null);
        const offerId=entry.offerId||entry.id||"";
        if(items.length){
          items.forEach(function(it){
            if(!it||typeof it!=="object")return;
            const name=it.name||it.displayName||it.title||"Objet Fortnite";
            const k=(offerId||name)+"|"+String(price);
            if(seen[k])return;seen[k]=true;
            out.push({
              name:name,
              image:(it.images&&(it.images.featured||it.images.icon||it.images.smallIcon))||it.image||"",
              rarity:(it.rarity&&(it.rarity.displayValue||it.rarity.value))||it.rarity||"",
              price:price,
              section:section||"Boutique",
              offerId:offerId,
              itemCount:items.length
            });
          });
        }else{
          const name=entry.name||entry.displayName||entry.title||entry.devName;
          if(name){
            const k=(offerId||name)+"|"+String(price);
            if(!seen[k]){seen[k]=true;out.push({name:name,image:(entry.images&&(entry.images.featured||entry.images.icon))||"",rarity:entry.rarity||"",price:price,section:section||"Boutique",offerId:offerId,itemCount:1});}
          }
        }
      }
      ["featured","daily","specialFeatured","specialDaily","votes","voteWinners"].forEach(function(section){
        const block=root&&root[section];
        const entries=block&&Array.isArray(block.entries)?block.entries:[];
        entries.forEach(function(entry){addOffer(entry,block.name||section);});
      });
      if(root&&Array.isArray(root.entries))root.entries.forEach(function(entry){addOffer(entry,"Boutique");});

      if(!out.length)return res.status(502).json({error:"La source boutique n'a retourné aucune offre exploitable."});
      res.setHeader("Cache-Control","public, s-maxage=82800, stale-while-revalidate=86400, stale-if-error=86400");
      return res.status(200).json({data:out,source:"normalized-shop",fetchedAt:new Date().toISOString()});
    }catch(e){
      return res.status(502).json({error:e.name==="AbortError"?"Délai dépassé pour la boutique.":(e.message||"Boutique indisponible.")});
    }
  }
  const paths={
    cosmetics:"/api/v2/cosmetics/all?page=1&pageSize=48&lang=fr"
  };
  if(!paths[type])return res.status(400).json({error:"Type inconnu."});

  try{
    const sources=[];
    if(key)sources.push({url:DATA_API+paths[type],headers:{"x-api-key":key,"accept":"application/json"}});
    sources.push({url:"https://fortnite-api.com/v2/cosmetics/br?language=fr",headers:{"accept":"application/json"}});
    let items=null;
    for(let i=0;i<sources.length;i++){
      try{
        const r=await fetchWithTimeout(sources[i].url,{headers:sources[i].headers},6000);
        const text=await r.text();
        if(!r.ok)continue;
        let payload=null;try{payload=JSON.parse(text)}catch(_){continue}
        const data=payload&&payload.data!==undefined?payload.data:payload;
        if(Array.isArray(data)){items=data;break}
        if(data&&Array.isArray(data.items)){items=data.items;break}
      }catch(_){}
    }
    if(!items||!items.length)return res.status(502).json({error:"Le catalogue des skins est temporairement indisponible."});
    res.setHeader("Cache-Control","public, s-maxage=21600, stale-while-revalidate=86400, stale-if-error=86400");
    return res.status(200).json(items);
  }catch(e){
    return res.status(502).json({error:e.name==="AbortError"?"Délai dépassé pour les skins.":(e.message||"API cosmetics indisponible")});
  }
}
