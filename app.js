var FN={
  page:"home",
  player:"",
  favorites:[],
  cosmetics:[],
  shop:[],
  map:null,
  stats:null,
  supabase:null,
  user:null,
  selectedTournament:null
};

var ROUTES={
  home:["Accueil","⌂"],
  map:["Carte","⌖"],
  quests:["Défis","✓"],
  items:["Skins & objets","◈"],
  shop:["Boutique","🛒"],
  profile:["Profil","◉"],
  tournaments:["Tournois","🏆"],
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
  var html='<aside class="sidebar"><div class="brand"><div class="brand-mark">FN</div><span>Lion Dynasty</span></div><nav class="nav">';
  Object.keys(ROUTES).forEach(function(key){
    html+='<button class="'+(FN.page===key?"active":"")+'" onclick="go(\''+key+'\')"><span>'+ROUTES[key][1]+'</span>'+ROUTES[key][0]+'</button>';
  });
  html+='</nav><div class="notice" style="margin-top:24px">Application compagnon Fortnite.<br>Les données externes sont chargées uniquement lorsque tu ouvres le module concerné.</div></aside>';
  return html;
}

function mobileNav(){
  var html='<div class="mobile-nav">';
  Object.keys(ROUTES).slice(0,7).forEach(function(key){
    html+='<button class="'+(FN.page===key?"active":"")+'" onclick="go(\''+key+'\')">'+ROUTES[key][1]+'<br>'+ROUTES[key][0]+'</button>';
  });
  return html+'</div>';
}

function layout(content){
  var app=document.getElementById("app");
  if(!app)return;
  app.innerHTML='<div class="shell">'+nav()+
    '<main class="main"><div class="topbar"><div><div class="eyebrow">FN COMPANION LION DYNASTY</div><div class="page-title">'+ROUTES[FN.page][0]+'</div></div>'+
    '<div class="toolbar"><input class="search" id="fn-search" placeholder="Rechercher…" oninput="filterPage(this.value)"><button class="btn" onclick="render()">↻</button></div></div>'+
    content+'</main>'+mobileNav()+'</div>';
}

