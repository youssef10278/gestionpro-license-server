const Database = require('better-sqlite3');
const path = require('path');

// Crée ou ouvre la base de données du serveur
const db = new Database(path.join(__dirname, 'licenses.db'));

// Fonction pour initialiser la table des licences
function initDatabase() {
    console.log("Initialisation de la base de données du serveur...");

    // Table des licences avec sécurité renforcée
    const stmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'inactive',
            machineId TEXT,
            hardwareFingerprint TEXT,
            activationDate DATETIME,
            lastValidation DATETIME,
            validationCount INTEGER DEFAULT 0,
            maxValidations INTEGER DEFAULT 1000,
            expirationDate DATETIME,
            customerEmail TEXT,
            customerInfo TEXT,
            transferCount INTEGER DEFAULT 0,
            maxTransfers INTEGER DEFAULT 1
        )
    `);
    stmt.run();

    // Table pour l'historique des activations (détection de fraude)
    const historyStmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS activation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            licenseKey TEXT NOT NULL,
            machineId TEXT,
            hardwareFingerprint TEXT,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            ipAddress TEXT,
            success BOOLEAN
        )
    `);
    historyStmt.run();

    console.log('Les tables de licences sont prêtes.');
}

// Exécute l'initialisation au démarrage du module
initDatabase();

// --- Fonctions que nous allons exporter ---

function getLicenseByKey(key) {
    const stmt = db.prepare('SELECT * FROM licenses WHERE key = ?');
    return stmt.get(key);
}

function activateLicense(key, machineId, hardwareFingerprint, customerInfo = null) {
    const stmt = db.prepare(`
        UPDATE licenses
        SET status = 'active',
            machineId = ?,
            hardwareFingerprint = ?,
            activationDate = CURRENT_TIMESTAMP,
            customerInfo = ?
        WHERE key = ? AND status = 'inactive'
    `);
    return stmt.run(machineId, hardwareFingerprint, customerInfo, key);
}

function validateLicense(key, machineId, hardwareFingerprint) {
    const stmt = db.prepare(`
        UPDATE licenses
        SET lastValidation = CURRENT_TIMESTAMP,
            validationCount = validationCount + 1
        WHERE key = ? AND machineId = ? AND hardwareFingerprint = ? AND status = 'active'
    `);
    return stmt.run(key, machineId, hardwareFingerprint);
}

function addActivationHistory(licenseKey, machineId, hardwareFingerprint, action, success, ipAddress = null) {
    const stmt = db.prepare(`
        INSERT INTO activation_history
        (licenseKey, machineId, hardwareFingerprint, action, success, ipAddress)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(licenseKey, machineId, hardwareFingerprint, action, success, ipAddress);
}

function addLicense(key, expirationDate = null, maxTransfers = 1) {
    const stmt = db.prepare(`
        INSERT INTO licenses (key, status, expirationDate, maxTransfers)
        VALUES (?, ?, ?, ?)
    `);
    return stmt.run(key, 'inactive', expirationDate, maxTransfers);
}

function checkLicenseExpiration(key) {
    const stmt = db.prepare(`
        SELECT * FROM licenses
        WHERE key = ? AND (expirationDate IS NULL OR expirationDate > CURRENT_TIMESTAMP)
    `);
    return stmt.get(key);
}

function getSuspiciousActivities(licenseKey) {
    const stmt = db.prepare(`
        SELECT * FROM activation_history
        WHERE licenseKey = ?
        ORDER BY timestamp DESC
        LIMIT 50
    `);
    return stmt.all(licenseKey);
}

// --- Exportation du module ---
// C'est la partie la plus importante. On exporte un objet qui contient nos trois fonctions.
module.exports = {
    getLicenseByKey,
    activateLicense,
    validateLicense,
    addActivationHistory,
    addLicense,
    checkLicenseExpiration,
    getSuspiciousActivities
};