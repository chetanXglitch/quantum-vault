const crypto = require("crypto");
const fs = require("fs");

function generateKey() {
    return crypto.randomBytes(32);
}

function generateIV() {
    return crypto.randomBytes(16);
}

function encryptFile(inputPath, outputPath, key, iv) {
    return new Promise((resolve, reject) => {

        const readStream = fs.createReadStream(inputPath);
        const writeStream = fs.createWriteStream(outputPath);

        const cipher = crypto.createCipheriv(
            "aes-256-cbc",
            key,
            iv
        );

        readStream
            .pipe(cipher)
            .pipe(writeStream);

        writeStream.on("finish", () => {
            resolve();
        });

        readStream.on("error", reject);
        cipher.on("error", reject);
        writeStream.on("error", reject);
    });
}

function decryptFile(inputPath, outputPath, key, iv) {
    return new Promise((resolve, reject) => {

        const readStream = fs.createReadStream(inputPath);
        const writeStream = fs.createWriteStream(outputPath);

        const decipher = crypto.createDecipheriv(
            "aes-256-cbc",
            key,
            iv
        );

        readStream
            .pipe(decipher)
            .pipe(writeStream);

        writeStream.on("finish", () => {
            resolve();
        });

        readStream.on("error", reject);
        decipher.on("error", reject);
        writeStream.on("error", reject);
    });
}

module.exports = {
    generateKey,
    generateIV,
    encryptFile,
    decryptFile
};