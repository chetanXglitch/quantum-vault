# 🔐 Quantum Vault

**A Secure File Vault with AES-256 Encryption, Key Fragmentation, and Dead-Man Switch Recovery**

Quantum Vault is a Node.js and Express-based secure file storage prototype designed to protect sensitive files through encryption and controlled recovery workflows. It combines AES-256-CBC encryption, XOR-based encryption-key fragmentation, distributed fragment storage, a dead-man switch, and recovery request management.

> **Note:** Quantum Vault explores security mechanisms relevant to secure storage. The current implementation does not establish full post-quantum cryptographic security.

## ✨ Features

- **AES-256-CBC Encryption:** Encrypts uploaded files using a randomly generated 256-bit AES key.
- **Random IV Generation:** Generates a 128-bit Initialization Vector for CBC encryption.
- **XOR-Based Key Fragmentation:** Splits the encryption key into three fragments.
- **Multi-Location Fragment Storage:** Stores fragments across local storage, backup storage, and application memory.
- **Dead-Man Switch:** Tracks check-ins and expires file-related timer states when the deadline passes.
- **Recovery Management:** Supports creating, checking, approving, and denying recovery requests.
- **REST API:** Provides endpoints for uploading, decrypting, and managing protected files.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | Backend server and REST API |
| Node.js Crypto | Encryption, random key generation, IV generation, and XOR-related cryptographic operations |
| Multer | Handling file uploads |
| File System (`fs`) | Encrypted-file and fragment storage |
| JavaScript Maps | In-memory fragment and recovery-state management |

## 🏗️ Architecture

```text
                   Client
                     |
                     v
              Express.js Server
                     |
             File Upload Endpoint
                     |
                     v
             AES-256-CBC Encryption
                /           \
               v             v
        Encrypted File    Random IV
          (.enc file)    (stored separately)
               |
               v
        Generate AES Key
               |
               v
        XOR Key Fragmentation
               |
        +------+------+ 
        |      |      |
        v      v      v
    Fragment Fragment Fragment
        1      2      3
        |      |      |
        v      v      v
      Local  Backup   RAM
      Disk    Disk   Memory

               |
               v
        Dead-Man Switch
               |
               v
        Recovery Management
               |
               v
        Authorized Decryption
```

## 🔑 Encryption and Key Management

### 1. AES-256-CBC

Quantum Vault uses the Advanced Encryption Standard (AES) with a 256-bit key in Cipher Block Chaining (CBC) mode.

- **Algorithm:** AES-256-CBC
- **Key size:** 256 bits (32 bytes)
- **IV size:** 128 bits (16 bytes)

The encryption key is generated using a cryptographically secure random-number generator. The IV is generated separately.

### 2. Initialization Vector (IV)

The Initialization Vector is a 16-byte value required by AES-CBC.

Its purpose is to initialize the CBC encryption process so that encrypting the same plaintext with the same key can produce different ciphertext when a fresh, unpredictable IV is used.

The IV is not a secret key and does not need to be confidential. However, it must be retained alongside the encrypted data so that the file can be decrypted later.

### 3. XOR-Based Key Fragmentation

The generated 256-bit AES key is split into three fragments using XOR operations.

Let the original key be \(K\), and the fragments be \(F_1\), \(F_2\), and \(F_3\).

The reconstruction operation is:

`K = F1 XOR F2 XOR F3`

All three fragments are required by the current reconstruction implementation.

| Fragment | Storage location |
|---|---|
| Fragment 1 | `storage/keys/` |
| Fragment 2 | `storage/backup/` |
| Fragment 3 | Application RAM |

The objective is to avoid storing the entire encryption key as a single persistent value. However, the protection this provides depends on access controls and the separation of the storage locations.

**Important:** This is a three-fragment XOR scheme, not a threshold-based secret-sharing scheme. Loss of any fragment prevents reconstruction using the current method.

## ⏱️ Dead-Man Switch

The dead-man switch tracks check-ins for protected files.

Its current implementation uses a 60-second demonstration timeout.

The workflow is:

1. Start the timer for a file.
2. Record periodic check-ins.
3. Reset the deadline when a check-in is received.
4. Mark the timer state as `expired` if the deadline passes.
5. Allow the application to inspect the resulting state.

The current expiration behavior changes the timer state and logs a message. It does not automatically delete files, destroy encryption keys, or notify a trusted contact.

## ♻️ Recovery Workflow

Quantum Vault includes a recovery request mechanism for managing access to protected files.

The general workflow is:

