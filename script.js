// ======================= CONFIGURATION =======================
// 🔴 REPLACE WITH YOUR ACTUAL GOOGLE APPS SCRIPT WEB APP URL 🔴
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxAtwwPznCDLyF47g96jKAG3IDRuXkMjPkGMkILwfnhaBohxOgPJJ-L2Y4HO1Hrl_2myQ/exec";
// =============================================================

// Global state
let currentPage = 'dashboard';
let customers = [];
let policies = [];
let chartInstance = null;

// Helper: Check if URL is configured
function isUrlConfigured() {
    return APPS_SCRIPT_URL && APPS_SCRIPT_URL !== "--" && APPS_SCRIPT_URL.startsWith("http");
}

// Show loading spinner
function showLoadingSpinner() {
    document.getElementById('dynamicContent').innerHTML = `
        <div class="loading-overlay">
            <div class="spinner"></div>
            <p>Loading ${currentPage}...</p>
        </div>
    `;
}

// Toast notification
function showToast(message, type = 'success') {
    const container = document.querySelector('.toast-container');
    if (!container) {
        const div = document.createElement('div');
        div.className = 'toast-container';
        document.body.appendChild(div);
    }
    const toastContainer = document.querySelector('.toast-container');
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-white bg-${type} border-0 mb-2`;
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    toastContainer.appendChild(toastEl);
    const bsToast = new bootstrap.Toast(toastEl, { delay: 3000 });
    bsToast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// API call to Google Apps Script
async function callAPI(path, method, params = {}) {
    if (!isUrlConfigured()) {
        throw new Error('Google Apps Script URL not configured. Please edit script.js and set APPS_SCRIPT_URL.');
    }
    try {
        const url = new URL(APPS_SCRIPT_URL);
        url.searchParams.append('path', path);
        url.searchParams.append('method', method);
        for (let key in params) {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        }
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    } catch (err) {
        console.error('API call failed:', err);
        throw new Error(err.message || 'Network error');
    }
}

// Show setup guide if URL not configured
function showSetupGuide() {
    document.getElementById('dynamicContent').innerHTML = `
        <div class="setup-guide">
            <h4><i class="fas fa-exclamation-triangle"></i> Google Sheets Backend Not Configured</h4>
            <p>You need to deploy the Apps Script backend and set the URL in <code>script.js</code>.</p>
            <hr>
            <h6>📋 Step-by-Step Setup:</h6>
            <ol>
                <li>Create a Google Sheet with two sheets: <code>customers</code> and <code>policies</code>.</li>
                <li>In <code>customers</code>, columns: <strong>id, name, mobile, vehicle_number</strong></li>
                <li>In <code>policies</code>, columns: <strong>id, customer_id, policy_number, expiry_date, price</strong></li>
                <li>Open <strong>Extensions → Apps Script</strong>, paste the backend code.</li>
                <li>Deploy as <strong>Web App</strong> (Execute as: Me, Access: Anyone). Copy URL.</li>
                <li>Replace <code>https://script.google.com/macros/s/AKfycbxAtwwPznCDLyF47g96jKAG3IDRuXkMjPkGMkILwfnhaBohxOgPJJ-L2Y4HO1Hrl_2myQ/exec</code> with that URL in <code>script.js</code>.</li>
                <li>Refresh this page.</li>
            </ol>
        </div>
    `;
}

// Load all data
async function loadAllData() {
    if (!isUrlConfigured()) {
        showSetupGuide();
        return;
    }
    showLoadingSpinner();
    try {
        const [custData, polData] = await Promise.all([
            callAPI('customers', 'GET'),
            callAPI('policies', 'GET')
        ]);
        customers = custData.customers || [];
        policies = polData.policies || [];
        await renderCurrentPage();
    } catch (err) {
        document.getElementById('dynamicContent').innerHTML = `<div class="alert alert-danger">Failed to load data: ${err.message}</div>`;
    }
}

// Render current page
async function renderCurrentPage() {
    if (currentPage === 'dashboard') await renderDashboard();
    else if (currentPage === 'customers') renderCustomers();
    else if (currentPage === 'policies') renderPolicies();
    else if (currentPage === 'search') renderSearch();
    else if (currentPage === 'reminders') await renderReminders();

    document.querySelectorAll('.nav-item').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === currentPage) link.classList.add('active');
    });
    const titles = { dashboard: 'Dashboard', customers: 'Customers', policies: 'Policies', search: 'Search', reminders: 'Reminders' };
    document.getElementById('pageTitle').innerText = titles[currentPage];
}

// ==================== DASHBOARD ====================
async function renderDashboard() {
    try {
        const stats = await callAPI('dashboard-stats', 'GET');
        const html = `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-file-contract"></i></div><h3>${stats.totalPolicies}</h3><p>Total Policies</p></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><h3>${stats.activePolicies}</h3><p>Active Policies</p></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-hourglass-half"></i></div><h3>${stats.expiringSoon}</h3><p>Expiring in 30 days</p></div>
                <div class="stat-card"><div class="stat-icon"><i class="fas fa-rupee-sign"></i></div><h3>₹${stats.totalEarnings.toLocaleString()}</h3><p>Total Earnings</p></div>
            </div>
            <div class="row g-4">
                <div class="col-md-6"><canvas id="policyChart" height="250"></canvas></div>
                <div class="col-md-6"><div class="stat-card"><h5>⚠️ Expiring Soon</h5><ul class="reminder-list" id="expiringList"></ul></div></div>
            </div>
            <div class="stat-card mt-4"><h5>📋 Recently Added Policies</h5><div id="recentPolicies"></div></div>
        `;
        document.getElementById('dynamicContent').innerHTML = html;

        if (chartInstance) chartInstance.destroy();
        const ctx = document.getElementById('policyChart')?.getContext('2d');
        if (ctx) {
            chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['Active', 'Expired'], datasets: [{ data: [stats.activePolicies, stats.expiredPolicies], backgroundColor: ['#ff7b2c', '#2c3e8f'] }] },
                options: { responsive: true, plugins: { legend: { labels: { color: 'white' } } } }
            });
        }
        const expiringList = stats.expiringSoonList || [];
        const ul = document.getElementById('expiringList');
        if (ul) ul.innerHTML = expiringList.map(p => `<li class="reminder-item">${p.policy_number} - ${p.customer_name} <span class="badge bg-warning">${p.expiry_date}</span></li>`).join('') || '<li>No expiring policies</li>';

        const recent = stats.recentPolicies || [];
        const recentDiv = document.getElementById('recentPolicies');
        if (recentDiv) recentDiv.innerHTML = `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Policy#</th><th>Customer</th><th>Expiry</th></tr></thead><tbody>${recent.map(p => `<tr><td>${p.policy_number}</td><td>${p.customer_name}</td><td>${p.expiry_date}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) {
        document.getElementById('dynamicContent').innerHTML = `<div class="alert alert-danger">Dashboard error: ${err.message}</div>`;
    }
}

