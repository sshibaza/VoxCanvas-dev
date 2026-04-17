---
title: Remove Connected App from VoxCanvas Setup
date: 2026-04-17
status: draft
---

# Remove Connected App from VoxCanvas Setup

## Background

Salesforce Spring '26 disables new Connected App creation by default in fresh
orgs; External Client App (ECA) is the successor. This blocks VoxCanvas's
current setup wizard, which asks users to create a Connected App and paste the
Consumer Key.

A runtime audit revealed that **VoxCanvas never actually uses the Consumer Key
or Username**:

- `SF_CONSUMER_KEY` is only checked for presence in `/api/setup/status`.
- `SF_USERNAME` is written to `.env` but never read.
- The SCRT2 JWT is signed with `iss=orgId`, `sub=callCenterApiName` and an
  empty body — the matching public key lives on the **Call Center record**
  (Setup → Contact Centers → Public Key), not on any Connected App.

This matches the official `salesforce-misc/byo-demo-connector` and
`salesforce/demo-scv-connector` patterns, which do not use a Connected App for
the Partner Telephony voice path.

Therefore: the Connected App step in the wizard was unnecessary from the
start, and removing it resolves the Spring '26 blocker without introducing an
ECA dependency.

## Goals

- Remove Connected App / Consumer Key / Username from the setup flow.
- Guide users to register the JWT public key on the Contact Center record
  (the place Partner Telephony actually validates against).
- Keep the wizard shorter, more accurate, and aligned with Salesforce's
  official Partner Telephony sample.
- Update README to reflect the correct procedure.

## Non-Goals

- Adding ECA support. Not needed for the Partner Telephony voice path.
  When VoxCanvas adds Messaging features in the future, ECA can be introduced
  then, scoped to that feature.
- Changing JWT signing, SCRT2 client, or call flow logic. The auth path is
  already correct — we are only removing misleading setup steps.
- Migrating existing users' `.env` files. Stale `SF_CONSUMER_KEY` /
  `SF_USERNAME` entries are harmless (no code reads them).

## Architecture

### Wizard step reshape

| # | Before                                      | After                                            |
|---|---------------------------------------------|--------------------------------------------------|
| 1 | Welcome                                     | Welcome                                          |
| 2 | Certificate                                 | Certificate                                      |
| 3 | **Connected App** (key, username, tenant)   | **Contact Center** (public key + tenant fields)  |
| 4 | Connect (test)                              | Connect (test)                                   |
| 5 | Verify                                      | Verify                                           |

The renamed step 3 combines two pieces:

1. **Public key display** — a read-only `<textarea>` showing `certs/jwt.pem`
   contents, plus a Copy button. Instructions guide the user to paste it into
   Setup → Contact Centers → (select VoxCanvas CC) → Public Key.
2. **Tenant fields** — SCRT Base URL, Org ID, Call Center API Name, Call
   Center Phone (moved unchanged from the old Connected App step).

Removed fields: Consumer Key, Username, Login URL.

### Backend changes

**`src/server/routes/setup.js`**:

- `/setup/status`: drop `hasConsumerKey` from the response and from the
  `configured` computation. `configured` becomes `hasEnv && hasCerts`.
- `/setup/complete`: remove `consumerKey` / `username` / `loginUrl` from the
  accepted body and from the sanitize list. Validate only the tenant fields.
- `/setup/complete`: stop writing `SF_CONSUMER_KEY`, `SF_USERNAME`,
  `SF_LOGIN_URL` to `.env`. Drop the `# Salesforce Connected App` section from
  the generated `.env` content.
- **New** `GET /setup/public-key`: returns `certs/jwt.pem` as `text/plain` so
  the wizard can display it in a textarea. Guarded by the existing
  `localhostOnly` middleware. 404s if the pem doesn't exist yet.

**`src/server/routes/health.js`**: no change (already only reports tenant
fields).

**`scripts/init.js`**: no change.

### Frontend changes

**`src/client/js/setup-app.js`**:

- Rename step id `connected-app` → `contact-center`; update label to
  "Contact Center".
- Rewrite the step 3 render block:
  - Fetch `/api/setup/public-key` on render; show pem in a `readonly`
    textarea with monospace font.
  - Copy button: `navigator.clipboard.writeText(pem)`, show toast-style
    confirmation.
  - Keep the four tenant inputs (SCRT Base URL, Org ID, Call Center API Name,
    Call Center Phone) with existing `state.*` binding and restore-on-back
    logic.
  - Remove Consumer Key, Username, Login URL inputs + the login URL button
    toggle code.
- In the `test` step, remove `consumerKey`/`username`/`loginUrl` from the
  validation check and the POST body.
- Remove the "Download jwt.pem for the Connected App" link in the certificate
  step result message; replace with "Certificates generated. Continue to the
  next step."

### Environment variables

Removed from `.env` template and `.env.example`:
- `SF_CONSUMER_KEY`
- `SF_USERNAME`
- `SF_LOGIN_URL`

Retained:
- `SERVER_PORT`, `SERVER_HOST`
- `SF_PRIVATE_KEY_PATH`, `HTTPS_CERT_PATH`, `HTTPS_KEY_PATH`
- `SF_SCRT_BASE_URL`, `SF_ORG_ID`, `CALL_CENTER_API_NAME`, `CALL_CENTER_PHONE`