1. Create a recovery request for a file.
2. Track its status.
3. Approve or deny the request.
4. Attempt decryption after the required approval check.
5. Reconstruct the encryption key from its fragments and decrypt the file.

Recovery requests are maintained in application memory in the current implementation, so they are not guaranteed to survive a server restart.

## 📁 Project Structure

```text
quantum-vault/
├── server.js
├── routes/
│   └── vault.js
├── core/
│   ├── encrypt.js
│   ├── keySplitter.js
│   ├── fragmentStore.js
│   ├── deadManSwitch.js
│   └── recoveryManager.js
├── storage/
│   ├── keys/
│   └── backup/
├── package.json
└── README.md
```

The structure above represents the principal modules discussed in the project. Check the repository for any additional files or differences in the current directory layout.

## 🚀 Getting Started

### Prerequisites

- Node.js
- npm
- Git

### Installation

Clone the repository:

```bash
git clone https://github.com/chetanXglitch/quantum-vault.git
cd quantum-vault
```

Install the project dependencies:

```bash
npm install
```

### Running the Server

Start the application using the command configured in your project:

```bash
node server.js
```

The server is configured to listen on port `3000`.

For local development, the application should be accessible at:

`http://localhost:3000`

Use only the routes and HTTP methods actually defined in `routes/vault.js`. Refer to that file for the exact API request formats.

## 🔌 API Overview

The project includes the following API operations:

| Endpoint | Method | Purpose |
|---|---|---|
| `/upload` | POST | Upload and encrypt a file |
| `/decrypt` | POST | Request file decryption |
| `/recovery/request` | POST | Create a recovery request |
| `/recovery/status/:fileId` | GET | Check recovery status |
| `/recovery/approve` | POST | Approve a recovery request |
| `/recovery/deny` | POST | Deny a recovery request |

These paths describe the implemented route names. Required parameters, request bodies, authentication requirements, and response formats should be verified in the route definitions.

## 🛡️ Security Considerations

Quantum Vault is a security-focused prototype, not a production-ready storage service.

- **Encryption integrity:** AES-CBC does not authenticate ciphertext. Consider migrating to AES-256-GCM or implementing a correctly designed encrypt-then-MAC construction.
- **Key separation:** Storing fragments in separate directories does not guarantee security if an attacker can access the entire machine.
- **RAM persistence:** The third fragment is lost when the Node.js process terminates, potentially making stored files unrecoverable.
- **Recovery authorization:** Recovery approvals need strong authentication, authorization, and audit logging.
- **Plaintext handling:** Temporary uploaded files and decrypted output require appropriate permissions, cleanup, and access controls.
- **IV handling:** Generate a fresh, unpredictable IV for each CBC encryption under the same key.
- **Secret management:** Production deployments require a robust key-management and backup strategy.
- **Dead-man switch reliability:** Timers, persistent state, restart behavior, and notification mechanisms need additional safeguards.

### Is Quantum Vault Post-Quantum Secure?

Not in its current form based on the implemented modules described here.

AES-256 remains a strong symmetric encryption algorithm, including in the context of known quantum search attacks. However, the project does not become post-quantum secure merely by using AES-256 or splitting its key.

A fuller post-quantum design would need to specify and implement appropriate post-quantum cryptographic mechanisms where required, such as standardized ML-KEM for key establishment. Its security would also depend on the complete system design and implementation.

## 🎯 Project Objectives

- Explore secure file encryption and decryption.
- Understand symmetric cryptography and initialization vectors.
- Implement encryption-key fragmentation and reconstruction.
- Study file-storage security and in-memory secret management.
- Design a timed check-in mechanism.
- Implement a recovery-request workflow.
- Identify practical security limitations and possible improvements.

## 🔮 Future Enhancements

- Replace CBC encryption with authenticated encryption using AES-256-GCM.
- Implement persistent, access-controlled key management.
- Introduce a properly designed threshold secret-sharing mechanism if partial recovery is required.
- Add user authentication, role-based authorization, and secure recovery approvals.
- Add audit logging and security-event monitoring.
- Improve crash recovery and timer persistence.
- Explore standardized post-quantum key establishment and hybrid cryptographic designs.
- Add automated tests, API documentation, and security testing.

## 👨‍💻 Author

**Chetan BN**

GitHub: [@chetanXglitch](https://github.com/chetanXglitch)

Project: [Quantum Vault](https://github.com/chetanXglitch/quantum-vault)

---

*Quantum Vault is intended for educational and authorized security research. Do not use it to protect sensitive production data without a thorough security review.*
