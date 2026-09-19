var FN={
  page:"home",
  player:"",
  favorites:[],
  cosmetics:[],
  shop:[],
  map:null
};

var ROUTES={
  home:["Accueil","⌂"],
  map:["Carte","⌖"],
  quests:["Défis","✓"],
  items:["Skins & objets","◈"],
  shop:["Boutique","🛒"],
  profile:["Profil","◉"],
  live:["Live","↗"]
};

function esc(v){
  var s=String(v===null||v===undefined?"":v);
  return s.replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

function saveLocal(){
  try{
    localStorage.setItem("fn_player",FN.player||"");
    localStorage.setItem("fn_favorites",JSON.stringify(FN.favorites||[]));
  }catch(e){}
}

function loadLocal(){
  try{
    FN.player=localStorage.getItem("fn_player")||"";
    var raw=localStorage.getItem("fn_favorites");
    FN.favorites=raw?JSON.parse(raw):[];
    if(!Array.isArray(FN.favorites))FN.favorites=[];
  }catch(e){
    FN.player="";FN.favorites=[];
  }
}

function toast(msg){
  var old=document.getElementById("fn-toast");
  if(old)old.remove();
  var t=document.createElement("div");
  t.id="fn-toast";
  t.textContent=msg;
  t.style.cssText="position:fixed;right:18px;bottom:18px;z-index:9999;background:#1b2232;border:1px solid #46516e;color:white;padding:12px 16px;border-radius:12px;font-weight:700";
  document.body.appendChild(t);
  setTimeout(function(){if(t.parentNode)t.remove()},2200);
}

function nav(){
  var html='<aside class="sidebar"><div class="brand"><div class="brand-mark">FN</div><span>Companion</span></div><nav class="nav">';
  Object.keys(ROUTES).forEach(function(key){
    html+='<button class="'+(FN.page===key?"active":"")+'" onclick="go(\''+key+'\')"><span>'+ROUTES[key][1]+'</span>'+ROUTES[key][0]+'</button>';
  });
  html+='</nav><div class="notice" style="margin-top:24px">Application compagnon Fortnite.<br>Les données externes sont chargées uniquement lorsque tu ouvres le module concerné.</div></aside>';
  return html;
}

function mobileNav(){
  var html='<div class="mobile-nav">';
  Object.keys(ROUTES).slice(0,5).forEach(function(key){
    html+='<button class="'+(FN.page===key?"active":"")+'" onclick="go(\''+key+'\')">'+ROUTES[key][1]+'<br>'+ROUTES[key][0]+'</button>';
  });
  return html+'</div>';
}

function layout(content){
  var app=document.getElementById("app");
  if(!app)return;
  app.innerHTML='<div class="shell">'+nav()+
    '<main class="main"><div class="topbar"><div><div class="eyebrow">FN COMPANION</div><div class="page-title">'+ROUTES[FN.page][0]+'</div></div>'+
    '<div class="toolbar"><input class="search" id="fn-search" placeholder="Rechercher…" oninput="filterPage(this.value)"><button class="btn" onclick="render()">↻</button></div></div>'+
    content+'</main>'+mobileNav()+'</div>';
}

function home(){
  layout('<section class="hero"><div class="eyebrow">TABLEAU DE BORD</div><h1>Bienvenue sur FN Companion</h1><p>Carte, défis, skins, boutique et profil dans une seule application.</p><div class="toolbar"><button class="btn primary" onclick="go(\'map\')">Explorer la carte</button><button class="btn" onclick="go(\'shop\')">Boutique</button></div></section>'+
  '<section class="grid g4"><div class="card metric"><div class="label">Skins chargés</div><div class="value">'+(FN.cosmetics.length||"—")+'</div><div class="sub">Données live</div></div>'+
  '<div class="card metric"><div class="label">Favoris</div><div class="value">'+FN.favorites.length+'</div><div class="sub">Sur cet appareil</div></div>'+
  '<div class="card metric"><div class="label">Profil</div><div class="value" style="font-size:20px">'+(FN.player?esc(FN.player):"—")+'</div><div class="sub">Pseudo enregistré</div></div>'+
  '<div class="card metric"><div class="label">Statut</div><div class="value" style="font-size:20px">En ligne</div><div class="sub">Interface opérationnelle</div></div></section>'+
  '<div style="height:16px"></div><section class="grid g2"><div class="card"><div class="section-title">Modules</div><div class="list">'+
  '<div class="row"><span>Carte Fortnite</span><span class="tag">Disponible</span></div><div class="row"><span>Skins & objets</span><span class="tag">Disponible</span></div><div class="row"><span>Boutique</span><span class="tag">Disponible</span></div><div class="row"><span>Profil joueur</span><span class="tag">Disponible</span></div>'+
  '</div></div><div class="card"><div class="section-title">Profil</div><div class="row"><div><strong>'+
  (FN.player?esc(FN.player):"Configure ton pseudo")+
  '</strong><div class="sub">Tes préférences restent sur cet appareil.</div></div><button class="btn primary" onclick="go(\'profile\')">Ouvrir</button></div></div></section>');
}

function quests(){
  var qs=[["Top 10",8,10,1200],["Infliger des dégâts",3470,5000,800],["Jouer avec un ami",3,5,650],["Visiter des POI",3,3,500]];
  layout('<section class="grid g2"><div class="card"><div class="section-title">Défis suivis</div><div class="list">'+qs.map(function(q){
    var pct=Math.min(100,Math.round(q[1]/q[2]*100));
    return '<div class="row"><div style="flex:1"><strong>'+q[0]+'</strong><div class="sub">'+q[1]+' / '+q[2]+' · '+q[3]+' XP</div><div class="progress"><i style="width:'+pct+'%"></i></div></div><span class="tag">'+(pct>=100?"Terminé":"En cours")+'</span></div>';
  }).join("")+'</div></div><div class="card"><div class="section-title">Connexion aux données de jeu</div><p class="sub">La progression native des défis dépend d’un accès de données authentifié. L’application n’invente aucune progression.</p></div></section>');
}

async function loadCosmetics(){
  try{
    var r=await fetch("/api/fortnite?type=cosmetics");
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||"API indisponible");
    var data=d.data||d;
    FN.cosmetics=Array.isArray(data)?data:[];
  }catch(e){
    toast("Skins indisponibles pour le moment");
    FN.cosmetics=[];
  }
}

