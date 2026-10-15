(() => {
const SB_URL = "https://nfggbgyxxczyjjhetltb.supabase.co/rest/v1";
const SB_KEY = "sb_publishable_doljQEwPDtnslZFlFQYM0g_jwMAFjCS";
const QUALS = [["NM","Quase nova"],["SP","Pouco jogada"],["MP","Moderada"],["HP","Muito jogada"],["D","Danificada"]];
const MARKETS = [["myp","MYP"],["liga","Liga"],["jornada","Jornada"]];
const ROWS = [["myp_lojas","MYP Lojas","myp"],["myp_vend","MYP Vend.","myp"],["liga","Liga","liga"],["jornada","Jornada","jornada"]];
const rowsFor = ms => ROWS.filter(r=>ms.includes(r[2]));
const S = {view:"consultar", quality:"NM", markets:{myp:true,liga:true,jornada:true},
  select:false, sel:new Set(), selScope:[], pendingCards:null, pendingCard:null,
  cards:[], scans:[], binders:[], worker:null, openScan:null, openBinder:null, busy:"", loaded:false};
const wide = matchMedia("(min-width:761px)");

const $ = (s,el=document)=>el.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl = v => (typeof v==="number" && isFinite(v)) ? v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "—";
const ago = iso => { if(!iso) return ""; const m=Math.round((Date.now()-new Date(iso))/60000); if(m<1) return "agora"; if(m<60) return `há ${m} min`; const h=Math.round(m/60); if(h<48) return `há ${h} h`; return `há ${Math.round(h/24)} dias`; };
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function toast(msg){ const r=$("#toast-root"); r.innerHTML=`<div class="toast" role="status">${esc(msg)}</div>`; clearTimeout(toast.t); toast.t=setTimeout(()=>r.innerHTML="",3200); }
function store(k,v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k,JSON.stringify(v)); }catch(e){ return null; } }
const saved = store("sc-prefs"); if(saved){ S.markets={...S.markets,...(saved.markets||{})}; }

/* ---------- código de acesso ---------- */
(function(){ const m=location.hash.match(/k=([\w-]+)/); if(m){ store("pc-key",m[1]); history.replaceState(null,"",location.pathname); } })();
const KEY = () => store("pc-key")||"";

/* ---------- banco (Supabase REST) ---------- */
const CAMEL = s => s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const SNAKE = s => s.replace(/[A-Z]/g,c=>"_"+c.toLowerCase());
const fromRow = r => { const o={}; for(const k in r) o[CAMEL(k)]=r[k]; return o; };
const toRow = o => { const r={}; for(const k in o) if(o[k]!==undefined) r[SNAKE(k)]=o[k]; return r; };
async function api(path, opt={}){
  const res = await fetch(`${SB_URL}/${path}`, {...opt, headers:{apikey:SB_KEY, "x-pc-key":KEY(), "Content-Type":"application/json", Prefer:"return=representation", ...(opt.headers||{})}});
  if(!res.ok){ const t=await res.text().catch(()=>""); throw new Error(`${res.status} ${t.slice(0,160)}`); }
  const t = await res.text(); return t ? JSON.parse(t) : null;
}
const db = {
  list: (table, q) => api(`${table}?${q}`).then(rs=>(rs||[]).map(fromRow)),
  insert: (table, obj) => api(table, {method:"POST", body:JSON.stringify(Array.isArray(obj)?obj.map(toRow):toRow(obj))}),
  update: (table, id, patch) => api(`${table}?id=eq.${encodeURIComponent(id)}`, {method:"PATCH", body:JSON.stringify(toRow(patch))}),
  del: (table, id) => api(`${table}?id=eq.${encodeURIComponent(id)}`, {method:"DELETE"}),
};
async function patchCard(id, patch){ const c=S.cards.find(x=>x.id===id); if(c) Object.assign(c,patch); render(); await db.update("cards",id,patch); }

/* ---------- links ---------- */
function ligaUrl(c){
  if(c.prices?.liga?.url) return c.prices.liga.url;
  const num = String(c.number||"").split("/")[0];
  return `https://www.ligapokemon.com.br/?view=cards/search&card=${encodeURIComponent((c.nameEn||c.name)+" "+num)}`;
}
function mypUrl(c){ return c.prices?.myp_lojas?.url || c.prices?.myp_vend?.url || `https://mypcards.com/pokemon?ProdutoSearch%5Bquery%5D=${encodeURIComponent(c.name||"")}`; }
function jornadaUrl(c){ return c.prices?.jornada?.url || `https://www.jornadagames.com/search?q=${encodeURIComponent((c.nameEn||c.name||"")+" "+String(c.number||"").split("/")[0])}`; }
const URLS = {myp:mypUrl, liga:ligaUrl, jornada:jornadaUrl};

