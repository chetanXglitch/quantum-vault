const express = require("express");

const vaultRoutes =
    require("./routes/vault");

const {
    restoreDeadManSwitches
} = require("./core/deadManSwitch");


const app = express();

const PORT = 3000;


app.use(
    express.json()
);


// Vault routes
app.use(
    "/",
    vaultRoutes
);


// Home route
app.get(
    "/",
    (req, res) => {

        res.json({

            message:
                "Quantum-Safe Secure Vault is running!"
        });
    }
);


// Restore Dead-Man Switches
restoreDeadManSwitches();


app.listen(
    PORT,
    () => {

        console.log(
            `Vault server running at http://localhost:${PORT}`
        );
    }
);