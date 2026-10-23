const recoveryRequests = new Map();


// =====================================================
// CREATE RECOVERY REQUEST
// =====================================================

function createRecoveryRequest(fileId) {

    const request = {
        fileId: fileId,
        status: "pending",
        createdAt: new Date()
    };

    recoveryRequests.set(
        fileId,
        request
    );

    console.log(
        `⚠️ Recovery request created for ${fileId}`
    );

    return request;
}


// =====================================================
// GET RECOVERY REQUEST
// =====================================================

function getRecoveryRequest(fileId) {

    return recoveryRequests.get(fileId) || null;
}


// =====================================================
// APPROVE RECOVERY
// =====================================================

function approveRecovery(fileId) {

    const request =
        recoveryRequests.get(fileId);

    if (!request) {
        return false;
    }

    request.status = "approved";
    request.approvedAt = new Date();

    recoveryRequests.set(
        fileId,
        request
    );

    console.log(
        `✅ Recovery approved for ${fileId}`
    );

    return true;
}


// =====================================================
// DENY RECOVERY
// =====================================================

function denyRecovery(fileId) {

    const request =
        recoveryRequests.get(fileId);

    if (!request) {
        return false;
    }

    request.status = "denied";

    recoveryRequests.set(
        fileId,
        request
    );

    console.log(
        `❌ Recovery denied for ${fileId}`
    );

    return true;
}


// =====================================================
// GET ALL RECOVERY REQUESTS
// =====================================================

function getAllRecoveryRequests() {
    return Array.from(recoveryRequests.values());
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    createRecoveryRequest,
    getRecoveryRequest,
    approveRecovery,
    denyRecovery,
    getAllRecoveryRequests
};