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

        // New search elements
        this.filterStatus = document.getElementById('filter-status');
        this.filterDepth = document.getElementById('filter-depth');
        this.progressContainer = document.getElementById('search-progress-container');
        this.progressFill = document.getElementById('search-progress-fill');
        this.progressText = document.getElementById('search-progress-text');
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

        // Cache reset
        const clearBtn = document.getElementById('clear-cache-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(registrations => {
                        for (let registration of registrations) {
                            registration.unregister();
                        }
                        caches.keys().then(names => {
                            for (let name of names) caches.delete(name);
                            window.location.reload(true);
                        });
                    });
                } else {
                    window.location.reload(true);
                }
            });
        }
    }

    switchTab(tabId) {
        this.navItems.forEach(i => i.classList.toggle('active', i.getAttribute('data-tab') === tabId));
        this.tabs.forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    }

    async fetchRaw(params = '') {
        try {
            // Using corsproxy.io to bypass CORS - more stable than allorigins
            const targetUrl = `${API_BASE}/tenders?opt_fields=procuringEntity,value,title,status,tenderID,dateModified&descending=1&limit=1000&${params}&_v=${Date.now()}`.replace('&&', '&');
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
            
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            return null;
        }
    }

    updateProgress(percent, text) {
        if (this.progressFill) this.progressFill.style.width = `${percent}%`;
        if (this.progressText) this.progressText.innerText = text;
    }

    async fetchTenders(params = '') {
        const data = await this.fetchRaw(params);
        return data && data.data ? data.data : [];
    }

    async loadFeed() {
        this.tendersList.innerHTML = '<div class="loader"></div>';
        const tenders = await this.fetchTenders();
        this.renderTenders(tenders, this.tendersList, tenders.length, '');
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) return;

        this.switchTab('search');
        this.searchResults.innerHTML = '<div class="loader"></div>';
        this.progressContainer.classList.remove('hidden');
        this.updateProgress(5, 'Ініціалізація пошуку...');

        const statusFilter = this.filterStatus.value;
        const maxTenders = parseInt(this.filterDepth.value);
        let tenders = [];

        try {
            // Priority 1: Exact Tender ID Search (UA-202...)
            if (/^UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]$/i.test(query)) {
                this.updateProgress(50, 'Пошук за ID тендера...');
                const result = await this.fetchRaw(`tenderID=${query}`);
                tenders = result ? result.data.filter(t => t.tenderID.toLowerCase() === query.toLowerCase()) : [];
                this.updateProgress(100, 'Завершено');
            } 
            // Priority 2: Deep Scan (Keywords or EDRPOU)
            else {
                let offset = '';
                const pageSize = 1000;
                const pages = Math.ceil(maxTenders / pageSize);
                const isEdrpou = /^\d{8}$/.test(query);

                for (let i = 0; i < pages; i++) {
                    const progress = Math.round((i / pages) * 90) + 5;
                    this.updateProgress(progress, `Сканування бази... (${(i + 1) * pageSize} тендерів)`);

                    // For EDRPOU we don't use 'q' parameter as it often fails/ignores on API side
                    // Instead we scan latest tenders and filter precisely on client
                    const params = `${offset ? `offset=${offset}` : ''}`;
                    const result = await this.fetchRaw(params);

                    if (result && result.data && result.data.length > 0) {
                        const batchMatches = this.applyStrictFilter(result.data, query, statusFilter);
                        tenders = [...tenders, ...batchMatches];
                        
                        offset = result.next_page?.offset || '';
                        if (!offset) break;
                        
                        // If we found enough results for a specific EDRPOU, we can stop early
                        if (isEdrpou && tenders.length >= 50) break;
                    } else {
                        break;
                    }
                }

                this.updateProgress(95, 'Сортування...');
                tenders = tenders.sort((a, b) => new Date(b.dateModified) - new Date(a.dateModified));
                this.updateProgress(100, 'Завершено');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.updateProgress(100, 'Помилка');
        }

        setTimeout(() => this.progressContainer.classList.add('hidden'), 800);
        this.renderTenders(tenders, this.searchResults, tenders.length, query);
    }

    applyStrictFilter(tenders, query, statusFilter) {
        const q = query.toLowerCase();
        const isEdrpou = /^\d{8}$/.test(query);

        return tenders.filter(t => {
            // 1. Status check
            if (statusFilter === 'active') {
                const activeStatuses = ['active.enquiries', 'active.tendering', 'active.pre-qualification', 'active.auction', 'active.qualification', 'active.awarded'];
                if (!activeStatuses.includes(t.status)) return false;
            } else if (statusFilter === 'complete' && t.status !== 'complete') {
                return false;
            }

            // 2. Content check (STRICT)
            if (isEdrpou) {
                return t.procuringEntity?.identifier?.id === query;
            } else {
                const inTitle = (t.title || '').toLowerCase().includes(q);
                const inEntity = (t.procuringEntity?.name || '').toLowerCase().includes(q);
                const inId = (t.tenderID || '').toLowerCase().includes(q);
                return inTitle || inEntity || inId;
            }
        });
    }

    renderTenders(tenders, container, searchedCount = 0, query = '') {
        const isEdrpou = /^\d{8}$/.test(query);
        const externalSearchUrl = isEdrpou
            ? `https://prozorro.gov.ua/uk/search/tender?buyer=${query}`
            : `https://prozorro.gov.ua/uk/search/tender?q=${encodeURIComponent(query)}`;

        if (!tenders || tenders.length === 0) {
            container.innerHTML = `
                <p class="empty-state">Нічого не знайдено в додатку</p>
                <div style="text-align:center; padding: 20px;">
                    <a href="${externalSearchUrl}" target="_blank" class="primary-btn" style="display:inline-block; text-decoration:none; width:auto; padding:12px 24px;">
                        Шукати на Prozorro.gov.ua
                    </a>
                    <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:15px;">
                        В базі додатку відображаються тільки найновіші тендери. Для повного пошуку використовуйте офіційний портал.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 4px;">
                <div style="font-size:0.8rem; color:var(--text-secondary);">
                    Знайдено ${tenders.length} тендерів
                </div>
                <a href="${externalSearchUrl}" target="_blank" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Повний пошук →</a>
            </div>
            ` + tenders.map(tender => `
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

    async addToWatchlist(code, name) {
        if (!this.watchlist.find(i => i.code === code)) {
            this.watchlist.push({ code, name });
            localStorage.setItem('prozorro_watchlist', JSON.stringify(this.watchlist));
            this.renderWatchlist();

            // Initial deep check for this customer (last 3000 tenders)
            await this.checkNewTendersForCustomer(code, 3);
            this.switchTab('watchlist');
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

    // Monitoring logic (Watchlist)
    async checkNewTendersForCustomer(code, depth = 1) {
        console.log(`Checking tenders for ${code}...`);
        
        try {
            let offset = '';
            let matches = [];
            
            // Scan batches to find matches
            for (let i = 0; i < depth; i++) {
                const result = await this.fetchRaw(offset ? `offset=${offset}` : '');
                if (result && result.data) {
                    const batchMatches = this.applyStrictFilter(result.data, code, 'all');
                    matches = [...matches, ...batchMatches];
                    offset = result.next_page?.offset || '';
                    if (!offset) break;
                } else break;
            }

            if (matches.length > 0) {
                console.log(`Found ${matches.length} matches for ${code}`);
                this.updateBadge(matches.length);
            }
        } catch (e) {
            console.error(`Monitor error for ${code}:`, e);
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
