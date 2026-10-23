# 🔐 Quantum Vault

**A Full-Stack Cryptographic File Vault with AES-256 Encryption, 3-Way XOR Key Fragmentation, Manual Three-Key Decryption Wizard, Dead-Man Switch Heartbeat, and Emergency Recovery**

Quantum Vault is a cybersecurity application featuring an Express.js backend and a dark-graphite dashboard. It protects sensitive files through symmetric encryption, distributed multi-location key fragmentation, strict manual three-fragment decryption, an automated dead-man switch countdown with proactive reminders, and an access-controlled recovery workflow.

> **Security Transparency Notice:** Quantum Vault is an educational and security-research prototype exploring key fragmentation and access-control patterns. As documented below, it uses AES-256-CBC and 3-way XOR secret sharing. It does not provide post-quantum security or authenticated encryption in its current implementation.

---

## ✨ System Features

### 1. Six Distinct Application Views
- **Dashboard:** High-level cybersecurity overview showing system health, active dead-man switches, vault storage statistics, and recently protected files. Uses empty states when no files exist.
- **Secure Vault (Upload & Encrypt):** Large drag-and-drop zone with multi-file support, real-time progress bar, file ID generation, and immediate plaintext deletion. Never displays raw keys or key fragments on the upload screen.
- **Decrypt Files (Strict Manual Three-Key Decryption):** Dedicated 4-step wizard that enforces manual, sequential entry of all three required key fragments. Never auto-fetches or prefills keys from the server.
- **Dead-Man Switch:** Centralized heartbeat monitoring station featuring a prominent **CHECK IN NOW** hero action, real-time countdown tickers, last check-in timestamps, configured timeouts, next deadlines, and an interactive approaching-deadline reminder modal.
- **Persistent Notification Center:** Universal top bar with latest event snippet, slide-out notification drawer, and a full-page notification audit log with filtering by severity (Alerts, Success, Errors).
- **Recovery Center:** Custodian portal to lodge emergency recovery requests, inspect pending petitions, and approve or deny emergency decryption access.

### 2. Cryptographic Architecture
- **AES-256-CBC File Encryption:** Encrypts uploaded files on-the-fly using a unique, cryptographically random 256-bit AES key.
- **Unique 128-bit IV Generation:** Generates a unique Initialization Vector per file, stored in `storage/keys/{fileId}.iv`.
- **3-Way XOR Key Splitting:** Partitions the 256-bit AES key into 3 fragments using XOR logic ($K = F_1 \oplus F_2 \oplus F_3$). All three fragments are required for key reconstruction.
- **Multi-Location Fragment Distribution:**
  - **Fragment 1:** Persistent local disk storage (`storage/keys/{fileId}.part1`).
  - **Fragment 2:** Redundant backup storage (`storage/backup/{fileId}.part2`).
  - **Fragment 3:** Volatile process memory (RAM `Map`) + custodian copy (`storage/keys/{fileId}.part3`).
- **Path Traversal Protection:** All file identifiers and endpoints are strictly validated against alphanumeric UUID patterns to eliminate directory traversal risks.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend Runtime** | Node.js (CommonJS) | Server runtime |
| **HTTP Framework** | Express 5.x | REST API & static asset server |
| **Cryptography** | Node.js `crypto` | AES-256-CBC, CSPRNG randomBytes, XOR fragment reconstruction |
| **File Ingestion** | Multer 2.x | Multipart form-data handling with 50MB size enforcement |
| **Frontend UI** | HTML5, Vanilla CSS3, Modern JS | Clean dark-graphite dashboard without framework dependencies |
| **State & Storage** | Local filesystem & Node.js Memory | Ciphertext, metadata, disk fragments, and volatile RAM fragments |

---

## 🔑 Decrypt Files — Strict Manual Three-Key Wizard

The Decrypt Files interface enforces strict manual key entry:

