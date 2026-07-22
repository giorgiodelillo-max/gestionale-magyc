
const cfg = window.MAGYC_CONFIG || {};
const configured = Boolean(
  cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("INSERISCI_") &&
  cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.startsWith("INSERISCI_")
);

let client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
let demoMode = false;
let currentUser = null;
let memberships = [], leagues = [], teams = [], auctions = [], auctionBids = [], matches = [], documents = [], activities = [], rosterPlayers = [], leagueUsers = [], marketTransactions = [];
let currentLeagueId = null;

const $ = id => document.getElementById(id);
const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];

function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.classList.remove("hidden");
  clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}
function esc(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function nowIso(){return new Date().toISOString();}
function makeCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="MAGYC-";for(let i=0;i<8;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s;}
function id(){return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)+Date.now();}
function currentMembership(){return memberships.find(m=>m.league_id===currentLeagueId);}
function currentRole(){return currentMembership()?.role || null;}
function isAdmin(){return ["owner","admin"].includes(currentRole());}
function currentLeague(){return leagues.find(l=>l.id===currentLeagueId);}
function currentTeam(){return teams.find(t=>t.coach_user_id===currentUser?.id && t.league_id===currentLeagueId);}
function leagueTeams(){return teams.filter(t=>t.league_id===currentLeagueId);}
function leagueAuctions(){return auctions.filter(a=>a.league_id===currentLeagueId);}
function leagueMatches(){return matches.filter(m=>m.league_id===currentLeagueId);}
function leagueDocuments(){return documents.filter(d=>d.league_id===currentLeagueId);} function leagueRoster(){return rosterPlayers.filter(r=>r.league_id===currentLeagueId);} function leagueMarket(){return marketTransactions.filter(r=>r.league_id===currentLeagueId);}

function showAuth(){ $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); $("logoutBtn").classList.add("hidden"); $("userBadge").classList.add("hidden"); }
function showApp(){ $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden"); $("userBadge").classList.remove("hidden"); }
function setTab(name){
  qsa(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  qsa(".tab").forEach(t=>t.classList.toggle("active",t.id===`tab-${name}`));
  $("workspaceTitle").textContent = ({dashboard:"Dashboard",teams:"Squadre",auctions:"Aste",calendar:"Calendario",standings:"Classifica",statistics:"Statistiche",rosters:"Rose",market:"Mercato",documents:"Documenti",members:"Utenti",settings:"Impostazioni"})[name];
}

function seedDemo(){
  const uid="demo-user";
  currentUser={id:uid,email:"giorgio@demo.magyc"};
  const leagueId="demo-league";
  leagues=[{id:leagueId,name:"Campionato Magyc 2026",invite_code:"MAGYC-DEMO2026",starting_credits:500,max_players:25,win_points:3,status:"active",owner_id:uid}];
  memberships=[{league_id:leagueId,user_id:uid,role:"owner"}];
  teams=[
    {id:"t1",league_id:leagueId,name:"Milan",coach_name:"Giorgio",coach_user_id:uid,credits:420},
    {id:"t2",league_id:leagueId,name:"Germania",coach_name:"Elia",coach_user_id:null,credits:455},
    {id:"t3",league_id:leagueId,name:"Turchia",coach_name:"Gigi",coach_user_id:null,credits:390}
  ];
  auctions=[
    {id:"a1",league_id:leagueId,player_name:"Giorgio Scalvini",minimum_bid:10,deadline:new Date(Date.now()+86400000).toISOString(),status:"open",my_bid:null},
    {id:"a2",league_id:leagueId,player_name:"Carlos Baleba",minimum_bid:15,deadline:new Date(Date.now()-86400000).toISOString(),status:"closed",winner_team_name:"Milan",winning_bid:35}
  ];
  matches=[
    {id:"m1",league_id:leagueId,home_team_id:"t1",away_team_id:"t2",scheduled_at:new Date(Date.now()+172800000).toISOString(),home_score:null,away_score:null,status:"scheduled"}
  ];
  documents=[
    {id:"d1",league_id:leagueId,title:"Regolamento stagione 2026",category:"Regolamento",url:"https://example.com"}
  ];
  marketTransactions=[
    {id:"mx1",league_id:leagueId,transaction_type:"purchase",player_name:"Carlos Baleba",player_role:"MED",from_team_id:null,to_team_id:"t1",credits:35,notes:"Acquisto iniziale",created_at:nowIso()}
  ];
  auctions=[
    {id:"a1",league_id:leagueId,player_name:"Giorgio Scalvini",player_role:"DC",minimum_bid:10,status:"open",deadline:new Date(Date.now()+86400000).toISOString(),notes:"Asta di prova",created_at:nowIso()}
  ];
  auctionBids=[];
  rosterPlayers=[
    {id:"r1",league_id:leagueId,team_id:"t1",player_name:"Carlos Baleba",player_role:"MED",purchase_price:35},
    {id:"r2",league_id:leagueId,team_id:"t1",player_name:"Giorgio Scalvini",player_role:"DC",purchase_price:42},
    {id:"r3",league_id:leagueId,team_id:"t2",player_name:"Jamal Musiala",player_role:"TRQ",purchase_price:55}
  ];
  leagueUsers=[
    {league_id:leagueId,email:"giorgio@demo.magyc",role:"owner"},
    {league_id:leagueId,email:"elia@demo.magyc",role:"coach"}
  ];
  activities=[
    {id:"x1",league_id:leagueId,text:"Aperta l’asta per Giorgio Scalvini",created_at:nowIso()},
    {id:"x2",league_id:leagueId,text:"Carlos Baleba assegnato al Milan per 35 crediti",created_at:new Date(Date.now()-3600000).toISOString()}
  ];
  currentLeagueId=leagueId;
}


async function verifyConnection(){
  const status = $("connectionStatus");
  if(!configured){
    status.textContent = "Configurazione Supabase non valida.";
    status.className = "message error";
    return false;
  }
  try{
    const { error } = await client.auth.getSession();
    if(error) throw error;
    status.textContent = "Collegamento Supabase attivo.";
    status.className = "message success";
    return true;
  }catch(err){
    status.textContent = "Impossibile collegarsi a Supabase: " + (err.message || err);
    status.className = "message error";
    return false;
  }
}

async function signIn(email){
  if(!email || !email.includes("@")){ toast("Inserisci un indirizzo email valido."); return; }
  const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.href}});
  if(error) throw error;
}
async function loadRemote(){
  const {data:memberRows,error}=await client.from("league_members").select("league_id,role,leagues(*)").eq("user_id",currentUser.id);
  if(error) throw error;
  memberships=(memberRows||[]).map(r=>({league_id:r.league_id,user_id:currentUser.id,role:r.role}));
  leagues=(memberRows||[]).map(r=>r.leagues).filter(Boolean);
  if(!currentLeagueId || !leagues.some(l=>l.id===currentLeagueId)) currentLeagueId=leagues[0]?.id||null;
  const ids=leagues.map(l=>l.id);
  teams=[]; auctions=[]; auctionBids=[]; matches=[]; documents=[]; activities=[]; rosterPlayers=[]; leagueUsers=[]; marketTransactions=[];
  if(ids.length){
    const [t,a,b,m,d,act,r,u,mx]=await Promise.all([
      client.from("teams").select("*").in("league_id",ids).order("name"),
      client.from("auctions").select("*").in("league_id",ids).order("deadline",{ascending:false}),
      client.from("auction_bids").select("*").in("league_id",ids),
      client.from("matches").select("*").in("league_id",ids).order("matchday").order("match_date"),
      client.from("documents").select("*").in("league_id",ids).order("created_at",{ascending:false}),
      client.from("activity_log").select("*").in("league_id",ids).order("created_at",{ascending:false}).limit(50),
      client.from("roster_players").select("*").in("league_id",ids).order("player_name"),
      client.from("league_member_view").select("*").in("league_id",ids),
      client.from("market_transactions").select("*").in("league_id",ids).order("created_at",{ascending:false})
    ]);
    teams=t.data||[]; auctions=a.data||[]; auctionBids=b.data||[]; matches=m.data||[]; documents=d.data||[]; activities=act.data||[]; rosterPlayers=r.data||[]; leagueUsers=u.data||[]; marketTransactions=mx.data||[];
  }
}

