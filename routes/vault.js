const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
    generateKey,
    generateIV,
    encryptFile,
    decryptFile
} = require("../core/encrypt");

const {
    splitKey
} = require("../core/keySplitter");

const {
    storeFragments,
    getFragments,
    getFragmentAvailability
} = require("../core/fragmentStore");

const {
    reconstructFromFragments
} = require("../core/reconstruct");

const {
    startDeadManSwitch,
    checkIn,
    stopDeadManSwitch,
    getDeadManSwitchStatus,
    getAllDeadManSwitches
} = require("../core/deadManSwitch");

const {
    createRecoveryRequest,
    getRecoveryRequest,
    approveRecovery,
    denyRecovery,
    getAllRecoveryRequests
} = require("../core/recoveryManager");

const router = express.Router();

// =====================================================
// STORAGE DIRECTORIES
// =====================================================

const uploadDir = path.join(__dirname, "..", "uploads");
const metaDir = path.join(__dirname, "..", "storage", "meta");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(metaDir, { recursive: true });

// =====================================================
// INPUT VALIDATION HELPER
// =====================================================

function isValidFileId(fileId) {
    return typeof fileId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(fileId);
}

function parseFragment(input) {
    if (!input || typeof input !== "string") return null;
    const trimmed = input.trim();
    // Base64 (32 bytes = 44 base64 chars with =)
    try {
        if (/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(trimmed)) {
            const buf = Buffer.from(trimmed, "base64");
            if (buf.length === 32) return buf;
        }
    } catch (e) {}
    // Hex (32 bytes = 64 hex chars)
    try {
        if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
            const buf = Buffer.from(trimmed, "hex");
            if (buf.length === 32) return buf;
        }
    } catch (e) {}
    return null;
}

// =====================================================
// MULTER CONFIGURATION
// =====================================================

const upload = multer({
    dest: uploadDir,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB file size limit
    }
});

// =====================================================
// GET /health
// =====================================================

router.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Quantum Vault",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// =====================================================
// GET /files
// =====================================================

router.get("/files", (req, res) => {
    try {
        const files = [];
        const entries = fs.readdirSync(uploadDir);
        const encFiles = entries.filter((f) => f.endsWith(".enc"));

        for (const encFile of encFiles) {
            const fileId = encFile.slice(0, -4);
            const encPath = path.join(uploadDir, encFile);
            const decPath = path.join(uploadDir, `${fileId}.decrypted`);
            const metaPath = path.join(metaDir, `${fileId}.json`);

            let meta = {
                fileId,
                originalName: encFile,
                size: 0,
                mimeType: "application/octet-stream",
                uploadedAt: null
            };

            if (fs.existsSync(metaPath)) {
                try {
                    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
                } catch (e) {
                    // Fallback to defaults
                }
            } else if (fs.existsSync(encPath)) {
                try {
                    const stat = fs.statSync(encPath);
                    meta.size = stat.size;
                    meta.uploadedAt = stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString();
                } catch (e) {}
            }

            const fragments = getFragmentAvailability(fileId);
            const deadMan = getDeadManSwitchStatus(fileId);
            const recovery = getRecoveryRequest(fileId);
            const isDecrypted = fs.existsSync(decPath);

            files.push({
                fileId,
                originalName: meta.originalName || `${fileId}.bin`,
                size: meta.size,
                mimeType: meta.mimeType || "application/octet-stream",
                uploadedAt: meta.uploadedAt,
                encryptedFile: encFile,
                decryptedFile: isDecrypted ? `${fileId}.decrypted` : null,
                isEncrypted: true,
                isDecrypted,
                fragments,
                deadManSwitch: deadMan,
                recoveryRequest: recovery
            });
        }

        // Sort most recently uploaded first
        files.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

        res.json({
            files,
            count: files.length
        });
    } catch (error) {
        console.error("List files error:", error);
        res.status(500).json({
            error: "Failed to list files"
        });
    }
});

// =====================================================
// GET /deadman/status/:fileId
// =====================================================

router.get("/deadman/status/:fileId", (req, res) => {
    try {
        const { fileId } = req.params;
        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        const status = getDeadManSwitchStatus(fileId);
        if (!status) {
            return res.status(404).json({
                error: "No dead-man switch found for this file"
            });
        }

        res.json(status);
    } catch (error) {
        console.error("Dead-man status error:", error);
        res.status(500).json({
            error: "Failed to get dead-man status"
        });
    }
});

// =====================================================
// GET /recovery/requests
// =====================================================

