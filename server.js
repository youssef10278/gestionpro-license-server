const express = require('express');
const cors = require('cors');
// On importe l'objet contenant nos fonctions depuis database.js
const db = require('./database.js'); 

const app = express();
const port = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json()); // Pour comprendre le JSON envoyé par l'application

// --- Routes de l'API ---

app.post('/activate', (req, res) => {
    const { licenseKey, machineId, hardwareFingerprint, timestamp } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!licenseKey || !machineId || !hardwareFingerprint) {
        return res.status(400).json({
            success: false,
            message: 'Données d\'activation incomplètes.'
        });
    }

    try {
        // Vérifier l'expiration de la licence
        const license = db.checkLicenseExpiration(licenseKey);

        if (!license) {
            db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'ACTIVATION_FAILED', false, clientIP);
            return res.json({ success: false, message: 'Clé de licence invalide ou expirée.' });
        }

        // Vérifier si déjà activée
        if (license.status === 'active') {
            // Même machine et même empreinte = OK
            if (license.machineId === machineId && license.hardwareFingerprint === hardwareFingerprint) {
                db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'REACTIVATION', true, clientIP);
                return res.json({ success: true, message: 'Licence déjà active sur cette machine.' });
            } else {
                // Tentative d'utilisation sur une autre machine
                db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'FRAUD_ATTEMPT', false, clientIP);

                // Vérifier l'historique pour détecter des tentatives suspectes
                const history = db.getSuspiciousActivities(licenseKey);
                const recentFraudAttempts = history.filter(h =>
                    h.action === 'FRAUD_ATTEMPT' &&
                    Date.now() - new Date(h.timestamp).getTime() < 24 * 60 * 60 * 1000 // 24h
                ).length;

                if (recentFraudAttempts > 3) {
                    // Bloquer temporairement la licence
                    console.log(`ALERTE SÉCURITÉ: Tentatives multiples de fraude pour la licence ${licenseKey}`);
                }

                return res.json({
                    success: false,
                    message: 'Cette licence est déjà utilisée sur une autre machine.'
                });
            }
        }

        // Vérifier le nombre de transferts autorisés
        if (license.transferCount >= license.maxTransfers) {
            db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'TRANSFER_LIMIT_EXCEEDED', false, clientIP);
            return res.json({
                success: false,
                message: 'Limite de transferts de licence atteinte.'
            });
        }

        // Activer la licence
        const result = db.activateLicense(licenseKey, machineId, hardwareFingerprint);

        if (result.changes > 0) {
            db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'ACTIVATION_SUCCESS', true, clientIP);
            res.json({ success: true, message: 'Licence activée avec succès.' });
        } else {
            db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'ACTIVATION_FAILED', false, clientIP);
            res.json({ success: false, message: 'Échec de l\'activation.' });
        }

    } catch (error) {
        console.error("Erreur interne du serveur lors de l'activation :", error);
        db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'SERVER_ERROR', false, clientIP);
        res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
    }
});

app.post('/validate', (req, res) => {
    const { licenseKey, machineId, hardwareFingerprint } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!licenseKey || !machineId || !hardwareFingerprint) {
        return res.status(400).json({ valid: false, message: 'Données de validation incomplètes.' });
    }

    try {
        // Vérifier l'expiration
        const license = db.checkLicenseExpiration(licenseKey);

        if (!license) {
            db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'VALIDATION_FAILED', false, clientIP);
            return res.json({ valid: false, message: 'Licence invalide ou expirée.' });
        }

        // Vérifier la correspondance complète
        if (license.status === 'active' &&
            license.machineId === machineId &&
            license.hardwareFingerprint === hardwareFingerprint) {

            // Mettre à jour les statistiques de validation
            db.validateLicense(licenseKey, machineId, hardwareFingerprint);

            // Vérifier si le nombre de validations n'est pas suspect
            if (license.validationCount > license.maxValidations) {
                console.log(`ALERTE: Nombre de validations suspect pour la licence ${licenseKey}`);
                return res.json({ valid: false, message: 'Limite de validations atteinte.' });
            }

            res.json({
                valid: true,
                remainingValidations: license.maxValidations - license.validationCount
            });
        } else {
            db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'VALIDATION_FAILED', false, clientIP);
            res.json({ valid: false, message: 'Licence invalide pour cette machine.' });
        }
    } catch (error) {
        console.error("Erreur interne du serveur lors de la validation :", error);
        res.status(500).json({ valid: false, message: 'Erreur interne du serveur.' });
    }
});

// Route de santé pour Railway
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'GestionPro License Server'
    });
});

// Route racine pour info
app.get('/', (req, res) => {
    res.json({
        service: 'GestionPro License Server',
        version: '1.0.0',
        status: 'Running',
        endpoints: ['/activate', '/validate', '/health']
    });
});

// --- Démarrage du serveur ---
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serveur de licence démarré sur le port ${port}`);
    console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⚡ Railway ready!`);
});