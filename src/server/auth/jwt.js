import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';

let cachedToken = null;
let tokenExpiresAt = 0;

const TOKEN_LIFETIME_SECONDS = 4 * 60 * 60; // 4 hours
const REFRESH_MARGIN_SECONDS = 5 * 60; // refresh 5 min before expiry

export function generateToken(orgId, callCenterApiName, privateKeyPath) {
  const privateKey = fs.readFileSync(path.resolve(privateKeyPath));
  // Backdate `nbf` by 30s so minor clock drift between this host and
  // Salesforce doesn't trigger `invalid_grant: not yet valid`.
  const signOptions = {
    issuer: orgId,
    subject: callCenterApiName,
    expiresIn: `${TOKEN_LIFETIME_SECONDS}s`,
    notBefore: '-30s',
    algorithm: 'RS256',
  };
  const token = jwt.sign({}, privateKey, signOptions);
  cachedToken = token;
  tokenExpiresAt = Date.now() + (TOKEN_LIFETIME_SECONDS - REFRESH_MARGIN_SECONDS) * 1000;
  return token;
}

export function getToken(orgId, callCenterApiName, privateKeyPath) {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  return generateToken(orgId, callCenterApiName, privateKeyPath);
}

export function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}
