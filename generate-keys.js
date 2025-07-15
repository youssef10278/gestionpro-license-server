const { v4: uuidv4 } = require('uuid');
const db = require('./database.js'); // Importe les fonctions de la base de données

// Fonction pour générer une clé dans le format désiré
function generateKey() {
    return uuidv4().toUpperCase().split('-').slice(0, 4).join('-');
}

// Nombre de clés à générer (passé en argument, sinon 1 par défaut)
const count = process.argv[2] ? parseInt(process.argv[2], 10) : 1;

if (isNaN(count) || count < 1) {
    console.error("Veuillez fournir un nombre valide de clés à générer.");
    process.exit(1);
}

console.log(`Génération de ${count} nouvelle(s) clé(s)...`);

for (let i = 0; i < count; i++) {
    const newKey = generateKey();
    try {
        // --- LA CORRECTION EST ICI ---
        // On appelle `db.addLicense()` au lieu de `db.addKey()`
        const result = db.addLicense(newKey);
        
        if (result.changes > 0) {
            console.log(`Clé ajoutée avec succès : ${newKey}`);
        } else {
            console.error(`Erreur lors de l'ajout de la clé : ${newKey}`);
        }

    } catch (error) {
        console.error(`Erreur lors de la tentative d'ajout de la clé ${newKey}:`, error.message);
    }
}

console.log("Opération terminée.");