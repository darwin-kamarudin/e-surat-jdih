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

