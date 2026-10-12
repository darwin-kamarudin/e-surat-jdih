/* ==========================================
   E-SURAT & JDIH - FRONTEND (GitHub Pages)
   Memanggil backend Google Apps Script lewat fetch()
   ========================================== */

const $ = (id) => document.getElementById(id);

// Cache data tabel, supaya tombol Edit tidak perlu menyisipkan teks ke atribut onclick
const state = { masuk: {}, keluar: {}, peraturan: {}, users: [] };

// ---------- Helper keamanan ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? esc(u) : '';

// ---------- Pemanggil API ----------
async function callApi(action, params = [], timeoutMs = 30000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            // text/plain => "simple request", tidak memicu preflight CORS (GAS tidak mendukung OPTIONS)
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, params, token: sessionStorage.getItem('token') || '' }),
            signal: ctrl.signal
        });
        const json = await res.json();
        if (!json.ok) {
            const err = new Error(json.message || 'Terjadi kesalahan.');
            if (json.code === 'UNAUTHORIZED') { err.handled = true; forceLogout(json.message); }
            throw err;
        }
        return json.data;
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('Koneksi timeout, coba lagi.');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ---------- Upload file ke Google Drive ----------
const MAX_UPLOAD = 10 * 1024 * 1024; // samakan dengan DriveStore.MAX_BYTES di backend
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fmtSize(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }

function readFileBase64(file, onProgress) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('Gagal membaca file.'));
        r.readAsDataURL(file);
    });
}

// POST dengan progres pengiriman (XMLHttpRequest, tetap "simple request" text/plain)
function callApiWithProgress(action, params, onSend, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL);
        xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
        xhr.timeout = timeoutMs;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onSend(e.loaded / e.total, false); };
        xhr.upload.onload = () => onSend(1, true);
        xhr.onerror = () => reject(new Error('Gagal terhubung ke server. Periksa koneksi internet.'));
        xhr.ontimeout = () => reject(new Error('Koneksi timeout, coba lagi.'));
        xhr.onload = () => {
            let json;
            try { json = JSON.parse(xhr.responseText); }
            catch (e) { return reject(new Error('Respon server tidak valid.')); }
            if (!json.ok) {
                const err = new Error(json.message || 'Terjadi kesalahan.');
                if (json.code === 'UNAUTHORIZED') { err.handled = true; forceLogout(json.message); }
                return reject(err);
            }
            resolve(json.data);
        };
        xhr.send(JSON.stringify({ action, params, token: sessionStorage.getItem('token') || '' }));
    });
}

// ----- Komponen pilih file (tombol + seret & lepas) -----
function syncUploadField(input) {
    const box = input.closest('.upload-field');
    if (!box) return;
    const f = input.files[0];
    const drop = box.querySelector('.upload-drop');
    const chosen = box.querySelector('.upload-chosen');
    if (f) {
        box.querySelector('.upload-name').textContent = f.name;
        box.querySelector('.upload-size').textContent = fmtSize(f.size);
        drop.classList.add('hidden');
        chosen.classList.remove('hidden'); chosen.classList.add('flex');
    } else {
        drop.classList.remove('hidden');
        chosen.classList.add('hidden'); chosen.classList.remove('flex');
    }
}

function clearUploadField(id) { const i = $(id); i.value = ''; syncUploadField(i); }

