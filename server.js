const express = require('express');
const cors = require('cors');
// On importe l'objet contenant nos fonctions depuis database.js
const db = require('./database.js');

const app = express();
const port = process.env.PORT || 3000;

// Initialiser la base de données au démarrage (sans crash si échec)
db.initDatabase().catch(error => {
    console.error('❌ Erreur base de données:', error.message);
    console.log('⚠️ Le serveur continue sans base de données');
});

// --- Middlewares ---
app.use(cors());
app.use(express.json()); // Pour comprendre le JSON envoyé par l'application

// --- Routes de l'API ---

app.post('/activate', async (req, res) => {
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
        const license = await db.checkLicenseExpiration(licenseKey);

        if (!license) {
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'ACTIVATION_FAILED', false, clientIP);
            return res.json({ success: false, message: 'Clé de licence invalide ou expirée.' });
        }

        // Vérifier si déjà activée
        if (license.status === 'active') {
            // Même machine et même empreinte = OK
            if (license.machineid === machineId && license.hardwarefingerprint === hardwareFingerprint) {
                await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'REACTIVATION', true, clientIP);
                return res.json({ success: true, message: 'Licence déjà active sur cette machine.' });
            } else {
                // Tentative d'utilisation sur une autre machine
                await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'FRAUD_ATTEMPT', false, clientIP);

                // Vérifier l'historique pour détecter des tentatives suspectes
                const history = await db.getSuspiciousActivities(licenseKey);
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
        if (license.transfercount >= license.maxtransfers) {
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'TRANSFER_LIMIT_EXCEEDED', false, clientIP);
            return res.json({
                success: false,
                message: 'Limite de transferts de licence atteinte.'
            });
        }

        // Activer la licence
        const result = await db.activateLicense(licenseKey, machineId, hardwareFingerprint);

        if (result.changes > 0) {
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'ACTIVATION_SUCCESS', true, clientIP);
            res.json({ success: true, message: 'Licence activée avec succès.' });
        } else {
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'ACTIVATION_FAILED', false, clientIP);
            res.json({ success: false, message: 'Échec de l\'activation.' });
        }

    } catch (error) {
        console.error("Erreur interne du serveur lors de l'activation :", error);
        await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'SERVER_ERROR', false, clientIP);
        res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
    }
});

app.post('/validate', async (req, res) => {
    const { licenseKey, machineId, hardwareFingerprint } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!licenseKey || !machineId || !hardwareFingerprint) {
        return res.status(400).json({ valid: false, message: 'Données de validation incomplètes.' });
    }

    try {
        // Vérifier l'expiration
        const license = await db.checkLicenseExpiration(licenseKey);

        if (!license) {
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'VALIDATION_FAILED', false, clientIP);
            return res.json({ valid: false, message: 'Licence invalide ou expirée.' });
        }

        // Vérifier la correspondance complète (attention aux noms de colonnes PostgreSQL)
        if (license.status === 'active' &&
            license.machineid === machineId &&
            license.hardwarefingerprint === hardwareFingerprint) {

            // Mettre à jour les statistiques de validation
            await db.validateLicense(licenseKey, machineId, hardwareFingerprint);

            // Vérifier si le nombre de validations n'est pas suspect
            if (license.validationcount > license.maxvalidations) {
                console.log(`ALERTE: Nombre de validations suspect pour la licence ${licenseKey}`);
                return res.json({ valid: false, message: 'Limite de validations atteinte.' });
            }

            res.json({
                valid: true,
                remainingValidations: license.maxvalidations - license.validationcount
            });
        } else {
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'VALIDATION_FAILED', false, clientIP);
            res.json({ valid: false, message: 'Licence invalide pour cette machine.' });
        }
    } catch (error) {
        console.error("Erreur interne du serveur lors de la validation :", error);
        res.status(500).json({ valid: false, message: 'Erreur interne du serveur.' });
    }
});

// Route de santé pour Railway
app.get('/health', async (req, res) => {
    let dbStatus = 'disconnected';
    try {
        await db.getLicenseByKey('test-health-check');
        dbStatus = 'connected';
    } catch (error) {
        dbStatus = 'disconnected';
    }

    res.json({
        status: 'OK',
        database: dbStatus,
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