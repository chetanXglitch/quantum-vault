const crypto = require("crypto");

const {
    splitKey,
    reconstructKey
} = require("./core/keySplitter");

// Create a test key
const originalKey = crypto.randomBytes(32);

console.log("Original key:");
console.log(originalKey.toString("hex"));


// Split the key
const {
    fragment1,
    fragment2,
    fragment3
} = splitKey(originalKey);

console.log("\nFragments created!");

console.log("Fragment 1:");
console.log(fragment1.toString("hex"));

console.log("Fragment 2:");
console.log(fragment2.toString("hex"));

console.log("Fragment 3:");
console.log(fragment3.toString("hex"));


// Reconstruct the key
const reconstructedKey =
    reconstructKey(
        fragment1,
        fragment2,
        fragment3
    );

console.log("\nReconstructed key:");
console.log(reconstructedKey.toString("hex"));


// Compare original and reconstructed
if (originalKey.equals(reconstructedKey)) {
    console.log("\n✅ SUCCESS: Keys match!");
} else {
    console.log("\n❌ ERROR: Keys do not match!");
}