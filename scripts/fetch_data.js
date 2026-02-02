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

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            if (response.status >= 500) {
                console.log(`Server error (${response.status}). Retrying in ${backoff}ms...`);
            } else {
                return response; // Client error, don't retry
            }
        } catch (e) {
            console.error(`Fetch error: ${e.message}. Retrying in ${backoff}ms...`);
        }
        await new Promise(resolve => setTimeout(resolve, backoff));
        backoff *= 2;
    }
    return null;
}

async function fetchRaw(params = '') {
    const fields = 'procuringEntity,tenderID,id,dateModified';
    const url = `${API_BASE}/tenders?opt_fields=${fields}&descending=1&limit=1000&${params}`;

    const response = await fetchWithRetry(url);
    if (response && response.ok) {
        return await response.json();
    }
    return null;
}

async function updateTenders() {
    console.log(`Starting ULTRA deep scan (100 pages) for ${TARGET_EDRPOUS.length} targets...`);

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

    // 1. Scan latest 100,000 tenders to find IDs of targets
    // This is vital to capture all tenders from the start of 2026
    for (let i = 0; i < 100; i++) {
        console.log(`Scanning page ${i + 1}/100...`);
        const result = await fetchRaw(offset ? `offset=${offset}` : '');
        if (result && result.data) {
            let pageFoundCount = 0;
            result.data.forEach(t => {
                if (t.procuringEntity && t.procuringEntity.identifier && TARGET_EDRPOUS.includes(t.procuringEntity.identifier.id)) {
                    matchedIds.add(t.id);
                    pageFoundCount++;
                }
            });
            console.log(`  Found ${pageFoundCount} matches on this page.`);
            offset = result.next_page ? result.next_page.offset : '';
            if (!offset) break;

            // Check if we already went too far back (limit scanning if needed, but 100 pages is safe)
        } else break;
    }

    // 2. SANITIZATION: Check existing archive for incomplete records
    console.log("Checking archival records for issues...");
    existingData.tenders.forEach(t => {
        if (!t.title || !t.value || t.title === 'undefined' || typeof t.value.amount === 'undefined') {
            matchedIds.add(t.id || t.tenderID); // Add internal ID to re-fetch
        }
    });

    // 3. Fetch FULL details for each matched ID
    let detailedTenders = [];
    console.log(`Queue size: ${matchedIds.size} unique tenders. Fetching full details...`);

    const idsToFetch = Array.from(matchedIds);
    for (let i = 0; i < idsToFetch.length; i++) {
        const id = idsToFetch[i];
        try {
            process.stdout.write(`[${i + 1}/${idsToFetch.length}] Fetching ${id}... `);
            const response = await fetchWithRetry(`${API_BASE}/tenders/${id}`);
            if (response && response.ok) {
                const full = await response.json();
                if (full.data) {
                    detailedTenders.push(full.data);
                    console.log("OK");
                }
            } else {
                console.log("FAILED" + (response ? ` (Status ${response.status})` : " (No response)"));
            }
        } catch (e) {
            console.log("ERROR: " + e.message);
        }
    }

    // 4. Merge with archive (new detailed records win)
    const combined = [...detailedTenders, ...existingData.tenders];
    const seen = new Set();
    const finalTenders = combined.filter(t => {
        const uniqueKey = t.id || t.tenderID;
        if (!uniqueKey || seen.has(uniqueKey)) return false;

        // Ensure record is complete before committing to final list
        if (!t.title || t.title === 'undefined') return false;

        seen.add(uniqueKey);
        return true;
    }).sort((a, b) => new Date(b.dateModified) - new Date(a.dateModified)).slice(0, 2000);

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

    console.log(`\nDONE! Archive updated with ${finalTenders.length} complete records.`);
}

updateTenders().catch(console.error);