function validatePickedFile(input) {
    const f = input.files[0];
    if (!f) return true;
    const allowed = (input.accept || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (allowed.length && !allowed.includes(ext)) {
        alert('Format file tidak didukung. Gunakan: ' + allowed.join(', '));
        return false;
    }
    if (f.size > MAX_UPLOAD) { alert('Ukuran file maksimal 10 MB.'); return false; }
    return true;
}

document.addEventListener('change', (e) => {
    if (e.target.type !== 'file') return;
    if (!validatePickedFile(e.target)) e.target.value = '';
    syncUploadField(e.target);
});
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.upload-remove');
    if (btn) { const input = btn.closest('.upload-field').querySelector('input[type=file]'); input.value = ''; syncUploadField(input); }
});
document.addEventListener('dragover', (e) => {
    const z = e.target.closest && e.target.closest('.upload-drop');
    if (z) { e.preventDefault(); z.classList.add('dragover'); }
});
document.addEventListener('dragleave', (e) => {
    const z = e.target.closest && e.target.closest('.upload-drop');
    if (z) z.classList.remove('dragover');
});
document.addEventListener('drop', (e) => {
    const z = e.target.closest && e.target.closest('.upload-drop');
    if (!z) return;
    e.preventDefault(); z.classList.remove('dragover');
    const input = z.closest('.upload-field').querySelector('input[type=file]');
    if (e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
});
document.addEventListener('reset', (e) => {
    setTimeout(() => e.target.querySelectorAll('input[type=file]').forEach(syncUploadField), 0);
});

// ----- Overlay progres upload -----
const upUI = { timer: null, pct: 0 };

function upSet(pct, stage, step) {
    upUI.pct = pct;
    $('upload-bar').style.width = pct + '%';
    $('upload-percent').textContent = Math.round(pct) + '%';
    if (stage) $('upload-stage').textContent = stage;
    document.querySelectorAll('.upload-step').forEach(el => {
        const n = parseInt(el.dataset.step, 10);
        el.classList.toggle('active', n === step);
        el.classList.toggle('complete', n < step);
    });
}

function upOpen(file) {
    $('upload-filename').textContent = file.name + ' (' + fmtSize(file.size) + ')';
    $('upload-title').textContent = 'Mengunggah dokumen...';
    $('upload-bar').classList.remove('done');
    $('upload-icon').className = 'mx-auto mb-3 w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center';
    $('upload-icon-i').className = 'fas fa-cloud-upload-alt text-3xl text-blue-600 upload-bounce';
    upSet(0, 'Membaca file...', 1);
    $('upload-overlay').classList.remove('hidden');
}

// Setelah file terkirim, server masih menyimpan ke Drive (durasi tidak diketahui) -> progres merambat pelan
function upCreep() {
    clearInterval(upUI.timer);
    upUI.timer = setInterval(() => upSet(upUI.pct + (96 - upUI.pct) * 0.08, 'Menyimpan ke Google Drive...', 3), 400);
}

function upDone() {
    clearInterval(upUI.timer);
    $('upload-bar').classList.add('done');
    upSet(100, 'Selesai!', 5);
    $('upload-title').textContent = 'Upload berhasil';
    $('upload-icon').className = 'mx-auto mb-3 w-16 h-16 rounded-full bg-green-50 flex items-center justify-center';
    $('upload-icon-i').className = 'fas fa-check-circle text-4xl text-green-600 upload-pop';
}

function upClose() { clearInterval(upUI.timer); $('upload-overlay').classList.add('hidden'); }

// Jika ada file dipilih: unggah ke folder Drive sesuai jenis, kembalikan URL-nya. Jika tidak: null.
async function uploadIfSelected(fileInputId, jenis) {
    const file = $(fileInputId).files[0];
    if (!file) return null;
    if (file.size > MAX_UPLOAD) throw new Error('Ukuran file maksimal 10 MB.');
    upOpen(file);
    try {
        const base64 = await readFileBase64(file, (p) => upSet(p * 15, 'Membaca file...', 1));
        upSet(15, 'Mengunggah ke server...', 2);
        const res = await callApiWithProgress('apiUploadFile', [{ jenis, namaFile: file.name, base64 }], (p, finished) => {
            if (finished) { upSet(75, 'Menyimpan ke Google Drive...', 3); upCreep(); }
            else upSet(15 + p * 60, 'Mengunggah ke server...', 2);
        });
        if (!res.success) throw new Error(res.message);
        upDone();
        await sleep(1000);
        upClose();
        return res.url;
    } catch (err) {
        upClose();
        throw err;
    }
}

// ---------- Dialog kustom (pengganti alert/confirm bawaan browser) ----------
const DLG_TYPES = {
    success: { title: 'Berhasil',   icon: 'fa-check-circle',        bar: 'bg-green-500',  ring: 'bg-green-100',  text: 'text-green-600',  btn: 'bg-green-600 hover:bg-green-700',   glow: 'rgba(34,197,94,.45)' },
    error:   { title: 'Terjadi Kesalahan', icon: 'fa-times-circle', bar: 'bg-red-500',    ring: 'bg-red-100',    text: 'text-red-600',    btn: 'bg-red-600 hover:bg-red-700',       glow: 'rgba(239,68,68,.45)' },
    warning: { title: 'Perhatian',  icon: 'fa-exclamation-triangle', bar: 'bg-yellow-500', ring: 'bg-yellow-100', text: 'text-yellow-600', btn: 'bg-yellow-500 hover:bg-yellow-600', glow: 'rgba(234,179,8,.45)' },
    info:    { title: 'Informasi',  icon: 'fa-info-circle',         bar: 'bg-blue-500',   ring: 'bg-blue-100',   text: 'text-blue-600',   btn: 'bg-blue-600 hover:bg-blue-700',     glow: 'rgba(59,130,246,.45)' },
    confirm: { title: 'Konfirmasi', icon: 'fa-question-circle',     bar: 'bg-blue-500',   ring: 'bg-blue-100',   text: 'text-blue-600',   btn: 'bg-blue-600 hover:bg-blue-700',     glow: 'rgba(59,130,246,.45)' },
    danger:  { title: 'Hapus Data?', icon: 'fa-trash-alt',          bar: 'bg-red-500',    ring: 'bg-red-100',    text: 'text-red-600',    btn: 'bg-red-600 hover:bg-red-700',       glow: 'rgba(239,68,68,.45)' }
};

const dlgState = { resolve: null, queue: [], open: false, keyHandler: null };

function dlgShow(opts) {
    return new Promise((resolve) => {
        dlgState.queue.push({ opts, resolve });
        if (!dlgState.open) dlgNext();
    });
}

function dlgNext() {
    const item = dlgState.queue.shift();
    if (!item) { dlgState.open = false; return; }
    dlgState.open = true;
    const { opts, resolve } = item;
    const t = DLG_TYPES[opts.type] || DLG_TYPES.info;

    $('dlg-bar').className = 'h-1.5 ' + t.bar;
    $('dlg-icon-wrap').className = 'dlg-icon-ring mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center ' + t.ring;
    $('dlg-icon-wrap').style.setProperty('--dlg-glow', t.glow);
    $('dlg-icon').className = 'fas text-3xl ' + t.icon + ' ' + t.text;
    $('dlg-title').textContent = opts.title || t.title;
    $('dlg-message').textContent = opts.message || '';

    const ok = $('dlg-ok'), cancel = $('dlg-cancel');
    ok.textContent = opts.okText || 'OK';
    ok.className = 'dlg-btn flex-1 px-4 py-2.5 rounded-lg text-white font-bold text-sm shadow-md ' + t.btn;
    if (opts.cancelText) {
        cancel.textContent = opts.cancelText;
        cancel.classList.remove('hidden');
    } else {
        cancel.classList.add('hidden');
    }

    const overlay = $('dlg-overlay');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('show'));
    ok.focus();

    const close = (result) => {
        overlay.classList.remove('show');
        ok.onclick = cancel.onclick = overlay.onclick = null;
        document.removeEventListener('keydown', dlgState.keyHandler);
        setTimeout(() => {
            overlay.classList.add('hidden');
            resolve(result);
            dlgNext();
        }, 180);
    };
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(!opts.cancelText); };
    dlgState.keyHandler = (e) => {
        if (e.key === 'Escape') close(!opts.cancelText);
        else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', dlgState.keyHandler);
}

