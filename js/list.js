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