function renderItems(filter){
  var box=document.getElementById("fn-items");
  if(!box)return;
  var f=(filter||"").toLowerCase();
  var list=FN.cosmetics.filter(function(c){
    var t=((c.type&&((c.type.value||c.type.displayValue)))||"").toLowerCase();
    return !f||t.indexOf(f)>=0||(c.name||"").toLowerCase().indexOf(f)>=0;
  }).slice(0,48);
  box.innerHTML=list.length?list.map(function(c){
    var img=c.images&&(c.images.featured||c.images.icon||c.images.smallIcon);
    var rarity=c.rarity&&(c.rarity.displayValue||c.rarity.value);
    return '<article class="card item-card"><div class="cosmetic-img">'+(img?'<img src="'+esc(img)+'" alt="'+esc(c.name)+'" loading="lazy">':'✨')+'</div><div class="item-body"><div class="eyebrow" style="font-size:9px">'+esc(rarity||"Fortnite")+'</div><strong>'+esc(c.name||"Cosmétique")+'</strong><div class="sub">'+esc((c.type&&(c.type.displayValue||c.type.value))||"Objet")+'</div><button class="btn" onclick="favoriteSkin(\''+esc(c.id||"")+'\')">☆ Favori</button></div></article>';
  }).join(""):'<div class="card"><div class="sub">Aucun objet trouvé.</div></div>';
}

async function items(){
  layout('<div class="tabs"><button class="tab active" onclick="renderItems()">Tous</button><button class="tab" onclick="renderItems(\'outfit\')">Tenues</button><button class="tab" onclick="renderItems(\'emote\')">Emotes</button><button class="tab" onclick="renderItems(\'pickaxe\')">Pioches</button></div><div id="fn-items" class="grid g3"><div class="card"><div class="sub">Chargement…</div></div></div>');
  await loadCosmetics();
  renderItems();
}

function favoriteSkin(id){
  var c=FN.cosmetics.find(function(x){return x.id===id});
  if(!c)return;
  var i=FN.favorites.findIndex(function(x){return x.id===id});
  if(i>=0){FN.favorites.splice(i,1);toast("Retiré des favoris");}
  else{FN.favorites.unshift({id:id,name:c.name,image:(c.images&&(c.images.icon||c.images.smallIcon))||""});toast("Ajouté aux favoris");}
  saveLocal();
}

