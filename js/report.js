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

    const logoSrc = safeImgSrc(cfg.logoData || cfg.logoUrl);
    const logo = logoSrc ? `<img class="logo" src="${logoSrc}" alt="">` : '';
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