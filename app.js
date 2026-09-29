/* ================================================================================================ */

const $=s=>document.querySelector(s);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const rs=p=>+p>0?'₹'+p:'Free', left=e=>e.capacity-e.registered_count;
const today=()=>new Date().toISOString().slice(0,10);
const CATS=['Workshop','Robotics','AI/ML','Hackathon','Entrepreneurship','Seminar','Training'];
const chip=s=>`<span class="chip ${s}">${h(String(s).replace('_',' '))}</span>`;
const toast=(m,bad)=>{const t=$('#toast');t.textContent=m;t.className='show'+(bad?' bad':'');clearTimeout(toast.t);toast.t=setTimeout(()=>t.className='',3800)};
const go=x=>{if(location.hash===x)route();else location.hash=x};
const uid=()=>Math.random().toString(36).slice(2,10);

/* ---------- DEMO data layer (browser only) ---------- */
const LS='ek_demo_v1';let M;try{M=JSON.parse(localStorage.getItem(LS))}catch(e){}
if(!M){const d=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
 M={me:null,users:[{id:'a1',name:'Demo Admin',email:'admin@demo.com',phone:'9999999999',role:'admin',pw:'admin123',created_at:d(-30)}],regs:[],events:[
 {id:'e1',title:'Robotics Bootcamp for Beginners',description:'Build a line-following robot with Arduino, sensors and motors.\nNo prior experience needed.',category:'Robotics',date:d(10),start_time:'10:00',end_time:'16:00',venue:'Robokalam Lab',city:'Chennai',capacity:40,registered_count:0,price:499,image_url:null,status:'published',announced:1},
 {id:'e2',title:'Campus Hackathon 24hr',description:'Team up and ship a working solution to a real problem in 24 hours.',category:'Hackathon',date:d(25),start_time:'09:00',end_time:'09:00',venue:'Engineering College Campus',city:'Madurai',capacity:100,registered_count:0,price:0,image_url:null,status:'published',announced:1}]}}
const save=()=>{try{localStorage.setItem(LS,JSON.stringify(M))}catch(e){}};
const mock={
 async me(){return M.users.find(u=>u.id===M.me)||null},
 async signUp(name,email,phone,pw){email=email.toLowerCase();if(M.users.some(u=>u.email===email))throw Error('An account with this email already exists');const u={id:uid(),name,email,phone,role:'user',pw,created_at:today()};M.users.push(u);M.me=u.id;save();return u},
 async signIn(email,pw){const u=M.users.find(u=>u.email===email.toLowerCase()&&u.pw===pw);if(!u)throw Error('Invalid email or password');M.me=u.id;save();return u},
 async signOut(){M.me=null;save()},
 async events(){const me=await this.me();return M.events.filter(e=>e.status==='published'||me?.role==='admin')},
 async saveEvent(ev){let e=ev.id&&M.events.find(x=>x.id===ev.id),n=0;if(e)Object.assign(e,ev);else{e={...ev,id:uid(),registered_count:0};M.events.push(e)}
  if(e.status==='published'&&!e.announced){e.announced=1;n=M.users.filter(u=>u.role==='user').length}save();return n},
 async delEvent(id){if(M.regs.some(r=>r.event_id===id&&r.status!=='cancelled'))throw Error('This event has active registrations. Set its status to cancelled instead.');M.events=M.events.filter(e=>e.id!==id);save()},
 async register(id){const me=await this.me(),e=M.events.find(x=>x.id===id);if(!me)throw Error('Please log in');if(!e||e.status!=='published')throw Error('Event not available');
  if(M.regs.some(r=>r.user_id===me.id&&r.event_id===id&&r.status!=='cancelled'))throw Error('You are already registered');if(left(e)<=0)throw Error('Sorry, this event is full');
  const free=+e.price===0,r={id:uid(),code:'EK-'+uid().toUpperCase().slice(0,8),user_id:me.id,event_id:id,amount:+e.price,status:free?'confirmed':'pending',payment_status:free?'not_required':'pending',created_at:new Date().toISOString()};
  M.regs.push(r);e.registered_count++;save();return r},
 async pay(id){const r=M.regs.find(x=>x.id===id);r.status='confirmed';r.payment_status='paid';save()},
 async cancel(id){const r=M.regs.find(x=>x.id===id),e=M.events.find(x=>x.id===r.event_id);if(new Date(e.date)-Date.now()<864e5)throw Error('Cancellation closes 24 hours before the event');
  r.status='cancelled';if(r.payment_status==='paid')r.payment_status='refund_pending';e.registered_count--;save()},
 async myRegs(u){return M.regs.filter(r=>r.user_id===u).map(r=>({...r,events:M.events.find(e=>e.id===r.event_id)})).reverse()},
 async allRegs(){return M.regs.map(r=>({...r,profiles:M.users.find(u=>u.id===r.user_id),events:M.events.find(e=>e.id===r.event_id)})).reverse()},
 async members(){return M.users.filter(u=>u.role==='user')}
};

