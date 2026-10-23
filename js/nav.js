// ==========================================
// NAVIGASI (SPA)
// ==========================================
const TITLES = {
    dashboard: 'Beranda', suratMasuk: 'Catat surat masuk', suratKeluar: 'Catat surat keluar',
    daftarMasuk: 'Surat masuk', daftarKeluar: 'Surat keluar', inputPeraturan: 'Tambah dokumen hukum',
    daftarPeraturan: 'Dokumen hukum', pengguna: 'Pengguna & akses', pengaturan: 'Instansi & kop dokumen'
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

