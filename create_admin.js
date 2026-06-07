const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wotfalrbvttquqshitfs.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvdGZhbHJidnR0cXVxc2hpdGZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDg0MTM2MSwiZXhwIjoyMDk2NDE3MzYxfQ.gciV_altAXRx8w0IjUgQvNg-MRIkaQWIQl_CdiWMyb0';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function createAdmin() {
    console.log("Creating admin user in Supabase Auth...");
    const { data, error } = await supabase.auth.admin.createUser({
        email: 'admin@dabakh.com',
        password: 'Macodou18',
        email_confirm: true
    });

    if (error) {
        console.error("Error creating user:", error);
    } else {
        console.log("Admin user successfully created:", data.user.id);
    }
}

createAdmin();