/* ---------- SUPABASE data layer ---------- */
let sb;const ok=r=>{if(r.error)throw r.error;return r.data};
const real={
 async me(){const{data:{session}}=await sb.auth.getSession();if(!session)return null;return ok(await sb.from('profiles').select('*').eq('id',session.user.id).single())},
 async signUp(name,email,phone,pw){ok(await sb.auth.signUp({email,password:pw,options:{data:{name,phone}}}));return this.me()},
 async signIn(email,pw){ok(await sb.auth.signInWithPassword({email,password:pw}));return this.me()},
 async signOut(){await sb.auth.signOut()},
 async events(){return ok(await sb.from('events').select('*').order('date'))},
 async saveEvent(ev){const{id,...f}=ev;ok(await(id?sb.from('events').update(f).eq('id',id):sb.from('events').insert(f)));return 0},
 async delEvent(id){ok(await sb.from('events').delete().eq('id',id))},
 async register(id){return ok(await sb.rpc('register_for_event',{p_event:id}))},
 async pay(id){ok(await sb.rpc('mock_pay',{p_reg:id}))},
 async cancel(id){ok(await sb.rpc('cancel_registration',{p_reg:id}))},
 async myRegs(u){return ok(await sb.from('registrations').select('*,events(*)').eq('user_id',u).order('created_at',{ascending:false}))},
 async allRegs(){return ok(await sb.from('registrations').select('*,profiles(name,email,phone),events(title,date)').order('created_at',{ascending:false}))},
 async members(){return ok(await sb.from('profiles').select('*').eq('role','user').order('created_at',{ascending:false}))}
};
let API=mock,ME=null,MODE='in',NEXT='',TAB='home',EV=[],MY=[],AE=[],AR=[],AM=[];

