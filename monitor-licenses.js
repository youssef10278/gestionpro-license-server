const Database = require('better-sqlite3');
const path = require('path');

// Ouvre la base de données
const db = new Database(path.join(__dirname, 'licenses.db'));

// Fonction pour afficher le statut des licences
function showLicenseStatus() {
    try {
        const licenses = db.prepare('SELECT * FROM licenses ORDER BY activationDate DESC').all();
        const history = db.prepare('SELECT * FROM activation_history ORDER BY timestamp DESC LIMIT 50').all();
        
        console.log('🔐 MONITORING DES LICENCES - GestionPro');
        console.log('='.repeat(60));
        console.log('');
        
        // Statistiques générales
        const totalLicenses = licenses.length;
        const activeLicenses = licenses.filter(l => l.status === 'active').length;
        const expiredLicenses = licenses.filter(l => {
            if (!l.expirationDate) return false;
            return new Date(l.expirationDate) < new Date();
        }).length;
        
        console.log('📊 STATISTIQUES GÉNÉRALES:');
        console.log(`   Total des licences: ${totalLicenses}`);
        console.log(`   Licences actives: ${activeLicenses}`);
        console.log(`   Licences expirées: ${expiredLicenses}`);
        console.log(`   Licences inactives: ${totalLicenses - activeLicenses - expiredLicenses}`);
        console.log('');
        
        // Détail des licences actives
        const activeLicensesList = licenses.filter(l => l.status === 'active');
        if (activeLicensesList.length > 0) {
            console.log('✅ LICENCES ACTIVES:');
            activeLicensesList.forEach((license, index) => {
                const expiration = license.expirationDate ? 
                    new Date(license.expirationDate).toLocaleDateString() : 'Jamais';
                const lastValidation = license.lastValidation ? 
                    new Date(license.lastValidation).toLocaleString() : 'Jamais';
                
                console.log(`   ${index + 1}. ${license.key}`);
                console.log(`      Machine: ${license.machineId}`);
                console.log(`      Activée le: ${new Date(license.activationDate).toLocaleString()}`);
                console.log(`      Dernière validation: ${lastValidation}`);
                console.log(`      Validations: ${license.validationCount}/${license.maxValidations}`);
                console.log(`      Expiration: ${expiration}`);
                console.log(`      Transferts: ${license.transferCount}/${license.maxTransfers}`);
                console.log('');
            });
        }
        
        // Activités suspectes récentes
        const suspiciousActivities = history.filter(h => 
            h.action === 'FRAUD_ATTEMPT' || h.action === 'TRANSFER_LIMIT_EXCEEDED'
        );
        
        if (suspiciousActivities.length > 0) {
            console.log('⚠️  ACTIVITÉS SUSPECTES RÉCENTES:');
            suspiciousActivities.slice(0, 10).forEach((activity, index) => {
                console.log(`   ${index + 1}. ${activity.action} - ${activity.licenseKey}`);
                console.log(`      Machine: ${activity.machineId}`);
                console.log(`      IP: ${activity.ipAddress || 'Inconnue'}`);
                console.log(`      Date: ${new Date(activity.timestamp).toLocaleString()}`);
                console.log('');
            });
        }
        
        // Licences proches de l'expiration
        const soonToExpire = licenses.filter(l => {
            if (!l.expirationDate) return false;
            const expDate = new Date(l.expirationDate);
            const now = new Date();
            const daysUntilExpiry = (expDate - now) / (1000 * 60 * 60 * 24);
            return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
        });
        
        if (soonToExpire.length > 0) {
            console.log('⏰ LICENCES EXPIRANT BIENTÔT (30 jours):');
            soonToExpire.forEach((license, index) => {
                const daysLeft = Math.ceil((new Date(license.expirationDate) - new Date()) / (1000 * 60 * 60 * 24));
                console.log(`   ${index + 1}. ${license.key} - ${daysLeft} jour(s) restant(s)`);
            });
            console.log('');
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la lecture des données:', error.message);
    }
}

// Fonction pour rechercher une licence spécifique
function searchLicense(searchTerm) {
    try {
        const license = db.prepare('SELECT * FROM licenses WHERE key LIKE ?').get(`%${searchTerm}%`);
        
        if (!license) {
            console.log(`❌ Aucune licence trouvée pour: ${searchTerm}`);
            return;
        }
        
        console.log('🔍 DÉTAILS DE LA LICENCE:');
        console.log(`   Clé: ${license.key}`);
        console.log(`   Statut: ${license.status}`);
        console.log(`   Machine ID: ${license.machineId || 'Non activée'}`);
        console.log(`   Empreinte matérielle: ${license.hardwareFingerprint || 'Non disponible'}`);
        console.log(`   Date d'activation: ${license.activationDate ? new Date(license.activationDate).toLocaleString() : 'Non activée'}`);
        console.log(`   Dernière validation: ${license.lastValidation ? new Date(license.lastValidation).toLocaleString() : 'Jamais'}`);
        console.log(`   Validations: ${license.validationCount}/${license.maxValidations}`);
        console.log(`   Transferts: ${license.transferCount}/${license.maxTransfers}`);
        console.log(`   Expiration: ${license.expirationDate ? new Date(license.expirationDate).toLocaleDateString() : 'Jamais'}`);
        console.log('');
        
        // Historique de cette licence
        const history = db.prepare('SELECT * FROM activation_history WHERE licenseKey = ? ORDER BY timestamp DESC LIMIT 20').all(license.key);
        
        if (history.length > 0) {
            console.log('📋 HISTORIQUE D\'ACTIVITÉ:');
            history.forEach((activity, index) => {
                const status = activity.success ? '✅' : '❌';
                console.log(`   ${index + 1}. ${status} ${activity.action}`);
                console.log(`      Machine: ${activity.machineId}`);
                console.log(`      IP: ${activity.ipAddress || 'Inconnue'}`);
                console.log(`      Date: ${new Date(activity.timestamp).toLocaleString()}`);
                console.log('');
            });
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la recherche:', error.message);
    }
}

// Fonction pour révoquer une licence
function revokeLicense(licenseKey) {
    try {
        const result = db.prepare('UPDATE licenses SET status = ? WHERE key = ?').run('revoked', licenseKey);
        
        if (result.changes > 0) {
            console.log(`✅ Licence ${licenseKey} révoquée avec succès`);
            
            // Ajouter à l'historique
            db.prepare(`
                INSERT INTO activation_history 
                (licenseKey, machineId, hardwareFingerprint, action, success)
                VALUES (?, ?, ?, ?, ?)
            `).run(licenseKey, 'ADMIN', 'ADMIN', 'REVOKED', true);
        } else {
            console.log(`❌ Licence ${licenseKey} non trouvée`);
        }
    } catch (error) {
        console.error('❌ Erreur lors de la révocation:', error.message);
    }
}

// Interface en ligne de commande
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        showLicenseStatus();
        return;
    }
    
    const command = args[0];
    
    switch (command) {
        case 'search':
            if (args[1]) {
                searchLicense(args[1]);
            } else {
                console.log('❌ Usage: node monitor-licenses.js search <terme_recherche>');
            }
            break;
            
        case 'revoke':
            if (args[1]) {
                revokeLicense(args[1]);
            } else {
                console.log('❌ Usage: node monitor-licenses.js revoke <clé_licence>');
            }
            break;
            
        case 'help':
            console.log('🔐 Monitoring des Licences - GestionPro');
            console.log('');
            console.log('Usage:');
            console.log('  node monitor-licenses.js                    # Afficher le statut général');
            console.log('  node monitor-licenses.js search <terme>     # Rechercher une licence');
            console.log('  node monitor-licenses.js revoke <clé>       # Révoquer une licence');
            console.log('  node monitor-licenses.js help               # Afficher cette aide');
            break;
            
        default:
            console.log(`❌ Commande inconnue: ${command}`);
            console.log('Utilisez "node monitor-licenses.js help" pour voir les commandes disponibles');
    }
}

// Fermer la base de données à la fin
process.on('exit', () => {
    db.close();
});

// Exécuter si appelé directement
if (require.main === module) {
    main();
}
