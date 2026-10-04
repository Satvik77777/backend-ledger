/**
 * LedgerFlow Client Application
 * Production Single-Page Dashboard with Double-Entry Ledger Visualizer
 */

class LedgerFlowApp {
    constructor() {
        const storedBackend = localStorage.getItem('ledger_backend_url') 
            || window.LEDGER_CONFIG?.BACKEND_URL 
            || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : '');

        if (storedBackend) {
            this.apiBase = storedBackend.replace(/\/+$/, '') + '/api';
        } else {
            this.apiBase = '/api';
        }

        this.accessToken = localStorage.getItem('ledger_token') || null;
        this.refreshTokenValue = localStorage.getItem('ledger_refresh_token') || null;
        this.currentUser = null;
        this.accounts = [];
        this.transactions = [];
        this.currentStatementAccount = null;

        this.initElements();
        this.initEventListeners();
        this.checkApiHealth();
        this.checkAuth();
    }

    initElements() {
        // Nav & Auth
        this.navActions = document.getElementById('navActions');
        this.authSection = document.getElementById('authSection');
        this.dashboardSection = document.getElementById('dashboardSection');
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        this.tabLoginBtn = document.getElementById('tabLoginBtn');
        this.tabRegisterBtn = document.getElementById('tabRegisterBtn');
        this.demoUserLoginBtn = document.getElementById('demoUserLoginBtn');

        // Dashboard Metrics
        this.netBalanceValue = document.getElementById('netBalanceValue');
        this.activeAccountsCount = document.getElementById('activeAccountsCount');
        this.totalTransfersCount = document.getElementById('totalTransfersCount');
        this.accountsGrid = document.getElementById('accountsGrid');
        this.transactionsTableBody = document.getElementById('transactionsTableBody');
        this.refreshAccountsBtn = document.getElementById('refreshAccountsBtn');
        this.txFilterStatus = document.getElementById('txFilterStatus');

        // Transfer Modal
        this.transferModal = document.getElementById('transferModal');
        this.openTransferModalBtn = document.getElementById('openTransferModalBtn');
        this.closeTransferModalBtn = document.getElementById('closeTransferModalBtn');
        this.cancelTransferBtn = document.getElementById('cancelTransferBtn');
        this.transferForm = document.getElementById('transferForm');
        this.transferFromAccount = document.getElementById('transferFromAccount');
        this.transferToAccount = document.getElementById('transferToAccount');
        this.transferAmount = document.getElementById('transferAmount');
        this.transferIdempotencyKey = document.getElementById('transferIdempotencyKey');
        this.regenerateIdempKeyBtn = document.getElementById('regenerateIdempKeyBtn');
        this.fromAccountBalanceHint = document.getElementById('fromAccountBalanceHint');
        this.destinationQuickPicks = document.getElementById('destinationQuickPicks');

        // Create Account Modal
        this.createAccountModal = document.getElementById('createAccountModal');
        this.openNewAccountModalBtn = document.getElementById('openNewAccountModalBtn');
        this.closeCreateAccountModalBtn = document.getElementById('closeCreateAccountModalBtn');
        this.cancelCreateAccountBtn = document.getElementById('cancelCreateAccountBtn');
        this.createAccountForm = document.getElementById('createAccountForm');

        // Statement Drawer
        this.statementDrawer = document.getElementById('statementDrawer');
        this.closeStatementDrawerBtn = document.getElementById('closeStatementDrawerBtn');
        this.statementAccountMeta = document.getElementById('statementAccountMeta');
        this.statementBalanceValue = document.getElementById('statementBalanceValue');
        this.statementTableBody = document.getElementById('statementTableBody');

        // Toasts
        this.toastHub = document.getElementById('toastHub');
    }

    initEventListeners() {
        // Tab switching
        this.tabLoginBtn?.addEventListener('click', () => this.switchTab('login'));
        this.tabRegisterBtn?.addEventListener('click', () => this.switchTab('register'));

        // Forms
        this.loginForm?.addEventListener('submit', (e) => this.handleLogin(e));
        this.registerForm?.addEventListener('submit', (e) => this.handleRegister(e));
        this.demoUserLoginBtn?.addEventListener('click', () => this.handleDemoLogin());

        // Modals
        this.openTransferModalBtn?.addEventListener('click', () => this.openTransferModal());
        this.closeTransferModalBtn?.addEventListener('click', () => this.closeTransferModal());
        this.cancelTransferBtn?.addEventListener('click', () => this.closeTransferModal());
        this.transferForm?.addEventListener('submit', (e) => this.handleTransfer(e));

        this.openNewAccountModalBtn?.addEventListener('click', () => this.openCreateAccountModal());
        this.closeCreateAccountModalBtn?.addEventListener('click', () => this.closeCreateAccountModal());
        this.cancelCreateAccountBtn?.addEventListener('click', () => this.closeCreateAccountModal());
        this.createAccountForm?.addEventListener('submit', (e) => this.handleCreateAccount(e));

        this.closeStatementDrawerBtn?.addEventListener('click', () => this.closeStatementDrawer());

        this.regenerateIdempKeyBtn?.addEventListener('click', () => this.generateIdempotencyKey());
        this.refreshAccountsBtn?.addEventListener('click', () => this.loadDashboardData());
        this.txFilterStatus?.addEventListener('change', () => this.loadTransactions());

        // Quick amount chips
        document.querySelectorAll('.btn-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const amt = e.target.getAttribute('data-amt');
                if (amt && this.transferAmount) {
                    this.transferAmount.value = amt;
                }
            });
        });

        // Update balance hint when fromAccount changes
        this.transferFromAccount?.addEventListener('change', () => this.updateTransferBalanceHint());

        // Configure Backend API Server URL (useful when deployed on Vercel)
        document.getElementById('apiStatusIndicator')?.addEventListener('click', () => {
            const current = localStorage.getItem('ledger_backend_url') || window.location.origin;
            const newUrl = prompt('Backend API Server URL:\n(Leave empty to use same-origin /api)', current);
            if (newUrl !== null) {
                if (newUrl.trim() === '' || newUrl.trim() === window.location.origin) {
                    localStorage.removeItem('ledger_backend_url');
                } else {
                    localStorage.setItem('ledger_backend_url', newUrl.trim());
                }
                window.location.reload();
            }
        });
    }

    /* ==========================================================================
       API Request Wrapper with Automatic Refresh Token Rotation
       ========================================================================== */
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        try {
            let res = await fetch(url, { ...options, headers });

            // Handle 401: Token expired, attempt refresh
            if (res.status === 401 && !endpoint.includes('/auth/refresh-token') && !endpoint.includes('/auth/login')) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    headers['Authorization'] = `Bearer ${this.accessToken}`;
                    res = await fetch(url, { ...options, headers });
                } else {
                    this.logout();
                    throw new Error('Session expired. Please sign in again.');
                }
            }

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || `Request failed with status ${res.status}`);
            }
            return data;
        } catch (err) {
            throw err;
        }
    }

    async refreshToken() {
        try {
            const tokenToUse = this.refreshTokenValue || localStorage.getItem('ledger_refresh_token');
            if (!tokenToUse) return false;

            const res = await fetch(`${this.apiBase}/auth/refresh-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: tokenToUse })
            });
            if (!res.ok) return false;
            const data = await res.json();
            if (data.accessToken) {
                this.setToken(data.accessToken, data.refreshToken || tokenToUse);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    setToken(token, refreshToken = null) {
        this.accessToken = token;
        localStorage.setItem('ledger_token', token);
        if (refreshToken) {
            this.refreshTokenValue = refreshToken;
            localStorage.setItem('ledger_refresh_token', refreshToken);
        }
    }

    /* ==========================================================================
       API Health Check & Status Monitoring
       ========================================================================== */
    async checkApiHealth() {
        const engineLabel = document.getElementById('statusEngineText');
        const pulseDot = document.querySelector('.pulse-dot');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(`${this.apiBase}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                if (engineLabel) {
                    engineLabel.innerText = 'Online';
                    engineLabel.className = 'text-emerald';
                }
                if (pulseDot) pulseDot.style.background = '#10b981';
            } else {
                throw new Error();
            }
        } catch {
            if (engineLabel) {
                engineLabel.innerText = 'Offline (Click ⚙)';
                engineLabel.className = 'text-warning';
            }
            if (pulseDot) pulseDot.style.background = '#f59e0b';
        }
    }

    /* ==========================================================================
       Authentication Handlers
       ========================================================================== */
    async checkAuth() {
        if (!this.accessToken) {
            this.showLoggedOutView();
            return;
        }

        try {
            const data = await this.apiRequest('/auth/me');
            this.currentUser = data.user;
            this.showLoggedInView();
            await this.loadDashboardData();
        } catch (err) {
            this.logout();
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            const btn = document.getElementById('loginSubmitBtn');
            btn.disabled = true;
            btn.innerText = 'Verifying credentials...';

            const data = await this.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            this.setToken(data.accessToken, data.refreshToken);
            this.currentUser = data.user;
            this.showToast('Logged in successfully!', 'success');
            this.showLoggedInView();
            await this.loadDashboardData();
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            const btn = document.getElementById('loginSubmitBtn');
            btn.disabled = false;
            btn.innerText = 'Sign In to Dashboard';
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;

        try {
            const btn = document.getElementById('regSubmitBtn');
            btn.disabled = true;
            btn.innerText = 'Creating account...';

            const data = await this.apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ name, email, password })
            });

            this.setToken(data.accessToken, data.refreshToken);
            this.currentUser = data.user;
            this.showToast('Account created! Welcome to LedgerFlow.', 'success');

            // Auto-create initial account for new user
            await this.apiRequest('/accounts', {
                method: 'POST',
                body: JSON.stringify({ currency: 'INR' })
            });

            this.showLoggedInView();
            await this.loadDashboardData();
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            const btn = document.getElementById('regSubmitBtn');
            btn.disabled = false;
            btn.innerText = 'Create Ledger Account';
        }
    }

    async handleDemoLogin() {
        const demoEmail = 'recruiter.demo@ledgerflow.dev';
        const demoPassword = 'Password123!';
        const demoName = 'Recruiter Evaluator';

        try {
            this.showToast('Preparing one-click recruiter environment...', 'success');
            
            // Try to log in first
            let loginSuccess = false;
            try {
                const data = await this.apiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email: demoEmail, password: demoPassword })
                });
                this.setToken(data.accessToken, data.refreshToken);
                this.currentUser = data.user;
                loginSuccess = true;
            } catch {
                // If demo user doesn't exist, create it
                const regData = await this.apiRequest('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ name: demoName, email: demoEmail, password: demoPassword })
                });
                this.setToken(regData.accessToken, regData.refreshToken);
                this.currentUser = regData.user;
                loginSuccess = true;
            }

            if (loginSuccess) {
                this.showLoggedInView();
                await this.loadDashboardData();

                // If user has no accounts, create 2 sample accounts and fund one
                if (this.accounts.length === 0) {
                    const acc1 = await this.apiRequest('/accounts', {
                        method: 'POST',
                        body: JSON.stringify({ currency: 'INR' })
                    });
                    const acc2 = await this.apiRequest('/accounts', {
                        method: 'POST',
                        body: JSON.stringify({ currency: 'INR' })
                    });

                    // Seed account 1 with 1,000 INR
                    await this.apiRequest(`/accounts/${acc1.account._id}/faucet`, {
                        method: 'POST',
                        body: JSON.stringify({ amount: 1000 })
                    });

                    await this.loadDashboardData();
                    this.showToast('Demo environment pre-seeded with 2 accounts and ₹1,000 balance!', 'success');
                }
            }
        } catch (err) {
            this.showToast(`Demo setup failed: ${err.message}`, 'error');
        }
    }

    logout() {
        const tokenToRevoke = this.refreshTokenValue || localStorage.getItem('ledger_refresh_token');
        this.accessToken = null;
        this.refreshTokenValue = null;
        this.currentUser = null;
        localStorage.removeItem('ledger_token');
        localStorage.removeItem('ledger_refresh_token');
        if (tokenToRevoke) {
            this.apiRequest('/auth/logout', { 
                method: 'POST',
                body: JSON.stringify({ refreshToken: tokenToRevoke })
            }).catch(() => {});
        } else {
            this.apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
        }
        this.showLoggedOutView();
        this.showToast('Signed out.', 'success');
    }

    switchTab(tab) {
        if (tab === 'login') {
            this.tabLoginBtn?.classList.add('active');
            this.tabRegisterBtn?.classList.remove('active');
            this.loginForm?.classList.remove('hidden');
            this.registerForm?.classList.add('hidden');
        } else {
            this.tabRegisterBtn?.classList.add('active');
            this.tabLoginBtn?.classList.remove('active');
            this.registerForm?.classList.remove('hidden');
            this.loginForm?.classList.add('hidden');
        }
    }

    showLoggedInView() {
        this.authSection?.classList.add('hidden');
        this.dashboardSection?.classList.remove('hidden');

        // Render Nav actions
        if (this.navActions && this.currentUser) {
            this.navActions.innerHTML = `
                <div class="user-pill">
                    <span class="user-avatar">${this.currentUser.name.charAt(0).toUpperCase()}</span>
                    <span>${this.currentUser.name}</span>
                </div>
                <button class="btn btn-secondary btn-sm" id="logoutBtn">Sign Out</button>
            `;
            document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        }
    }

    showLoggedOutView() {
        this.authSection?.classList.remove('hidden');
        this.dashboardSection?.classList.add('hidden');
        if (this.navActions) {
            this.navActions.innerHTML = '';
        }
    }

    /* ==========================================================================
       Dashboard Data Loading
       ========================================================================== */
    async loadDashboardData() {
        try {
            await Promise.all([
                this.loadAccounts(),
                this.loadTransactions()
            ]);
        } catch (err) {
            this.showToast(`Error syncing dashboard: ${err.message}`, 'error');
        }
    }

    async loadAccounts() {
        const data = await this.apiRequest('/accounts');
        this.accounts = data.accounts || [];

        // Calculate Net Cumulative Balance
        const totalNet = this.accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
        if (this.netBalanceValue) {
            this.netBalanceValue.innerText = totalNet.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (this.activeAccountsCount) {
            this.activeAccountsCount.innerText = this.accounts.filter(a => a.status === 'ACTIVE').length;
        }

        this.renderAccountsGrid();
    }

    renderAccountsGrid() {
        if (!this.accountsGrid) return;

        if (this.accounts.length === 0) {
            this.accountsGrid.innerHTML = `
                <div class="account-card glass-panel" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <p style="color: var(--text-secondary); margin-bottom: 1rem;">You don't have any ledger accounts yet.</p>
                    <button class="btn btn-emerald" id="firstAccountBtn">+ Open Your First Account</button>
                </div>
            `;
            document.getElementById('firstAccountBtn')?.addEventListener('click', () => this.openCreateAccountModal());
            return;
        }

        this.accountsGrid.innerHTML = this.accounts.map(acc => {
            const sym = acc.currency === 'INR' ? '₹' : (acc.currency === 'USD' ? '$' : '€');
            return `
                <div class="account-card glass-panel">
                    <div class="account-card-header">
                        <div class="account-id-row">
                            <span class="account-id-chip" title="Click to copy Account ID" onclick="app.copyToClipboard('${acc._id}')">
                                ${acc._id.slice(0, 8)}...${acc._id.slice(-6)} 📋
                            </span>
                        </div>
                        <span class="status-tag ${acc.status === 'ACTIVE' ? 'status-active' : 'status-frozen'}">
                            ${acc.status}
                        </span>
                    </div>

                    <div class="account-balance-area">
                        <div class="balance-caption">Derived Balance (${acc.currency})</div>
                        <div class="account-balance-display">
                            ${sym}${(acc.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                    </div>

                    <div class="account-card-actions">
                        <button class="btn btn-outline btn-sm" onclick="app.openStatementDrawer('${acc._id}')">
                            Audit Ledger
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="app.requestFaucet('${acc._id}')" title="Add 1,000 test funds">
                            +1k Faucet
                        </button>
                        ${acc.status === 'ACTIVE' 
                            ? `<button class="btn btn-outline btn-sm" onclick="app.toggleAccountStatus('${acc._id}', 'FROZEN')">Freeze</button>` 
                            : `<button class="btn btn-emerald btn-sm" onclick="app.toggleAccountStatus('${acc._id}', 'ACTIVE')">Unfreeze</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    async loadTransactions() {
        const status = this.txFilterStatus?.value || '';
        const endpoint = status ? `/transactions?status=${status}` : '/transactions';
        const data = await this.apiRequest(endpoint);
        this.transactions = data.transactions || [];

        if (this.totalTransfersCount) {
            this.totalTransfersCount.innerText = data.pagination?.total || this.transactions.length;
        }

        this.renderTransactionsTable();
    }

    renderTransactionsTable() {
        if (!this.transactionsTableBody) return;

        if (this.transactions.length === 0) {
            this.transactionsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state-cell">No transactions found. Execute a transfer to see atomic double-entry logs.</td>
                </tr>
            `;
            return;
        }

        this.transactionsTableBody.innerHTML = this.transactions.map(tx => {
            const sym = tx.fromAccount?.currency === 'INR' ? '₹' : '$';
            const statusClass = tx.status === 'COMPLETED' ? 'text-emerald' : (tx.status === 'FAILED' ? 'text-crimson' : 'text-secondary');
            const dateStr = new Date(tx.createdAt).toLocaleString();

            return `
                <tr>
                    <td class="font-mono text-xs">
                        <span class="account-id-chip" onclick="app.copyToClipboard('${tx._id}')" title="Click to copy">
                            ${tx._id.slice(0, 8)}... 📋
                        </span>
                    </td>
                    <td class="font-mono text-xs">${tx.fromAccount?._id ? tx.fromAccount._id.slice(0, 8) + '...' : '-'}</td>
                    <td class="font-mono text-xs">${tx.toAccount?._id ? tx.toAccount._id.slice(0, 8) + '...' : '-'}</td>
                    <td class="font-mono font-bold">${sym}${tx.amount.toFixed(2)}</td>
                    <td class="font-mono text-xs text-muted" title="${tx.idempotencyKey}">${tx.idempotencyKey.slice(0, 14)}...</td>
                    <td class="font-bold ${statusClass}">● ${tx.status}</td>
                    <td class="text-xs text-muted">${dateStr}</td>
                </tr>
            `;
        }).join('');
    }

    /* ==========================================================================
       Transfer & Modals Logic
       ========================================================================== */
    openTransferModal() {
        if (this.accounts.length === 0) {
            this.showToast('Please create an account first.', 'error');
            return;
        }

        // Populate Source Accounts
        if (this.transferFromAccount) {
            this.transferFromAccount.innerHTML = this.accounts
                .filter(a => a.status === 'ACTIVE')
                .map(a => `<option value="${a._id}">${a._id.slice(0, 10)}... (${a.currency} ${a.balance.toFixed(2)})</option>`)
                .join('');
        }

        // Populate Quick Picks for destination
        if (this.destinationQuickPicks) {
            this.destinationQuickPicks.innerHTML = this.accounts.map(a => `
                <button type="button" class="btn-chip" onclick="app.selectDestinationAccount('${a._id}')">
                    My Account (${a._id.slice(-6)})
                </button>
            `).join('');
        }

        this.generateIdempotencyKey();
        this.updateTransferBalanceHint();
        this.transferModal?.classList.remove('hidden');
    }

    closeTransferModal() {
        this.transferModal?.classList.add('hidden');
    }

    generateIdempotencyKey() {
        const key = 'idemp_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        if (this.transferIdempotencyKey) {
            this.transferIdempotencyKey.value = key;
        }
    }

    updateTransferBalanceHint() {
        const fromId = this.transferFromAccount?.value;
        const acc = this.accounts.find(a => a._id === fromId);
        if (acc && this.fromAccountBalanceHint) {
            this.fromAccountBalanceHint.innerText = `Available: ${acc.currency} ${acc.balance.toFixed(2)}`;
        }
    }

    selectDestinationAccount(id) {
        if (this.transferToAccount) {
            this.transferToAccount.value = id;
        }
    }

    async handleTransfer(e) {
        e.preventDefault();
        const fromAccount = this.transferFromAccount?.value;
        const toAccount = this.transferToAccount?.value.trim();
        const amount = parseFloat(this.transferAmount?.value);
        const idempotencyKey = this.transferIdempotencyKey?.value;

        if (fromAccount === toAccount) {
            this.showToast('Cannot transfer money to the same account.', 'error');
            return;
        }

        try {
            const btn = document.getElementById('submitTransferBtn');
            btn.disabled = true;
            btn.innerText = 'Executing ACID Session...';

            const data = await this.apiRequest('/transactions', {
                method: 'POST',
                body: JSON.stringify({ fromAccount, toAccount, amount, idempotencyKey })
            });

            this.showToast(`Transfer of ₹${amount} successful!`, 'success');
            this.closeTransferModal();
            this.transferForm?.reset();
            await this.loadDashboardData();
        } catch (err) {
            this.showToast(`Transfer failed: ${err.message}`, 'error');
        } finally {
            const btn = document.getElementById('submitTransferBtn');
            btn.disabled = false;
            btn.innerText = 'Execute Transfer';
        }
    }

    /* ==========================================================================
       Account Management & Faucet
       ========================================================================== */
    openCreateAccountModal() {
        this.createAccountModal?.classList.remove('hidden');
    }

    closeCreateAccountModal() {
        this.createAccountModal?.classList.add('hidden');
    }

    async handleCreateAccount(e) {
        e.preventDefault();
        const currency = document.getElementById('newAccountCurrency')?.value || 'INR';

        try {
            await this.apiRequest('/accounts', {
                method: 'POST',
                body: JSON.stringify({ currency })
            });

            this.showToast(`New ${currency} account initialized!`, 'success');
            this.closeCreateAccountModal();
            await this.loadDashboardData();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    async requestFaucet(accountId) {
        try {
            this.showToast('Requesting testnet credit...', 'success');
            const data = await this.apiRequest(`/accounts/${accountId}/faucet`, {
                method: 'POST',
                body: JSON.stringify({ amount: 1000 })
            });
            this.showToast(data.message, 'success');
            await this.loadDashboardData();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    async toggleAccountStatus(accountId, newStatus) {
        try {
            await this.apiRequest(`/accounts/${accountId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus })
            });
            this.showToast(`Account status updated to ${newStatus}`, 'success');
            await this.loadDashboardData();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    /* ==========================================================================
       Ledger Audit Statement Drawer
       ========================================================================== */
    async openStatementDrawer(accountId) {
        this.currentStatementAccount = accountId;
        const acc = this.accounts.find(a => a._id === accountId);

        if (this.statementAccountMeta) {
            this.statementAccountMeta.innerText = `Account ID: ${accountId} (${acc?.currency || 'INR'})`;
        }
        if (this.statementBalanceValue && acc) {
            this.statementBalanceValue.innerText = `${acc.currency === 'INR' ? '₹' : '$'}${acc.balance.toFixed(2)}`;
        }

        this.statementDrawer?.classList.remove('hidden');

        try {
            const data = await this.apiRequest(`/accounts/${accountId}/statement`);
            this.renderStatementTable(data.entries || [], acc?.currency || 'INR');
        } catch (err) {
            this.showToast(`Could not load statement: ${err.message}`, 'error');
        }
    }

    closeStatementDrawer() {
        this.statementDrawer?.classList.add('hidden');
    }

    renderStatementTable(entries, currency) {
        if (!this.statementTableBody) return;

        if (entries.length === 0) {
            this.statementTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state-cell">No ledger journals recorded for this account.</td>
                </tr>
            `;
            return;
        }

        const sym = currency === 'INR' ? '₹' : '$';

        this.statementTableBody.innerHTML = entries.map(entry => {
            const isCredit = entry.type === 'CREDIT';
            const typeClass = isCredit ? 'entry-type-credit' : 'entry-type-debit';
            const sign = isCredit ? '+' : '-';
            const dateStr = new Date(entry.createdAt).toLocaleString();
            const txId = entry.transaction?._id || entry.transaction || '-';

            return `
                <tr>
                    <td class="${typeClass}">
                        ${sign} ${entry.type}
                    </td>
                    <td class="font-mono font-bold ${typeClass}">
                        ${sign}${sym}${entry.amount.toFixed(2)}
                    </td>
                    <td class="font-mono text-xs">
                        <span class="account-id-chip" onclick="app.copyToClipboard('${txId}')" title="Copy Transaction ID">
                            ${typeof txId === 'string' ? txId.slice(0, 8) + '...' : '-'} 📋
                        </span>
                    </td>
                    <td class="text-xs text-muted">${dateStr}</td>
                </tr>
            `;
        }).join('');
    }

    /* ==========================================================================
       Utilities & Toast
       ========================================================================== */
    copyToClipboard(text) {
        navigator.clipboard.writeText(text);
        this.showToast('Copied to clipboard!', 'success');
    }

    showToast(message, type = 'success') {
        if (!this.toastHub) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✔' : '✖'}</span>
            <span>${message}</span>
        `;

        this.toastHub.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

// Global App Instance
const app = new LedgerFlowApp();
window.app = app;
