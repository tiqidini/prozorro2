const fs = require('fs');
const path = require('path');

const API_BASE = 'https://public.api.openprocurement.org/api/2.5';
const TARGET_EDRPOUS = ['26613094', '08532943']; // В/Ч А4533 та В/Ч А1124
const DATA_FILE = path.join(__dirname, '..', 'data', 'tenders.json');

async function fetchRaw(params = '') {
    const fields = [
        'procuringEntity',
        'value',
        'title',
        'status',
        'tenderID',
        'dateModified',
        'procurementMethodType',
        'mainProcurementCategory',
        'items',
        'tenderPeriod'
    ].join(',');

    const url = `${API_BASE}/tenders?opt_fields=${fields}&descending=1&limit=1000&${params}`;

    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
    return null;
}

async function updateTenders() {
    console.log("Starting cumulative tender update...");

    // 1. Load existing data
    let existingData = { lastUpdated: null, tenders: [] };
    if (fs.existsSync(DATA_FILE)) {
        try {
            existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log(`Loaded ${existingData.tenders.length} existing tenders.`);
        } catch (e) {
            console.error("Failed to load existing data, starting fresh.");
        }
    }

    let newTenders = [];
    let offset = '';

    // 2. Scan latest tenders (2 pages for speed + history)
    for (let i = 0; i < 2; i++) {
        console.log(`Scanning Prozorro API page ${i + 1}...`);
        const result = await fetchRaw(offset ? `offset=${offset}` : '');
        if (result && result.data) {
            const matches = result.data.filter(t =>
                t.procuringEntity &&
                t.procuringEntity.identifier &&
                TARGET_EDRPOUS.includes(t.procuringEntity.identifier.id)
            );
            newTenders = [...newTenders, ...matches];
            offset = result.next_page ? result.next_page.offset : '';
            if (!offset) break;
        } else break;
    }

    // 3. Merge and Deduplicate
    const combined = [...newTenders, ...existingData.tenders];
    const seen = new Set();
    const uniqueTenders = combined.filter(t => {
        const isNew = !seen.has(t.tenderID);
        seen.add(t.tenderID);
        return isNew;
    }).sort((a, b) => new Date(b.dateModified) - new Date(a.dateModified));

    // 4. Limit storage (e.g., keep last 500 records to prevent file bloat)
    const finalTenders = uniqueTenders.slice(0, 500);

    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({
            lastUpdated: new Date().toISOString(),
            tenders: finalTenders
        }, null, 2)
    );

    console.log(`Update complete. Total in archive: ${finalTenders.length} (Added ${uniqueTenders.length - existingData.tenders.length} new)`);
}

updateTenders().catch(console.error);
