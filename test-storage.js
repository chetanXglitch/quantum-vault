const crypto = require("crypto");

const {
    splitKey,
    reconstructKey
} = require("./core/keySplitter");

const {
    storeFragments,
    getFragments,
    destroyFragments
} = require("./core/fragmentStore");


// Create a fake file ID
const fileId = "test-file-001";

// Generate a key
const originalKey = crypto.randomBytes(32);

console.log("Original key:");
console.log(originalKey.toString("hex"));


// Split key
const fragments = splitKey(originalKey);


// Store fragments
storeFragments(fileId, fragments);


// Retrieve fragments
const retrieved = getFragments(fileId);

if (!retrieved) {
    console.log("❌ Could not retrieve fragments");
    process.exit(1);
}


// Reconstruct key
const reconstructedKey =
    reconstructKey(
        retrieved.fragment1,
        retrieved.fragment2,
        retrieved.fragment3
    );


// Verify
if (originalKey.equals(reconstructedKey)) {
    console.log("✅ SUCCESS: Key reconstructed correctly!");
} else {
    console.log("❌ ERROR: Keys do not match!");
}


// Destroy fragments
destroyFragments(fileId);

console.log("✅ Test completed.");