/* ---------- views ---------- */
const nav=()=>`${API===mock?'<div class="demo">Demo mode: data stays in this browser only. Admin login: admin@demo.com / admin123</div>':''}
<header class="nav"><a class="brand" href="#/">EventKalam</a><nav><a href="#/">Home</a><a href="#/events">Events</a><a href="#/about">About</a><a href="#/showcase">Showcase</a><a href="#" data-a="scrollContact">Contact</a>${ME?'<a href="#/my">My registrations</a>':''}${ME?.role==='admin'?'<a href="#/admin">Admin</a>':''}
${ME?`<button class="btn sm ghost" data-a="logout">Log out (${h(ME.name.split(' ')[0])})</button>`:'<a class="btn sm" href="#/login">Log in</a>'}</nav></header>`;
const footer=()=>`<footer class="site-footer" id="footer-contact"><div class="foot-grid">
<div><h4>EventKalam</h4><p>Robokalam's event booking and management platform — discover, register and manage tech events with ease.</p></div>
<div><h4>Quick Links</h4><a href="#/">Home</a><a href="#/events">Events</a><a href="#/about">About</a><a href="#/showcase">Showcase</a></div>
<div><h4>Contact Us</h4>
<div class="contact-info-row"><span class="ico">🌐</span><a href="https://robokalam.com/" target="_blank" rel="noopener">robokalam.com</a></div>
<div class="contact-info-row"><span class="ico">✉️</span><a href="mailto:info@robokalam.com">info@robokalam.com</a></div>
<form data-f="contact" style="margin-top:10px"><input name="name" placeholder="Your name" required style="margin-bottom:6px"><input name="email" type="email" placeholder="Your email" required style="margin-bottom:6px"><textarea name="message" rows="2" placeholder="Message" required style="margin-bottom:6px"></textarea><button class="btn sm">Send message</button></form>
</div></div>
<p class="foot-bottom">© ${new Date().getFullYear()} Robokalam Technologies. Built for the EventKalam internship project.</p></footer>`;
const needLogin=()=>'<div class="card pad">Please <a href="#/login">log in</a> to see this page.</div>';
const card=e=>`<a class="card ev" href="#/event/${e.id}"><div class="ph">${e.image_url?`<img src="${h(e.image_url)}" alt="" onerror="this.remove()">`:''}<span>${h(e.category)}</span></div><div class="pad"><h3>${h(e.title)}</h3><p class="mu">${fmt(e.date)}, ${h(e.city)}</p><div class="row"><b>${rs(e.price)}</b><span class="${left(e)<=5?'warnt':'mu'}">${left(e)>0?left(e)+' seats left':'Full'}</span></div></div></a>`;
async function vEvents(){EV=(await API.events()).filter(e=>e.status==='published'&&e.date>=today());
 return `<section class="hero"><h1>Find your next workshop, bootcamp or hackathon</h1><p>Create a free account, pick an event and get your seat confirmed.</p></section>
 <div class="filters"><input id="q" placeholder="Search events" oninput="grid()"><select id="cat" onchange="grid()"><option value="">All categories</option>${CATS.map(c=>`<option>${c}</option>`).join('')}</select><input id="city" placeholder="City" oninput="grid()"></div><div id="grid" class="grid"></div>`}
async function vHome(){EV=(await API.events()).filter(e=>e.status==='published'&&e.date>=today());
 const featured=EV.slice(0,3);
 return `<section class="hero big reveal"><div class="blob b1"></div><div class="blob b2"></div>
 <p class="eyebrow">Robokalam presents</p>
 <h1>Where great ideas<br>find their stage.</h1>
 <p>EventKalam is Robokalam's home for hackathons, robotics bootcamps, AI/ML workshops and open-mic nights. Sign up once, book a seat, and show up ready to build.</p>
 <div class="cta-row"><a class="btn big glow" href="#/events">Explore Events →</a><a class="btn big ghost" href="#/about">Meet the Founder</a></div>
 <div class="tagrow">${['Robotics','AI / ML','Hackathons','Open Mic','Skill Workshops'].map(t=>`<span class="tagpill">${t}</span>`).join('')}</div>
 </section>

 <div class="section-h reveal"><h2>Happening now</h2><p>A few upcoming events, picked fresh.</p></div>
 <div class="grid">${featured.length?featured.map(card).join(''):'<p class="mu">No published events yet. Check back soon, or explore what we have run before.</p>'}</div>
 ${featured.length?'<p style="text-align:center;margin:14px 0"><a href="#/events">See all events →</a></p>':''}

 <div class="section-h reveal"><h2>Moments from past events</h2><p>Open mics, hackathons and AI upskilling sessions across Telangana.</p></div>
 <div class="teaser-grid reveal">${['showcase-openmic.jpg','showcase-aiforall.jpg','showcase-felicitation.jpg'].map(s=>`<div class="shot sm"><img src="${s}" alt="Robokalam event moment"></div>`).join('')}</div>
 <p style="text-align:center;margin:14px 0"><a href="#/showcase">View the full showcase →</a></p>

 <div class="founder-teaser card reveal"><img src="founder.jpg" alt="Mohammed Sajeed, Founder of Robokalam">
 <div><p class="eyebrow">From our founder</p><blockquote>"My vision is to make Robokalam a globally recognised benchmark in technology development and STEM innovation — inspiring young minds and supporting digital transformation."</blockquote>
 <p><b>Mohammed Sajeed</b> <span class="mu">· Founder, Robokalam</span></p><a href="#/about">Read his full story →</a></div></div>

 <section class="closing-cta reveal"><h2>Ready to build tomorrow with us?</h2><p>Create your free account and grab a seat at the next event.</p><a class="btn big glow" href="${ME?'#/events':'#/login'}">${ME?'Browse Events':'Get Started'}</a></section>`}