// Tebak tipe dialog dari isi pesan (agar semua alert() lama otomatis tampil sesuai konteks)
function dlgGuessType(msg) {
    const m = String(msg || '').toLowerCase();
    if (/^(error|gagal|login gagal)|gagal|tidak valid|timeout/.test(m)) return 'error';
    if (/format file|ukuran file|wajib|pilih file|tidak didukung|tidak ikut|tidak ditemukan|sesi berakhir/.test(m)) return 'warning';
    if (/berhasil|sukses|dihapus|disimpan|diperbarui/.test(m)) return 'success';
    return 'info';
}

const showAlert = (message, type, title) => dlgShow({ message, type: type || dlgGuessType(message), title });
const showConfirm = (message, opts = {}) => dlgShow({
    message, type: opts.type || 'confirm', title: opts.title,
    okText: opts.okText || 'Ya, Lanjutkan', cancelText: opts.cancelText || 'Batal'
});

// Ganti alert() bawaan browser agar seluruh pemanggilan alert(...) memakai dialog kustom
window.alert = (message) => { showAlert(message); };

function showError(err) {
    if (err && err.handled) return; // sudah ditangani (mis. sesi berakhir)
    alert('Error: ' + (err && err.message ? err.message : err));
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) {
        showMainApp();
        loadDashboardStats();
    } else {
        showPublicPortal();
    }
});

