// Point d'entrée pour Railway - Copie du contenu de server.js
console.log('🔥 DÉMARRAGE APP.JS - NOTRE CODE S\'EXÉCUTE !');
console.log('🔍 Variables d\'environnement:');
console.log('   PORT:', process.env.PORT);
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Définie' : '❌ Non définie');

const express = require('express');
const cors = require('cors');
// On importe l'objet contenant nos fonctions depuis database.js
const db = require('./database.js');

const app = express();
const port = process.env.PORT || 3000;
console.log(`🔍 PORT configuré: ${port}`);

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
        const licenseData = await db.checkLicenseExpiration(licenseKey);
        if (!licenseData) {
            return res.status(404).json({
                success: false,
                message: 'Licence non trouvée ou expirée.'
            });
        }

        // Vérifier si la licence est déjà active
        if (licenseData.status === 'active') {
            // Vérifier si c'est la même machine
            if (licenseData.machineId === machineId && licenseData.hardwareFingerprint === hardwareFingerprint) {
                return res.json({
                    success: true,
                    message: 'Licence déjà activée sur cette machine.',
                    licenseData: {
                        key: licenseData.key,
                        status: licenseData.status,
                        activationDate: licenseData.activationDate
                    }
                });
            } else {
                // Tentative d'activation sur une autre machine
                await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'activation_attempt', false, clientIP);
                return res.status(403).json({
                    success: false,
                    message: 'Licence déjà activée sur une autre machine.'
                });
            }
        }

        // Activer la licence
        const result = await db.activateLicense(licenseKey, machineId, hardwareFingerprint, JSON.stringify({ ip: clientIP, timestamp }));

        if (result.changes > 0) {
            // Enregistrer l'activation dans l'historique
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'activation', true, clientIP);

            res.json({
                success: true,
                message: 'Licence activée avec succès.',
                licenseData: {
                    key: licenseKey,
                    status: 'active',
                    activationDate: new Date().toISOString()
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Impossible d\'activer la licence.'
            });
        }
    } catch (error) {
        console.error('Erreur activation:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur.'
        });
    }
});

app.post('/validate', async (req, res) => {
    const { licenseKey, machineId, hardwareFingerprint } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!licenseKey || !machineId || !hardwareFingerprint) {
        return res.status(400).json({
            valid: false,
            message: 'Données de validation incomplètes.'
        });
    }

    try {
        // Vérifier l'expiration
        const licenseData = await db.checkLicenseExpiration(licenseKey);
        if (!licenseData) {
            return res.json({
                valid: false,
                message: 'Licence expirée ou non trouvée.'
            });
        }

        // Vérifier que la licence est active sur cette machine
        if (licenseData.status === 'active' &&
            licenseData.machineId === machineId &&
            licenseData.hardwareFingerprint === hardwareFingerprint) {

            // Mettre à jour la dernière validation
            await db.validateLicense(licenseKey, machineId, hardwareFingerprint);
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'validation', true, clientIP);

            res.json({
                valid: true,
                message: 'Licence valide.',
                licenseData: {
                    key: licenseData.key,
                    status: licenseData.status,
                    activationDate: licenseData.activationDate,
                    lastValidation: new Date().toISOString()
                }
            });
        } else {
            await db.addActivationHistory(licenseKey, machineId, hardwareFingerprint, 'validation_failed', false, clientIP);
            res.json({
                valid: false,
                message: 'Licence non valide pour cette machine.'
            });
        }
    } catch (error) {
        console.error('Erreur validation:', error);
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
console.log(`🔍 Tentative de démarrage sur port ${port}...`);
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serveur de licence démarré sur le port ${port}`);
    console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⚡ Railway ready!`);
    console.log(`🔗 URL: http://0.0.0.0:${port}`);
});
