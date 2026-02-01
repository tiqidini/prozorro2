const API_BASE = 'https://public.api.openprocurement.org/api/2.5';

class ProzorroApp {
    constructor() {
        this.watchlist = JSON.parse(localStorage.getItem('prozorro_watchlist')) || [];

        // Add default EDRPOUs if watchlist is empty or missing them
        const defaults = [
            { code: '26613094', name: 'Військова частина А4533' },
            { code: '08532943', name: 'ВІЙСЬКОВА ЧАСТИНА А1124' }
        ];
        defaults.forEach(d => {
            if (!this.watchlist.find(i => i.code === d.code)) {
                this.watchlist.push(d);
            }
        });
        localStorage.setItem('prozorro_watchlist', JSON.stringify(this.watchlist));

        this.tenders = [];
        this.lastUpdated = null;
        this.initElements();
        this.initEvents();
        this.renderWatchlist();
        this.loadLocalData(); // New entry point
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
        return new Intl.NumberFormat('uk-UA', {
            style: 'currency',
            currency: value.currency || 'UAH',
            maximumFractionDigits: 0
        }).format(value.amount);
    }

    formatProcedure(type) {
        const types = {
            'belowThreshold': 'Допорогова закупівля',
            'aboveThresholdUA': 'Відкриті торги',
            'aboveThresholdEU': 'Відкриті торги з публікацією англ. мовою',
            'reporting': 'Звіт про укладений договір',
            'negotiation': 'Переговорна процедура',
            'omv': 'Спрощена закупівля',
            'cpv': 'Запит пропозицій (Prozorro Market)'
        };
        return types[type] || type;
    }

    getCPVCode(tender) {
        if (tender.items && tender.items[0] && tender.items[0].classification) {
            return tender.items[0].classification.id;
        }
        if (tender.mainProcurementCategory) {
            return tender.mainProcurementCategory;
        }
        return '---';
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

        // Military Preset
        const milBtn = document.getElementById('add-military-preset-btn');
        if (milBtn) {
            milBtn.addEventListener('click', async () => {
                const codes = ["26613094", "08532943", "08151359", "08526931", "07666794", "08388245", "07899653", "24981089", "08113718", "08540730", "07944268", "07893124", "24983059", "08140309", "08160039", "24979158", "08379186", "08032962", "14304637", "07732858", "08196534", "07967633", "08164155", "08027576", "07644539"];

                milBtn.disabled = true;
                milBtn.innerText = 'Додавання...';

                for (const c of codes) {
                    await this.addToWatchlist(c, 'Військова частина/Орган');
                }

                await this.checkNewTendersGlobal(3);

                milBtn.disabled = false;
                milBtn.innerText = '+ Військові частини';
                this.switchTab('watchlist');
            });
        }

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

    async loadLocalData() {
        this.tendersList.innerHTML = '<div class="loader"></div>';
        try {
            const response = await fetch(`./data/tenders.json?_v=${Date.now()}`);
            if (response.ok) {
                const data = await response.json();
                this.tenders = data.tenders || [];
                this.lastUpdated = data.lastUpdated;
                this.renderFeed();
                this.updateStatusInfo();
            } else {
                throw new Error("Local data not found. GitHub Action might be running for the first time.");
            }
        } catch (e) {
            console.error(e);
            this.tendersList.innerHTML = `
                <div class="empty-state">
                    <p>Дані ще не завантажені</p>
                    <p style="font-size:0.8rem; margin-top:10px;">GitHub Action готує інформацію. Оновіть сторінку через кілька хвилин.</p>
                </div>
            `;
        }
    }

    updateStatusInfo() {
        const text = document.getElementById('sync-text');
        if (text && this.lastUpdated) {
            const time = new Date(this.lastUpdated).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
            text.innerText = `Оновлено о ${time}`;
        }
    }

    renderFeed() {
        this.renderTenders(this.tenders, this.tendersList, this.tenders.length, '');
    }

    // Direct API fetch is disabled due to CORS. Using local data mirror instead.
    async fetchRaw(params = '') {
        console.warn("Direct API access blocked by CORS. Using local data.");
        return null;
    }

    updateProgress(percent, text) {
        if (this.progressFill) this.progressFill.style.width = `${percent}%`;
        if (this.progressText) this.progressText.innerText = text;
    }

    async loadFeed() {
        this.loadLocalData();
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) return;

        this.switchTab('search');
        this.searchResults.innerHTML = '<div class="loader"></div>';
        this.progressContainer.classList.remove('hidden');
        this.updateProgress(20, 'Пошук у локальній базі...');

        try {
            const terms = query.split(/[\s,]+/).filter(t => t.length > 0);
            const statusFilter = this.filterStatus.value;

            this.updateProgress(60, 'Фільтрація...');
            const results = this.applyStrictFilter(this.tenders, terms, statusFilter);

            this.updateProgress(100, 'Завершено');
            setTimeout(() => this.progressContainer.classList.add('hidden'), 500);

            this.renderTenders(results, this.searchResults, results.length, query);
        } catch (error) {
            console.error('Search error:', error);
            this.updateProgress(100, 'Помилка');
            setTimeout(() => this.progressContainer.classList.add('hidden'), 1000);
        }
    }