```text
Step A: Select Encrypted File from Vault
   │
   ▼
Step 1: Enter Key Fragment 1 (Masked, eye toggle, 32-byte Base64/Hex validation)
   │  [Continue]
   ▼
Step 2: Enter Key Fragment 2 (Masked, eye toggle, 32-byte Base64/Hex validation)
   │  [Continue]
   ▼
Step 3: Enter Key Fragment 3 (Masked, eye toggle, 32-byte Base64/Hex validation)
   │  [Continue]
   ▼
Step 4: Final Confirmation Screen
   │  [Click "Decrypt File"]
   ▼
Reconstruct Key ($K = F_1 \oplus F_2 \oplus F_3$) & Execute Decryption
   │
   ├─► Success: Inline Text Preview (<512KB) + Download Decrypted File
   └─► Failure: Safe rejection (HTTP 400), key fields cleared from UI memory
```

### Key Security Guarantees:
1. **Zero Auto-Fetch:** The decryption page never requests, fetches, or auto-populates key fragments from the server or local storage.
2. **Ephemeral In-Memory State:** Key fragment values exist only in volatile JavaScript variables during the wizard session.
3. **No Secret Persistence:** Key fragments are never saved in `localStorage`, `sessionStorage`, cookies, URLs, console logs, or notification history.
4. **Immediate Purge:** All three key fragment fields are cleared from in-memory UI state immediately upon clicking Decrypt File or Reset.
5. **Format Validation:** Accepts 32-byte keys formatted either as 44-character Base64 strings or 64-character Hexadecimal strings.

---

## ⏱️ Dead-Man Switch & Heartbeat Notifications

Every uploaded file automatically starts an active 60-second Dead-Man Switch.

- **Check-in Action:** Clicking **CHECK IN NOW** sends `POST /checkin` with `{ "fileId": "<UUID>" }`. The backend resets the 60-second deadline and returns confirmation.
- **Proactive Reminder Modal:** When an active switch reaches $\le 20$ seconds before expiration, a non-blocking reminder modal appears with:
  - **Check In Now:** Immediately executes the check-in request and closes the modal upon server confirmation.
  - **Remind Me Later:** Snoozes the reminder modal for 10 seconds without falsely extending the server-side deadline.
- **Expiration:** If the timer reaches 0 without a check-in, the switch transitions to `expired` status and enters the emergency recovery state.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended; tested on v24)
- npm (v9 or higher)

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/chetanXglitch/quantum-vault.git
cd quantum-vault
npm install
```

### Running the Server
Start the unified application (serves both API and Frontend):
```bash
npm start
```
The application will be accessible in your browser at:
👉 **`http://localhost:3000`**

To specify a custom port:
```bash
PORT=8080 npm start
```

---

## 🧪 Testing and Verification

The repository includes a comprehensive test suite covering cryptographic primitives, key splitting, storage handlers, and API routes.

Run all tests:
```bash
# On Windows PowerShell:
cmd /c npm test

# On Linux / macOS / Bash:
npm test
```

### Test Suites Included:
1. **`test-encryption.js`**: Validates AES-256-CBC cipher stream encryption and decryption.
2. **`test-split.js`**: Validates 3-way XOR splitting and bit-for-bit key reconstruction.
3. **`test-storage.js`**: Validates multi-location fragment storage (Disk, Backup, RAM) and teardown.
4. **`test-api.js`**: Comprehensive 12-stage integration suite:
   - `GET /health` service handshake.
   - `POST /upload` multipart file encryption and ciphertext validation.
   - `GET /files` metadata listing with fragment availability flags.
   - `GET /deadman/status/:fileId` countdown query.
   - `POST /checkin` active switch reset and 404 rejection for unknown IDs.
   - Path traversal prevention across all routes (UUID regex verification).
   - Recovery request creation, pending state decryption blocking (403), approval, and authorization.
   - Decrypted payload verification against original plaintext.
   - Encrypted ciphertext download (`?type=encrypted`).
   - Safe text preview (`GET /preview/:fileId`).
   - Manual three-fragment decryption workflow with corrupted fragment rejection (`400 Bad Request`) and valid fragment reconstruction.

---

## 🔌 API Reference

### Health & Inventory
- **`GET /health`**: Returns service status, uptime, and timestamp.
- **`GET /files`**: Returns a list of all protected files, metadata, fragment availability (`part1Disk`, `part2Backup`, `part3Ram`), Dead-Man switch status, and recovery state. Never exposes raw keys or fragments.

