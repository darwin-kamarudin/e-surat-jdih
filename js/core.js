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
// Sumber gambar untuk <img>: URL https atau data URL (logo hasil unggah)
const safeImgSrc = (u) => /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(u || '') ? esc(u) : '';

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

