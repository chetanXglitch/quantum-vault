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
    getFragments
} = require("../core/fragmentStore");

const {
    reconstructFromFragments
} = require("../core/reconstruct");

const {
    startDeadManSwitch,
    checkIn,
    stopDeadManSwitch
} = require("../core/deadManSwitch");

const {
    createRecoveryRequest,
    getRecoveryRequest,
    approveRecovery,
    denyRecovery
} = require("../core/recoveryManager");


const router = express.Router();


// =====================================================
// UPLOAD DIRECTORY
// =====================================================

const uploadDir = path.join(
    __dirname,
    "..",
    "uploads"
);

fs.mkdirSync(uploadDir, {
    recursive: true
});


// =====================================================
// MULTER
// =====================================================

const upload = multer({
    dest: uploadDir
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


            const fileId =
                crypto.randomUUID();


            const key =
                generateKey();


            const iv =
                generateIV();


            const inputPath =
                req.file.path;


            const encryptedPath =
                path.join(
                    uploadDir,
                    `${fileId}.enc`
                );


            // Encrypt plaintext
            await encryptFile(
                inputPath,
                encryptedPath,
                key,
                iv
            );


            // Split encryption key
            const fragments =
                splitKey(key);


            // Store fragments + IV
            storeFragments(
                fileId,
                fragments,
                iv
            );


            // Start Dead-Man Switch
            startDeadManSwitch(
                fileId
            );


            // Delete plaintext
            fs.unlinkSync(
                inputPath
            );


            res.json({

                message:
                    "File uploaded and encrypted successfully",

                fileId:

                    fileId,

                encryptedFile:

                    `${fileId}.enc`
            });


        } catch (error) {

            console.error(
                "Upload error:",
                error
            );

            res.status(500).json({

                error:
                    "Something went wrong"
            });
        }
    }
);


// =====================================================
// POST /checkin
// =====================================================

router.post(
    "/checkin",
    (req, res) => {

        try {

            const { fileId } =
                req.body;


            if (!fileId) {

                return res.status(400).json({

                    error:
                        "fileId is required"
                });
            }


            const success =
                checkIn(fileId);


            if (!success) {

                return res.status(404).json({

                    error:
                        "No active dead-man switch found"
                });
            }


            res.json({

                message:
                    "Check-in successful",

                fileId:
                    fileId
            });


        } catch (error) {

            console.error(
                "Check-in error:",
                error
            );

            res.status(500).json({

                error:
                    "Check-in failed"
            });
        }
    }
);


// =====================================================
// POST /decrypt
// =====================================================

router.post(
    "/decrypt",
    async (req, res) => {

        try {

            const { fileId } =
                req.body;


            if (!fileId) {

                return res.status(400).json({

                    error:
                        "fileId is required"
                });
            }


            // Check whether a recovery request exists
            const recoveryRequest =
                getRecoveryRequest(fileId);


            // Get key fragments + IV
            const stored =
                getFragments(fileId);


            if (!stored) {

                return res.status(404).json({

                    error:
                        "Required fragments or IV not found"
                });
            }


            // =================================================
            // AUTHORIZATION CHECK
            // =================================================

            if (recoveryRequest) {

                if (
                    recoveryRequest.status !==
                    "approved"
                ) {

                    return res.status(403).json({

                        error:
                            "Recovery has not been approved"
                    });
                }

                console.log(
                    `Approved recovery decryption: ${fileId}`
                );

            } else {

                console.log(
                    `Normal decryption: ${fileId}`
                );
            }


            // =================================================
            // RECONSTRUCT KEY
            // =================================================

            const key =
                reconstructFromFragments(
                    stored
                );


            // =================================================
            // ENCRYPTED FILE
            // =================================================

            const encryptedPath =
                path.join(
                    uploadDir,
                    `${fileId}.enc`
                );


            if (
                !fs.existsSync(
                    encryptedPath
                )
            ) {

                return res.status(404).json({

                    error:
                        "Encrypted file not found"
                });
            }


            // =================================================
            // OUTPUT FILE
            // =================================================

            const decryptedPath =
                path.join(
                    uploadDir,
                    `${fileId}.decrypted`
                );


            // =================================================
            // DECRYPT
            // =================================================

            await decryptFile(
                encryptedPath,
                decryptedPath,
                key,
                stored.iv
            );


            // Stop timer
            stopDeadManSwitch(
                fileId
            );


            res.json({

                message:
                    "File decrypted successfully",

                decryptedFile:
                    `${fileId}.decrypted`
            });


        } catch (error) {

            console.error(
                "Decryption error:",
                error
            );

            res.status(500).json({

                error:
                    "Decryption failed"
            });
        }
    }
);


// =====================================================
// POST /recovery/request
// =====================================================

router.post(
    "/recovery/request",
    (req, res) => {

        try {

            const { fileId } =
                req.body;


            if (!fileId) {

                return res.status(400).json({

                    error:
                        "fileId is required"
                });
            }


            const request =
                createRecoveryRequest(
                    fileId
                );


            res.json({

                message:
                    "Recovery request created",

                request:
                    request
            });


        } catch (error) {

            console.error(
                "Recovery request error:",
                error
            );

            res.status(500).json({

                error:
                    "Failed to create recovery request"
            });
        }
    }
);


// =====================================================
// GET /recovery/status/:fileId
// =====================================================

router.get(
    "/recovery/status/:fileId",
    (req, res) => {

        try {

            const { fileId } =
                req.params;


            const request =
                getRecoveryRequest(
                    fileId
                );


            if (!request) {

                return res.status(404).json({

                    error:
                        "No recovery request found"
                });
            }


            res.json(
                request
            );


        } catch (error) {

            console.error(
                "Recovery status error:",
                error
            );

            res.status(500).json({

                error:
                    "Failed to get recovery status"
            });
        }
    }
);


// =====================================================
// POST /recovery/approve
// =====================================================

router.post(
    "/recovery/approve",
    (req, res) => {

        try {

            const { fileId } =
                req.body;


            if (!fileId) {

                return res.status(400).json({

                    error:
                        "fileId is required"
                });
            }


            const success =
                approveRecovery(
                    fileId
                );


            if (!success) {

                return res.status(404).json({

                    error:
                        "No recovery request found"
                });
            }


            res.json({

                message:
                    "Recovery approved",

                fileId:
                    fileId
            });


        } catch (error) {

            console.error(
                "Recovery approval error:",
                error
            );

            res.status(500).json({

                error:
                    "Failed to approve recovery"
            });
        }
    }
);


// =====================================================
// POST /recovery/deny
// =====================================================

router.post(
    "/recovery/deny",
    (req, res) => {

        try {

            const { fileId } =
                req.body;


            if (!fileId) {

                return res.status(400).json({

                    error:
                        "fileId is required"
                });
            }


            const success =
                denyRecovery(
                    fileId
                );


            if (!success) {

                return res.status(404).json({

                    error:
                        "No recovery request found"
                });
            }


            res.json({

                message:
                    "Recovery denied",

                fileId:
                    fileId
            });


        } catch (error) {

            console.error(
                "Recovery denial error:",
                error
            );

            res.status(500).json({

                error:
                    "Failed to deny recovery"
            });
        }
    }
);


module.exports = router;