const isLoggedIn = () => !!sessionStorage.getItem('token');

// ==========================================
// MANAJEMEN LAYAR
// ==========================================

function toggleSidebar() {
    const sidebar = $('admin-sidebar');
    if (!isLoggedIn()) return;
    if (sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        sidebar.classList.add('flex');
    } else {
        sidebar.classList.add('hidden');
        sidebar.classList.remove('flex');
    }
}

function showPublicPortal() {
    $('public-portal').classList.remove('hidden');
    $('login-screen').classList.add('hidden');
    $('admin-sidebar').classList.add('hidden');
    $('admin-sidebar').classList.remove('flex');
    $('admin-main').classList.add('hidden');
    loadPeraturanPublik();
}

function showLoginScreen() {
    $('public-portal').classList.add('hidden');
    $('login-screen').classList.remove('hidden');
    $('admin-sidebar').classList.add('hidden');
    $('admin-sidebar').classList.remove('flex');
    $('admin-main').classList.add('hidden');
}

function showMainApp() {
    $('public-portal').classList.add('hidden');
    $('login-screen').classList.add('hidden');
    $('admin-sidebar').classList.remove('hidden');
    $('admin-sidebar').classList.add('flex');
    $('admin-main').classList.remove('hidden');

    if (sessionStorage.getItem('role') === 'Admin') $('menu-admin').classList.remove('hidden');
    else $('menu-admin').classList.add('hidden');
}

async function prosesLogin() {
    const user = $('login-user').value;
    const pass = $('login-pass').value;
    toggleLoading(true, 'Memverifikasi...');
    try {
        const res = await callApi('apiLogin', [user, pass]);
        if (res.success) {
            sessionStorage.setItem('token', res.token);
            sessionStorage.setItem('role', res.role);
            sessionStorage.setItem('nama', res.nama || '');
            $('login-pass').value = '';
            showMainApp();
            nav('dashboard');
        } else {
            alert('Login gagal: ' + res.message);
        }
    } catch (err) {
        alert('Login gagal: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

function clearSession() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('nama');
}

function logout() {
    callApi('apiLogout').catch(() => {}); // cabut token di server (tidak perlu ditunggu)
    clearSession();
    showPublicPortal();
}

function forceLogout(message) {
    clearSession();
    toggleLoading(false);
    showPublicPortal();
    alert(message || 'Sesi berakhir, silakan login ulang.');
}

// ==========================================
// NAVIGASI ADMIN (SPA)
// ==========================================

function nav(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => { el.classList.add('hidden'); el.classList.remove('block'); });
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('bg-blue-800'));

    $('tab-' + tabId).classList.remove('hidden');
    $('tab-' + tabId).classList.add('block');
    $('nav-' + tabId).classList.add('bg-blue-800');

    if (tabId === 'dashboard') loadDashboardStats();
    if (tabId === 'daftarMasuk') loadDaftarMasuk();
    if (tabId === 'daftarKeluar') loadDaftarKeluar();
    if (tabId === 'daftarPeraturan') loadDaftarPeraturanAdmin();
    if (tabId === 'pengguna' && sessionStorage.getItem('role') === 'Admin') loadDaftarUser();
}

