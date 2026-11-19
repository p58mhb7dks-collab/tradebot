import fs from 'fs';
// Einstellungen: hier kannst du Konto und Risiko ändern
const ACCT=10000, RISK=0.5, TZ='Europe/Vienna';
const SYMS=['BTCUSDT','ETHUSDT','SOLUSDT'];
const API=['https://data-api.binance.vision','https://api.binance.com','https://api.binance.us'];
const DEF={touch:3,rl:45,rh:70,rr:2,buf:.2,dmin:.5,dmax:3};
const RNG={rr:[1,4,.5],rl:[35,55,5],rh:[60,80,5],touch:[2,5,1],buf:[.1,.6,.1],dmin:[.3,1,.1],dmax:[2,4,.5]};
const f=(n,d=2)=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const av=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const day=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:TZ});

async function kl(sym,iv,limit){
  for(const b of API){
    try{const r=await fetch(`${b}/api/v3/klines?symbol=${sym}&interval=${iv}&limit=${limit}`);
      if(!r.ok)continue;
      return (await r.json()).map(k=>({t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],ct:k[6]}));
    }catch(e){}
  }
  throw new Error('Keine Kursdaten');
}
const ema=(a,p)=>{const k=2/(p+1);let e=a[0];return a.map((v,i)=>i?(e=v*k+e*(1-k)):e)};
function rsi(c,p=14){
  const r=Array(c.length).fill(50);let g=0,l=0;
  for(let i=1;i<c.length;i++){
    const d=c[i]-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);
    if(i<=p){g+=u/p;l+=w/p}else{g=(g*(p-1)+u)/p;l=(l*(p-1)+w)/p}
    if(i>=p)r[i]=l===0?100:100-100/(1+g/l);
  }
  return r;
}
function atr(cs,p=14){let a=0;return cs.map((x,i)=>{const t=i?Math.max(x.h-x.l,Math.abs(x.h-cs[i-1].c),Math.abs(x.l-cs[i-1].c)):x.h-x.l;a=i?(a*(p-1)+t)/p:t;return a})}
function prep(c5,c1){
  const e21=ema(c5.map(x=>x.c),21),R=rsi(c5.map(x=>x.c)),A=atr(c5);
  const cl=c1.map(x=>x.c),e50=ema(cl,50),e200=ema(cl,200),tr=[];let j=-1;
  for(let i=0;i<c5.length;i++){
    while(j+1<c1.length&&c1[j+1].ct<c5[i].t)j++;
    tr.push(j<0?0:(cl[j]>e50[j]&&e50[j]>e200[j]?1:(cl[j]<e50[j]&&e50[j]<e200[j]?-1:0)));
  }
  return{e21,R,A,tr};
}
function sig(c,P,i,p){
  if(i<30)return null;
  const x=c[i],pv=c[i-1],T=P.tr[i],a=P.A[i],R=P.R[i];
  if(!T)return null;
  let touch=false;
  for(let k=i-p.touch;k<i;k++){if(T==1?c[k].l<=P.e21[k]:c[k].h>=P.e21[k])touch=true}
  if(!touch)return null;
  const w=c.slice(i-4,i+1);
  if(T==1&&x.c>P.e21[i]&&x.c>pv.h&&R>p.rl&&R<p.rh){
    const sl=Math.min(...w.map(z=>z.l))-p.buf*a,d=x.c-sl;
    if(d>p.dmin*a&&d<p.dmax*a)return{dir:1,e:x.c,sl,tp:x.c+p.rr*d,t:x.t,rsi:R,k:d/a};
  }
  if(T==-1&&x.c<P.e21[i]&&x.c<pv.l&&R<100-p.rl&&R>100-p.rh){
    const sl=Math.max(...w.map(z=>z.h))+p.buf*a,d=sl-x.c;
    if(d>p.dmin*a&&d<p.dmax*a)return{dir:-1,e:x.c,sl,tp:x.c-p.rr*d,t:x.t,rsi:R,k:d/a};
  }
  return null;
}
function sim(c,i,s,maxN=288){
  const d=Math.abs(s.e-s.sl),rr=Math.abs(s.tp-s.e)/d,fee=s.e*0.0008/d,end=Math.min(c.length-1,i+maxN);
  for(let j=i+1;j<=end;j++){
    const sl=s.dir==1?c[j].l<=s.sl:c[j].h>=s.sl,tp=s.dir==1?c[j].h>=s.tp:c[j].l<=s.tp;
    if(sl)return{r:-1-fee,j};
    if(tp)return{r:rr-fee,j};
  }
  if(i+maxN<=c.length-1)return{r:((c[end].c-s.e)*s.dir)/d-fee,j:end};
  return null;
}
function stats(rs){
  const n=rs.length,w=rs.filter(r=>r>0).length,sum=rs.reduce((a,b)=>a+b,0);
  return{n,w,sum,avg:n?sum/n:0};
}

