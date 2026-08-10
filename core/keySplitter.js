const crypto = require("crypto");

/*
    Split a key into 3 fragments.

    key = fragment1 XOR fragment2 XOR fragment3
*/

function splitKey(key) {

    // Create two random fragments
    const fragment1 = crypto.randomBytes(key.length);
    const fragment2 = crypto.randomBytes(key.length);

    // Create the third fragment
    const fragment3 = Buffer.alloc(key.length);

    for (let i = 0; i < key.length; i++) {
        fragment3[i] =
            key[i] ^
            fragment1[i] ^
            fragment2[i];
    }

    return {
        fragment1,
        fragment2,
        fragment3
    };
}


/*
    Reconstruct the original key
*/

function reconstructKey(fragment1, fragment2, fragment3) {

    const key = Buffer.alloc(fragment1.length);

    for (let i = 0; i < fragment1.length; i++) {
        key[i] =
            fragment1[i] ^
            fragment2[i] ^
            fragment3[i];
    }

    return key;
}


module.exports = {
    splitKey,
    reconstructKey
};