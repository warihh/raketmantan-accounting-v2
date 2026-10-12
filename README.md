# Raket Mantan Accounting v2

Fitur:
- Supabase Auth: login/register/logout
- users_profile: nama + role
- Inventory CRUD
- Biaya ongkir masuk pada persediaan dan ongkir penjualan opsional; keduanya mengurangi laba
- Sales transactions
- Edit transaksi: tanggal, pembeli, harga, dan komisi; laba serta payout pending dihitung ulang
- Hapus permanen hanya untuk transaksi Refunded; Completed harus di-refund terlebih dahulu
- Kalkulasi laba milik sendiri
- Kalkulasi komisi Consignment
- Auto inventory -> terjual
- Auto generate consignment payout pending
- Payout pending -> paid
- Refund transaction -> inventory kembali tersedia
- Dashboard: laba bulan ini, hutang Consignment, terjual, tersedia
- RLS authenticated
- Responsive sporty padel UI

## File
index.html
style.css
app.js
supabase-config.js
schema.sql

## Setup Supabase
1. Buat project Supabase.
2. Jalankan schema.sql di SQL Editor.
	Untuk project yang sudah ada, jalankan ulang schema.sql terbaru agar kolom ongkir serta RPC kalkulasi/edit penjualan tersedia.
	Script ini juga menyiapkan kolom foto, bucket publik inventory-photos, dan policy upload khusus user terautentikasi.
3. Di Supabase Authentication, sesuaikan Email provider dan Email Confirmation sesuai kebutuhan tugas.
4. Isi SUPABASE_URL dengan Project URL root (tanpa /rest/v1) dan SUPABASE_ANON_KEY dengan anon/public atau publishable key pada supabase-config.js.
5. Jalankan index.html via Live Server.

## Catatan
- Gunakan anon/public key saja di browser.
- Jangan masukkan service_role key.
- Foto persediaan opsional, maksimal 5 MB, format JPG/PNG/WebP. File disimpan di bucket publik agar thumbnail dapat tampil pada halaman persediaan dan transaksi.
- Untuk produksi, sebaiknya role owner tidak bisa dipilih bebas saat register publik. Versi tugas ini menyediakan pilihan role agar alur demo dapat diuji.
- process_sale adalah RPC PostgreSQL agar perubahan sale, stok, dan payout berjalan dalam satu transaksi database.
