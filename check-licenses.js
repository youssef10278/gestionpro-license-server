const Database = require('better-sqlite3');
const path = require('path');

// Ouvre la base de données
const db = new Database(path.join(__dirname, 'licenses.db'));

try {
    // Récupère toutes les licences
    const licenses = db.prepare('SELECT * FROM licenses').all();
    
    console.log('=== LICENCES DISPONIBLES ===');
    console.log(`Nombre total de licences: ${licenses.length}`);
    console.log('');
    
    if (licenses.length === 0) {
        console.log('Aucune licence trouvée dans la base de données.');
    } else {
        licenses.forEach((license, index) => {
            console.log(`${index + 1}. Clé: ${license.key}`);
            console.log(`   Statut: ${license.status}`);
            console.log(`   Machine ID: ${license.machineId || 'Non activée'}`);
            console.log(`   Date d'activation: ${license.activationDate || 'Non activée'}`);
            console.log('');
        });
    }
    
} catch (error) {
    console.error('Erreur lors de la lecture de la base de données:', error.message);
} finally {
    db.close();
}
