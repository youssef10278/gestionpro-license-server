const crypto = require('crypto');
const db = require('./database');

// Fonction pour générer une clé de licence sécurisée
function generateSecureKey() {
    // Générer une clé avec un format spécifique pour éviter la contrefaçon
    const prefix = 'GP'; // GestionPro
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomBytes = crypto.randomBytes(8).toString('hex').toUpperCase();
    const checksum = crypto.createHash('md5').update(timestamp + randomBytes).digest('hex').substring(0, 4).toUpperCase();
    
    return `${prefix}-${timestamp}-${randomBytes}-${checksum}`;
}

// Fonction pour valider le format d'une clé
function validateKeyFormat(key) {
    const pattern = /^GP-[A-Z0-9]+-[A-F0-9]{16}-[A-F0-9]{4}$/;
    return pattern.test(key);
}

// Fonction pour créer des licences avec différents niveaux
function createLicense(options = {}) {
    const {
        customerEmail = null,
        expirationMonths = null, // null = pas d'expiration
        maxTransfers = 1,
        customerInfo = null
    } = options;

    const key = generateSecureKey();
    
    // Calculer la date d'expiration si spécifiée
    let expirationDate = null;
    if (expirationMonths) {
        const expDate = new Date();
        expDate.setMonth(expDate.getMonth() + expirationMonths);
        expirationDate = expDate.toISOString();
    }

    try {
        const result = db.addLicense(key, expirationDate, maxTransfers);
        
        if (result.changes > 0) {
            console.log('✅ Licence créée avec succès:');
            console.log(`   Clé: ${key}`);
            console.log(`   Email client: ${customerEmail || 'Non spécifié'}`);
            console.log(`   Expiration: ${expirationDate ? new Date(expirationDate).toLocaleDateString() : 'Jamais'}`);
            console.log(`   Transferts max: ${maxTransfers}`);
            console.log('');
            
            return {
                success: true,
                key: key,
                expirationDate: expirationDate,
                maxTransfers: maxTransfers
            };
        } else {
            console.error('❌ Erreur lors de la création de la licence');
            return { success: false };
        }
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        return { success: false, error: error.message };
    }
}

// Interface en ligne de commande
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('🔐 Générateur de Licences Sécurisées - GestionPro');
        console.log('');
        console.log('Usage:');
        console.log('  node generate-secure-keys.js <nombre> [options]');
        console.log('');
        console.log('Options:');
        console.log('  --email <email>        Email du client');
        console.log('  --expires <mois>       Expiration en mois (défaut: jamais)');
        console.log('  --transfers <nombre>   Nombre de transferts autorisés (défaut: 1)');
        console.log('');
        console.log('Exemples:');
        console.log('  node generate-secure-keys.js 5');
        console.log('  node generate-secure-keys.js 1 --email client@example.com --expires 12');
        console.log('  node generate-secure-keys.js 3 --transfers 2 --expires 6');
        return;
    }

    const count = parseInt(args[0]);
    if (isNaN(count) || count <= 0) {
        console.error('❌ Nombre de licences invalide');
        return;
    }

    // Parser les options
    const options = {};
    for (let i = 1; i < args.length; i += 2) {
        const option = args[i];
        const value = args[i + 1];
        
        switch (option) {
            case '--email':
                options.customerEmail = value;
                break;
            case '--expires':
                options.expirationMonths = parseInt(value);
                break;
            case '--transfers':
                options.maxTransfers = parseInt(value);
                break;
        }
    }

    console.log(`🔐 Génération de ${count} licence(s) sécurisée(s)...`);
    console.log('');

    const results = [];
    for (let i = 0; i < count; i++) {
        const result = createLicense(options);
        results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    console.log(`✅ ${successful}/${count} licences créées avec succès`);
    
    if (successful > 0) {
        console.log('');
        console.log('⚠️  IMPORTANT:');
        console.log('   - Conservez ces clés en sécurité');
        console.log('   - Chaque clé ne peut être activée que sur une seule machine');
        console.log('   - Le transfert vers une autre machine nécessite une désactivation');
        console.log('   - Toutes les activations sont tracées et surveillées');
    }
}

// Exporter les fonctions pour utilisation dans d'autres modules
module.exports = {
    generateSecureKey,
    validateKeyFormat,
    createLicense
};

// Exécuter si appelé directement
if (require.main === module) {
    main();
}
