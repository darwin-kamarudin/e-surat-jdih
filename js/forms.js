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