function toggleLoading(show, text = 'Memproses...') {
    $('loading-text').innerText = text;
    $('loading-overlay').classList.toggle('hidden', !show);
}

function showMessage(elementId, text, isSuccess) {
    const el = $(elementId);
    el.innerText = text;
    el.className = `mt-4 p-3 rounded-md text-sm font-semibold text-center ${isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    setTimeout(() => { el.innerText = ''; el.className = ''; }, 5000);
}

const infoRow = (cols, text) =>
    `<tr><td colspan="${cols}" class="text-center py-6 text-gray-500">${text}</td></tr>`;

// ==========================================
// JDIH / PERATURAN
// ==========================================

async function loadPeraturanPublik() {
    const tbody = $('tbody-publik-peraturan');
    tbody.innerHTML = infoRow(4, '<div class="loader inline-block border-2 w-4 h-4 mr-2 border-blue-500"></div> Memuat dokumen...');
    try {
        const data = await callApi('apiGetDaftarPeraturan');
        if (!data.length) { tbody.innerHTML = infoRow(4, 'Belum ada dokumen publik.'); return; }
        tbody.innerHTML = data.map((row) => {
            const url = safeUrl(row.linkPdf);
            const linkHTML = url
                ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-full text-xs font-bold transition-colors inline-block"><i class="fas fa-file-pdf mr-1"></i> Lihat</a>`
                : '-';
            return `
                <tr class="border-b hover:bg-blue-50 text-sm public-row">
                    <td class="py-4 px-4 whitespace-nowrap"><span class="bg-gray-100 text-gray-600 px-2 py-1 rounded border">${esc(row.kategori)}</span></td>
                    <td class="py-4 px-4 font-bold text-gray-800 whitespace-nowrap">${esc(row.nomor)} / ${esc(row.tahun)}</td>
                    <td class="py-4 px-4 text-gray-700 font-medium">${esc(row.tentang)}</td>
                    <td class="py-4 px-4 text-center">${linkHTML}</td>
                </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = infoRow(4, 'Gagal memuat dokumen: ' + esc(err.message));
    }
}

function filterPublik() {
    const input = $('search-publik').value.toLowerCase();
    document.querySelectorAll('.public-row').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(input) ? '' : 'none';
    });
}

async function submitPeraturan() {
    const data = {
        kategori: $('prt-kategori').value,
        nomor: $('prt-no').value,
        tahun: $('prt-tahun').value,
        tentang: $('prt-tentang').value,
        linkPdf: $('prt-link').value
    };
    try {
        const fileUrl = await uploadIfSelected('prt-file', 'Peraturan');
        if (fileUrl) data.linkPdf = fileUrl;
        if (!data.linkPdf) { alert('Pilih file PDF atau isi link dokumen.'); toggleLoading(false); return; }
        toggleLoading(true, 'Memublikasikan...');
        const res = await callApi('apiSimpanPeraturan', [data]);
        if (res.success) { showMessage('msg-peraturan', res.message, true); $('formPeraturan').reset(); }
        else showMessage('msg-peraturan', res.message, false);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

async function loadDaftarPeraturanAdmin() {
    const tbody = $('tbody-peraturan');
    tbody.innerHTML = infoRow(5, 'Memuat data...');
    try {
        const data = await callApi('apiGetDaftarPeraturan');
        state.peraturan = {};
        if (!data.length) { tbody.innerHTML = infoRow(5, 'Kosong.'); return; }
        tbody.innerHTML = data.map((row) => {
            state.peraturan[row.rowId] = row;
            const url = safeUrl(row.linkPdf);
            const linkHTML = url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-red-500 hover:text-red-700 text-lg"><i class="fas fa-file-pdf"></i></a>` : '-';
            const btnEdit = `<button onclick="openEditPeraturanModal(${row.rowId})" class="text-purple-600 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded" title="Edit"><i class="fas fa-edit"></i></button>`;
            const btnHapus = `<button onclick="hapusData('Peraturan', ${row.rowId})" class="text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded ml-1" title="Hapus"><i class="fas fa-trash"></i></button>`;
            return `
                <tr class="border-b text-sm hover:bg-gray-50">
                    <td class="py-2 px-4">${esc(row.kategori)}</td>
                    <td class="py-2 px-4 font-bold">${esc(row.nomor)}/${esc(row.tahun)}</td>
                    <td class="py-2 px-4">${esc(row.tentang)}</td>
                    <td class="py-2 px-4 text-center">${linkHTML}</td>
                    <td class="py-2 px-4 text-center"><div class="flex justify-center">${btnEdit}${btnHapus}</div></td>
                </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = infoRow(5, 'Gagal memuat: ' + esc(err.message));
    }
}

function openEditPeraturanModal(rowId) {
    const row = state.peraturan[rowId];
    if (!row) return;
    $('edit-prt-rowId').value = rowId;
    $('edit-prt-kategori').value = row.kategori;
    $('edit-prt-no').value = row.nomor;
    $('edit-prt-tahun').value = row.tahun;
    $('edit-prt-tentang').value = row.tentang;
    $('edit-prt-link').value = row.linkPdf || '';
    clearUploadField('edit-prt-file');
    $('edit-peraturan-modal').classList.remove('hidden');
}

function closeEditPeraturanModal() { $('edit-peraturan-modal').classList.add('hidden'); }

async function submitEditPeraturanData() {
    const data = {
        rowId: $('edit-prt-rowId').value,
        kategori: $('edit-prt-kategori').value,
        nomor: $('edit-prt-no').value,
        tahun: $('edit-prt-tahun').value,
        tentang: $('edit-prt-tentang').value,
        linkPdf: $('edit-prt-link').value
    };
    try {
        const fileUrl = await uploadIfSelected('edit-prt-file', 'Peraturan');
        if (fileUrl) data.linkPdf = fileUrl;
        if (!data.linkPdf) { alert('Link/file dokumen PDF wajib ada.'); toggleLoading(false); return; }
        closeEditPeraturanModal();
        toggleLoading(true, 'Menyimpan perubahan peraturan...');
        const res = await callApi('apiUpdatePeraturan', [data]);
        if (res.success) loadDaftarPeraturanAdmin();
        else alert('Gagal: ' + res.message);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

// ==========================================
// SURAT MASUK & KELUAR
// ==========================================

async function loadDashboardStats() {
    try {
        const stats = await callApi('apiGetDashboardStatistik');
        $('stat-masuk').innerText = stats.jmlMasuk;
        $('stat-keluar').innerText = stats.jmlKeluar;
    } catch (err) { /* sesi berakhir ditangani callApi; error lain diabaikan di dashboard */ }
}

const linkIcon = (u) => {
    const url = safeUrl(u);
    return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500"><i class="fas fa-external-link-alt"></i></a>` : '-';
};

