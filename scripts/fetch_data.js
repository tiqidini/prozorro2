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
    console.log("Starting deep-fetch tender update with sanitization...");

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

    // 1. Scan latest 3000 tenders to find IDs of targets (for new tenders)
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

    // 2. SANITIZATION: Check existing archive for incomplete records
    console.log("Checking archive for incomplete records...");
    existingData.tenders.forEach(t => {
        // If it's missing title or value, we need to re-fetch full detail
        if (!t.title || !t.value || t.title === 'undefined' || typeof t.value.amount === 'undefined') {
            console.log(`Record ${t.tenderID} is incomplete. Adding to re-fetch queue.`);
            matchedIds.add(t.id); // 'id' is the internal uuid needed for the direct fetch
        }
    });

    // 3. Fetch FULL details for each matched ID
    let detailedTenders = [];
    console.log(`Total queue size: ${matchedIds.size} tenders. Fetching full details...`);

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
            console.error(`Error fetching detail for ${id}:`, e);
        }
    }

    // 4. Merge with archive (new detailed records win over old ones)
    const combined = [...detailedTenders, ...existingData.tenders];
    const seen = new Set();
    const finalTenders = combined.filter(t => {
        const uniqueId = t.tenderID || t.id;
        if (!uniqueId || seen.has(uniqueId)) return false;

        // Priority check: if we just fetched a detailed version, it's already in 'seen' if we are iterating correctly
        // But since we want the LATEST/MOST COMPLETE, we put detailedTenders FIRST in the spread.
        seen.add(uniqueId);
        return true;
    }).sort((a, b) => new Date(b.dateModified) - new Date(a.dateModified)).slice(0, 500);

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

    console.log(`Success! Archive sanitized and updated. Contains ${finalTenders.length} tenders.`);
}

updateTenders().catch(console.error);