**Also fix pre-existing bug in `.env.example`**: it is missing
`SF_SCRT_BASE_URL` and `SF_ORG_ID`, which the wizard-generated `.env` does
include. Add them to `.env.example` so manual (non-wizard) setup works.

### Files affected (consolidated)

| File                                   | Change                                          |
|----------------------------------------|-------------------------------------------------|
| `src/server/routes/setup.js`           | Remove consumerKey/username/loginUrl; add `/setup/public-key` endpoint |
| `src/client/js/setup-app.js`           | Rename step, rewrite step 3 render, remove Login URL toggle |
| `src/client/setup.html`                | No change (steps injected at runtime)           |
| `.env.example`                         | Remove Connected App section; add missing SCRT/Org ID |
| `README.md`                            | Rewrite Setup section per README Updates below  |

No changes: `src/server/auth/jwt.js`, `src/server/scrt2/client.js`,
`src/server/routes/health.js`, `src/server/index.js`, `scripts/init.js`,
`force-app/**`.

## Data flow

```
[Wizard step 2] generate certs → certs/jwt.pem, certs/jwt.key
[Wizard step 3] GET /api/setup/public-key → display pem + Copy
                user pastes pem into SF Contact Center Public Key field
                user fills SCRT Base URL, Org ID, Call Center API Name, Phone
[Wizard step 4] POST /api/setup/complete { scrtBaseUrl, orgId, ... }
                → writes .env (no Connected App section), calls scrt2Client.configure()
[Runtime]       jwt.js signs with iss=orgId, sub=callCenterApiName, private key
                SCRT2 validates signature against Contact Center's registered public key
```

## README updates

Flatten the current nested structure (`2. Salesforce Configuration` with
Connected App / Contact Center / Permission Sets / Service Console
subsections) into top-level numbered steps, and replace the Connected App
section with a Public Key registration section.

**New `## Setup` layout (all top-level headings, no nesting):**

1. **Generate Certificates** — `npm run init`. Unchanged.
2. **Deploy Contact Center** — `sf project deploy start --source-dir ...`.
   (Previously nested under Salesforce Configuration; now top-level.)
3. **Register JWT Public Key on Contact Center** — NEW. Copy the contents of
   `certs/jwt.pem` and paste into Setup → Contact Centers → (VoxCanvas CC) →
   Public Key → Save. Note: the Setup Wizard shows this pem content with a
   Copy button on step 3.
4. **Assign Permission Sets** — `sf org assign permset ...`. Unchanged.
5. **Configure Service Console** — Omni-Channel utility, Presence Status,
   Enhanced Conversation component. Unchanged.
6. **Set Tenant Values in .env** — NEW explicit step. Either run the Setup
   Wizard (recommended) or fill `SF_SCRT_BASE_URL`, `SF_ORG_ID`,
   `CALL_CENTER_API_NAME`, `CALL_CENTER_PHONE` manually in `.env`.
7. **Run** — `npm run dev` or `npm run build && npm start`. Unchanged.

**Deletions:**
- Entire "Connected App" subsection (lines that tell users to create a
  Connected App, upload jwt.pem to it, set `SF_CONSUMER_KEY`, `SF_USERNAME`).
- Any remaining `SF_CONSUMER_KEY` / `SF_USERNAME` references.

**Important Notes section — edits:**
- Keep as-is: 127.0.0.1 vs localhost note; self-signed cert warning; "Partner
  Telephony" naming note; ConversationVendorInfo metadata type note;
  loopback-only setup endpoints note.
- **Add**: "VoxCanvas does not use a Connected App or External Client App.
  The Partner Telephony voice path signs JWTs with the private key whose
  matching public key is registered directly on the Contact Center record.
  No OAuth Consumer Key is required."

## Error handling

- `/api/setup/public-key` returns 404 when `certs/jwt.pem` is missing. Wizard
  shows "Generate certificates first" with a Back button.
- Clipboard copy failure (e.g. clipboard API blocked) falls back to selecting
  the textarea and prompting the user to press Cmd/Ctrl-C.
- No changes to JWT signing error paths.

## Migration

None required. Users with existing `.env` files containing
`SF_CONSUMER_KEY` / `SF_USERNAME` / `SF_LOGIN_URL` will continue to work; the
values are simply ignored. On the next wizard run, `/setup/complete` writes a
fresh `.env` without those keys.

## Testing

Manual test plan:

1. Fresh repo, no `.env`, no `certs/`.
2. `npm run dev`, open setup wizard.
3. Step through each wizard step; confirm:
   - Step 2 generates certs.
   - Step 3 displays pem contents; Copy button copies to clipboard.
   - Step 3 accepts the four tenant fields.
   - Step 4 POSTs and writes `.env`; file contains no Connected App keys.
4. Restart server, hit `/api/health`, confirm `configured: true`.
5. Start a call end-to-end against a Salesforce sandbox where the Contact
   Center has `certs/jwt.pem` pasted into the Public Key field.

No automated tests added (the codebase has none; adding a test harness is out
of scope for this change).

## Open questions

None. Design finalized.
