#!/usr/bin/env node
// Usage (dry run):  node scripts/migrate-app-users.mjs
//        (apply):   node scripts/migrate-app-users.mjs --apply
// Env: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, APP_ORIGIN
import { writeFileSync } from 'fs';
import { createSupabaseAdmin, runMigration } from './lib/migrateUsers.js';

const required = ['OLD_SUPABASE_URL', 'OLD_SUPABASE_SERVICE_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'APP_ORIGIN'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) { console.error(`Missing env: ${missing.join(', ')}`); process.exit(2); }
if (process.env.OLD_SUPABASE_URL.replace(/\/$/, '') === process.env.SUPABASE_URL.replace(/\/$/, '')) {
    console.error('OLD_SUPABASE_URL and SUPABASE_URL are the same project; refusing.'); process.exit(2);
}
const apply = process.argv.includes('--apply');

const report = await runMigration({
    legacy: createSupabaseAdmin({ url: process.env.OLD_SUPABASE_URL, serviceKey: process.env.OLD_SUPABASE_SERVICE_KEY }),
    target: createSupabaseAdmin({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_KEY }),
    appOrigin: process.env.APP_ORIGIN.replace(/\/$/, ''),
    apply,
});

const file = `migration-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: created ${report.created.length}, existing ${report.skipped_exists.length}, failed ${report.failed.length}, manual ${report.manual.length}. Report: ${file}`);
if (report.manual.length) console.log('Manual follow-up (no email):', report.manual.map((m) => m.username).join(', '));
process.exit(report.failed.length ? 1 : 0);