/* ---------- render ---------- */
function pcOnline(){ const w=S.worker; return w?.lastSeen && (Date.now()-new Date(w.lastSeen)) < 90000; }
function render(){
  const fav = S.cards.filter(c=>c.favorite).length;
  const tabs = [["consultar","Consultar"],["historico","Histórico",S.scans.length],["favoritas","Favoritas",fav],["binders","Binders",S.binders.length]];
  $("#tabs").innerHTML = tabs.map(([k,l,n])=>`<button class="tab" data-tab="${k}" aria-current="${S.view===k}">${l}${n?`<span class="n">${n}</span>`:""}</button>`).join("");
  const app=$("#app");
  if(!KEY()) { app.innerHTML = viewKey(); return; }
  if(S.view==="consultar") app.innerHTML = viewConsultar();
  else if(S.view==="historico") app.innerHTML = S.openScan ? viewScan(S.scans.find(s=>s.id===S.openScan)||S.scans[0],true) : viewHistorico();
  else if(S.view==="favoritas") app.innerHTML = viewCardsBlock("Favoritas", S.cards.filter(c=>c.favorite), "Toque em Favoritar em uma carta para guardar aqui.");
  else app.innerHTML = S.openBinder ? viewBinder(S.openBinder) : viewBinders();
  document.body.classList.toggle("selecting", S.select);
  $("#selbar-root").innerHTML = S.select ? selbar() : "";
}
function viewKey(){
  return `<section class="capture"><div class="hero"><h1>PriceCheck <em>é pessoal.</em></h1><p>Cole o código de acesso para entrar.</p></div>
    <form class="newb" id="keyform"><input id="keyin" placeholder="Código de acesso" autocomplete="off" required><button class="btn primary">Entrar</button></form></section>`;
}
function selbar(){
  const n=S.sel.size; const inBinder = S.view==="binders" && S.openBinder;
  const opts = S.binders.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("");
  return `<div class="selbar" role="region" aria-label="Seleção"><b>${n} ${n===1?"selecionada":"selecionadas"}</b>
    <button class="btn ghost" data-act="sel-all">Todas</button><button class="btn ghost" data-act="sel-none">Nenhuma</button>
    <select id="sel-bind" aria-label="Guardar selecionadas em binder" ${n?"":"disabled"}><option value="">Guardar em binder…</option>${opts}<option value="__new">+ Novo binder</option></select>
    <button class="btn" data-act="sel-fav" ${n?"":"disabled"}>Favoritar</button>
    ${inBinder?`<button class="btn" data-act="sel-unbind" ${n?"":"disabled"}>Tirar do binder</button>`:""}
    <button class="btn ghost" data-act="select-toggle">Concluir</button></div>`;
}
async function bulk(ids, fn, msg){
  let ok=0;
  for(const id of ids){ const c=S.cards.find(x=>x.id===id); if(!c) continue; const patch=fn(c); if(!patch) continue; try{ await patchCard(id, patch); ok++; }catch(e){} }
  toast(`${msg} · ${ok} ${ok===1?"carta":"cartas"}`);
}