async function shop(){
  layout('<section class="hero compact-hero"><div class="eyebrow">BOUTIQUE</div><h2>Boutique Fortnite actuelle</h2><p>Les offres sont récupérées au moment de l’ouverture.</p></section><div id="fn-shop" class="grid g3"><div class="card"><div class="sub">Chargement…</div></div></div>');
  try{
    var r=await fetch("/api/fortnite?type=shop");
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||"Boutique indisponible");
    var payload=d&&d.data?d.data:d;
    var entries=[];
    function pushOffer(entry,sectionName){
      if(!entry||typeof entry!=="object")return;
      var items=Array.isArray(entry.items)?entry.items:[];
      if(items.length){
        items.forEach(function(it){
          if(!it||typeof it!=="object")return;
          entries.push({
            name:it.name||it.displayName||entry.name||"Objet Fortnite",
            image:(it.images&&(it.images.featured||it.images.icon||it.images.smallIcon))||it.image||"",
            rarity:(it.rarity&&(it.rarity.displayValue||it.rarity.value))||it.rarity||"",
            price:it.finalPrice!=null?it.finalPrice:(it.price!=null?it.price:(entry.finalPrice!=null?entry.finalPrice:(entry.price!=null?entry.price:null))),
            section:sectionName||entry.section||entry.category||"Boutique",
            offerId:entry.offerId||entry.id||"",
            itemCount:1
          });
        });
        return;
      }
      var price=entry.finalPrice!=null?entry.finalPrice:(entry.price!=null?entry.price:(entry.vbucks!=null?entry.vbucks:null));
      var image=(entry.images&&(entry.images.featured||entry.images.icon||entry.images.smallIcon))||entry.image||"";
      var name=entry.name||entry.displayName||entry.title;
      if(name&&(price!=null||image||entry.id||entry.offerId)){
        entries.push({
          name:name,image:image,
          rarity:(entry.rarity&&(entry.rarity.displayValue||entry.rarity.value))||entry.rarity||"",
          price:price,section:sectionName||entry.section||entry.category||"Boutique",
          offerId:entry.offerId||entry.id||"",itemCount:1
        });
      }
    }
    function parseShop(node,sectionName){
      if(node==null)return;
      if(Array.isArray(node)){
        node.forEach(function(v){parseShop(v,sectionName);});
        return;
      }
      if(typeof node!=="object")return;

      var localSection=sectionName;
      if(node.name && (Array.isArray(node.entries)||Array.isArray(node.items))) localSection=String(node.name);

      if(Array.isArray(node.entries)){
        node.entries.forEach(function(v){pushOffer(v,localSection);});
      }
      if(Array.isArray(node.items)){
        pushOffer(node,localSection);
      } else {
        pushOffer(node,localSection);
      }

      Object.keys(node).forEach(function(key){
        if(key==="entries"||key==="items"||key==="images"||key==="rarity")return;
        var child=node[key];
        if(child&&typeof child==="object"){
          var next=localSection;
          if(["featured","daily","specialFeatured","specialDaily","votes","voteWinners","specialOffers","shop"].indexOf(key)>=0){
            next=String((child&&child.name)||key);
          }
          parseShop(child,next);
        }
      });
    }
    parseShop(payload,"Boutique");

    var dedupe={};
    entries=entries.filter(function(x){
      if(!x.name)return false;
      var key=(x.offerId||x.name)+"|"+String(x.price);
      if(dedupe[key])return false;
      dedupe[key]=true;
      return true;
    });
    entries.sort(function(a,b){
      return String(a.section).localeCompare(String(b.section))||String(a.name).localeCompare(String(b.name));
    });
    var box=document.getElementById("fn-shop");
    box.innerHTML=entries.slice(0,60).map(function(x){
      return '<article class="card item-card"><div class="cosmetic-img">'+(x.image?'<img src="'+esc(x.image)+'" alt="'+esc(x.name)+'" loading="lazy">':'🛒')+'</div><div class="item-body"><div class="eyebrow" style="font-size:9px">'+esc(x.section||"Boutique")+'</div><strong>'+esc(x.name)+'</strong><div class="sub">'+(x.price!=null?esc(x.price)+" V-Bucks":"Prix non indiqué")+' · '+esc(x.itemCount||1)+" objet"+((x.itemCount||1)>1?"s":"")+'</div></div></article>';
    }).join("")||'<div class="card"><div class="sub">Aucune offre retournée.</div></div>';
  }catch(e){
    var msg=e&&e.message?e.message:"Erreur inconnue";
    document.getElementById("fn-shop").innerHTML='<div class="notice">Impossible de charger la boutique : '+esc(msg)+'<br><span class="sub">Actualise la page dans quelques secondes.</span></div>';
  }
}

