// Static-analysis test for the devboard read-only red-line.
//
// Defense in depth: even if a future controller author forgets the rule
// and writes `LlmUsage.findByIdAndUpdate(...)`, jest catches it before
// the change ships. Different test category from `e2e.test.js` —
// runtime HTTP tests can't catch a write path that's not exercised
// during a happy-path request.
//
// We grep every controller source file for forbidden mongoose write
// methods. New write methods should be added to FORBIDDEN as mongoose
// adds them.

const fs = require('fs');
const path = require('path');

const FORBIDDEN = [
  '.create(',
  '.insertOne(',
  '.insertMany(',
  '.updateOne(',
  '.updateMany(',
  '.findOneAndUpdate(',
  '.findByIdAndUpdate(',
  '.findOneAndReplace(',
  '.deleteOne(',
  '.deleteMany(',
  '.findOneAndDelete(',
  '.findByIdAndDelete(',
  '.replaceOne(',
  '.bulkWrite(',
  '.save(',
];

describe('read-only invariant (devboard never writes to the shared Atlas)', () => {
  test('no controller source file contains a mongoose write call', () => {
    const dir = path.join(__dirname, '..', 'src', 'controllers');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);

    const violations = [];
    for (const f of files) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const forbidden of FORBIDDEN) {
        if (content.includes(forbidden)) {
          violations.push(`${f}: contains "${forbidden}"`);
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        'devboard read-only red-line violated:\n  ' +
          violations.join('\n  ') +
          '\nDevboard MUST NOT write to the shared Atlas database.'
      );
    }
  });

  test('FORBIDDEN list itself is non-trivial — sanity check', () => {
    expect(FORBIDDEN.length).toBeGreaterThanOrEqual(10);
  });
});
