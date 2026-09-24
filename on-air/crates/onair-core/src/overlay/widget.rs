//! Eigenständige Widget-Seiten (ohne externe Abhängigkeiten).

pub const INDEX_HTML: &str = r#"<!doctype html><html lang="de"><head><meta charset="utf-8"><title>ON AIR Overlay</title>
<style>body{background:#101114;color:#ECEDEE;font:15px/1.5 system-ui,'Segoe UI',sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}
a{color:#7FD6B5}code{background:#191B20;padding:.1rem .35rem;border-radius:6px}</style></head><body>
<h1 style="font-weight:600">ON AIR – Overlay-Server</h1>
<p>Dieser Server läuft nur auf deinem Rechner. Füge in OBS eine <b>Browser-Quelle</b> mit einer dieser Adressen hinzu:</p>
<ul><li><a href="/widget/minimal">/widget/minimal</a> – Cover, Titel, Interpret</li>
<li><a href="/widget/glass">/widget/glass</a> – transparente Karte mit Fortschritt</li>
<li><a href="/widget/queue">/widget/queue</a> – aktueller Song und nächste Requests</li></ul>
<p>Die Adressen kannst du in ON AIR unter <b>Widgets</b> mit einem Klick kopieren.</p></body></html>"#;

pub const WIDGET_HTML: &str = r#"<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ON AIR Widget</title>
<style>
:root{--text:#F4F4F5;--muted:#B4B7BD;--accent:#7FD6B5;--bg:16,17,20;--bgo:0;--radius:14px;--w:520px;--scale:1;--font:system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;overflow:hidden}
body{font-family:var(--font);color:var(--text);font-size:calc(16px*var(--scale));-webkit-font-smoothing:antialiased;padding:12px}
#root{width:var(--w);max-width:calc(100vw - 24px);opacity:0;transform:translateY(6px);transition:opacity .22s ease,transform .22s ease}
#root.show{opacity:1;transform:none}
.noanim #root,.noanim .swap{transition:none!important}
.card{border-radius:var(--radius);background:rgba(var(--bg),var(--bgo));padding:calc(12px*var(--scale))}
.glass .card{border:1px solid rgba(255,255,255,.09);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.minimal .card{padding:0;background:transparent}
.minimal .t,.minimal .a{text-shadow:0 1px 3px rgba(0,0,0,.65),0 0 12px rgba(0,0,0,.35)}
.row{display:flex;align-items:center;gap:calc(12px*var(--scale));min-width:0}
.cover{flex:none;width:calc(64px*var(--scale));height:calc(64px*var(--scale));border-radius:calc(var(--radius)*.55);object-fit:cover;background:rgba(255,255,255,.06)}
.glass .cover{width:calc(72px*var(--scale));height:calc(72px*var(--scale))}
.meta{min-width:0;flex:1}
.t{font-weight:650;font-size:1.05em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.005em}
.a{color:var(--muted);font-size:.9em;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.req{color:var(--accent);font-size:.78em;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{height:3px;border-radius:3px;background:rgba(255,255,255,.14);margin-top:8px;overflow:hidden}
.bar>i{display:block;height:100%;width:0;background:var(--accent);border-radius:3px}
.swap{transition:opacity .18s ease}
.swap.out{opacity:0}
.label{font-size:.7em;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:10px 0 6px}
.q{list-style:none;display:grid;gap:6px}
.q li{display:flex;align-items:center;gap:8px;min-width:0;font-size:.88em}
.q img{width:calc(32px*var(--scale));height:calc(32px*var(--scale));border-radius:6px;object-fit:cover;flex:none;background:rgba(255,255,255,.06)}
.q .qm{min-width:0;flex:1}
.q .qt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.q .qr{color:var(--muted);font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{position:fixed;right:8px;bottom:8px;font:600 11px system-ui;letter-spacing:.06em;color:#101114;background:#F2C66D;padding:3px 7px;border-radius:6px}
</style></head>
<body class="__PRESET__"><div id="root"></div>
<script>
"use strict";
const PRESET="__PRESET__", PREVIEW=__PREVIEW__;
const SAMPLE={status:"live",now:{title:"Beispieltitel mit etwas längerem Namen",artists:["Beispiel-Interpret"],album:"Vorschau",image_url:null,duration_ms:215000,progress_ms:84000,is_playing:true,fetched_at_ms:Date.now(),requester:"Zuschauerin"},
 queue:[{title:"Zweiter Beispielsong",artists:["Band A"],requester:"viewer_1",image_url:null},{title:"Dritter Beispielsong",artists:["Band B"],requester:"viewer_2",image_url:null},{title:"Vierter Beispielsong",artists:["Band C"],requester:"viewer_3",image_url:null}]};
let st=null, lastMsg=0, offset=0, key="";
const root=document.getElementById("root");
if(PREVIEW){const b=document.createElement("div");b.className="badge";b.textContent="VORSCHAU · BEISPIELDATEN";document.body.appendChild(b);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function hexToRgb(h){const m=/^#?([0-9a-f]{6})$/i.exec(h||"");if(!m)return"16,17,20";const n=parseInt(m[1],16);return[(n>>16)&255,(n>>8)&255,n&255].join(",");}
function applyStyle(s){if(!s)return;const r=document.documentElement.style;
 r.setProperty("--text",s.text_color);r.setProperty("--muted",s.secondary_color);r.setProperty("--accent",s.accent_color);
 r.setProperty("--bg",hexToRgb(s.background_color));r.setProperty("--bgo",String(s.background_opacity));
 r.setProperty("--radius",s.radius+"px");r.setProperty("--w",s.width+"px");r.setProperty("--scale",String(s.font_scale||1));r.setProperty("--font",s.font_family);
 const reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
 document.body.classList.toggle("noanim",!s.animate||reduce);}
function cover(url,cls){return url?`<img class="${cls}" src="${esc(url)}" alt="" referrerpolicy="no-referrer">`:`<div class="${cls}"></div>`;}
function nowAge(n){return (Date.now()+offset)-n.fetched_at_ms;}
function visible(){
 if(!st||!st.now)return false;
 if(!PREVIEW&&Date.now()-lastMsg>12000)return false;          // Server nicht erreichbar
 if(!PREVIEW&&st.status!=="live")return false;
 if(!PREVIEW&&nowAge(st.now)>st.stale_after_ms)return false;   // veraltete Daten
 if(st.style&&st.style.hide_when_paused&&!st.now.is_playing)return false;
 return true;}
function build(){
 const s=st.style||{}, n=st.now, artist=esc((n.artists||[]).join(", "));
 let h=`<div class="card"><div class="row swap">${s.show_cover!==false?cover(n.image_url,"cover"):""}<div class="meta"><div class="t">${esc(n.title)}</div><div class="a">${artist}</div>`;
 if(s.show_requester&&n.requester&&PRESET!=="minimal")h+=`<div class="req">Wunsch von ${esc(n.requester)}</div>`;
 if(s.show_progress&&PRESET!=="minimal")h+=`<div class="bar"><i id="p"></i></div>`;
 h+=`</div></div>`;
 if(PRESET==="queue"){
  if(st.queue.length){h+=`<div class="label">Als Nächstes</div><ul class="q">`+st.queue.map(q=>`<li>${s.show_cover!==false?cover(q.image_url,""):""}<div class="qm"><div class="qt">${esc(q.title)} – ${esc((q.artists||[]).join(", "))}</div>${s.show_requester?`<div class="qr">${esc(q.requester)}</div>`:""}</div></li>`).join("")+`</ul>`;}
 }
 return h+`</div>`;}
function render(){
 if(!st)return; applyStyle(st.style);
 const show=visible(); root.classList.toggle("show",show);
 if(!show)return;
 const k=JSON.stringify([st.now.title,st.now.artists,st.now.image_url,st.now.requester,st.queue,st.style]);
 if(k!==key){
  const first=key==="";key=k;
  const sw=root.querySelector(".swap");
  if(!first&&sw&&!document.body.classList.contains("noanim")){sw.classList.add("out");setTimeout(()=>{root.innerHTML=build();tick();},180);}
  else{root.innerHTML=build();}
 }
 tick();}
function tick(){
 const p=document.getElementById("p"); if(!p||!st||!st.now)return;
 const n=st.now; let pr=n.progress_ms+(n.is_playing?Math.max(0,nowAge(n)):0);
 if(n.duration_ms>0)pr=Math.min(pr,n.duration_ms);
 p.style.width=(n.duration_ms?100*pr/n.duration_ms:0)+"%";}
function onData(d){
 lastMsg=Date.now(); offset=d.server_time_ms-Date.now();
 st=PREVIEW?Object.assign({},SAMPLE,{style:d.style,stale_after_ms:d.stale_after_ms,now:Object.assign({},SAMPLE.now,{fetched_at_ms:d.server_time_ms})}):d;
 render();}
function connect(){
 // EventSource verbindet sich nach einem App-Neustart selbstständig wieder.
 const es=new EventSource("/api/events?preset="+encodeURIComponent(PRESET));
 es.addEventListener("state",e=>{try{onData(JSON.parse(e.data));}catch(_){}});}
connect();
setInterval(()=>{if(st){render();}},1000);
</script></body></html>"#;
