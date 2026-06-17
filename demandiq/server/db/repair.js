/**
 * One-time repair: restore REF_190L_DirectCool forecast_runs to correct values
 * and delete corrupted zero-value branch_overrides rows left by a prior buggy edit.
 * Usage: node server/db/repair.js [optional/path/to/demandiq.db]
 */
const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.argv[2] || path.join(__dirname, 'demandiq.db');

const MONTHS = ['06-2026','07-2026','08-2026','09-2026','10-2026','11-2026'];
const SKU    = 'REF_190L_DirectCool';
const CAT    = 'Direct Cool Refrigerator';
const ALG    = 'SARIMAX';

const DATA = {
  'Mumbai':     [400, 350, 325, 362, 387, 425],
  'New Delhi':  [390, 341, 317, 353, 378, 415],
  'Kolkata':    [304, 266, 247, 275, 294, 323],
  'Chennai':    [336, 294, 273, 304, 325, 357],
  'Bangalore':  [345, 302, 280, 312, 334, 367],
  'Hyderabad':  [314, 275, 255, 284, 304, 334],
  'Pune':       [281, 246, 228, 254, 272, 299],
  'Ahmedabad':  [272, 238, 221, 246, 263, 289],
};

const db = new Database(DB_PATH);

const cycle = db.prepare(`SELECT * FROM forecast_cycles ORDER BY cycle_id DESC LIMIT 1`).get();
if (!cycle) { console.error('No forecast cycle found'); process.exit(1); }

const scenario = db.prepare(
  `SELECT * FROM forecast_scenarios WHERE cycle_id=? AND status='finalized' ORDER BY finalized_at DESC LIMIT 1`
).get(cycle.cycle_id);
if (!scenario) { console.error('No finalized scenario found'); process.exit(1); }

const sid = scenario.scenario_id;
console.log(`Repairing DB: ${DB_PATH}`);
console.log(`Cycle: ${cycle.cycle_id}, Finalized scenario: ${sid} (${scenario.name})`);

let updated = 0, inserted = 0;

const repairStmt = db.transaction(() => {
  for (const [branch, values] of Object.entries(DATA)) {
    for (let i = 0; i < MONTHS.length; i++) {
      const month = MONTHS[i];
      const val   = values[i];

      const existing = db.prepare(
        `SELECT run_id FROM forecast_runs WHERE scenario_id=? AND branch=? AND sku=? AND month=?`
      ).get(sid, branch, SKU, month);

      if (existing) {
        db.prepare(`UPDATE forecast_runs SET value=? WHERE run_id=?`).run(val, existing.run_id);
        updated++;
      } else {
        db.prepare(
          `INSERT INTO forecast_runs (cycle_id, scenario_id, branch, sku, category, month, value, algorithm) VALUES (?,?,?,?,?,?,?,?)`
        ).run(cycle.cycle_id, sid, branch, SKU, CAT, month, val, ALG);
        inserted++;
      }
    }
  }

  // Remove corrupted zero-value rows created by the buggy category-override
  const del = db.prepare(
    `DELETE FROM branch_overrides WHERE sku=? AND override_by='Category Team' AND (override_value=0 OR override_value IS NULL)`
  ).run(SKU);

  console.log(`forecast_runs: ${updated} updated, ${inserted} inserted`);
  console.log(`branch_overrides: ${del.changes} corrupted rows deleted`);
});

repairStmt();
db.close();
console.log('Done.');
