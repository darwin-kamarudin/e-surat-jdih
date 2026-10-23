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
    loadIdentitasPublik();
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

