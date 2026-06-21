// Run a single scan + process cycle, then exit. Useful for testing.
import { runPipeline } from './processor.js';

runPipeline()
  .then((r) => {
    console.log('Done. New messages:', r.added);
    console.log('Status counts:', r.counts);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Pipeline failed:', err);
    process.exit(1);
  });