function grid(){const q=$('#q').value.toLowerCase(),c=$('#cat').value,t=$('#city').value.toLowerCase();
 const l=EV.filter(e=>(!q||(e.title+e.description).toLowerCase().includes(q))&&(!c||e.category===c)&&(!t||e.city.toLowerCase().includes(t)));
 $('#grid').innerHTML=l.length?l.map(card).join(''):'<p class="mu">No upcoming events match. Try a different search.</p>'}
async function vEvent(id){const e=(await API.events()).find(x=>x.id===id);if(!e)return '<p>Event not found. <a href="#/">Back to events</a></p>';
 const mine=ME?(await API.myRegs(ME.id)).find(r=>r.event_id===id&&r.status!=='cancelled'):null;
 const b=mine?`<p>${chip(mine.status)} You are registered. Registration ID <b>${h(mine.code)}</b></p>`:e.status!=='published'?'<button class="btn" disabled>Not open for registration</button>':left(e)<=0?'<button class="btn" disabled>Sold out</button>':`<button class="btn big" data-a="reg" data-id="${e.id}">${+e.price>0?'Register and pay '+rs(e.price):'Register for free'}</button>`;
 return `<a href="#/">Back to events</a><div class="card pad" style="margin-top:8px"><span class="chip">${h(e.category)}</span> ${chip(e.status)}<h1>${h(e.title)}</h1>
 <div class="facts"><div><small>Date</small>${fmt(e.date)}</div><div><small>Time</small>${h(e.start_time)} to ${h(e.end_time)}</div><div><small>Venue</small>${h(e.venue)}, ${h(e.city)}</div><div><small>Fee</small>${rs(e.price)}</div><div><small>Seats left</small>${left(e)} of ${e.capacity}</div></div>
 <p class="desc">${h(e.description)}</p>${b}</div>`}
function vAbout(){return `<div class="section-h"><h2>About Robokalam</h2><p>The team and vision behind EventKalam.</p></div>
<div class="card founder"><img src="founder.jpg" alt="Mohammed Sajeed, Founder of Robokalam">
<div><p class="role">Founder, Robokalam</p><h2>Mohammed Sajeed</h2>
<p>Sajeed Sir, the Founder of Robokalam, is a visionary leader passionate about technology, innovation, and creating meaningful opportunities for students and organisations. His work reflects a strong commitment to integrity, trust, transparency, accountability and professionalism.</p>
<p>Through Robokalam, he focuses on empowering enterprises and educational institutions with cutting-edge software solutions, AI innovations, and hands-on 21st-century technology labs. He is also contributing to the development of EventKalam itself, designed to make event organisation and participation more convenient through technology.</p>
<blockquote>"My vision is to make Robokalam a globally recognised benchmark in technology development and STEM innovation — inspiring young minds and supporting digital transformation for forward-thinking organisations."</blockquote>
<p style="margin-top:14px"><a href="https://robokalam.com/" target="_blank" rel="noopener">Learn more at robokalam.com →</a></p>
</div></div>
<div class="value-grid">${['Integrity','Trust','Transparency','Accountability','Professionalism'].map(v=>`<div class="card">${v}</div>`).join('')}</div>
<div class="section-h"><h2>Our Team</h2><p>Behind every Robokalam event is a team of mentors, interns and volunteers.</p></div>
<div class="card team-note pad">Robokalam is powered by a dedicated group of employees, mentors and student interns who run workshops, hackathons and open-mic events across Telangana. Team profiles are being added soon.</div>`}
function vShowcase(){const shots=[
 ['showcase-openmic.jpg','Warangal Open Mic — great ideas build tomorrow together'],
 ['showcase-openmic2.jpg','Open Mic — speakers and audience engagement'],
 ['showcase-aiforall.jpg','AI for ALL — AI upskilling session with polytechnic students'],
 ['showcase-guestspeaker.jpg','Guest speaker session on World Youth Skills Day'],
 ['showcase-felicitation.jpg','Felicitating a young achiever'],
 ['showcase-groupphoto.jpg','Open Mic — the whole crew at the end of the night'],
];
 return `<div class="section-h"><h2>Event Showcase</h2><p>A look at how Robokalam events come together — from open mics to AI upskilling sessions.</p></div>
 <div class="showcase-grid">${shots.map(([src,cap],i)=>`<button class="shot" data-a="lightbox" data-id="${i}"><img src="${src}" alt="${h(cap)}" loading="lazy"><span class="cap">${h(cap)}</span></button>`).join('')}</div>`}