router.get("/recovery/requests", (req, res) => {
    try {
        const requests = getAllRecoveryRequests();
        res.json({
            requests,
            count: requests.length
        });
    } catch (error) {
        console.error("Recovery requests list error:", error);
        res.status(500).json({
            error: "Failed to list recovery requests"
        });
    }
});

// =====================================================
// GET /download/:fileId
// =====================================================

router.get("/download/:fileId", (req, res) => {
    try {
        const { fileId } = req.params;
        const { type } = req.query; // 'encrypted' or 'decrypted'

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        const metaPath = path.join(metaDir, `${fileId}.json`);
        let originalName = `${fileId}.bin`;
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
                if (meta.originalName) originalName = meta.originalName;
            } catch (e) {}
        }

        if (type === "encrypted") {
            const encPath = path.join(uploadDir, `${fileId}.enc`);
            if (!fs.existsSync(encPath)) {
                return res.status(404).json({
                    error: "Encrypted file not found"
                });
            }
            return res.download(encPath, `${originalName}.enc`);
        }

        const decPath = path.join(uploadDir, `${fileId}.decrypted`);
        if (!fs.existsSync(decPath)) {
            return res.status(404).json({
                error: "Decrypted file not available. File must be decrypted first."
            });
        }

        return res.download(decPath, originalName);
    } catch (error) {
        console.error("Download error:", error);
        res.status(500).json({
            error: "Download failed"
        });
    }
});

// =====================================================
// GET /preview/:fileId
// =====================================================

router.get("/preview/:fileId", (req, res) => {
    try {
        const { fileId } = req.params;

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        const decPath = path.join(uploadDir, `${fileId}.decrypted`);
        if (!fs.existsSync(decPath)) {
            return res.status(404).json({
                error: "Decrypted file not available. File must be decrypted first."
            });
        }

        const metaPath = path.join(metaDir, `${fileId}.json`);
        let meta = { originalName: `${fileId}.txt`, size: 0, mimeType: "text/plain" };
        if (fs.existsSync(metaPath)) {
            try {
                meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
            } catch (e) {}
        }

        const stat = fs.statSync(decPath);
        const ext = path.extname(meta.originalName || "").toLowerCase();
        const safeExtensions = [".txt", ".json", ".md", ".csv", ".log", ".xml", ".js", ".py", ".html", ".css", ".yaml", ".yml"];
        const isSafeText = safeExtensions.includes(ext) || (meta.mimeType && meta.mimeType.startsWith("text/"));

        if (!isSafeText || stat.size > 512 * 1024) {
            return res.json({
                canPreview: false,
                mimeType: meta.mimeType,
                originalName: meta.originalName,
                size: stat.size,
                message: "Binary format or large size (>512KB) not suitable for inline preview. Please use Download."
            });
        }

        const content = fs.readFileSync(decPath, "utf8");
        res.json({
            canPreview: true,
            mimeType: meta.mimeType,
            originalName: meta.originalName,
            size: stat.size,
            content: content
        });
    } catch (error) {
        console.error("Preview error:", error);
        res.status(500).json({
            error: "Failed to read preview"
        });
    }
});

// =====================================================
// POST /upload
// =====================================================

router.post(
    "/upload",
    upload.single("file"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "No file uploaded"
                });
            }

            const fileId = crypto.randomUUID();
            const key = generateKey();
            const iv = generateIV();
            const inputPath = req.file.path;
            const encryptedPath = path.join(uploadDir, `${fileId}.enc`);

            try {
                // Encrypt plaintext
                await encryptFile(
                    inputPath,
                    encryptedPath,
                    key,
                    iv
                );
            } finally {
                // Ensure plaintext temporary upload is always removed
                if (fs.existsSync(inputPath)) {
                    fs.unlinkSync(inputPath);
                }
            }

            // Split encryption key
            const fragments = splitKey(key);

            // Store fragments + IV
            storeFragments(
                fileId,
                fragments,
                iv
            );

            // Save file metadata
            const meta = {
                fileId,
                originalName: req.file.originalname,
                size: req.file.size,
                mimeType: req.file.mimetype || "application/octet-stream",
                uploadedAt: new Date().toISOString()
            };
            const metaPath = path.join(metaDir, `${fileId}.json`);
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

            // Start Dead-Man Switch
            startDeadManSwitch(fileId);

            res.json({
                message: "File uploaded and encrypted successfully",
                fileId: fileId,
                encryptedFile: `${fileId}.enc`,
                originalName: req.file.originalname,
                size: req.file.size
            });
        } catch (error) {
            console.error("Upload error:", error);
            res.status(500).json({
                error: "Something went wrong"
            });
        }
    }
);

