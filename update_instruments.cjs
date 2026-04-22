#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────
// Zerodha Instrument Map Updater
// ─────────────────────────────────────────────────────────────────────
// Downloads the latest instrument list from Zerodha and generates
// src/instrument_map.json (exchange_token → instrument_token mapping).
//
// Usage:
//   node update_instruments.cjs
//
// The script downloads from https://api.kite.trade/instruments
// (public endpoint, no auth required) and extracts NFO + BFO entries.
// ─────────────────────────────────────────────────────────────────────

const https = require('https');
const fs = require('fs');
const path = require('path');

const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const OUTPUT_PATH = path.join(__dirname, 'src', 'instrument_map.json');

function download(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function main() {
    console.log('Downloading instrument list from Zerodha...');
    const csv = await download(INSTRUMENTS_URL);

    const lines = csv.split('\n');
    const header = lines[0].split(',');

    const iIT = header.indexOf('instrument_token');
    const iET = header.indexOf('exchange_token');
    const iEX = header.indexOf('exchange');

    if (iIT === -1 || iET === -1 || iEX === -1) {
        throw new Error('CSV header missing expected columns: ' + header.join(','));
    }

    const map = {};
    let nfo = 0, bfo = 0;

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < header.length) continue;

        const ex = cols[iEX];
        if (ex !== 'NFO' && ex !== 'BFO') continue;

        const et = cols[iET];
        const it = parseInt(cols[iIT]);
        map[et] = it;

        if (ex === 'NFO') nfo++;
        else bfo++;
    }

    const json = JSON.stringify(map);
    fs.writeFileSync(OUTPUT_PATH, json);

    const sizeKB = (json.length / 1024).toFixed(0);
    console.log(`Done! Written to ${OUTPUT_PATH}`);
    console.log(`  NFO: ${nfo} instruments`);
    console.log(`  BFO: ${bfo} instruments`);
    console.log(`  Total: ${nfo + bfo} entries (${sizeKB} KB)`);
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
