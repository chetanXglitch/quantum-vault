const fs = require("fs");
const path = require("path");

// =====================================================
// IN-MEMORY STORAGE
// PART 3 is intentionally stored only in RAM
// =====================================================

const memoryFragments = new Map();


// =====================================================
// STORAGE PATHS
// =====================================================

const keysPath = path.join(
    __dirname,
    "..",
    "storage",
    "keys"
);

const backupPath = path.join(
    __dirname,
    "..",
    "storage",
    "backup"
);


// Create directories if they don't exist
fs.mkdirSync(keysPath, {
    recursive: true
});

fs.mkdirSync(backupPath, {
    recursive: true
});


// =====================================================
// STORE FRAGMENTS
// =====================================================

function storeFragments(fileId, fragments, iv) {

    console.log("storeFragments called");
    console.log("fileId:", fileId);


    // -------------------------------------------------
    // PART 1 → Filesystem
    // -------------------------------------------------

    const part1Path = path.join(
        keysPath,
        `${fileId}.part1`
    );

    fs.writeFileSync(
        part1Path,
        fragments.fragment1.toString("base64")
    );


    // -------------------------------------------------
    // PART 2 → Backup storage
    // -------------------------------------------------

    const part2Path = path.join(
        backupPath,
        `${fileId}.part2`
    );

    fs.writeFileSync(
        part2Path,
        fragments.fragment2.toString("base64")
    );


    // -------------------------------------------------
    // PART 3 → RAM
    // -------------------------------------------------

    memoryFragments.set(
        fileId,
        fragments.fragment3
    );


    // -------------------------------------------------
    // IV → Filesystem
    // -------------------------------------------------

    const ivPath = path.join(
        keysPath,
        `${fileId}.iv`
    );

    fs.writeFileSync(
        ivPath,
        iv.toString("base64")
    );


    console.log(
        `✅ Fragments and IV stored for ${fileId}`
    );
}


// =====================================================
// GET FRAGMENTS
// =====================================================

function getFragments(fileId) {

    const part1Path = path.join(
        keysPath,
        `${fileId}.part1`
    );

    const part2Path = path.join(
        backupPath,
        `${fileId}.part2`
    );

    const ivPath = path.join(
        keysPath,
        `${fileId}.iv`
    );


    // Check that every required component exists
    const part1Exists =
        fs.existsSync(part1Path);

    const part2Exists =
        fs.existsSync(part2Path);

    const ivExists =
        fs.existsSync(ivPath);

    const part3Exists =
        memoryFragments.has(fileId);


    console.log(
        `Checking fragments for ${fileId}`
    );

    console.log(
        `PART 1: ${part1Exists}`
    );

    console.log(
        `PART 2: ${part2Exists}`
    );

    console.log(
        `PART 3 (RAM): ${part3Exists}`
    );

    console.log(
        `IV: ${ivExists}`
    );


    // If anything is missing, reconstruction is impossible
    if (
        !part1Exists ||
        !part2Exists ||
        !part3Exists ||
        !ivExists
    ) {

        return null;
    }


    // -------------------------------------------------
    // Read PART 1
    // -------------------------------------------------

    const fragment1 = Buffer.from(
        fs.readFileSync(
            part1Path,
            "utf8"
        ),
        "base64"
    );


    // -------------------------------------------------
    // Read PART 2
    // -------------------------------------------------

    const fragment2 = Buffer.from(
        fs.readFileSync(
            part2Path,
            "utf8"
        ),
        "base64"
    );


    // -------------------------------------------------
    // Read PART 3 from RAM
    // -------------------------------------------------

    const fragment3 =
        memoryFragments.get(fileId);


    // -------------------------------------------------
    // Read IV
    // -------------------------------------------------

    const iv = Buffer.from(
        fs.readFileSync(
            ivPath,
            "utf8"
        ),
        "base64"
    );


    return {
        fragment1,
        fragment2,
        fragment3,
        iv
    };
}


// =====================================================
// DESTROY FRAGMENTS
// =====================================================

function destroyFragments(fileId) {

    console.log(
        `🔥 Destroying fragments for ${fileId}`
    );


    // -------------------------------------------------
    // PART 1
    // -------------------------------------------------

    const part1Path = path.join(
        keysPath,
        `${fileId}.part1`
    );

    if (fs.existsSync(part1Path)) {

        fs.unlinkSync(part1Path);

        console.log(
            "PART 1 destroyed"
        );
    }


    // -------------------------------------------------
    // PART 2
    // -------------------------------------------------

    const part2Path = path.join(
        backupPath,
        `${fileId}.part2`
    );

    if (fs.existsSync(part2Path)) {

        fs.unlinkSync(part2Path);

        console.log(
            "PART 2 destroyed"
        );
    }


    // -------------------------------------------------
    // IV
    // -------------------------------------------------

    const ivPath = path.join(
        keysPath,
        `${fileId}.iv`
    );

    if (fs.existsSync(ivPath)) {

        fs.unlinkSync(ivPath);

        console.log(
            "IV destroyed"
        );
    }


    // -------------------------------------------------
    // PART 3
    // -------------------------------------------------

    if (memoryFragments.has(fileId)) {

        memoryFragments.delete(fileId);

        console.log(
            "PART 3 destroyed from RAM"
        );
    }


    console.log(
        `✅ Fragments and IV destroyed for ${fileId}`
    );
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    storeFragments,
    getFragments,
    destroyFragments
};