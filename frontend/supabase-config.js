/*
  RAKET MANTAN v2 - SUPABASE CONFIG
  ------------------------------------------------------------
  Isi SUPABASE_URL dengan Project URL root (tanpa /rest/v1)
  dan SUPABASE_ANON_KEY dengan anon/public atau publishable key.

  Jangan pernah memasukkan service_role key ke browser.
*/

const SUPABASE_URL = "https://ajkybjbthpnkhdxkqhow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a63rbaGxYRewf-vRgu1y5A_Dr4UcVWB";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const db = {
  async getSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange(callback);
  },

  async register({ fullName, email, password, role }) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role || 'admin'
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  },

  async logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  },

  async getProfile(userId) {
    const { data, error } = await supabaseClient
      .from('users_profile')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  async getInventory() {
    const { data, error } = await supabaseClient
      .from('inventory')
      .select('*')
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createInventory(payload) {
    const { data, error } = await supabaseClient
      .from('inventory')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateInventory(id, payload) {
    const { data, error } = await supabaseClient
      .from('inventory')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteInventory(id) {
    const { error } = await supabaseClient
      .from('inventory')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  getInventoryPhotoUrl(path) {
    if (!path) return '';
    return supabaseClient.storage.from('inventory-photos').getPublicUrl(path).data.publicUrl;
  },

  async uploadInventoryPhoto(inventoryId, file) {
    const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    const extension = extensions[file.type];
    if (!extension) throw new Error('Foto harus berformat JPG, PNG, atau WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran foto maksimal 5 MB.');

    const path = `${inventoryId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error } = await supabaseClient.storage
      .from('inventory-photos')
      .upload(path, file, { contentType: file.type, cacheControl: '3600' });
    if (error) throw error;
    return path;
  },

  async deleteInventoryPhoto(path) {
    if (!path) return;
    const { error } = await supabaseClient.storage.from('inventory-photos').remove([path]);
    if (error) throw error;
  },

  async getSales() {
    const { data, error } = await supabaseClient
      .from('sales_transactions')
      .select('*, inventory(*)')
      .order('sale_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async processSale(payload) {
    /*
      RPC membuat proses penjualan atomik:
      inventory -> terjual
      + sales_transactions
      + consignment_payouts jika konsinyasi
    */
    const { data, error } = await supabaseClient.rpc('process_sale', {
      p_inventory_id: payload.inventory_id,
      p_sale_date: payload.sale_date,
      p_customer_name: payload.customer_name,
      p_final_price: payload.final_price,
      p_commission_fee: payload.commission_fee || 0,
      p_shipping_cost: payload.shipping_cost || 0,
      p_status: payload.status || 'completed'
    });
    if (error) throw error;
    return data;
  },

  async refundSale(saleId) {
    const { data, error } = await supabaseClient.rpc('refund_sale', {
      p_sale_id: saleId
    });
    if (error) throw error;
    return data;
  },

  async updateSale(payload) {
    const { data, error } = await supabaseClient.rpc('update_sale', {
      p_sale_id: payload.id,
      p_sale_date: payload.sale_date,
      p_customer_name: payload.customer_name,
      p_final_price: payload.final_price,
      p_commission_fee: payload.commission_fee || 0,
      p_shipping_cost: payload.shipping_cost || 0
    });
    if (error) throw error;
    return data;
  },

  async deleteRefundedSale(saleId) {
    const { data, error } = await supabaseClient
      .from('sales_transactions')
      .delete()
      .eq('id', saleId)
      .eq('status', 'refunded')
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getPayouts() {
    const { data, error } = await supabaseClient
      .from('consignment_payouts')
      .select('*, inventory(*)')
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async markPayoutPaid(id) {
    const { data, error } = await supabaseClient
      .from('consignment_payouts')
      .update({
        status: 'paid',
        payout_date: new Date().toISOString().slice(0, 10)
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

window.RaketMantanDB = db;