// =====================================================
// POST /checkin
// =====================================================

router.post("/checkin", (req, res) => {
    try {
        const { fileId, timeoutSeconds } = req.body;

        if (!fileId) {
            return res.status(400).json({
                error: "fileId is required"
            });
        }

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        let customTimeoutMs;
        if (timeoutSeconds !== undefined && timeoutSeconds !== null && timeoutSeconds !== "") {
            const sec = parseInt(timeoutSeconds, 10);
            if (isNaN(sec) || sec <= 0 || sec > 86400 * 30) {
                return res.status(400).json({
                    error: "timeoutSeconds must be a positive integer (up to 30 days)"
                });
            }
            customTimeoutMs = sec * 1000;
        }

        const success = checkIn(fileId, customTimeoutMs, true);

        if (!success) {
            return res.status(404).json({
                error: "No active dead-man switch found"
            });
        }

        const status = getDeadManSwitchStatus(fileId);

        res.json({
            message: "Check-in successful",
            fileId: fileId,
            timeoutDuration: status ? status.timeoutDuration : 60000,
            remainingMs: status ? status.remainingMs : 60000,
            deadline: status ? status.deadline : null
        });
    } catch (error) {
        console.error("Check-in error:", error);
        res.status(500).json({
            error: "Check-in failed"
        });
    }
});

// =====================================================
// POST /deadman/timeout
// =====================================================

router.post("/deadman/timeout", (req, res) => {
    try {
        const { fileId, timeoutSeconds } = req.body;

        if (!timeoutSeconds) {
            return res.status(400).json({
                error: "timeoutSeconds is required"
            });
        }

        const sec = parseInt(timeoutSeconds, 10);
        if (isNaN(sec) || sec <= 0 || sec > 86400 * 30) {
            return res.status(400).json({
                error: "timeoutSeconds must be a positive integer (up to 30 days)"
            });
        }

        const customTimeoutMs = sec * 1000;

        if (fileId && fileId !== "all") {
            if (!isValidFileId(fileId)) {
                return res.status(400).json({
                    error: "Invalid fileId format"
                });
            }
            const success = checkIn(fileId, customTimeoutMs, true);
            if (!success) {
                return res.status(404).json({
                    error: "Dead-man switch not found"
                });
            }
            const status = getDeadManSwitchStatus(fileId);
            return res.json({
                message: `Timeout configured to ${sec}s for ${fileId}`,
                status
            });
        } else {
            // Apply across all switches
            const switches = getAllDeadManSwitches();
            let count = 0;
            for (const sw of switches) {
                if (sw.fileId) {
                    checkIn(sw.fileId, customTimeoutMs, true);
                    count++;
                }
            }
            return res.json({
                message: `Timeout configured to ${sec}s across ${count} switches`,
                count,
                timeoutSeconds: sec
            });
        }
    } catch (error) {
        console.error("Set timeout error:", error);
        res.status(500).json({
            error: "Failed to configure dead-man timeout"
        });
    }
});

// =====================================================
// POST /decrypt
// =====================================================