    applyStrictFilter(tenders, terms, statusFilter) {
        return tenders.filter(t => {
            // 1. Status check
            if (statusFilter === 'active') {
                const activeStatuses = ['active.enquiries', 'active.tendering', 'active.pre-qualification', 'active.auction', 'active.qualification', 'active.awarded'];
                if (!activeStatuses.includes(t.status)) return false;
            } else if (statusFilter === 'complete' && t.status !== 'complete') {
                return false;
            }

            // 2. Content check (Match ANY of the terms)
            return terms.some(term => {
                const q = term.toLowerCase();
                const isEdrpou = /^\d{8}$/.test(term);

                if (isEdrpou) {
                    return t.procuringEntity?.identifier?.id === term;
                } else {
                    const inTitle = (t.title || '').toLowerCase().includes(q);
                    const inEntity = (t.procuringEntity?.name || '').toLowerCase().includes(q);
                    const inId = (t.tenderID || '').toLowerCase().includes(q);
                    return inTitle || inEntity || inId;
                }
            });
        });
    }

    renderTenders(tenders, container, searchedCount = 0, query = '') {
        const terms = query.split(/[\s,]+/).filter(t => t.length > 0);
        const edrpous = terms.filter(t => /^\d{8}$/.test(t));

        let externalSearchUrl = `https://prozorro.gov.ua/uk/search/tender?q=${encodeURIComponent(query)}`;
        if (edrpous.length > 0) {
            externalSearchUrl = `https://prozorro.gov.ua/uk/search/tender?${edrpous.map(e => `buyer=${e}`).join('&')}`;
        }

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
            ` + tenders.map(tender => {
            const cpv = this.getCPVCode(tender);
            const procedure = this.formatProcedure(tender.procurementMethodType);

            return `
            <div class="tender-card glass" onclick="window.open('https://prozorro.gov.ua/tender/${tender.tenderID}', '_blank')">
                <div class="card-header">
                    <span class="status-tag ${tender.status.split('.')[0]}">${this.formatStatus(tender.status)}</span>
                    <span class="cpv-tag">📂 ${cpv}</span>
                </div>
                
                <div class="title">${tender.title || 'Без назви (деталі на сайті)'}</div>
                
                <div class="procedure-type">${procedure}</div>
                
                <div class="budget-row">
                    <span class="budget-label">Бюджет:</span>
                    <span class="budget-value">${this.formatCurrency(tender.value)}</span>
                </div>

                <div class="meta-footer">
                    <div class="entity-name">🏢 ${tender.procuringEntity?.name || 'Невідомий замовник'}</div>
                    <div class="tender-date">📅 ${new Date(tender.dateModified).toLocaleDateString()} • ID: ${tender.tenderID}</div>
                </div>
            </div>
        `}).join('');
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
        }
    }

    // New optimized monitoring logic: scan once for all customers
    async checkNewTendersGlobal(depth = 1) {
        if (this.watchlist.length === 0) return;

        console.log(`Global check for ${this.watchlist.length} customers...`);
        const codes = this.watchlist.map(i => i.code);
        let offset = '';
        let totalMatches = 0;

        for (let i = 0; i < depth; i++) {
            const result = await this.fetchRaw(offset ? `offset=${offset}` : '');
            if (result && result.data) {
                const matches = this.applyStrictFilter(result.data, codes, 'all');
                totalMatches += matches.length;
                offset = result.next_page?.offset || '';
                if (!offset) break;
            } else break;
        }

        if (totalMatches > 0) {
            console.log(`Global check found ${totalMatches} total matches`);
            this.updateBadge(totalMatches);
        }
    }

    updateBadge(count) {
        if ('setAppBadge' in navigator) {
            navigator.setAppBadge(count).catch(console.error);
        }
    }

    checkNewTendersInterval() {
        setInterval(() => this.checkNewTendersGlobal(1), 1000 * 60 * 15);
    }
}

const app = new ProzorroApp();
window.app = app;
