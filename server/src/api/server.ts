import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = createApp();

const server = app.listen(PORT, () => {
  console.log('\n==================================================');
  console.log('QUORUM REST API SERVER');
  console.log('==================================================');
  console.log(`Port:             ${PORT}`);
  console.log(`Health:           http://localhost:${PORT}/api/health`);
  console.log(`Builders:         http://localhost:${PORT}/api/builders`);
  console.log(`Releases:         http://localhost:${PORT}/api/releases`);
  console.log(`Audit Ledger:     http://localhost:${PORT}/api/ledger`);
  console.log(`Ledger Verify:    http://localhost:${PORT}/api/ledger/verify`);
  console.log('==================================================\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  server.close(() => {
    console.log('\nQuorum API server closed cleanly.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('\nQuorum API server closed cleanly.');
    process.exit(0);
  });
});