// ==================== CUSTOMERS ====================
function renderCustomers() {
    let html = `<div class="d-flex justify-content-between align-items-center mb-4"><h3>All Customers</h3><button class="btn btn-primary" id="addCustomerBtn"><i class="fas fa-plus"></i> New Customer</button></div>
    <div class="table-wrapper"><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Vehicle</th><th>Policies</th><th>Actions</th></tr></thead><tbody>`;
    customers.forEach(c => {
        const policyCount = policies.filter(p => p.customer_id == c.id).length;
        html += `<tr><td>${c.id}</td><td>${escapeHtml(c.name)}</td><td>${c.mobile}</td><td>${c.vehicle_number || '-'}</td><td>${policyCount}</td>
        <td><button class="btn btn-sm btn-outline-primary edit-customer" data-id="${c.id}"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline-danger delete-customer" data-id="${c.id}"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    html += `</tbody></table></div>`;
    document.getElementById('dynamicContent').innerHTML = html;

    document.getElementById('addCustomerBtn')?.addEventListener('click', () => openCustomerModal());
    document.querySelectorAll('.edit-customer').forEach(btn => btn.addEventListener('click', () => openCustomerModal(btn.dataset.id)));
    document.querySelectorAll('.delete-customer').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('Delete customer? All linked policies will also be removed.')) {
            await callAPI('customers', 'DELETE', { id: btn.dataset.id });
            await loadAllData();
            showToast('Customer deleted');
        }
    }));
}

// ==================== POLICIES ====================
function renderPolicies() {
    let html = `<div class="d-flex justify-content-between align-items-center mb-4"><h3>RSA Policies</h3><button class="btn btn-primary" id="addPolicyBtn"><i class="fas fa-plus"></i> New Policy</button></div>
    <div class="table-wrapper"><table class="data-table"><thead><tr><th>Policy#</th><th>Customer</th><th>Vehicle</th><th>Expiry</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
    policies.forEach(p => {
        const cust = customers.find(c => c.id == p.customer_id);
        const today = new Date().toISOString().slice(0,10);
        const status = p.expiry_date < today ? '<span class="badge bg-danger">Expired</span>' : '<span class="badge bg-success">Active</span>';
        html += `<tr><td>${p.policy_number}</td><td>${cust?.name || 'N/A'}</td><td>${cust?.vehicle_number || '-'}</td><td>${p.expiry_date}</td><td>₹${p.price}</td><td>${status}</td>
        <td><button class="btn btn-sm btn-warning renew-policy" data-id="${p.id}" data-expiry="${p.expiry_date}"><i class="fas fa-sync-alt"></i> Renew</button>
        <button class="btn btn-sm btn-primary edit-policy" data-id="${p.id}"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger delete-policy" data-id="${p.id}"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    html += `</tbody></table></div>`;
    document.getElementById('dynamicContent').innerHTML = html;

    document.getElementById('addPolicyBtn')?.addEventListener('click', () => openPolicyModal());
    document.querySelectorAll('.edit-policy').forEach(btn => btn.addEventListener('click', () => openPolicyModal(btn.dataset.id)));
    document.querySelectorAll('.delete-policy').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('Delete policy?')) {
            await callAPI('policies', 'DELETE', { id: btn.dataset.id });
            await loadAllData();
            showToast('Policy deleted');
        }
    }));
    document.querySelectorAll('.renew-policy').forEach(btn => btn.addEventListener('click', () => openRenewModal(btn.dataset.id, btn.dataset.expiry)));
}

// ==================== SEARCH ====================
function renderSearch() {
    const html = `<div class="search-card"><h5><i class="fas fa-search"></i> Search Policies & Customers</h5><div class="row g-3 mt-2"><div class="col-md-4"><select id="searchType" class="form-select"><option value="mobile">Mobile Number</option><option value="vehicle">Vehicle Number</option><option value="policy">Policy Number</option></select></div>
    <div class="col-md-6"><input type="text" id="searchQuery" class="form-control" placeholder="Enter search term..."></div><div class="col-md-2"><button id="doSearch" class="btn btn-primary w-100">Search</button></div></div><div id="searchResults" class="mt-4"></div></div>`;
    document.getElementById('dynamicContent').innerHTML = html;
    document.getElementById('doSearch').addEventListener('click', async () => {
        const type = document.getElementById('searchType').value;
        const query = document.getElementById('searchQuery').value.trim();
        if (!query) return showToast('Enter search term', 'warning');
        try {
            const res = await callAPI('search', 'GET', { type, q: query });
            let resultHtml = `<h6>Results (${res.results.length})</h6>`;
            if (res.results.length === 0) resultHtml += '<div class="alert alert-info">No records found</div>';
            else resultHtml += `<div class="list-group">${res.results.map(r => `<div class="list-group-item search-highlight"><strong>${r.type}</strong><br>${r.detail}</div>`).join('')}</div>`;
            document.getElementById('searchResults').innerHTML = resultHtml;
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

// ==================== REMINDERS ====================
async function renderReminders() {
    try {
        const stats = await callAPI('dashboard-stats', 'GET');
        const expiring = stats.expiringSoonList || [];
        let html = `<div class="search-card"><h5><i class="fas fa-bell"></i> Expiry Alerts & Reminders</h5><p class="text-muted">Policies expiring within 30 days. Optional upgrade: SMS/WhatsApp (simulated demo)</p><ul class="reminder-list">`;
        if (expiring.length === 0) html += `<li class="reminder-item">No policies expiring soon 🎉</li>`;
        expiring.forEach(p => {
            html += `<li class="reminder-item d-flex justify-content-between">${p.policy_number} - ${p.customer_name} (Exp: ${p.expiry_date}) <button class="btn btn-sm btn-outline-warning sendReminderBtn" data-mobile="${p.mobile}" data-name="${p.customer_name}"><i class="fab fa-whatsapp"></i> Demo Alert</button></li>`;
        });
        html += `</ul></div>`;
        document.getElementById('dynamicContent').innerHTML = html;
        document.querySelectorAll('.sendReminderBtn').forEach(btn => {
            btn.addEventListener('click', () => showToast(`📱 Demo reminder sent to ${btn.dataset.name} (${btn.dataset.mobile})`, 'info'));
        });
    } catch (err) {
        document.getElementById('dynamicContent').innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
}

// ==================== MODAL HANDLERS ====================
function openCustomerModal(id = null) {
    if (id) {
        const cust = customers.find(c => c.id == id);
        if (cust) {
            document.getElementById('customerId').value = cust.id;
            document.getElementById('custName').value = cust.name;
            document.getElementById('custMobile').value = cust.mobile;
            document.getElementById('custVehicle').value = cust.vehicle_number || '';
        }
    } else {
        document.getElementById('customerId').value = '';
        document.getElementById('custName').value = '';
        document.getElementById('custMobile').value = '';
        document.getElementById('custVehicle').value = '';
    }
    new bootstrap.Modal(document.getElementById('customerModal')).show();
}

async function openPolicyModal(id = null) {
    const select = document.getElementById('policyCustomerId');
    select.innerHTML = '<option value="">Select Customer</option>' + customers.map(c => `<option value="${c.id}">${c.name} (${c.mobile})</option>`).join('');
    if (id) {
        const policy = policies.find(p => p.id == id);
        if (policy) {
            document.getElementById('policyId').value = policy.id;
            document.getElementById('policyNumber').value = policy.policy_number;
            document.getElementById('policyExpiry').value = policy.expiry_date;
            document.getElementById('policyPrice').value = policy.price;
            document.getElementById('policyCustomerId').value = policy.customer_id;
        }
    } else {
        document.getElementById('policyId').value = '';
        document.getElementById('policyNumber').value = '';
        document.getElementById('policyExpiry').value = '';
        document.getElementById('policyPrice').value = '1499';
        document.getElementById('policyCustomerId').value = '';
    }
    new bootstrap.Modal(document.getElementById('policyModal')).show();
}

function openRenewModal(policyId, currentExpiry) {
    document.getElementById('renewPolicyId').value = policyId;
    document.getElementById('currentExpiry').innerText = currentExpiry;
    let nextYear = new Date(currentExpiry);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    document.getElementById('newExpiryDate').value = nextYear.toISOString().slice(0, 10);
    new bootstrap.Modal(document.getElementById('renewModal')).show();
}

// Save customer
document.getElementById('saveCustomerBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('customerId').value;
    const payload = {
        name: document.getElementById('custName').value,
        mobile: document.getElementById('custMobile').value,
        vehicle_number: document.getElementById('custVehicle').value
    };
    if (!payload.name || !payload.mobile) return showToast('Name and Mobile are required', 'danger');
    try {
        if (id) await callAPI('customers', 'PUT', { id, ...payload });
        else await callAPI('customers', 'POST', payload);
        bootstrap.Modal.getInstance(document.getElementById('customerModal')).hide();
        await loadAllData();
        showToast('Customer saved');
    } catch (err) { showToast(err.message, 'danger'); }
});

// Save policy
document.getElementById('savePolicyBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('policyId').value;
    const payload = {
        customer_id: document.getElementById('policyCustomerId').value,
        policy_number: document.getElementById('policyNumber').value,
        expiry_date: document.getElementById('policyExpiry').value,
        price: document.getElementById('policyPrice').value
    };
    if (!payload.customer_id) return showToast('Select a customer', 'danger');
    if (!payload.policy_number) return showToast('Policy number required', 'danger');
    try {
        if (id) await callAPI('policies', 'PUT', { id, ...payload });
        else await callAPI('policies', 'POST', payload);
        bootstrap.Modal.getInstance(document.getElementById('policyModal')).hide();
        await loadAllData();
        showToast('Policy saved');
    } catch (err) { showToast(err.message, 'danger'); }
});

// Renew policy
document.getElementById('confirmRenewBtn')?.addEventListener('click', async () => {
    const policyId = document.getElementById('renewPolicyId').value;
    const newExpiry = document.getElementById('newExpiryDate').value;
    if (!newExpiry) return showToast('Select new expiry date', 'warning');
    try {
        await callAPI('renew', 'POST', { id: policyId, new_expiry: newExpiry });
        bootstrap.Modal.getInstance(document.getElementById('renewModal')).hide();
        await loadAllData();
        showToast('Policy renewed!', 'success');
    } catch (err) { showToast(err.message, 'danger'); }
});

// Helper: escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== INIT & NAVIGATION ====================
document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const newPage = link.getAttribute('data-page');
            if (newPage === currentPage) return;
            currentPage = newPage;
            loadAllData();
        });
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Logout?')) {
            sessionStorage.removeItem('loggedIn');
            location.reload();
        }
    });
    document.getElementById('liveDate').innerText = new Date().toLocaleDateString('en-IN');

    // Login check
    if (!sessionStorage.getItem('loggedIn')) {
        let pwd = prompt("Admin Login - Enter Password:");
        if (pwd === 'admin123') {
            sessionStorage.setItem('loggedIn', 'true');
        } else {
            document.body.innerHTML = '<div class="alert alert-danger m-5 text-center">Access Denied. Invalid Password.</div>';
            throw new Error('Unauthorized');
        }
    }
    loadAllData();
});