window.SHOTS=[['showcase-openmic.jpg','Warangal Open Mic — great ideas build tomorrow together'],['showcase-openmic2.jpg','Open Mic — speakers and audience engagement'],['showcase-aiforall.jpg','AI for ALL — AI upskilling session with polytechnic students'],['showcase-guestspeaker.jpg','Guest speaker session on World Youth Skills Day'],['showcase-felicitation.jpg','Felicitating a young achiever'],['showcase-groupphoto.jpg','Open Mic — the whole crew at the end of the night']];
const vLogin=()=>`<div class="card pad auth"><h2>${MODE==='in'?'Log in':'Create your account'}</h2><form data-f="auth">
${MODE==='up'?'<label>Full name<input name="name" required></label><label>Phone<input name="phone" type="tel" required minlength="10" maxlength="15"></label>':''}
<label>Email<input name="email" type="email" required></label><label>Password${MODE==='up'?' (8+ characters)':''}<input name="pw" type="password" required minlength="${MODE==='up'?8:1}"></label>
<button class="btn big">${MODE==='in'?'Log in':'Sign up'}</button></form><p class="mu">${MODE==='in'?'New here? <a href="#" data-a="mode">Create an account</a>':'Already registered? <a href="#" data-a="mode">Log in</a>'}</p></div>`;
async function vMy(){if(!ME)return needLogin();MY=await API.myRegs(ME.id);const up=[],past=[];MY.forEach(r=>((r.status==='cancelled'||r.events.date<today())?past:up).push(r));
 const row=r=>`<div class="card pad reg"><div><h3><a href="#/event/${r.event_id}">${h(r.events.title)}</a></h3><p class="mu">${fmt(r.events.date)}, ${h(r.events.city)}. ID <b>${h(r.code)}</b></p><p>${chip(r.status)} ${chip(r.payment_status)} <span class="mu">${rs(r.amount)}</span></p></div>
 <div>${r.status==='pending'?`<button class="btn sm" data-a="payNow" data-id="${r.id}">Pay now</button> `:''}${r.status!=='cancelled'&&r.events.date>=today()?`<button class="btn sm ghost" data-a="cancel" data-id="${r.id}">Cancel</button>`:''}</div></div>`;
 return `<h2>My registrations</h2><h3>Upcoming</h3>${up.map(row).join('')||'<p class="mu">Nothing upcoming. <a href="#/">Browse events</a></p>'}<h3>Previous and cancelled</h3>${past.map(row).join('')||'<p class="mu">No past registrations yet.</p>'}`}
async function vAdmin(){if(ME?.role!=='admin')return '<div class="card pad">Admin access only.</div>';[AE,AR,AM]=await Promise.all([API.events(),API.allRegs(),API.members()]);
 const rev=AR.filter(r=>r.payment_status==='paid').reduce((s,r)=>s+ +r.amount,0);
 const st=(a,b)=>`<div class="card pad"><small>${a}</small><b>${b}</b></div>`;
 const stats=`<div class="stats">${st('Events',AE.length)}${st('Members',AM.length)}${st('Confirmed seats',AR.filter(r=>r.status==='confirmed').length)}${st('Revenue','₹'+rev)}</div>`;
 return `<div class="admin-hero reveal"><p class="eyebrow">Admin dashboard</p><h2>Welcome back, ${h(ME.name.split(' ')[0])} 👋</h2><p class="mu">Here's what's happening across EventKalam right now.</p></div>
 ${stats}
 <div class="tabs">${['home','events','registrations','members'].map(t=>`<button class="tab ${t===TAB?'on':''}" data-a="tab" data-id="${t}">${t}</button>`).join('')}</div>
 ${TAB==='home'?tAdminHome():TAB==='events'?tEvents():TAB==='members'?tMembers():tRegs()}`}
