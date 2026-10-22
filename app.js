/* ==========================================
   E-SURAT & JDIH - FRONTEND (GitHub Pages)
   Memanggil backend Google Apps Script lewat fetch()
   ========================================== */

const $ = (id) => document.getElementById(id);

// ---------- Helper umum ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escBr = (s) => esc(s).replace(/\r?\n/g, '<br>');
const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? esc(u) : '';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const pad2 = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const fmtTgl = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const fmtTglPanjang = (iso) => iso ? parseInt(iso.slice(8, 10), 10) + ' ' + BULAN[parseInt(iso.slice(5, 7), 10) - 1] + ' ' + iso.slice(0, 4) : '';
const tglTampil = (iso, raw) => iso ? fmtTgl(iso) : (raw || '');
const nowStamp = () => { const d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()); };
const val = (id) => $(id).value.trim();

// Data hasil muat dari server
const state = { masuk: [], keluar: [], peraturan: [], publik: [], users: [], laporan: null, report: null };
const byRow = { masuk: {}, keluar: {}, peraturan: {} };


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

// ==========================================
// DIALOG, TOAST, LOADING
// ==========================================
const DLG_TYPES = {
    success: { title: 'Berhasil', icon: 'fa-check-circle', bar: 'bg-green-500', ring: 'bg-green-100', text: 'text-green-600', btn: 'bg-green-600 hover:bg-green-700', glow: 'rgba(34,197,94,.45)' },
    error:   { title: 'Terjadi kesalahan', icon: 'fa-times-circle', bar: 'bg-red-500', ring: 'bg-red-100', text: 'text-red-600', btn: 'bg-red-600 hover:bg-red-700', glow: 'rgba(239,68,68,.45)' },
    warning: { title: 'Perhatian', icon: 'fa-exclamation-triangle', bar: 'bg-yellow-500', ring: 'bg-yellow-100', text: 'text-yellow-600', btn: 'bg-yellow-500 hover:bg-yellow-600', glow: 'rgba(234,179,8,.45)' },
    info:    { title: 'Informasi', icon: 'fa-info-circle', bar: 'bg-blue-500', ring: 'bg-blue-100', text: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700', glow: 'rgba(59,130,246,.45)' },
    confirm: { title: 'Konfirmasi', icon: 'fa-question-circle', bar: 'bg-blue-500', ring: 'bg-blue-100', text: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700', glow: 'rgba(59,130,246,.45)' },
    danger:  { title: 'Hapus data?', icon: 'fa-trash-alt', bar: 'bg-red-500', ring: 'bg-red-100', text: 'text-red-600', btn: 'bg-red-600 hover:bg-red-700', glow: 'rgba(239,68,68,.45)' }
};

const dlgState = { queue: [], open: false, keyHandler: null };

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
    $('dlg-icon-wrap').style.setProperty('--dlg-glow', t.glow);$('dlg-icon').className = 'fas text-3xl ' + t.icon + ' ' + t.text;
    $('dlg-title').textContent = opts.title || t.title;
    $('dlg-message').textContent = opts.message || '';

    const ok = $('dlg-ok'), cancel =$('dlg-cancel');
    ok.textContent = opts.okText || 'OK';
    ok.className = 'dlg-btn flex-1 px-4 rounded-lg text-white font-bold text-sm ' + t.btn;
    if (opts.cancelText) { cancel.textContent = opts.cancelText; cancel.classList.remove('hidden'); }
    else cancel.classList.add('hidden');

    const overlay = $('dlg-overlay');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('show'));
    ok.focus();

    const close = (result) => {
        overlay.classList.remove('show');
        ok.onclick = cancel.onclick = overlay.onclick = null;
        document.removeEventListener('keydown', dlgState.keyHandler);
        setTimeout(() => { overlay.classList.add('hidden'); resolve(result); dlgNext(); }, 180);
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

// Tebak tipe dialog dari isi pesan (agar semua alert() otomatis tampil sesuai konteks)
function dlgGuessType(msg) {
    const m = String(msg || '').toLowerCase();
    if (/^(error|gagal|login gagal)|gagal|tidak valid|timeout/.test(m)) return 'error';
    if (/format file|ukuran file|wajib|pilih file|tidak didukung|tidak ikut|tidak ditemukan|sesi berakhir|tidak ada data/.test(m)) return 'warning';
    if (/berhasil|sukses|dihapus|disimpan|diperbarui/.test(m)) return 'success';
    return 'info';
}

const showAlert = (message, type, title) => dlgShow({ message, type: type || dlgGuessType(message), title });
const showConfirm = (message, opts = {}) => dlgShow({
    message, type: opts.type || 'confirm', title: opts.title,
    okText: opts.okText || 'Ya, lanjutkan', cancelText: opts.cancelText || 'Batal'
});
window.alert = (message) => { showAlert(message); };

function showError(err) {
    if (err && err.handled) return; // sudah ditangani (mis. sesi berakhir)
    showAlert(err && err.message ? err.message : String(err), 'error');
}

function toast(message, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<i class="fas ' + (type === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation') + '"></i><span></span>';
    el.lastChild.textContent = message;
    $('toast-wrap').appendChild(el);
    setTimeout(() => el.remove(), type === 'ok' ? 3200 : 5000);
}

function toggleLoading(show, text = 'Memproses...') {
    $('loading-text').textContent = text;
    $('loading-overlay').classList.toggle('hidden', !show);
}

// ==========================================
// KOMPONEN UPLOAD (galeri, kamera, seret & lepas)
// ==========================================
const MAX_UPLOAD = 10 * 1024 * 1024; // samakan dengan DriveStore.MAX_BYTES di backend
const MAX_PAGES = 15;
const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,image/*';
const PDF_ACCEPT = '.pdf,application/pdf,image/*';
const UP = {}; // id -> { images:[{blob,url,name}], doc:File|null, busy:bool, pdfOnly:bool }

function fmtSize(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();
const isImage = (f) => (f.type || '').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name || '');

function docIcon(name) {
    const e = extOf(name);
    if (e === 'pdf') return 'fa-file-pdf';
    if (e === 'doc' || e === 'docx') return 'fa-file-word';
    if (e === 'xls' || e === 'xlsx') return 'fa-file-excel';
    return 'fa-file';
}

function readFileBase64(file, onProgress) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('Gagal membaca file.'));
        r.readAsDataURL(file);
    });
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto "' + file.name + '" tidak dapat dibaca. Gunakan format JPG atau PNG.')); };
        img.src = url;
    });
}

// Foto dari kamera/galeri bisa 5-10 MB: kecilkan dan jadikan JPEG agar cepat diunggah.
async function imageToJpeg(file, maxDim = 1800, quality = 0.8) {
    const img = await loadImage(file);
    const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s));
    const h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((resolve, reject) =>
        c.toBlob((b) => b ? resolve(b) : reject(new Error('Gagal memproses foto.')), 'image/jpeg', quality));
}

let pdfLibPromise = null;
function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve();
    if (!pdfLibPromise) {
        pdfLibPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
            s.onload = resolve;
            s.onerror = () => { pdfLibPromise = null; reject(new Error('Modul pembuat PDF gagal dimuat. Periksa koneksi internet.')); };
            document.head.appendChild(s);
        });
    }
    return pdfLibPromise;
}

async function imagesToPdf(blobs) {
    await loadPdfLib();
    const pdf = await PDFLib.PDFDocument.create();
    for (const b of blobs) {
        const img = await pdf.embedJpg(await b.arrayBuffer());
        const land = img.width > img.height;
        const pw = land ? 841.89 : 595.28, ph = land ? 595.28 : 841.89, m = 20;
        const page = pdf.addPage([pw, ph]);
        const sc = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
        const w = img.width * sc, h = img.height * sc;
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    return new Blob([await pdf.save()], { type: 'application/pdf' });
}

function initUploads() {
    document.querySelectorAll('.upload').forEach((el) => {
        const id = el.dataset.id;
        const pdfOnly = el.dataset.pdfonly === '1';
        UP[id] = { images: [], doc: null, busy: false, pdfOnly };
        el.innerHTML = `
            <div class="up-current hidden" data-r="current">
                <i class="fas fa-file-circle-check" style="color:var(--mod)"></i>
                <span>Dokumen sudah tersimpan. <a data-r="currentLink" href="#" target="_blank" rel="noopener noreferrer" class="font-semibold underline" style="color:var(--mod)">Buka dokumen</a>. Pilih file baru jika ingin menggantinya.</span>
            </div>
            <div class="up-box" data-r="box">
                <div class="up-title">${pdfOnly ? 'Unggah PDF atau foto dokumen' : 'Unggah dokumen surat'}</div>
                <div class="up-actions">
                    <button type="button" class="btn btn-soft" data-act="pick"><i class="fas fa-images"></i> Pilih dari galeri / berkas</button>
                    <button type="button" class="btn btn-soft" data-act="camera"><i class="fas fa-camera"></i> Ambil foto</button>
                </div>
                <p class="up-hint">${pdfOnly ? 'PDF atau foto' : 'PDF, Word, Excel, atau foto'}, maks. 10 MB. Beberapa foto otomatis digabung menjadi satu PDF.<span class="drag-hint"> Anda juga bisa menyeret file ke kotak ini.</span></p>
                <div class="up-selected hidden" data-r="selected"></div>
            </div>
            <input type="file" class="hidden" data-r="file" accept="${pdfOnly ? PDF_ACCEPT : DOC_ACCEPT}" multiple>
            <input type="file" class="hidden" data-r="cam" accept="image/*" capture="environment">`;

        const q = (r) => el.querySelector('[data-r="' + r + '"]');
        el.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            const rm = e.target.closest('[data-rm]');
            if (rm) { removeImage(id, parseInt(rm.dataset.rm, 10)); return; }
            if (!act) return;
            if (act.dataset.act === 'pick') q('file').click();
            else if (act.dataset.act === 'camera') q('cam').click();
            else if (act.dataset.act === 'clear') resetUpload(id, true);
        });
        ['file', 'cam'].forEach((r) => q(r).addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = ''; // supaya file yang sama bisa dipilih ulang
            addFiles(id, files);
        }));
        const box = q('box');
        box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('dragover'); });
        box.addEventListener('dragleave', () => box.classList.remove('dragover'));
        box.addEventListener('drop', (e) => {
            e.preventDefault(); box.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files.length) addFiles(id, Array.from(e.dataTransfer.files));
        });
    });
}

const upEl = (id) => document.querySelector('.upload[data-id="' + id + '"]');
const upQ = (id, r) => upEl(id).querySelector('[data-r="' + r + '"]');

function checkDoc(f, st) {
    const ok = st.pdfOnly ? ['pdf'] : ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
    if (!ok.includes(extOf(f.name))) {
        throw new Error('Format file tidak didukung. Gunakan ' + ok.map(x => x.toUpperCase()).join(', ') + ' atau foto.');
    }
    if (f.size > MAX_UPLOAD) throw new Error('Ukuran file maksimal 10 MB.');
}

function clearImages(st) {
    st.images.forEach(i => URL.revokeObjectURL(i.url));
    st.images = [];
}

async function addFiles(id, files) {
    const st = UP[id];
    if (!files.length || st.busy) return;
    const imgs = files.filter(isImage);
    const others = files.filter(f => !isImage(f));
    st.busy = true;
    renderUpload(id, 'Memproses file...');
    try {
        if (others.length) {
            if (others.length > 1 || imgs.length) throw new Error('Pilih satu dokumen (PDF/Word/Excel), atau beberapa foto saja.');
            checkDoc(others[0], st);
            clearImages(st);
            st.doc = others[0];
        } else {
            if (st.images.length + imgs.length > MAX_PAGES) throw new Error('Maksimal ' + MAX_PAGES + ' foto per dokumen.');
            st.doc = null;
            for (const f of imgs) {
                const blob = await imageToJpeg(f);
                st.images.push({ blob, url: URL.createObjectURL(blob), name: f.name });
                renderUpload(id, 'Memproses foto ' + st.images.length + ' dari ' + imgs.length + '...');
            }
        }
    } catch (err) {
        toast(err.message, 'err');
    } finally {
        st.busy = false;
        renderUpload(id);
    }
}

function removeImage(id, idx) {
    const st = UP[id];
    const [gone] = st.images.splice(idx, 1);
    if (gone) URL.revokeObjectURL(gone.url);
    renderUpload(id);
}

function renderUpload(id, busyText) {
    const st = UP[id];
    const sel = upQ(id, 'selected');
    let html = '';
    if (st.doc) {
        html = `<div class="up-doc">
            <div class="ico"><i class="fas ${docIcon(st.doc.name)}"></i></div>
            <div class="min-w-0 flex-1"><div class="nm">${esc(st.doc.name)}</div><div class="sz">${fmtSize(st.doc.size)}</div></div>
            <button type="button" class="btn btn-icon btn-ghost" data-act="clear" aria-label="Hapus pilihan"><i class="fas fa-trash"></i></button>
        </div>`;
    } else if (st.images.length) {
        const total = st.images.reduce((a, i) => a + i.blob.size, 0);
        const jadiPdf = st.images.length > 1 || st.pdfOnly;
        html = `<div class="up-thumbs">${st.images.map((im, i) => `
            <div class="up-thumb"><img src="${im.url}" alt="Halaman ${i + 1}"><span class="pg">${i + 1}</span>
            <button type="button" class="rm" data-rm="${i}" aria-label="Hapus foto ${i + 1}"><i class="fas fa-times"></i></button></div>`).join('')}</div>
            <p class="up-note">${jadiPdf
                ? st.images.length + ' foto akan digabung menjadi satu PDF (' + st.images.length + ' halaman).'
                : '1 foto akan diunggah sebagai JPG.'} Perkiraan ukuran ${fmtSize(total)}. Tambahkan halaman lain dengan tombol di atas.</p>
            <button type="button" class="btn btn-ghost btn-sm mt-2" data-act="clear"><i class="fas fa-trash"></i> Hapus semua foto</button>`;
    }
    if (busyText) html += `<div class="up-busy"><i class="fas fa-circle-notch spin"></i> ${esc(busyText)}</div>`;
    sel.innerHTML = html;
    sel.classList.toggle('hidden', !html);
}

function resetUpload(id, keepCurrent) {
    const st = UP[id];
    if (!st) return;
    clearImages(st);
    st.doc = null;
    renderUpload(id);
    if (!keepCurrent) setUploadCurrent(id, '');
}

function setUploadCurrent(id, url) {
    const cur = upQ(id, 'current');
    const safe = /^https?:\/\//i.test(url || '') ? url : '';
    cur.classList.toggle('hidden', !safe);
    if (safe) upQ(id, 'currentLink').href = safe;
}

async function buildUploadFile(id) {
    const st = UP[id];
    if (st.doc) return st.doc;
    if (!st.images.length) return null;
    const stamp = nowStamp();
    if (st.images.length === 1 && !st.pdfOnly) {
        return new File([st.images[0].blob], 'Foto_' + stamp + '.jpg', { type: 'image/jpeg' });
    }
    const pdf = await imagesToPdf(st.images.map(i => i.blob));
    return new File([pdf], 'Scan_' + stamp + '.pdf', { type: 'application/pdf' });
}

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

function upOpen(text) {
    $('upload-filename').textContent = text;
    $('upload-title').textContent = 'Mengunggah dokumen...';
    $('upload-bar').classList.remove('done');
    $('upload-icon').className = 'mx-auto mb-3 w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center';
    $('upload-icon-i').className = 'fas fa-cloud-arrow-up text-3xl text-blue-600 upload-bounce';
    upSet(0, 'Menyiapkan dokumen...', 1);
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Jika ada file/foto dipilih: unggah ke folder Drive sesuai jenis, kembalikan URL-nya. Jika tidak: null.
async function uploadIfSelected(id, jenis) {
    const st = UP[id];
    if (st.busy) throw new Error('Foto masih diproses, tunggu sebentar.');
    if (!st.doc && !st.images.length) return null;
    upOpen('Menyiapkan dokumen...');
    try {
        upSet(2, 'Menyiapkan dokumen...', 1);
        const file = await buildUploadFile(id);
        if (file.size > MAX_UPLOAD) throw new Error('Ukuran file ' + fmtSize(file.size) + ' melebihi batas 10 MB.');
        $('upload-filename').textContent = file.name + ' (' + fmtSize(file.size) + ')';

        const base64 = await readFileBase64(file, (p) => upSet(2 + p * 13, 'Membaca file...', 1));
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

// ==========================================
// INIT & MANAJEMEN LAYAR
// ==========================================
const isLoggedIn = () => !!sessionStorage.getItem('token');
const isAdmin = () => sessionStorage.getItem('role') === 'Admin';

document.addEventListener('DOMContentLoaded', () => {
    initUploads();
    $('today-label').textContent = fmtTglPanjang(todayIso());
    ['masuk', 'keluar'].forEach(initBulanSelect);
    if (isLoggedIn()) { showMainApp(); nav('dashboard'); }
    else showPublicPortal();
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || dlgState.open) return;
    if (!$('preview-overlay').classList.contains('hidden')) closePreview();
    else closeDrawer();
});
window.addEventListener('resize', () => { if (!$('preview-overlay').classList.contains('hidden')) fitPreview(); });

function openDrawer() {
    $('admin-sidebar').classList.add('open');
    $('drawer-backdrop').classList.add('show');
}
function closeDrawer() {
    $('admin-sidebar').classList.remove('open');
    $('drawer-backdrop').classList.remove('show');
}

function showPublicPortal() {
    closeDrawer();
    $('public-portal').classList.remove('hidden');
    $('login-screen').classList.add('hidden');
    $('admin-shell').classList.add('hidden');
    loadPeraturanPublik();
}

function showLoginScreen() {
    $('public-portal').classList.add('hidden');
    $('login-screen').classList.remove('hidden');
    $('admin-shell').classList.add('hidden');
    setTimeout(() => $('login-user').focus(), 60);
}

function showMainApp() {
    $('public-portal').classList.add('hidden');
    $('login-screen').classList.add('hidden');
    $('admin-shell').classList.remove('hidden');
    const nama = sessionStorage.getItem('nama') || sessionStorage.getItem('username') || 'Pengguna';
    $('user-nama').textContent = nama;
    $('user-role').textContent = sessionStorage.getItem('role') || 'Staff';
    $('user-initial').textContent = nama.charAt(0).toUpperCase();
    $('dash-nama').textContent = nama;
    $('menu-admin').classList.toggle('hidden', !isAdmin());
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
            sessionStorage.setItem('nama', res.nama || user);
            $('login-pass').value = '';
            showMainApp();
            nav('dashboard');
        } else {
            showAlert('Login gagal: ' + res.message, 'error');
        }
    } catch (err) {
        showAlert('Login gagal: ' + err.message, 'error');
    } finally {
        toggleLoading(false);
    }
}

function clearSession() {
    ['token', 'role', 'nama'].forEach(k => sessionStorage.removeItem(k));
    state.laporan = null;
}

function logout() {
    callApi('apiLogout').catch(() => {}); // cabut token di server (tidak perlu ditunggu)
    clearSession();
    showPublicPortal();
}

function forceLogout(message) {
    clearSession();
    toggleLoading(false);
    upClose();
    showPublicPortal();
    showAlert(message || 'Sesi berakhir, silakan login ulang.', 'warning');
}

// ==========================================
// NAVIGASI (SPA)
// ==========================================
const TITLES = {
    dashboard: 'Beranda', suratMasuk: 'Catat surat masuk', suratKeluar: 'Catat surat keluar',
    daftarMasuk: 'Surat masuk', daftarKeluar: 'Surat keluar', inputPeraturan: 'Tambah dokumen hukum',
    daftarPeraturan: 'Dokumen hukum', pengguna: 'Kelola pengguna', pengaturan: 'Pengaturan laporan'
};
const BOTTOM_PARENT = { suratMasuk: 'daftarMasuk', suratKeluar: 'daftarKeluar', inputPeraturan: 'daftarPeraturan' };

function nav(tabId, opts) {
    if ((tabId === 'pengguna' || tabId === 'pengaturan') && !isAdmin()) return;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    $('tab-' + tabId).classList.remove('hidden');
    document.querySelectorAll('.nav-btn[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
    const bn = BOTTOM_PARENT[tabId] || tabId;
    document.querySelectorAll('.bn-btn[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === bn));
    $('page-title').textContent = TITLES[tabId] || 'E-Surat & JDIH';
    closeDrawer();
    window.scrollTo(0, 0);

    const keep = opts && opts.keep;
    if (tabId === 'dashboard') loadDashboard();
    if (tabId === 'suratMasuk' && !keep) resetFormMasuk();
    if (tabId === 'suratKeluar' && !keep) resetFormKeluar();
    if (tabId === 'inputPeraturan' && !keep) resetFormPeraturan();
    if (tabId === 'daftarMasuk') loadDaftar('masuk');
    if (tabId === 'daftarKeluar') loadDaftar('keluar');
    if (tabId === 'daftarPeraturan') loadDaftar('peraturan');
    if (tabId === 'pengguna') loadDaftarUser();
    if (tabId === 'pengaturan') loadPengaturan();
}

// ==========================================
// BERANDA
// ==========================================
function recentList(items, kind) {
    if (!items || !items.length) return '<div class="empty" style="padding:1.5rem 0"><i class="far fa-folder-open"></i>Belum ada data.</div>';
    return items.map(r => `
        <div class="recent-row">
            <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold truncate" style="color:var(--ink)">${esc(kind === 'masuk' ? r.asal : r.tujuan)}</div>
                <div class="text-sm text-slate-600 truncate">${esc(r.perihal)}</div>
            </div>
            <div class="text-xs text-slate-500 shrink-0">${esc(r.tgl)}</div>
        </div>`).join('');
}

async function loadDashboard() {
    try {
        const s = await callApi('apiGetDashboardStatistik');
        $('stat-masuk').textContent = s.jmlMasuk;
        $('stat-keluar').textContent = s.jmlKeluar;
        $('stat-jdih').textContent = s.jmlPeraturan;
        $('stat-masuk-bln').textContent = s.masukBulanIni;
        $('stat-keluar-bln').textContent = s.keluarBulanIni;
        $('recent-masuk').innerHTML = recentList(s.terbaruMasuk, 'masuk');
        $('recent-keluar').innerHTML = recentList(s.terbaruKeluar, 'keluar');
    } catch (err) { /* sesi berakhir ditangani callApi; error lain diabaikan di beranda */ }
}

