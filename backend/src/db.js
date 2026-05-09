const mongoose = require('mongoose');

async function connect() {
  if (!process.env.DATABASE) {
    throw new Error(
      '[db] DATABASE env not set. Copy Ola_devboard/.env.example -> .env at the repo root.'
    );
  }
  await mongoose.connect(process.env.DATABASE);
  console.log('[db] connected to Atlas');
}

mongoose.connection.on('disconnected', () => {
  console.warn('[db] mongoose disconnected — auto-reconnect handled by driver');
});
mongoose.connection.on('error', (err) => {
  console.error('[db] mongoose connection error:', err && err.message);
});

module.exports = { connect };
