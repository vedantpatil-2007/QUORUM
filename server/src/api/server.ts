import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const HOST = process.env.HOST || (isProduction ? '0.0.0.0' : 'localhost');

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log('\n==================================================');
  console.log('QUORUM REST API SERVER');
  console.log('==================================================');
  console.log(`Environment:      ${process.env.NODE_ENV || 'development'}`);
  console.log(`Binding:          http://${HOST}:${PORT}`);
  console.log(`Port:             ${PORT}`);
  console.log(`Health:           http://${HOST}:${PORT}/health`);
  console.log(`API Health:       http://${HOST}:${PORT}/api/health`);
  console.log(`Builders:         http://${HOST}:${PORT}/api/builders`);
  console.log(`Releases:         http://${HOST}:${PORT}/api/releases`);
  console.log(`Audit Ledger:     http://${HOST}:${PORT}/api/ledger`);
  console.log(`Ledger Verify:    http://${HOST}:${PORT}/api/ledger/verify`);
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
