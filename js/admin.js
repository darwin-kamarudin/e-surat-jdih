// ==========================================
// PENGGUNA (khusus Admin)
// ==========================================
async function loadDaftarUser() {
    const box = $('list-pengguna');
    box.innerHTML = '<div class="empty">Memuat data pengguna...</div>';
    try {
        const data = await callApi('apiGetDaftarUser');
        state.users = data;
        box.innerHTML = data.map((u, idx) => `
            <div class="recent-row items-center">
                <span class="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0" style="background:var(--mod-soft);color:var(--ink)">${esc((u.nama || u.username).charAt(0).toUpperCase())}</span>
                <div class="min-w-0 flex-1">
                    <div class="font-semibold truncate" style="color:var(--ink)">${esc(u.nama || u.username)}</div>
                    <div class="text-xs text-slate-500 truncate">${esc(u.username)}</div>
                </div>
                ${u.role === 'Admin' ? '<span class="badge badge-warn">Admin</span>' : '<span class="badge badge-gray">Staff</span>'}
                <button onclick="openModalPassword(${idx})" class="btn btn-ghost btn-sm" aria-label="Ubah password ${esc(u.username)}"><i class="fas fa-key"></i><span class="hidden sm:inline"> Password</span></button>
            </div>`).join('') || '<div class="empty">Belum ada pengguna.</div>';
    } catch (err) {
        if (!err.handled) box.innerHTML = '<div class="empty" style="color:var(--danger)">Gagal memuat: ' + esc(err.message) + '</div>';
    }
}

function openModalTambahUser() { $('formTambahUser').reset(); $('modal-tambah-user').classList.remove('hidden'); }
function closeModalUser() { $('modal-tambah-user').classList.add('hidden'); }

