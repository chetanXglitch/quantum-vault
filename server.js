const express = require("express");
const path = require("path");

const vaultRoutes = require("./routes/vault");

const {
    restoreDeadManSwitches
} = require("./core/deadManSwitch");

const app = express();

const PORT = process.env.PORT || 3000;

// CORS headers for local frontend integration
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// Serve static frontend assets from public/
app.use(express.static(path.join(__dirname, "public")));

// Vault routes
app.use("/", vaultRoutes);

// API info route
app.get("/api", (req, res) => {
    res.json({
        message: "Quantum-Safe Secure Vault is running!"
    });
});

// Fallback for root if index.html is bypassed
app.get("/", (req, res, next) => {
    if (req.accepts("html")) {
        return next();
    }
    res.json({
        message: "Quantum-Safe Secure Vault is running!"
    });
});

// Restore Dead-Man Switches
restoreDeadManSwitches();

let server = null;
if (require.main === module) {
    server = app.listen(PORT, () => {
        console.log(`Vault server running at http://localhost:${PORT}`);
    });
}

module.exports = app;