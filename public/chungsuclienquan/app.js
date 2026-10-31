'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const API=(['certios.xyz','www.certios.xyz'].includes(location.hostname) ? 'https://api.certios.xyz' : location.origin)+'/chungsuclienquan/api';
  const money=value=>new Intl.NumberFormat('vi-VN').format(Number(value)||0)+'₫';
  const KEY='certios.chungsuc.receipts.v1',PENDING='certios.chungsuc.pending.v1';
  const states={awaiting_payment:'Chờ thanh toán',queued:'Đã trả tiền · chờ xử lý',submitting:'Đang gửi xử lý',running:'Đang thực hiện',completed:'Hoàn thành',failed:'Đang đối soát',uncertain:'Đang đối soát',auth_required:'Đang chờ xử lý',price_changed:'Đang chờ xử lý',cancelled:'Đã hủy',expired:'Hết hạn thanh toán'};
  const descriptions={ve38:'Bắt đầu chung sức',ve76:'Nhiều cơ hội hơn',full342:'Trọn bộ 3 rương',ve1000:'Cho mục tiêu lớn'};
  let products=[],selected=null,accepting=true,busy=false,active=null,view='buy',lookupCode='',polling=false,qrRemaining=null,receiptData=null;
  let receiptRequest=0,lookupRequest=0,catalogBusy=false,recovering=false,bootstrapping=true,refreshBusy=false,lastPoll=0,lastLookupPoll=0,lastCatalogTry=0,recoveryUntil=Date.now()+90000;
  const saved=()=>{try {const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value) ? value.filter(x=>/^SKCS[A-Z0-9]{6}$/.test(x.code)&&/^[a-f0-9]{64}$/.test(x.key)).slice(0,20) : [];} catch (_) {return [];}};
  const remember=entry=>{try {localStorage.setItem(KEY,JSON.stringify([entry,...saved().filter(x=>x.code!==entry.code)].slice(0,20)));} catch (_) {}};
  const pending=()=>{try {return JSON.parse(localStorage.getItem(PENDING)||'null');} catch (_) {return null;}};
  function toast(text) {$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3200);}
  function error(text) {$('form-error').textContent=text;$('form-error').hidden=!text;}
  function element(tag,className,text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  async function api(path,data) {
    const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),16000);
    try {
      const response=await fetch(API+path,{method:data===undefined?'GET':'POST',credentials:'include',cache:'no-store',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:abort.signal});
      let result;try {result=await response.json();} catch (_) {throw new Error('Kết nối đang chậm. Giữ phiếu mua và thử lại.');}
      if(!response.ok||!result.ok){const failure=new Error(result.message||'Chưa thể thực hiện. Vui lòng thử lại.');failure.status=response.status;throw failure;}
      return result;
    } catch(e) {if(e.name==='AbortError'||e instanceof TypeError)throw new Error('Kết nối đang chậm. Phiếu mua được giữ lại; hãy thử lại.');throw e;} finally {clearTimeout(timeout);}
  }
  async function copy(value) {
    try {await navigator.clipboard.writeText(value);toast('Đã sao chép.');} catch (_) {
      const input=element('textarea');input.value=value;document.body.append(input);input.select();const done=document.execCommand('copy');input.remove();toast(done?'Đã sao chép.':'Chưa sao chép được. Hãy giữ mã đơn trên màn hình.');
    }
  }
  function switchView(next) {
    view=next;error('');$('buy-view').hidden=next!=='buy';$('lookup-view').hidden=next!=='lookup';
    for(const name of ['buy','lookup']) {$(name+'-tab').classList.toggle('active',next===name);$(name+'-tab').setAttribute('aria-selected',String(next===name));}
    if(next==='lookup')renderSaved();
  }
  function balanceNote(balance) {$('balance-note').hidden=balance<=0;$('balance-note').textContent='Bạn còn '+money(balance)+' từ phiếu mua trước. Hệ thống tự dùng khi đủ thanh toán gói đã chọn.';}
  function selectProduct(product) {
    selected=product;
    for(const button of $('packages').children){const chosen=button.dataset.sku===product.sku;button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',String(chosen));}
    $('total-price').textContent=money(product.price);$('buy-button-label').textContent='Mua '+product.title+' · '+money(product.price);$('buy-button').disabled=busy||!accepting;
  }
  async function catalog() {
    if(catalogBusy)return false;catalogBusy=true;lastCatalogTry=Date.now();
    try {
      const data=await api('/catalog');accepting=data.accepting_orders;balanceNote(receiptData?.balance??data.balance);
      $('online-text').textContent=accepting?'Đang nhận đơn':'Tạm ngừng nhận đơn';
      if(products.length&&JSON.stringify(products)===JSON.stringify(data.products)){if(selected)selectProduct(selected);return true;}
      products=data.products;$('packages').replaceChildren();
      for(const product of products) {
        const button=element('button','package');button.type='button';button.dataset.sku=product.sku;
        button.append(element('span','package-radio'));
        const label=element('div','package-label',product.title.match(/[\d.]+/)?.[0]||product.title);label.append(element('span','', ' vé'));button.append(label);
        button.append(element('div','package-sub',product.title.includes('Săn SSS')?'Săn SSS · '+product.steps+' lần chạy':descriptions[product.sku]||product.title),element('div','package-price',money(product.price)));
        if(product.sku==='full342')button.append(element('span','package-badge','FULL 3 RƯƠNG'));
        button.addEventListener('click',()=>{if(!busy)selectProduct(product);});$('packages').append(button);
      }
      if(products.length)selectProduct(products.find(x=>x.sku===selected?.sku)||products[0]);
      else {$('buy-button').disabled=true;error('Chưa có gói đang mở bán.');}
      if(!accepting)error('Admin đang tạm ngừng nhận đơn mới. Bạn vẫn có thể tra cứu đơn đã mua.');
      return true;
    } catch(e) {if(!products.length)$('packages').replaceChildren(element('div','loading-box','Đang kết nối lại để tải gói vé…'));error(e.message);return false;}finally{catalogBusy=false;}
  }
  function freshKey() {const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function beginReceipt(row){active=row;receiptRequest++;qrRemaining=null;receiptData=null;$('receipt').hidden=true;history.replaceState(null,'','#order='+row.code+'&key='+row.key);}
  function adoptReceipt(order,key){beginReceipt({code:order.code,key,title:order.title});remember(active);if(pending()?.purchase_key===key){try{localStorage.removeItem(PENDING);}catch(_){}}renderReceipt(order);error('');renderSaved();}
  async function buy() {
    if(busy||!selected)return;const invite=$('invite').value.trim();if(!invite){error('Bạn chưa nhập mã mời sự kiện.');$('invite').focus();return;}
    busy=true;receiptRequest++;error('');$('buy-button').disabled=true;$('buy-button-label').textContent='Đang tạo phiếu mua…';
    let attempt=pending();
    if(!attempt||attempt.sku!==selected.sku||attempt.invite!==invite||!/^[a-f0-9]{64}$/.test(attempt.purchase_key||''))attempt={sku:selected.sku,invite,purchase_key:freshKey(),expected_price:selected.price};
    if(attempt.expected_price===undefined)attempt.expected_price=selected.price;
    try {
      try {localStorage.setItem(PENDING,JSON.stringify(attempt));} catch (_) {}
      const data=await api('/orders',attempt);adoptReceipt(data.order,attempt.purchase_key);$('receipt').scrollIntoView({behavior:'smooth',block:'start'});
    } catch(e) {error(e.message);if(e.status===400&&e.message.startsWith('Giá gói')){try{localStorage.removeItem(PENDING);}catch(_){}await catalog();}} finally {busy=false;if(selected)selectProduct(selected);}
  }
  function renderReceipt(data) {
    if(!active||data.code!==active.code)return;
    receiptData=data;$('receipt').hidden=false;$('receipt-title').textContent='Đơn của bạn';$('receipt-code').textContent=data.code;$('receipt-package').textContent=data.title+' · '+money(data.price);$('receipt-invite').textContent=data.invite||'';
    $('receipt-status').textContent=states[data.state]||'Đang cập nhật';$('receipt-status').classList.toggle('done',data.state==='completed');
    const progress=Math.max(0,Math.min(100,Number(data.progress)||0));$('progress-fill').style.width=progress+'%';$('receipt-progress').textContent=progress+'% · '+data.successful_steps+'/'+data.steps+' lượt thành công';
    const message={awaiting_payment:'Quét QR và chuyển đúng nội dung. Đủ tiền, đơn sẽ tự vào hàng chờ.',queued:'Đã thanh toán. Đơn được giữ trong hàng chờ và tự xử lý khi hệ thống sẵn sàng.',submitting:'Đã thanh toán. Đang gửi đơn xử lý.',running:'Đơn đang chạy. Bạn có thể đóng trang và quay lại bằng liên kết phiếu mua.',completed:'Đơn đã hoàn thành. Cảm ơn bạn đã chung sức cùng CertiOS!',failed:'Đơn đang được kiểm tra. Hãy giữ mã đơn để được hỗ trợ.',uncertain:'Đang đối soát kết quả xử lý. Đơn của bạn được giữ lại.',auth_required:'Đã thanh toán. Đơn sẽ tiếp tục khi kết nối xử lý phục hồi.',price_changed:'Đã thanh toán. Admin đang kiểm tra để tiếp tục xử lý.',cancelled:'Đơn đã hủy. Số tiền đã trừ, nếu có, được hoàn về phiên mua của bạn.',expired:'Phiếu đã hết hạn. Nếu chuyển khoản muộn, tiền khớp hợp lệ được giữ lại cho lần mua sau.'};
    $('receipt-message').textContent=message[data.state]||'Đang kiểm tra đơn.';
    if(data.state==='awaiting_payment'&&data.received>0)$('receipt-message').textContent='Đã nhận '+money(data.received)+'. Còn thiếu '+money(data.remaining)+'. Chuyển thêm cùng nội dung '+data.code+'.';
    $('receipt-balance').hidden=data.balance<=0;$('receipt-balance').textContent='Số tiền còn lại: '+money(data.balance)+'. Mở lại phiếu mua này trước khi đặt đơn tiếp theo để sử dụng.';balanceNote(data.balance);
    $('cancel-order').hidden=!data.can_cancel;$('pay-wallet').hidden=!(data.can_pay&&data.balance>=data.price);
    $('refresh-order').textContent=data.can_pay?'Kiểm tra tiền ngay':'Cập nhật';
    const paymentVisible=data.can_pay&&data.remaining>0;$('payment').hidden=!paymentVisible;
    if(paymentVisible) {
      $('bank-name').textContent=data.bank.account_name;$('copy-account').textContent=data.bank.account;$('payment-amount').textContent=money(data.remaining);$('copy-transfer').textContent=data.code;$('bank-delayed').hidden=!data.bank_delayed;
      if(data.qr){$('payment-qr').src=data.qr;$('payment-qr').hidden=false;qrRemaining=data.remaining;}
      else if(qrRemaining!==data.remaining){$('payment-qr').hidden=true;}
      const minutes=Math.max(0,Math.ceil((data.expires_at-(data.server_time||Date.now()/1000))/60));$('payment-expiry').textContent='Phiếu còn hiệu lực khoảng '+minutes+' phút.';
      if(data.bank_checked_at)$('payment-expiry').textContent+=' Banking kiểm tra lúc '+new Date(data.bank_checked_at*1000).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+'.';
    }
  }
  async function loadReceipt(includeQR=false,scroll=false,checkBank=false) {
    if(!active)return;
    const current=active;const serial=++receiptRequest;
    const data=await api('/receipt',{code:current.code,purchase_key:current.key,include_qr:includeQR,check_bank:checkBank});
    if(serial!==receiptRequest||current.code!==active?.code)return;
    renderReceipt(data.order);lastPoll=Date.now();
    if(data.order.can_pay&&data.order.remaining>0&&qrRemaining!==data.order.remaining&&!includeQR)await loadReceipt(true,false,checkBank);
    if(scroll)$('receipt').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function recoverPending(silent=false){
    const attempt=pending();if(active||busy||recovering||!attempt||!/^[a-f0-9]{64}$/.test(attempt.purchase_key||''))return;
    recovering=true;
    try{const result=await api('/receipt',{purchase_key:attempt.purchase_key,include_qr:true});if(active||busy||pending()?.purchase_key!==attempt.purchase_key)return;adoptReceipt(result.order,attempt.purchase_key);toast('Đã khôi phục phiếu mua.');}
    catch(e){if(!silent)error(e.status===400?'Phiếu mua chưa hoàn tất. Bạn có thể bấm Mua để tiếp tục.':'Đang khôi phục phiếu mua, hệ thống sẽ thử lại.');}
    finally{recovering=false;}
  }
  function renderSaved() {
    $('saved-orders').replaceChildren();const rows=saved();if(!rows.length)return;
    $('saved-orders').append(element('h3','','Phiếu đã lưu trên thiết bị này'));
    for(const row of rows.slice(0,6)){const button=element('button','saved-order');button.append(element('span','',row.code+' · '+(row.title||'Xem đơn')),element('span','','↗'));button.addEventListener('click',async()=>{if(busy)return;beginReceipt(row);try{await loadReceipt(true,true);}catch(e){error(e.message);}});$('saved-orders').append(button);}
  }
  async function lookup(silent=false) {
    const code=$('lookup-code').value.trim().toUpperCase();if(!/^SKCS[A-Z0-9]{6}$/.test(code)){if(!silent)error('Nội dung chuyển khoản cần có dạng SKCSABC123.');return;}
    const serial=++lookupRequest;const savedOrder=saved().find(x=>x.code===code);
    if(savedOrder&&!silent){beginReceipt(savedOrder);await loadReceipt(true,true);}
    const result=await api('/lookup',{code});if(serial!==lookupRequest||$('lookup-code').value.trim().toUpperCase()!==code)return;lookupCode=code;lastLookupPoll=Date.now();const order=result.order;
    $('lookup-result').hidden=false;$('lookup-result').replaceChildren(element('h3','',order.code),element('p','',order.title+' · '+money(order.price)),element('p','',states[order.state]||'Đang kiểm tra'),element('p','muted',order.progress+'% · '+order.successful_steps+'/'+order.steps+' lượt thành công'));
    if(!silent)error('');
  }
  async function action(path) {
    if(!active||busy)return;
    if(path==='/cancel'&&!confirm('Hủy đơn chưa gửi? Nếu đã trừ tiền, số tiền được hoàn về phiên mua của bạn.'))return;
    busy=true;receiptRequest++;try {const result=await api(path,{code:active.code,purchase_key:active.key});renderReceipt(result.order);lastPoll=Date.now();toast(path==='/cancel'?'Đã hủy đơn.':'Đã thanh toán bằng số tiền còn lại.');} catch(e){toast(e.message);} finally{busy=false;}
  }
  $('buy-tab').addEventListener('click',()=>{switchView('buy');catalog();});$('lookup-tab').addEventListener('click',()=>switchView('lookup'));
  $('buy-button').addEventListener('click',buy);$('lookup-button').addEventListener('click',()=>lookup().catch(e=>error(e.message)));$('lookup-code').addEventListener('keydown',event=>{if(event.key==='Enter')lookup().catch(e=>error(e.message));});
  $('copy-code').addEventListener('click',()=>active&&copy(active.code));$('copy-transfer').addEventListener('click',()=>active&&copy(active.code));$('copy-account').addEventListener('click',()=>receiptData&&copy(receiptData.bank.account));
  $('copy-link').addEventListener('click',()=>active&&copy(location.origin+'/chungsuclienquan/#order='+active.code+'&key='+active.key));$('refresh-order').addEventListener('click',async()=>{if(refreshBusy||busy)return;refreshBusy=true;$('refresh-order').disabled=true;try{await loadReceipt(false,false,true);toast(receiptData?.paid?'Đã nhận thanh toán.': 'Đang kiểm tra tiền. Trang sẽ tự cập nhật.');}catch(e){toast(e.message);}finally{refreshBusy=false;$('refresh-order').disabled=false;}});
  $('cancel-order').addEventListener('click',()=>action('/cancel'));$('pay-wallet').addEventListener('click',()=>action('/pay'));
  async function tick() {
    if(polling||busy||refreshBusy||bootstrapping||document.hidden)return;polling=true;
    try {
      if(!products.length&&!catalogBusy&&Date.now()-lastCatalogTry>=5000)await catalog();
      if(!active&&pending()&&Date.now()<recoveryUntil)await recoverPending(true);
      const terminal=receiptData&&['completed','cancelled','expired'].includes(receiptData.state);
      if(active&&Date.now()-lastPoll>=(terminal?10000:1500))await loadReceipt(!receiptData,false);
      if(view==='lookup'&&lookupCode&&Date.now()-lastLookupPoll>=2000)await lookup(true);
      if(products.length)$('online-text').textContent=accepting?'Đang nhận đơn':'Tạm ngừng nhận đơn';
    } catch(_){$('online-text').textContent='Đang kết nối lại…';} finally{polling=false;}
  }
  async function start() {
    setInterval(tick,500);renderSaved();
    const params=new URLSearchParams(location.hash.slice(1));const code=params.get('order'),key=params.get('key');
    let restore=Promise.resolve();
    if(/^SKCS[A-Z0-9]{6}$/.test(code||'')&&/^[a-f0-9]{64}$/.test(key||'')){
      beginReceipt({code,key});restore=loadReceipt(true,false).then(()=>{if(receiptData){active.title=receiptData.title;remember(active);}}).catch(e=>error(e.message));
    }else if(pending()){
      const attempt=pending();if(typeof attempt?.invite==='string')$('invite').value=attempt.invite;restore=recoverPending(false);
    }
    try{await Promise.all([catalog(),restore]);const attempt=pending();if(attempt&&products.some(p=>p.sku===attempt.sku))selectProduct(products.find(p=>p.sku===attempt.sku));}finally{bootstrapping=false;}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastPoll=0;lastLookupPoll=0;tick();}});
  window.addEventListener('pageshow',event=>{if(event.persisted){lastPoll=0;lastLookupPoll=0;tick();}});
  start().catch(()=>error('Chưa kết nối được. Vui lòng tải lại trang.'));
})();
