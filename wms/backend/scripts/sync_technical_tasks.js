require('dotenv').config();
const db = require('../src/db/knex');
const { syncTechnicalTaskDocument } = require('../src/services/document-sync');

async function main() {
  const orders = await db('orders')
    .select('id')
    .orderBy('created_at', 'asc');

  let synced = 0;
  for (const order of orders) {
    await syncTechnicalTaskDocument(order.id, { uploadedBy: null, notify: false });
    synced += 1;
    if (synced % 10 === 0) {
      console.log(`Synced ${synced}/${orders.length}`);
    }
  }

  console.log(`Technical tasks synced: ${synced}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
