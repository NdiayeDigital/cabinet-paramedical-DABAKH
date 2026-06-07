const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wotfalrbvttquqshitfs.supabase.co';

// Charger la clé API à partir des variables d'environnement ou du fichier local .env
let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*([^\r\n]*)/);
            if (match) {
                supabaseServiceKey = match[1].trim().replace(/['"]/g, '');
            }
        }
    } catch (e) {
        console.warn("Erreur lors de la lecture du fichier .env local :", e.message);
    }
}

if (!supabaseServiceKey) {
    console.error("=========================================================================");
    console.error("Erreur : Clé SUPABASE_SERVICE_ROLE_KEY introuvable !");
    console.error("Veuillez définir la variable d'environnement SUPABASE_SERVICE_ROLE_KEY");
    console.error("ou créer un fichier .env local contenant :");
    console.error("SUPABASE_SERVICE_ROLE_KEY=votre_cle_secrete_ici");
    console.error("=========================================================================");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function createAdmin() {
    console.log("Création de l'utilisateur administrateur dans Supabase Auth...");
    const { data, error } = await supabase.auth.admin.createUser({
        email: 'admin@dabakh.com',
        password: 'Macodou18',
        email_confirm: true
    });

    if (error) {
        console.error("Erreur lors de la création de l'administrateur :", error.message);
    } else {
        console.log("Administrateur créé avec succès ! ID :", data.user.id);
    }
}

createAdmin();