// ==========================================
// BADGE & TOMBOL BERSAMA
// ==========================================
function sifatBadge(s) {
    const map = { 'Biasa': 'badge-gray', 'Segera': 'badge-warn', 'Sangat Segera': 'badge-danger', 'Rahasia': 'badge-ink' };
    return `<span class="badge ${map[s] || 'badge-gray'}">${esc(s || 'Biasa')}</span>`;
}
function statusBadge(s) {
    const map = { 'Berlaku': 'badge-ok', 'Diubah': 'badge-warn', 'Dicabut': 'badge-danger', 'Tidak Berlaku': 'badge-danger' };
    return `<span class="badge ${map[s] || 'badge-gray'}">${esc(s || 'Berlaku')}</span>`;
}
const docIconLink = (u, title) => {
    const url = safeUrl(u);
    return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="btn btn-icon btn-soft btn-sm" title="${title}" aria-label="${title}"><i class="fas fa-file-arrow-down"></i></a>` : '<span class="text-slate-400">–</span>';
};
const docTextLink = (u, label) => {
    const url = safeUrl(u);
    return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="btn btn-soft btn-sm"><i class="fas fa-file-arrow-down"></i> ${label}</a>` : '';
};
const aksiIcons = (jenis, rowId) => `
    <div class="flex justify-center gap-1">
        <button class="btn btn-icon btn-ghost btn-sm" onclick="editData('${jenis}', ${rowId})" title="Ubah" aria-label="Ubah"><i class="fas fa-pen-to-square"></i></button>
        <button class="btn btn-icon btn-ghost btn-sm" style="color:var(--danger)" onclick="hapusData('${jenis}', ${rowId})" title="Hapus" aria-label="Hapus"><i class="fas fa-trash"></i></button>
    </div>`;
