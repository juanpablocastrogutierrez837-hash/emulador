// Servidor de Velocity Underground. Sin dependencias: solo Node.js 18+.
// Uso: node servidor.js   (puerto con la variable PORT, por defecto 3000)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,ROOMS=new Map(),MAXP=8;

const srv=http.createServer((q,r)=>{
  if(q.url=='/'||q.url.startsWith('/?')){
    fs.readFile(path.join(__dirname,'velocity-underground.html'),(e,d)=>{
      if(e){r.writeHead(500);return r.end('Falta velocity-underground.html junto a servidor.js')}
      r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d)})
  }else if(q.url=='/salud'){r.end('ok')}
  else{r.writeHead(404);r.end()}
});

function frame(s){const b=Buffer.from(s),n=b.length;let h;
  if(n<126)h=Buffer.from([0x81,n]);else{h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}
  return Buffer.concat([h,b])}
function send(c,o){if(!c.dead&&c.s.writable)c.s.write(frame(JSON.stringify(o)))}
function bc(c,o){c.room.forEach(x=>{if(x!==c)send(x,o)})}
function leave(c){if(c.dead)return;c.dead=1;
  if(c.room){c.room.delete(c);bc(c,{t:'l',id:c.id});if(!c.room.size)ROOMS.delete(c.rn)}}

srv.on('upgrade',(q,s)=>{
  const k=q.headers['sec-websocket-key'];
  if(!k||String(q.headers.upgrade).toLowerCase()!='websocket')return s.destroy();
  s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+
    crypto.createHash('sha1').update(k+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
  const c={s,id:crypto.randomBytes(4).toString('hex'),room:null,rn:'',p:{},buf:Buffer.alloc(0),dead:0};
  s.on('data',d=>{c.buf=Buffer.concat([c.buf,d]);if(c.buf.length>16384)return s.destroy();parse(c)});
  s.on('close',()=>leave(c));s.on('error',()=>s.destroy());
});

function parse(c){
  for(;;){
    const b=c.buf;if(b.length<2)return;
    const op=b[0]&15;let n=b[1]&127,o=2;
    if(n==126){if(b.length<4)return;n=b.readUInt16BE(2);o=4}else if(n==127)return c.s.destroy();
    if(!(b[1]&128))return c.s.destroy();            // los navegadores siempre enmascaran
    if(b.length<o+4+n)return;
    const m=b.subarray(o,o+4),p=Buffer.from(b.subarray(o+4,o+4+n));
    for(let i=0;i<n;i++)p[i]^=m[i&3];
    c.buf=b.subarray(o+4+n);
    if(op==8)return c.s.end();
    if(op==9&&n<126){c.s.write(Buffer.concat([Buffer.from([0x8a,n]),p]));continue}
    if(op==1)msg(c,p.toString());
  }
}

function msg(c,t){
  let m;try{m=JSON.parse(t)}catch(e){return}
  if(m.t=='j'&&!c.room){
    const r=String(m.r||'');
    if(!/^[a-z0-9_.-]{1,48}$/.test(r))return c.s.destroy();
    let R=ROOMS.get(r);if(!R)ROOMS.set(r,R=new Set());
    if(R.size>=MAXP){send(c,{t:'x'});return c.s.end()}
    c.room=R;c.rn=r;
    send(c,{t:'w',id:c.id,all:[...R].map(o=>({id:o.id,p:o.p}))});
    R.add(c);bc(c,{t:'p',id:c.id,p:c.p});
  }else if(m.t=='p'&&c.room&&m.d&&typeof m.d=='object'){
    for(const k in m.d){
      if(!/^[a-z]{1,8}$/.test(k))continue;
      const v=m.d[k];
      if(v===null)delete c.p[k];
      else if(typeof v=='number'||(typeof v=='string'&&v.length<=16))c.p[k]=v;
    }
    bc(c,{t:'p',id:c.id,p:c.p});
  }
}

srv.listen(PORT,'0.0.0.0',()=>console.log('Velocity Underground en http://localhost:'+PORT));
