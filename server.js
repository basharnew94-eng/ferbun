'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PORT = Number(process.env.PORT || 10000);
const API_KEY = process.env.TTS_API_KEY;
const SPEAKER_ID = process.env.TTS_SPEAKER_ID || 'kurmanji_236';
const MODEL_VERSION = process.env.TTS_MODEL_VERSION || 'v4';
const INDEX = path.join(__dirname, 'index.html');
const windows = new Map();
function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(body);
}
function limited(ip) {
  const now=Date.now(); let x=windows.get(ip);
  if(!x || now-x.start>60000) x={start:now,count:0};
  x.count++; windows.set(ip,x); return x.count>20;
}
const server=http.createServer(async (req,res)=>{
  const ip=req.socket.remoteAddress||'unknown';
  if(limited(ip)) return send(res,429,JSON.stringify({error:'تم تجاوز عدد الطلبات. حاول بعد دقيقة.'}));
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET' && (url.pathname==='/' || url.pathname==='/index.html')) {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self' https: data: blob: 'unsafe-inline'; connect-src 'self' https:; media-src 'self' blob:; img-src 'self' data: https:"});
    return fs.createReadStream(INDEX).pipe(res);
  }
  if(req.method==='GET' && url.pathname==='/health') return send(res,200,JSON.stringify({ok:true,ttsKeyConfigured:Boolean(API_KEY)}));
  if(req.method!=='POST' || url.pathname!=='/api/tts-audio') return send(res,404,JSON.stringify({error:'Not found'}));
  if(!API_KEY) return send(res,503,JSON.stringify({error:'لم يتم ضبط TTS_API_KEY في إعدادات الاستضافة.'}));
  try {
    let raw='';
    for await (const chunk of req) { raw+=chunk.toString('utf8'); if(raw.length>6000) return send(res,413,JSON.stringify({error:'النص أكبر من الحد المسموح.'})); }
    const body=JSON.parse(raw||'{}');
    if(typeof body.text!=='string' || !body.text.trim() || body.text.length>500) return send(res,400,JSON.stringify({error:'أدخل نصًا كرديًا بطول 500 حرف أو أقل.'}));
    const upstream=await fetch('https://www.kurdishtts.com/api/tts-proxy',{method:'POST',headers:{'x-api-key':API_KEY,'Content-Type':'application/json'},body:JSON.stringify({text:body.text,speaker_id:SPEAKER_ID,model_version:MODEL_VERSION,format:'wav'})});
    if(!upstream.ok){const detail=(await upstream.text().catch(()=>'' )).slice(0,500);return send(res,upstream.status,JSON.stringify({error:'رفضت خدمة KurdishTTS الطلب.',detail}));}
    const audio=Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200,{'Content-Type':upstream.headers.get('content-type')||'audio/wav','Content-Length':audio.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(audio);
  } catch(e) { if(!res.headersSent) send(res,400,JSON.stringify({error:'تعذر معالجة الطلب أو الاتصال بخدمة النطق.'})); else res.destroy(); }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Fêrbûn HTTPS proxy ready on port ${PORT}`));