const aksiCard = (jenis, rowId, linkUrl, linkLabel) => `
    <div class="item-actions">
        ${docTextLink(linkUrl, linkLabel)}
        <button class="btn btn-ghost btn-sm" onclick="editData('${jenis}', ${rowId})"><i class="fas fa-pen-to-square"></i> Ubah</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="hapusData('${jenis}', ${rowId})"><i class="fas fa-trash"></i> Hapus</button>
    </div>`;

// ==========================================
// DAFTAR + FILTER (surat masuk, surat keluar, JDIH)
// ==========================================
const rowMasuk = (r) => `
    <tr>
        <td><div class="strong">${esc(r.idSurat)}</div></td>
        <td>${esc(tglTampil(r.tglTerimaIso, r.tglTerima))}</td>
        <td><div class="strong">${esc(r.noSurat)}</div>${r.tglSurat ? `<div class="sub">Tgl. ${esc(tglTampil(r.tglSuratIso, r.tglSurat))}</div>` : ''}</td>
        <td><div class="strong">${esc(r.asalSurat)}</div><div>${esc(r.perihal)}</div>
            <div class="sub flex flex-wrap items-center gap-1 mt-1">${sifatBadge(r.sifat)}${r.lampiran ? '<span>Lampiran: ' + esc(r.lampiran) + '</span>' : ''}</div></td>
        <td>${esc(r.disposisi) || '<span class="text-slate-400">–</span>'}</td>
        <td class="c">${docIconLink(r.linkDoc, 'Buka dokumen')}</td>
        <td class="c">${aksiIcons('Masuk', r.rowId)}</td>
    </tr>`;

