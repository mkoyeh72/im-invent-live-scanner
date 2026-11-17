/* IM-INVENT External HTTPS Live Scanner (RC8)
 * Scan runs client-side, no IM-INVENT token/user list is transferred here.
 * The only cross-origin message is the scanned string via validated opener handshake.
 * This page requires HTTPS and a modern browser with camera permission.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const query=new URLSearchParams(location.search);
  const channel=String(query.get('channel')||'');
  const validChannel=/^[a-f0-9]{32}$/i.test(channel);
  const opener=window.opener || null;
  const returnTo=String(query.get('return_to')||'');
  function validatedReturnUrl(value){
    try {
      const url=new URL(value);
      // Only Google Apps Script web-app URLs. Never navigate to arbitrary websites.
      if(url.protocol!=='https:' || url.hostname!=='script.google.com' ||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/(?:exec|dev)\/?$/.test(url.pathname) ||
        url.search || url.hash || url.username || url.password) return '';
      return url.href;
    }catch(_){return '';}
  }
  const approvedReturnUrl=validatedReturnUrl(returnTo);
  let openerOrigin='';
  let qr=null, active=false, result='', confirmed=false, lastValue='', lastAt=0;
  let handshakeAttempts=0;
  const bridge=$('bridge-state');
  const fallback=$('fallback');

  function isAppsScriptOrigin(value){
    try {
      const url=new URL(value);
      return url.protocol==='https:' && (url.hostname==='script.google.com' || url.hostname.endsWith('.googleusercontent.com'));
    }catch(_){return false;}
  }
  function setStatus(msg){$('status').textContent=msg;}
  function setReturn(msg){$('return-status').textContent=msg;}
  function setBridge(ok){bridge.classList.toggle('ok',ok);bridge.textContent=ok?'IM-INVENT terhubung':'Mode manual tersedia';fallback.hidden=!!ok;}
  function updateReturnButton(){
    const btn=$('return-app');
    if(btn)btn.disabled=!(approvedReturnUrl && String($('code').value||'').trim());
    const hint=$('return-hint');
    if(hint)hint.textContent=approvedReturnUrl?
      'Tombol ini membuka kembali IM-INVENT melalui URL resminya. Login kembali jika diminta; detail akan muncul setelah data dimuat.':
      'URL kembali belum diterima dari IM-INVENT. Buka scanner melalui tombol IM-INVENT yang sudah diupdate ke RC8, atau gunakan Salin kode.';
  }
  function goBackToApp(){
    const code=String($('code').value||'').trim();
    if(!approvedReturnUrl || !code || code.length>512){setReturn('URL IM-INVENT atau kode belum valid. Gunakan Salin kode.');return;}
    const url=new URL(approvedReturnUrl);
    url.searchParams.set('scan_code',code);
    url.searchParams.set('scan_source','live_rc8');
    // Never include password, session token, database contents, or other account information.
    setReturn('Membuka IM-INVENT. Login jika diminta agar detail alat dapat dimuat.');
    window.location.assign(url.href);
  }
  function hello(){
    if(openerOrigin || !opener || !validChannel)return;
    try{opener.postMessage({source:'IM-INVENT-LIVE-SCANNER',type:'HELLO',channel:channel},'*');}catch(_){}
  }
  if(opener && validChannel){
    hello();
    const interval=setInterval(function(){
      if(openerOrigin || ++handshakeAttempts>12){clearInterval(interval);if(!openerOrigin)setBridge(false);return;}
      hello();
    },700);
  }else setBridge(false);

  window.addEventListener('message',function(event){
    if(!opener || event.source!==opener || !isAppsScriptOrigin(event.origin))return;
    const data=event.data;
    if(!data || data.source!=='IM-INVENT-LIVE-SCANNER' || data.channel!==channel || !validChannel)return;
    if(data.type==='READY'){
      openerOrigin=event.origin;
      setBridge(true);
      if(result && !confirmed)send();
    }else if(data.type==='ACK'){
      confirmed=true;
      setReturn('Kode berhasil dikirim. Kembali ke IM-INVENT untuk memeriksa detail dan mengonfirmasi transaksi.');
      setStatus('Berhasil. Data transaksi belum berubah.');
      stop().catch(()=>{});
      // window.close is allowed in many browsers when opened by window.open, but not guaranteed.
      setTimeout(function(){try{window.close();}catch(_){}},700);
    }
  });

  async function stop(){
    $('stop').disabled=true;
    if(qr && active){
      try {await qr.stop();}catch(err){console.warn('Stop camera:',err);}
    }
    active=false;$('start').disabled=false;
  }
  function onDecode(value){
    const clean=String(value||'').trim();
    if(!clean || clean.length>512)return;
    const now=Date.now();
    if(clean===lastValue && now-lastAt<1700)return;
    lastValue=clean;lastAt=now;
    result=clean;confirmed=false;
    $('code').value=clean;
    updateReturnButton();
    setStatus('Kode terbaca. Kamera dihentikan untuk verifikasi.');
    $('retry').disabled=false;
    stop().catch(()=>{});
    send(); // Sends only decoded code; IM-INVENT still requires confirmation.
  }
  async function start(){
    if(active)return;
    if(!window.isSecureContext || !navigator.mediaDevices){setStatus('Kamera membutuhkan HTTPS dan izin browser.');return;}
    if(typeof Html5Qrcode==='undefined'){setStatus('Library QR tidak termuat. Periksa internet / pemblokir CDN.');return;}
    $('start').disabled=true;
    $('retry').disabled=true;
    setStatus('Meminta izin kamera belakang...');
    try{
      if(!qr)qr=new Html5Qrcode('reader');
      await qr.start({facingMode:'environment'},{fps:10,aspectRatio:1.33,disableFlip:true},onDecode,()=>{});
      active=true;
      $('stop').disabled=false;
      setStatus('Kamera aktif. Arahkan QR / barcode ke tengah layar.');
    }catch(err){
      active=false;$('start').disabled=false;
      const detail=String(err && (err.message||err.name)||err||'');
      const msg=/notallowed|denied|permission/i.test(detail)?'Izin kamera ditolak. Izinkan kamera untuk halaman scanner HTTPS ini.':
        /notfound|device.*notfound/i.test(detail)?'Kamera tidak terdeteksi. Cek kamera perangkat.':
        /notreadable|trackstart/i.test(detail)?'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera lalu coba lagi.':
        'Kamera belum bisa dibuka: '+detail.slice(0,150);
      setStatus(msg);
    }
  }
  function send(){
    const code=String($('code').value||'').trim();
    if(!code || code.length>512){setReturn('Masukkan kode yang valid (maksimal 512 karakter).');return;}
    result=code;
    if(!opener || !openerOrigin || !validChannel){
      setReturn('Tab IM-INVENT tidak terhubung otomatis. Gunakan tombol “Salin kode”.');
      setBridge(false);return;
    }
    try{
      opener.postMessage({source:'IM-INVENT-LIVE-SCANNER',type:'RESULT',channel:channel,code:code},openerOrigin);
      setReturn('Kode terkirim. Menunggu konfirmasi dari tab IM-INVENT...');
    }catch(_){setReturn('Pengiriman gagal. Gunakan “Salin kode” lalu tempel di IM-INVENT.');setBridge(false);}
  }
  async function copy(){
    const code=String($('code').value||'').trim();
    if(!code){setReturn('Belum ada kode yang bisa disalin.');return;}
    try{
      if(navigator.clipboard && navigator.clipboard.writeText)await navigator.clipboard.writeText(code);
      else{$('code').select();if(!document.execCommand('copy'))throw new Error('copy tidak didukung');}
      setReturn('Kode disalin. Buka kembali tab IM-INVENT, tempel di input kode manual, lalu klik Proses.');
      setBridge(false);
    }catch(_){$('code').focus();$('code').select();setReturn('Tidak bisa salin otomatis. Salin teks yang terseleksi secara manual.');}
  }
  updateReturnButton();
  $('return-app').addEventListener('click',()=>goBackToApp());
  $('code').addEventListener('input',()=>updateReturnButton());
  $('start').addEventListener('click',()=>start());
  $('stop').addEventListener('click',()=>stop());
  $('retry').addEventListener('click',()=>{result='';confirmed=false;$('code').value='';updateReturnButton();start();});
  $('send').addEventListener('click',()=>send());
  $('copy').addEventListener('click',()=>copy());
  window.addEventListener('pagehide',()=>{stop().catch(()=>{});});
})();
