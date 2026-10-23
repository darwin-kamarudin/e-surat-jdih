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