async function reload(){
  if(!demoMode) await loadRemote();
  render();
}


function isPlayed(m){
  return m.home_score !== null && m.home_score !== undefined &&
         m.away_score !== null && m.away_score !== undefined;
}

function calculateStandings(){
  const rows = leagueTeams().map(t=>({
    team_id:t.id, name:t.name, played:0, won:0, drawn:0, lost:0,
    gf:0, ga:0, gd:0, points:0
  }));
  const byId = Object.fromEntries(rows.map(r=>[r.team_id,r]));

  leagueMatches().filter(isPlayed).forEach(m=>{
    const h=byId[m.home_team_id], a=byId[m.away_team_id];
    if(!h||!a)return;
    const hs=Number(m.home_score), as=Number(m.away_score);
    h.played++; a.played++;
    h.gf+=hs; h.ga+=as; a.gf+=as; a.ga+=hs;
    if(hs>as){ h.won++; a.lost++; h.points+=3; }
    else if(hs<as){ a.won++; h.lost++; a.points+=3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  });

  rows.forEach(r=>r.gd=r.gf-r.ga);
  return rows.sort((a,b)=>
    b.points-a.points ||
    b.gd-a.gd ||
    b.gf-a.gf ||
    a.name.localeCompare(b.name,"it")
  );
}

function roundRobin(teamIds){
  const ids=[...teamIds];
  if(ids.length%2===1)ids.push(null);
  const n=ids.length, rounds=[];
  let arr=[...ids];
  for(let r=0;r<n-1;r++){
    const pairs=[];
    for(let i=0;i<n/2;i++){
      const a=arr[i], b=arr[n-1-i];
      if(a&&b)pairs.push(r%2===0?[a,b]:[b,a]);
    }
    rounds.push(pairs);
    arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
  }
  return rounds;
}

function render(){
  $("userBadge").textContent = demoMode ? "Modalità demo" : currentUser?.email || "";
  const selector=$("leagueSelector");
  selector.innerHTML = leagues.length ? leagues.map(l=>`<option value="${l.id}" ${l.id===currentLeagueId?"selected":""}>${esc(l.name)}</option>`).join("") : '<option value="">Nessun campionato</option>';
  selector.disabled=!leagues.length;

  const league=currentLeague(), role=currentRole(), admin=isAdmin(), mine=currentTeam();
  qsa(".admin-only").forEach(el=>el.classList.toggle("hidden",!admin));
  $("roleDescription").innerHTML = role ? `Sei <strong class="role-${esc(role)}">${esc(roleLabel(role))}</strong> nel campionato selezionato.` : "Nessun ruolo.";
  if(league){
    $("settingsName").value=league.name||"";
    $("settingsCredits").value=league.starting_credits||500;
    $("settingsMaxPlayers").value=league.max_players||25;
    $("settingsWinPoints").value=league.win_points||3;
  }

  $("teamList").innerHTML = leagueTeams().map(t=>`
    <article class="card"><div class="section-head"><h3>${esc(t.name)}</h3><span class="pill">${t.credits} crediti</span></div>
    <div class="meta">Allenatore: ${esc(t.coach_name||"Da assegnare")}</div>
    <div class="meta">Giocatori in rosa: ${t.player_count||0}/${league?.max_players||25}</div></article>`).join("") || '<div class="empty-state">Nessuna squadra.</div>';
  const auctionFilterValue=$("auctionFilter")?.value||"all";
  const visibleAuctions=leagueAuctions().filter(a=>{
    const open=a.status==="open" && new Date(a.deadline).getTime()>Date.now();
    return auctionFilterValue==="all" || (auctionFilterValue==="open"&&open) || (auctionFilterValue==="closed"&&!open);
  });
  $("auctionList").innerHTML=visibleAuctions.map(a=>{
    const open=a.status==="open" && new Date(a.deadline).getTime()>Date.now();
    const myBid=auctionBids.find(b=>b.auction_id===a.id && (
      isAdmin() || teams.some(t=>t.id===b.team_id&&t.coach_user_id===currentUser?.id)
    ));
    const winner=teams.find(t=>t.id===a.winner_team_id);
    return `<article class="card auction-card">
      <div class="section-head">
        <div><div class="meta">${esc(a.player_role||"Ruolo non indicato")}</div><h3>${esc(a.player_name)}</h3></div>
        <span class="pill ${open?"open":"closed"}">${open?"APERTA":"CHIUSA"}</span>
      </div>
      <div class="meta">Minimo: <strong>${Number(a.minimum_bid||1)} crediti</strong> · Scadenza: ${new Date(a.deadline).toLocaleString("it-IT")}</div>
      ${a.notes?`<p>${esc(a.notes)}</p>`:""}
      ${open&&myBid?`<div class="secret-bid">Offerta registrata: <strong>${Number(myBid.amount)} crediti</strong></div>`:""}
      ${!open&&winner?`<div class="winner-box">Vincitore: <strong>${esc(winner.name)}</strong> · ${Number(a.winning_bid||0)} crediti</div>`:""}
      <div class="button-row">
        ${open?`<button class="bid-btn" data-id="${a.id}">${myBid?"Modifica offerta":"Invia offerta"}</button>`:""}
        ${!open?`<button class="result-btn secondary" data-id="${a.id}">Mostra esito</button>`:""}
        ${admin&&open?`<button class="close-auction-btn secondary" data-id="${a.id}">Chiudi asta</button>`:""}
      </div>
    </article>`;
  }).join("")||'<div class="empty-state">Nessuna asta disponibile.</div>';
  const standings = calculateStandings();


  const lMatches=leagueMatches();
  $("matchTotal").textContent=lMatches.length;
  $("matchPlayed").textContent=lMatches.filter(isPlayed).length;
  $("matchPending").textContent=lMatches.filter(m=>!isPlayed(m)).length;

  const matchdays=[...new Set(lMatches.map(m=>Number(m.matchday||1)))].sort((a,b)=>a-b);
  const selectedDay=$("matchdayFilter").value||"all";
  $("matchdayFilter").innerHTML='<option value="all">Tutte le giornate</option>'+
    matchdays.map(d=>`<option value="${d}" ${String(d)===String(selectedDay)?"selected":""}>Giornata ${d}</option>`).join("");
  const selectedStatus=$("matchStatusFilter").value||"all";
  const filteredMatches=lMatches.filter(m=>
    (selectedDay==="all"||String(m.matchday||1)===String(selectedDay)) &&
    (selectedStatus==="all"||(selectedStatus==="played"&&isPlayed(m))||(selectedStatus==="pending"&&!isPlayed(m)))
  );
  const groupedMatches={};
  filteredMatches.forEach(m=>(groupedMatches[m.matchday||1]??=[]).push(m));
  $("calendarList").innerHTML=Object.keys(groupedMatches).sort((a,b)=>Number(a)-Number(b)).map(day=>`
    <section class="matchday-group">
      <h3 class="matchday-title">Giornata ${day}</h3>
      <div class="cards">${groupedMatches[day].map(m=>{
        const home=teams.find(t=>t.id===m.home_team_id)?.name||"Casa";
        const away=teams.find(t=>t.id===m.away_team_id)?.name||"Ospite";
        const date=m.match_date||m.scheduled_at;
        return `<article class="card">
          <div class="match-card">
            <strong class="match-team home">${esc(home)}</strong>
            <div class="match-score">${isPlayed(m)?`${m.home_score} – ${m.away_score}`:"vs"}</div>
            <strong class="match-team away">${esc(away)}</strong>
          </div>
          <div class="match-meta meta">${date?new Date(date).toLocaleString("it-IT"):"Data da definire"}${m.notes?` · ${esc(m.notes)}`:""}</div>
          ${admin?`<div class="match-actions"><button class="edit-match-btn secondary" data-id="${m.id}">${isPlayed(m)?"Modifica risultato":"Inserisci risultato"}</button></div>`:""}
        </article>`;
      }).join("")}</div>
    </section>`).join("")||'<div class="empty-state">Nessuna partita presente.</div>';

  $("standingsBody").innerHTML=standings.map((r,i)=>`
    <tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.won}</td>
    <td>${r.drawn}</td><td>${r.lost}</td><td>${r.gf}</td><td>${r.ga}</td>
    <td>${r.gd>0?"+":""}${r.gd}</td><td><strong>${r.points}</strong></td></tr>`
  ).join("")||'<tr><td colspan="10">Nessun dato disponibile.</td></tr>';

  const marketRows=leagueMarket();
  $("marketMoveCount").textContent=marketRows.length;
  $("marketCreditTotal").textContent=marketRows.reduce((s,m)=>s+Number(m.credits||0),0);
  $("marketRosterCount").textContent=leagueRoster().length;
  $("marketHistory").innerHTML=marketRows.map(m=>{
    const from=teams.find(t=>t.id===m.from_team_id)?.name;
    const to=teams.find(t=>t.id===m.to_team_id)?.name;
    return `<article class="card">
      <div class="section-head"><h3>${esc(m.player_name)}</h3><span class="pill">${moveLabels[m.transaction_type]||esc(m.transaction_type)}</span></div>
      <div class="meta">${esc(m.player_role||"")} · ${Number(m.credits||0)} crediti</div>
      <p>${from?`Da <strong>${esc(from)}</strong>`:""}${from&&to?" a ":""}${to?`<strong>${esc(to)}</strong>`:""}</p>
      ${m.notes?`<p class="meta">${esc(m.notes)}</p>`:""}
    </article>`;
  }).join("")||'<div class="empty-state">Nessuna operazione di mercato.</div>';

  const teamOptions='<option value="">Seleziona squadra</option>'+opts;
  $("marketFromTeam").innerHTML=teamOptions;
  $("marketToTeam").innerHTML=teamOptions;
  $("marketRosterPlayer").innerHTML='<option value="">Seleziona giocatore</option>'+
    leagueRoster().map(r=>`<option value="${r.id}">${esc(r.player_name)} · ${esc(teams.find(t=>t.id===r.team_id)?.name||"")}</option>`).join("");

  $("rosterList").innerHTML = leagueTeams().map(t=>{
    const players=leagueRoster().filter(r=>r.team_id===t.id);
    return `<article class="card"><div class="section-head"><h3>${esc(t.name)}</h3><span class="pill">${players.length}/${league?.max_players||25}</span></div>${players.map(p=>`<div class="roster-player"><span>${esc(p.player_name)} <small class="meta">${esc(p.player_role||"")}</small></span><strong>${p.purchase_price} cr.</strong></div>`).join("")||'<div class="meta">Rosa vuota</div>'}</article>`;
  }).join("") || '<div class="empty-state">Nessuna squadra.</div>';

  $("documentList").innerHTML = leagueDocuments().map(d=>`
    <article class="card"><span class="pill">${esc(d.category)}</span><h3>${esc(d.title)}</h3><a href="${esc(d.url)}" target="_blank" rel="noopener"><button class="secondary">Apri documento</button></a></article>`).join("") || '<div class="empty-state">Nessun documento.</div>';

  const opts=leagueTeams().map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("");
  $("homeTeam").innerHTML=opts; $("awayTeam").innerHTML=opts;
  $("rosterTeam").innerHTML=opts;

  const roleLabel={owner:"Proprietario",admin:"Amministratore",coach:"Allenatore",viewer:"Spettatore"};
  $("memberList").innerHTML = leagueUsers.filter(u=>u.league_id===currentLeagueId).map(u=>`
    <article class="card">
      <div class="section-head">
        <div><div class="meta">${esc(u.email||"Utente")}</div><h3>${roleLabel[u.role]||u.role}</h3></div>
        <span class="pill">${roleLabel[u.role]||u.role}</span>
      </div>
    </article>`).join("") || '<div class="empty-state">Nessun utente trovato.</div>';


  if($("dashboardLeagueName")){
    const activeLeague=currentLeague();
    const lMatches=leagueMatches();
    const standings=calculateStandings();
    const now=Date.now();
    $("dashboardLeagueName").textContent=activeLeague?.name||"Gestionale Magyc";
    $("dashboardLeagueMeta").textContent=activeLeague
      ? `${leagueTeams().length} squadre · ${leagueRoster().length} giocatori · stagione ${activeLeague.season||"corrente"}`
      : "Seleziona un campionato per iniziare.";
    $("dashboardTeams").textContent=leagueTeams().length;
    $("dashboardPlayers").textContent=leagueRoster().length;
    $("dashboardAuctions").textContent=leagueAuctions().filter(a=>a.status==="open"&&new Date(a.deadline).getTime()>now).length;
    $("dashboardMatches").textContent=lMatches.filter(isPlayed).length;

    const upcoming=lMatches.filter(m=>!isPlayed(m))
      .sort((a,b)=>new Date(a.match_date||a.scheduled_at||8640000000000000)-new Date(b.match_date||b.scheduled_at||8640000000000000))
      .slice(0,4);
    $("upcomingMatches").innerHTML=upcoming.length?upcoming.map(m=>{
      const h=teams.find(t=>t.id===m.home_team_id)?.name||"Casa";
      const a=teams.find(t=>t.id===m.away_team_id)?.name||"Ospite";
      const date=m.match_date||m.scheduled_at;
      return `<div class="mini-row"><div><strong>${esc(h)} – ${esc(a)}</strong><div class="meta">Giornata ${m.matchday||1}${date?` · ${new Date(date).toLocaleDateString("it-IT")}`:""}</div></div><span>›</span></div>`;
    }).join(""):'<div class="empty-state">Nessuna partita programmata.</div>';

    $("dashboardStandings").innerHTML=standings.slice(0,5).map((r,i)=>
      `<div class="rank-row"><strong>${i+1}</strong><span>${esc(r.name)}</span><strong>${r.points} pt</strong></div>`
    ).join("")||'<div class="empty-state">Classifica non disponibile.</div>';

    $("dashboardActivities").innerHTML=activities.filter(a=>a.league_id===currentLeagueId).slice(0,6).map(a=>
      `<div class="mini-row"><div>${esc(a.text||"Attività")}</div><span class="meta">${a.created_at?new Date(a.created_at).toLocaleDateString("it-IT"):""}</span></div>`
    ).join("")||'<div class="empty-state">Nessuna attività recente.</div>';

    $("dashboardCredits").innerHTML=leagueTeams().slice().sort((a,b)=>Number(b.credits||0)-Number(a.credits||0)).slice(0,6).map(t=>
      `<div class="mini-row"><span>${esc(t.name)}</span><strong>${Number(t.credits||0)} cr.</strong></div>`
    ).join("")||'<div class="empty-state">Nessuna squadra.</div>';

    const played=lMatches.filter(isPlayed);
    const totalGoals=played.reduce((s,m)=>s+Number(m.home_score)+Number(m.away_score),0);
    $("statsGoals").textContent=totalGoals;
    $("statsGoalAverage").textContent=played.length?(totalGoals/played.length).toFixed(2):"0";
    $("statsHomeWins").textContent=played.filter(m=>Number(m.home_score)>Number(m.away_score)).length;
    $("statsDraws").textContent=played.filter(m=>Number(m.home_score)===Number(m.away_score)).length;

    const bestAtk=standings.slice().sort((a,b)=>b.gf-a.gf||b.points-a.points)[0];
    const bestDef=standings.slice().sort((a,b)=>a.ga-b.ga||b.points-a.points)[0];
    $("bestAttack").innerHTML=bestAtk?`<div class="stat-feature">${esc(bestAtk.name)}</div><div class="stat-sub">${bestAtk.gf} gol fatti</div>`:'<div class="empty-state">Dati insufficienti.</div>';
    $("bestDefense").innerHTML=bestDef?`<div class="stat-feature">${esc(bestDef.name)}</div><div class="stat-sub">${bestDef.ga} gol subiti</div>`:'<div class="empty-state">Dati insufficienti.</div>';

    const highMatch=played.slice().sort((a,b)=>(Number(b.home_score)+Number(b.away_score))-(Number(a.home_score)+Number(a.away_score)))[0];
    if(highMatch){
      const h=teams.find(t=>t.id===highMatch.home_team_id)?.name||"Casa";
      const a=teams.find(t=>t.id===highMatch.away_team_id)?.name||"Ospite";
      $("highestScoringMatch").innerHTML=`<div class="stat-feature">${esc(h)} ${highMatch.home_score}–${highMatch.away_score} ${esc(a)}</div><div class="stat-sub">${Number(highMatch.home_score)+Number(highMatch.away_score)} gol totali</div>`;
    }else $("highestScoringMatch").innerHTML='<div class="empty-state">Nessuna partita giocata.</div>';

    const totalCredits=leagueTeams().reduce((s,t)=>s+Number(t.credits||0),0);
    const movedCredits=leagueMarket().reduce((s,m)=>s+Number(m.credits||0),0);
    $("leagueEconomy").innerHTML=`<div class="stat-feature">${totalCredits} cr.</div><div class="stat-sub">Disponibili · ${movedCredits} movimentati</div>`;
  }

  bindDynamic();
}
function roleLabel(r){return ({owner:"Proprietario",admin:"Amministratore",coach:"Allenatore",viewer:"Spettatore"})[r]||"Utente";}

function bindDynamic(){
  document.querySelectorAll(".edit-match-btn").forEach(btn=>btn.onclick=()=>openMatchDialog(btn.dataset.id));
  document.querySelectorAll(".bid-btn").forEach(btn=>btn.onclick=()=>openBidDialog(btn.dataset.id));
  document.querySelectorAll(".result-btn").forEach(btn=>btn.onclick=()=>showAuctionResult(btn.dataset.id));
  document.querySelectorAll(".close-auction-btn").forEach(btn=>btn.onclick=()=>closeAuction(btn.dataset.id));
}

$("loginForm").onsubmit=async e=>{
  e.preventDefault(); const email=$("emailInput").value.trim(); $("authMsg").textContent="Invio in corso…";
  if(!configured){$("authMsg").textContent="Il progetto non è ancora collegato a Supabase. Usa intanto la demo.";return;}
  try{await signIn(email);$("authMsg").textContent="Controlla la tua email e apri il link ricevuto.";}catch(err){$("authMsg").textContent=err.message;}
};
$("logoutBtn").onclick=async()=>{if(!demoMode&&client)await client.auth.signOut();demoMode=false;currentUser=null;showAuth();};
$("brandBtn").onclick=()=>setTab("dashboard");
qsa(".tabs button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$("leagueSelector").onchange=e=>{currentLeagueId=e.target.value||null;render();};

$("newLeagueBtn").onclick=()=>$("leagueDialog").showModal();
$("newTeamBtn").onclick=()=>$("teamDialog").showModal();
$("newAuctionBtn").onclick=()=>{$("auctionDeadline").value=new Date(Date.now()+86400000).toISOString().slice(0,16);$("auctionDialog").showModal();};
$("newDocumentBtn").onclick=()=>$("documentDialog").showModal();
$("newMarketMoveBtn").onclick=()=>$("marketDialog").showModal();
$("newRosterPlayerBtn").onclick=()=>$("rosterDialog").showModal();
$("newMemberBtn").onclick=()=>$("memberDialog").showModal();

$("leagueForm").onsubmit=async e=>{
  e.preventDefault(); const payload={name:$("leagueName").value.trim(),starting_credits:Number($("startingCredits").value),max_players:Number($("maxPlayers").value)};
  if(demoMode){const lid=id();leagues.push({id:lid,invite_code:makeCode(),owner_id:currentUser.id,win_points:3,status:"active",...payload});memberships.push({league_id:lid,user_id:currentUser.id,role:"owner"});currentLeagueId=lid;$("leagueDialog").close();toast("Campionato demo creato.");render();return;}
  const {data,error}=await client.rpc("create_league",{p_name:payload.name,p_starting_credits:payload.starting_credits,p_max_players:payload.max_players});
  if(error)return toast(error.message);currentLeagueId=data;$("leagueDialog").close();await reload();toast("Campionato creato.");
};
$("teamForm").onsubmit=async e=>{
  e.preventDefault(); const payload={league_id:currentLeagueId,name:$("teamName").value.trim(),coach_name:$("coachName").value.trim()||null,credits:currentLeague()?.starting_credits||500};
  if(demoMode){teams.push({id:id(),...payload,coach_user_id:null,player_count:0});$("teamDialog").close();toast("Squadra creata.");render();return;}
  const {error}=await client.from("teams").insert(payload);if(error)return toast(error.message);$("teamDialog").close();await reload();toast("Squadra creata.");
};
$("documentForm").onsubmit=async e=>{
  e.preventDefault(); const payload={league_id:currentLeagueId,title:$("documentTitle").value.trim(),url:$("documentUrl").value.trim(),category:$("documentCategory").value,created_by:currentUser.id};
  if(demoMode){documents.unshift({id:id(),...payload});$("documentDialog").close();render();return;}
  const {error}=await client.from("documents").insert(payload);if(error)return toast(error.message);$("documentDialog").close();await reload();
};
$("leagueSettingsForm").onsubmit=async e=>{
  e.preventDefault(); const league=currentLeague();if(!league)return;
  const changes={name:$("settingsName").value.trim(),starting_credits:Number($("settingsCredits").value),max_players:Number($("settingsMaxPlayers").value),win_points:Number($("settingsWinPoints").value)};
  if(demoMode){Object.assign(league,changes);toast("Impostazioni salvate.");render();return;}
  const {error}=await client.from("leagues").update(changes).eq("id",league.id);if(error)return toast(error.message);await reload();toast("Impostazioni salvate.");
};

(async function init(){
  if(!configured){showAuth();$("authMsg").textContent="Puoi già esplorare la modalità demo.";return;}
  const {data}=await client.auth.getSession();currentUser=data.session?.user||null;
  if(currentUser){showApp();await reload();}else showAuth();
  client.auth.onAuthStateChange(async(_event,session)=>{currentUser=session?.user||null;if(currentUser){showApp();await reload();}else showAuth();});
})();



$("rosterForm").onsubmit=async e=>{
  e.preventDefault();
  const payload={league_id:currentLeagueId,team_id:$("rosterTeam").value,player_name:$("rosterPlayerName").value.trim(),player_role:$("rosterRole").value.trim()||null,purchase_price:Number($("rosterPrice").value),acquired_via:"manual"};
  if(demoMode){rosterPlayers.push({id:id(),...payload});const t=teams.find(t=>t.id===payload.team_id);if(t)t.player_count=(t.player_count||0)+1;$("rosterDialog").close();render();return;}
  const {error}=await client.rpc("add_roster_player",{p_league_id:payload.league_id,p_team_id:payload.team_id,p_player_name:payload.player_name,p_player_role:payload.player_role,p_purchase_price:payload.purchase_price});
  if(error)return toast(error.message);$("rosterDialog").close();await reload();toast("Giocatore aggiunto.");
};

$("memberForm").onsubmit=async e=>{
  e.preventDefault();
  if(demoMode){leagueUsers.push({league_id:currentLeagueId,email:$("memberEmail").value.trim(),role:$("memberRole").value});$("memberDialog").close();toast("Utente demo aggiunto.");return;}
  const {error}=await client.rpc("add_member_by_email",{p_league_id:currentLeagueId,p_email:$("memberEmail").value.trim(),p_role:$("memberRole").value});
  if(error)return toast(error.message);$("memberDialog").close();await reload();toast("Utente aggiunto.");
};


window.addEventListener("DOMContentLoaded", async () => {
  await verifyConnection();
});

$("newMemberBtn2").onclick=()=>$("memberDialog").showModal();


$("marketType").onchange=()=>{
  const type=$("marketType").value;
  const needsExisting=["sale","release","transfer"].includes(type);
  $("marketRosterPlayer").disabled=!needsExisting;
  $("marketNewPlayerName").disabled=needsExisting;
};

$("marketRosterPlayer").onchange=()=>{
  const r=rosterPlayers.find(x=>x.id===$("marketRosterPlayer").value);
  if(r){
    $("marketFromTeam").value=r.team_id||"";
    $("marketPlayerRole").value=r.player_role||"";
    $("marketNewPlayerName").value=r.player_name||"";
  }
};

$("marketForm").onsubmit=async e=>{
  e.preventDefault();
  const type=$("marketType").value;
  const roster=rosterPlayers.find(x=>x.id===$("marketRosterPlayer").value);
  const payload={
    league_id:currentLeagueId,
    transaction_type:type,
    roster_player_id:roster?.id||null,
    player_name:(roster?.player_name||$("marketNewPlayerName").value).trim(),
    player_role:(roster?.player_role||$("marketPlayerRole").value).trim()||null,
    from_team_id:$("marketFromTeam").value||null,
    to_team_id:$("marketToTeam").value||null,
    credits:Number($("marketCredits").value||0),
    notes:$("marketNotes").value.trim()||null
  };
  if(!payload.player_name)return toast("Indica il giocatore.");

  if(demoMode){
    marketTransactions.unshift({id:id(),...payload,created_at:nowIso()});
    if(type==="purchase"){
      const t=teams.find(t=>t.id===payload.to_team_id);
      if(t){t.credits-=payload.credits;t.player_count=(t.player_count||0)+1;}
      rosterPlayers.push({id:id(),league_id:currentLeagueId,team_id:payload.to_team_id,player_name:payload.player_name,player_role:payload.player_role,purchase_price:payload.credits,acquired_via:"market"});
    }else if(type==="sale"||type==="release"){
      const t=teams.find(t=>t.id===payload.from_team_id);
      if(t){t.credits+=payload.credits;t.player_count=Math.max(0,(t.player_count||0)-1);}
      rosterPlayers=rosterPlayers.filter(r=>r.id!==payload.roster_player_id);
    }else if(type==="transfer"){
      const from=teams.find(t=>t.id===payload.from_team_id),to=teams.find(t=>t.id===payload.to_team_id);
      if(from){from.credits+=payload.credits;from.player_count=Math.max(0,(from.player_count||0)-1);}
      if(to){to.credits-=payload.credits;to.player_count=(to.player_count||0)+1;}
      const rp=rosterPlayers.find(r=>r.id===payload.roster_player_id);if(rp)rp.team_id=payload.to_team_id;
    }
    $("marketDialog").close();render();return;
  }

  const {error}=await client.rpc("register_market_transaction",{
    p_league_id:payload.league_id,
    p_transaction_type:payload.transaction_type,
    p_roster_player_id:payload.roster_player_id,
    p_player_name:payload.player_name,
    p_player_role:payload.player_role,
    p_from_team_id:payload.from_team_id,
    p_to_team_id:payload.to_team_id,
    p_credits:payload.credits,
    p_notes:payload.notes
  });
  if(error)return toast(error.message);
  $("marketDialog").close();
  e.target.reset();
  await reload();
  toast("Operazione registrata.");
};



function openBidDialog(auctionId){
  const auction=auctions.find(a=>a.id===auctionId);
  if(!auction)return;
  $("bidAuctionTitle").textContent=`${auction.player_name} · offerta minima ${auction.minimum_bid} crediti`;
  $("bidTeam").innerHTML=teams
    .filter(t=>t.league_id===currentLeagueId&&(isAdmin()||t.coach_user_id===currentUser?.id))
    .map(t=>`<option value="${t.id}">${esc(t.name)} · ${t.credits} cr.</option>`).join("");
  $("bidAmount").min=auction.minimum_bid||1;
  const existing=auctionBids.find(b=>b.auction_id===auctionId&&b.team_id===$("bidTeam").value);
  $("bidAmount").value=existing?.amount||auction.minimum_bid||1;
  $("bidForm").dataset.auctionId=auctionId;
  $("bidDialog").showModal();
}

$("bidTeam").onchange=()=>{
  const auctionId=$("bidForm").dataset.auctionId;
  const existing=auctionBids.find(b=>b.auction_id===auctionId&&b.team_id===$("bidTeam").value);
  if(existing)$("bidAmount").value=existing.amount;
};

$("bidForm").onsubmit=async e=>{
  e.preventDefault();
  const auctionId=e.target.dataset.auctionId;
  const payload={auction_id:auctionId,team_id:$("bidTeam").value,amount:Number($("bidAmount").value)};
  const auction=auctions.find(a=>a.id===auctionId);
  const team=teams.find(t=>t.id===payload.team_id);
  if(!auction||!team)return;
  if(payload.amount<Number(auction.minimum_bid||0))return toast("Offerta inferiore al minimo.");
  if(payload.amount>Number(team.credits||0))return toast("Crediti insufficienti.");

  if(demoMode){
    const old=auctionBids.find(b=>b.auction_id===auctionId&&b.team_id===payload.team_id);
    if(old)old.amount=payload.amount;
    else auctionBids.push({id:id(),league_id:currentLeagueId,...payload,created_at:nowIso()});
    $("bidDialog").close();render();toast("Offerta registrata in modo riservato.");return;
  }

  const {error}=await client.rpc("submit_sealed_bid",{
    p_auction_id:payload.auction_id,
    p_team_id:payload.team_id,
    p_amount:payload.amount
  });
  if(error)return toast(error.message);
  $("bidDialog").close();
  await reload();
  toast("Offerta registrata in modo riservato.");
};

$("auctionForm").onsubmit=async e=>{
  e.preventDefault();
  const payload={
    league_id:currentLeagueId,
    player_name:$("auctionPlayer").value.trim(),
    player_role:$("auctionRole").value.trim()||null,
    minimum_bid:Number($("auctionMinBid").value||0),
    deadline:new Date($("auctionDeadline").value).toISOString(),
    notes:$("auctionNotes").value.trim()||null
  };
  if(new Date(payload.deadline).getTime()<=Date.now())return toast("La scadenza deve essere futura.");

  if(demoMode){
    auctions.unshift({id:id(),...payload,status:"open",created_at:nowIso()});
    $("auctionDialog").close();e.target.reset();render();return;
  }
  const {error}=await client.from("auctions").insert(payload);
  if(error)return toast(error.message);
  $("auctionDialog").close();e.target.reset();await reload();toast("Asta creata.");
};

async function closeAuction(auctionId){
  if(!confirm("Chiudere l'asta e assegnare il giocatore al miglior offerente?"))return;
  if(demoMode){
    const bids=auctionBids.filter(b=>b.auction_id===auctionId).sort((a,b)=>b.amount-a.amount||new Date(a.created_at)-new Date(b.created_at));
    const a=auctions.find(x=>x.id===auctionId);
    if(!a)return;
    a.status="closed";
    if(bids[0]){
      a.winner_team_id=bids[0].team_id;
      a.winning_bid=bids[0].amount;
      const t=teams.find(x=>x.id===bids[0].team_id);
      if(t){t.credits-=bids[0].amount;t.player_count=(t.player_count||0)+1;}
      rosterPlayers.push({id:id(),league_id:currentLeagueId,team_id:bids[0].team_id,player_name:a.player_name,player_role:a.player_role,purchase_price:bids[0].amount,acquired_via:"auction"});
    }
    render();return;
  }
  const {error}=await client.rpc("close_sealed_auction",{p_auction_id:auctionId});
  if(error)return toast(error.message);
  await reload();toast("Asta chiusa.");
}

function showAuctionResult(auctionId){
  const a=auctions.find(x=>x.id===auctionId);
  const winner=teams.find(t=>t.id===a?.winner_team_id);
  $("auctionResultBody").innerHTML=a?`
    <article class="card">
      <div class="meta">${esc(a.player_role||"")}</div>
      <h3>${esc(a.player_name)}</h3>
      ${winner?`<p>Vincitore: <strong>${esc(winner.name)}</strong></p><p>Offerta vincente: <strong>${Number(a.winning_bid||0)} crediti</strong></p>`:"<p>Nessuna offerta valida.</p>"}
    </article>`:"";
  $("auctionResultDialog").showModal();
}


$("matchdayFilter").onchange=render;
$("matchStatusFilter").onchange=render;

$("newMatchBtn").onclick=()=>{
  $("matchForm").reset();
  $("editingMatchId").value="";
  $("matchday").value=(Math.max(0,...leagueMatches().map(m=>Number(m.matchday||0)))+1)||1;
  $("matchDialog").showModal();
};

$("generateCalendarBtn").onclick=()=>{
  if(leagueMatches().length)return toast("Esiste già un calendario. Elimina prima le partite esistenti.");
  $("calendarStartDate").value=new Date().toISOString().slice(0,10);
  $("calendarGeneratorDialog").showModal();
};

function openMatchDialog(matchId){
  const m=matches.find(x=>x.id===matchId);
  if(!m)return;
  $("editingMatchId").value=m.id;
  $("matchday").value=m.matchday||1;
  $("matchDate").value=(m.match_date||m.scheduled_at)?new Date(m.match_date||m.scheduled_at).toISOString().slice(0,16):"";
  $("homeTeam").value=m.home_team_id;
  $("awayTeam").value=m.away_team_id;
  $("homeScore").value=isPlayed(m)?m.home_score:"";
  $("awayScore").value=isPlayed(m)?m.away_score:"";
  $("matchNotes").value=m.notes||"";
  $("matchDialog").showModal();
}

$("matchForm").onsubmit=async e=>{
  e.preventDefault();
  const editId=$("editingMatchId").value;
  const hs=$("homeScore").value, as=$("awayScore").value;
  if((hs===""&&as!=="")||(hs!==""&&as===""))return toast("Inserisci entrambi i risultati oppure lasciali vuoti.");
  const payload={
    league_id:currentLeagueId,
    matchday:Number($("matchday").value),
    match_date:$("matchDate").value?new Date($("matchDate").value).toISOString():null,
    scheduled_at:$("matchDate").value?new Date($("matchDate").value).toISOString():null,
    home_team_id:$("homeTeam").value,
    away_team_id:$("awayTeam").value,
    home_score:hs===""?null:Number(hs),
    away_score:as===""?null:Number(as),
    notes:$("matchNotes").value.trim()||null
  };
  if(payload.home_team_id===payload.away_team_id)return toast("Le squadre devono essere diverse.");

  if(demoMode){
    if(editId){
      Object.assign(matches.find(m=>m.id===editId),payload);
    }else{
      matches.push({id:id(),...payload,created_at:nowIso()});
    }
    $("matchDialog").close();render();return;
  }

  const query=editId?client.from("matches").update(payload).eq("id",editId):client.from("matches").insert(payload);
  const {error}=await query;
  if(error)return toast(error.message);
  $("matchDialog").close();await reload();toast(editId?"Partita aggiornata.":"Partita creata.");
};

$("calendarGeneratorForm").onsubmit=async e=>{
  e.preventDefault();
  if(leagueMatches().length)return toast("Esiste già un calendario.");
  const teamIds=leagueTeams().map(t=>t.id);
  if(teamIds.length<2)return toast("Servono almeno due squadre.");
  const rounds=roundRobin(teamIds);
  const doubleRound=$("calendarFormat").value==="double";
  const start=new Date($("calendarStartDate").value+"T15:00:00");
  const interval=Number($("calendarInterval").value);
  let payload=[];

  rounds.forEach((pairs,r)=>{
    const date=new Date(start); date.setDate(date.getDate()+r*interval);
    pairs.forEach(([home,away])=>payload.push({
      league_id:currentLeagueId,matchday:r+1,match_date:date.toISOString(),scheduled_at:date.toISOString(),
      home_team_id:home,away_team_id:away,home_score:null,away_score:null
    }));
  });
  if(doubleRound){
    const offset=rounds.length;
    rounds.forEach((pairs,r)=>{
      const date=new Date(start); date.setDate(date.getDate()+(r+offset)*interval);
      pairs.forEach(([home,away])=>payload.push({
        league_id:currentLeagueId,matchday:r+offset+1,match_date:date.toISOString(),scheduled_at:date.toISOString(),
        home_team_id:away,away_team_id:home,home_score:null,away_score:null
      }));
    });
  }

  if(demoMode){
    matches.push(...payload.map(p=>({id:id(),...p,created_at:nowIso()})));
    $("calendarGeneratorDialog").close();render();return;
  }

  const {error}=await client.from("matches").insert(payload);
  if(error)return toast(error.message);
  $("calendarGeneratorDialog").close();await reload();toast("Calendario generato.");
};

$("exportStandingsBtn").onclick=()=>{
  const rows=calculateStandings();
  const csv=[
    ["Posizione","Squadra","PG","V","N","P","GF","GS","DR","PT"],
    ...rows.map((r,i)=>[i+1,r.name,r.played,r.won,r.drawn,r.lost,r.gf,r.ga,r.gd,r.points])
  ].map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`classifica-${(leagues.find(l=>l.id===currentLeagueId)?.name||"magyc").replace(/\s+/g,"-").toLowerCase()}.csv`;
  a.click();URL.revokeObjectURL(url);
};




async function runDiagnostics(){
  const list=$("diagnosticsList");
  if(!list)return;
  const checks=[];
  checks.push(["Configurazione pubblica",configured,"URL e chiave pubblicabile presenti"]);
  checks.push(["Elementi HTML univoci",document.querySelectorAll("#matchDialog").length===1,"Nessun dialogo duplicato"]);
  checks.push(["Campionato selezionato",Boolean(currentLeagueId),"Campionato attivo"]);
  checks.push(["Ruolo riconosciuto",Boolean(currentRole()),currentRole()?roleLabel(currentRole()):"Nessun ruolo"]);
  if(configured&&client){
    try{
      const {error}=await client.from("leagues").select("id").limit(1);
      checks.push(["Collegamento database",!error,error?error.message:"Supabase raggiungibile"]);
    }catch(err){
      checks.push(["Collegamento database",false,err.message||String(err)]);
    }
  }else{
    checks.push(["Collegamento database",false,"Configurazione Supabase assente o incompleta"]);
  }
  list.innerHTML=checks.map(([name,ok,detail])=>
    `<div class="diagnostic-row ${ok?"ok":"error"}"><strong>${ok?"✓":"!"} ${esc(name)}</strong><span>${esc(detail)}</span></div>`
  ).join("");
}
if($("runDiagnosticsBtn"))$("runDiagnosticsBtn").onclick=runDiagnostics;

if($("quickAuctionBtn"))$("quickAuctionBtn").onclick=()=>{
  setTab("auctions");
  if(isAdmin())$("auctionDialog")?.showModal();
};
if($("quickResultBtn"))$("quickResultBtn").onclick=()=>{
  setTab("calendar");
  const pending=leagueMatches().find(m=>!isPlayed(m));
  if(pending)openMatchDialog(pending.id);
  else toast("Non ci sono partite da completare.");
};
document.querySelectorAll("[data-go-tab]").forEach(btn=>btn.onclick=()=>setTab(btn.dataset.goTab));
document.querySelectorAll("[data-mobile-tab]").forEach(btn=>btn.onclick=()=>setTab(btn.dataset.mobileTab));


let pendingBackupImport=null;

function buildLeagueBackup(){
  const league=currentLeague();
  if(!league)throw new Error("Nessuna lega selezionata");
  return {
    format:"gestionale-magyc-backup",
    version:3,
    exported_at:new Date().toISOString(),
    league:{...league},
    teams:leagueTeams().map(x=>({...x})),
    roster_players:leagueRoster().map(x=>({...x})),
    auctions:leagueAuctions().map(x=>({...x})),
    auction_bids:auctionBids.filter(x=>x.league_id===currentLeagueId).map(x=>({...x})),
    matches:leagueMatches().map(x=>({...x})),
    market_transactions:leagueMarket().map(x=>({...x})),
    documents:leagueDocuments().map(x=>({...x})),
    activities:activities.filter(x=>x.league_id===currentLeagueId).map(x=>({...x}))
  };
}

function downloadJson(data, filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

if($("exportBackupBtn"))$("exportBackupBtn").onclick=()=>{
  try{
    const backup=buildLeagueBackup();
    const slug=(backup.league.name||"lega").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    downloadJson(backup,`gestionale-magyc-${slug}-${new Date().toISOString().slice(0,10)}.json`);
    $("backupStatus").textContent="Backup esportato correttamente.";
  }catch(err){
    toast(err.message||String(err));
  }
};

if($("importBackupBtn"))$("importBackupBtn").onclick=()=>{
  if(!isAdmin())return toast("Solo proprietario o amministratore può importare dati.");
  $("backupFileInput")?.click();
};

if($("backupFileInput"))$("backupFileInput").onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  try{
    const parsed=JSON.parse(await file.text());
    if(parsed.format!=="gestionale-magyc-backup")throw new Error("File backup non riconosciuto.");
    if(!parsed.league||!Array.isArray(parsed.teams))throw new Error("Backup incompleto.");
    pendingBackupImport=parsed;
    $("importBackupSummary").innerHTML=`
      <div class="backup-summary">
        <div><strong>${esc(parsed.league.name||"Lega")}</strong><div class="meta">Lega sorgente</div></div>
        <div><strong>${parsed.teams.length}</strong><div class="meta">Squadre</div></div>
        <div><strong>${(parsed.roster_players||[]).length}</strong><div class="meta">Giocatori</div></div>
        <div><strong>${(parsed.matches||[]).length}</strong><div class="meta">Partite</div></div>
        <div><strong>${(parsed.auctions||[]).length}</strong><div class="meta">Aste</div></div>
        <div><strong>${(parsed.market_transactions||[]).length}</strong><div class="meta">Operazioni mercato</div></div>
      </div>`;
    $("confirmBackupImport").checked=false;
    $("importBackupDialog").showModal();
  }catch(err){
    pendingBackupImport=null;
    toast(err.message||"Impossibile leggere il backup.");
  }finally{
    e.target.value="";
  }
};

function remapId(map, oldId){
  if(oldId===null||oldId===undefined)return null;
  return map.get(oldId)||oldId;
}

$("importBackupForm").onsubmit=async e=>{
  e.preventDefault();
  if(!pendingBackupImport)return toast("Nessun backup caricato.");
  if(!$("confirmBackupImport").checked)return toast("Conferma l'importazione.");

  const b=pendingBackupImport;
  if(demoMode){
    const teamMap=new Map();
    (b.teams||[]).forEach(t=>{
      const newId=id(); teamMap.set(t.id,newId);
      teams.push({...t,id:newId,league_id:currentLeagueId});
    });
    (b.roster_players||[]).forEach(r=>rosterPlayers.push({...r,id:id(),league_id:currentLeagueId,team_id:remapId(teamMap,r.team_id)}));
    (b.matches||[]).forEach(m=>matches.push({...m,id:id(),league_id:currentLeagueId,home_team_id:remapId(teamMap,m.home_team_id),away_team_id:remapId(teamMap,m.away_team_id)}));
    (b.auctions||[]).forEach(a=>auctions.push({...a,id:id(),league_id:currentLeagueId,winner_team_id:remapId(teamMap,a.winner_team_id)}));
    (b.market_transactions||[]).forEach(m=>marketTransactions.push({...m,id:id(),league_id:currentLeagueId,from_team_id:remapId(teamMap,m.from_team_id),to_team_id:remapId(teamMap,m.to_team_id)}));
    pendingBackupImport=null;
    $("importBackupDialog").close();
    render();
    $("backupStatus").textContent="Backup importato in modalità demo.";
    return;
  }

  const {data,error}=await client.rpc("import_league_backup",{
    p_target_league_id:currentLeagueId,
    p_backup:b
  });
  if(error)return toast(error.message);
  pendingBackupImport=null;
  $("importBackupDialog").close();
  await reload();
  $("backupStatus").textContent=`Importazione completata: ${data?.teams||0} squadre, ${data?.players||0} giocatori.`;
  toast("Backup importato.");
};

if($("auctionFilter"))$("auctionFilter").onchange=render;
