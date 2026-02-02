const fs = require('fs');
const path = require('path');

const API_BASE = 'https://public.api.openprocurement.org/api/2.5';
const TARGET_EDRPOUS = [
    '26613094', '08532943', '08151359', '08526931', '07666794', '08388245',
    '07899653', '24981089', '08113718', '08540730', '07944268', '07893124',
    '24983059', '08140309', '08160039', '24979158', '08379186', '08032962',
    '14304637', '07732858', '08196534', '07967633', '08164155', '08027576',
    '07644539'
];

const DATA_FILE = path.join(__dirname, '..', 'data', 'tenders.json');

async function fetchRaw(params = '') {
    const fields = 'procuringEntity,tenderID,id,dateModified';
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
    console.log(`Starting deep scan for ${TARGET_EDRPOUS.length} targets...`);

    let existingData = { lastUpdated: null, tenders: [] };
    if (fs.existsSync(DATA_FILE)) {
        try {
            existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {
            console.error("Failed to load existing data.");
        }
    }

    let matchedIds = new Set();
    let offset = '';

    // 1. Scan latest 15000 tenders to find IDs of targets
    // This is a "deep scan" to ensure we haven't missed anything over the last week
    for (let i = 0; i < 15; i++) {
        console.log(`Scanning list page ${i + 1}...`);
        const result = await fetchRaw(offset ? `offset=${offset}` : '');
        if (result && result.data) {
            result.data.forEach(t => {
                if (t.procuringEntity && t.procuringEntity.identifier && TARGET_EDRPOUS.includes(t.procuringEntity.identifier.id)) {
                    matchedIds.add(t.id);
                }
            });
            offset = result.next_page ? result.next_page.offset : '';
            if (!offset) break;
        } else break;
    }

    // 2. SANITIZATION: Check existing archive for incomplete records
    console.log("Adding incomplete archival records to re-fetch queue...");
    existingData.tenders.forEach(t => {
        if (!t.title || !t.value || t.title === 'undefined' || typeof t.value.amount === 'undefined') {
            matchedIds.add(t.id);
        }
    });

    // 3. Fetch FULL details for each matched ID
    let detailedTenders = [];
    console.log(`Queue size: ${matchedIds.size} tenders. Fetching full details for 100% data quality...`);

    for (const id of matchedIds) {
        try {
            const response = await fetch(`${API_BASE}/tenders/${id}`);
            if (response.ok) {
                const full = await response.json();
                if (full.data) {
                    detailedTenders.push(full.data);
                }
            }
        } catch (e) {
            console.error(`Error fetching detail for ${id}`);
        }
    }

    // 4. Merge with archive (new detailed records win)
    const combined = [...detailedTenders, ...existingData.tenders];
    const seen = new Set();
    const finalTenders = combined.filter(t => {
        const uniqueId = t.tenderID || t.id;
        if (!uniqueId || seen.has(uniqueId)) return false;
        seen.add(uniqueId);
        return true;
    }).sort((a, b) => new Date(b.dateModified) - new Date(a.dateModified)).slice(0, 1000); // Increased storage limit to 1000

    // 5. Save
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({
            lastUpdated: new Date().toISOString(),
            tenders: finalTenders
        }, null, 2)
    );

    console.log(`Success! Archive contains ${finalTenders.length} high-quality tender records.`);
}

updateTenders().catch(console.error);