/* Zustand */
const mk=(id,name,o,since)=>({id,name,since,p:{...DEF,...o}});
function fresh(){const t=Date.now();return{cfg:{acct:ACCT,risk:RISK},start:t,hb:0,champ:1,nid:6,tid:1,T:[],rev:[],
  V:[mk(1,'Basis',{},t),mk(2,'RR 1,5',{rr:1.5},t),mk(3,'RR 3',{rr:3},t),mk(4,'Streng',{rl:50,rh:65,touch:2},t),mk(5,'Weiter Stop',{buf:.5,dmax:4},t)]}}
let S,ok=true;
try{S=JSON.parse(fs.readFileSync('state.json','utf8'))}catch(e){S=fresh();ok=false}
S.cfg={acct:ACCT,risk:RISK};
const before=ok?JSON.stringify(S):'';
const st=v=>stats(S.T.filter(x=>x.v==v.id&&x.r!=null).map(x=>x.r));
const vn=id=>(S.V.find(v=>v.id==id)||{name:'?'}).name;

function mutate(b){
  const p={...b.p},ks=Object.keys(RNG),k=ks[Math.floor(Math.random()*ks.length)],[lo,hi,step]=RNG[k];
  p[k]=Math.min(hi,Math.max(lo,+(p[k]+(Math.random()<.5?-step:step)).toFixed(2)));
  return{id:S.nid++,name:`Mut ${k} ${f(p[k],1)}`,since:Date.now(),p};
}
function evolve(){
  const out=[];let ch=S.V.find(v=>v.id==S.champ);const cs=st(ch);let best=null;
  for(const v of S.V){
    if(v.id==ch.id)continue;const s=st(v);
    if(s.n>=30&&s.avg>0&&s.avg>cs.avg+.15&&(!best||s.avg>best.s.avg))best={v,s};
  }
  if(best){S.champ=best.v.id;ch=best.v;out.push(`Wechsel: ${best.v.name} ist jetzt Champion (Ø ${f(best.s.avg)} R über ${best.s.n} Trades, vorher ${f(cs.avg)} R).`)}
  S.V.forEach((v,i)=>{
    if(v.id==S.champ)return;const s=st(v);
    if(s.n>=40&&s.avg<-.2){const m=mutate(ch);S.V[i]=m;out.push(`${v.name} aussortiert (Ø ${f(s.avg)} R über ${s.n} Trades). Neu im Test: ${m.name}.`)}
  });
  if(!out.length)out.push('Keine Änderung. Ein Wechsel braucht mindestens 30 Trades und 0,15 R mehr im Schnitt.');
  return out;
}
function review(){
  const today=day(Date.now()),made=[];
  const days=[...new Set(S.T.map(x=>day(x.t)))].filter(d=>d<today&&!S.rev.some(r=>r.day==d)).sort();
  for(const d of days){
    const ts=S.T.filter(x=>day(x.t)==d&&x.r!=null),off=ts.filter(x=>x.off);
    if(!ts.length)continue;
    const so=stats(off.map(x=>x.r)),L=[];
    L.push(`Offiziell (${vn(S.champ)}): ${so.n} Trades, ${so.w} Treffer, ${f(so.sum)} R, das sind ${f(so.sum*RISK,1)} % Konto.`);
    const per=S.V.map(v=>({v,s:stats(ts.filter(x=>x.v==v.id).map(x=>x.r))})).filter(z=>z.s.n).sort((a,b)=>b.s.sum-a.s.sum);
    if(per.length>1)L.push(`Beste Variante des Tages: ${per[0].v.name} (${f(per[0].s.sum)} R). Schwächste: ${per[per.length-1].v.name} (${f(per[per.length-1].s.sum)} R).`);
    const wi=off.filter(x=>x.r>0),lo=off.filter(x=>x.r<=0);
    if(wi.length&&lo.length)L.push(`Ø Stopabstand: Gewinner ${f(av(wi.map(x=>x.k)),1)} ATR, Verlierer ${f(av(lo.map(x=>x.k)),1)} ATR.`);
    const sy=SYMS.map(s=>[s,av(off.filter(x=>x.sym==s).map(x=>x.r)),off.filter(x=>x.sym==s).length]).filter(z=>z[2]).sort((a,b)=>b[1]-a[1]);
    if(sy.length>1)L.push(`Bester Markt: ${sy[0][0]} (Ø ${f(sy[0][1])} R), schwächster: ${sy[sy.length-1][0]} (Ø ${f(sy[sy.length-1][1])} R).`);
    L.push(...evolve());
    S.rev.push({day:d,lines:L});made.push(`${d}\n${L.join('\n')}`);
  }
  return made;
}
async function push(msg){
  const t=process.env.NTFY_TOPIC;if(!t||!msg)return;
  try{await fetch('https://ntfy.sh/'+t,{method:'POST',headers:{Title:'Trade-Tagebuch'},body:msg})}catch(e){}
}