const tAdminHome=()=>{const recent=AR.slice(0,5);
 return `<div class="quick-grid">
 <button class="card pad quick" data-a="newEv"><span class="qicon">➕</span><b>Create Event</b><span class="mu">Publish a new workshop or hackathon</span></button>
 <button class="card pad quick" data-a="tab" data-id="registrations"><span class="qicon">🧾</span><b>View Registrations</b><span class="mu">Search, filter and export CSV</span></button>
 <button class="card pad quick" data-a="tab" data-id="members"><span class="qicon">👥</span><b>View Members</b><span class="mu">Everyone who has signed up</span></button>
 <button class="card pad quick" data-a="tab" data-id="events"><span class="qicon">📅</span><b>Manage Events</b><span class="mu">Edit, publish or delete events</span></button>
 </div>
 <div class="section-h"><h3>Recent registrations</h3></div>
 <div class="scroll"><table><tr><th>Member</th><th>Event</th><th>Status</th><th>Payment</th><th>Date</th></tr>
 ${recent.map(r=>`<tr><td>${h(r.profiles?.name)}</td><td>${h(r.events?.title)}</td><td>${chip(r.status)}</td><td>${chip(r.payment_status)}</td><td>${h(String(r.created_at).slice(0,10))}</td></tr>`).join('')||'<tr><td colspan="5" class="mu">No registrations yet.</td></tr>'}</table></div>`};
const tEvents=()=>`<div class="row"><h3>Events</h3><button class="btn sm" data-a="newEv">New event</button></div><div class="scroll"><table><tr><th>Title</th><th>Date</th><th>City</th><th>Fee</th><th>Seats</th><th>Status</th><th></th></tr>
${AE.map(e=>`<tr><td>${h(e.title)}</td><td>${fmt(e.date)}</td><td>${h(e.city)}</td><td>${rs(e.price)}</td><td>${e.registered_count}/${e.capacity}</td><td>${chip(e.status)}</td><td class="acts"><button class="btn sm ghost" data-a="editEv" data-id="${e.id}">Edit</button><button class="btn sm ghost" data-a="toggle" data-id="${e.id}">${e.status==='published'?'Unpublish':'Publish'}</button><button class="btn sm danger" data-a="delEv" data-id="${e.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="7" class="mu">No events yet. Select New event to create the first one.</td></tr>'}</table></div>`;
const tMembers=()=>`<h3>Registered members</h3><div class="scroll"><table><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th></tr>${AM.map(u=>`<tr><td>${h(u.name)}</td><td>${h(u.email)}</td><td>${h(u.phone)}</td><td>${h(String(u.created_at).slice(0,10))}</td></tr>`).join('')||'<tr><td colspan="4" class="mu">No members yet.</td></tr>'}</table></div>`;
const tRegs=()=>`<div class="filters"><input id="rq" placeholder="Search name, email, phone or ID" oninput="drawRegs()"><select id="re" onchange="drawRegs()"><option value="">All events</option>${AE.map(e=>`<option value="${e.id}">${h(e.title)}</option>`).join('')}</select><button class="btn sm" data-a="csv">Export CSV</button></div>
<div class="scroll"><table><thead><tr><th>ID</th><th>Member</th><th>Email</th><th>Phone</th><th>Event</th><th>Status</th><th>Payment</th><th>Amount</th><th>Date</th></tr></thead><tbody id="rt"></tbody></table></div>`;
const filt=()=>{const q=($('#rq')?.value||'').toLowerCase(),ev=$('#re')?.value||'';return AR.filter(r=>(!ev||r.event_id===ev)&&(!q||[r.code,r.profiles?.name,r.profiles?.email,r.profiles?.phone].join(' ').toLowerCase().includes(q)))};
function drawRegs(){$('#rt').innerHTML=filt().map(r=>`<tr><td><b>${h(r.code)}</b></td><td>${h(r.profiles?.name)}</td><td>${h(r.profiles?.email)}</td><td>${h(r.profiles?.phone)}</td><td>${h(r.events?.title)}</td><td>${chip(r.status)}</td><td>${chip(r.payment_status)}</td><td>${rs(r.amount)}</td><td>${h(String(r.created_at).slice(0,10))}</td></tr>`).join('')||'<tr><td colspan="9" class="mu">No registrations found.</td></tr>'}

