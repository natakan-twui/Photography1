// Set API_BASE when the backend is hosted on a different address.
const API_BASE = (window.PHOTOGRAPHY_API_BASE || "http://127.0.0.1:8000").replace(/\/$/,"");
const $ = (id)=>document.getElementById(id);
let cache={users:[],locations:[],metrics:{},profile:null};
let confirmAction=null;
const esc=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const api=async(path,opts={})=>{
  const res=await fetch(API_BASE+path,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})}});
  let body={};try{body=await res.json()}catch{}
  if(!res.ok) throw new Error(body.detail||body.message||`HTTP ${res.status}`);
  return body;
};
const post=(path,data)=>api(path,{method:"POST",body:JSON.stringify(data)});
const del=(path)=>api(path,{method:"DELETE"});
function showNotice(message,type="success"){const n=$("notice");n.textContent=message;n.className=`notice ${type}`;window.scrollTo({top:0,behavior:"smooth"});setTimeout(()=>n.classList.add("hidden"),5500)}
function setConnection(ok,msg){$("connection-label").textContent=msg;$("connection-label").parentElement.style.background=ok?"#f4fbf7":"#fff1f2";$("connection-label").parentElement.style.color=ok?"#54866c":"#b44b5c"}
function selectOptions(el,items,firstLabel=null,selected=null){
  if(!el)return;const old=selected??el.value;
  el.innerHTML=(firstLabel!==null?`<option value="">${esc(firstLabel)}</option>`:"")+items.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  if(items.includes(old))el.value=old;else if(items.length)el.value=items[0];
}
function userNames(){return cache.users.map(x=>x.name)}
function placeNames(){return cache.locations.map(x=>x.name)}
async function loadAll(){
  try{
    const [health,metrics,users,locations]=await Promise.all([api("/api/health"),api("/api/metrics"),api("/api/users"),api("/api/locations")]);
    setConnection(health.ok,"Neo4j เชื่อมต่อแล้ว");
    cache.metrics=metrics;cache.users=users;cache.locations=locations;
    $("metric-users").textContent=metrics.users;$("metric-locations").textContent=metrics.locations;$("metric-likes").textContent=metrics.likes;$("metric-friends").textContent=metrics.friends;
    const selected=$("dash-user").value;
    selectOptions($("dash-user"),userNames(),userNames().length?null:"ยังไม่มีผู้ใช้",selected);
    selectOptions($("friend-one"),userNames(),"เลือกผู้ใช้");selectOptions($("friend-two"),userNames(),"เลือกผู้ใช้");
    selectOptions($("like-user"),userNames(),"เลือกผู้ใช้");selectOptions($("like-location"),placeNames(),"เลือกสถานที่");
    selectOptions($("graph-user"),["ทั้งหมด",...userNames()],null,$("graph-user").value||"ทั้งหมด");
    $("people-count").textContent=`${users.length} คน`;$("place-count").textContent=`${locations.length} แห่ง`;
    await Promise.all([renderDashboard(),renderPeople(),renderPlaces(),renderLikesTable(),renderGraph()]);
  }catch(e){setConnection(false,"ยังไม่เชื่อมต่อ Neo4j");showNotice(`เชื่อมต่อ API ไม่สำเร็จ: ${e.message} — ตรวจสอบว่าเปิด Backend และตั้งค่า Neo4j แล้ว`,"error")}
}
async function renderDashboard(){
  const name=$("dash-user").value;
  if(!name){$("recommendations").innerHTML='<div class="empty-state">ยังไม่มีผู้ใช้ กรุณาเพิ่มผู้ใช้หรือกดเพิ่มข้อมูลตัวอย่าง</div>';$("friend-chips").innerHTML="";$("recommend-subtitle").textContent="เพิ่มผู้ใช้ก่อนเพื่อเริ่มดูคำแนะนำ";return}
  try{
    const [profile,recs]=await Promise.all([api("/api/profile/"+encodeURIComponent(name)),api("/api/recommendations/"+encodeURIComponent(name))]);cache.profile=profile;
    $("recommend-subtitle").textContent=`คำแนะนำสำหรับ ${name} · ชอบอยู่แล้ว ${profile.likes.length} แห่ง`;
    $("recommendations").innerHTML=recs.length?recs.map((r,i)=>`<article class="place-card"><div class="place-image">${r.image?`<img loading="lazy" src="${esc(r.image)}" alt="${esc(r.name)}" onerror="this.style.display='none'">`:""}<span class="place-rank">MATCH ${String(i+1).padStart(2,"0")}</span></div><div class="place-content"><h3>${esc(r.name)}</h3><p>มีเพื่อนของคุณ ${r.score} คนที่ชอบสถานที่นี้</p><div class="friend-tags">${r.friends.map(f=>`<span class="friend-tag">♧ ${esc(f)}</span>`).join("")}</div></div></article>`).join(""):'<div class="empty-state">ยังไม่มีสถานที่ใหม่ที่เพื่อนของคุณชอบ ลองเพิ่มความสัมพันธ์หรือความชอบในเมนูจัดการข้อมูล</div>';
    $("friend-chips").innerHTML=profile.friends.length?profile.friends.map(f=>`<div class="friend-chip"><div class="avatar">👤</div><b>${esc(f)}</b></div>`).join(""):'<div class="empty-state">ผู้ใช้นี้ยังไม่มีเพื่อนในเครือข่าย</div>';
  }catch(e){$("recommendations").innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}
}
async function renderPeople(){
  const users=cache.users;
  $("people-table").innerHTML=users.length?`<div class="table-wrap"><table><thead><tr><th>ชื่อผู้ใช้</th><th>ประเภทโหนด</th><th>จัดการ</th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td><span class="friend-tag">User</span></td><td><div class="table-actions"><button class="mini-btn" data-profile="${esc(u.name)}">ดูโปรไฟล์</button><button class="mini-btn danger" data-delete-user="${esc(u.name)}">ลบผู้ใช้</button></div></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty-state">ยังไม่มีผู้ใช้ในฐานข้อมูล</div>';
  const graph=await api("/api/graph");
  const pairs=[];for(const r of graph.friends){const key=[r.user1,r.user2].sort().join("|||");if(!pairs.some(x=>x.key===key))pairs.push({key,a:r.user1,b:r.user2})}
  $("friend-table").innerHTML=pairs.length?`<div class="table-wrap"><table><thead><tr><th>ผู้ใช้คนที่ 1</th><th></th><th>ผู้ใช้คนที่ 2</th><th>จัดการ</th></tr></thead><tbody>${pairs.map(r=>`<tr><td>${esc(r.a)}</td><td>↔</td><td>${esc(r.b)}</td><td><button class="mini-btn danger" data-delete-friend="${esc(r.a)}" data-friend-two="${esc(r.b)}">ลบความสัมพันธ์</button></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty-state">ยังไม่มีความสัมพันธ์เพื่อน</div>';
}
async function renderPlaces(){
  $("all-places").innerHTML=cache.locations.length?cache.locations.map((l,i)=>`<article class="place-card"><div class="place-image">${l.image?`<img loading="lazy" src="${esc(l.image)}" alt="${esc(l.name)}" onerror="this.style.display='none'">`:""}<span class="place-rank">LOCATION ${String(i+1).padStart(2,"0")}</span></div><div class="place-content"><h3>${esc(l.name)}</h3><p>${l.image?"มี URL รูปภาพแล้ว":"ยังไม่มี URL รูปภาพ"}</p><button class="btn btn-quiet" data-delete-location="${esc(l.name)}">ลบสถานที่นี้</button></div></article>`).join(""):'<div class="empty-state">ยังไม่มีสถานที่ในฐานข้อมูล</div>';
}
async function renderLikesTable(){
  const graph=await api("/api/graph");
  $("likes-table").innerHTML=graph.likes.length?`<div class="table-wrap"><table><thead><tr><th>ผู้ใช้</th><th>สถานที่ที่ชอบ</th><th>ความสัมพันธ์</th><th>จัดการ</th></tr></thead><tbody>${graph.likes.map(x=>`<tr><td>${esc(x.user)}</td><td>${esc(x.location)}</td><td><span class="friend-tag">LIKES</span></td><td><button class="mini-btn danger" data-delete-like="${esc(x.user)}" data-like-place="${esc(x.location)}">ยกเลิกความชอบ</button></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty-state">ยังไม่มีความสัมพันธ์ LIKES</div>';
}
function svgText(x,y,text,color,size=12){return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" fill="${color}" font-family="Prompt, sans-serif">${esc(text.length>23?text.slice(0,22)+"…":text)}</text>`}
async function renderGraph(){
  try{
    const selected=$("graph-user").value||"ทั้งหมด";const data=await api("/api/graph?user="+encodeURIComponent(selected));
    const userSet=new Set(),locSet=new Set();data.likes.forEach(r=>{userSet.add(r.user);locSet.add(r.location)});data.friends.forEach(r=>{userSet.add(r.user1);userSet.add(r.user2)});if(selected!=="ทั้งหมด")userSet.add(selected);
    const users=[...userSet].sort(),locs=[...locSet].sort();if(!users.length&&!locs.length){$("graph-canvas").innerHTML='<div class="empty-state">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</div>';return}
    const W=1100,H=570,cx=W/2,cy=H/2,positions={};
    if(selected!=="ทั้งหมด"){
      positions["u:"+selected]={x:cx,y:cy};
      const friends=[...new Set(data.friends.flatMap(f=>[f.user1,f.user2]).filter(n=>n!==selected))].sort();
      friends.forEach((n,i)=>{let a=-Math.PI/2+2*Math.PI*i/Math.max(1,friends.length);positions["u:"+n]={x:cx+160*Math.cos(a),y:cy+160*Math.sin(a)}});
      locs.forEach((n,i)=>{let a=-Math.PI/2+2*Math.PI*i/Math.max(1,locs.length);positions["l:"+n]={x:cx+365*Math.cos(a),y:cy+210*Math.sin(a)}});
    }else{
      users.forEach((n,i)=>{let a=-Math.PI/2+2*Math.PI*i/Math.max(1,users.length);positions["u:"+n]={x:cx+165*Math.cos(a),y:cy+120*Math.sin(a)}});
      locs.forEach((n,i)=>{let a=-Math.PI/2+2*Math.PI*i/Math.max(1,locs.length);positions["l:"+n]={x:cx+380*Math.cos(a),y:cy+218*Math.sin(a)}});
    }
    let edges="";
    data.friends.forEach(r=>{let a=positions["u:"+r.user1],b=positions["u:"+r.user2];if(a&&b)edges+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#e6a0bd" stroke-width="2.3" opacity=".85"/>`});
    data.likes.forEach(r=>{let a=positions["u:"+r.user],b=positions["l:"+r.location];if(a&&b)edges+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#a895dc" stroke-width="1.6" opacity=".65"/>`});
    let nodes="";users.forEach(n=>{const q=positions["u:"+n];if(!q)return;const isSelected=n===selected;nodes+=`<g><circle cx="${q.x}" cy="${q.y}" r="${isSelected?31:26}" fill="${isSelected?"#bd5f91":"#d986ad"}" stroke="#fff" stroke-width="3"/><title>User: ${esc(n)}</title>${svgText(q.x,q.y,n,"#fff",11)}</g>`});
    locs.forEach(n=>{const q=positions["l:"+n];if(!q)return;nodes+=`<g><rect x="${q.x-45}" y="${q.y-22}" width="90" height="44" rx="13" fill="#e6defb" stroke="#fff" stroke-width="3"/><title>Location: ${esc(n)}</title>${svgText(q.x,q.y,n,"#6d589b",10)}</g>`});
    $("graph-canvas").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟความสัมพันธ์">${edges}${nodes}</svg>`;
  }catch(e){$("graph-canvas").innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}
}
function goPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const titles={dashboard:"แนะนำสถานที่ถ่ายรูป",people:"จัดการคน & เพื่อน",places:"จัดการสถานที่ถ่ายรูป & ความชอบ",graph:"กราฟความสัมพันธ์"};
  $("page-title").textContent=titles[page]||"Photography";
}
function askConfirm(title,message,action){$("modal-title").textContent=title;$("modal-message").textContent=message;confirmAction=action;$("confirm-modal").classList.remove("hidden")}
$("modal-cancel").addEventListener("click",()=>{$("confirm-modal").classList.add("hidden");confirmAction=null});
$("modal-confirm").addEventListener("click",async()=>{if(!confirmAction)return;const action=confirmAction;$("modal-confirm").disabled=true;try{await action();$("confirm-modal").classList.add("hidden");await loadAll();showNotice("ดำเนินการสำเร็จ")}catch(e){showNotice(e.message,"error")}finally{$("modal-confirm").disabled=false;confirmAction=null}});
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>goPage(b.dataset.page)));
$("refresh-btn").addEventListener("click",loadAll);
$("dash-user").addEventListener("change",renderDashboard);
$("graph-user").addEventListener("change",renderGraph);
$("add-user-form").addEventListener("submit",async e=>{e.preventDefault();const name=new FormData(e.currentTarget).get("name").trim();try{await post("/api/users",{name});e.currentTarget.reset();await loadAll();showNotice(`เพิ่มผู้ใช้ ${name} แล้ว`)}catch(err){showNotice(err.message,"error")}});
$("add-friend-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await post("/api/friends",{person1:f.get("person1"),person2:f.get("person2")});await loadAll();showNotice("เพิ่มความสัมพันธ์เพื่อนแล้ว")}catch(err){showNotice(err.message,"error")}});
$("add-location-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await post("/api/locations",{name:f.get("name").trim(),image:f.get("image").trim()});e.currentTarget.reset();await loadAll();showNotice("เพิ่มสถานที่แล้ว")}catch(err){showNotice(err.message,"error")}});
$("add-like-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await post("/api/likes",{user:f.get("user"),location:f.get("location")});await loadAll();showNotice("บันทึกความชอบแล้ว")}catch(err){showNotice(err.message,"error")}});
$("seed-btn").addEventListener("click",()=>askConfirm("เพิ่มข้อมูลตัวอย่าง","ระบบจะเพิ่มข้อมูลผู้ใช้ สถานที่ และความสัมพันธ์ตัวอย่าง โดยไม่ลบข้อมูลที่มีอยู่",async()=>{const r=await post("/api/seed",{});showNotice(r.message)}));
document.addEventListener("click",e=>{
 const t=e.target.closest("button");if(!t)return;
 if(t.dataset.deleteUser)askConfirm("ลบผู้ใช้",`ลบ ${t.dataset.deleteUser} และความสัมพันธ์ทั้งหมดของผู้ใช้นี้?`,()=>del("/api/users/"+encodeURIComponent(t.dataset.deleteUser)));
 if(t.dataset.deleteLocation)askConfirm("ลบสถานที่",`ลบ ${t.dataset.deleteLocation} และความสัมพันธ์ทั้งหมดของสถานที่นี้?`,()=>del("/api/locations/"+encodeURIComponent(t.dataset.deleteLocation)));
 if(t.dataset.deleteFriend)askConfirm("ลบความสัมพันธ์เพื่อน",`ลบความสัมพันธ์ระหว่าง ${t.dataset.deleteFriend} กับ ${t.dataset.friendTwo}?`,()=>del("/api/friends?person1="+encodeURIComponent(t.dataset.deleteFriend)+"&person2="+encodeURIComponent(t.dataset.friendTwo)));
 if(t.dataset.deleteLike)askConfirm("ยกเลิกความชอบ",`ยกเลิกความสัมพันธ์ LIKES ของ ${t.dataset.deleteLike} กับ ${t.dataset.likePlace}?`,()=>del("/api/likes?user="+encodeURIComponent(t.dataset.deleteLike)+"&location="+encodeURIComponent(t.dataset.likePlace)));
 if(t.dataset.profile){$("dash-user").value=t.dataset.profile;goPage("dashboard");renderDashboard()}
});
loadAll();
