import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CERTS_DIR = 'certs';

function log(msg) {
  console.log(`[VoxCanvas Init] ${msg}`);
}

function ensureCertsDir() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
    log(`Created ${CERTS_DIR}/ directory`);
  }
}

function generateServerCert() {
  const certFile = path.join(CERTS_DIR, 'server.pem');
  const keyFile = path.join(CERTS_DIR, 'server.key');

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    log('HTTPS server certificate already exists, skipping.');
    return;
  }

  log('Generating self-signed HTTPS server certificate...');
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${keyFile} -out ${certFile} ` +
      `-days 365 -nodes -subj "/CN=VoxCanvas Local Dev"`,
    { stdio: 'inherit' }
  );
  log(`Created ${certFile} and ${keyFile}`);
}

function generateJwtKeyPair() {
  const keyFile = path.join(CERTS_DIR, 'jwt.key');
  const certFile = path.join(CERTS_DIR, 'jwt.pem');

  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    log('JWT key pair already exists, skipping.');
    return;
  }

  log('Generating RSA 2048-bit key pair for JWT signing...');
  execSync(`openssl genrsa -out ${keyFile} 2048`, { stdio: 'inherit' });
  execSync(
    `openssl req -new -x509 -key ${keyFile} -out ${certFile} ` +
      `-days 365 -subj "/CN=VoxCanvas JWT"`,
    { stdio: 'inherit' }
  );
  log(`Created ${keyFile} (private) and ${certFile} (upload to Salesforce Connected App)`);
}

function checkSfCli() {
  try {
    const version = execSync('sf version', { encoding: 'utf-8' }).trim();
    log(`Salesforce CLI detected: ${version}`);
    return true;
  } catch {
    log('Salesforce CLI not found (optional — you can configure manually via Setup Wizard).');
    return false;
  }
}

function createEnvIfMissing() {
  if (fs.existsSync('.env')) {
    log('.env file already exists, skipping.');
    return;
  }
  if (fs.existsSync('.env.example')) {
    fs.copyFileSync('.env.example', '.env');
    log('Created .env from .env.example — fill in your Salesforce credentials.');
  }
}

function main() {
  console.log('\n========================================');
  console.log('  VoxCanvas v2 — Initial Setup');
  console.log('========================================\n');

  ensureCertsDir();
  generateServerCert();
  generateJwtKeyPair();
  checkSfCli();
  createEnvIfMissing();

  console.log('\n========================================');
  console.log('  Setup complete!');
  console.log('========================================');
  console.log('\nNext steps:');
  console.log('  1. Upload certs/jwt.pem to your Salesforce Connected App');
  console.log('  2. Edit .env with your Salesforce credentials');
  console.log('  3. Run: npm run dev');
  console.log('  4. Open: https://127.0.0.1:3030');
  console.log('');
}

main();
