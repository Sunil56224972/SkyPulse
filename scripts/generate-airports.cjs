/**
 * Downloads the OpenFlights airport database and generates AirportDB.js
 * with coordinates for all airports that have IATA codes.
 * Source: https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AIRPORTS_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'AirportDB.js');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading OpenFlights airport database...');
  const csv = await fetch(AIRPORTS_URL);
  const lines = csv.trim().split('\n');

  const airports = {};
  let skipped = 0;

  for (const line of lines) {
    // CSV format: ID, Name, City, Country, IATA, ICAO, Lat, Lng, Alt, Tz, DST, TzDb, Type, Source
    // Fields are quoted with "
    const fields = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!fields || fields.length < 8) { skipped++; continue; }

    const iata = fields[4]?.replace(/"/g, '').trim();
    const lat = parseFloat(fields[6]?.replace(/"/g, ''));
    const lng = parseFloat(fields[7]?.replace(/"/g, ''));

    // Skip entries without valid IATA codes
    if (!iata || iata === '\\N' || iata === 'N' || iata.length !== 3) { skipped++; continue; }
    if (isNaN(lat) || isNaN(lng)) { skipped++; continue; }

    airports[iata] = { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
  }

  console.log(`Parsed ${Object.keys(airports).length} airports with IATA codes (skipped ${skipped})`);

  // Generate JS file
  let js = '// Auto-generated airport coordinate database\n';
  js += '// Source: OpenFlights (https://openflights.org/data.html)\n';
  js += `// Generated: ${new Date().toISOString()}\n`;
  js += `// Total airports: ${Object.keys(airports).length}\n\n`;
  js += 'export const airportCoordinates = {\n';

  const entries = Object.entries(airports).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [iata, coords] of entries) {
    js += `  ${iata}: { lat: ${coords.lat}, lng: ${coords.lng} },\n`;
  }

  js += '};\n\n';
  js += '/**\n';
  js += ' * Look up coordinates for an IATA airport code.\n';
  js += ' * Returns {lat, lng} or null if not found.\n';
  js += ' */\n';
  js += 'export function getAirportCoords(iataCode) {\n';
  js += '  if (!iataCode) return null;\n';
  js += '  return airportCoordinates[iataCode.toUpperCase()] || null;\n';
  js += '}\n';

  fs.writeFileSync(OUTPUT_FILE, js);
  console.log(`Written to ${OUTPUT_FILE}`);
}

main().catch(console.error);
