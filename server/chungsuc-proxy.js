'use strict';
const http=require('http');
const fs=require('fs');
const net=require('net');

module.exports=function createChungSucProxy(options={}) {
  const keyFile=options.keyFile || '/home/pi/chungsuc-telegram-bot/secrets/web-gateway-key';
  let key='';
  try {key=fs.readFileSync(keyFile,'utf8').trim();} catch (_) {}
  const port=options.port || 3018;
  return function chungSucProxy(req,res) {
    const send=(status,message)=>{
      if (res.headersSent) return res.destroy();
      res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({ok:false,message}));
    };
    res.removeHeader('X-Powered-By');
    const pathname=req.url.split('?')[0];
    if (!/^\/(catalog|orders|lookup|receipt|pay|cancel)$/.test(pathname) || !['GET','POST','OPTIONS'].includes(req.method)) return send(404,'Không tìm thấy chức năng.');
    if ((req.method==='GET' && pathname!=='/catalog') || (req.method==='POST' && pathname==='/catalog')) return send(405,'Phương thức không hợp lệ.');
    if (!key || key.length<48) return send(503,'Kết nối đang được chuẩn bị. Vui lòng thử lại sau.');
    const length=req.headers['content-length'];
    if (length && (!/^\d+$/.test(length) || Number(length)>8192)) return send(413,'Nội dung quá dài.');
    const peer=(req.socket.remoteAddress || '').replace(/^::ffff:/,'');
    const loopback=peer==='127.0.0.1' || peer==='::1';
    const claimed=req.headers['cf-connecting-ip'];
    const client=loopback && typeof claimed==='string' && net.isIP(claimed) ? claimed : (net.isIP(peer) ? peer : '127.0.0.1');
    const headers={'X-SKCS-Gateway':key,'X-SKCS-Client-IP':client};
    for (const name of ['origin','content-type','content-length']) if (req.headers[name]) headers[name]=req.headers[name];
    const guest=(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>/^__Secure-skcs_guest=[a-f0-9]{64}$/.test(x));
    if (guest) headers.Cookie=guest;
    const upstream=http.request({hostname:'127.0.0.1',port,path:'/chungsuclienquan/api'+req.url,method:req.method,headers},response=>{
      res.statusCode=response.statusCode;
      for (const [name,value] of Object.entries(response.headers)) {
        if (value && !['connection','transfer-encoding','keep-alive','upgrade'].includes(name)) res.setHeader(name,value);
      }
      response.on('error',()=>res.destroy());response.pipe(res);
    });
    upstream.setTimeout(12000,()=>upstream.destroy(new Error('timeout')));
    upstream.on('error',()=>send(503,'Kết nối đang chậm. Giữ phiếu mua và thử lại.'));
    req.on('aborted',()=>upstream.destroy());
    let received=0;
    req.on('data',part=>{received+=part.length;if (received>8192) {upstream.destroy();send(413,'Nội dung quá dài.');}});
    req.pipe(upstream);
  };
};
