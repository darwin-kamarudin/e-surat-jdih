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


// ---------- Judul kecil header publik = nama INSTANSI KERJA (bukan instansi induk) ----------
const IDENTITAS_KEY = 'identitasPublikV1';
let pubInstansiBawaan = null; // teks bawaan di index.html, dipakai bila instansi kerja belum diisi

function terapkanIdentitasPublik(instansiKerja) {
    const el = $('pub-instansi');
    if (pubInstansiBawaan === null) pubInstansiBawaan = el.textContent;
    el.textContent = String(instansiKerja || '').trim() || pubInstansiBawaan;
}

async function loadIdentitasPublik() {
    try { terapkanIdentitasPublik(localStorage.getItem(IDENTITAS_KEY)); } catch (e) { terapkanIdentitasPublik(''); }
    try {
        const d = await callApi('apiGetIdentitasPublik');
        const nama = String((d && d.instansiKerja) || '').trim();
        terapkanIdentitasPublik(nama);
        try { nama ? localStorage.setItem(IDENTITAS_KEY, nama) : localStorage.removeItem(IDENTITAS_KEY); } catch (e) { }
    } catch (e) { /* diam: header tetap memakai teks terakhir/bawaan */ }
}
