import codecs
import re

content = codecs.open('script.js', 'r', 'utf-8').read()

# 1. savePatientRemote
content = content.replace("""async function savePatientRemote(p) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from('profiles').upsert([{
        name: p.name,
        phone: p.phone,
        address: p.address,
        password_hash: p.password,
        region: p.region || 'Thiès',
        registered_at: p.registeredAt || new Date().toISOString()
    }], { onConflict: 'phone' });
    if (error) console.error('Erreur sauvegarde patient Supabase:', error);""", """async function savePatientRemote(p) {
    if (!supabaseClient) return;
    const profileData = {
        name: p.name,
        phone: p.phone,
        address: p.address,
        password_hash: p.password,
        region: p.region || 'Thiès',
        registered_at: p.registeredAt || new Date().toISOString()
    };
    if (p.id) profileData.id = p.id;
    const { error } = await supabaseClient.from('profiles').upsert([profileData], { onConflict: 'phone' });
    if (error) console.error('Erreur sauvegarde patient Supabase:', error);""")

# 2. register-form
content = content.replace("""            const hashedPassword = await hashPassword(password);

            const newPatientObj = {
                name,
                address,
                phone: phoneRes.formatted,
                password: hashedPassword,
                registeredAt: new Date().toISOString(),
                region: "Thiès"
            };

            registeredPatients.push(newPatientObj);
            localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
            savePatientRemote(newPatientObj);""", """            const hashedPassword = await hashPassword(password);

            let authUserId = null;
            if (supabaseClient) {
                const email = phoneRes.formatted.replace(/\s+/g, '') + '@dabakh.com';
                const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password
                });
                if (authError) {
                    alert("Erreur lors de la création du compte sécurisé : " + authError.message);
                    return;
                }
                authUserId = authData.user?.id;
            }

            const newPatientObj = {
                id: authUserId,
                name,
                address,
                phone: phoneRes.formatted,
                password: hashedPassword,
                registeredAt: new Date().toISOString(),
                region: "Thiès"
            };

            registeredPatients.push(newPatientObj);
            localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
            savePatientRemote(newPatientObj);""")

# 3. login-form patient
match = re.search(r"            // 2\. Patient Login Check.*?            currentUser = patientMatch;", content, re.DOTALL)
if match:
    new_login = """            // 2. Patient Login Check — Sécurisé via Supabase Auth
            let patientMatch = null;
            const phoneRes = validateSenegalPhone(identifier);

            if (!phoneRes.isValid) {
                alert("Veuillez utiliser votre numéro de téléphone pour vous connecter (ex: 77 123 45 67).");
                return;
            }

            if (supabaseClient) {
                const email = phoneRes.formatted.replace(/\s+/g, '') + '@dabakh.com';
                const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: pass
                });
                
                if (authError) {
                    alert("Identifiants incorrects. Veuillez vérifier votre numéro et mot de passe.");
                    return;
                }
                
                const { data: remoteP } = await supabaseClient
                    .from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
                    
                if (remoteP) {
                    patientMatch = {
                        id: remoteP.id, name: remoteP.name, phone: remoteP.phone, address: remoteP.address,
                        password: remoteP.password_hash, registeredAt: remoteP.registered_at, region: remoteP.region
                    };
                    
                    const existingIdx = registeredPatients.findIndex(p => p.phone === patientMatch.phone);
                    if (existingIdx >= 0) registeredPatients[existingIdx] = patientMatch;
                    else registeredPatients.push(patientMatch);
                    localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
                } else {
                    alert("Profil introuvable en base de données.");
                    return;
                }
            } else {
                alert("Erreur de connexion serveur Supabase.");
                return;
            }

            currentUser = patientMatch;"""
    content = content[:match.start()] + new_login + content[match.end():]
else:
    print('Failed to match patient login')

# 4. adminAddPatientForm
match_admin = re.search(r"            const newPat = \{\s*name,\s*address,\s*phone: phoneRes\.formatted,\s*password,\s*region,\s*registeredAt: new Date\(\)\.toISOString\(\),\s*addedByAdmin: true\s*\};\s*registeredPatients\.push\(newPat\);\s*localStorage\.setItem\('daba_patients', JSON\.stringify\(registeredPatients\)\);\s*savePatientRemote\(newPat\);", content, re.DOTALL)
if match_admin:
    new_admin = """            let authUserId = null;
            if (supabaseClient) {
                const tempClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
                });
                const email = phoneRes.formatted.replace(/\s+/g, '') + '@dabakh.com';
                const { data: authData, error: authError } = await tempClient.auth.signUp({
                    email: email,
                    password: password
                });
                if (authError) {
                    alert("Erreur création compte Supabase: " + authError.message);
                    return;
                }
                authUserId = authData.user?.id;
            }

            const newPat = {
                id: authUserId,
                name,
                address,
                phone: phoneRes.formatted,
                password,
                region,
                registeredAt: new Date().toISOString(),
                addedByAdmin: true
            };

            registeredPatients.push(newPat);
            localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
            savePatientRemote(newPat);"""
    content = content[:match_admin.start()] + new_admin + content[match_admin.end():]
else:
    print('Failed to match adminAddPatientForm')

with codecs.open('script.js', 'w', 'utf-8') as f:
    f.write(content)
print('Done!')
