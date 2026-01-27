const fs = require('fs');
const path = require('path');

const API_BASE = 'https://public.api.openprocurement.org/api/2.5';
const TARGET_EDRPOUS = ['26613094', '08532943']; // В/Ч А4533 та В/Ч А1124

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
    console.log("Starting tender update...");
    let targetedTenders = [];
    let generalTenders = [];
    let offset = '';

    // 1. Deep Scan for Targeted EDRPOUs (last 3000 tenders)
    for (let i = 0; i < 3; i++) {
        console.log(`Scanning targets page ${i + 1}...`);
        const result = await fetchRaw(offset ? `offset=${offset}` : '');
        if (result && result.data) {
            const matches = result.data.filter(t =>
                t.procuringEntity &&
                t.procuringEntity.identifier &&
                TARGET_EDRPOUS.includes(t.procuringEntity.identifier.id)
            );
            targetedTenders = [...targetedTenders, ...matches];

            // Keep first 100 as general feed
            if (i === 0) generalTenders = result.data.slice(0, 100);

            offset = result.next_page ? result.next_page.offset : '';
            if (!offset) break;
        } else break;
    }

    // Merge and Deduplicate
    const all = [...targetedTenders, ...generalTenders];
    const seen = new Set();
    const uniqueTenders = all.filter(t => {
        const isNew = !seen.has(t.tenderID);
        seen.add(t.tenderID);
        return isNew;
    }).sort((a, b) => new Date(b.dateModified) - new Date(a.dateModified));

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

    fs.writeFileSync(
        path.join(dataDir, 'tenders.json'),
        JSON.stringify({
            lastUpdated: new Date().toISOString(),
            tenders: uniqueTenders
        }, null, 2)
    );

    console.log(`Successfully updated. Total stored: ${uniqueTenders.length} (Targeted: ${targetedTenders.length})`);
}

updateTenders().catch(console.error);
