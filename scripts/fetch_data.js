const fs = require('fs');
const path = require('path');

const API_BASE = 'https://public.api.openprocurement.org/api/2.5';
const TARGET_EDRPOUS = ['26613094', '08532943']; // В/Ч А4533 та В/Ч А1124
const DATA_FILE = path.join(__dirname, '..', 'data', 'tenders.json');

async function fetchRaw(params = '') {
    // Basic fields to identify targets
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
    console.log("Starting deep-fetch tender update...");

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

    // 1. Scan latest 3000 tenders to find IDs of targets
    for (let i = 0; i < 3; i++) {
        console.log(`Scanning page ${i + 1}...`);
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

    // 2. Fetch FULL details for each matched ID
    let detailedTenders = [];
    console.log(`Matched ${matchedIds.size} target tenders. Fetching full details...`);

    for (const id of matchedIds) {
        // Skip if we already have it and it wasn't modified recently (optional optimization)
        // For simplicity, we fetch all matched this time to ensure data quality
        try {
            const response = await fetch(`${API_BASE}/tenders/${id}`);
            if (response.ok) {
                const full = await response.json();
                if (full.data) {
                    detailedTenders.push(full.data);
                }
            }
        } catch (e) {
            console.error(`Error fetching detail for ${id}:`, e);
        }
    }

    // 3. Merge with archive
    const combined = [...detailedTenders, ...existingData.tenders];
    const seen = new Set();
    const finalTenders = combined.filter(t => {
        const id = t.tenderID || t.id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    }).sort((a, b) => new Date(b.dateModified) - new Date(a.dateModified)).slice(0, 500);

    // 4. Save
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({
            lastUpdated: new Date().toISOString(),
            tenders: finalTenders
        }, null, 2)
    );

    console.log(`Success! Archive now contains ${finalTenders.length} tenders.`);
}

updateTenders().catch(console.error);
