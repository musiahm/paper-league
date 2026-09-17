/* Paper League — everything the pages need, computed in the browser.
   Sources (all read live on page load):
     config.json                       players, bankroll, budget, sheet ids, the bet form
     <data_url>/markets.json           Kalshi markets for every slate game (a GitHub Action refreshes it every 5 minutes)
     the sheet's CSV exports           bets placed on the site (Form Responses) + the manual Picks tab
     research/<suffix>.json            optional homework per game
     system_feed.json                  optional: the System's picks/watch rows, pushed by the collector when it runs
   Nothing here is estimated: prices are Kalshi's, results are Kalshi's settlements, times are Google's stamps. */
"use strict";
const PL = (() => {
  // ---- teams -----------------------------------------------------------------------------------
  const NFL = [["ARI","Arizona","Cardinals"],["ATL","Atlanta","Falcons"],["BAL","Baltimore","Ravens"],["BUF","Buffalo","Bills"],["CAR","Carolina","Panthers"],
    ["CHI","Chicago","Bears"],["CIN","Cincinnati","Bengals"],["CLE","Cleveland","Browns"],["DAL","Dallas","Cowboys"],["DEN","Denver","Broncos"],["DET","Detroit","Lions"],
    ["GB","Green Bay","Packers"],["HOU","Houston","Texans"],["IND","Indianapolis","Colts"],["JAC","Jacksonville","Jaguars"],["KC","Kansas City","Chiefs"],["LV","Las Vegas","Raiders"],
    ["LAC","Los Angeles","Chargers"],["LAR","Los Angeles","Rams"],["MIA","Miami","Dolphins"],["MIN","Minnesota","Vikings"],["NE","New England","Patriots"],["NO","New Orleans","Saints"],
    ["NYG","New York","Giants"],["NYJ","New York","Jets"],["PHI","Philadelphia","Eagles"],["PIT","Pittsburgh","Steelers"],["SF","San Francisco","49ers"],["SEA","Seattle","Seahawks"],
    ["TB","Tampa Bay","Buccaneers"],["TEN","Tennessee","Titans"],["WAS","Washington","Commanders"]];
  const NBA = [["ATL","Atlanta","Hawks"],["BOS","Boston","Celtics"],["BKN","Brooklyn","Nets"],["CHA","Charlotte","Hornets"],["CHI","Chicago","Bulls"],["CLE","Cleveland","Cavaliers"],
    ["DAL","Dallas","Mavericks"],["DEN","Denver","Nuggets"],["DET","Detroit","Pistons"],["GSW","Golden State","Warriors"],["GS","Golden State","Warriors"],["HOU","Houston","Rockets"],
    ["IND","Indiana","Pacers"],["LAC","Los Angeles","Clippers"],["LAL","Los Angeles","Lakers"],["MEM","Memphis","Grizzlies"],["MIA","Miami","Heat"],["MIL","Milwaukee","Bucks"],
    ["MIN","Minnesota","Timberwolves"],["NOP","New Orleans","Pelicans"],["NO","New Orleans","Pelicans"],["NYK","New York","Knicks"],["OKC","Oklahoma City","Thunder"],["ORL","Orlando","Magic"],
    ["PHI","Philadelphia","76ers"],["PHX","Phoenix","Suns"],["PHO","Phoenix","Suns"],["POR","Portland","Trail Blazers"],["SAC","Sacramento","Kings"],["SAS","San Antonio","Spurs"],
    ["SA","San Antonio","Spurs"],["TOR","Toronto","Raptors"],["UTA","Utah","Jazz"],["UTAH","Utah","Jazz"],["WAS","Washington","Wizards"]];
  const TEAMS = {NFL: Object.fromEntries(NFL.map(([a,c,n]) => [a, {abbr:a, city:c, nick:n, name:c+" "+n}])),
                 NBA: Object.fromEntries(NBA.map(([a,c,n]) => [a, {abbr:a, city:c, nick:n, name:c+" "+n}]))};
  const COLORS = {NFL: {ARI:["#97233F","#FFB612"],ATL:["#A71930","#101820"],BAL:["#241773","#9E7C0C"],BUF:["#00338D","#C60C30"],CAR:["#0085CA","#101820"],CHI:["#0B162A","#C83803"],
    CIN:["#FB4F14","#101820"],CLE:["#311D00","#FF3C00"],DAL:["#003594","#869397"],DEN:["#FB4F14","#002244"],DET:["#0076B6","#B0B7BC"],GB:["#203731","#FFB612"],HOU:["#03202F","#A71304"],
    IND:["#002C5F","#A2AAAD"],JAC:["#006778","#D7A22A"],KC:["#E31837","#FFB81C"],LV:["#101820","#A5ACAF"],LAC:["#0080C6","#FFC20E"],LAR:["#003594","#FFA300"],MIA:["#008E97","#FC4C02"],
    MIN:["#4F2683","#FFC62F"],NE:["#002244","#C60C30"],NO:["#101820","#D3BC8D"],NYG:["#0B2265","#A71930"],NYJ:["#125740","#101820"],PHI:["#004C54","#A5ACAF"],PIT:["#FFB612","#101820"],
    SF:["#AA0000","#B3995D"],SEA:["#002244","#69BE28"],TB:["#D50A0A","#FF7900"],TEN:["#0C2340","#4B92DB"],WAS:["#5A1414","#FFB612"]}, NBA: {}};
  const FALLBACK = ["#1F5FBF", "#B0472C"];
  const MONTHS = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  const SPORT = {KXNFL:"NFL", KXNBA:"NBA"};

  // "KXNFLGAME-26SEP17DETBUF" or "26SEP17DETBUF" -> event
  function parseEvent(s, dflt="KXNFLGAME"){
    const m = /^(?:(KX[A-Z]+)GAME-)?(\d{2})([A-Z]{3})(\d{2})([A-Z]+)$/.exec(String(s||"").trim().toUpperCase());
    if (!m) return null;
    const base = m[1] || dflt.replace(/GAME$/,""); const sport = SPORT[base]; if (!sport || !MONTHS[m[3]]) return null;
    const teams = m[5]; const T = TEAMS[sport]; const splits = [];
    for (let i = 1; i < teams.length; i++){ const a = T[teams.slice(0,i)], b = T[teams.slice(i)]; if (a && b && a !== b) splits.push([a,b]); }
    if (splits.length !== 1) return null;
    const [away, home] = splits[0]; const suffix = `${m[2]}${m[3]}${m[4]}${teams}`;
    return {base, sport, suffix, ticker: `${base}GAME-${suffix}`, date_et: `20${m[2]}-${String(MONTHS[m[3]]).padStart(2,"0")}-${m[4]}`, away, home,
            competition: sport, eventTicker: k => `${base}${k}-${suffix}`};
  }

  // ---- colours (port of gamecard.pick_colors) ------------------------------------------------------
  const hex2rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
  const rgb2hex = c => "#" + c.map(x => Math.max(0,Math.min(255,Math.round(x*255))).toString(16).padStart(2,"0").toUpperCase()).join("");
  function rgb2hls([r,g,b]){ const mx=Math.max(r,g,b), mn=Math.min(r,g,b); const l=(mx+mn)/2; if (mx===mn) return [0,l,0]; const d=mx-mn; const s = l>0.5? d/(2-mx-mn) : d/(mx+mn);
    let h = mx===r ? (g-b)/d + (g<b?6:0) : mx===g ? (b-r)/d + 2 : (r-g)/d + 4; return [h/6, l, s]; }
  function hls2rgb([h,l,s]){ if (s===0) return [l,l,l]; const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q; const f = t => { t=(t+1)%1; if (t<1/6) return p+(q-p)*6*t; if (t<1/2) return q; if (t<2/3) return p+(q-p)*(2/3-t)*6; return p; }; return [f(h+1/3), f(h), f(h-1/3)]; }
  const hls = h => rgb2hls(hex2rgb(h));
  const withL = (h, lo, hi) => { let [hh,l,s] = hls(h); if (lo!=null) l = Math.max(l,lo); if (hi!=null) l = Math.min(l,hi); return rgb2hex(hls2rgb([hh,l,s])); };
  const mix = (a,b,t) => { const A=hex2rgb(a), B=hex2rgb(b); return rgb2hex(A.map((x,i)=>x*(1-t)+B[i]*t)); };
  const usable = h => { const [,l,s] = hls(h); return s>=0.35 || l<=0.25; };
  const distinct = (a,b) => { const [ha,la,sa]=hls(a), [hb,lb,sb]=hls(b); if (sa<0.35 || sb<0.35) return Math.abs(la-lb)>0.15 || (sa>=0.35)!==(sb>=0.35); const d=Math.abs(ha-hb)*360; return Math.min(d,360-d)>=30; };
  function pickColors(ev){
    const [hp,hs] = (COLORS[ev.sport]||{})[ev.home.abbr] || FALLBACK; const [ap,as] = (COLORS[ev.sport]||{})[ev.away.abbr] || [FALLBACK[1],FALLBACK[0]];
    let home=hp, away=ap, ok=false;
    for (const [h,a] of [[hp,ap],[hp,as],[hs,ap],[hs,as]]) if (usable(h) && usable(a) && distinct(h,a)) { home=h; away=a; ok=true; break; }
    if (!ok && !distinct(home,away)) away = distinct(home,FALLBACK[1]) ? FALLBACK[1] : FALLBACK[0];
    const lh=withL(home,null,0.42), la=withL(away,null,0.42), dh=withL(home,0.62,null), da=withL(away,0.62,null);
    return {light:{home:lh, away:la, homeBg:mix(lh,"#FFFFFF",0.88), awayBg:mix(la,"#FFFFFF",0.88)}, dark:{home:dh, away:da, homeBg:mix(dh,"#1A222C",0.78), awayBg:mix(da,"#1A222C",0.78)}};
  }
  function applyColors(ev){ const c = pickColors(ev); const st = document.createElement("style");
    st.textContent = `:root{--home:${c.light.home};--away:${c.light.away};--home-bg:${c.light.homeBg};--away-bg:${c.light.awayBg}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--home:${c.dark.home};--away:${c.dark.away};--home-bg:${c.dark.homeBg};--away-bg:${c.dark.awayBg}}}
:root[data-theme="dark"]{--home:${c.dark.home};--away:${c.dark.away};--home-bg:${c.dark.homeBg};--away-bg:${c.dark.awayBg}}`; document.head.appendChild(st); return c; }

  // ---- numbers ----------------------------------------------------------------------------------
  const num = v => (v===null || v===undefined || v==="") ? null : (isNaN(Number(v)) ? null : Number(v));
  const ceilCent = x => Math.ceil(x*100 - 1e-9)/100;
  const fee = (n, p, coef) => ceilCent(coef * n * p * (1-p));                 // Kalshi taker fee per order, rounded up to the cent
  const fmt$ = v => (v<0?"−":"") + "$" + Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtK = v => fmt$(v).replace(/\.00$/,"");
  const fmt0 = v => Math.round(v||0).toLocaleString();
  const pct = p => p==null ? "—" : (p*100).toFixed(p<0.1||p>0.9?1:0) + "%";
  const cents = p => p==null ? "—" : Math.round(p*100) + "¢";
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
  const american = a => a>0 ? 100/(a+100) : (-a)/((-a)+100);

  // ---- time (Eastern) -----------------------------------------------------------------------------
  const ET = "America/New_York";
  function etParts(d){ const p = new Intl.DateTimeFormat("en-US",{timeZone:ET,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(d);
    const g = t => Number(p.find(x=>x.type===t).value); return {y:g("year"), mo:g("month"), d:g("day"), h:g("hour")%24, mi:g("minute"), s:g("second")}; }
  // "9/16/2026 1:28:02", "2026-09-16 01:28", "2026-09-16T01:28:02" as Eastern wall time -> Date (UTC instant). ISO with Z/offset parsed as is.
  function parseET(s){ if (!s) return null; s = String(s).trim();
    if (/Z$|[+-]\d\d:\d\d$/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d; }
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s); let y,mo,d,h,mi,se;
    if (m) { [mo,d,y,h,mi,se] = [m[1],m[2],m[3],m[4],m[5],m[6]||0].map(Number); }
    else { m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s); if (!m) return null; [y,mo,d,h,mi,se] = [m[1],m[2],m[3],m[4],m[5],m[6]||0].map(Number); }
    let guess = Date.UTC(y,mo-1,d,h,mi,se);                       // treat as UTC, then shift by the ET offset at that instant (twice, for the DST edge)
    for (let i=0;i<2;i++){ const q = etParts(new Date(guess)); const asUtc = Date.UTC(q.y,q.mo-1,q.d,q.h,q.mi,q.s); guess += Date.UTC(y,mo-1,d,h,mi,se) - asUtc; }
    return new Date(guess); }
  const fmtET = (d, opts) => d ? new Date(d).toLocaleString("en-US", Object.assign({timeZone:ET, month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}, opts||{})) : "—";
  const fmtETlong = d => d ? new Date(d).toLocaleString("en-US",{timeZone:ET, weekday:"long", month:"long", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit"}) + " ET" : null;
  function nowET(){ const q = etParts(new Date()); return `${q.y}-${String(q.mo).padStart(2,"0")}-${String(q.d).padStart(2,"0")} ${String(q.h).padStart(2,"0")}:${String(q.mi).padStart(2,"0")}`; }
  const etDate = d => { const q = etParts(new Date(d)); return `${q.y}-${String(q.mo).padStart(2,"0")}-${String(q.d).padStart(2,"0")}`; };

  // ---- CSV (RFC 4180; the sheet quotes fields that need it) ------------------------------------------
  function parseCSV(text){ const rows=[]; let row=[], f="", q=false; text = text.replace(/^\uFEFF/,"");
    for (let i=0;i<text.length;i++){ const c=text[i];
      if (q){ if (c==='"'){ if (text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
      else if (c==='"') q=true; else if (c===","){ row.push(f); f=""; } else if (c==="\n"){ row.push(f); rows.push(row); row=[]; f=""; } else if (c!=="\r") f+=c; }
    if (f!=="" || row.length){ row.push(f); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).filter(r => r.some(x => x.trim()!=="")).map(r => Object.fromEntries(head.map((h,i) => [h, (r[i]||"").trim()]))); }

  // ---- fetching ---------------------------------------------------------------------------------------
  const bust = url => url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  async function getJSON(url, opts){ const r = await fetch(bust(url), Object.assign({cache:"no-store"}, opts||{})); if (!r.ok) throw new Error(`${url.split("?")[0]}: HTTP ${r.status}`); return r.json(); }
  async function getText(url){ const r = await fetch(bust(url), {cache:"no-store"}); if (!r.ok) throw new Error(`${url.split("?")[0]}: HTTP ${r.status}`); return r.text(); }
  const sheetCSV = (cfg, gid) => (cfg.sheet && cfg.sheet.csv_urls && cfg.sheet.csv_urls[gid]) || (cfg.sheet && cfg.sheet.id ? `https://docs.google.com/spreadsheets/d/${cfg.sheet.id}/gviz/tq?tqx=out:csv&gid=${gid}` : null);   // csv_urls: per-gid override (tests)
  const sheetURL = cfg => cfg.sheet && cfg.sheet.id ? `https://docs.google.com/spreadsheets/d/${cfg.sheet.id}/edit` : null;

  // config.json + everything it points at; each source fails independently and is reported in `errors`
  async function loadAll(){
    const errors = [];
    const cfg = await getJSON("config.json");
    const tasks = {
      markets: cfg.data_url ? getJSON(cfg.data_url) : Promise.resolve(null),
      form: cfg.sheet && cfg.sheet.form_gid != null ? getText(sheetCSV(cfg, cfg.sheet.form_gid)).then(parseCSV) : Promise.resolve([]),
      picks: cfg.sheet && cfg.sheet.picks_gid != null ? getText(sheetCSV(cfg, cfg.sheet.picks_gid)).then(parseCSV) : Promise.resolve([]),
      feed: getJSON("system_feed.json").catch(() => null),
    };
    const out = {cfg, errors};
    for (const [k, p] of Object.entries(tasks)) { try { out[k] = await p; } catch (e) { out[k] = k==="markets"||k==="feed" ? null : []; errors.push(`${k}: ${e.message}`); } }
    out.bets = normalizeBets(out.form, out.picks);
    out.results = settlements(out.markets);
    out.slate = slateRows(out.markets);
    return out;
  }

  // ---- markets ----------------------------------------------------------------------------------
  // one raw Kalshi market (as markets.json stores it) -> {kind, team?, line?, prices...}; null if not a winner/spread/total of this event
  function normalizeMarket(m, ev){ const t = m.ticker || ""; const key = `-${ev.suffix}-`; if (!t.startsWith(ev.base) || !t.includes(key)) return null;
    const [series, rest] = [t.slice(0, t.indexOf(key)), t.slice(t.indexOf(key)+key.length)];
    const row = {ticker:t, status:m.status||"", result:(m.result||"").toLowerCase(), yes_bid:num(m.yes_bid_dollars), yes_ask:num(m.yes_ask_dollars), no_bid:num(m.no_bid_dollars), no_ask:num(m.no_ask_dollars),
                 last:num(m.last_price_dollars), volume:num(m.volume_fp)||0, oi:num(m.open_interest_fp)||0, close_time:m.close_time||null, expiration:m.expected_expiration_time||null};
    const T = TEAMS[ev.sport]; const lineOf = () => { const fs = num(m.floor_strike); if (fs!=null) return fs; const d=/(\d+)$/.exec(t); return d ? Number(d[1]) - 0.5 : null; };
    if (series.endsWith("GAME")) { const team = T[rest]; if (!team || (team!==ev.home && team!==ev.away)) return null; row.kind="winner"; row.team=team.abbr; }
    else if (series.endsWith("SPREAD")) { const mm = /^([A-Z]+?)(\d+)$/.exec(rest); const team = mm && T[mm[1]]; if (!team || (team!==ev.home && team!==ev.away)) return null; row.kind="spread"; row.team=team.abbr; row.line=lineOf(); }
    else if (series.endsWith("TOTAL")) { row.kind="total"; row.line=lineOf(); }
    else return null;
    if (row.kind!=="winner" && row.line==null) return null; return row; }
  const isOpen = m => m.status==="open" || m.status==="active";
  function eventMarkets(data, ev){ const evd = data && data.events && data.events[ev.suffix]; const out = {winner:[], spread:[], total:[], all:[]}; if (!evd) return out; const seen = new Set();
    for (const raw of evd.markets||[]) { const r = normalizeMarket(raw, ev); if (!r || seen.has(r.ticker)) continue; seen.add(r.ticker); out.all.push(r); if (isOpen(r)) out[r.kind].push(r); }
    out.spread.sort((a,b) => (a.team!==ev.home.abbr) - (b.team!==ev.home.abbr) || a.line-b.line); out.total.sort((a,b)=>a.line-b.line); out.info = evd; return out; }
  // ticker -> "yes"|"no" for every settled market in the file
  function settlements(data){ const s = {}; if (!data || !data.events) return s;
    for (const evd of Object.values(data.events)) for (const m of evd.markets||[]) { const r = (m.result||"").toLowerCase(); if (r==="yes" || r==="no") s[m.ticker] = r; } return s; }
  function slateRows(data){ return ((data && data.slate) || []).map(s => { const ev = parseEvent(s.event_ticker); return Object.assign({ev}, s); }).filter(s => s.ev); }

  // readable label for any ticker: "DET @ BUF · Bills win", "DET @ BUF · Bills by over 4.5", "DET @ BUF · over 53.5"
  function label(ticker){ const m = /^(KX[A-Z]+?)(GAME|SPREAD|TOTAL)-(\d{2}[A-Z]{3}\d{2}[A-Z]+)-([A-Z]*)(\d*)$/.exec(ticker||""); if (!m) return ticker;
    const ev = parseEvent(`${m[1]}GAME-${m[3]}`); if (!ev) return ticker; const T = TEAMS[ev.sport]; const g = `${ev.away.abbr} @ ${ev.home.abbr}`;
    if (m[2]==="GAME") return T[m[4]] ? `${g} · ${T[m[4]].nick} win` : ticker;
    const line = m[5] ? Number(m[5]) - 0.5 : null; if (line==null) return ticker;
    return m[2]==="SPREAD" && T[m[4]] ? `${g} · ${T[m[4]].nick} by over ${line}` : `${g} · over ${line}`; }
  const suffixOf = ticker => { const m = /-(\d{2}[A-Z]{3}\d{2}[A-Z]+)-/.exec(ticker||""); return m ? m[1] : null; };

  // ---- bets --------------------------------------------------------------------------------------
  // Form Responses rows (Timestamp, player, ticker, side, price, contracts, note) and Picks rows (player, ts_logged, …) -> one shape
  function normalizeBets(form, picks){ const out = [];
    for (const r of form||[]) out.push({player:r.player||"", ts:parseET(r.Timestamp), tsRaw:r.Timestamp||"", ticker:(r.ticker||"").trim().toUpperCase(), side:(r.side||"").toLowerCase(), price:num(r.price), contracts:Math.floor(num(r.contracts)||0), note:r.note||"", source:"site", backfilled:false, resultOverride:""});
    for (const r of picks||[]) out.push({player:r.player||"", ts:parseET(r.ts_logged), tsRaw:r.ts_logged||"", ticker:(r.ticker||"").trim().toUpperCase(), side:(r.side||"").toLowerCase(), price:num(r.price), contracts:Math.floor(num(r.contracts)||0), note:r.note||"", source:"sheet", backfilled:/^(true|1|yes)$/i.test(r.backfilled||""), resultOverride:(r.result||"").toLowerCase()});
    return out.filter(b => (b.side==="yes"||b.side==="no") && b.price>0 && b.price<1 && b.contracts>0); }

  // standings, port of collector.site.compute_standings: the System's rows come from the feed, everyone else's from the sheet
  function standings(cfg, bets, results, feed){ const coef = cfg.taker_coef||0.07; const rows = [];
    const sysName = (cfg.players.find(p=>p.role==="system")||{}).name || "System"; const sysNames = new Set([sysName.toLowerCase(), "system"]);
    const feedKeys = new Set();
    for (const e of (feed&&feed.entries)||[]) { feedKeys.add(`${e.ticker}|${e.et_date}`);
      rows.push({player:sysName, role:"system", source:"system", ts:e.ts_entry?new Date(e.ts_entry):null, ticker:e.ticker, side:"yes", price:e.yes_ask, contracts:e.contracts, result:e.result||null, pnl:e.pnl==null?null:e.pnl, fee:(e.taker_fee_cents||0)/100*e.contracts, note:e.rationale||"", backfilled:false, clv:e.clv_net_taker_cents}); }
    for (const b of bets) { const isSys = sysNames.has(b.player.toLowerCase()); const d = b.ts ? etDate(b.ts) : null;
      if (isSys && feedKeys.has(`${b.ticker}|${d}`)) continue;
      const res = (b.resultOverride==="yes"||b.resultOverride==="no"||b.resultOverride==="void") ? b.resultOverride : (results[b.ticker]||null);
      const f = fee(b.contracts, b.price, coef); let pnl = null; if (res==="yes"||res==="no") { const win = res===b.side; pnl = Math.round((b.contracts*(win ? 1-b.price : -b.price) - f)*100)/100; }
      const pl = cfg.players.find(p => p.name.toLowerCase()===b.player.toLowerCase());
      rows.push({player: isSys ? sysName : (pl ? pl.name : b.player), role: isSys ? "system" : (pl ? pl.role : "intuition"), source: isSys ? "sheet (manual)" : b.source, ts:b.ts, ticker:b.ticker, side:b.side, price:b.price, contracts:b.contracts, result:res, pnl, fee:f, note:b.note, backfilled:b.backfilled, clv:null}); }
    const table = cfg.players.map(p => { const ps = rows.filter(x => x.player===p.name); const settled = ps.filter(x => x.result==="yes"||x.result==="no"); const wins = settled.filter(x => x.result===x.side).length;
      const pnl = Math.round(settled.reduce((a,x)=>a+(x.pnl||0),0)*100)/100;
      return {player:p.name, role:p.role, picks:ps.length, open:ps.length-settled.length-ps.filter(x=>x.result==="void").length, settled:settled.length, wins, losses:settled.length-wins, fees:Math.round(ps.reduce((a,x)=>a+x.fee,0)*100)/100, pnl, bankroll:Math.round((cfg.bankroll+pnl)*100)/100, atRisk:Math.round(ps.filter(x=>!x.result).reduce((a,x)=>a+x.price*x.contracts,0)*100)/100, backfilled:ps.filter(x=>x.backfilled).length}; });
    rows.sort((a,b) => (b.ts?b.ts.getTime():0) - (a.ts?a.ts.getTime():0));
    return {table, rows}; }

  return {TEAMS, parseEvent, pickColors, applyColors, num, ceilCent, fee, fmt$, fmtK, fmt0, pct, cents, esc, american, parseET, fmtET, fmtETlong, nowET, etDate, parseCSV, getJSON, getText, sheetURL, loadAll,
          normalizeMarket, eventMarkets, settlements, slateRows, label, suffixOf, normalizeBets, standings};
})();