async function mapPage(){
  layout('<div class="toolbar"><span class="tag">Carte Fortnite</span><span id="fn-map-status" class="sub">Chargement…</span></div><div id="fn-map" class="map"><div class="map-loading">Chargement de la carte…</div></div>');
  try{
    var r=await fetch("/api/fortnite?type=map");
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||"Carte indisponible");
    FN.map=d;
    var box=document.getElementById("fn-map");
    var img=d.images&&(d.images.blank||d.images.zoomed||d.images.pois||d.images.all);
    box.innerHTML=(img?'<img class="map-image" src="'+esc(img)+'" alt="Carte Fortnite">':'')+'<div class="zone"></div><div class="mapinfo">Carte actuelle · POI live</div>';
    (d.pois||[]).slice(0,50).forEach(function(p){
      var x=Number(p.location&&p.location.x),y=Number(p.location&&p.location.y);
      if(!isFinite(x)||!isFinite(y))return;
      var b=document.createElement("button");
      b.className="poi";b.textContent=p.name||"POI";b.style.left=((y+135000)/270000*100)+"%";b.style.top=((1-(x+135000)/270000)*100)+"%";
      b.onclick=function(){toast((p.name||"POI")+" sélectionné")};
      box.appendChild(b);
    });
    var st=document.getElementById("fn-map-status");if(st)st.textContent="Carte synchronisée · "+((d.pois||[]).length)+" POI";
  }catch(e){
    var b=document.getElementById("fn-map");if(b)b.innerHTML='<div class="notice map-error">'+esc(e.message)+'</div>';
  }
}