/* ---------- export ---------- */
const LIGA_RAR={C:"C",U:"U",R:"R",RR:"RD",UR:"RU",IR:"IR",SIR:"IS",HR:"HR",PR:"S",ACE:"RA",AR:"IR",SR:"SR",SAR:"IS"};
const isPromo=c=>/^(MEP|SVP|SWSHP|SMP|XYP|BWP)$/i.test(c.setCode||"")||rarCode(c)==="PR";
function numParts(c){ const n=String(c.number||""); const [a,b]=n.split("/"); return [a||n, b|| (isPromo(c)?"∞":"")]; }
function csvCell(v){ v=v==null?"":String(v); return /[",\n;]/.test(v)?`"${v.replace(/"/g,'""')}"`:v; }
function ligaBytes(text){ const out=[]; for(const ch of text){ const cp=ch.codePointAt(0); if(cp<256) out.push(cp); else out.push(...new TextEncoder().encode(ch)); } return new Uint8Array(out); }
function exportLiga(cards){
  const head=["Edicao (PTBR)","Edicao (EN)","Edicao (Sigla)","Card (PT)","Card (EN)","Quantidade","Qualidade (M NM SP MP HP D)","Idioma (BR EN DE ES FR IT JP KO RU TW)","Raridade (C I U R H E X U P A L S)","Cor (C D O E Y F R G L M P W)","Extras","Card #","Comentario","# Cards na Edicao"];
  const groups=new Map();
  for(const c of cards){ const k=[c.setCode,c.number,c.language,c.quality,c.extras||""].join("|"); const g=groups.get(k); if(g) g.q++; else groups.set(k,{c,q:1}); }
  const rows=[...groups.values()].map(({c,q})=>{ const [num,tot]=numParts(c); const pt=c.language==="PT";
    return [pt?(c.setName||""):"", c.setNameEn||"", c.setCode||"", pt?c.name:(c.nameEn||c.name), c.nameEn||c.name, q, c.quality||"NM", c.language||"PT", LIGA_RAR[rarCode(c)]||"", c.color||"", c.extras||"", num, "", tot]; });
  const text=[head,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n";
  return {data:ligaBytes(text), ext:"csv", type:"text/csv"};
}
function exportPriceCheck(cards, title){
  const X=window.XLSX; if(!X) throw new Error("A biblioteca de planilha não carregou. Verifique a conexão e tente de novo.");
  const head=["Carta","Carta (EN)","Coleção","Sigla","Ano","Número","Raridade","Idioma","Qualidade","MYP Lojas","MYP Vend.","Liga","Jornada","Link MYP","Link Liga","Link Jornada","Consultado em"];
  const keys=["myp_lojas","myp_vend","liga","jornada"];
  const aoa=[head];
  cards.forEach(c=>{ const pr=c.prices||{}; const r=rarCode(c);
    aoa.push([c.name,c.nameEn||"",c.setName||"",c.setCode||"",c.setYear||"",c.number||"",(RAR[r]?.[0]&&!(c.language==="JP"&&JP_RAR.has(r)))?RAR[r][0]+" "+r:r,c.language||"",c.quality||"",
      ...keys.map(k=>typeof pr[k]?.value==="number"?pr[k].value:null), mypUrl(c)||"", ligaUrl(c)||"", jornadaUrl(c)||"",
      (Object.values(pr).map(p=>p?.checkedAt).filter(Boolean).sort().pop()||"").slice(0,10)]); });
  const n=cards.length; const tr=n+2;
  aoa.push(["Total","","","","","","","","", ...["J","K","L","M"].map(col=>({f:`SUM(${col}2:${col}${n+1})`})),"","","",""]);
  const ws=X.utils.aoa_to_sheet(aoa);
  for(let r=2;r<=tr;r++) for(const col of ["J","K","L","M"]){ const cell=ws[col+r]; if(cell) cell.z='"R$" #,##0.00'; }
  for(let r=2;r<=n+1;r++) for(const col of ["N","O","P"]){ const cell=ws[col+r]; if(cell&&cell.v) cell.l={Target:cell.v}; }
  ws["!cols"]=[{wch:26},{wch:24},{wch:22},{wch:7},{wch:6},{wch:9},{wch:12},{wch:7},{wch:9},{wch:11},{wch:11},{wch:11},{wch:11},{wch:40},{wch:40},{wch:40},{wch:12}];
  ws["!autofilter"]={ref:`A1:Q${n+1}`};
  const wb=X.utils.book_new(); X.utils.book_append_sheet(wb, ws, (title||"Binder").replace(/[\\/?*\[\]:]/g," ").slice(0,31));
  return {data:new Uint8Array(X.write(wb,{type:"array",bookType:"xlsx"})), ext:"xlsx", type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
}
function doExport(fmt){
  const b=S.binders.find(x=>x.id===S.openBinder); if(!b) return;
  const cards=S.cards.filter(c=>(c.binderIds||[]).includes(b.id));
  try{
    const out = fmt==="liga" ? exportLiga(cards) : exportPriceCheck(cards, b.name);
    const slug=(b.name||"binder").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^\w]+/g,"-").replace(/^-|-$/g,"").toLowerCase();
    const url=URL.createObjectURL(new Blob([out.data],{type:out.type}));
    const a=document.createElement("a"); a.href=url; a.download=`${slug}${fmt==="liga"?"-liga":""}.${out.ext}`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    toast("Planilha pronta");
  }catch(e){ toast(e?.message||"Não consegui gerar a planilha."); }
}

function pcChip(){
  const on=pcOnline();
  return `<div class="status"><span class="dot ${on?"ok":"bad"}"></span><span>${on?"PC ligado · pronto para buscar":"PC desligado ou programa fechado · a busca começa quando ele voltar"}</span></div>`;
}
function viewConsultar(){
  const qual = QUALS.map(([q,l])=>`<button class="chip" data-q="${q}" aria-pressed="${S.quality===q}">${q}<small>${l}</small></button>`).join("");
  const mk = MARKETS.map(([k,l])=>`<button class="chip" data-mk="${k}" aria-pressed="${!!S.markets[k]}">${l}</button>`).join("");
  const last = S.scans[0];
  return `${S.loaded?pcChip():""}<section class="capture"><div class="hero"><h1>Achou a carta. <em>Confira o preço.</em></h1><p>Menor valor no MYP, na Liga e na Jornada.</p></div>
    ${S.busy ? `<div class="verdict"><span class="spin"></span>${esc(S.busy)}</div>` : `<label class="shoot" for="cam">
      <span class="big">Tirar foto</span>
      <span class="note">Uma carta, várias ou a página inteira da pasta.</span>
      <button class="alt" type="button" data-act="gallery">Escolher da galeria</button>
    </label>`}
    <input id="cam" type="file" accept="image/*" capture="environment" hidden>
    <input id="gal" type="file" accept="image/*" hidden>
    <div class="opts">
      <div><div class="opt-label">Qualidade das cartas</div><div class="seg">${qual}</div></div>
      <div><div class="opt-label">Onde buscar</div><div class="seg">${mk}</div></div>
    </div>
  </section>
  ${last ? viewScan(last,false) : (S.loaded?`<div class="empty">Sua primeira consulta aparece aqui, no formato da pasta.</div>`:`<div class="empty"><span class="spin"></span> Carregando…</div>`)}`;
}

function scanCards(scan){ return S.cards.filter(c=>c.scanId===scan.id).sort((a,b)=>(a.pos||0)-(b.pos||0)); }
function sums(cards){ const t={}; for(const [k] of ROWS){ let s=0,n=0; for(const c of cards){ const v=c.prices?.[k]?.value; if(typeof v==="number"){s+=v;n++;} } if(n) t[k]={s,n}; } return t; }
function totalsHtml(cards){ const t=sums(cards); return `<div class="totals">${ROWS.filter(([k])=>t[k]).map(([k,l])=>`<span class="tot">${l} <b>${brl(t[k].s)}</b>${t[k].n<cards.length?` · ${t[k].n}/${cards.length}`:""}</span>`).join("")}</div>`; }

function viewScan(scan, withBack){
  if(!scan) return "";
  const cards = scanCards(scan);
  const pend = cards.filter(c=>c.status==="pending").length;
  let st="";
  const retry = `<button class="btn" data-act="refire" data-scan="${scan.id}">Tentar de novo</button>`;
  if(scan.state==="analyzing") st = `<div class="status"><span class="spin"></span><span>${pcOnline()?"Seu PC está lendo a foto…":"Aguardando o PC ligar para ler a foto"}</span></div>`;
  else if(scan.state==="rejected") st = `<div class="status"><span class="dot bad"></span><span>Precisa de outra foto${scan.message?`: ${esc(scan.message)}`:""}</span></div>${scan.tips?.length?`<ul class="tips">${scan.tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>`:""}`;
  else if(scan.state==="error") st = `<div class="status"><span class="dot bad"></span><span>${esc(scan.message||"Erro ao ler a foto.")}</span>${retry}</div>`;
  else if(pend) st = `<div class="status"><span class="spin"></span><span>${pcOnline()?`Buscando preços no seu PC · faltam ${pend} de ${cards.length}`:"Aguardando o PC ligar para buscar os preços"}${S.worker?.detail&&pcOnline()?` · ${esc(S.worker.detail)}`:""}</span></div>`;
  const humanSites = [...new Set(cards.flatMap(c=>Object.entries(c.prices||{}).filter(([,p])=>p?.status==="needs_human"||p?.status==="blocked").map(([k])=>k.startsWith("myp")?"MYP":k==="liga"?"Liga":"Jornada")))];
  if(humanSites.length) st += `<div class="status"><span class="dot warn"></span>${humanSites.join(", ")} pediu verificação ou bloqueou a consulta. Na janela do PriceCheck no PC, confirme que é humano e toque em Tentar de novo.${retry}</div>`;
  const errs = cards.some(c=>Object.values(c.prices||{}).some(p=>p?.status==="error"));
  if(errs && !pend) st += `<div class="status"><span class="dot warn"></span>Alguns preços deram erro.${retry}</div>`;
  const cols = Math.min(Math.max(scan.cols||4,2),5);
  return `<div class="sec">${withBack?`<button class="back" data-act="close-scan">← Histórico</button>`:""}
    <h2>${esc(scan.title||"Consulta")}</h2><span class="meta">${cards.length} cartas · ${esc(scan.quality||"")} · ${ago(scan.createdAt)}</span>${totalsHtml(cards)}${secActs(cards, `<button class="btn ghost" data-act="del-scan" data-scan="${scan.id}">Apagar consulta</button>`)}</div>
    ${st}<div class="binder" style="--cols:${cols}">${cards.map(c=>`<div class="pocket">${slab(c)}</div>`).join("")}</div>`;
}

const RAR = {C:["●",0],U:["◆",0],R:["★",0],RR:["★★",0],UR:["★★",2],IR:["★",1],SIR:["★★",1],HR:["★★★",1],PR:["PROMO",0],ACE:["ACE SPEC",0]};
const JP_RAR = new Set(["AR","SR","SAR","UR","CHR","CSR","S","SSR","MUR"]);
function rarCode(c){
  if(c.rarityCode) return String(c.rarityCode).toUpperCase();
  const t=String(c.rarity||"").toLowerCase();
  const m=t.match(/\((ar|sr|sar|ur|chr|csr|ssr|mur)\)/); if(m) return m[1].toUpperCase();
  if(/special illustration/.test(t)) return "SIR"; if(/illustration/.test(t)) return "IR"; if(/hyper|gold|dourada/.test(t)) return "HR";
  if(/ultra/.test(t)) return "UR"; if(/double/.test(t)) return "RR"; if(/promo/.test(t)) return "PR"; if(/ace/.test(t)) return "ACE";
  if(/uncommon|incomum/.test(t)) return "U"; if(/common|comum/.test(t)) return "C"; if(/rare|rara/.test(t)) return "R"; return "";
}
function rarHtml(c){
  const k=rarCode(c); if(!k) return "";
  if(c.language==="JP" && JP_RAR.has(k)) return `<span class="rar" title="${esc(c.rarity||k)}">${k}</span>`;
  const r=RAR[k]; if(!r) return `<span class="rar">${esc(k)}</span>`;
  return `<span class="rar${r[1]===1?" gold":r[1]===2?" silver":""}${r[0].length>3?" txt":""}" title="${esc(c.rarity||k)}">${r[0]}</span>`;
}
function slab(c){
  const ms = (c.markets&&c.markets.length?c.markets:["myp","liga"]);
  const prices = rowsFor(ms).map(([k,label,g])=>{
    const p=c.prices?.[k]; const url=URLS[g](c);
    let v;
    if(!p) v = c.status==="pending" ? `<span class="pend"><span class="spin"></span>buscando</span>` : `<span class="v dim">não consultado</span>`;
    else if(p.status==="ok" && typeof p.value==="number") v = `<span class="v">${brl(p.value)}${p.fallback?`<span class="flag" title="Sem oferta ${esc(c.quality)}; maior preço em ${esc(p.quality)}">${esc(p.quality)}</span>`:""}</span>`;
    else v = `<span class="v dim">${({not_found:"sem oferta",blocked:"site bloqueou",needs_human:"confirme no PC",error:"erro"})[p.status]||"—"}</span>`;
    return `<div class="p"><span class="mk">${label}</span>${v}${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Abrir</a>`:"<span></span>"}</div>`;
  }).join("");
  const binderOpts = S.binders.map(b=>`<option value="${b.id}" ${(c.binderIds||[]).includes(b.id)?"selected":""}>${(c.binderIds||[]).includes(b.id)?"✓ ":""}${esc(b.name)}</option>`).join("");
  const pk = S.select ? (S.sel.has(c.id)?" picking picked":" picking") : "";
  return `<article class="slab${pk}" data-card="${c.id}" tabindex="0" aria-label="${esc(c.name)} ${esc(c.number)}">${S.select?`<span class="pick" aria-hidden="true">${S.sel.has(c.id)?"✓":""}</span>`:""}
    <header class="label"><div class="nm">${esc(c.name)}</div>
      <div class="grade"><b>${esc(c.quality||"NM")}</b><span>${esc(c.language||"")}</span></div>
      <div class="ed">${esc(c.setName||c.setCode||"")}${c.setYear?` ${esc(c.setYear)}`:""}</div>
      <div class="no"><span class="mono">${esc(c.number||"")}</span>${rarHtml(c)}${c.confidence&&c.confidence!=="alta"?`<span class="warnr">leitura ${esc(c.confidence)}</span>`:""}</div>
    </header>
    <div class="well">${c.img?`<img src="${c.img}" alt="" loading="lazy">`:`<span class="ph">sem imagem</span>`}</div>
    <div class="prices">${prices}</div>
    <div class="acts"><button class="star" data-fav="${c.id}" aria-pressed="${!!c.favorite}" aria-label="Favorita">${c.favorite?"Favorita":"Favoritar"}</button>
      <select data-bind="${c.id}" aria-label="Guardar em binder"><option value="">Guardar em binder…</option>${binderOpts}<option value="__new">+ Novo binder</option></select></div>
  </article>`;
}

function viewHistorico(){
  if(!S.scans.length) return `<div class="sec"><h2>Histórico</h2></div><div class="empty">Nenhuma consulta ainda.</div>`;
  return `<div class="sec"><h2>Histórico</h2></div><div class="list">${S.scans.map(s=>{ const cs=scanCards(s); const t=sums(cs);
    return `<button class="item" data-scan-open="${s.id}"><span class="t">${esc(s.title||"Consulta")}</span><span class="m">${cs.length} cartas · ${ago(s.createdAt)}</span>
    <span class="m">${ROWS.filter(([k])=>t[k]).map(([k,l])=>`${l} ${brl(t[k].s)}`).join(" · ")}</span></button>`; }).join("")}</div>`;
}
function secActs(cards, extra){ return `<div class="secacts">${cards.length?`<button class="btn" data-act="select-toggle" data-ids="${cards.map(c=>c.id).join(",")}">${S.select?"Cancelar seleção":"Selecionar"}</button>`:""}${extra||""}</div>`; }
function viewCardsBlock(title, cards, emptyMsg, back, extra){
  return `<div class="sec">${back||""}<h2>${esc(title)}</h2><span class="meta">${cards.length} cartas</span>${totalsHtml(cards)}${secActs(cards, extra)}</div>
    ${cards.length?`<div class="binder" style="--cols:4">${cards.map(c=>`<div class="pocket">${slab(c)}</div>`).join("")}</div>`:`<div class="empty">${esc(emptyMsg)}</div>`}`;
}
function viewBinders(){
  return `<div class="sec"><h2>Binders</h2><span class="meta">Separe por tema o que você quer comprar</span></div>
    <form class="newb" id="newb"><input id="newb-name" placeholder="Nome do binder (ex.: Compra do Rafael)" maxlength="60" required><button class="btn primary">Criar binder</button></form>
    ${S.binders.length?`<div class="list">${S.binders.map(b=>{ const cs=S.cards.filter(c=>(c.binderIds||[]).includes(b.id)); const t=sums(cs);
      return `<button class="item" data-binder-open="${b.id}"><span class="t">${esc(b.name)}</span><span class="m">${cs.length} cartas</span><span class="m">${ROWS.filter(([k])=>t[k]).map(([k,l])=>`${l} ${brl(t[k].s)}`).join(" · ")}</span></button>`; }).join("")}</div>`
      :`<div class="empty">Crie um binder e guarde cartas nele pelo seletor embaixo de cada carta.</div>`}`;
}
function viewBinder(id){
  const b=S.binders.find(x=>x.id===id); if(!b){ S.openBinder=null; return viewBinders(); }
  const cs=S.cards.filter(c=>(c.binderIds||[]).includes(id));
  const ex = cs.length ? `<button class="btn primary" data-act="export" data-fmt="pricecheck">Exportar planilha</button><button class="btn" data-act="export" data-fmt="liga">Exportar no formato da Liga</button>` : "";
  return viewCardsBlock(b.name, cs, "Nenhuma carta neste binder ainda.", `<button class="back" data-act="close-binder">← Binders</button>`, ex);
}

/* ---------- foto ---------- */
function loadImg(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file); const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error("Não consegui abrir essa imagem.")); i.src=u; }); }
function shrink(img, maxSide, q){
  const W=img.naturalWidth, H=img.naturalHeight; const k=Math.min(1,maxSide/Math.max(W,H));
  const cv=document.createElement("canvas"); cv.width=Math.round(W*k); cv.height=Math.round(H*k);
  cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
  return cv.toDataURL("image/jpeg",q);
}
async function sendPhoto(file){
  S.busy="Preparando a foto…"; render();
  try{
    const img = await loadImg(file);
    const photo = shrink(img, 2200, 0.88);
    const markets = MARKETS.map(m=>m[0]).filter(k=>S.markets[k]);
    const id = uid();
    S.busy="Enviando…"; render();
    await db.insert("scans", {id, title:`Consulta · ${new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}`, quality:S.quality, markets, photo, state:"analyzing"});
    S.busy=""; await refresh(); toast(pcOnline()?"Foto enviada ao seu PC":"Foto salva · o PC busca quando ligar");
  }catch(e){ S.busy=""; render(); toast("Não consegui enviar: "+(e.message||"erro")); }
}

