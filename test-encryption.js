const {
    generateKey,
    generateIV,
    encryptFile
} = require("./core/encrypt");

const inputFile = "./test.txt";
const outputFile = "./test.txt.enc";

// Generate a new encryption key and IV
const key = generateKey();
const iv = generateIV();

console.log("Encryption key:", key.toString("hex"));
console.log("IV:", iv.toString("hex"));

encryptFile(inputFile, outputFile, key, iv)
    .then(() => {
        console.log("File encrypted successfully!");
        console.log("Encrypted file:", outputFile);
    })
    .catch((error) => {
        console.error("Encryption failed:", error);
    });