/* ---------- modals and forms ---------- */
const closeM=()=>$('#m')?.remove();
const modal=x=>{closeM();const m=document.createElement('div');m.id='m';m.className='modal';m.innerHTML=`<div class="card pad box">${x}</div>`;document.body.appendChild(m)};
const ask=(msg,a,id)=>modal(`<p>${msg}</p><div class="row"><button class="btn ghost" data-a="closeM">Keep it</button><button class="btn danger" data-a="${a}" data-id="${id}">Yes, continue</button></div>`);
const payModal=r=>modal(`<h3>Complete payment</h3><p>Registration <b>${h(r.code)}</b></p><div class="amt">${rs(r.amount)}</div><p class="mu">${API===mock?'Demo payment: no real money is charged.':'Test payment. Razorpay is added in the next step.'}</p><button class="btn big" data-a="pay" data-id="${r.id}">Pay ${rs(r.amount)}</button><p><button class="btn ghost big" data-a="later">Pay later (seat is held)</button></p>`);
const evForm=e=>{e=e||{status:'draft',category:CATS[0],capacity:50,price:0};const opt=(l,v)=>l.map(c=>`<option ${c===v?'selected':''}>${c}</option>`).join('');
 modal(`<h3>${e.id?'Edit event':'New event'}</h3><form data-f="ev"><input type="hidden" name="id" value="${e.id||''}"><label>Title<input name="title" required maxlength="120" value="${h(e.title)}"></label><label>Description<textarea name="description" required rows="3">${h(e.description)}</textarea></label>
 <div class="two"><label>Category<select name="category">${opt(CATS,e.category)}</select></label><label>Status<select name="status">${opt(['draft','published','cancelled','completed'],e.status)}</select></label><label>Date<input type="date" name="date" required value="${e.date||''}"></label><label>City<input name="city" required value="${h(e.city)}"></label>
 <label>Start<input type="time" name="start_time" required value="${e.start_time||''}"></label><label>End<input type="time" name="end_time" required value="${e.end_time||''}"></label><label>Capacity<input type="number" name="capacity" min="1" required value="${e.capacity}"></label><label>Fee in ₹ (0 = free)<input type="number" name="price" min="0" required value="${e.price}"></label></div>
 <label>Venue<input name="venue" required value="${h(e.venue)}"></label><label>Image URL (optional)<input name="image_url" type="url" value="${h(e.image_url)}"></label>
 <div class="row"><button type="button" class="btn ghost" data-a="closeM">Cancel</button><button class="btn">Save event</button></div></form>`)};