/* ---------- eventos ---------- */
document.addEventListener("click", async e=>{
  const t=e.target.closest("button,[data-card],a"); if(!t) return;
  if(t.tagName==="A") return;
  if(t.dataset.tab){ S.view=t.dataset.tab; S.openScan=null; S.openBinder=null; S.select=false; S.sel.clear(); render(); scrollTo(0,0); return; }
  if(t.dataset.act==="select-toggle"){ S.select=!S.select; S.sel.clear(); if(t.dataset.ids) S.selScope=t.dataset.ids.split(","); render(); return; }
  if(t.dataset.act==="sel-all"){ S.selScope.forEach(id=>S.sel.add(id)); render(); return; }
  if(t.dataset.act==="sel-none"){ S.sel.clear(); render(); return; }
  if(t.dataset.act==="sel-fav"){ const ids=[...S.sel]; await bulk(ids,c=>c.favorite?null:{favorite:true},"Favoritadas"); return; }
  if(t.dataset.act==="sel-unbind"){ const bid=S.openBinder; const ids=[...S.sel]; S.sel.clear(); await bulk(ids,c=>({binderIds:(c.binderIds||[]).filter(x=>x!==bid)}),"Tiradas do binder"); return; }
  if(t.dataset.act==="export"){ doExport(t.dataset.fmt); return; }
  if(t.dataset.q){ S.quality=t.dataset.q; render(); return; }
  if(t.dataset.mk){ S.markets[t.dataset.mk]=!S.markets[t.dataset.mk]; if(!Object.values(S.markets).some(Boolean)) S.markets[t.dataset.mk]=true; store("sc-prefs",{markets:S.markets}); render(); return; }
  if(t.dataset.act==="gallery"){ e.preventDefault(); $("#gal").click(); return; }
  if(t.dataset.act==="refire"){ t.disabled=true; const sid=t.dataset.scan; const sc=S.scans.find(s=>s.id===sid);
    try{
      if(sc && (sc.state==="error")) await db.update("scans",sid,{state:"analyzing",message:null});
      for(const c of S.cards.filter(c=>c.scanId===sid && c.status!=="pending")){
        const bad=Object.values(c.prices||{}).some(p=>p&&p.status!=="ok"&&p.status!=="not_found");
        if(c.status!=="done"||bad) await db.update("cards",c.id,{status:"pending"});
      }
      await refresh(); toast("Pedido de novo enviado ao PC");
    }catch(err){ toast("Não consegui: "+err.message); } return; }
  if(t.dataset.act==="del-scan"){ if(!confirm("Apagar esta consulta e as cartas dela?")) return; try{ await db.del("scans",t.dataset.scan); S.openScan=null; await refresh(); toast("Consulta apagada"); }catch(err){ toast("Não consegui apagar."); } return; }
  if(t.dataset.act==="close-scan"){ S.openScan=null; render(); return; }
  if(t.dataset.act==="close-binder"){ S.openBinder=null; render(); return; }
  if(t.dataset.act==="close-modal"){ $("#modal-root").innerHTML=""; return; }
  if(t.dataset.scanOpen){ S.openScan=t.dataset.scanOpen; render(); scrollTo(0,0); return; }
  if(t.dataset.binderOpen){ S.openBinder=t.dataset.binderOpen; render(); scrollTo(0,0); return; }
  if(t.dataset.fav){ const c=S.cards.find(x=>x.id===t.dataset.fav); if(c) patchCard(c.id,{favorite:!c.favorite}).catch(()=>toast("Não consegui salvar.")); return; }
  if(t.dataset.card && S.select && !e.target.closest("a")){ e.preventDefault(); const id=t.dataset.card; S.sel.has(id)?S.sel.delete(id):S.sel.add(id); render(); return; }
  if(t.dataset.card && !e.target.closest("select,.acts,a")){ const c=S.cards.find(x=>x.id===t.dataset.card); if(c) openModal(c); }
});
document.addEventListener("keydown",e=>{ if(e.key==="Escape") $("#modal-root").innerHTML=""; if(e.key==="Enter" && e.target.matches?.(".binder .slab")){ const c=S.cards.find(x=>x.id===e.target.dataset.card); if(c) openModal(c);} });
document.addEventListener("change", async e=>{
  const t=e.target;
  if(t.id==="cam"||t.id==="gal"){ const f=t.files?.[0]; if(f) sendPhoto(f); t.value=""; return; }
  if(t.id==="sel-bind"){ const v=t.value; t.value=""; if(!v) return; const ids=[...S.sel];
    if(v==="__new"){ S.pendingCards=ids; S.select=false; S.sel.clear(); S.view="binders"; S.openBinder=null; render(); $("#newb-name")?.focus(); toast(`Dê um nome ao binder; ${ids.length} cartas entram nele`); return; }
    await bulk(ids,c=>(c.binderIds||[]).includes(v)?null:{binderIds:[...(c.binderIds||[]),v]},"Guardadas no binder"); return; }
  if(t.dataset.bind!==undefined){ const c=S.cards.find(x=>x.id===t.dataset.bind); const v=t.value; t.value="";
    if(!c||!v) return;
    if(v==="__new"){ S.view="binders"; S.pendingCard=c.id; render(); $("#newb-name")?.focus(); toast("Dê um nome ao binder; a carta entra nele"); return; }
    const ids=new Set(c.binderIds||[]); const had=ids.has(v); had?ids.delete(v):ids.add(v);
    await patchCard(c.id,{binderIds:[...ids]}).catch(()=>{});
    toast(had?"Removida do binder":"Guardada no binder"); }
});
document.addEventListener("submit", async e=>{
  if(e.target.id==="keyform"){ e.preventDefault(); store("pc-key",$("#keyin").value.trim()); await refresh(); return; }
  if(e.target.id!=="newb") return; e.preventDefault();
  const name=$("#newb-name").value.trim(); if(!name) return;
  const id=uid();
  try{ await db.insert("binders",{id,name}); }catch(err){ toast("Não consegui criar."); return; }
  if(S.pendingCard){ const c=S.cards.find(x=>x.id===S.pendingCard); if(c) await patchCard(c.id,{binderIds:[...(c.binderIds||[]),id]}).catch(()=>{}); S.pendingCard=null; }
  if(S.pendingCards){ const ids=S.pendingCards; S.pendingCards=null; await bulk(ids,c=>({binderIds:[...(c.binderIds||[]),id]}),"Guardadas no novo binder"); }
  await refresh(); toast("Binder criado");
});
function openModal(c){ $("#modal-root").innerHTML=`<div class="modal" data-act="close-modal" role="dialog" aria-modal="true" aria-label="${esc(c.name)}"><button class="close" data-act="close-modal" >Fechar</button>${slab(c)}</div>`;
  $("#modal-root .modal").addEventListener("click",ev=>{ if(ev.target.classList.contains("modal")) $("#modal-root").innerHTML=""; }); }

