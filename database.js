const { Pool } = require('pg');

// Configuration PostgreSQL (Railway fournit automatiquement DATABASE_URL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/licenses',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Fonction pour initialiser la base de données PostgreSQL
async function initDatabase() {
    console.log("Initialisation de la base de données PostgreSQL...");

    try {
        // Table des licences avec sécurité renforcée
        await pool.query(`
            CREATE TABLE IF NOT EXISTS licenses (
                id SERIAL PRIMARY KEY,
                key TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'inactive',
                machineId TEXT,
                hardwareFingerprint TEXT,
                activationDate TIMESTAMP,
                lastValidation TIMESTAMP,
                validationCount INTEGER DEFAULT 0,
                maxValidations INTEGER DEFAULT 1000,
                expirationDate TIMESTAMP,
                customerEmail TEXT,
                customerInfo TEXT,
                transferCount INTEGER DEFAULT 0,
                maxTransfers INTEGER DEFAULT 1
            )
        `);

        // Table pour l'historique des activations (détection de fraude)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activation_history (
                id SERIAL PRIMARY KEY,
                licenseKey TEXT NOT NULL,
                machineId TEXT,
                hardwareFingerprint TEXT,
                action TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ipAddress TEXT,
                success BOOLEAN
            )
        `);

        console.log('✅ Tables PostgreSQL créées avec succès');
    } catch (error) {
        console.error('❌ Erreur initialisation base:', error);
        throw error;
    }
}

// --- Fonctions que nous allons exporter ---

async function getLicenseByKey(key) {
    try {
        const result = await pool.query('SELECT * FROM licenses WHERE key = $1', [key]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Erreur getLicenseByKey:', error);
        throw error;
    }
}

async function activateLicense(key, machineId, hardwareFingerprint, customerInfo = null) {
    try {
        const result = await pool.query(`
            UPDATE licenses
            SET status = 'active',
                machineId = $1,
                hardwareFingerprint = $2,
                activationDate = CURRENT_TIMESTAMP,
                customerInfo = $3
            WHERE key = $4 AND status = 'inactive'
        `, [machineId, hardwareFingerprint, customerInfo, key]);

        return { changes: result.rowCount };
    } catch (error) {
        console.error('Erreur activateLicense:', error);
        throw error;
    }
}

async function validateLicense(key, machineId, hardwareFingerprint) {
    try {
        const result = await pool.query(`
            UPDATE licenses
            SET lastValidation = CURRENT_TIMESTAMP,
                validationCount = validationCount + 1
            WHERE key = $1 AND machineId = $2 AND hardwareFingerprint = $3 AND status = 'active'
        `, [key, machineId, hardwareFingerprint]);

        return { changes: result.rowCount };
    } catch (error) {
        console.error('Erreur validateLicense:', error);
        throw error;
    }
}

async function addActivationHistory(licenseKey, machineId, hardwareFingerprint, action, success, ipAddress = null) {
    try {
        const result = await pool.query(`
            INSERT INTO activation_history
            (licenseKey, machineId, hardwareFingerprint, action, success, ipAddress)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [licenseKey, machineId, hardwareFingerprint, action, success, ipAddress]);

        return { changes: result.rowCount };
    } catch (error) {
        console.error('Erreur addActivationHistory:', error);
        throw error;
    }
}

async function addLicense(key, expirationDate = null, maxTransfers = 1) {
    try {
        const result = await pool.query(`
            INSERT INTO licenses (key, status, expirationDate, maxTransfers)
            VALUES ($1, $2, $3, $4)
        `, [key, 'inactive', expirationDate, maxTransfers]);

        return { changes: result.rowCount };
    } catch (error) {
        console.error('Erreur addLicense:', error);
        throw error;
    }
}

async function checkLicenseExpiration(key) {
    try {
        const result = await pool.query(`
            SELECT * FROM licenses
            WHERE key = $1 AND (expirationDate IS NULL OR expirationDate > CURRENT_TIMESTAMP)
        `, [key]);

        return result.rows[0] || null;
    } catch (error) {
        console.error('Erreur checkLicenseExpiration:', error);
        throw error;
    }
}

async function getSuspiciousActivities(licenseKey) {
    try {
        const result = await pool.query(`
            SELECT * FROM activation_history
            WHERE licenseKey = $1
            ORDER BY timestamp DESC
            LIMIT 50
        `, [licenseKey]);

        return result.rows;
    } catch (error) {
        console.error('Erreur getSuspiciousActivities:', error);
        throw error;
    }
}

// --- Exportation du module ---
// C'est la partie la plus importante. On exporte un objet qui contient nos trois fonctions.
module.exports = {
    initDatabase,
    getLicenseByKey,
    activateLicense,
    validateLicense,
    addActivationHistory,
    addLicense,
    checkLicenseExpiration,
    getSuspiciousActivities
};