async function submitTambahUser() {
    const data = { username: $('add-username').value, nama: $('add-nama').value, role: $('add-role').value, password: $('add-password').value };
    closeModalUser();
    toggleLoading(true, 'Menyimpan...');
    try {
        const res = await callApi('apiTambahUser', [data]);
        if (res.success) { toast(res.message); loadDaftarUser(); }
        else showAlert('Gagal: ' + res.message, 'error');
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

function openModalPassword(idx) {
    const username = state.users[idx].username;
    $('formUbahPassword').reset();
    $('pass-username').value = username;
    $('pass-username-display').textContent = username;
    $('modal-ubah-password').classList.remove('hidden');
}
function closeModalPassword() { $('modal-ubah-password').classList.add('hidden'); }

async function submitUbahPassword() {
    const username = $('pass-username').value;
    const newPass = $('pass-new').value;
    closeModalPassword();
    toggleLoading(true, 'Memperbarui password...');
    try {
        const res = await callApi('apiUbahPassword', [username, newPass]);
        if (res.success) toast(res.message); else showAlert('Gagal: ' + res.message, 'error');
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

// ==========================================
// PENGATURAN INSTANSI & KOP DOKUMEN
// ==========================================
const LAPORAN_DEFAULT = { namaInstansi: 'PEMERINTAH KABUPATEN PULAU TALIABU', namaUnit: '', alamat: '', kota: '', jabatan: '', namaPejabat: '', nip: '', logoUrl: '', logoData: '' };
const pengLogo = { data: '', url: '' }; // logo yang sedang diedit (data = hasil unggah, url = tautan lama)

async function getLaporanSettings() {
    if (state.laporan) return state.laporan;
    try { state.laporan = Object.assign({}, LAPORAN_DEFAULT, await callApi('apiGetPengaturanLaporan')); }
    catch (err) { if (err.handled) throw err; return Object.assign({}, LAPORAN_DEFAULT); }
    return state.laporan;
}

function renderLogoBox() {
    const src = safeImgSrc(pengLogo.data || pengLogo.url);
    $('logo-box').innerHTML = src ? `<img src="${src}" alt="Logo instansi">` : '<i class="far fa-image"></i>';
    $('btn-hapus-logo').disabled = !src;
}

function renderKopPreview() {
    const src = safeImgSrc(pengLogo.data || pengLogo.url);
    const induk = val('set-instansi'), kerja = val('set-unit'), alamat = val('set-alamat');
    if (!src && !induk && !kerja && !alamat) {
        $('kop-prev').innerHTML = '<div class="kop-prev-empty">Isi data instansi untuk melihat pratinjau kop.</div>';
        return;
    }
    $('kop-prev').innerHTML = `<div class="kop-prev-in">${src ? `<img class="kop-prev-logo" src="${src}" alt="">` : ''}<div>` +
        (induk ? `<div class="kp1">${esc(induk)}</div>` : '') +
        (kerja ? `<div class="kp2">${esc(kerja)}</div>` : '') +
        (alamat ? `<div class="kp3">${esc(alamat)}</div>` : '') +
        '</div></div><div class="kop-prev-rule"></div>';
}

// Kecilkan logo agar muat di satu sel Google Sheets (maks 50.000 karakter) dan tetap tajam saat dicetak.
async function logoToDataUrl(file) {
    const MAKS_KARAKTER = 45000;
    const img = await loadImage(file);
    const sisi = Math.max(img.naturalWidth, img.naturalHeight);
    if (!sisi) throw new Error('Gambar logo tidak dapat dibaca.');
    for (const maxDim of [360, 280, 220, 160, 120]) {
        const s = Math.min(1, maxDim / sisi);
        const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let url = c.toDataURL('image/png'); // tajam & mempertahankan transparansi
        if (url.length <= MAKS_KARAKTER) return url;
        const bg = document.createElement('canvas'); // lebih ringan: JPEG berlatar putih
        bg.width = w; bg.height = h;
        const bctx = bg.getContext('2d');
        bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, w, h);
        bctx.drawImage(img, 0, 0, w, h);
        for (const q of [0.9, 0.8, 0.7]) {
            url = bg.toDataURL('image/jpeg', q);
            if (url.length <= MAKS_KARAKTER) return url;
        }
    }
    throw new Error('Logo terlalu rumit untuk disimpan. Gunakan gambar yang lebih sederhana atau lebih kecil.');
}

async function pilihLogo(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!isImage(file)) { showAlert('File harus berupa gambar (JPG, PNG, atau WebP).', 'error'); return; }
    toggleLoading(true, 'Memproses logo...');
    try {
        pengLogo.data = await logoToDataUrl(file);
        pengLogo.url = '';
        renderLogoBox(); renderKopPreview();
    } catch (err) { showAlert(err.message || 'Logo gagal diproses.', 'error'); }
    finally { toggleLoading(false); }
}

function hapusLogo() {
    pengLogo.data = ''; pengLogo.url = '';
    renderLogoBox(); renderKopPreview();
}

async function loadPengaturan() {
    state.laporan = null; // selalu ambil data terbaru
    try {
        const s = await getLaporanSettings();
        $('set-instansi').value = s.namaInstansi; $('set-unit').value = s.namaUnit; $('set-alamat').value = s.alamat;
        $('set-kota').value = s.kota; $('set-jabatan').value = s.jabatan;
        $('set-pejabat').value = s.namaPejabat; $('set-nip').value = s.nip;
        pengLogo.data = s.logoData || ''; pengLogo.url = s.logoUrl || '';
        renderLogoBox(); renderKopPreview();
    } catch (err) { showError(err); }
}

async function submitPengaturan() {
    const data = {
        namaInstansi: val('set-instansi'), namaUnit: val('set-unit'), alamat: val('set-alamat'),
        logoData: pengLogo.data, logoUrl: pengLogo.url,
        kota: val('set-kota'), jabatan: val('set-jabatan'), namaPejabat: val('set-pejabat'), nip: val('set-nip')
    };
    toggleLoading(true, 'Menyimpan pengaturan...');
    try {
        const res = await callApi('apiSimpanPengaturanLaporan', [data]);
        if (res.success) {
            state.laporan = null; toast(res.message);
            const nama = data.namaUnit.trim(); // header publik langsung ikut berubah
            try { nama ? localStorage.setItem(IDENTITAS_KEY, nama) : localStorage.removeItem(IDENTITAS_KEY); } catch (e) { }
        } else showAlert(res.message, 'error');
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}