const cardMasuk = (r) => `
    <div class="item-card">
        <div class="item-top"><span class="badge badge-mod">${esc(r.idSurat)}</span><span>Diterima ${esc(tglTampil(r.tglTerimaIso, r.tglTerima))}</span></div>
        <div class="item-title">${esc(r.asalSurat)}</div>
        <div class="item-sub">${esc(r.perihal)}</div>
        <div class="item-meta">
            <span class="badge badge-gray"><i class="fas fa-hashtag"></i> ${esc(r.noSurat)}</span>
            ${r.sifat && r.sifat !== 'Biasa' ? sifatBadge(r.sifat) : ''}
            ${r.disposisi ? '<span class="badge badge-gray"><i class="fas fa-share"></i> ' + esc(r.disposisi) + '</span>' : ''}
        </div>
        ${aksiCard('Masuk', r.rowId, r.linkDoc, 'Dokumen')}
    </div>`;

const rowKeluar = (r) => `
    <tr>
        <td>${esc(tglTampil(r.tglSuratIso, r.tglSurat))}</td>
        <td><div class="strong">${esc(r.noSuratKeluar)}</div><div class="sub">Urut ${esc(r.noUrut)}</div></td>
        <td>${esc(r.tujuan)}</td>
        <td><div>${esc(r.perihal)}</div>
            <div class="sub flex flex-wrap items-center gap-1 mt-1">${sifatBadge(r.sifat)}${r.lampiran ? '<span>Lampiran: ' + esc(r.lampiran) + '</span>' : ''}</div></td>
        <td>${esc(r.penandatangan)}</td>
        <td class="c">${docIconLink(r.linkDoc, 'Buka dokumen')}</td>
        <td class="c">${aksiIcons('Keluar', r.rowId)}</td>
    </tr>`;

const cardKeluar = (r) => `
    <div class="item-card">
        <div class="item-top"><span class="badge badge-mod">No. urut ${esc(r.noUrut)}</span><span>${esc(tglTampil(r.tglSuratIso, r.tglSurat))}</span></div>
        <div class="item-title">${esc(r.tujuan)}</div>
        <div class="item-sub">${esc(r.perihal)}</div>
        <div class="item-meta">
            <span class="badge badge-gray"><i class="fas fa-hashtag"></i> ${esc(r.noSuratKeluar)}</span>
            ${r.sifat && r.sifat !== 'Biasa' ? sifatBadge(r.sifat) : ''}
            ${r.penandatangan ? '<span class="badge badge-gray"><i class="fas fa-signature"></i> ' + esc(r.penandatangan) + '</span>' : ''}
        </div>
        ${aksiCard('Keluar', r.rowId, r.linkDoc, 'Dokumen')}
    </div>`;

const tglPenetapanText = (r) => tglTampil(r.tglPenetapanIso, r.tglPenetapan);

const rowPeraturan = (r) => `
    <tr>
        <td><span class="badge badge-mod">${esc(r.kategori)}</span></td>
        <td class="strong" style="white-space:nowrap">${esc(r.nomor)} / ${esc(r.tahun)}</td>
        <td><div>${esc(r.tentang)}</div>${r.subjek ? '<div class="sub">Subjek: ' + esc(r.subjek) + '</div>' : ''}</td>
        <td>${esc(tglPenetapanText(r)) || '<span class="text-slate-400">–</span>'}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="c">${docIconLink(r.linkPdf, 'Buka PDF')}</td>
        <td class="c">${aksiIcons('Peraturan', r.rowId)}</td>
    </tr>`;

const cardPeraturan = (r) => `
    <div class="item-card">
        <div class="item-top"><span class="badge badge-mod">${esc(r.kategori)}</span>${statusBadge(r.status)}</div>
        <div class="item-title">Nomor ${esc(r.nomor)} Tahun ${esc(r.tahun)}</div>
        <div class="item-sub">${esc(r.tentang)}</div>
        <div class="item-meta">
            ${tglPenetapanText(r) ? '<span class="badge badge-gray"><i class="far fa-calendar"></i> ' + esc(tglPenetapanText(r)) + '</span>' : ''}
            ${r.subjek ? '<span class="badge badge-gray"><i class="fas fa-tag"></i> ' + esc(r.subjek) + '</span>' : ''}
        </div>
        ${aksiCard('Peraturan', r.rowId, r.linkPdf, 'Buka PDF')}
    </div>`;

const LIST = {
    masuk: {
        api: 'apiGetDaftarSuratMasuk', dateKey: 'tglTerimaIso', bulan: 'f-masuk-bulan', tahun: 'f-masuk-tahun', q: 'f-masuk-q',
        count: 'count-masuk', tbody: 'tbody-masuk', cards: 'cards-masuk', unit: 'surat masuk', cols: 7, row: rowMasuk, card: cardMasuk,
        search: (r) => [r.idSurat, r.noSurat, r.asalSurat, r.perihal, r.disposisi, r.keterangan]
    },
    keluar: {
        api: 'apiGetDaftarSuratKeluar', dateKey: 'tglSuratIso', bulan: 'f-keluar-bulan', tahun: 'f-keluar-tahun', q: 'f-keluar-q',
        count: 'count-keluar', tbody: 'tbody-keluar', cards: 'cards-keluar', unit: 'surat keluar', cols: 7, row: rowKeluar, card: cardKeluar,
        search: (r) => [r.noSuratKeluar, r.tujuan, r.perihal, r.penandatangan, r.keterangan]
    },
    peraturan: {
        api: 'apiGetDaftarPeraturan', jenis: 'f-prt-jenis', tahun: 'f-prt-tahun', q: 'f-prt-q',
        count: 'count-prt', tbody: 'tbody-peraturan', cards: 'cards-peraturan', unit: 'dokumen hukum', cols: 7, row: rowPeraturan, card: cardPeraturan,
        search: (r) => [r.kategori, r.nomor, r.tahun, r.tentang, r.subjek, r.keterangan]
    }
};