const aksiButtons = (jenis, rowId, editColor = 'yellow') => `
    <div class="flex justify-center">
        <button onclick="openEditModal('${jenis}', ${rowId})" class="text-${editColor}-600 bg-${editColor}-50 hover:bg-${editColor}-100 px-2 py-1 rounded" title="Edit"><i class="fas fa-edit"></i></button>
        <button onclick="hapusData('${jenis}', ${rowId})" class="text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded ml-1" title="Hapus"><i class="fas fa-trash"></i></button>
    </div>`;

async function loadDaftarMasuk() {
    const tbody = $('tbody-masuk');
    tbody.innerHTML = infoRow(7, 'Memuat data...');
    try {
        const data = await callApi('apiGetDaftarSuratMasuk');
        state.masuk = {};
        if (!data.length) { tbody.innerHTML = infoRow(7, 'Belum ada data surat masuk.'); return; }
        tbody.innerHTML = data.map((row) => {
            state.masuk[row.rowId] = row;
            return `<tr class="border-b text-sm"><td>${esc(row.idSurat)}</td><td>${esc(row.tglTerima)}</td><td class="font-bold">${esc(row.noSurat)}</td><td>${esc(row.asalSurat)}<br><span class="text-xs text-gray-500">${esc(row.perihal)}</span></td><td>${esc(row.disposisi)}</td><td class="text-center">${linkIcon(row.linkDoc)}</td><td class="text-center">${aksiButtons('Masuk', row.rowId)}</td></tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = infoRow(7, 'Gagal memuat: ' + esc(err.message));
    }
}

async function loadDaftarKeluar() {
    const tbody = $('tbody-keluar');
    tbody.innerHTML = infoRow(7, 'Memuat data...');
    try {
        const data = await callApi('apiGetDaftarSuratKeluar');
        state.keluar = {};
        if (!data.length) { tbody.innerHTML = infoRow(7, 'Belum ada data surat keluar.'); return; }
        tbody.innerHTML = data.map((row) => {
            state.keluar[row.rowId] = row;
            return `<tr class="border-b text-sm"><td>${esc(row.tglSurat)}</td><td class="font-bold">${esc(row.noSuratKeluar)}</td><td>${esc(row.tujuan)}</td><td>${esc(row.perihal)}</td><td>${esc(row.penandatangan)}</td><td class="text-center">${linkIcon(row.linkDoc)}</td><td class="text-center">${aksiButtons('Keluar', row.rowId)}</td></tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = infoRow(7, 'Gagal memuat: ' + esc(err.message));
    }
}

async function submitSuratMasuk() {
    const data = {
        asalSurat: $('sm-asal').value, noSurat: $('sm-no').value,
        perihal: $('sm-perihal').value, disposisi: $('sm-disposisi').value, linkDoc: $('sm-link').value
    };
    try {
        const fileUrl = await uploadIfSelected('sm-file', 'Masuk');
        if (fileUrl) data.linkDoc = fileUrl;
        toggleLoading(true, 'Menyimpan Surat...');
        const res = await callApi('apiSimpanSuratMasuk', [data]);
        if (res.success) { showMessage('msg-masuk', 'Sukses', true); $('formMasuk').reset(); }
        else showMessage('msg-masuk', res.message, false);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

async function submitSuratKeluar() {
    const data = {
        noSurat: $('sk-no').value, tujuan: $('sk-tujuan').value,
        perihal: $('sk-perihal').value, ttd: $('sk-ttd').value, linkDoc: $('sk-link').value
    };
    try {
        const fileUrl = await uploadIfSelected('sk-file', 'Keluar');
        if (fileUrl) data.linkDoc = fileUrl;
        toggleLoading(true, 'Menyimpan Surat...');
        const res = await callApi('apiSimpanSuratKeluar', [data]);
        if (res.success) { showMessage('msg-keluar', 'Sukses', true); $('formKeluar').reset(); }
        else showMessage('msg-keluar', res.message, false);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

function openEditModal(jenis, rowId) {
    const row = (jenis === 'Masuk' ? state.masuk : state.keluar)[rowId];
    if (!row) return;
    $('edit-jenis').value = jenis;
    $('edit-rowId').value = rowId;
    $('edit-no').value = jenis === 'Masuk' ? row.noSurat : row.noSuratKeluar;
    $('edit-perihal').value = row.perihal;
    $('edit-link').value = row.linkDoc || '';
    clearUploadField('edit-file');
    $('edit-modal').classList.remove('hidden');
}

function closeEditModal() { $('edit-modal').classList.add('hidden'); }

async function submitEditData() {
    const data = {
        jenis: $('edit-jenis').value, rowId: $('edit-rowId').value,
        noSurat: $('edit-no').value, perihal: $('edit-perihal').value, linkDoc: $('edit-link').value
    };
    try {
        const fileUrl = await uploadIfSelected('edit-file', data.jenis);
        if (fileUrl) data.linkDoc = fileUrl;
        closeEditModal();
        toggleLoading(true, 'Menyimpan...');
        const res = await callApi('apiUpdateSurat', [data]);
        if (res.success) { if (data.jenis === 'Masuk') loadDaftarMasuk(); else loadDaftarKeluar(); }
        else alert('Gagal: ' + res.message);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

// ==========================================
// PENGGUNA (Khusus Admin)
// ==========================================

async function loadDaftarUser() {
    const tbody = $('tbody-pengguna');
    tbody.innerHTML = infoRow(4, 'Memuat data pengguna...');
    try {
        const data = await callApi('apiGetDaftarUser');
        state.users = data;
        tbody.innerHTML = data.map((row, idx) => {
            const roleBadge = row.role === 'Admin'
                ? '<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border border-yellow-200">Admin</span>'
                : '<span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold border border-gray-200">Staff</span>';
            return `
                <tr class="border-b hover:bg-gray-50 text-sm">
                    <td class="py-3 px-4 font-bold text-gray-800">${esc(row.username)}</td>
                    <td class="py-3 px-4">${esc(row.nama)}</td>
                    <td class="py-3 px-4 text-center">${roleBadge}</td>
                    <td class="py-3 px-4 text-center"><button onclick="openModalPassword(${idx})" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-md text-xs font-bold"><i class="fas fa-key"></i> Ubah Sandi</button></td>
                </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = infoRow(4, 'Gagal memuat: ' + esc(err.message));
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
        if (res.success) { alert(res.message); loadDaftarUser(); }
        else alert('Gagal: ' + res.message);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

function openModalPassword(idx) {
    const username = state.users[idx].username;
    $('formUbahPassword').reset();
    $('pass-username').value = username;
    $('pass-username-display').innerText = username;
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
        alert(res.success ? res.message : 'Gagal: ' + res.message);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

// ==========================================
// CETAK & HAPUS
// ==========================================

function cetakTabel(tableId, judul) {
    const table = $(tableId).cloneNode(true);
    const ths = table.querySelectorAll('th');
    const trs = table.querySelectorAll('tr');

    // Sembunyikan kolom 'Aksi' saat dicetak
    if (ths.length > 0 && ths[ths.length - 1].innerText.trim() === 'Aksi') {
        ths[ths.length - 1].remove();
        trs.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length > 0) tds[tds.length - 1].remove();
        });
    }

    const win = window.open('', '', 'height=700,width=900');
    win.document.write('<html><head><title>Cetak ' + esc(judul) + '</title>');
    win.document.write('<style>');
    win.document.write('body { font-family: Arial, sans-serif; padding: 20px; }');
    win.document.write('table { width: 100%; border-collapse: collapse; margin-top: 20px; }');
    win.document.write('th, td { border: 1px solid #333; padding: 10px; text-align: left; font-size: 12px; }');
    win.document.write('th { background-color: #f3f4f6; }');
    win.document.write('.text-center { text-align: center; }');
    win.document.write('a { text-decoration: none; color: black; }');
    win.document.write('</style></head><body>');
    win.document.write('<h2>' + esc(judul) + '</h2>');
    win.document.write('<p>Dicetak pada: ' + new Date().toLocaleString('id-ID') + '</p>');
    win.document.write(table.outerHTML);
    win.document.write('</body></html>');
    win.document.close();

    setTimeout(() => { win.print(); win.close(); }, 500);
}

async function hapusData(jenis, rowId) {
    const yakin = await showConfirm(
        `Data ${jenis} ini akan dihapus secara permanen.\n\nDokumen yang diunggah ke Google Drive juga akan dipindahkan ke Sampah Drive.`,
        { type: 'danger', okText: 'Ya, Hapus', cancelText: 'Batal' }
    );
    if (!yakin) return;
    toggleLoading(true, 'Menghapus data dan dokumen di Drive...');
    try {
        const res = await callApi('apiHapusData', [jenis, rowId], 60000);
        if (res.success) {
            if (jenis === 'Masuk') loadDaftarMasuk();
            if (jenis === 'Keluar') loadDaftarKeluar();
            if (jenis === 'Peraturan') loadDaftarPeraturanAdmin();
            loadDashboardStats();
            if (res.file === 'external') alert('Data dihapus. Dokumen TIDAK ikut dihapus dari Drive karena bukan file hasil upload aplikasi (link eksternal).');
            else if (res.file === 'missing') alert('Data dihapus. Dokumen di Drive sudah tidak ditemukan (mungkin sudah dihapus sebelumnya).');
        } else {
            alert('Gagal menghapus: ' + res.message);
        }
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}