/* ---------- sincronização ---------- */
let busyRefresh=false;
async function refresh(){
  if(!KEY()){ render(); return; }
  if(busyRefresh) return; busyRefresh=true;
  try{
    const [scans, cards, binders, worker] = await Promise.all([
      db.list("scans","select=id,title,created_at,quality,markets,layout,rows,cols,card_count,state,message,tips,worker_at&order=created_at.desc&limit=60"),
      db.list("cards","select=*&order=created_at.desc&limit=800"),
      db.list("binders","select=*&order=created_at.asc"),
      db.list("worker","select=*&id=eq.main"),
    ]);
    S.scans=scans; S.cards=cards; S.binders=binders; S.worker=worker[0]||null; S.loaded=true;
    const m=$("#modal-root .slab"); if(m){ const c=S.cards.find(x=>x.id===m.dataset.card); if(c) openModal(c); }
  }catch(e){
    if(/^40[13]/.test(e.message)||/row-level|42501/.test(e.message)){ store("pc-key",""); toast("Código de acesso inválido."); }
    else toast("Sem conexão com o banco. Tentando de novo…");
  }
  busyRefresh=false;
  const sel=document.activeElement; if(!(sel && (sel.tagName==="SELECT"||sel.tagName==="INPUT"))) render();
}
function active(){ return S.scans.some(s=>s.state==="analyzing") || S.cards.some(c=>c.status==="pending"); }
async function loop(){ await refresh(); setTimeout(loop, document.hidden ? 30000 : (active()?3000:15000)); }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refresh(); });
wide.addEventListener?.("change", render);
render(); loop();
})();