function home(){
  layout('<section class="hero"><div class="eyebrow">TABLEAU DE BORD</div><h1>Bienvenue sur FN Companion Lion Dynasty</h1><p>Carte, défis, skins, boutique et profil dans une seule application.</p><div class="toolbar"><button class="btn primary" onclick="go(\'map\')">Explorer la carte</button><button class="btn" onclick="go(\'shop\')">Boutique</button></div></section>'+
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

async function quests(){
  layout('<section class="hero compact-hero"><div class="eyebrow">DÉFIS</div><h2>Défis réels du compte</h2><p>La progression est chargée depuis ton profil Fortnite.</p></section><div id="fn-quests" class="grid g2"><div class="card"><div class="sub">Chargement…</div></div></div>');
  var box=document.getElementById('fn-quests');
  try{
    if(!FN.player){
      box.innerHTML='<div class="notice">Enregistre ton pseudo Epic dans Profil pour charger tes défis.</div>';
      return;
    }
    var r=await fetch('/api/fortnite?type=quests&name='+encodeURIComponent(FN.player));
    var d=null;try{d=await r.json()}catch(_){d={}};
    if(!r.ok)throw new Error(d.error||('Erreur serveur '+r.status));

    var payload=d&&d.data!==undefined?d.data:d;
    var quests=[];
    function valNum(v){
      if(v==null||v==='')return null;
      if(typeof v==='number')return v;
      var n=Number(v);
      return isFinite(n)?n:null;
    }
    function walk(node){
      if(node==null)return;
      if(Array.isArray(node)){node.forEach(walk);return}
      if(typeof node!=='object')return;

      var title=node.title||node.name||node.displayName||node.description;
      var current=node.progress!=null?node.progress:(node.current!=null?node.current:(node.currentProgress!=null?node.currentProgress:null));
      var target=node.total!=null?node.total:(node.target!=null?node.target:(node.goal!=null?node.goal:(node.totalProgress!=null?node.totalProgress:null)));
      if(title&&(current!=null||target!=null)){
        current=valNum(current);target=valNum(target);
        if(current!=null||target!=null){
          quests.push({
            title:String(title),
            current:current||0,
            target:target||0,
            xp:valNum(node.xp)||valNum(node.experience)||valNum(node.rewardXp),
            completed:!!(node.completed||node.isComplete||node.complete)
          });
        }
      }
      Object.keys(node).forEach(function(k){walk(node[k]);});
    }
    walk(payload);

    var seen={};
    quests=quests.filter(function(q){
      var key=q.title+'|'+q.current+'|'+q.target;
      if(seen[key])return false;seen[key]=true;return true;
    }).slice(0,100);

    if(!quests.length){
      box.innerHTML='<div class="notice">Le compte a répondu, mais aucun défi avec progression exploitable n’a été retourné.</div>';
      return;
    }

    box.innerHTML=quests.map(function(q){
      var pct=q.target>0?Math.min(100,Math.round(q.current/q.target*100)):(q.completed?100:0);
      return '<div class="card"><div class="row"><div style="flex:1"><strong>'+esc(q.title)+'</strong><div class="sub">'+esc(q.current)+' / '+esc(q.target)+(q.xp!=null?' · '+esc(q.xp)+' XP':'')+'</div><div class="progress"><i style="width:'+pct+'%"></i></div></div><span class="tag">'+(q.completed||pct>=100?'Terminé':'En cours')+'</span></div></div>';
    }).join('');
  }catch(e){
    box.innerHTML='<div class="notice">Impossible de charger les vrais défis : '+esc(e.message||'Erreur inconnue')+'</div>';
  }
}

function initSupabase(){
  try{
    if(window.supabase&&window.FN_SUPABASE_URL&&window.FN_SUPABASE_KEY){
      FN.supabase=window.supabase.createClient(window.FN_SUPABASE_URL,window.FN_SUPABASE_KEY);
      FN.supabase.auth.getSession().then(function(res){
        FN.user=res&&res.data?res.data.session&&res.data.session.user:null;
        if(FN.page==="tournaments")render();
      });
      FN.supabase.auth.onAuthStateChange(function(_event,session){
        FN.user=session&&session.user?session.user:null;
        if(FN.page==="tournaments")render();
      });
    }
  }catch(e){console.error(e)}
}

function tournamentEsc(v){return esc(v)}
function currentUser(){return FN.user}

function authRegister(){
  var email=document.getElementById('tour-email'),pw=document.getElementById('tour-password'),msg=document.getElementById('tour-auth-msg');
  if(!FN.supabase){if(msg)msg.textContent='Base de données indisponible.';return}
  FN.supabase.auth.signUp({email:email.value.trim(),password:pw.value}).then(function(res){
    if(res.error){if(msg)msg.textContent=res.error.message;return}
    if(msg)msg.textContent='Compte créé. Tu peux maintenant te connecter.';
  });
}

function authLogin(){
  var email=document.getElementById('tour-email'),pw=document.getElementById('tour-password'),msg=document.getElementById('tour-auth-msg');
  if(!FN.supabase){if(msg)msg.textContent='Base de données indisponible.';return}
  var address=email.value.trim();
  FN.supabase.auth.signInWithPassword({email:address,password:pw.value}).then(function(res){
    if(res.error){
      var text=res.error.message||'Erreur de connexion.';
      if(msg)msg.textContent=text;
      return;
    }
    if(msg)msg.textContent='Connexion réussie.';
  });
}

async function authResendConfirmation(){
  var email=document.getElementById('tour-email'),msg=document.getElementById('tour-auth-msg');
  if(!FN.supabase||!email)return;
  var address=email.value.trim();
  if(!address){if(msg)msg.textContent='Indique ton e-mail pour renvoyer la confirmation.';return}
  var res=await FN.supabase.auth.resend({type:'signup',email:address});
  if(res.error){if(msg)msg.textContent=res.error.message;return}
  if(msg)msg.textContent='E-mail de confirmation renvoyé.';
}

function authLogout(){
  if(FN.supabase)FN.supabase.auth.signOut();
}

async function saveTournamentPlayer(){
  var epic=document.getElementById('tour-epic'),display=document.getElementById('tour-display'),msg=document.getElementById('tour-player-msg');
  if(!FN.user){if(msg)msg.textContent='Connecte-toi d’abord.';return}
  epic=epic&&epic.value.trim();display=display&&display.value.trim();
  if(!epic||!display){if(msg)msg.textContent='Pseudo Epic et nom à afficher requis.';return}
  var res=await FN.supabase.from('fn_players').upsert({id:FN.user.id,display_name:display,epic_name:epic,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(res.error){if(msg)msg.textContent=res.error.message;return}
  FN.player=epic;saveLocal();
  if(msg)msg.textContent='Profil tournoi enregistré.';
  await loadTournamentList();
}

async function loadTournamentList(){
  var box=document.getElementById('tournament-list');if(!box||!FN.supabase)return;
  box.innerHTML='<div class="card"><div class="sub">Chargement des tournois…</div></div>';
  var tr=await FN.supabase.from('fn_tournaments').select('*').order('created_at',{ascending:false});
  if(tr.error){box.innerHTML='<div class="notice">'+esc(tr.error.message)+'</div>';return}
  var rows=tr.data||[];
  var pr=await FN.supabase.from('fn_tournament_players').select('tournament_id,player_id');
  var counts={};(pr.data||[]).forEach(function(x){counts[x.tournament_id]=(counts[x.tournament_id]||0)+1});
  if(!rows.length){box.innerHTML='<div class="card"><div class="sub">Aucun tournoi pour le moment.</div></div>';return}
  box.innerHTML=rows.map(function(t){
    var count=counts[t.id]||0;
    var joined=!!(FN.user&&pr.data&&pr.data.some(function(x){return x.tournament_id===t.id&&x.player_id===FN.user.id}));
    var status=t.status==='open'?'Ouvert':(t.status==='live'?'En cours':(t.status==='completed'?'Terminé':'Annulé'));
    return '<div class="card tournament-card"><div class="row"><div><div class="eyebrow">'+esc(t.game_mode)+'</div><h3>'+esc(t.name)+'</h3><div class="sub">'+count+' / '+t.max_players+' joueurs · '+status+'</div></div><div class="toolbar"><button class="btn" onclick="openTournament(\''+t.id+'\')">Ouvrir</button>'+(t.status==='open'&&!joined&&count<t.max_players?'<button class="btn primary" onclick="joinTournament(\''+t.id+'\')">S’inscrire</button>':'')+'</div></div></div>';
  }).join('');
}

async function joinTournament(id){
  if(!FN.user){toast('Connecte-toi pour t’inscrire');return}
  var res=await FN.supabase.rpc('fn_join_tournament',{p_tournament_id:id});
  if(res.error){toast(res.error.message);return}
  toast('Inscription au tournoi confirmée');
  await loadTournamentList();
  await openTournament(id);
}

async function createTournament(){
  var name=document.getElementById('new-tour-name'),mode=document.getElementById('new-tour-mode'),max=document.getElementById('new-tour-max'),msg=document.getElementById('tour-create-msg');
  if(!FN.user){if(msg)msg.textContent='Connecte-toi pour créer un tournoi.';return}
  var v={name:name.value.trim(),game_mode:mode.value,max_players:Number(max.value),created_by:FN.user.id};
  if(!v.name){if(msg)msg.textContent='Nom du tournoi requis.';return}
  var res=await FN.supabase.from('fn_tournaments').insert(v).select().single();
  if(res.error){if(msg)msg.textContent=res.error.message;return}
  msg.textContent='Tournoi créé.';
  await loadTournamentList();
  await openTournament(res.data.id);
}

async function startTournament(id){
  var res=await FN.supabase.rpc('fn_start_tournament',{p_tournament_id:id});
  if(res.error){toast(res.error.message);return}
  toast('Tournoi démarré');
  await openTournament(id);
}

function playerName(map,id){return id&&map[id]?map[id].display_name:'—'}

async function openTournament(id){
  FN.selectedTournament=id;
  var area=document.getElementById('tournament-detail');if(!area)return;
  area.innerHTML='<div class="card"><div class="sub">Chargement…</div></div>';
  var t=await FN.supabase.from('fn_tournaments').select('*').eq('id',id).single();
  if(t.error){area.innerHTML='<div class="notice">'+esc(t.error.message)+'</div>';return}
  var ps=await FN.supabase.from('fn_tournament_players').select('player_id,seed,status,joined_at').eq('tournament_id',id).order('seed',{ascending:true,nullsFirst:false});
  var ids=(ps.data||[]).map(function(x){return x.player_id});
  var pl=ids.length?await FN.supabase.from('fn_players').select('id,display_name,epic_name').in('id',ids):{data:[],error:null};
  var pmap={};(pl.data||[]).forEach(function(p){pmap[p.id]=p});
  var ms=await FN.supabase.from('fn_matches').select('*').eq('tournament_id',id).order('round_no',{ascending:true}).order('match_no',{ascending:true});

  var organizer=!!(FN.user&&t.data.created_by===FN.user.id);
  var roster=(ps.data||[]).map(function(p){
    return '<div class="row"><span>'+esc(playerName(pmap,p.player_id))+'</span><span class="tag">'+(p.status==='eliminated'?'Éliminé':('Seed '+(p.seed||'?')))+'</span></div>';
  }).join('')||'<div class="sub">Aucun joueur inscrit.</div>';

  var standings={};
  (ps.data||[]).forEach(function(p){
    standings[p.player_id]={points:0,wins:0,losses:0,matches:0};
  });
  (ms.data||[]).forEach(function(m){
    if(m.status!=='completed'||!m.winner_id||!m.player1_id||!m.player2_id)return;
    var loser=m.winner_id===m.player1_id?m.player2_id:m.player1_id;
    if(standings[m.winner_id]){
      standings[m.winner_id].wins++;
      standings[m.winner_id].matches++;
      standings[m.winner_id].points+=3;
    }
    if(standings[loser]){
      standings[loser].losses++;
      standings[loser].matches++;
    }
  });
  var leaderboard=Object.keys(standings).map(function(pid){
    standings[pid].player_id=pid;
    return standings[pid];
  }).sort(function(a,b){
    return b.points-a.points||b.wins-a.wins||b.matches-a.matches;
  });
  var leaderboardHtml=leaderboard.map(function(s,i){
    return '<div class="row"><div><strong>#'+(i+1)+' '+esc(playerName(pmap,s.player_id))+'</strong><div class="sub">'+s.wins+' victoire'+(s.wins>1?'s':'')+' · '+s.losses+' défaite'+(s.losses>1?'s':'')+' · '+s.matches+' match'+(s.matches>1?'s':'')+'</div></div><span class="tag">'+s.points+' pts</span></div>';
  }).join('')||'<div class="sub">Aucun résultat enregistré.</div>';

  var matchesByRound={};
  (ms.data||[]).forEach(function(m){(matchesByRound[m.round_no]||(matchesByRound[m.round_no]=[])).push(m)});
  var rounds=Object.keys(matchesByRound).sort(function(a,b){return Number(a)-Number(b)}).map(function(r){
    return '<div class="tournament-round"><div class="section-title">Tour '+r+'</div>'+matchesByRound[r].map(function(m){
      var p1=playerName(pmap,m.player1_id),p2=playerName(pmap,m.player2_id);
      var ready=m.status==='ready'&&m.player1_id&&m.player2_id;
      var report='';
      if(ready&&(FN.user&& (FN.user.id===m.player1_id||FN.user.id===m.player2_id||organizer))){
        report='<div class="match-report"><select id="winner-'+m.id+'"><option value="'+m.player1_id+'">'+esc(p1)+'</option><option value="'+m.player2_id+'">'+esc(p2)+'</option></select><input id="score1-'+m.id+'" type="number" min="0" value="1" class="score-input"><input id="score2-'+m.id+'" type="number" min="0" value="0" class="score-input"><button class="btn primary" onclick="reportMatch(\\''+m.id+'\\',\\''+m.player1_id+'\\',\\''+m.player2_id+'\\')">Valider</button></div>';
      }
      var outcome='';
      if(m.status==='completed'&&FN.user){
        if(m.winner_id===FN.user.id)outcome='<span class="tag">Gagné · +3 pts</span>';
        else if(m.player1_id===FN.user.id||m.player2_id===FN.user.id)outcome='<span class="tag">Perdu · +0 pt</span>';
      }
      return '<div class="card match-card"><div class="row"><div><strong>'+esc(p1)+'</strong><span class="sub"> vs </span><strong>'+esc(p2)+'</strong></div><div class="toolbar" style="gap:6px"><span class="tag">'+(m.status==='completed'?'Terminé':(ready?'Prêt':'En attente'))+(m.status==='completed'?' · '+m.score1+'-'+m.score2:'')+'</span>'+outcome+'</div></div>'+report+'</div>';
    }).join('')+'</div>';
  }).join('');

  area.innerHTML='<div class="card"><div class="toolbar" style="justify-content:space-between"><div><div class="eyebrow">'+esc(t.data.game_mode)+'</div><h2>'+esc(t.data.name)+'</h2><div class="sub">Statut : '+esc(t.data.status)+' · '+(ps.data||[]).length+' / '+t.data.max_players+' joueurs</div></div><div class="toolbar">'+(organizer&&t.data.status==='open'&&(ps.data||[]).length===t.data.max_players?'<button class="btn primary" onclick="startTournament(\\''+id+'\\')">Démarrer</button>':'')+'<button class="btn" onclick="loadTournamentList()">Actualiser</button></div></div></div><div style="height:12px"></div><div class="notice">Système de points : <strong>3 points par victoire</strong>, <strong>0 point en cas de défaite</strong>. Le classement se met à jour dès qu’un résultat est validé.</div><div style="height:12px"></div><section class="grid g2"><div><div class="card"><div class="section-title">Classement du tournoi</div><div class="list">'+leaderboardHtml+'</div></div><div style="height:12px"></div><div class="card"><div class="section-title">Joueurs inscrits</div><div class="list">'+roster+'</div></div></div><div>'+rounds+'</div></section>';
}

async function reportMatch(id,p1,p2){
  var winner=document.getElementById('winner-'+id),s1=document.getElementById('score1-'+id),s2=document.getElementById('score2-'+id);
  if(!winner)return;
  var res=await FN.supabase.rpc('fn_report_match',{p_match_id:id,p_winner_id:winner.value,p_score1:Number(s1.value),p_score2:Number(s2.value)});
  if(res.error){toast(res.error.message);return}
  toast('Résultat enregistré');
  if(FN.selectedTournament)await openTournament(FN.selectedTournament);
}

function tournaments(){
  if(!FN.supabase){
    layout('<div class="notice">Le système de tournois est en cours de connexion à la base de données.</div>');
    return;
  }
  if(!FN.user){
    layout('<section class="hero compact-hero"><div class="eyebrow">TOURNOIS</div><h2>Tournois Lion Dynasty</h2><p>Inscris-toi pour participer aux tournois entre joueurs enregistrés sur le site.</p></section><section class="card auth-card"><div class="section-title">Créer ou rejoindre ton compte</div><div class="toolbar"><input id="tour-email" class="search" placeholder="E-mail"><input id="tour-password" class="search" type="password" placeholder="Mot de passe"><button class="btn primary" onclick="authLogin()">Se connecter</button><button class="btn" onclick="authRegister()">Créer un compte</button></div><div id="tour-auth-msg" class="sub" style="margin-top:10px"></div></section><div style="height:16px"></div><div class="notice">Un compte est nécessaire pour apparaître comme joueur inscrit. Les tournois et résultats sont enregistrés en ligne.</div>');
    return;
  }

  layout('<section class="hero compact-hero"><div class="toolbar" style="justify-content:space-between"><div><div class="eyebrow">TOURNOIS</div><h2>Tournois Lion Dynasty</h2><p>Tournois entre joueurs inscrits, avec inscriptions et tableau de matchs.</p></div><button class="btn" onclick="authLogout()">Se déconnecter</button></div></section><section class="card"><div class="section-title">Mon profil joueur</div><div class="toolbar"><input id="tour-display" class="search" placeholder="Nom affiché"><input id="tour-epic" class="search" placeholder="Pseudo Epic"><button class="btn primary" onclick="saveTournamentPlayer()">Enregistrer</button></div><div id="tour-player-msg" class="sub" style="margin-top:10px"></div></section><div style="height:16px"></div><section class="card"><div class="section-title">Créer un tournoi</div><div class="toolbar"><input id="new-tour-name" class="search" placeholder="Nom du tournoi"><select id="new-tour-mode" class="search"><option>Solo</option><option>Duo</option><option>Escouades</option><option>Zéro construction</option></select><select id="new-tour-max" class="search"><option value="4">4 joueurs</option><option value="8" selected>8 joueurs</option><option value="16">16 joueurs</option></select><button class="btn primary" onclick="createTournament()">Créer</button></div><div id="tour-create-msg" class="sub" style="margin-top:10px"></div></section><div style="height:16px"></div><div id="tournament-list" class="grid g2"></div><div style="height:16px"></div><div id="tournament-detail"></div>');
  loadTournamentList();
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

    var payload=d&&d.data!==undefined?d.data:d;
    var box=document.getElementById("fn-map");
    var img=d.image||(payload&&payload.image)||((payload&&payload.images)&&(payload.images.blank||payload.images.zoomed||payload.images.pois||payload.images.all));
    var pois=payload&&Array.isArray(payload.pois)?payload.pois:[];
    if(!pois.length&&payload&&Array.isArray(payload.pointsOfInterest))pois=payload.pointsOfInterest;

    box.innerHTML='<div class="map-controls"><button class="btn" id="map-zoom-out" title="Dézoomer">−</button><span id="map-zoom-label">100 %</span><button class="btn" id="map-zoom-in" title="Zoomer">+</button><button class="btn" id="map-zoom-reset" title="Réinitialiser">↺</button></div><div id="map-stage" class="map-stage"></div>';
    var stage=document.getElementById("map-stage");
    stage.innerHTML=(img?'<img class="map-image" src="'+esc(img)+'" alt="Carte Fortnite">':'<div class="notice">Image de la carte indisponible.</div>')+'<div class="zone"></div><div class="mapinfo">Carte actuelle · '+pois.length+' POI</div>';

    pois.slice(0,100).forEach(function(p){
      var x=Number(p.location&&p.location.x!=null?p.location.x:p.x);
      var y=Number(p.location&&p.location.y!=null?p.location.y:p.y);
      if(!isFinite(x)||!isFinite(y))return;
      var b=document.createElement("button");
      b.className="poi";
      b.textContent=p.name||p.displayName||"POI";
      var bounds=payload&&payload.worldBounds;
      if(bounds&&bounds.min&&bounds.max){
        var px=((x-bounds.min.x)/(bounds.max.x-bounds.min.x))*100;
        var py=(1-((y-bounds.min.y)/(bounds.max.y-bounds.min.y)))*100;
        b.style.left=px+"%";b.style.top=py+"%";
      }else{
        b.style.left=((y+135000)/270000*100)+"%";
        b.style.top=((1-(x+135000)/270000)*100)+"%";
      }
      b.onclick=function(){toast((p.name||p.displayName||"POI")+" sélectionné")};
      stage.appendChild(b);
    });

    var zoom=1;
    function applyZoom(){
      stage.style.transform="translate(-50%,-50%) scale("+zoom+")";
      var label=document.getElementById("map-zoom-label");
      if(label)label.textContent=Math.round(zoom*100)+" %";
    }
    document.getElementById("map-zoom-out").onclick=function(){
      zoom=Math.max(.45,Math.round((zoom-.1)*100)/100);
      applyZoom();
    };
    document.getElementById("map-zoom-in").onclick=function(){
      zoom=Math.min(2,Math.round((zoom+.1)*100)/100);
      applyZoom();
    };
    document.getElementById("map-zoom-reset").onclick=function(){
      zoom=1;applyZoom();
    };

    var st=document.getElementById("fn-map-status");
    if(st)st.textContent="Carte synchronisée · "+pois.length+" POI";
  }catch(e){
    var b=document.getElementById("fn-map");
    if(b)b.innerHTML='<div class="notice map-error">'+esc(e.message)+'</div>';
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
    var d=null;
    try{d=await r.json()}catch(_){d={}}
    if(!r.ok)throw new Error(d.error||('Erreur serveur '+r.status));
    FN.stats=d;
    stateStatsStore(d);
    renderProfileStats();
    if(d.account&&d.account.displayName)FN.player=d.account.displayName;
    toast('Statistiques chargées');
  }catch(e){
    var box=document.getElementById('profile-stats');
    if(box)box.innerHTML='<div class="notice">Impossible de charger les statistiques : '+esc(e.message||'Erreur inconnue')+'</div>';
    toast(e.message||'Stats indisponibles');
  }finally{
    button=document.getElementById('load-stats');
    if(button){button.disabled=false;button.textContent='↻ Charger les stats'}
  }
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

  var rawStats=s.stats||s;
  var normalized=s.normalized||null;
  var hasNormalized=normalized&&Object.keys(normalized).some(function(k){return normalized[k]!=null});
  var st=hasNormalized?normalized:rawStats;
  var progress=s.progress||null;

  function pick(obj,keys){return deepFind(obj,keys)}
  function val(v){return v==null||v===''?'—':(typeof v==='number'?v.toLocaleString('fr-FR'):esc(v))}
  function modeStats(source,patterns){
    if(!source)return null;
    var out={
      wins:findByStatPattern(source,patterns.wins),
      kills:findByStatPattern(source,patterns.kills),
      deaths:findByStatPattern(source,patterns.deaths),
      matches:findByStatPattern(source,patterns.matches),
      kd:findByStatPattern(source,patterns.kd),
      winRate:findByStatPattern(source,patterns.winRate)
    };
    var any=Object.keys(out).some(function(k){return out[k]!=null});
    return any?out:null;
  }
  function normalizeKey(k){return String(k||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function findByStatPattern(source,keys){
    if(source==null)return null;
    if(typeof source!=='object')return null;
    var found=null;
    (function walk(node){
      if(found!=null||node==null||typeof node!=='object')return;
      if(Array.isArray(node)){node.forEach(walk);return}
      Object.keys(node).forEach(function(k){
        if(found!=null)return;
        var nk=normalizeKey(k);
        for(var i=0;i<keys.length;i++){
          if(nk===keys[i]||nk.indexOf(keys[i])>=0){
            var v=node[k];
            if(v&&typeof v==='object'){
              v=v.value!=null?v.value:(v.total!=null?v.total:null);
            }
            if(v!=null&&v!==''){found=v;return}
          }
        }
      });
      if(found==null)Object.keys(node).forEach(function(k){walk(node[k]);});
    })(source);
    return found;
  }

  function findMode(source,aliases){
    var result=null;
    if(!source||typeof source!=='object')return null;
    (function walk(node){
      if(result||node==null||typeof node!=='object')return;
      if(Array.isArray(node)){node.forEach(walk);return}
      Object.keys(node).forEach(function(k){
        if(result)return;
        var nk=normalizeKey(k);
        if(aliases.some(function(a){return nk===a||nk.indexOf(a)>=0})){
          var candidate=node[k];
          if(candidate&&typeof candidate==='object'){
            var stats=modeStats(candidate,{
              wins:['winstotal','wins','victory','placetop1'],
              kills:['killstotal','kills','eliminations'],
              deaths:['deathstotal','deaths'],
              matches:['matchestotal','matchesplayed','matches'],
              kd:['kd','kdratio','killdeathratio'],
              winRate:['winrate','winratepercent']
            });
            if(stats)result=stats;
          }
        }
      });
      if(!result)Object.keys(node).forEach(function(k){walk(node[k]);});
    })(source);
    return result;
  }

  var modes=[
    {label:'Solo',aliases:['solo']},
    {label:'Duo',aliases:['duo','duos']},
    {label:'Escouades',aliases:['squad','squads']},
    {label:'Zéro construction',aliases:['zerobuild','zerobuilds','nobuild']}
  ];
  var modeCards=modes.map(function(m){
    var ms=findMode(rawStats,m.aliases)||findMode(s,m.aliases);
    if(!ms)return '';
    return '<div class="card"><div class="section-title">'+m.label+'</div><div class="list"><div class="row"><span>Victoires</span><strong>'+val(ms.wins)+'</strong></div><div class="row"><span>Éliminations</span><strong>'+val(ms.kills)+'</strong></div><div class="row"><span>K/D</span><strong>'+val(ms.kd)+'</strong></div><div class="row"><span>Parties</span><strong>'+val(ms.matches)+'</strong></div><div class="row"><span>Taux de victoire</span><strong>'+val(ms.winRate)+(ms.winRate!=null?' %':'')+'</strong></div></div></div>';
  }).join('');

  var wins=pick(st,['wins','br_wins','brWins','br_wins_total','br_placetop1','wins_total','victories']);
  var kills=pick(st,['kills','br_kills','brKills','br_kills_total','kills_total','eliminations']);
  var deaths=pick(st,['deaths','br_deaths','brDeaths','br_deaths_total']);
  var matches=pick(st,['matches','matchesPlayed','br_matches','br_matches_total','br_matchesplayed','matches_total']);
  var kd=pick(st,['kd','kdratio','killDeathRatio','br_kd','br_kd_ratio']);
  var winRate=pick(st,['winRate','winrate','br_winrate','br_winrate_total','win_rate']);
  var top1=pick(st,['top1','br_placetop1','placetop1','wins','br_wins_total']);
  var top3=pick(st,['top3','br_placetop3','placetop3']);
  var top5=pick(st,['top5','br_placetop5','placetop5']);
  var top10=pick(st,['top10','br_placetop10','placetop10']);
  var rank=pick(s,['rank','displayRank','currentRank','division','tier']);
  var rankPoints=pick(s,['rankPoints','points','rating','rp']);
  var level=deepFind(progress,['level','currentLevel','accountLevel','seasonLevel','battlePassLevel']);
  if(level==null)level=deepFind(s,['level','currentLevel','accountLevel','seasonLevel','battlePassLevel']);
  var xp=deepFind(progress,['xp','experience','currentXp','seasonXp']);
  if(xp==null)xp=deepFind(s,['xp','experience','currentXp','seasonXp']);

  var missing=(wins==null&&kills==null&&matches==null&&modeCards==='');
  if(missing){
    var accountLabel=s.account&&s.account.displayName?s.account.displayName:(FN.player||'ce compte');
    var rawKeys=[];
    try{Object.keys(rawStats||{}).forEach(function(k){rawKeys.push(k)})}catch(_){}
    box.innerHTML='<div class="notice"><strong>Compte trouvé : '+esc(accountLabel)+'</strong><br>La réponse Fortnite ne contient pas encore de statistiques publiques exploitables.<br><span class="sub">ID Epic : '+esc(s.accountId||'—')+' · Champs reçus : '+esc(rawKeys.slice(0,18).join(', ')||'aucun')+'</span></div>';
    return;
  }

  var overall='<section class="grid g4"><div class="card metric"><div class="label">Victoires</div><div class="value">'+val(wins)+'</div><div class="sub">Tous modes</div></div><div class="card metric"><div class="label">K/D</div><div class="value">'+val(kd)+'</div><div class="sub">Tous modes</div></div><div class="card metric"><div class="label">Niveau</div><div class="value">'+val(level)+'</div><div class="sub">'+(xp!=null?'XP : '+val(xp):'Profil')+'</div></div><div class="card metric"><div class="label">Parties</div><div class="value">'+val(matches)+'</div><div class="sub">Tous modes</div></div></section>';

  var details='<div style="height:16px"></div><section class="card"><div class="section-title">Statistiques générales</div><div class="list"><div class="row"><span>Éliminations</span><strong>'+val(kills)+'</strong></div><div class="row"><span>Morts</span><strong>'+val(deaths)+'</strong></div><div class="row"><span>Taux de victoire</span><strong>'+(winRate!=null?val(winRate)+' %':'—')+'</strong></div><div class="row"><span>Top 1 / Victoires</span><strong>'+val(top1)+'</strong></div><div class="row"><span>Top 3</span><strong>'+val(top3)+'</strong></div><div class="row"><span>Top 5</span><strong>'+val(top5)+'</strong></div><div class="row"><span>Top 10</span><strong>'+val(top10)+'</strong></div></div></section>';

  var ranking='<div style="height:16px"></div><section class="card"><div class="section-title">Classement</div><div class="list"><div class="row"><span>Rang</span><strong>'+val(rank)+'</strong></div><div class="row"><span>Points</span><strong>'+val(rankPoints)+'</strong></div></div></section>';

  var modesHtml=modeCards?'<div style="height:16px"></div><div class="section-title">Statistiques par mode</div><div class="grid g2">'+modeCards+'</div>':'';
  box.innerHTML=overall+modesHtml+ranking+details;
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
  var fn={home:home,map:mapPage,quests:quests,items:items,shop:shop,profile:profile,tournaments:tournaments,live:live}[FN.page]||home;
  try{fn()}catch(e){console.error(e);document.getElementById("app").innerHTML='<div style="padding:30px;color:white"><h1>FN Companion</h1><p>Une erreur a été détectée. Recharge la page.</p></div>'}
}

loadLocal();
initSupabase();
render();