function fillSelect(id, firstLabel, options) {
    const el = $(id);
    const keep = el.value;
    el.innerHTML = '<option value="">' + esc(firstLabel) + '</option>' +
        options.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
    if (options.some(o => o.v === keep)) el.value = keep;
}

function initBulanSelect(kind) {
    fillSelect(LIST[kind].bulan, 'Semua bulan', BULAN.map((b, i) => ({ v: pad2(i + 1), l: b })));
}

function buildFilterOptions(kind) {
    const L = LIST[kind];
    const thisYear = String(new Date().getFullYear());
    if (kind === 'peraturan') {
        const jenis = [...new Set(state.peraturan.map(r => r.kategori).filter(Boolean))].sort();
        const tahun = [...new Set(state.peraturan.map(r => String(r.tahun)).filter(Boolean))].sort().reverse();
        fillSelect(L.jenis, 'Semua jenis', jenis.map(j => ({ v: j, l: j })));
        fillSelect(L.tahun, 'Semua tahun', tahun.map(t => ({ v: t, l: t })));
    } else {
        const years = new Set(state[kind].map(r => (r[L.dateKey] || '').slice(0, 4)).filter(Boolean));
        years.add(thisYear);
        fillSelect(L.tahun, 'Semua tahun', [...years].sort().reverse().map(y => ({ v: y, l: y })));
    }
}

function getFiltered(kind) {
    const L = LIST[kind];
    let rows = state[kind];
    if (kind === 'peraturan') {
        const j = $(L.jenis).value, t = $(L.tahun).value;
        rows = rows.filter(r => (!j || r.kategori === j) && (!t || String(r.tahun) === t));
    } else {
        const b = $(L.bulan).value, t = $(L.tahun).value;
        rows = rows.filter(r => {
            const iso = r[L.dateKey] || '';
            if (b && iso.slice(5, 7) !== b) return false;
            if (t && iso.slice(0, 4) !== t) return false;
            return true;
        });
    }
    const q = $(L.q).value.trim().toLowerCase();
    if (q) rows = rows.filter(r => L.search(r).join(' ').toLowerCase().includes(q));
    return rows;
}

function labelPeriode(b, t) {
    if (b && t) return BULAN[parseInt(b, 10) - 1] + ' ' + t;
    if (t) return 'Tahun ' + t;
    if (b) return 'Bulan ' + BULAN[parseInt(b, 10) - 1] + ' (semua tahun)';
    return 'Semua periode';
}

function periodeOf(kind) {
    const L = LIST[kind];
    if (kind === 'peraturan') {
        const j = $(L.jenis).value, t = $(L.tahun).value;
        return (j || 'Semua jenis') + ' · ' + (t ? 'Tahun ' + t : 'Semua tahun');
    }
    return labelPeriode($(L.bulan).value, $(L.tahun).value);
}

const filterAktif = (kind) => {
    const L = LIST[kind];
    return kind === 'peraturan'
        ? !!($(L.jenis).value || $(L.tahun).value || $(L.q).value.trim())
        : !!($(L.bulan).value || $(L.tahun).value || $(L.q).value.trim());
};

function setListPlaceholder(kind, text, isError) {
    const L = LIST[kind];
    const color = isError ? 'var(--danger)' : 'var(--muted)';
    $(L.tbody).innerHTML = `<tr><td colspan="${L.cols}" class="c" style="text-align:center;padding:2rem;color:${color}">${esc(text)}</td></tr>`;
    $(L.cards).innerHTML = `<div style="text-align:center;padding:2rem 1rem;color:${color}">${esc(text)}</div>`;
    $(L.count).textContent = '';
}

async function loadDaftar(kind) {
    const L = LIST[kind];
    setListPlaceholder(kind, 'Memuat data...');
    try {
        const data = await callApi(L.api);
        state[kind] = data;
        byRow[kind] = {};
        data.forEach(r => { byRow[kind][r.rowId] = r; });
        buildFilterOptions(kind);
        renderDaftar(kind);
    } catch (err) {
        if (!err.handled) setListPlaceholder(kind, 'Gagal memuat: ' + err.message, true);
    }
}

function renderDaftar(kind) {
    const L = LIST[kind];
    const rows = getFiltered(kind);
    const total = state[kind].length;
    const periode = kind === 'peraturan' ? '' : ' · ' + periodeOf(kind);
    $(L.count).innerHTML = `Menampilkan <strong>${rows.length}</strong> dari ${total} ${L.unit}${esc(periode)}`;

    if (!rows.length) {
        const pesan = total && filterAktif(kind)
            ? `<strong>Tidak ada ${L.unit} yang cocok</strong><br>Ubah bulan, tahun, atau kata pencarian.`
            : `<strong>Belum ada ${L.unit}</strong><br>Data yang dicatat akan muncul di sini.`;
        const html = `<div class="empty"><i class="far fa-folder-open"></i>${pesan}</div>`;
        $(L.tbody).innerHTML = `<tr><td colspan="${L.cols}">${html}</td></tr>`;
        $(L.cards).innerHTML = html;
        return;
    }
    $(L.tbody).innerHTML = rows.map(L.row).join('');
    $(L.cards).innerHTML = rows.map(L.card).join('');
}

const applyFilter = (kind) => renderDaftar(kind);

function resetFilter(kind) {
    const L = LIST[kind];
    if (L.bulan) $(L.bulan).value = '';
    if (L.jenis) $(L.jenis).value = '';
    $(L.tahun).value = '';
    $(L.q).value = '';
    renderDaftar(kind);
}

function filterBulanIni(kind) {
    const L = LIST[kind];
    const d = new Date();
    $(L.bulan).value = pad2(d.getMonth() + 1);
    $(L.tahun).value = String(d.getFullYear());
    renderDaftar(kind);
}

// ==========================================
// FORM: SURAT MASUK
// ==========================================
function setFormMode(prefix, title, sub, submitLabel, editing) {
    $(prefix + '-title').textContent = title;
    $(prefix + '-sub').textContent = sub;
    $(prefix + '-submit-label').textContent = submitLabel;
    $(prefix + '-cancel').classList.toggle('hidden', !editing);
    $('page-title').textContent = title;
}

function resetFormMasuk() {
    $('formMasuk').reset();
    $('sm-rowid').value = '';
    $('sm-tglterima').value = todayIso();
    $('sm-sifat').value = 'Biasa';
    resetUpload('sm');
    setFormMode('sm', 'Catat surat masuk', 'Nomor agenda dibuat otomatis saat disimpan.', 'Simpan surat masuk', false);
}

function resetFormKeluar() {
    $('formKeluar').reset();
    $('sk-rowid').value = '';
    $('sk-tgl').value = todayIso();
    $('sk-sifat').value = 'Biasa';
    resetUpload('sk');
    setFormMode('sk', 'Catat surat keluar', 'Nomor urut dibuat otomatis saat disimpan.', 'Simpan surat keluar', false);
}

function resetFormPeraturan() {
    $('formPeraturan').reset();
    $('prt-rowid').value = '';
    $('prt-tahun').value = new Date().getFullYear();
    $('prt-status').value = 'Berlaku';
    resetUpload('prt');
    setFormMode('prt', 'Tambah dokumen hukum', 'Dokumen yang disimpan di sini langsung tampil di portal publik JDIH.', 'Publikasikan ke portal', false);
}