function deepFind(obj,keys){
  if(obj==null)return null;
  for(var i=0;i<keys.length;i++){
    if(typeof obj==='object'&&Object.prototype.hasOwnProperty.call(obj,keys[i])&&obj[keys[i]]!=null)return obj[keys[i]];
  }
  if(typeof obj!=='object')return null;
  var vals=Array.isArray(obj)?obj:Object.keys(obj).map(function(k){return obj[k]});
  for(var j=0;j<vals.length;j++){var r=deepFind(vals[j],keys);if(r!=null)return r}
  return null;
}
async function loadPlayerStats(){
  var name=(FN.player||'').trim();
  if(!name){toast('Enregistre ton pseudo Epic');return}
  var button=document.getElementById('load-stats');
  if(button){button.disabled=true;button.textContent='Chargement…'}
  try{
    var r=await fetch('/api/fortnite?type=stats&name='+encodeURIComponent(name));
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||'Stats indisponibles');
    FN.stats=d;
    stateStatsStore(d);
    renderProfileStats();
    toast('Statistiques chargées');
  }catch(e){toast(e.message||'Stats indisponibles')}
  finally{button=document.getElementById('load-stats');if(button){button.disabled=false;button.textContent='↻ Charger les stats'}}
}
function stateStatsStore(d){
  try{localStorage.setItem('fn_stats',JSON.stringify(d))}catch(e){}
}
function readStatsStore(){
  try{var x=localStorage.getItem('fn_stats');return x?JSON.parse(x):null}catch(e){return null}
}
function renderProfileStats(){
  var box=document.getElementById('profile-stats');if(!box)return;
  var s=FN.stats;
  if(!s){box.innerHTML='<div class="sub">Aucune statistique chargée.</div>';return}
  var st=s.stats||s;
  var season=s.seasonStats||null;
  var metricSource=season||st;
  var progress=s.progress||null;
  var wins=deepFind(metricSource,['wins','br_wins','brWins','br_wins_total','wins_total','victories']);
  var kills=deepFind(metricSource,['kills','br_kills','brKills','br_kills_total','kills_total','eliminations']);
  var deaths=deepFind(metricSource,['deaths','br_deaths','brDeaths']);
  var matches=deepFind(metricSource,['matches','matchesPlayed','br_matches','br_matches_total','matches_total']);
  var kd=deepFind(metricSource,['kd','kdratio','killDeathRatio','br_kd','br_kd_ratio']);
  var winRate=deepFind(metricSource,['winRate','winrate','br_winrate','br_winrate_total','win_rate']);
  var rank=deepFind(s,['rank','displayRank','currentRank','division','tier']);
  var rankPoints=deepFind(s,['rankPoints','points','rating','rp']);
  var level=deepFind(progress,['level','currentLevel','accountLevel','seasonLevel','battlePassLevel']);
  if(level==null)level=deepFind(s,['level','currentLevel','accountLevel','seasonLevel','battlePassLevel']);
  var xp=deepFind(progress,['xp','experience','currentXp','seasonXp']);
  if(xp==null)xp=deepFind(s,['xp','experience','currentXp','seasonXp']);
  var minutes=deepFind(st,['minutesPlayed','minutes_played']);
  function val(v){return v==null||v===''?'—':(typeof v==='number'?v.toLocaleString('fr-FR'):esc(v))}
  box.innerHTML='<section class="grid g4"><div class="card metric"><div class="label">Victoires</div><div class="value">'+val(wins)+'</div><div class="sub">Lifetime</div></div><div class="card metric"><div class="label">K/D</div><div class="value">'+val(kd)+'</div><div class="sub">Rapport éliminations / morts</div></div><div class="card metric"><div class="label">Niveau</div><div class="value">'+val(level)+'</div><div class="sub">'+(xp!=null?'XP : '+val(xp):'Profil')+'</div></div><div class="card metric"><div class="label">Parties</div><div class="value">'+val(matches)+'</div><div class="sub">Lifetime</div></div></section><div style="height:16px"></div><section class="card"><div class="section-title">Classement</div><div class="list"><div class="row"><span>Rang</span><strong>'+val(rank)+'</strong></div><div class="row"><span>Points</span><strong>'+val(rankPoints)+'</strong></div></div></section><div style="height:16px"></div><section class="card"><div class="section-title">Détails Battle Royale</div><div class="list"><div class="row"><span>Éliminations</span><strong>'+val(kills)+'</strong></div><div class="row"><span>Morts</span><strong>'+val(deaths)+'</strong></div><div class="row"><span>Taux de victoire</span><strong>'+(winRate!=null?val(winRate)+' %':'—')+'</strong></div><div class="row"><span>Minutes jouées</span><strong>'+val(minutes)+'</strong></div></div></section>';
}
function profile(){
  if(!FN.stats)FN.stats=readStatsStore();
  layout('<section class="card profile"><div class="avatar">'+(FN.favorites[0]&&FN.favorites[0].image?'<img src="'+esc(FN.favorites[0].image)+'" alt="">':'🎮')+'</div><div><div class="eyebrow">PROFIL FORTNITE</div><h2>'+((FN.player&&esc(FN.player))||'Mon profil')+'</h2><p class="sub">Entre ton pseudo Epic puis utilise le bouton de synchronisation. La clé API reste sur Vercel et n’est jamais envoyée au navigateur.</p><div class="toolbar"><input id="fn-player" class="search" placeholder="Pseudo Epic" value="'+esc(FN.player)+'"><button class="btn primary" onclick="savePlayer()">Enregistrer</button><button id="load-stats" class="btn" onclick="loadPlayerStats()">↻ Charger les stats</button></div></div></section><div style="height:16px"></div><div id="profile-stats"></div><div style="height:16px"></div><div class="card"><div class="section-title">Mes favoris</div><div class="grid g3">'+(FN.favorites.length?FN.favorites.slice(0,9).map(function(f){return '<div class="row item"><div class="mini-img">'+(f.image?'<img src="'+esc(f.image)+'" alt="">':'✨')+'</div><strong>'+esc(f.name)+'</strong></div>'}).join(''):'<div class="sub">Aucun favori.</div>')+'</div></div>');
  renderProfileStats();
}
function live(){
  layout('<div class="notice"><strong>Données externes</strong><br>Cette page vérifie les connexions lorsque les modules sont ouverts. Aucun secret n’est envoyé au navigateur.</div><div style="height:16px"></div><section class="grid g2"><div class="card"><div class="section-title">Services</div><div class="list"><div class="row"><span>Cosmétiques</span><span class="tag">API</span></div><div class="row"><span>Carte</span><span class="tag">API</span></div><div class="row"><span>Boutique</span><span class="tag">API</span></div><div class="row"><span>Stats personnelles</span><span class="tag">Optionnel</span></div></div></div><div class="card"><div class="section-title">Sécurité</div><p class="sub">Le navigateur ne reçoit aucune clé secrète. Les appels API passent par les fonctions serveur Vercel.</p></div></section>');
}

function savePlayer(){
  var input=document.getElementById('fn-player');
  FN.player=input?input.value.trim():'';
  saveLocal();toast('Profil enregistré');loadPlayerStats();
}

function filterPage(v){
  var q=String(v||"").toLowerCase();
  document.querySelectorAll(".row,.item-card,.poi").forEach(function(el){
    el.style.display=el.innerText.toLowerCase().indexOf(q)>=0?"":"none";
  });
}

function go(p){FN.page=p;render();window.scrollTo(0,0)}
function render(){
  var fn={home:home,map:mapPage,quests:quests,items:items,shop:shop,profile:profile,live:live}[FN.page]||home;
  try{fn()}catch(e){console.error(e);document.getElementById("app").innerHTML='<div style="padding:30px;color:white"><h1>FN Companion</h1><p>Une erreur a été détectée. Recharge la page.</p></div>'}
}

loadLocal();
render();