/* Lauf */
const news=[];
for(const sym of SYMS){
  let c5,c1;
  try{[c5,c1]=await Promise.all([kl(sym,'5m',400),kl(sym,'1h',500)])}catch(e){console.log(sym,e.message);continue}
  const c=c5[c5.length-1].ct>Date.now()?c5.slice(0,-1):c5,P=prep(c,c1);
  for(const x of S.T.filter(x=>x.sym==sym&&x.r==null)){
    const i=c.findIndex(k=>k.t==x.t);
    if(i<0){x.r=0;x.xt=Date.now();continue}
    const o=sim(c,i,x);if(o){x.r=o.r;x.xt=c[o.j].t}
  }
  for(const v of S.V){
    const mine=S.T.filter(x=>x.sym==sym&&x.v==v.id);let bu=-1;
    for(let i=30;i<c.length;i++){
      const t=c[i].t;if(t<v.since||t<=bu)continue;
      const ex=mine.find(x=>x.t==t);
      if(ex){bu=ex.r==null?Infinity:ex.xt;continue}
      const s=sig(c,P,i,v.p);if(!s)continue;
      const o=sim(c,i,s),x={id:S.tid++,v:v.id,sym,...s,r:o?o.r:null,xt:o?c[o.j].t:null,off:v.id==S.champ};
      S.T.push(x);mine.push(x);bu=o?x.xt:Infinity;
      if(x.off)news.push(`${x.dir==1?'LONG':'SHORT'} ${sym}\nEinstieg ${f(x.e,x.e<10?4:2)}, Stop ${f(x.sl,x.e<10?4:2)}, Ziel ${f(x.tp,x.e<10?4:2)}`);
    }
  }
}
if(S.T.length>1500)S.T=S.T.slice(-1200);
const made=review();
if(Date.now()-(S.hb||0)>3600e3)S.hb=Date.now();
await push(news.join('\n\n'));
await push(made.join('\n\n'));
if(JSON.stringify(S)!==before)fs.writeFileSync('state.json',JSON.stringify(S));
console.log('fertig',new Date().toISOString(),'neue Signale:',news.length);
