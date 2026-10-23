const fs = require("fs");
const path = require("path");

const DEADMAN_TIMEOUT = 60 * 1000; // 60 seconds

const stateDir = path.join(
    __dirname,
    "..",
    "storage",
    "deadman"
);

fs.mkdirSync(stateDir, {
    recursive: true
});

const timers = new Map();


// =====================================================
// GET STATE FILE
// =====================================================

function getStatePath(fileId) {

    return path.join(
        stateDir,
        `${fileId}.json`
    );
}


// =====================================================
// START DEAD-MAN SWITCH
// =====================================================

function startDeadManSwitch(fileId, customTimeoutMs) {

    // Stop old timer if it exists
    stopDeadManSwitch(fileId);

    const timeout = (typeof customTimeoutMs === "number" && customTimeoutMs > 0)
        ? customTimeoutMs
        : DEADMAN_TIMEOUT;

    const deadline = Date.now() + timeout;

    // Save deadline and configured timeout to disk
    fs.writeFileSync(
        getStatePath(fileId),
        JSON.stringify({
            fileId: fileId,
            deadline: deadline,
            status: "active",
            timeoutDuration: timeout,
            lastCheckIn: Date.now()
        }, null, 2)
    );

    console.log(
        `⏱️ Dead-Man Switch started for ${fileId} with timeout ${timeout}ms`
    );

    scheduleTimer(
        fileId,
        deadline
    );
}


// =====================================================
// SCHEDULE TIMER
// =====================================================

function scheduleTimer(
    fileId,
    deadline
) {

    const remaining =
        deadline - Date.now();


    if (remaining <= 0) {

        handleExpiration(
            fileId
        );

        return;
    }


    const timer = setTimeout(
        () => {

            handleExpiration(
                fileId
            );

        },
        remaining
    );


    timers.set(
        fileId,
        timer
    );
}


// =====================================================
// HANDLE EXPIRATION
// =====================================================

function handleExpiration(fileId) {

    console.log(
        `⚠️ Dead-Man Switch expired for ${fileId}`
    );


    timers.delete(
        fileId
    );


    const statePath =
        getStatePath(fileId);


    if (!fs.existsSync(statePath)) {
        return;
    }


    const state =
        JSON.parse(
            fs.readFileSync(
                statePath,
                "utf8"
            )
        );


    state.status =
        "expired";


    state.expiredAt =
        Date.now();


    fs.writeFileSync(
        statePath,
        JSON.stringify(
            state,
            null,
            2
        )
    );


    console.log(
        `🚨 File ${fileId} entered recovery state`
    );
}


// =====================================================
// CHECK-IN & CUSTOM TIMING
// =====================================================

function checkIn(fileId, customTimeoutMs, allowReactivate = true) {
    const statePath = getStatePath(fileId);
    if (!fs.existsSync(statePath)) {
        console.log(
            `⚠️ Check-in rejected: No switch found for ${fileId}`
        );
        return false;
    }

    let existingTimeout = DEADMAN_TIMEOUT;
    try {
        const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (state.timeoutDuration && typeof state.timeoutDuration === "number") {
            existingTimeout = state.timeoutDuration;
        }
        if (state.status !== "active" && !allowReactivate) {
            console.log(
                `⚠️ Check-in rejected: Switch for ${fileId} is ${state.status}`
            );
            return false;
        }
    } catch (e) {
        return false;
    }

    const effectiveTimeout = (typeof customTimeoutMs === "number" && customTimeoutMs > 0)
        ? customTimeoutMs
        : existingTimeout;

    console.log(
        `✅ Check-in received for ${fileId} (Timeout: ${effectiveTimeout}ms)`
    );

    startDeadManSwitch(
        fileId,
        effectiveTimeout
    );

    return true;
}


// =====================================================
// GET DEAD-MAN SWITCH STATUS
// =====================================================

function getDeadManSwitchStatus(fileId) {
    const statePath = getStatePath(fileId);
    if (!fs.existsSync(statePath)) {
        return null;
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        const now = Date.now();
        const remainingMs = Math.max(0, (state.deadline || 0) - now);
        const timeoutDuration = (state.timeoutDuration && typeof state.timeoutDuration === "number")
            ? state.timeoutDuration
            : DEADMAN_TIMEOUT;

        return {
            fileId,
            status: state.status,
            deadline: state.deadline,
            remainingMs: state.status === "active" ? remainingMs : 0,
            timeoutDuration: timeoutDuration,
            lastCheckIn: state.lastCheckIn || null,
            expiredAt: state.expiredAt || null
        };
    } catch (err) {
        return null;
    }
}


// =====================================================
// GET ALL DEAD-MAN SWITCHES
// =====================================================

function getAllDeadManSwitches() {
    if (!fs.existsSync(stateDir)) return [];
    try {
        const files = fs.readdirSync(stateDir);
        const switches = [];
        for (const f of files) {
            if (!f.endsWith(".json")) continue;
            const fileId = f.replace(".json", "");
            const status = getDeadManSwitchStatus(fileId);
            if (status) switches.push(status);
        }
        return switches;
    } catch (err) {
        return [];
    }
}


// =====================================================
// STOP DEAD-MAN SWITCH
// =====================================================

function stopDeadManSwitch(fileId) {

    const timer =
        timers.get(fileId);


    if (timer) {

        clearTimeout(
            timer
        );

        timers.delete(
            fileId
        );
    }


    const statePath =
        getStatePath(fileId);


    if (fs.existsSync(statePath)) {

        fs.unlinkSync(
            statePath
        );
    }


    console.log(
        `🛑 Dead-Man Switch stopped for ${fileId}`
    );
}


// =====================================================
// RESTORE TIMERS AFTER SERVER RESTART
// =====================================================

function restoreDeadManSwitches() {

    if (!fs.existsSync(stateDir)) {
        return;
    }


    const files =
        fs.readdirSync(
            stateDir
        );


    for (const file of files) {

        if (!file.endsWith(".json")) {
            continue;
        }


        try {

            const state =
                JSON.parse(
                    fs.readFileSync(
                        path.join(
                            stateDir,
                            file
                        ),
                        "utf8"
                    )
                );


            if (
                state.status ===
                "active"
            ) {

                console.log(
                    `🔄 Restoring Dead-Man Switch for ${state.fileId}`
                );


                scheduleTimer(
                    state.fileId,
                    state.deadline
                );
            }

        } catch (error) {

            console.error(
                "Failed to restore Dead-Man Switch:",
                error
            );
        }
    }
}


module.exports = {
    startDeadManSwitch,
    checkIn,
    stopDeadManSwitch,
    restoreDeadManSwitches,
    getDeadManSwitchStatus,
    getAllDeadManSwitches
};