const state = {
  session: null,
  profile: null,
  page: 'dashboard',
  inventory: [],
  sales: [],
  payouts: [],
  filter: { search: '', owner: 'all', status: 'all' }
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const money = n => new Intl.NumberFormat('id-ID', {
  style:'currency', currency:'IDR', maximumFractionDigits:0
}).format(Number(n || 0));

const dateTimeID = value => value
  ? new Intl.DateTimeFormat('id-ID', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
  : '-';

const dateID = value => value
  ? new Intl.DateTimeFormat('id-ID', {day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value}T00:00:00`))
  : '-';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c]));

function ownerLabel(v){ return v === 'konsinyasi' ? 'Consignment' : 'Milik Sendiri'; }
function conditionLabel(v){
  if(v==='Baru'||v==='Brand New') return 'Brand New';
  if(v==='Bekas/Like New'||v==='Second') return 'Second';
  return v||'-';
}

function inventoryPhotoMarkup(inventory){
  if(!inventory?.photo_path) return '<div class="inventory-photo-placeholder" aria-label="Foto belum tersedia"><i class="fa-regular fa-image"></i></div>';
  const url=RaketMantanDB.getInventoryPhotoUrl(inventory.photo_path);
  return `<img class="inventory-photo" src="${esc(url)}" alt="Foto ${esc(inventory.sku||'raket')}" loading="lazy">`;
}

function toast(message, type='success'){
  const displayMessage=String(message??'').replace(/konsinyasi/gi,'Consignment');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${type==='error'?'fa-circle-exclamation':'fa-circle-check'}"></i><span>${esc(displayMessage)}</span>`;
  $('#toast-container').appendChild(el);
  setTimeout(()=>el.remove(),3500);
}

function setAuthMessage(message='', type=''){
  $('#auth-message').textContent = message;
  $('#auth-message').className = `auth-message ${type}`;
}

function switchAuthTab(mode){
  const login = mode === 'login';
  $('#tab-login').classList.toggle('active', login);
  $('#tab-register').classList.toggle('active', !login);
  $('#login-form').classList.toggle('hidden', !login);
  $('#register-form').classList.toggle('hidden', login);
  setAuthMessage('');
}

function setUserUI(){
  const name = state.profile?.full_name || state.session?.user?.email || 'User';
  const role = state.profile?.role || 'admin';
  const initials = name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();

  $('#sidebar-user-name').textContent = name;
  $('#header-user-name').textContent = name;
  $('#sidebar-user-role').textContent = role;
  $('#header-user-role').textContent = role;
  $('#user-avatar').textContent = initials;
  $('#header-avatar').textContent = initials;
}

function navigate(page){
  state.page = page;
  $$('.page-section').forEach(s=>s.classList.add('hidden'));
  $(`#page-${page}`).classList.remove('hidden');
  $$('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  const meta = {
    dashboard:['Overview','Dashboard'],
    inventory:['Master Data','Persediaan Raket'],
    sales:['Revenue Cycle','Penjualan & Pembayaran'],
    payouts:['Liability','Consignment']
  };
  $('#page-eyebrow').textContent = meta[page][0];
  $('#page-title').textContent = meta[page][1];
  document.body.classList.remove('sidebar-open');
}

function openModal(id){ $('#'+id).classList.remove('hidden'); }
function closeModal(id){ $('#'+id).classList.add('hidden'); }

async function loadAll(){
  try{
    [state.inventory,state.sales,state.payouts] = await Promise.all([
      RaketMantanDB.getInventory(),
      RaketMantanDB.getSales(),
      RaketMantanDB.getPayouts()
    ]);
    renderAll();
  }catch(e){
    console.error(e);
    toast(e.message || 'Gagal memuat data.', 'error');
  }
}

function renderAll(){
  renderDashboard();
  renderInventory();
  renderSales();
  renderPayouts();
  populateSaleInventory();
  updateSalePreview();
}

function renderDashboard(){
  const now = new Date();
  const month = now.getMonth(), year = now.getFullYear();
  const monthProfit = state.sales
    .filter(s=>s.status==='completed' && new Date(s.sale_date).getMonth()===month && new Date(s.sale_date).getFullYear()===year)
    .reduce((a,s)=>a+Number(s.profit_margin||0),0);
  const pending = state.payouts.filter(p=>p.status==='pending');
  const pendingTotal = pending.reduce((a,p)=>a+Number(p.amount_due||0),0);
  const sold = state.inventory.filter(i=>i.status==='terjual').length;
  const available = state.inventory.filter(i=>i.status==='tersedia').length;

  $('#stat-month-profit').textContent = money(monthProfit);
  $('#stat-payout-due').textContent = money(pendingTotal);
  $('#stat-sold').textContent = sold;
  $('#stat-available').textContent = available;
  $('#payout-nav-badge').textContent = pending.length;

  const recent = state.sales.slice(0,6);
  $('#dashboard-sales-body').innerHTML = recent.length ? recent.map(s=>{
    const i=s.inventory||{};
    return `<tr>
      <td>${dateTimeID(s.sale_date)}</td><td>${inventoryPhotoMarkup(i)}</td><td><b>${esc(i.sku||'-')}</b></td>
      <td>${esc(s.customer_name)}</td><td>${money(s.final_price)}</td>
      <td><b class="green-text">${money(s.profit_margin)}</b></td>
      <td><span class="badge ${s.status==='completed'?'badge-completed':'badge-refunded'}">${s.status}</span></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" class="empty">Belum ada transaksi.</td></tr>`;

  $('#dashboard-payout-list').innerHTML = pending.slice(0,5).map(p=>{
    const i=p.inventory||{};
    return `<div class="payout-row"><div><strong>${esc(i.sku||'-')}</strong><span>${esc(i.consignor_name||'-')}</span></div><div class="payout-amount">${money(p.amount_due)}</div></div>`;
  }).join('') || `<div class="empty">Tidak ada payout Consignment.</div>`;
}

function filteredInventory(){
  const q=state.filter.search.toLowerCase();
  return state.inventory.filter(i=>{
    const search=!q || [i.sku,i.brand,i.type,i.consignor_name].some(v=>String(v||'').toLowerCase().includes(q));
    const owner=state.filter.owner==='all'||i.ownership_status===state.filter.owner;
    const status=state.filter.status==='all'||i.status===state.filter.status;
    return search&&owner&&status;
  });
}

function renderInventory(){
  const rows=filteredInventory();
  $('#inventory-body').innerHTML=rows.length ? rows.map(i=>`
    <tr>
      <td><b>${esc(i.sku)}</b></td><td>${dateID(i.received_date)}</td><td>${inventoryPhotoMarkup(i)}</td>
      <td><b>${esc(i.brand)}</b></td><td>${esc(i.type||'-')} / ${esc(i.shape)}</td>
      <td>${esc(conditionLabel(i.condition))}</td>
      <td><span class="badge ${i.ownership_status==='konsinyasi'?'badge-consignment':'badge-own'}">${ownerLabel(i.ownership_status)}</span></td>
      <td>${esc(i.consignor_name||'-')}</td><td>${money(i.cost_price)}</td><td>${money(i.shipping_cost)}</td><td>${money(i.selling_price)}</td>
      <td><span class="badge ${i.status==='tersedia'?'badge-available':'badge-sold'}">${i.status}</span></td>
      <td><button class="action-btn" data-edit-inv="${i.id}"><i class="fa-solid fa-pen"></i></button> <button class="action-btn" data-delete-inv="${i.id}"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`).join('') : `<tr><td colspan="13" class="empty">Data persediaan tidak ditemukan.</td></tr>`;

  $$('[data-edit-inv]').forEach(b=>b.onclick=()=>openInventoryEdit(b.dataset.editInv));
  $$('[data-delete-inv]').forEach(b=>b.onclick=()=>deleteInventory(b.dataset.deleteInv));
}

function renderSales(){
  const completed=state.sales.filter(s=>s.status==='completed');
  $('#sales-total-count').textContent=state.sales.length;
  $('#sales-total-revenue').textContent=money(completed.reduce((a,s)=>a+Number(s.final_price||0),0));
  $('#sales-total-profit').textContent=money(completed.reduce((a,s)=>a+Number(s.profit_margin||0),0));

  $('#sales-body').innerHTML=state.sales.length ? state.sales.map(s=>{
    const i=s.inventory||{};
    return `<tr>
      <td>${dateTimeID(s.sale_date)}</td><td>${inventoryPhotoMarkup(i)}</td><td><b>${esc(i.sku||'-')}</b></td>
      <td><b>${esc(i.brand||'-')}</b></td><td>${esc(i.type||'-')} / ${esc(i.shape||'-')}</td><td>${esc(s.customer_name)}</td>
      <td>${money(s.final_price)}</td><td>${money(s.commission_fee)}</td><td>${money(s.shipping_cost)}</td><td><b class="green-text">${money(s.profit_margin)}</b></td>
      <td><span class="badge ${s.status==='completed'?'badge-completed':'badge-refunded'}">${s.status}</span></td>
      <td>
        <button class="action-btn" data-edit-sale="${s.id}" title="Edit transaksi"><i class="fa-solid fa-pen"></i></button>
        ${s.status==='completed'?`<button class="action-btn refund" data-refund="${s.id}" title="Refund"><i class="fa-solid fa-rotate-left"></i></button>`:''}
        ${s.status==='refunded'?`<button class="action-btn refund" data-delete-sale="${s.id}" title="Hapus transaksi Refunded"><i class="fa-solid fa-trash"></i></button>`:''}
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="12" class="empty">Belum ada penjualan.</td></tr>`;

  $$('[data-edit-sale]').forEach(b=>b.onclick=()=>openSaleEdit(b.dataset.editSale));
  $$('[data-refund]').forEach(b=>b.onclick=()=>refundSale(b.dataset.refund));
  $$('[data-delete-sale]').forEach(b=>b.onclick=()=>deleteRefundedSale(b.dataset.deleteSale));
}

function renderPayouts(){
  const pending=state.payouts.filter(p=>p.status==='pending');
  const paid=state.payouts.filter(p=>p.status==='paid');
  $('#payout-pending-count').textContent=pending.length;
  $('#payout-pending-total').textContent=money(pending.reduce((a,p)=>a+Number(p.amount_due||0),0));
  $('#payout-paid-total').textContent=money(paid.reduce((a,p)=>a+Number(p.amount_due||0),0));

  $('#payout-body').innerHTML=state.payouts.length ? state.payouts.map(p=>{
    const i=p.inventory||{};
    return `<tr>
      <td><b>${esc(i.sku||'-')}</b></td><td>${inventoryPhotoMarkup(i)}</td><td>${esc(i.consignor_name||'-')}</td>
      <td>${money(i.selling_price)}</td><td><b>${money(p.amount_due)}</b></td>
      <td><span class="badge ${p.status==='pending'?'badge-pending':'badge-paid'}">${p.status}</span></td>
      <td>${p.payout_date?dateID(p.payout_date):'-'}</td>
      <td>${p.status==='pending'?`<button class="action-btn pay" data-pay="${p.id}" title="Tandai dibayar"><i class="fa-solid fa-check"></i></button>`:'✓'}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">Belum ada payout Consignment.</td></tr>`;

  $$('[data-pay]').forEach(b=>b.onclick=()=>markPayoutPaid(b.dataset.pay));
}

function populateSaleInventory(){
  const available=state.inventory.filter(i=>i.status==='tersedia');
  $('#sale-inventory').innerHTML=`<option value="">Pilih raket...</option>`+
    available.map(i=>`<option value="${i.id}">${esc(i.sku)} - ${esc(i.brand)} · ${esc(i.type||'-')} / ${esc(i.shape)} (${ownerLabel(i.ownership_status)})</option>`).join('');
}

function updateSalePreview(){
  const id=$('#sale-inventory').value;
  const i=state.inventory.find(x=>x.id===id);
  if(!i){
    $('#sale-preview').classList.add('hidden');
    $('#commission-field').classList.remove('hidden');
    $('#sale-profit-preview').textContent=money(0);
    return;
  }
  $('#sale-preview').classList.remove('hidden');
  $('#sale-preview').innerHTML=`${inventoryPhotoMarkup(i)}<div><b>${esc(i.brand)}</b><br>Type / Shape: ${esc(i.type||'-')} / ${esc(i.shape)}<br>${ownerLabel(i.ownership_status)} · Modal ${money(i.cost_price)} · Harga ${money(i.selling_price)}${i.consignor_name?` · Penitip: ${esc(i.consignor_name)}`:''}</div>`;
  $('#sale-price').value=i.selling_price;
  $('#sale-shipping-cost').value='';
  $('#commission-field').classList.toggle('hidden',i.ownership_status!=='konsinyasi');
  calculateSaleProfit();
}

function calculateSaleProfit(){
  const i=state.inventory.find(x=>x.id===$('#sale-inventory').value);
  if(!i){$('#sale-profit-preview').textContent=money(0);return}
  const price=Number($('#sale-price').value||0);
  const commission=Number($('#sale-commission').value||0);
  const shippingCost=Number($('#sale-shipping-cost').value||0);
  const totalShipping=Number(i.shipping_cost||0)+shippingCost;
  const profit=i.ownership_status==='konsinyasi'?commission-totalShipping:price-Number(i.cost_price||0)-totalShipping;
  $('#sale-profit-preview').textContent=money(profit);
}

function openInventoryAdd(){
  $('#inventory-form').reset(); $('#inventory-id').value='';
  const localToday=new Date();
  localToday.setMinutes(localToday.getMinutes()-localToday.getTimezoneOffset());
  $('#inv-received-date').value=localToday.toISOString().slice(0,10);
  $('#inventory-modal-title').textContent='Tambah Raket'; toggleConsignor(); updateInventoryPhotoPreview(); openModal('inventory-modal');
  const skuInput=$('#inv-sku');
  skuInput.focus(); skuInput.setSelectionRange(skuInput.value.length,skuInput.value.length);
}
function openInventoryEdit(id){
  const i=state.inventory.find(x=>x.id===id); if(!i)return;
  $('#inventory-id').value=i.id; $('#inv-sku').value=i.sku; $('#inv-brand').value=i.brand;
  $('#inv-received-date').value=i.received_date||i.created_at?.slice(0,10)||'';
  $('#inv-type').value=i.type||''; $('#inv-shape').value=i.shape; $('#inv-condition').value=i.condition; $('#inv-ownership').value=i.ownership_status;
  $('#inv-cost').value=i.cost_price; $('#inv-shipping-cost').value=i.shipping_cost||''; $('#inv-selling').value=i.selling_price; $('#inv-consignor').value=i.consignor_name||'';
  $('#inv-photo').value=''; $('#inventory-modal-title').textContent='Edit Raket'; toggleConsignor(); updateInventoryPhotoPreview(); openModal('inventory-modal');
}

function updateInventoryPhotoPreview(){
  const preview=$('#inv-photo-preview');
  const previousUrl=preview.dataset.objectUrl;
  if(previousUrl) URL.revokeObjectURL(previousUrl);
  delete preview.dataset.objectUrl;
  const file=$('#inv-photo').files[0];
  if(file){
    const url=URL.createObjectURL(file);
    preview.dataset.objectUrl=url;
    preview.innerHTML=`<img src="${url}" alt="Pratinjau foto raket">`;
    return;
  }
  const inventory=state.inventory.find(item=>item.id===$('#inventory-id').value);
  preview.innerHTML=inventory?.photo_path
    ? `${inventoryPhotoMarkup(inventory)}<span>Foto saat ini. Pilih file baru untuk menggantinya.</span>`
    : '<span>Belum ada foto. Foto dapat ditambahkan sekarang atau nanti saat edit.</span>';
}

function toggleConsignor(){
  const isConsignment=$('#inv-ownership').value==='konsinyasi';
  $('#consignor-field').style.opacity=isConsignment?'1':'.6';
  $('#inv-consignor').disabled=!isConsignment;
  $('#inv-consignor').required=isConsignment;
}

async function saveInventory(e){
  e.preventDefault();
  const id=$('#inventory-id').value;
  const ownership=$('#inv-ownership').value;
  const photoFile=$('#inv-photo').files[0];
  const payload={
    sku:$('#inv-sku').value.trim(), received_date:$('#inv-received-date').value, brand:$('#inv-brand').value.trim(), type:$('#inv-type').value.trim(), shape:$('#inv-shape').value,
    condition:$('#inv-condition').value, ownership_status:ownership,
    cost_price:Number($('#inv-cost').value||0), shipping_cost:Number($('#inv-shipping-cost').value||0), selling_price:Number($('#inv-selling').value||0),
    consignor_name:ownership==='konsinyasi'?$('#inv-consignor').value.trim():null
  };
  if(ownership==='konsinyasi'&&!payload.consignor_name){toast('Nama penitip wajib untuk barang Consignment.','error');return}
  if(photoFile&&!['image/jpeg','image/png','image/webp'].includes(photoFile.type)){toast('Foto harus berformat JPG, PNG, atau WebP.','error');return}
  if(photoFile&&photoFile.size>5*1024*1024){toast('Ukuran foto maksimal 5 MB.','error');return}
  const saveButton=$('#inventory-form').querySelector('.modal-actions .primary-btn');
  if(saveButton.disabled)return;
  const originalButtonText=saveButton.textContent;
  saveButton.disabled=true;
  saveButton.textContent='Menyimpan...';
  try{
    const existing=state.inventory.find(item=>item.id===id);
    const saved=id
      ? await RaketMantanDB.updateInventory(id,payload)
      : await RaketMantanDB.createInventory(payload);
    if(photoFile){
      const newPhotoPath=await RaketMantanDB.uploadInventoryPhoto(saved.id,photoFile);
      try{
        await RaketMantanDB.updateInventory(saved.id,{photo_path:newPhotoPath});
      }catch(error){
        await RaketMantanDB.deleteInventoryPhoto(newPhotoPath);
        throw error;
      }
      if(existing?.photo_path) await RaketMantanDB.deleteInventoryPhoto(existing.photo_path).catch(error=>console.warn(error));
    }
    closeModal('inventory-modal'); toast(id?'Persediaan diperbarui.':'Raket berhasil ditambahkan.'); await loadAll();
  }catch(e){
    const message=String(e.message||'');
    if(message.includes('received_date')&&message.includes('schema cache')){
      toast('Database belum diperbarui. Jalankan schema.sql terbaru di Supabase SQL Editor, lalu coba lagi.','error');
      return;
    }
    toast(message,'error');
  }finally{
    saveButton.disabled=false;
    saveButton.textContent=originalButtonText;
  }
}

async function deleteInventory(id){
  const i=state.inventory.find(x=>x.id===id);
  if(!i)return;
  if(i.status==='terjual'){toast('Raket terjual tidak dapat dihapus dari master.','error');return}
  if(!confirm(`Hapus ${i.sku}?`))return;
  try{await RaketMantanDB.deleteInventory(id);toast('Raket dihapus.');await loadAll()}catch(e){toast(e.message,'error')}
}

function openSale(){
  $('#sale-form').reset();
  $('#sale-date').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  populateSaleInventory(); updateSalePreview(); openModal('sale-modal');
}

async function saveSale(e){
  e.preventDefault();
  const i=state.inventory.find(x=>x.id===$('#sale-inventory').value);
  if(!i){toast('Pilih raket terlebih dahulu.','error');return}
  const price=Number($('#sale-price').value||0), commission=Number($('#sale-commission').value||0), shippingCost=Number($('#sale-shipping-cost').value||0);
  if(i.ownership_status==='konsinyasi'&&commission>price){toast('Komisi tidak boleh melebihi harga final.','error');return}
  try{
    await RaketMantanDB.processSale({
      inventory_id:i.id,
      sale_date:new Date($('#sale-date').value).toISOString(),
      customer_name:$('#sale-customer').value.trim(),
      final_price:price,
      shipping_cost:shippingCost,
      commission_fee:i.ownership_status==='konsinyasi'?commission:0,
      status:$('#sale-status').value
    });
    closeModal('sale-modal');
    toast(i.ownership_status==='konsinyasi'?'Penjualan tersimpan dan payout Consignment dibuat.':'Penjualan berhasil dicatat.');
    await loadAll();
  }catch(e){toast(e.message,'error')}
}

async function refundSale(id){
  if(!confirm('Refund transaksi ini? Stok akan kembali tersedia dan payout pending terkait akan dibatalkan.'))return;
  try{await RaketMantanDB.refundSale(id);toast('Transaksi di-refund.');await loadAll()}catch(e){toast(e.message,'error')}
}

function openSaleEdit(id){
  const sale=state.sales.find(item=>item.id===id); if(!sale)return;
  const inventory=sale.inventory||{};
  const saleDate=new Date(sale.sale_date);
  saleDate.setMinutes(saleDate.getMinutes()-saleDate.getTimezoneOffset());
  $('#sale-edit-id').value=sale.id;
  $('#sale-edit-customer').value=sale.customer_name||'';
  $('#sale-edit-date').value=saleDate.toISOString().slice(0,16);
  $('#sale-edit-price').value=sale.final_price;
  $('#sale-edit-commission').value=sale.commission_fee||0;
  $('#sale-edit-shipping-cost').value=sale.shipping_cost||'';
  $('#sale-edit-commission-field').classList.toggle('hidden',inventory.ownership_status!=='konsinyasi');
  $('#sale-edit-summary').textContent=`${inventory.sku||'-'} · ${inventory.brand||'-'} · ${sale.status}`;
  openModal('sale-edit-modal');
}

async function saveSaleEdit(e){
  e.preventDefault();
  const sale=state.sales.find(item=>item.id===$('#sale-edit-id').value);
  if(!sale)return;
  const inventory=sale.inventory||{};
  const price=Number($('#sale-edit-price').value||0);
  const commission=Number($('#sale-edit-commission').value||0);
  if(inventory.ownership_status==='konsinyasi'&&commission>price){toast('Komisi tidak boleh melebihi harga final.','error');return}
  const button=$('#sale-edit-submit');
  button.disabled=true;
  try{
    await RaketMantanDB.updateSale({
      id:sale.id,
      sale_date:new Date($('#sale-edit-date').value).toISOString(),
      customer_name:$('#sale-edit-customer').value.trim(),
      final_price:price,
      shipping_cost:Number($('#sale-edit-shipping-cost').value||0),
      commission_fee:inventory.ownership_status==='konsinyasi'?commission:0
    });
    closeModal('sale-edit-modal');
    toast('Transaksi diperbarui.');
    await loadAll();
  }catch(error){toast(error.message,'error')}
  finally{button.disabled=false}
}

async function deleteRefundedSale(id){
  const sale=state.sales.find(item=>item.id===id);
  if(!sale||sale.status!=='refunded'){toast('Hanya transaksi Refunded yang dapat dihapus.','error');return}
  if(!confirm(`Hapus permanen transaksi ${sale.customer_name}?`))return;
  try{
    await RaketMantanDB.deleteRefundedSale(id);
    toast('Transaksi Refunded dihapus.');
    await loadAll();
  }catch(error){toast(error.message,'error')}
}

async function markPayoutPaid(id){
  if(!confirm('Tandai hutang ini sebagai sudah dibayar?'))return;
  try{await RaketMantanDB.markPayoutPaid(id);toast('Payout ditandai paid.');await loadAll()}catch(e){toast(e.message,'error')}
}

async function handleLogin(e){
  e.preventDefault(); setAuthMessage('Memproses login...');
  try{
    await RaketMantanDB.login($('#login-email').value.trim(),$('#login-password').value);
    setAuthMessage('');
  }catch(err){setAuthMessage(err.message,'error')}
}

async function handleRegister(e){
  e.preventDefault(); setAuthMessage('Membuat akun...');
  try{
    const result=await RaketMantanDB.register({
      fullName:$('#register-name').value.trim(), email:$('#register-email').value.trim(),
      password:$('#register-password').value, role:$('#register-role').value
    });
    if(result.session){
      setAuthMessage('Akun berhasil dibuat.','success');
    }else{
      setAuthMessage('Akun dibuat. Jika email confirmation aktif, cek email untuk verifikasi lalu login.','success');
      switchAuthTab('login');
    }
  }catch(err){setAuthMessage(err.message,'error')}
}

async function showApp(session){
  state.session=session;
  try{
    state.profile=await RaketMantanDB.getProfile(session.user.id);
  }catch(e){
    // Trigger profile biasanya membuat row setelah signup.
    state.profile={full_name:session.user.user_metadata?.full_name||session.user.email,role:session.user.user_metadata?.role||'admin'};
  }
  $('#auth-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  setUserUI(); navigate('dashboard'); await loadAll();
}

function showAuth(){
  state.session=null;state.profile=null;
  $('#app-shell').classList.add('hidden');$('#auth-screen').classList.remove('hidden');
}

function bind(){
  $('#tab-login').onclick=()=>switchAuthTab('login');
  $('#tab-register').onclick=()=>switchAuthTab('register');
  $('#login-form').onsubmit=handleLogin;
  $('#register-form').onsubmit=handleRegister;
  $('#logout-btn').onclick=async()=>{try{await RaketMantanDB.logout()}catch(e){toast(e.message,'error')}};
  $$('.nav-item,[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  $('#mobile-menu-btn').onclick=()=>document.body.classList.toggle('sidebar-open');
  $('#mobile-overlay').onclick=()=>document.body.classList.remove('sidebar-open');

  $('#add-inventory-btn').onclick=openInventoryAdd;
  $('#inventory-form').onsubmit=saveInventory;
  $('#inv-ownership').onchange=toggleConsignor;
  $('#inv-photo').onchange=updateInventoryPhotoPreview;
  $('#add-sale-btn').onclick=openSale;
  $('#sale-form').onsubmit=saveSale;
  $('#sale-edit-form').onsubmit=saveSaleEdit;
  $('#sale-inventory').onchange=updateSalePreview;
  $('#sale-price').oninput=calculateSaleProfit;
  $('#sale-commission').oninput=calculateSaleProfit;
  $('#sale-shipping-cost').oninput=calculateSaleProfit;

  $('#inventory-search').oninput=e=>{state.filter.search=e.target.value;renderInventory()};
  $('#inventory-owner-filter').onchange=e=>{state.filter.owner=e.target.value;renderInventory()};
  $('#inventory-status-filter').onchange=e=>{state.filter.status=e.target.value;renderInventory()};

  $$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  $$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
}

async function init(){
  bind();
  const session=await RaketMantanDB.getSession();
  if(session) await showApp(session); else showAuth();
  RaketMantanDB.onAuthStateChange(async(event,session)=>{
    if(session) await showApp(session); else showAuth();
  });
}

document.addEventListener('DOMContentLoaded',init);
