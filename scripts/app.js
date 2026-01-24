const API_BASE = 'https://public.api.openprocurement.org/api/2.5';

class ProzorroApp {
    constructor() {
        this.watchlist = JSON.parse(localStorage.getItem('prozorro_watchlist')) || [];
        this.tenders = [];
        this.initElements();
        this.initEvents();
        this.renderWatchlist();
        this.loadFeed();

        // Push notification check logic (placeholder)
        this.checkNewTendersInterval();
    }

    initElements() {
        this.navItems = document.querySelectorAll('.nav-item');
        this.tabs = document.querySelectorAll('.tab-content');
        this.tendersList = document.getElementById('tenders-list');
        this.searchResults = document.getElementById('search-results');
        this.watchlistItems = document.getElementById('watchlist-items');
        this.modal = document.getElementById('modal-container');
        this.searchBtn = document.getElementById('search-btn');
        this.searchInput = document.getElementById('search-input');
    }

    initEvents() {
        // Tab switching
        this.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tabId = item.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        // Search
        this.searchBtn.addEventListener('click', () => this.handleSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // Watchlist
        document.getElementById('add-watchlist-btn').addEventListener('click', () => {
            this.modal.classList.remove('hidden');
        });

        document.querySelector('.close-modal').addEventListener('click', () => {
            this.modal.classList.add('hidden');
        });

        document.getElementById('save-watchlist-btn').addEventListener('click', () => {
            const code = document.getElementById('watchlist-code').value.trim();
            const name = document.getElementById('watchlist-name').value.trim();
            if (code) {
                this.addToWatchlist(code, name);
                this.modal.classList.add('hidden');
            }
        });

        // Refresh
        document.getElementById('refresh-btn').addEventListener('click', () => this.loadFeed());
    }

    switchTab(tabId) {
        this.navItems.forEach(i => i.classList.toggle('active', i.getAttribute('data-tab') === tabId));
        this.tabs.forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    }

    async fetchTenders(params = '') {
        try {
            const response = await fetch(`${API_BASE}/tenders?opt_fields=procuringEntity,value,title,status,tenderID,dateModified&descending=1&${params}`, {
                mode: 'cors'
            });
            const data = await response.json();
            return data.data;
        } catch (error) {
            console.error('Fetch error:', error);
            return [];
        }
    }

    async loadFeed() {
        this.tendersList.innerHTML = '<div class="loader"></div>';

        // If we have watchlist, we might want to filter, 
        // but for general feed we just show latest.
        const tenders = await this.fetchTenders();
        this.renderTenders(tenders, this.tendersList);
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) return;

        this.searchResults.innerHTML = '<div class="loader"></div>';
        this.switchTab('search');

        // Simple search logic: fetch latest and filter locally (Public API limitations)
        // In a real app with more resources, we'd use a dedicated search endpoint.
        const tenders = await this.fetchTenders();
        const filtered = tenders.filter(t =>
            t.title.toLowerCase().includes(query.toLowerCase()) ||
            (t.procuringEntity && t.procuringEntity.name.toLowerCase().includes(query.toLowerCase())) ||
            (t.procuringEntity && t.procuringEntity.identifier.id.includes(query))
        );

        this.renderTenders(filtered, this.searchResults);
    }

    renderTenders(tenders, container) {
        if (!tenders || tenders.length === 0) {
            container.innerHTML = '<p class="empty-state">Нічого не знайдено</p>';
            return;
        }

        container.innerHTML = tenders.map(tender => `
            <div class="tender-card glass" onclick="window.open('https://prozorro.gov.ua/tender/${tender.tenderID}', '_blank')">
                <span class="status">${this.formatStatus(tender.status)}</span>
                <div class="title">${tender.title}</div>
                <div class="budget">${this.formatCurrency(tender.value)}</div>
                <div class="meta">
                    <div>${tender.procuringEntity?.name || 'Невідомий замовник'}</div>
                    <div style="margin-top: 4px; font-size: 0.7rem;">ID: ${tender.tenderID} • ${new Date(tender.dateModified).toLocaleDateString()}</div>
                </div>
            </div>
        `).join('');
    }

    renderWatchlist() {
        if (this.watchlist.length === 0) {
            this.watchlistItems.innerHTML = '<p class="empty-state">Ви ще не додали жодного замовника</p>';
            return;
        }

        this.watchlistItems.innerHTML = this.watchlist.map(item => `
            <div class="tender-card glass" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div class="title" style="margin:0">${item.name || 'Організація'}</div>
                    <div class="meta">${item.code}</div>
                </div>
                <button class="icon-btn" style="width:36px; height:36px; color:#ef4444;" onclick="app.removeFromWatchlist('${item.code}')">
                    <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
        `).join('');
    }

    addToWatchlist(code, name) {
        if (!this.watchlist.find(i => i.code === code)) {
            this.watchlist.push({ code, name });
            localStorage.setItem('prozorro_watchlist', JSON.stringify(this.watchlist));
            this.renderWatchlist();
            this.checkNewTendersForCustomer(code);
        }
    }

    removeFromWatchlist(code) {
        this.watchlist = this.watchlist.filter(i => i.code !== code);
        localStorage.setItem('prozorro_watchlist', JSON.stringify(this.watchlist));
        this.renderWatchlist();
    }

    formatStatus(status) {
        const statuses = {
            'active.enquiries': 'Період уточнень',
            'active.tendering': 'Прийом пропозицій',
            'active.pre-qualification': 'Прекваліфікація',
            'active.auction': 'Аукціон',
            'active.qualification': 'Кваліфікація',
            'active.awarded': 'Пропозиції розглянуті',
            'complete': 'Завершено',
            'cancelled': 'Відмінено',
            'unsuccessful': 'Тендер не відбувся'
        };
        return statuses[status] || status;
    }

    formatCurrency(value) {
        if (!value) return '0.00 грн';
        return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: value.currency || 'UAH' }).format(value.amount);
    }

    // Monitoring logic
    async checkNewTendersForCustomer(code) {
        console.log(`Checking new tenders for ${code}...`);
        // Simulating finding new tenders
        const tenders = await this.fetchTenders();
        const customerTenders = tenders.filter(t => t.procuringEntity?.identifier?.id === code);

        if (customerTenders.length > 0) {
            this.updateBadge(customerTenders.length);
        }
    }

    updateBadge(count) {
        if ('setAppBadge' in navigator) {
            navigator.setAppBadge(count).catch(console.error);
        }
    }

    checkNewTendersInterval() {
        setInterval(() => {
            if (this.watchlist.length > 0) {
                this.watchlist.forEach(item => this.checkNewTendersForCustomer(item.code));
            }
        }, 1000 * 60 * 15); // Check every 15 mins
    }
}

const app = new ProzorroApp();
window.app = app;