router.post("/decrypt", async (req, res) => {
    try {
        const { fileId, fragment1, fragment2, fragment3 } = req.body;

        if (!fileId) {
            return res.status(400).json({
                error: "fileId is required"
            });
        }

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        // Check whether a recovery request exists
        const recoveryRequest = getRecoveryRequest(fileId);

        // =================================================
        // AUTHORIZATION CHECK
        // =================================================

        if (recoveryRequest) {
            if (recoveryRequest.status !== "approved") {
                return res.status(403).json({
                    error: "Recovery has not been approved"
                });
            }
            console.log(`Approved recovery decryption: ${fileId}`);
        } else {
            console.log(`Normal decryption: ${fileId}`);
        }

        let key;
        let iv;

        const hasManualFragments = fragment1 !== undefined || fragment2 !== undefined || fragment3 !== undefined;

        if (hasManualFragments) {
            // Strict manual fragment path
            const f1 = parseFragment(fragment1);
            const f2 = parseFragment(fragment2);
            const f3 = parseFragment(fragment3);

            if (!f1 || !f2 || !f3) {
                return res.status(400).json({
                    error: "All three key fragments are required and must be valid 32-byte Base64 (44 characters) or Hex (64 characters) strings."
                });
            }

            // Reconstruct key directly from the 3 user-provided fragments
            key = reconstructFromFragments({
                fragment1: f1,
                fragment2: f2,
                fragment3: f3
            });

            // Retrieve IV from storage
            const ivPath = path.join(__dirname, "..", "storage", "keys", `${fileId}.iv`);
            if (!fs.existsSync(ivPath)) {
                return res.status(404).json({
                    error: "Initialization vector (IV) missing from vault storage"
                });
            }
            iv = Buffer.from(fs.readFileSync(ivPath, "utf8"), "base64");
        } else {
            // Stored fragment fallback for automated tests
            const stored = getFragments(fileId);

            if (!stored) {
                return res.status(404).json({
                    error: "Required fragments or IV not found"
                });
            }

            if (!stored.iv) {
                return res.status(404).json({
                    error: "Initialization vector (IV) missing"
                });
            }

            key = reconstructFromFragments(stored);
            iv = stored.iv;
        }

        // =================================================
        // ENCRYPTED FILE
        // =================================================

        const encryptedPath = path.join(uploadDir, `${fileId}.enc`);

        if (!fs.existsSync(encryptedPath)) {
            return res.status(404).json({
                error: "Encrypted file not found"
            });
        }

        // =================================================
        // OUTPUT FILE
        // =================================================

        const decryptedPath = path.join(uploadDir, `${fileId}.decrypted`);

        // =================================================
        // DECRYPT
        // =================================================

        try {
            await decryptFile(
                encryptedPath,
                decryptedPath,
                key,
                iv
            );
        } catch (decryptErr) {
            console.error("Decryption cipher error:", decryptErr.message);
            if (fs.existsSync(decryptedPath)) {
                try { fs.unlinkSync(decryptedPath); } catch (e) {}
            }
            return res.status(400).json({
                error: "Decryption failed: Key fragments are incorrect or corrupted for this file."
            });
        }

        // Stop timer
        stopDeadManSwitch(fileId);

        const metaPath = path.join(metaDir, `${fileId}.json`);
        let meta = { originalName: `${fileId}.bin`, size: 0, mimeType: "application/octet-stream" };
        if (fs.existsSync(metaPath)) {
            try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch (e) {}
        }

        res.json({
            message: "File decrypted successfully",
            fileId,
            decryptedFile: `${fileId}.decrypted`,
            originalName: meta.originalName,
            size: meta.size,
            mimeType: meta.mimeType
        });
    } catch (error) {
        console.error("Decryption error:", error);
        res.status(500).json({
            error: "Decryption failed"
        });
    }
});

// =====================================================
// POST /recovery/request
// =====================================================

router.post("/recovery/request", (req, res) => {
    try {
        const { fileId } = req.body;

        if (!fileId) {
            return res.status(400).json({
                error: "fileId is required"
            });
        }

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        const request = createRecoveryRequest(fileId);

        res.json({
            message: "Recovery request created",
            request: request
        });
    } catch (error) {
        console.error("Recovery request error:", error);
        res.status(500).json({
            error: "Failed to create recovery request"
        });
    }
});

// =====================================================
// GET /recovery/status/:fileId
// =====================================================

router.get("/recovery/status/:fileId", (req, res) => {
    try {
        const { fileId } = req.params;

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        const request = getRecoveryRequest(fileId);

        if (!request) {
            return res.status(404).json({
                error: "No recovery request found"
            });
        }

        res.json(request);
    } catch (error) {
        console.error("Recovery status error:", error);
        res.status(500).json({
            error: "Failed to get recovery status"
        });
    }
});

// =====================================================
// POST /recovery/approve
// =====================================================

router.post("/recovery/approve", (req, res) => {
    try {
        const { fileId } = req.body;

        if (!fileId) {
            return res.status(400).json({
                error: "fileId is required"
            });
        }

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        const success = approveRecovery(fileId);

        if (!success) {
            return res.status(404).json({
                error: "No recovery request found"
            });
        }

        res.json({
            message: "Recovery approved",
            fileId: fileId
        });
    } catch (error) {
        console.error("Recovery approval error:", error);
        res.status(500).json({
            error: "Failed to approve recovery"
        });
    }
});

// =====================================================
// POST /recovery/deny
// =====================================================

router.post("/recovery/deny", (req, res) => {
    try {
        const { fileId } = req.body;

        if (!fileId) {
            return res.status(400).json({
                error: "fileId is required"
            });
        }

        if (!isValidFileId(fileId)) {
            return res.status(400).json({
                error: "Invalid fileId format"
            });
        }

        const success = denyRecovery(fileId);

        if (!success) {
            return res.status(404).json({
                error: "No recovery request found"
            });
        }

        res.json({
            message: "Recovery denied",
            fileId: fileId
        });
    } catch (error) {
        console.error("Recovery denial error:", error);
        res.status(500).json({
            error: "Failed to deny recovery"
        });
    }
});

module.exports = router;