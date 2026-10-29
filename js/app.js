/* PromptCoach app logic: interview, blueprint, prompt generation. */
(function(){
"use strict";
const BUILTIN=new Set(DEFAULT_TOPICS.map(t=>t.id));
const KEY_S="promptcoach.web.session.v1", KEY_G="promptcoach.web.guide.v1", KEY_I="promptcoach.web.intro.v1";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const load=(k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch(e){return f}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};

let topics=load(KEY_G,null)||DEFAULT_TOPICS.map(t=>({...t}));
function fresh(){return{messages:[{role:"coach",text:WELCOME,topic:"idea"}],spec:{},covered:[],current:"idea",confirmed:{},options:[],prompt:""}}
let state=load(KEY_S,null)||fresh();
let sample=null, aiMode="pending", busy=false, ctl=null, lastErr=null;
const persist=()=>save(KEY_S,state);

/* ---------- spec helpers ---------- */
const arr=v=>Array.isArray(v)?v:[];
function sectionData(id){
  const s=state.spec, n=(s.notes||{})[id]||"";
  switch(id){
    case"idea":return[s.app_name,s.one_liner,s.problem,n];
    case"users":return[arr(s.users),n];
    case"features":return[arr(s.features),n];
    case"flow":{const l=s.layout||{};return[l.top,l.bottom,l.other,arr(s.flow),n]}
    case"pages":return[pagesOf(s).map(p=>({name:p.name,parent:p.parent,inNav:p.inNav})),n];
    case"screens":return[pagesOf(s).filter(p=>p.sections.length).map(p=>({name:p.name,sections:p.sections})),n];
    case"data":return[arr(s.data),n];
    case"look":return[s.style,n];
    case"platform":return[s.platform,arr(s.constraints),n];
    case"success":return[arr(s.success),n];
    default:return[n];
  }
}
/* Pages: a tree (parent) with sections top to bottom. The "pages" topic fills the tree, "screens" the sections.
   Older sessions only have flat "screens". */
const SEC_TYPES=["hero","text","cards","gallery","form","testimonials","map","cta","faq","footer"];
function pagesOf(s){
  let pages=arr(s.pages).filter(p=>p&&p.name).map((p,i)=>({id:String(p.id||"p"+i),name:String(p.name),parent:p.parent?String(p.parent):null,inNav:p.inNav!==false,
    sections:arr(p.sections).map(x=>typeof x==="string"?{type:"text",content:x}:x).filter(x=>x&&typeof x==="object")}));
  if(!pages.length)pages=arr(s.screens).filter(x=>x&&x.name).map((x,i)=>{const c=Array.isArray(x.contents)?x.contents:String(x.contents||"").split(/[,;\n]/).map(t=>t.trim()).filter(Boolean);
    return{id:"s"+i,name:String(x.name),parent:null,inNav:true,sections:c.map(t=>({type:"text",content:String(t)}))}});
  if(!pages.length)pages=notePages(s.notes||{});
  const byId=new Map(pages.map(p=>[p.id,p]));
  pages.forEach(p=>{const seen=new Set();let q=p;while(q&&q.parent){if(seen.has(q.id)||!byId.has(q.parent)){p.parent=null;break}seen.add(q.id);q=byId.get(q.parent)}});
  return pages;
}
/* Without the AI, the Pages answer is only free text, e.g. "Home: welcome and prices, About, Booking and Contact".
   Guess the page names from it: one per line, comma or "and"/"og"; text after a colon becomes the page's content. */
function pagesFromNote(note){
  const seen=new Set(), out=[];
  String(note||"").split(/[\n;]+/).forEach(line=>line.split(",").forEach(part=>{
    const m=part.match(/^([^:]+):(.*)$/), names=m?[m[1]]:part.split(/\s+(?:and|og|&)\s+/i);
    names.forEach(raw=>{
      const name=raw.trim().replace(/^[-*•\d.)\s]+/,"").replace(/^(?:an?|the|en|et)\s+/i,"").replace(/\s+(?:pages?|sider?|siden)$/i,"").replace(/[.!]+$/,"").trim();
      if(!name||name.split(/\s+/).length>4||seen.has(name.toLowerCase()))return;
      seen.add(name.toLowerCase());
      const content=m?m[2].trim():"";
      out.push({id:"n"+out.length,name:name[0].toUpperCase()+name.slice(1),parent:null,inNav:true,sections:content?[{type:"text",content}]:[]});
    });
  }));
  return out;
}
/* Scripted mode: page names come from the Pages answer, and "Name: content" lines in the Screens layout answer
   are added to the matching page. Without a Pages answer, the Screens layout answer is used on its own. */
function notePages(n){
  const pages=pagesFromNote(n.pages), lay=pagesFromNote(n.screens);
  if(!pages.length)return lay;
  lay.forEach(l=>{const p=pages.find(x=>x.name.toLowerCase()===l.name.toLowerCase());if(p)p.sections.push(...l.sections)});
  return pages;
}
function siteMap(pages){
  const kids=id=>pages.filter(p=>p.parent===id), linked=new Set(pages.flatMap(p=>p.sections.map(x=>x.to)).filter(Boolean));
  const node=p=>`<li><button type="button" class="sm-node${p.inNav?"":" off"}" data-wf="${esc(p.id)}" title="Go to the ${esc(p.name)} wireframe">${esc(p.name)}${p.inNav?"":"<small>not in menu</small>"}</button>${kids(p.id).length?`<ul>${kids(p.id).map(node).join("")}</ul>`:""}</li>`;
  const lost=pages.filter(p=>!p.inNav&&!p.parent&&!linked.has(p.id)), them=lost.length>1?"them":"it";
  return`<div class="sitemap"><ul class="tree"><li><span class="sm-root">${esc(state.spec.app_name||"Website")}</span><ul>${kids(null).map(node).join("")}</ul></li></ul>`
    +(lost.length?`<p class="warn">Visitors can't reach ${lost.map(p=>esc(p.name)).join(", ")}. Add ${them} to the menu or link to ${them} from another page.</p>`:"")+`</div>`;
}
const SKETCH={hero:"<i></i><i></i>",cards:"<i></i><i></i><i></i>",gallery:"<i></i>".repeat(6),form:"<i></i><i></i><i></i>"};
/* Links and menu items inside a wireframe jump to the wireframe of the page they lead to. */
function wireframe(p,pages){
  const nav=pages.filter(q=>q.inNav&&!q.parent), byId=new Map(pages.map(q=>[q.id,q])), lay=state.spec.layout||{};
  const frame=(t,x)=>x?`<div class="wf-frame"><span class="wf-type">${t}</span><span>${esc(x)}</span></div>`:"";
  const secs=p.sections.map(x=>{const t=SEC_TYPES.includes(x.type)?x.type:"text", to=byId.get(x.to);
    return`<div class="wf-sec t-${t}"><span class="wf-type">${esc(x.type||"section")}</span>${SKETCH[t]?`<div class="sk sk-${t}">${SKETCH[t]}</div>`:""}${x.content?`<span>${esc(x.content)}</span>`:""}${to?`<button type="button" class="wf-link" data-wf="${esc(to.id)}">→ ${esc(to.name)}</button>`:""}</div>`}).join("");
  return`<div class="wf" data-page="${esc(p.id)}"><div class="wf-bar">${esc(p.name)}</div>${nav.length?`<div class="wf-nav">${nav.map(q=>`<button type="button" data-wf="${esc(q.id)}"${q===p||q.id===p.parent?' class="on"':""}>${esc(q.name)}</button>`).join("")}</div>`:""}${frame("top of every page",lay.top)}<div class="wf-body">${secs||`<span class="none">Sections appear here as you tell the coach what goes on this page.</span>`}</div>${frame("bottom of every page",lay.bottom)}</div>`;
}
function hasContent(id){return sectionData(id).some(v=>Array.isArray(v)?v.length:!!(v&&String(v).trim()))}
const sig=id=>JSON.stringify(sectionData(id));
const isConfirmed=id=>hasContent(id)&&state.confirmed[id]===sig(id);
const label=id=>(topics.find(t=>t.id===id)||{}).label||id;

/* ---------- rendering ---------- */
function renderProgress(){
  const segs=$("segs"); segs.innerHTML="";
  topics.forEach(t=>{const d=document.createElement("div");d.className="seg"+(isConfirmed(t.id)?" conf":state.covered.includes(t.id)?" cov":"")+(state.current===t.id?" cur":"");d.title=t.label;segs.appendChild(d)});
  const cov=topics.filter(t=>state.covered.includes(t.id)).length, conf=topics.filter(t=>isConfirmed(t.id)).length;
  $("progLabel").textContent=`${cov} of ${topics.length} topics covered · ${conf} confirmed`+(state.current&&cov<topics.length?` · now: ${label(state.current)}`:"");
}
function renderLog(){
  const log=$("log"); log.innerHTML="";
  state.messages.forEach((m,i)=>{
    const d=document.createElement("div"); d.className="msg "+m.role;
    if(m.role==="coach"){d.innerHTML=`<span class="who">Coach${m.topic&&topics.some(t=>t.id===m.topic)?`<span class="topic">· ${esc(label(m.topic))}</span>`:""}</span>`;d.appendChild(document.createTextNode(m.text));
      if(i===0&&state.messages.length===1){const ex=document.createElement("div");ex.className="examples";EXAMPLES.forEach(e=>{const b=document.createElement("button");b.type="button";b.className="opt";b.textContent=e;b.onclick=()=>send(e);ex.appendChild(b)});d.appendChild(ex)}}
    else d.textContent=m.text;
    log.appendChild(d);
  });
  if(busy){const t=document.createElement("div");t.className="msg coach thinking";t.textContent="Thinking…";log.appendChild(t)}
  if(lastErr){const e=document.createElement("div");e.className="msg coach err";e.textContent=lastErr+" ";const b=document.createElement("button");b.className="btn sm";b.type="button";b.textContent="Try again";b.onclick=()=>{lastErr=null;coachTurn()};e.appendChild(b);log.appendChild(e)}
  const o=$("opts"); o.innerHTML="";
  if(!busy&&!lastErr) arr(state.options).forEach(t=>{const b=document.createElement("button");b.type="button";b.className="opt";b.textContent=t;b.onclick=()=>send(t);o.appendChild(b)});
  log.scrollTop=log.scrollHeight;
  $("sendBtn").disabled=busy;
}
function body(id){
  const s=state.spec, n=(s.notes||{})[id], h=[];
  switch(id){
    case"idea":
      if(s.app_name)h.push(`<div class="app-name">${esc(s.app_name)}</div>`);
      if(s.one_liner)h.push(`<p class="one">${esc(s.one_liner)}</p>`);
      if(s.problem)h.push(`<div><div class="k">Problem it solves</div><p>${esc(s.problem)}</p></div>`);break;
    case"users":
      if(arr(s.users).length)h.push(`<div class="persons">${arr(s.users).map(u=>`<div class="person"><b>${esc(u.name)}</b><span>${esc(u.need)}</span></div>`).join("")}</div>`);break;
    case"features":
      if(arr(s.features).length){const col=(p,t)=>{const f=arr(s.features).filter(x=>(x.priority||"must").toLowerCase()===p);return`<div class="mcol ${p}"><h4>${t}</h4>${f.length?f.map(x=>`<div class="feat"><b>${esc(x.name)}</b>${x.detail?`<span>${esc(x.detail)}</span>`:""}</div>`).join(""):`<span class="none">Nothing yet</span>`}</div>`};
        h.push(`<div class="moscow">${col("must","Must have")}${col("should","Should have")}${col("could","Could have")}</div>`)}break;
    case"flow":{const l=s.layout||{};
      [["Top of every page",l.top],["Bottom of every page",l.bottom],["Other layout rules",l.other]].forEach(([k,v])=>{if(v)h.push(`<div><div class="k">${k}</div><p>${esc(v)}</p></div>`)});
      if(arr(s.flow).length)h.push(`<ol class="flow">${arr(s.flow).map(x=>`<li><span class="box">${esc(x)}</span></li>`).join("")}</ol>`);break}
    case"pages":{const pg=pagesOf(s), nm=id=>(pg.find(p=>p.id===id)||{}).name;
      if(pg.length)h.push(`<ul class="pagelist">${pg.map(p=>`<li><b>${esc(p.name)}</b>${p.parent?`<small>under ${esc(nm(p.parent))}</small>`:""}${p.inNav?"<small>in menu</small>":"<small>not in menu</small>"}</li>`).join("")}</ul>`,
        `<button type="button" class="btn sm" data-pane-go="wf" style="align-self:flex-start">See site map</button>`);break}
    case"screens":{const pg=pagesOf(s).filter(p=>p.sections.length);
      if(pg.length)h.push(`<ul class="pagelist">${pg.map(p=>`<li><b>${esc(p.name)}</b><span>${p.sections.map(x=>esc(x.type||"section")).join(" · ")}</span></li>`).join("")}</ul>`,
        `<button type="button" class="btn sm" data-pane-go="wf" style="align-self:flex-start">See wireframes</button>`);break}
    case"data":
      if(arr(s.data).length)h.push(`<div class="entities">${arr(s.data).map(x=>`<div class="entity"><b>${esc(x.entity)}</b><ul>${arr(x.fields).map(f=>`<li>${esc(f)}</li>`).join("")}</ul></div>`).join("")}</div>`);break;
    case"look":if(s.style)h.push(`<p>${esc(s.style)}</p>`);break;
    case"platform":
      if(s.platform)h.push(`<div><div class="k">Details</div><p>${esc(s.platform)}</p></div>`);
      if(arr(s.constraints).length)h.push(`<div><div class="k">Must have / must not have</div><ul class="bul">${arr(s.constraints).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`);break;
    case"success":
      if(arr(s.success).length)h.push(`<ul class="checks">${arr(s.success).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`);break;
  }
  if(n)h.push(`<div class="note">${esc(n)}</div>`);
  return h.join("");
}
function renderSections(){
  const wrap=$("sections"); wrap.innerHTML="";
  $("bpTitle").textContent=state.spec.app_name?`Blueprint: ${state.spec.app_name}`:"Blueprint";
  topics.forEach(t=>{
    const has=hasContent(t.id), conf=isConfirmed(t.id), cov=state.covered.includes(t.id), cur=state.current===t.id&&!cov;
    const sec=document.createElement("article");
    sec.className="sec"+(has?"":" empty")+(conf?" confirmed":"")+(state.current===t.id?" current":"");
    const pill=conf?`<span class="pill ok">Confirmed</span>`:cov?`<span class="pill cov">Covered, please check</span>`:cur?`<span class="pill cur">Being asked now</span>`:has?`<span class="pill cov">In progress</span>`:`<span class="pill">Not asked yet</span>`;
    sec.innerHTML=`<div class="sec-h"><h3>${esc(t.label)}</h3>${pill}</div>`+(has?body(t.id):`<p class="placeholder">${esc(t.hint)}</p>`);
    if(has){const row=document.createElement("div");row.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
      const c=document.createElement("button");c.type="button";c.className="btn sm"+(conf?"":" primary");c.textContent=conf?"Undo confirm":"Looks right";
      c.onclick=()=>{if(conf)delete state.confirmed[t.id];else state.confirmed[t.id]=sig(t.id);persist();renderAll()};
      const ch=document.createElement("button");ch.type="button";ch.className="btn sm";ch.textContent="Change";
      ch.onclick=()=>{setView("chat");const m=$("msg");m.value=`About "${t.label}": `;m.focus();m.setSelectionRange(m.value.length,m.value.length)};
      row.append(c,ch);sec.appendChild(row)}
    wrap.appendChild(sec);
  });
  const unc=topics.filter(t=>hasContent(t.id)&&!isConfirmed(t.id)).length, missing=topics.filter(t=>!hasContent(t.id)).length;
  $("genHint").textContent=!topics.some(t=>hasContent(t.id))?"Answer a few questions first. The prompt is built from your blueprint."
    :missing||unc?`${missing?missing+" section"+(missing>1?"s are":" is")+" still empty. ":""}${unc?unc+" section"+(unc>1?"s aren't":" isn't")+" confirmed yet, so "+(unc>1?"they":"it")+" will be marked as not confirmed in the prompt.":""}`
    :"Everything is confirmed. Your prompt will use exactly these requirements.";
  $("genBtn").disabled=busy||!topics.some(t=>hasContent(t.id));
  if(state.prompt){$("out").hidden=false;$("out").textContent=state.prompt;$("copyBtn").hidden=false}else{$("out").hidden=true;$("copyBtn").hidden=true}
}
function renderNotice(){
  const n=$("notice"), allCov=topics.every(t=>state.covered.includes(t.id));
  n.innerHTML="";
  if(aiMode==="scripted"){n.hidden=false;n.textContent="The AI coach isn't available in this view, so I'm asking the standard guide questions in order. Your blueprint and prompt still work."}
  else if(allCov&&!topics.every(t=>isConfirmed(t.id))){n.hidden=false;n.append("All topics are covered. Check each blueprint section and confirm it, then generate your prompt. ");const b=document.createElement("button");b.className="btn sm";b.type="button";b.textContent="Open blueprint";b.onclick=()=>{setView("bp");setPane("bp")};n.appendChild(b)}
  else n.hidden=true;
}
function renderWireframes(){
  /* Every website starts with a home page, so show one until the coach has the real pages. */
  let pg=pagesOf(state.spec); if(!pg.length)pg=[{id:"home",name:"Home",parent:null,inNav:true,sections:[]}];
  $("siteMap").innerHTML=siteMap(pg)+`<div class="k">Wireframes</div><div class="wfs">${pg.map(p=>wireframe(p,pg)).join("")}</div>`;
}
function renderAll(){renderProgress();renderLog();renderSections();renderWireframes();renderNotice()}


/* ---------- interview ---------- */
function send(text){
  text=String(text||"").trim(); if(!text||busy)return;
  state.messages.push({role:"user",text}); state.options=[]; lastErr=null; $("msg").value=""; autoGrow();
  persist(); coachTurn();
}
const SCHEMA=`{"app_name":"","one_liner":"","problem":"","users":[{"name":"","need":""}],"features":[{"name":"","detail":"","priority":"must|should|could"}],"layout":{"top":"","bottom":"","other":""},"pages":[{"id":"home","name":"","parent":null,"inNav":true,"sections":[{"type":"${SEC_TYPES.join("|")}","content":"","to":"<page id, or omit>"}]}],"data":[{"entity":"","fields":["field"]}],"style":"","platform":"","constraints":[""],"success":[""],"notes":{"<topic id>":"summary"}}`;
function coachPrompt(){
  const guide=topics.map(t=>`- id "${t.id}" — ${t.label}: ${t.hint}${state.covered.includes(t.id)?" [COVERED]":""}`).join("\n");
  const convo=state.messages.slice(-12).map(m=>(m.role==="coach"?"COACH: ":"USER: ")+m.text).join("\n");
  const customs=topics.filter(t=>!BUILTIN.has(t.id)).map(t=>t.id);
  return `You are PromptCoach, a friendly interviewer. You help a non-technical person who builds with "vibe coding" tools turn their idea for a WEBSITE into clear, complete requirements. Only websites are in scope: if the user describes something else (a phone app, a game, software), kindly explain that PromptCoach makes websites and help them shape the idea into a website.

How to interview:
- Ask exactly ONE question per reply, in plain everyday language. Avoid jargon; if a technical word is unavoidable, explain it in a few words.
- Adapt to their idea. If the last answer was vague, incomplete or contradicts something earlier, ask a short follow-up about it before moving on. Make questions concrete and specific to their website (mention their site, visitors, pages and features by name). Think like a web designer: ask about things a website needs that a non-technical person forgets, such as the home page message, navigation, contact details, mobile use and calls to action.
- Over the conversation you MUST cover every topic in the interview guide. When the current topic is answered well enough, move to the uncovered topic that follows most naturally.
- Offer 2 to 4 short suggested answers the user can tap, tailored to their idea. Suggestions are options, not decisions.
- Never add requirements the user has not said or agreed to. If the user picks a suggestion, it counts as agreed.
- If the user writes 'About "<section>": ...', they are correcting that section: update it and confirm briefly what you changed, then continue.
- When every topic is covered, say so briefly and ask them to check and confirm the blueprint on the right.
- Keep "reply" under 70 words. Brief encouragement is fine, flattery is not.

Interview guide (topic id, name, what to learn):
${guide}

How topics map to the blueprint: idea → app_name, one_liner, problem; users → users; features → features (priority must/should/could, default must); flow → layout (top: what is at the top of every page, like logo and menu; bottom: what is at the bottom of every page, like contact details; other: any other rule for all pages); pages → pages (id: short lowercase slug; name; parent: id of the page it sits under, or null; inNav: true if it is in the main menu); screens → the "sections" of each page in pages (top to bottom, each with a type, a few words of content, and "to" = page id when a button or link in it leads to another page; add a page if the user describes one that is not in the list yet). "pages" is one list holding both: whenever you change it, send the whole list with every page's existing sections. data → data; look → style; platform → platform (languages and other practical details) and constraints (must have / must not have); success → success (testable checks).${customs.length?` Topics ${customs.map(c=>`"${c}"`).join(", ")} → notes["<id>"] as a short summary.`:""} Write blueprint entries in short plain phrases, from the user's answers only.

Current blueprint JSON:
${JSON.stringify(state.spec)}

Conversation so far:
${convo}

Reply with ONLY one JSON object:
{"reply": "your next message", "options": ["suggested answer", "..."], "topic": "<id of the topic your question is about>", "covered": ["<ids of topics answered well enough so far>"], "changes": {}}
"changes" holds ONLY the top-level blueprint fields that changed in this turn, each with its complete new value (for a list, the whole updated list). Leave out every field that did not change; use {} if nothing changed and null to clear a field. For "notes", give only the topic ids whose note changed. Blueprint fields and shapes: ${SCHEMA}`;
}
async function coachTurn(){
  if(aiMode!=="ai"){scriptedTurn();return}
  busy=true; renderAll();
  ctl=new AbortController();
  try{
    const r=await sample.json(coachPrompt(),{modelTier:"default",effort:"low",cache:false,signal:ctl.signal});
    if(!r||typeof r.reply!=="string")throw{code:"invalid_json"};
    const ch=r.changes&&typeof r.changes==="object"&&!Array.isArray(r.changes)?r.changes:{};
    Object.entries(ch).forEach(([k,v])=>{
      if(k==="notes"&&v&&typeof v==="object")state.spec.notes={...(state.spec.notes||{}),...v};
      else if(v==null)delete state.spec[k];
      else state.spec[k]=v;
    });
    const ids=new Set(topics.map(t=>t.id));
    state.covered=[...new Set([...state.covered,...arr(r.covered).filter(x=>ids.has(x))])];
    state.current=ids.has(r.topic)?r.topic:(topics.find(t=>!state.covered.includes(t.id))||{}).id||null;
    state.options=arr(r.options).filter(x=>typeof x==="string"&&x.trim()).slice(0,4);
    state.messages.push({role:"coach",text:r.reply.trim(),topic:state.current});
    persist();
  }catch(e){
    const c=e&&e.code;
    if(["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(c)){aiMode="scripted";busy=false;scriptedTurn(true);return}
    if(c==="cancelled"){}
    else if(c==="rate_limited")lastErr="The coach has been asked a lot in a short time. Wait a minute, then try again.";
    else if(c==="session_expired")lastErr="You've been signed out. Sign in to Claude again, then try again.";
    else if(c==="invalid_json")lastErr="The coach's answer came back in the wrong shape.";
    else lastErr="The coach couldn't answer just now.";
  }finally{busy=false;ctl=null;renderAll()}
}
function scriptedTurn(switched){
  const last=[...state.messages].reverse().find(m=>m.role==="user");
  const cur=state.current&&topics.some(t=>t.id===state.current)?state.current:(topics.find(t=>!state.covered.includes(t.id))||{}).id;
  if(last&&cur&&!switched){
    state.spec.notes=state.spec.notes||{};
    state.spec.notes[cur]=(state.spec.notes[cur]?state.spec.notes[cur]+"\n":"")+last.text;
    if(!state.covered.includes(cur))state.covered.push(cur);
  }else if(last&&cur&&switched&&!state.covered.includes(cur)){
    state.spec.notes=state.spec.notes||{};state.spec.notes[cur]=last.text;state.covered.push(cur);
  }
  const next=topics.find(t=>!state.covered.includes(t.id));
  state.current=next?next.id:null; state.options=[];
  state.messages.push(next?{role:"coach",text:next.hint,topic:next.id}:{role:"coach",text:"That's every topic. Check each section of the blueprint, confirm it, and then generate your prompt."});
  persist(); renderAll();
}

/* ---------- prompt generation ---------- */
function statusList(){return topics.map(t=>`${t.label}: ${!hasContent(t.id)?"EMPTY":isConfirmed(t.id)?"confirmed":"UNCONFIRMED"}`).join("\n")}
function localPrompt(target){
  const s=state.spec, L=[];
  L.push(`Build a responsive website for me${target!=="Any AI code generator"?` in ${target}`:""}. It must work well on phones, tablets and computers. Follow these requirements exactly and don't add features I haven't listed. Use clearly marked placeholder text and images where content is missing.`,"");
  topics.forEach(t=>{if(!hasContent(t.id))return;
    L.push(`## ${t.label}${isConfirmed(t.id)?"":" (not yet confirmed)"}`);
    const n=(s.notes||{})[t.id], pg=pagesOf(s), nm=id=>(pg.find(p=>p.id===id)||{}).name;
    if(t.id==="pages"){pg.forEach(p=>L.push(`- ${p.name}${p.parent?` (under ${nm(p.parent)})`:""}${p.inNav?"":" (not in the main menu)"}`));if(n)L.push(`- ${n}`);L.push("");return}
    if(t.id==="screens"){pg.filter(p=>p.sections.length).forEach(p=>{L.push(`- ${p.name}`);
        p.sections.forEach(x=>L.push(`  - ${x.type||"section"}${x.content?": "+x.content:""}${nm(x.to)?` (links to ${nm(x.to)})`:""}`))});
      if(n)L.push(`- ${n}`); L.push(""); return}
    if(t.id==="flow"){const l=s.layout||{};[["Top of every page",l.top],["Bottom of every page",l.bottom],["Other layout rules",l.other]].forEach(([k,v])=>{if(v)L.push(`- ${k}: ${v}`)});
      arr(s.flow).forEach(x=>L.push(`- ${x}`)); if(n)L.push(`- ${n}`); L.push(""); return}
    const d=sectionData(t.id).flat().filter(Boolean).map(v=>typeof v==="object"?Object.values(v).flat().filter(Boolean).join(" — "):v);
    d.forEach(v=>L.push(`- ${v}`)); L.push("");});
  L.push("## Build order","- Start with a first version that covers only the must-have features, then stop so I can test it before adding more.");
  return L.join("\n");
}
async function generate(){
  if(busy)return;
  const target=$("target").value;
  if(aiMode!=="ai"){state.prompt=localPrompt(target);persist();renderAll();return}
  busy=true; ctl=new AbortController(); $("stopBtn").hidden=false; $("genBtn").disabled=true;
  $("out").hidden=false; $("out").textContent="Writing your prompt…"; $("copyBtn").hidden=true;
  const p=`Write a build prompt that a non-technical person will paste into ${target==="Any AI code generator"?"a vibe-coding tool":target} to create their WEBSITE. The reader of the prompt is the AI tool, so use precise web terms it understands well (pages, sections, navigation, hero, call to action, responsive layout, form fields and validation), even though the person who gave the requirements is not technical.

Write clear, direct instructions. Use these markdown headings in this order: Overview, Target visitors, Site map and navigation, Pages (each page with its sections in order, top to bottom), Features (with sub-lists Must have / Should have / Could have), Layout on every page (header, footer and other shared parts), Content and forms (information shown, form fields), Design (colours, typography mood, imagery, tone of voice), Technical requirements (responsive for phone/tablet/desktop, accessible, fast, SEO basics with page titles and descriptions, plus any limits given), Acceptance criteria (a checklist the user can test), Build order (first version = must-haves only, then pause for review). Where real text or images are not provided, ask the tool to use clearly marked placeholder content.
Use ONLY the requirements below. Do not invent features. If something needed is missing, pick the simplest sensible default and mark it "(assumption)". Sections whose status is UNCONFIRMED: include them, but end each such item with "(not yet confirmed)".${target!=="Any AI code generator"?` Phrase it in the way that works best for ${target}.`:""}
Reply with only the prompt text, nothing before or after it.

Requirements JSON:
${JSON.stringify(state.spec)}

Section status:
${statusList()}${topics.filter(t=>!BUILTIN.has(t.id)).map(t=>`\nExtra topic "${t.label}" is stored in notes["${t.id}"].`).join("")}`;
  try{
    const {text,truncated}=await sample(p,{modelTier:"default",cache:false,signal:ctl.signal,onText:({text})=>{$("out").textContent=text}});
    state.prompt=text+(truncated?"\n\n[The prompt was cut short. Generate again.]":""); persist();
  }catch(e){
    const c=e&&e.code;
    if(["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(c)){aiMode="scripted";state.prompt=localPrompt(target);persist()}
    else if(c==="cancelled"){state.prompt=e.text||state.prompt}
    else{$("genHint").textContent=c==="rate_limited"?"Too many requests just now. Wait a minute and try again.":"The prompt couldn't be written just now. Try again."}
  }finally{busy=false;ctl=null;$("stopBtn").hidden=true;renderAll()}
}
async function copy(){
  const t=state.prompt; const b=$("copyBtn");
  try{await navigator.clipboard.writeText(t);b.textContent="Copied"}
  catch(e){const r=document.createRange();r.selectNodeContents($("out"));const s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent="Selected, press Ctrl+C"}
  setTimeout(()=>b.textContent="Copy",2200);
}

/* ---------- guide editor ---------- */
let draft=[];
function renderGuide(){
  const l=$("gList"); l.innerHTML="";
  draft.forEach((t,i)=>{const r=document.createElement("div");r.className="g-row";
    r.innerHTML=`<input id="g-l-${i}" aria-label="Topic name" value="${esc(t.label)}"><textarea id="g-h-${i}" aria-label="What to learn">${esc(t.hint)}</textarea><button class="btn sm" type="button" aria-label="Remove ${esc(t.label)}">Remove</button>`;
    r.querySelector("input").oninput=e=>t.label=e.target.value;
    r.querySelector("textarea").oninput=e=>t.hint=e.target.value;
    r.querySelector("button").onclick=()=>{draft.splice(i,1);renderGuide()};
    l.appendChild(r)});
}
$("guideBtn").onclick=()=>{draft=topics.map(t=>({...t}));renderGuide();$("guide").hidden=false};
$("gCancel").onclick=()=>$("guide").hidden=true;
$("gAdd").onclick=()=>{draft.push({id:"t"+Date.now().toString(36),label:"New topic",hint:"What should the coach find out?"});renderGuide();const i=draft.length-1;$("g-l-"+i).select()};
$("gReset").onclick=()=>{draft=DEFAULT_TOPICS.map(t=>({...t}));renderGuide()};
$("gSave").onclick=()=>{topics=draft.filter(t=>t.label.trim()).map(t=>({...t,label:t.label.trim(),hint:t.hint.trim()||t.label.trim()}));if(!topics.length)topics=DEFAULT_TOPICS.map(t=>({...t}));save(KEY_G,topics);
  if(!topics.some(t=>t.id===state.current))state.current=(topics.find(t=>!state.covered.includes(t.id))||{}).id||null;persist();$("guide").hidden=true;renderAll()};
$("guide").addEventListener("click",e=>{if(e.target.id==="guide")$("guide").hidden=true});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!$("intro").hidden)closeIntro();else if(!$("guide").hidden)$("guide").hidden=true});

/* ---------- intro: shown on the first visit, and from "How it works" ---------- */
let introStep=0;
function showIntro(i){
  const pages=document.querySelectorAll(".intro-page"), last=i===pages.length-1; introStep=i;
  pages.forEach((p,k)=>p.hidden=k!==i);
  document.querySelectorAll("#introDots i").forEach((d,k)=>d.classList.toggle("on",k===i));
  $("introBack").hidden=i===0; $("introSkip").hidden=last; $("introNext").textContent=last?"Get started":"Next"; $("introNext").focus();
}
function openIntro(){$("intro").hidden=false;showIntro(0)}
function closeIntro(){$("intro").hidden=true;save(KEY_I,true);$("msg").focus()}
$("introBtn").onclick=openIntro; $("introSkip").onclick=closeIntro;
$("introNext").onclick=()=>introStep<document.querySelectorAll(".intro-page").length-1?showIntro(introStep+1):closeIntro();
$("introBack").onclick=()=>showIntro(introStep-1);
$("intro").addEventListener("click",e=>{if(e.target.id==="intro")closeIntro()});

/* ---------- wiring ---------- */
function setView(v){$("app").dataset.view=v;$("tabChat").setAttribute("aria-selected",v==="chat");$("tabBp").setAttribute("aria-selected",v==="bp")}
$("tabChat").onclick=()=>setView("chat"); $("tabBp").onclick=()=>setView("bp");
/* Right side: Blueprint or Wireframes (site map + pop-up wireframes). */
function setPane(v){
  $("paneBp").hidden=v!=="bp"; $("paneWf").hidden=v!=="wf"; $("paneSwitch").dataset.pane=v;
  $("paneSwitch").querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.pane===v));
  document.querySelector(".blueprint").scrollTop=0;
}
$("paneSwitch").addEventListener("click",e=>{const b=e.target.closest("button[data-pane]");if(b)setPane(b.dataset.pane)});
$("sections").addEventListener("click",e=>{if(e.target.closest("[data-pane-go]"))setPane("wf")});
$("siteMap").addEventListener("click",e=>{const b=e.target.closest("[data-wf]"), w=b&&[...document.querySelectorAll(".wf")].find(x=>x.dataset.page===b.dataset.wf); if(!w)return;
  w.scrollIntoView({block:"nearest",behavior:"smooth"}); w.classList.add("flash"); setTimeout(()=>w.classList.remove("flash"),1200)});
$("composer").addEventListener("submit",e=>{e.preventDefault();send($("msg").value)});
function autoGrow(){const m=$("msg");m.style.height="auto";m.style.height=Math.min(m.scrollHeight,160)+"px"}
$("msg").addEventListener("input",autoGrow);
$("msg").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send($("msg").value)}});
$("newBtn").onclick=()=>{if(busy&&ctl)ctl.abort();state=fresh();lastErr=null;persist();renderAll();$("msg").focus()};
$("genBtn").onclick=generate; $("stopBtn").onclick=()=>ctl&&ctl.abort(); $("copyBtn").onclick=copy;

renderAll();
if(!load(KEY_I,false))openIntro();
(async()=>{
  try{sample=window.claude&&window.claude.use?await window.claude.use("sample"):null}catch(e){sample=null}
  aiMode=sample?"ai":"scripted"; renderAll();
})();
})();