/* ---------- actions ---------- */
const A={closeM,
 scrollContact(){$('#footer-contact')?.scrollIntoView({behavior:'smooth'})},
 lightbox(id){closeM();const[src,cap]=window.SHOTS[+id];const lb=document.createElement('div');lb.className='lightbox';lb.id='m';
  lb.innerHTML=`<button class="lb-close" data-a="closeM">✕</button><div><img src="${src}" alt="${h(cap)}"><p class="lb-cap">${h(cap)}</p></div>`;
  document.body.appendChild(lb);lb.addEventListener('click',e=>{if(e.target===lb)closeM()})},
 mode(){MODE=MODE==='in'?'up':'in';route()},
 async logout(){await API.signOut();ME=null;go('#/')},
 async reg(id){if(!ME){NEXT=location.hash;toast('Log in to register for this event');return go('#/login')}const r=await API.register(id);if(+r.amount>0)return payModal(r);toast('Registered. Your ID is '+r.code);go('#/my')},
 async pay(id){await API.pay(id);closeM();toast('Payment received. Seat confirmed.');go('#/my')},
 later(){closeM();toast('Seat held. Pay from My registrations.');go('#/my')},
 payNow(id){payModal(MY.find(x=>x.id===id))},
 cancel(id){ask('Cancel this registration? A paid registration is flagged for refund.','cancelYes',id)},
 async cancelYes(id){await API.cancel(id);closeM();toast('Registration cancelled');route()},
 tab(t){TAB=t;route()},newEv(){evForm()},editEv(id){evForm(AE.find(e=>e.id===id))},
 async toggle(id){const e=AE.find(x=>x.id===id),n=await API.saveEvent({id,status:e.status==='published'?'draft':'published'});toast(n?`Published. Announcement email would go to ${n} members (demo).`:'Status updated');route()},
 delEv(id){ask('Delete this event permanently?','delYes',id)},
 async delYes(id){await API.delEvent(id);closeM();toast('Event deleted');route()},
 csv(){const c=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return'"'+s.replace(/"/g,'""')+'"'};
  const rows=[['Registration ID','Name','Email','Phone','Event','Event date','Status','Payment','Amount','Registered on'],...filt().map(r=>[r.code,r.profiles?.name,r.profiles?.email,r.profiles?.phone,r.events?.title,r.events?.date,r.status,r.payment_status,r.amount,r.created_at])];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(c).join(',')).join('\r\n')],{type:'text/csv'}));a.download='eventkalam-registrations.csv';a.click();toast('CSV exported')}
};
const F={
 contact(f){const d=Object.fromEntries(new FormData(f));
  location.href=`mailto:info@robokalam.com?subject=${encodeURIComponent('Message from '+d.name+' via EventKalam')}&body=${encodeURIComponent(d.message+'\n\nFrom: '+d.name+' ('+d.email+')')}`;
  toast('Opening your email app to send the message...');f.reset()},
 async auth(f){const d=Object.fromEntries(new FormData(f));ME=MODE==='up'?await API.signUp(d.name.trim(),d.email.trim(),d.phone.trim(),d.pw):await API.signIn(d.email.trim(),d.pw);
  if(!ME){MODE='in';toast('Account created. Confirm your email, then log in.');return route()}
  toast('Welcome, '+ME.name);const n=NEXT;NEXT='';go(n||(ME.role==='admin'?'#/admin':'#/'))},
 async ev(f){const d=Object.fromEntries(new FormData(f));if(!d.id)delete d.id;d.capacity=+d.capacity;d.price=+d.price;d.image_url=d.image_url||null;
  const old=d.id&&AE.find(e=>e.id===d.id);if(old&&d.capacity<old.registered_count)throw Error('Capacity cannot be below current registrations ('+old.registered_count+')');
  const n=await API.saveEvent(d);closeM();toast(n?`Event saved. Announcement email would go to ${n} members (demo).`:'Event saved');route()}
};
const run=async fn=>{try{await fn()}catch(e){toast(e.message||'Something went wrong',1)}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;e.preventDefault();run(()=>A[b.dataset.a](b.dataset.id))});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-f]');if(!f)return;e.preventDefault();run(()=>F[f.dataset.f](f))});

/* ---------- router and boot ---------- */
async function route(){const[,pg,id]=(location.hash.slice(1)||'/').split('/');let v;
 try{v=pg==='event'?await vEvent(id):pg==='login'?vLogin():pg==='my'?await vMy():pg==='admin'?await vAdmin():pg==='about'?vAbout():pg==='showcase'?vShowcase():pg==='events'?await vEvents():await vHome()}
 catch(e){v=`<div class="card pad"><b>Something went wrong</b><p class="mu">${h(e.message)}</p></div>`}
 $('#app').innerHTML=nav()+`<main class="wrap">${v}</main>`+footer();scrollTo(0,0);if($('#grid'))grid();if($('#rt'))drawRegs();reveal()}
const reveal=()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('show'));return}
 const io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.add('show');io.unobserve(en.target)}}),{threshold:.12});
 els.forEach(e=>io.observe(e))};
addEventListener('hashchange',route);
(async()=>{try{if(SUPABASE_URL&&SUPABASE_KEY){await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';s.onload=ok;s.onerror=()=>no(Error('Could not load the Supabase library'));document.head.appendChild(s)});
  sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);API=real}
 ME=await API.me()}catch(e){toast(e.message,1)}route()})();