### File Operations
- **`POST /upload`**: Uploads and encrypts a file (`multipart/form-data` with `file` field). Returns `{ fileId, encryptedFile, originalName, size }`.
- **`POST /decrypt`**: Decrypts `{fileId}.enc` to `{fileId}.decrypted`.
  - Manual 3-key mode: `{ "fileId": "<UUID>", "fragment1": "<base64/hex>", "fragment2": "<base64/hex>", "fragment3": "<base64/hex>" }`
  - Automated mode: `{ "fileId": "<UUID>" }` (uses stored fragments if available).
- **`GET /preview/:fileId`**: Returns safe inline text preview (`{ canPreview: boolean, mimeType, content, message }`). Supports text/json/markdown < 512KB.
- **`GET /download/:fileId`**: Downloads the decrypted file (with original filename) or encrypted ciphertext (`?type=encrypted`).

### Dead-Man Switch
- **`POST /checkin`**: Resets the 60-second countdown for an active switch.
  - Body: `{ "fileId": "<UUID>" }`
- **`GET /deadman/status/:fileId`**: Returns real-time status, deadline, and remaining milliseconds.

### Recovery Center
- **`POST /recovery/request`**: Lodges an emergency recovery request for a file.
  - Body: `{ "fileId": "<UUID>" }`
- **`GET /recovery/status/:fileId`**: Checks the status of a recovery request (`pending`, `approved`, `denied`).
- **`GET /recovery/requests`**: Returns all active and historical recovery requests.
- **`POST /recovery/approve`**: Approves a pending recovery request.
  - Body: `{ "fileId": "<UUID>" }`
- **`POST /recovery/deny`**: Denies a pending recovery request.
  - Body: `{ "fileId": "<UUID>" }`

---

## 🛡️ Security Limitations & Production Recommendations

Quantum Vault is designed as an architectural exploration of cryptographic workflows. Prior to any production deployment, the following limitations must be addressed:

1. **Unauthenticated Cipher Mode:**
   - *Current Implementation:* AES-256-CBC does not authenticate ciphertext blocks.
   - *Recommendation:* Upgrade to an authenticated encryption mode such as **AES-256-GCM** or ChaCha20-Poly1305 with an authentication tag (AEAD).
2. **Volatile In-Memory Key Fragments:**
   - *Current Implementation:* Fragment 3 is stored in process RAM (`memoryFragments`) with a custodian copy in `storage/keys`. If the Node.js server restarts, RAM fragments are wiped and must be restored from custodian storage.
   - *Recommendation:* In production, distribute Fragment 3 to an external Hardware Security Module (HSM), a dedicated KMS (e.g., HashiCorp Vault, AWS KMS), or a remote peer node.
3. **Host Storage Separation:**
   - *Current Implementation:* Storing Fragment 1 in `storage/keys` and Fragment 2 in `storage/backup` on the same physical host provides logical separation but no protection against host root compromise.
   - *Recommendation:* Store fragments across physically isolated cloud availability zones or separate cryptographic enclaves.
4. **Secret Sharing Scheme:**
   - *Current Implementation:* 3-way XOR requires strictly 3 of 3 fragments ($n$-of-$n$).
   - *Recommendation:* Implement **Shamir's Secret Sharing (SSSS)** to support $k$-of-$n$ threshold recovery (e.g., 3-of-5 custodians required).
5. **Authentication and Authorization:**
   - *Current Implementation:* The API does not enforce user authentication or role-based access control (RBAC). Any client on the network can approve recovery requests.
   - *Recommendation:* Implement OpenID Connect / JWT authentication, role-based authorization for custodians, and multi-party authorization (multi-signature) for recovery approvals.
6. **Post-Quantum Cryptography (PQC):**
   - *Current Implementation:* Symmetric 256-bit AES encryption offers high security against classical and Grover-accelerated brute-force attacks. However, the system does not implement quantum-resistant public-key mechanisms.
   - *Recommendation:* Adopt standardized post-quantum algorithms (e.g., NIST FIPS 203 ML-KEM for key encapsulation and FIPS 204 ML-DSA for digital signatures).

---

## 👨‍💻 Authors & License

- **Author:** Chetan BN ([@chetanXglitch](https://github.com/chetanXglitch))
- **Project:** [Quantum Vault](https://github.com/chetanXglitch/quantum-vault)
- **License:** ISC