async function submitSuratMasuk() {
    if (!$('formMasuk').reportValidity()) return;
    const rowId = $('sm-rowid').value;
    const data = {
        tglTerima: $('sm-tglterima').value, tglSurat: $('sm-tglsurat').value,
        noSurat: val('sm-no'), asalSurat: val('sm-asal'), perihal: val('sm-perihal'),
        sifat: $('sm-sifat').value, lampiran: val('sm-lampiran'),
        disposisi: val('sm-disposisi'), keterangan: val('sm-ket'), linkDoc: val('sm-link')
    };
    try {
        const fileUrl = await uploadIfSelected('sm', 'Masuk');
        if (fileUrl) data.linkDoc = fileUrl;
        toggleLoading(true, 'Menyimpan surat...');
        let res;
        if (rowId) { data.jenis = 'Masuk'; data.rowId = rowId; res = await callApi('apiUpdateSurat', [data]); }
        else res = await callApi('apiSimpanSuratMasuk', [data]);
        if (res.success) {
            toast(rowId ? 'Perubahan surat masuk disimpan.' : 'Surat masuk tersimpan.');
            if (rowId) nav('daftarMasuk'); else resetFormMasuk();
        } else showAlert(res.message, 'error');
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

async function submitSuratKeluar() {
    if (!$('formKeluar').reportValidity()) return;
    const rowId = $('sk-rowid').value;
    const data = {
        tglSurat: $('sk-tgl').value, noSurat: val('sk-no'), tujuan: val('sk-tujuan'), perihal: val('sk-perihal'),
        sifat: $('sk-sifat').value, lampiran: val('sk-lampiran'), ttd: val('sk-ttd'),
        tembusan: val('sk-tembusan'), keterangan: val('sk-ket'), linkDoc: val('sk-link')
    };
    try {
        const fileUrl = await uploadIfSelected('sk', 'Keluar');
        if (fileUrl) data.linkDoc = fileUrl;
        toggleLoading(true, 'Menyimpan surat...');
        let res;
        if (rowId) { data.jenis = 'Keluar'; data.rowId = rowId; res = await callApi('apiUpdateSurat', [data]); }
        else res = await callApi('apiSimpanSuratKeluar', [data]);
        if (res.success) {
            toast(rowId ? 'Perubahan surat keluar disimpan.' : 'Surat keluar tersimpan.');
            if (rowId) nav('daftarKeluar'); else resetFormKeluar();
        } else showAlert(res.message, 'error');
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

async function submitPeraturan() {
    if (!$('formPeraturan').reportValidity()) return;
    const rowId = $('prt-rowid').value;
    const data = {
        kategori: $('prt-kategori').value, nomor: val('prt-no'), tahun: val('prt-tahun'), tentang: val('prt-tentang'),
        tempat: val('prt-tempat'), tglPenetapan: $('prt-tglpenetapan').value, tglPengundangan: $('prt-tglpengundangan').value,
        sumber: val('prt-sumber'), status: $('prt-status').value, subjek: val('prt-subjek'), keterangan: val('prt-ket'),
        linkPdf: val('prt-link')
    };
    try {
        const fileUrl = await uploadIfSelected('prt', 'Peraturan');
        if (fileUrl) data.linkPdf = fileUrl;
        if (!data.linkPdf) { showAlert('Pilih file PDF (atau foto dokumen), atau isi link PDF. Dokumen wajib ada.', 'warning'); return; }
        toggleLoading(true, rowId ? 'Menyimpan perubahan...' : 'Memublikasikan...');
        let res;
        if (rowId) { data.rowId = rowId; res = await callApi('apiUpdatePeraturan', [data]); }
        else res = await callApi('apiSimpanPeraturan', [data]);
        if (res.success) {
            toast(rowId ? 'Perubahan dokumen hukum disimpan.' : 'Dokumen hukum dipublikasikan.');
            if (rowId) nav('daftarPeraturan'); else resetFormPeraturan();
        } else showAlert(res.message, 'error');
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

// Ubah data: formulir yang sama dipakai ulang dalam mode edit
function editData(jenis, rowId) {
    if (jenis === 'Masuk') {
        const r = byRow.masuk[rowId]; if (!r) return;
        nav('suratMasuk', { keep: true });
        resetFormMasuk();
        $('sm-rowid').value = rowId;
        $('sm-tglterima').value = r.tglTerimaIso || '';
        $('sm-tglsurat').value = r.tglSuratIso || '';
        $('sm-no').value = r.noSurat; $('sm-asal').value = r.asalSurat; $('sm-perihal').value = r.perihal;
        $('sm-sifat').value = r.sifat || 'Biasa'; $('sm-lampiran').value = r.lampiran;
        $('sm-disposisi').value = r.disposisi; $('sm-ket').value = r.keterangan; $('sm-link').value = r.linkDoc || '';
        setUploadCurrent('sm', r.linkDoc);
        setFormMode('sm', 'Ubah surat masuk', 'No. agenda ' + r.idSurat + '. Kosongkan pilihan file jika dokumen tidak diganti.', 'Simpan perubahan', true);
    } else if (jenis === 'Keluar') {
        const r = byRow.keluar[rowId]; if (!r) return;
        nav('suratKeluar', { keep: true });
        resetFormKeluar();
        $('sk-rowid').value = rowId;
        $('sk-tgl').value = r.tglSuratIso || '';
        $('sk-no').value = r.noSuratKeluar; $('sk-tujuan').value = r.tujuan; $('sk-perihal').value = r.perihal;
        $('sk-sifat').value = r.sifat || 'Biasa'; $('sk-lampiran').value = r.lampiran; $('sk-ttd').value = r.penandatangan;
        $('sk-tembusan').value = r.tembusan; $('sk-ket').value = r.keterangan; $('sk-link').value = r.linkDoc || '';
        setUploadCurrent('sk', r.linkDoc);
        setFormMode('sk', 'Ubah surat keluar', 'No. urut ' + r.noUrut + '. Kosongkan pilihan file jika dokumen tidak diganti.', 'Simpan perubahan', true);
    } else {
        const r = byRow.peraturan[rowId]; if (!r) return;
        nav('inputPeraturan', { keep: true });
        resetFormPeraturan();
        $('prt-rowid').value = rowId;
        $('prt-kategori').value = r.kategori; $('prt-no').value = r.nomor; $('prt-tahun').value = r.tahun;
        $('prt-tentang').value = r.tentang; $('prt-tempat').value = r.tempat;
        $('prt-tglpenetapan').value = r.tglPenetapanIso || ''; $('prt-tglpengundangan').value = r.tglPengundanganIso || '';
        $('prt-sumber').value = r.sumber; $('prt-status').value = r.status || 'Berlaku';
        $('prt-subjek').value = r.subjek; $('prt-ket').value = r.keterangan; $('prt-link').value = r.linkPdf || '';
        setUploadCurrent('prt', r.linkPdf);
        setFormMode('prt', 'Ubah dokumen hukum', 'Kosongkan pilihan file jika PDF tidak diganti.', 'Simpan perubahan', true);
    }
}

async function hapusData(jenis, rowId) {
    const yakin = await showConfirm(
        `Data ${jenis} ini akan dihapus secara permanen.\n\nDokumen yang diunggah ke Google Drive juga akan dipindahkan ke Sampah Drive.`,
        { type: 'danger', okText: 'Ya, hapus', cancelText: 'Batal' }
    );
    if (!yakin) return;
    toggleLoading(true, 'Menghapus data dan dokumen di Drive...');
    try {
        const res = await callApi('apiHapusData', [jenis, rowId], 60000);
        if (res.success) {
            loadDaftar(jenis === 'Masuk' ? 'masuk' : jenis === 'Keluar' ? 'keluar' : 'peraturan');
            toast('Data dihapus.');
            if (res.file === 'external') showAlert('Data dihapus. Dokumen TIDAK ikut dihapus dari Drive karena bukan file hasil upload aplikasi (link eksternal).', 'info');
            else if (res.file === 'missing') showAlert('Data dihapus. Dokumen di Drive sudah tidak ditemukan (mungkin sudah dihapus sebelumnya).', 'info');
        } else {
            showAlert('Gagal menghapus: ' + res.message, 'error');
        }
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

// ==========================================
// PORTAL PUBLIK JDIH
// ==========================================
async function loadPeraturanPublik() {
    $('tbody-publik').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">Memuat dokumen...</td></tr>';
    $('cards-publik').innerHTML = '<div style="text-align:center;padding:2rem 1rem;color:var(--muted)">Memuat dokumen...</div>';
    try {
        state.publik = await callApi('apiGetDaftarPeraturan');
        const jenis = [...new Set(state.publik.map(r => r.kategori).filter(Boolean))].sort();
        const tahun = [...new Set(state.publik.map(r => String(r.tahun)).filter(Boolean))].sort().reverse();
        fillSelect('pub-jenis', 'Semua jenis', jenis.map(j => ({ v: j, l: j })));
        fillSelect('pub-tahun', 'Semua tahun', tahun.map(t => ({ v: t, l: t })));
        renderPublik();
    } catch (err) {
        const msg = 'Gagal memuat dokumen: ' + err.message;
        $('tbody-publik').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger)">${esc(msg)}</td></tr>`;
        $('cards-publik').innerHTML = `<div style="text-align:center;padding:2rem 1rem;color:var(--danger)">${esc(msg)}</div>`;
        $('count-publik').textContent = '';
    }
}

function renderPublik() {
    const j = $('pub-jenis').value, t = $('pub-tahun').value, q = $('pub-q').value.trim().toLowerCase();
    const rows = state.publik.filter(r =>
        (!j || r.kategori === j) && (!t || String(r.tahun) === t) &&
        (!q || [r.kategori, r.nomor, r.tahun, r.tentang, r.subjek, r.keterangan].join(' ').toLowerCase().includes(q)));
    $('count-publik').innerHTML = `Menampilkan <strong>${rows.length}</strong> dari ${state.publik.length} dokumen`;

    if (!rows.length) {
        const html = `<div class="empty"><i class="far fa-folder-open"></i><strong>${state.publik.length ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen'}</strong><br>${state.publik.length ? 'Coba kata kunci, jenis, atau tahun yang lain.' : 'Dokumen hukum yang dipublikasikan akan tampil di sini.'}</div>`;
        $('tbody-publik').innerHTML = `<tr><td colspan="6">${html}</td></tr>`;
        $('cards-publik').innerHTML = html;
        return;
    }
    $('tbody-publik').innerHTML = rows.map(r => `
        <tr>
            <td><span class="badge badge-mod">${esc(r.kategori)}</span></td>
            <td class="strong" style="white-space:nowrap">${esc(r.nomor)} / ${esc(r.tahun)}</td>
            <td><div>${esc(r.tentang)}</div>${r.subjek ? '<div class="sub">Subjek: ' + esc(r.subjek) + '</div>' : ''}</td>
            <td>${esc(tglPenetapanText(r)) || '<span class="text-slate-400">–</span>'}</td>
            <td>${statusBadge(r.status)}</td>
            <td class="c">${safeUrl(r.linkPdf) ? `<a class="doc-link" href="${safeUrl(r.linkPdf)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-pdf"></i> Buka PDF</a>` : '–'}</td>
        </tr>`).join('');
    $('cards-publik').innerHTML = rows.map(r => `
        <div class="item-card">
            <div class="item-top"><span class="badge badge-mod">${esc(r.kategori)}</span>${statusBadge(r.status)}</div>
            <div class="item-title">Nomor ${esc(r.nomor)} Tahun ${esc(r.tahun)}</div>
            <div class="item-sub">${esc(r.tentang)}</div>
            ${tglPenetapanText(r) || r.subjek ? `<div class="item-meta">
                ${tglPenetapanText(r) ? '<span class="badge badge-gray"><i class="far fa-calendar"></i> ' + esc(tglPenetapanText(r)) + '</span>' : ''}
                ${r.subjek ? '<span class="badge badge-gray"><i class="fas fa-tag"></i> ' + esc(r.subjek) + '</span>' : ''}</div>` : ''}
            ${safeUrl(r.linkPdf) ? `<div class="item-actions"><a class="doc-link" style="flex:1;justify-content:center" href="${safeUrl(r.linkPdf)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-pdf"></i> Buka PDF</a></div>` : ''}
        </div>`).join('');
}

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
// PENGATURAN LAPORAN (kop & tanda tangan)
// ==========================================
const LAPORAN_DEFAULT = { namaInstansi: 'PEMERINTAH KABUPATEN PULAU TALIABU', namaUnit: '', alamat: '', kota: '', jabatan: '', namaPejabat: '', nip: '', logoUrl: '' };

async function getLaporanSettings() {
    if (state.laporan) return state.laporan;
    try { state.laporan = Object.assign({}, LAPORAN_DEFAULT, await callApi('apiGetPengaturanLaporan')); }
    catch (err) { if (err.handled) throw err; return Object.assign({}, LAPORAN_DEFAULT); }
    return state.laporan;
}

async function loadPengaturan() {
    state.laporan = null; // selalu ambil data terbaru
    try {
        const s = await getLaporanSettings();
        $('set-instansi').value = s.namaInstansi; $('set-unit').value = s.namaUnit; $('set-alamat').value = s.alamat;
        $('set-logo').value = s.logoUrl; $('set-kota').value = s.kota; $('set-jabatan').value = s.jabatan;
        $('set-pejabat').value = s.namaPejabat; $('set-nip').value = s.nip;
    } catch (err) { showError(err); }
}

async function submitPengaturan() {
    const data = {
        namaInstansi: val('set-instansi'), namaUnit: val('set-unit'), alamat: val('set-alamat'), logoUrl: val('set-logo'),
        kota: val('set-kota'), jabatan: val('set-jabatan'), namaPejabat: val('set-pejabat'), nip: val('set-nip')
    };
    toggleLoading(true, 'Menyimpan pengaturan...');
    try {
        const res = await callApi('apiSimpanPengaturanLaporan', [data]);
        if (res.success) { state.laporan = null; toast(res.message); }
        else showAlert(res.message, 'error');
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

// ==========================================
// CETAK LAPORAN (pratinjau + cetak / simpan PDF)
// ==========================================
const REPORTS = {
    masuk: {
        judul: 'Laporan Rekapitulasi Surat Masuk', satuan: 'surat',
        cols: [['No', 4, 'c'], ['No. Agenda', 7], ['Tgl Diterima', 8, 'c'], ['Tgl Surat', 8, 'c'], ['Nomor Surat', 14], ['Asal Surat', 14],
               ['Perihal', 22], ['Sifat', 6, 'c'], ['Disposisi', 10], ['Keterangan', 7]],
        sort: (a, b) => (a.tglTerimaIso || '').localeCompare(b.tglTerimaIso || '') || a.rowId - b.rowId,
        map: (r, i) => [i + 1, r.idSurat, tglTampil(r.tglTerimaIso, r.tglTerima), tglTampil(r.tglSuratIso, r.tglSurat), r.noSurat, r.asalSurat,
                        r.perihal + (r.lampiran ? '\nLampiran: ' + r.lampiran : ''), r.sifat, r.disposisi, r.keterangan]
    },
    keluar: {
        judul: 'Laporan Rekapitulasi Surat Keluar', satuan: 'surat',
        cols: [['No', 4, 'c'], ['Tgl Surat', 9, 'c'], ['Nomor Surat', 17], ['Tujuan', 17], ['Perihal', 25], ['Sifat', 6, 'c'],
               ['Penandatangan', 12], ['Keterangan', 10]],
        sort: (a, b) => (a.tglSuratIso || '').localeCompare(b.tglSuratIso || '') || a.rowId - b.rowId,
        map: (r, i) => [i + 1, tglTampil(r.tglSuratIso, r.tglSurat), r.noSuratKeluar, r.tujuan,
                        r.perihal + (r.lampiran ? '\nLampiran: ' + r.lampiran : ''), r.sifat, r.penandatangan, r.keterangan]
    },
    peraturan: {
        judul: 'Laporan Daftar Dokumen Hukum (JDIH)', satuan: 'dokumen',
        cols: [['No', 4, 'c'], ['Jenis Peraturan', 13], ['Nomor', 6, 'c'], ['Tahun', 6, 'c'], ['Tentang', 31], ['Tgl Penetapan', 9, 'c'],
               ['Tgl Pengundangan', 9, 'c'], ['Subjek', 12], ['Status', 10, 'c']],
        sort: (a, b) => a.kategori.localeCompare(b.kategori) || String(a.tahun).localeCompare(String(b.tahun)) ||
                        (parseInt(a.nomor, 10) || 0) - (parseInt(b.nomor, 10) || 0),
        map: (r, i) => [i + 1, r.kategori, r.nomor, r.tahun, r.tentang, tglTampil(r.tglPenetapanIso, r.tglPenetapan),
                        tglTampil(r.tglPengundanganIso, r.tglPengundangan), r.subjek, r.status]
    }
};

const LAPORAN_CSS = `
@page { size: A4 landscape; margin: 14mm 12mm 16mm 12mm; @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font: 8pt "Times New Roman", serif; color: #444; } }
* { box-sizing: border-box; }
body { margin: 0; background: #e5e7eb; color: #000; font-family: "Times New Roman", Times, serif; font-size: 11pt; }
.sheet { width: 297mm; min-height: 210mm; margin: 0 auto; background: #fff; padding: 14mm 12mm; }
.kop { display: flex; align-items: center; justify-content: center; gap: 14px; text-align: center; }
.kop .logo { width: 22mm; height: 22mm; object-fit: contain; }
.k1 { font-size: 15pt; font-weight: bold; letter-spacing: .3px; }
.k2 { font-size: 13pt; font-weight: bold; }
.k3 { font-size: 9.5pt; margin-top: 2px; }
.rule { border: 0; border-top: 2.5px solid #000; border-bottom: .75px solid #000; height: 3px; margin: 8px 0 12px; }
h1 { margin: 6px 0 2px; text-align: center; font-size: 13.5pt; text-transform: uppercase; letter-spacing: .4px; }
.periode { text-align: center; font-size: 11pt; margin-bottom: 10px; }
.info { font-size: 10pt; margin-bottom: 8px; }
.info div { display: flex; }
.info span:first-child { width: 28mm; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th, td { border: .6pt solid #000; padding: 3.5px 5px; vertical-align: top; word-wrap: break-word; }
th { background: #e6e6e6; text-align: center; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
td.c { text-align: center; }
.ttd { margin: 18px 0 0 auto; width: 80mm; text-align: center; font-size: 10.5pt; page-break-inside: avoid; }
.ttd .sp { height: 22mm; }
.ttd .nm { font-weight: bold; text-decoration: underline; }
.catatan { font-size: 9pt; margin-top: 10px; color: #333; }
.foot { display: none; }
.bar { position: sticky; top: 0; z-index: 5; background: #0f2a43; padding: 8px 12px; text-align: right; }
.bar button { font: 600 14px/1 Arial, sans-serif; background: #d9a441; color: #0f2a43; border: 0; border-radius: 8px; padding: 11px 16px; cursor: pointer; }
@media print {
  body { background: #fff; }
  .sheet { width: auto; min-height: 0; padding: 0; margin: 0; }
  .no-print { display: none !important; }
  .foot { display: block; position: fixed; left: 0; bottom: -11mm; font-size: 8pt; color: #444; }
}`;

function buildLaporan(kind, rows, cfg, standalone) {
    const R = REPORTS[kind];
    const sorted = rows.slice().sort(R.sort);
    const periode = periodeOf(kind);
    const q = $(LIST[kind].q).value.trim();

    const logo = safeUrl(cfg.logoUrl) ? `<img class="logo" src="${safeUrl(cfg.logoUrl)}" alt="">` : '';
    const kop = [
        cfg.namaInstansi && `<div class="k1">${esc(cfg.namaInstansi)}</div>`,
        cfg.namaUnit && `<div class="k2">${esc(cfg.namaUnit)}</div>`,
        cfg.alamat && `<div class="k3">${esc(cfg.alamat)}</div>`
    ].filter(Boolean).join('');

    const head = R.cols.map(c => `<th style="width:${c[1]}%">${esc(c[0])}</th>`).join('');
    const body = sorted.map((r, i) => '<tr>' + R.map(r, i).map((v, ci) =>
        `<td${R.cols[ci][2] === 'c' ? ' class="c"' : ''}>${escBr(v)}</td>`).join('') + '</tr>').join('');

    let ringkasan = '';
    if (kind === 'peraturan') {
        const per = {};
        sorted.forEach(r => { per[r.kategori] = (per[r.kategori] || 0) + 1; });
        ringkasan = '<div class="catatan"><strong>Rekapitulasi per jenis:</strong> ' +
            Object.keys(per).map(k => esc(k) + ' (' + per[k] + ')').join('; ') + '.</div>';
    }

    const tgl = fmtTglPanjang(todayIso());
    const ttd = `<div class="ttd">
        <div>${cfg.kota ? esc(cfg.kota) + ', ' : ''}${tgl}</div>
        <div>${cfg.jabatan ? esc(cfg.jabatan) + ',' : '&nbsp;'}</div>
        <div class="sp"></div>
        <div class="nm">${cfg.namaPejabat ? esc(cfg.namaPejabat) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</div>
        ${cfg.nip ? '<div>NIP. ' + esc(cfg.nip) + '</div>' : ''}
    </div>`;

    const toolbar = standalone ? '<div class="bar no-print"><button onclick="window.print()">Cetak / simpan PDF</button></div>' : '';
    const title = R.judul + ' - ' + periode;

    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=1123">
<title>${esc(title)}</title><style>${LAPORAN_CSS}</style></head><body>
${toolbar}
<div class="sheet">
    <div class="kop">${logo}<div>${kop}</div></div>
    <hr class="rule">
    <h1>${esc(R.judul)}</h1>
    <div class="periode">${kind === 'peraturan' ? esc(periode) : 'Periode: ' + esc(periode)}</div>
    <div class="info">
        <div><span>Jumlah</span><span>: ${sorted.length} ${R.satuan}</span></div>
        ${q ? '<div><span>Kata pencarian</span><span>: ' + esc(q) + '</span></div>' : ''}
        <div><span>Dicetak</span><span>: ${tgl}</span></div>
    </div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    ${ringkasan}
    ${ttd}
    <div class="foot">${esc(cfg.namaInstansi || 'E-Surat & JDIH')} · ${esc(R.judul)} · dicetak ${tgl}</div>
</div></body></html>`;
}

async function cetakLaporan(kind) {
    const rows = getFiltered(kind);
    if (!rows.length) { showAlert('Tidak ada data pada filter yang dipilih untuk dicetak.', 'warning'); return; }
    toggleLoading(true, 'Menyiapkan laporan...');
    try {
        const cfg = await getLaporanSettings();
        state.report = { preview: buildLaporan(kind, rows, cfg, false), standalone: buildLaporan(kind, rows, cfg, true) };
        openPreview(REPORTS[kind].judul);
    } catch (err) { showError(err); }
    finally { toggleLoading(false); }
}

function openPreview(title) {
    $('preview-title').textContent = title;
    $('preview-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    $('preview-frame').srcdoc = state.report.preview;
    fitPreview();
}

function fitPreview() {
    const wrap = $('preview-wrap'), fr = $('preview-frame');
    const W = 1123;
    const s = Math.min(1, wrap.clientWidth / W);
    fr.style.width = W + 'px';
    fr.style.height = Math.ceil(wrap.clientHeight / s) + 'px';
    fr.style.transform = s < 1 ? 'scale(' + s + ')' : 'none';
    fr.style.margin = s < 1 ? '0' : '0 auto';
}

function closePreview() {
    $('preview-overlay').classList.add('hidden');
    $('preview-frame').srcdoc = '';
    document.body.style.overflow = '';
}

function printPreview() {
    const w = $('preview-frame').contentWindow;
    w.focus();
    w.print();
}

function openPreviewTab() {
    if (!state.report) return;
    const url = URL.createObjectURL(new Blob([state.report.standalone], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
}
