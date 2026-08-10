const { reconstructKey } = require("./keySplitter");

function reconstructFromFragments(fragments) {
    // Make sure all 3 fragments exist
    if (
        !fragments ||
        !fragments.fragment1 ||
        !fragments.fragment2 ||
        !fragments.fragment3
    ) {
        throw new Error("Missing key fragments");
    }

    // Reconstruct the original AES key
    const key = reconstructKey(
        fragments.fragment1,
        fragments.fragment2,
        fragments.fragment3
    );

    return key;
}

module.exports = {
    reconstructFromFragments
};