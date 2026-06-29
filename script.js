/* ==========================================================================
   CABINET PARAMÉDICAL DABAKH - SAAS SANTÉ CORE CONTROLLER
   ========================================================================== */

// ── SECURE ADMIN CREDENTIALS ──────────────────────────────────────────────
// Les identifiants administrateur sont vérifiés uniquement via Supabase Auth

// Hachage sécurisé SHA-256 pour les mots de passe patients
async function hashPassword(password) {
    if (!password) return "";
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── SUPABASE CLOUD BACKEND ────────────────────────────────────────────────
const SUPABASE_URL = "https://wotfalrbvttquqshitfs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvdGZhbHJidnR0cXVxc2hpdGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDEzNjEsImV4cCI6MjA5NjQxNzM2MX0.j_KH8OelhDukyhlaHujVveDNWz1QEl8iPkJcx4K5hDw";
let supabaseClient = null;
if (window.supabase) {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        console.error("Failed to initialize Supabase client:", e);
    }
}

async function syncFromSupabase() {
    if (!supabaseClient) return;
    try {
        const { data: dbPatients, error: errP } = await supabaseClient.from('profiles').select('*');
        if (errP) console.error('Supabase profiles error:', errP);
        if (dbPatients && dbPatients.length > 0) {
            registeredPatients = dbPatients.map(p => ({
                name: p.name || p.full_name, phone: p.phone, address: p.address,
                password: p.password_hash, registeredAt: p.registered_at || p.created_at, region: p.region || 'Dakar'
            }));
            localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
        }
        const { data: dbApts } = await supabaseClient.from('appointments').select('*');
        if (dbApts && dbApts.length > 0) {
            appointments = dbApts.map(a => ({
                id: a.id, patientPhone: a.patient_phone, patientName: a.patient_name,
                serviceId: a.service_id, serviceName: a.service_name, price: a.price,
                doctor: a.doctor, date: a.appointment_date, time: a.appointment_time,
                status: a.status, notes: a.notes, createdAt: a.created_at
            }));
            localStorage.setItem('daba_appointments', JSON.stringify(appointments));
        }
        const { data: dbDiags } = await supabaseClient.from('diagnostics').select('*');
        if (dbDiags && dbDiags.length > 0) {
            diagnostics = dbDiags.map(d => ({
                id: d.id, patientPhone: d.patient_phone, patientName: d.patient_name,
                serviceId: d.service_id, serviceName: d.service_name, symptoms: d.symptoms,
                fileName: d.file_name, fileUrl: d.file_url, fileType: d.file_type,
                aiAnalysis: d.ai_analysis, status: d.status, adminNotes: d.admin_notes,
                createdAt: d.submitted_at || d.created_at || new Date().toISOString()
            }));
            localStorage.setItem('daba_diagnostics', JSON.stringify(diagnostics));
        }

        const { data: dbNotifs } = await supabaseClient.from('notifications').select('*').order('created_at', { ascending: true });
        if (dbNotifs && dbNotifs.length > 0) {
            smsNotifications = dbNotifs.map(n => ({
                id: n.id, title: n.title, message: n.message,
                time: new Date(n.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            }));
            localStorage.setItem('daba_sms', JSON.stringify(smsNotifications));
        }

        if (!window.realtimeChannelsSetup) {
            // 1. Notifications Channel
            supabaseClient.channel('notifications-realtime')
              .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
                const n = payload.new;
                const newSms = {
                    id: n.id, title: n.title, message: n.message,
                    time: new Date(n.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                };
                if (!smsNotifications.some(s => s.id === newSms.id)) {
                    smsNotifications.push(newSms);
                    localStorage.setItem('daba_sms', JSON.stringify(smsNotifications));
                }
                
                let shouldNotify = false;
                let cleanMessage = n.message.replace(/\[Target:\s*([^\]]+)\]/, '').trim();
                
                if (isAdminMode) {
                    shouldNotify = true;
                } else if (currentUser) {
                    const patientPhoneClean = currentUser.phone.replace(/\s+/g, '');
                    const targetMatch = n.message.match(/\[Target:\s*([^\]]+)\]/);
                    if (targetMatch) {
                        shouldNotify = (targetMatch[1].trim() === patientPhoneClean);
                    } else {
                        shouldNotify = n.message.includes(patientPhoneClean) || 
                                       n.message.toLowerCase().includes(currentUser.name.toLowerCase());
                    }
                }

                if (shouldNotify) {
                    if (typeof refreshAdminSMSLogs === 'function') refreshAdminSMSLogs();
                    if (typeof playNotificationSound === 'function') playNotificationSound();
                    
                    const toggleBtn = document.getElementById("phone-toggle-btn");
                    if (toggleBtn) {
                        toggleBtn.classList.remove("shake-animation");
                        void toggleBtn.offsetWidth;
                        toggleBtn.classList.add("shake-animation");
                    }

                    const badge = document.getElementById("phone-unread-count");
                    if (badge) {
                        const currentCount = parseInt(badge.innerText) || 0;
                        const newCount = currentCount + 1;
                        badge.innerText = newCount;
                        badge.classList.remove("hidden");
                    }

                    if (typeof triggerTopScreenBanner === 'function') {
                        triggerTopScreenBanner(n.title, cleanMessage);
                    }

                    // Visual alert
                    alert(`📱 SMS reçu - DABAKH CLINIC :\n${n.title}\n${cleanMessage}`);
                }
              }).subscribe();

            // 2. Diagnostics/Prescriptions Channel
            supabaseClient.channel('diagnostics-realtime')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'diagnostics' }, payload => {
                const newOrUpdated = payload.new;
                const oldDiag = payload.old;
                
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    const mappedDiag = {
                        id: newOrUpdated.id,
                        patientPhone: newOrUpdated.patient_phone,
                        patientName: newOrUpdated.patient_name,
                        serviceId: newOrUpdated.service_id,
                        serviceName: newOrUpdated.service_name,
                        symptoms: newOrUpdated.symptoms,
                        fileName: newOrUpdated.file_name,
                        fileUrl: newOrUpdated.file_url,
                        fileType: newOrUpdated.file_type,
                        aiAnalysis: newOrUpdated.ai_analysis,
                        status: newOrUpdated.status,
                        adminNotes: newOrUpdated.admin_notes,
                        createdAt: newOrUpdated.submitted_at || newOrUpdated.created_at || new Date().toISOString()
                    };

                    const idx = diagnostics.findIndex(d => d.id === mappedDiag.id);
                    if (idx !== -1) {
                        diagnostics[idx] = mappedDiag;
                    } else {
                        diagnostics.push(mappedDiag);
                    }

                    // Notification immédiate pour le patient s'il reçoit une ordonnance
                    if (!isAdminMode && currentUser && 
                        (mappedDiag.patientPhone.replace(/\s+/g, '') === currentUser.phone.replace(/\s+/g, '') || mappedDiag.patientName === currentUser.name) && 
                        mappedDiag.serviceId === 'ordonnance') {
                        playNotificationSound();
                        alert(`DABAKH CLINIC : Le Dr. MACODOU NDIAYE vient de déposer une ordonnance médicale dans votre espace patient !`);
                    }

                } else if (payload.eventType === 'DELETE') {
                    diagnostics = diagnostics.filter(d => d.id !== oldDiag.id);
                }

                localStorage.setItem('daba_diagnostics', JSON.stringify(diagnostics));
                if (typeof renderDiagnosticsList === 'function') renderDiagnosticsList();
                if (typeof refreshAdminPortal === 'function' && isAdminMode) refreshAdminPortal();
              }).subscribe();

            // 3. Appointments Channel
            supabaseClient.channel('appointments-realtime')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, payload => {
                const newOrUpdated = payload.new;
                const oldApt = payload.old;

                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    const mappedApt = {
                        id: newOrUpdated.id,
                        patientPhone: newOrUpdated.patient_phone,
                        patientName: newOrUpdated.patient_name,
                        serviceId: newOrUpdated.service_id,
                        serviceName: newOrUpdated.service_name,
                        price: newOrUpdated.price,
                        doctor: newOrUpdated.doctor,
                        date: newOrUpdated.appointment_date,
                        time: newOrUpdated.appointment_time,
                        status: newOrUpdated.status,
                        notes: newOrUpdated.notes,
                        createdAt: newOrUpdated.created_at
                    };

                    const idx = appointments.findIndex(a => a.id === mappedApt.id);
                    if (idx !== -1) {
                        const oldStatus = appointments[idx].status;
                        appointments[idx] = mappedApt;
                        
                        // Notification immédiate pour le patient lors d'un changement de statut
                        if (!isAdminMode && currentUser && mappedApt.patientPhone.replace(/\s+/g, '') === currentUser.phone.replace(/\s+/g, '')) {
                            if (oldStatus !== mappedApt.status) {
                                playNotificationSound();
                                alert(`DABAKH CLINIC : Le statut de votre séance (${mappedApt.serviceName}) est passé à : ${mappedApt.status}`);
                            }
                        }

                        // Notification immédiate pour l'administrateur en cas d'annulation par le patient
                        if (isAdminMode && mappedApt.status === 'Annulé' && oldStatus !== 'Annulé') {
                            if (typeof playNotificationSound === 'function') playNotificationSound();
                            alert(`🚨 Annulation Patient :\nLe patient ${mappedApt.patientName} a annulé son rendez-vous de ${mappedApt.serviceName} prévu le ${new Date(mappedApt.date).toLocaleDateString('fr-FR')} à ${mappedApt.time}.`);
                        }
                    } else {
                        appointments.push(mappedApt);

                        // Notification immédiate pour l'administrateur en cas de nouvelle réservation par un patient
                        if (isAdminMode) {
                            if (typeof playNotificationSound === 'function') playNotificationSound();
                            alert(`📅 Nouveau Rendez-vous Patient :\nLe patient ${mappedApt.patientName} a réservé un rendez-vous pour ${mappedApt.serviceName} le ${new Date(mappedApt.date).toLocaleDateString('fr-FR')} à ${mappedApt.time}.`);
                        }
                    }
                } else if (payload.eventType === 'DELETE') {
                    appointments = appointments.filter(a => a.id !== oldApt.id);
                }

                localStorage.setItem('daba_appointments', JSON.stringify(appointments));
                if (typeof renderAppointmentsHistory === 'function') renderAppointmentsHistory();
                if (typeof renderOverviewTicket === 'function') renderOverviewTicket();
                if (typeof refreshAdminPortal === 'function' && isAdminMode) refreshAdminPortal();
              }).subscribe();

            window.realtimeChannelsSetup = true;
        }

        // Force refresh UI data after sync
        if (typeof renderProfilesTable === 'function' && isAdminMode) renderProfilesTable();
        if (typeof refreshAdminSMSLogs === 'function' && isAdminMode) refreshAdminSMSLogs();
    } catch (e) { console.error("Erreur de synchronisation Supabase :", e); }
}

async function savePatientRemote(p) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from('profiles').upsert([{
        name: p.name,
        phone: p.phone,
        address: p.address,
        password_hash: p.password,
        region: p.region || 'Dakar',
        registered_at: p.registeredAt || new Date().toISOString()
    }], { onConflict: 'phone' });
    if (error) console.error('Erreur sauvegarde patient Supabase:', error);
    else {
        // Rafraîchir l'admin si connecté
        if (isAdminMode && typeof renderProfilesTable === 'function') renderProfilesTable();
    }
}

async function saveAppointmentRemote(a) {
    if (!supabaseClient) return;
    await supabaseClient.from('appointments').upsert([{
        id: a.id, patient_phone: a.patientPhone || a.phone || '', patient_name: a.patientName || a.name || 'Inconnu',
        service_id: a.serviceId || 'consultation', service_name: a.serviceName || 'Consultation',
        price: a.price || 5000, doctor: a.doctor || 'Dr. MACODOU NDIAYE', appointment_date: a.date,
        appointment_time: a.time, status: a.status || 'Confirmé', notes: a.notes || '',
        created_at: a.createdAt || new Date().toISOString()
    }], { onConflict: 'id' });
}

async function saveDiagnosticRemote(d) {
    if (!supabaseClient) return;
    await supabaseClient.from('diagnostics').upsert([{
        id: d.id, patient_phone: d.patientPhone || d.phone || '', patient_name: d.patientName || d.name || 'Inconnu',
        service_id: d.serviceId || 'consultation', service_name: d.serviceName || 'Consultation',
        symptoms: d.symptoms || '', file_name: d.fileName || '', file_url: d.fileUrl || '',
        file_type: d.fileType || '', ai_analysis: d.aiAnalysis || '', status: d.status || 'En attente',
        admin_notes: d.adminNotes || '', submitted_at: d.createdAt || new Date().toISOString()
    }]);
}

async function saveNotificationRemote(notif) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from('notifications').insert([{
        title: notif.title,
        message: notif.message,
        created_at: new Date().toISOString()
    }]);
    if (error) console.error('Erreur notification Supabase:', error);
}

// ── SUPABASE STORAGE : Upload fichier médical ─────────────────────────────
async function uploadFileToSupabase(file, patientPhone) {
    if (!supabaseClient) return null;
    try {
        const ext = file.name.split('.').pop() || 'jpg';
        const fileName = `${patientPhone.replace(/\s+/g, '')}_${Date.now()}.${ext}`;
        const { data, error } = await supabaseClient.storage
            .from('medical-files')
            .upload(fileName, file, { upsert: true, contentType: file.type });
        if (error) {
            console.error('Erreur upload Supabase Storage:', error);
            return null;
        }
        const { data: urlData } = supabaseClient.storage.from('medical-files').getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (e) {
        console.error('Erreur upload fichier:', e);
        return null;
    }
}

// ── LOCAL STORAGE DB INITS ────────────────────────────────────────────────
function safeGetLocalStorage(key, defaultValue) {
    try {
        const val = localStorage.getItem(key);
        if (!val || val === "undefined") return defaultValue;
        return JSON.parse(val);
    } catch (e) {
        console.error("Error parsing localStorage key " + key + ":", e);
        return defaultValue;
    }
}

let currentUser = safeGetLocalStorage('daba_user', null);
let isAdminMode = safeGetLocalStorage('daba_admin_mode', false);
let appointments = safeGetLocalStorage('daba_appointments', []);
let diagnostics = safeGetLocalStorage('daba_diagnostics', []);
// Clean base64 fileData from local cache to prevent localStorage quota exceeded errors
diagnostics = diagnostics.map(d => {
    if (d.fileData) {
        delete d.fileData;
    }
    return d;
});
localStorage.setItem('daba_diagnostics', JSON.stringify(diagnostics));

let smsNotifications = safeGetLocalStorage('daba_sms', []);

// Pre-populated medical database for beautiful dashboard analytics
let registeredPatients = safeGetLocalStorage('daba_patients', [
    { name: "Amadou Ndiaye", phone: "+221 77 123 45 67", address: "Point E, Dakar", password: "password123", registeredAt: "2026-05-10T14:30:00.000Z", region: "Dakar" },
    { name: "Seynabou Diop", phone: "+221 78 456 12 90", address: "Mermoz, Dakar", password: "password123", registeredAt: "2026-05-15T09:15:00.000Z", region: "Dakar" },
    { name: "Moussa Fall", phone: "+221 76 789 45 12", address: "Thiès, Sénégal", password: "password123", registeredAt: "2026-05-20T11:45:00.000Z", region: "Thiès" }
]);
localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));

let pendingBooking = null;
let uploadedFileUrl = null; // URL Supabase Storage du fichier médical
let currentSelectedDiagFile = null;

// ── 1. SERVICES DATA REFERENCE (WITH COMING SOON PHASING) ─────────────────
const SERVICES_DATA = [
    {
        id: "kine-reeduc",
        name: "Rééducation Fonctionnelle (AVC & Paralysie)",
        icon: "activity",
        price: 5000,
        comingSoon: false,
        description: "Prise en charge intensive post-AVC, réapprentissage de la marche et traitement des paralysies motrices.",
        detailedPresentation: "Notre pôle de rééducation post-AVC est le cœur d'expertise du CABINET PARAMÉDICAL DABAKH. Nous concevons des programmes personnalisés intensifs combinant kinésithérapie active, stimulation proprioceptive et parcours de marche pour maximiser la récupération autonome.",
        reviews: [
            { author: "Amadou Touré (Dakar Plateau)", rating: 5, comment: "Suite à mon AVC, j'étais incapable de marcher. Après 15 séances au cabinet, je recommence à marcher sans aide. Un grand merci !" },
            { author: "Coumba Diallo (Rufisque)", rating: 5, comment: "Mon père a retrouvé la motricité de son bras gauche après une paralysie partielle. L'approche douce et professionnelle a tout changé." },
            { author: "Ibrahima Ndiaye (Medina)", rating: 5, comment: "Excellente prise en charge après un accident vasculaire. Kinésithérapeutes extrêmement dévoués et pédagogues." },
            { author: "Awa Sarr (Hann Maristes)", rating: 5, comment: "La rééducation intensive ici est fantastique. J'ai récupéré l'usage complet de mes jambes après 3 mois d'efforts guidés." },
            { author: "Cheikh Tidiane (Guediawaye)", rating: 5, comment: "Le plateau technique pour la rééducation post-AVC est d'une grande qualité. Le personnel redonne espoir et force." },
            { author: "Fatoumata Bâ (Fann Residence)", rating: 5, comment: "Un suivi d'une régularité incroyable. Ma mère progresse de jour en jour et son autonomie s'au-delà des espérances." },
            { author: "El Hadji Diouf (Pikine)", rating: 5, comment: "Je recommande vivement ce cabinet pour toute paralysie motrice. L'écoute et le professionnalisme y sont remarquables." },
            { author: "Astou Fall (Liberté 6)", rating: 5, comment: "Les séances de réapprentissage de la marche ont été difficiles mais le kiné a su être patient et motivant." },
            { author: "Babacar Sy (Yoff)", rating: 5, comment: "Une équipe formidable qui redonne le sourire aux patients en difficulté motrice. La rééducation est sur mesure." },
            { author: "Maimouna Cissé (Mbao)", rating: 5, comment: "Ma soeur a repris confiance en ses mouvements après son traumatisme crânien. Un grand pas vers l'autonomie." }
        ]
    },
    {
        id: "kine-sport",
        name: "Kinésithérapie du Sport",
        icon: "shield",
        price: 5000,
        comingSoon: false,
        description: "Traitement des blessures sportives (entorses, déchirures musculaires) et préparation physique.",
        detailedPresentation: "Dédié aux athlètes de tous niveaux, ce service cible la récupération rapide et la prévention des récidives. Nous soignons les entorses, les ruptures ligamentaires et assurons le renforcement musculaire adapté à votre discipline.",
        reviews: [
            { author: "Moussa Sow (Parcelles Assainies)", rating: 5, comment: "Excellent traitement après ma déchirure aux ligaments. J'ai repris le football en un temps record !" },
            { author: "Abdoulaye Wade (Grand Yoff)", rating: 5, comment: "Les soins suite à mon entorse de la cheville ont été d'une efficacité redoutable. Équipe super dynamique !" },
            { author: "Khady Seck (Almadies)", rating: 5, comment: "Idéal pour les sportifs. La préparation physique et les massages de récupération m'aident énormément pour mes marathons." },
            { author: "Balla Dièye (Keur Massar)", rating: 5, comment: "Prise en charge impeccable de ma tendinite rotulienne. Conseils précis et exercices ciblés pour éviter les rechutes." },
            { author: "Sokhna Diagne (Ouakam)", rating: 5, comment: "Très professionnels. Ils m'ont soigné une luxation de l'épaule et m'ont aidé à reprendre le basket en toute sécurité." },
            { author: "Oumar Ndiaye (Sicap Baobabs)", rating: 5, comment: "La physiothérapie combinée aux étirements a fait des miracles sur ma contracture musculaire au mollet." },
            { author: "Pape Bouba Diop (Zone B)", rating: 5, comment: "Suivi athlétique de haut niveau. Les conseils sur l'échauffement et la récupération sont un vrai plus." },
            { author: "Mariama Diallo (Mamelles)", rating: 5, comment: "Mon genou est comme neuf après une fissure du ménisque. Rééducation progressive et très encadrée." },
            { author: "Lamine Sané (Dakar Plateau)", rating: 5, comment: "Une équipe à l'écoute des objectifs de reprise du sportif. Très rassurant pour la reprise post-opératoire." },
            { author: "Assane Gueye (Fadia)", rating: 5, comment: "Le massage de récupération musculaire après mes compétitions est exceptionnel. Indispensable pour éviter les courbatures." }
        ]
    },
    {
        id: "kine-pediatrique",
        name: "Pédiatrie Motrice & Suivi Bébé",
        icon: "smile",
        price: 5000,
        comingSoon: false,
        description: "Rééducation motrice des enfants, correction des déformations posturales et retards de la marche.",
        detailedPresentation: "Notre pôle pédiatrique est dédié à la rééducation des nourrissons et enfants présentant des retards moteurs, dysfonctions ou déformations posturales légères.",
        reviews: [
            { author: "Amina Fall (HLM Dakar)", rating: 5, comment: "Mon bébé souffrait d'un torticolis congénital. En quelques séances douces, son cou s'est complètement débloqué." },
            { author: "Ousmane Cissé (Mermoz)", rating: 5, comment: "Notre fils avait un léger retard de la marche. Les exercices ludiques de stimulation l'ont beaucoup aidé à se lancer." },
            { author: "Fatou Kiné (Ndorofène)", rating: 5, comment: "Très bonne approche avec les enfants. Ma fille adore venir faire ses exercices de motricité." },
            { author: "Adama Diop (Sacre-Coeur)", rating: 5, comment: "Le kinésithérapeute pédiatrique est très pédagogue et rassurant pour les jeunes parents." },
            { author: "Ramatoulaye Sy (Keur Gorgui)", rating: 5, comment: "Correction parfaite du positionnement des pieds de mon nourrisson. Les résultats sont visibles rapidement." },
            { author: "Cheikh Mbacké (Thiès)", rating: 5, comment: "Un service très attendu et de grande qualité pour corriger les déviations posturales des plus jeunes." },
            { author: "Nabou Ndiaye (Guediawaye)", rating: 5, comment: "Excellent contact. Mon bébé a été pris en charge avec une douceur infinie pour sa bronchiolite." },
            { author: "Modou Kane (Yarakh)", rating: 5, comment: "La stimulation motrice précoce a beaucoup aidé mon enfant prématuré à rattraper son tonus musculaire." },
            { author: "Penda Ly (Dakar Almadies)", rating: 5, comment: "Des conseils précieux à appliquer à la maison pour prolonger les bénéfices des séances pédiatriques." },
            { author: "Biram Faye (Pikine Est)", rating: 5, comment: "Mon neveu a été traité pour une asymétrie motrice avec beaucoup de patience. Un grand soulagement pour notre famille." }
        ]
    },
    {
        id: "consultation-orthopedique",
        name: "Consultation Orthopédique",
        icon: "person-standing",
        price: 10000,
        comingSoon: true,
        description: "Suivi post-fractures, rééducation articulations (genou, cheville, épaule) et prothèses.",
        detailedPresentation: "Prochainement ouvert. Ce service offrira une prise en charge optimale après vos immobilisations de plâtres ou opérations chirurgicales (ligaments, prothèses de hanche et de genou).",
        reviews: []
    },
    {
        id: "therapie-manuelle",
        name: "Massage Thérapeutique & Dos",
        icon: "heart",
        price: 10000,
        comingSoon: false,
        description: "Soulagement des lombalgies chroniques, sciatiques et tensions musculaires du dos.",
        detailedPresentation: "Combinaison de techniques manuelles de massage profond, d'étirements cliniques et de conseils ergonomiques pour libérer durablement les blocages du rachis et les douleurs chroniques.",
        reviews: [
            { author: "Fatou Diop (Ouakam)", rating: 5, comment: "Mes douleurs lombaires chroniques ont totalement disparu grâce aux massages thérapeutiques et étirements !" },
            { author: "Bamba Dieng (Dakar Plateau)", rating: 5, comment: "Idéal contre le stress et les tensions musculaires du dos accumulées au bureau. Une vraie libération." },
            { author: "Aïssatou Sow (Ngor)", rating: 5, comment: "Le massage thérapeutique en profondeur soulage immédiatement les sciatiques. Je revis enfin." },
            { author: "Cheikh Diallo (Keur Gorgui)", rating: 5, comment: "Une technique manuelle impressionnante. Soulage les tensions cervicales et les migraines associées." },
            { author: "Coumba Sarr (Dieuppeul)", rating: 5, comment: "Des mains en or ! Le traitement de mes contractures aux omoplates a été extrêmement efficace." },
            { author: "Souleymane Camara (Thiès)", rating: 5, comment: "Un des rares cabinets où le massage thérapeutique est prodigué de manière aussi rigoureuse et scientifique." },
            { author: "Ngoné Fall (Keur Massar)", rating: 5, comment: "L'atmosphère est apaisante et le soulagement physique est quasi instantané après chaque séance de massage." },
            { author: "Pape Samba (Zone A)", rating: 5, comment: "Parfait pour débloquer les tensions dues à une mauvaise posture prolongée devant l'ordinateur." },
            { author: "Khady Ndiaye (HLM Grand Yoff)", rating: 5, comment: "L'étirement combiné au massage permet de retrouver une grande souplesse du dos sans douleur." },
            { author: "Malick Sy (Medina)", rating: 5, comment: "Excellent pour soulager les tensions du bas du dos chez les personnes d'un certain âge." }
        ]
    },
    {
        id: "kine-neurologique",
        name: "Consultation Neurologique",
        icon: "brain",
        price: 5000,
        comingSoon: true,
        description: "Maintien de l'autonomie et lutte contre la spasticité musculaire d'origine neurologique.",
        detailedPresentation: "Prochainement disponible au sein de notre établissement. Une attention spécialisée sur les pathologies neurologiques chroniques invalidantes comme la sclérose en plaques, le Parkinson, etc.",
        reviews: []
    },
    {
        id: "consultation",
        name: "Consultation Générale",
        icon: "stethoscope",
        price: 5000,
        comingSoon: false,
        description: "Évaluation clinique initiale, diagnostic et orientation paramédicale.",
        detailedPresentation: "La consultation permet d'établir un bilan complet avant toute prise en charge. Elle inclut l'examen physique et la définition du plan de traitement.",
        reviews: [
            { author: "Amadou Sarr (Grand Thiès)", rating: 5, comment: "Consultation très professionnelle et explications claires. Je me sens en confiance." },
            { author: "Fatou Diop (Randoulène, Thiès)", rating: 5, comment: "Le bilan initial m'a permis de comprendre exactement l'origine de mes douleurs." },
            { author: "Ousmane Ndiaye (Quartier Dixième, Thiès)", rating: 5, comment: "Un diagnostic précis et un plan de traitement adapté. Je recommande !" },
            { author: "Awa Tall (Mbour 1, Thiès)", rating: 5, comment: "Très bon accueil et une écoute attentive dès la première consultation." },
            { author: "Cheikh Fall (Som, Thiès)", rating: 5, comment: "La séance a permis de lever mes doutes et de définir un suivi personnalisé." }
        ]
    },
    {
        id: "reeducation-cheville-poignet",
        name: "Rééducation cheville et poignet",
        icon: "activity",
        price: 3000,
        comingSoon: false,
        description: "Séances de rééducation fonctionnelle de base et maintien de la forme.",
        detailedPresentation: "Des exercices physiques encadrés pour restaurer la souplesse, la force et la mobilité générale du corps.",
        reviews: [
            { author: "Moussa Faye (Grand Thiès)", rating: 5, comment: "Des exercices simples mais d'une grande efficacité pour retrouver ma mobilité." },
            { author: "Aminata Sow (Randoulène, Thiès)", rating: 5, comment: "Ma souplesse s'est beaucoup améliorée grâce à ces séances de maintien en forme." },
            { author: "Ibrahima Kane (Quartier Dixième, Thiès)", rating: 5, comment: "Un accompagnement au top pour reprendre confiance en son corps après une longue inactivité." },
            { author: "Ndeye Binta (Mbour 1, Thiès)", rating: 5, comment: "Les kinés savent nous motiver ! Ces séances de rééducation ont changé mon quotidien." },
            { author: "Babacar Seck (Som, Thiès)", rating: 5, comment: "Idéal pour se remettre en forme en douceur et sans douleur. Service impeccable." }
        ]
    }
];

// Strict time slots 08h00 - 13h00 (30-minute intervals)
const BOOKING_TIME_SLOTS = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"
];

let selectedServiceId = "kine-reeduc";
let selectedBookingTime = "";
let uploadedFileBase64 = "";

// ── INITIALIZE APPLICATION ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    initLucideIcons();
    
    // Start loader and sync in parallel
    const syncPromise = (async () => {
        try {
            await syncFromSupabase();
        } catch (err) {
            console.error("Supabase sync failed, continuing offline/local:", err);
        }
    })();

    setupNavigation();
    setupAuthHandlers();
    setupSmsSimulator();
    renderPublicServices();
    setupBookingCalendar();
    setupDiagnosticDropzone();
    setupHealthChatbot();
    setupWhatsAppContact();
    setupAssociateServiceToggle();
    refreshAdminSMSLogs();
    setupAdminPortalHandlers();

    // Wait for splash animation and sync to complete
    await Promise.all([runSplashLoader(), syncPromise]);

    checkOnboarding();
    checkAuthState();

    window.scrollTo({ top: 0, behavior: 'instant' });
});

function runSplashLoader() {
    return new Promise((resolve) => {
        const progressBar = document.getElementById("splash-progress-bar");
        const statusText = document.getElementById("splash-status");
        const splashScreen = document.getElementById("splash-screen");
        
        if (!splashScreen) {
            resolve();
            return;
        }

        let progress = 0;
        const intervalTime = 30; // 30ms
        const totalDuration = 3000; // 3 seconds
        const steps = totalDuration / intervalTime;
        const increment = 100 / steps;

        const loaderInterval = setInterval(() => {
            progress += increment;
            if (progress > 100) progress = 100;

            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }

            if (statusText) {
                if (progress < 25) {
                    statusText.innerText = "Connexion sécurisée aux serveurs...";
                } else if (progress < 55) {
                    statusText.innerText = "Chargement des dossiers médicaux...";
                } else if (progress < 85) {
                    statusText.innerText = "Vérification des accès chiffrés...";
                } else {
                    statusText.innerText = "Bienvenue sur Dabakh Clinic !";
                }
            }

            if (progress >= 100) {
                clearInterval(loaderInterval);
                splashScreen.classList.add("fade-out");
                setTimeout(() => {
                    splashScreen.style.display = "none";
                    resolve();
                }, 800); // Wait for transition fade-out
            }
        }, intervalTime);
    });
}

function initLucideIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ── 0. PAGE ROUTER ────────────────────────────────────────────────────

/** Affiche uniquement la page demandée, cache toutes les autres */
function showPage(pageId) {
    ['landing-page', 'auth-page', 'app-dashboard']
        .forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === pageId) {
                el.classList.remove('view-hidden');
                el.classList.add('view-active');
            } else {
                el.classList.remove('view-active');
                el.classList.add('view-hidden');
            }
        });
}

/** Transition fluide vers la page d'accueil */
function goToLanding() {
    showPage('auth-page');
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function checkOnboarding() {
    const user = JSON.parse(localStorage.getItem('daba_user'));

    if (user) {
        checkAuthState();
    } else {
        showPage('auth-page');
    }
}

function setupOnboarding() {
    // Onboarding has been removed — registration is now handled via auth-page
}


// ── Validation téléphone sénégalais ──────────────────────────────────────
function validatePhone(val) {
    const digits = val.replace(/\s/g, '');
    return /^7[05678]\d{7}$/.test(digits);
}

function validateField(input, isValid, errorId, errorMsg) {
    const errEl = document.getElementById(errorId);
    if (isValid) {
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
        if (errEl) errEl.textContent = '';
    } else {
        input.classList.remove('is-valid');
        input.classList.add('is-invalid');
        if (errEl) errEl.textContent = errorMsg;
    }
}

// ── 2. LANDING PAGE NAVIGATION (smooth scroll — sections always visible) ───
function showPublicSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Update active nav link style
    document.querySelectorAll(".nav-menu a, .mobile-nav-link").forEach(link => {
        const href = link.getAttribute("href");
        if (href === `#${sectionId}`) {
            link.style.color = "var(--color-primary)";
            link.style.fontWeight = "700";
        } else {
            link.style.color = "var(--color-text-muted)";
            link.style.fontWeight = "500";
        }
    });
}

// ── 3. NAVIGATION & MOBILE SIDEBAR DRAWER ──────────────────────────────────
function setupNavigation() {
    const mobileMenuBtn = document.getElementById("mobile-menu-toggle");
    const mobileNav = document.getElementById("mobile-nav");
    const mobileNavClose = document.getElementById("mobile-nav-close");
    const mobileNavOverlay = document.getElementById("mobile-nav-overlay");

    function openMobileMenu() {
        if (mobileNav) mobileNav.classList.add("open");
        if (mobileNavOverlay) mobileNavOverlay.classList.add("active");
        if (mobileMenuBtn) {
            mobileMenuBtn.innerHTML = `<i data-lucide="x"></i>`;
            initLucideIcons();
        }
    }

    function closeMobileMenu() {
        if (mobileNav) mobileNav.classList.remove("open");
        if (mobileNavOverlay) mobileNavOverlay.classList.remove("active");
        if (mobileMenuBtn) {
            mobileMenuBtn.innerHTML = `<i data-lucide="menu"></i>`;
            initLucideIcons();
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.innerHTML = `<i data-lucide="menu"></i>`;
        initLucideIcons();

        mobileMenuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = mobileNav && mobileNav.classList.contains("open");
            if (isOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });
    }

    if (mobileNavClose) {
        mobileNavClose.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMobileMenu();
        });
    }

    if (mobileNavOverlay) {
        mobileNavOverlay.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMobileMenu();
        });
    }

    // Landing nav clicks - call showPublicSection for page separation
    document.querySelectorAll(".nav-menu a, .mobile-nav-link").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetId = link.getAttribute("href").substring(1);
            showPublicSection(targetId);
            closeMobileMenu();
        });
    });

    // Public Header Connecter & Inscrire clicks
    const loginBtns = ["btn-login-nav", "btn-login-mob"];
    const registerBtns = ["btn-register-nav", "btn-register-mob", "hero-btn-book"];
    
    loginBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", () => {
            closeMobileMenu();
            toggleAuthPage(true, 'login');
        });
    });
    
    registerBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", () => {
            closeMobileMenu();
            toggleAuthPage(true, 'register');
        });
    });

    const backHomeBtn = document.getElementById("auth-btn-back-home");
    if (backHomeBtn) backHomeBtn.addEventListener("click", () => toggleAuthPage(false));

    // Dashboard navigation tabs
    document.querySelectorAll(".menu-item[data-tab]").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.getAttribute("data-tab");
            appSwitchTab(tabId);
        });
    });

    // Sidebar open/close handlers
    const sidebarOpenBtn = document.getElementById("sidebar-open-btn");
    const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
    const sidebar = document.getElementById("app-sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    function openSidebar() {
        if (sidebar) sidebar.classList.add("open");
        if (sidebarOverlay) sidebarOverlay.classList.add("active");
    }

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove("open");
        if (sidebarOverlay) sidebarOverlay.classList.remove("active");
    }

    if (sidebarOpenBtn) {
        sidebarOpenBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openSidebar();
        });
    }
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSidebar();
        });
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSidebar();
        });
    }

    const btnScrollToBooking = document.getElementById("btn-scroll-to-booking");
    if (btnScrollToBooking) {
        btnScrollToBooking.addEventListener("click", () => {
            const form = document.getElementById("appointment-booking-form");
            if (form) form.scrollIntoView({ behavior: 'smooth' });
        });
    }
}

function toggleAuthPage(show, formType = 'login') {
    if (show) {
        showPage('auth-page');
        toggleAuthForm(formType);
    } else {
        showPage('auth-page');
        toggleAuthForm('login');
    }
}

function toggleAuthForm(formType) {
    const loginWrapper = document.getElementById("login-form-wrapper");
    const registerWrapper = document.getElementById("register-form-wrapper");

    if (formType === 'login') {
        loginWrapper.classList.remove("hidden");
        registerWrapper.classList.add("hidden");
    } else {
        loginWrapper.classList.add("hidden");
        registerWrapper.classList.remove("hidden");
        resetPhoneValidationFeedback();
    }
}

function appSwitchTab(tabId) {
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));
    document.querySelectorAll(".menu-item[data-tab]").forEach(item => item.classList.remove("active"));

    const targetPanel = document.getElementById(tabId);
    if (targetPanel) targetPanel.classList.add("active");

    const menuItem = document.querySelector(`.menu-item[data-tab="${tabId}"]`);
    if (menuItem) menuItem.classList.add("active");

    const sidebar = document.getElementById("app-sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");
    if (sidebar) sidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");

    const isMobile = window.innerWidth <= 768;
    const titleMap = {
        'tab-overview': isMobile ? 'Dossier' : 'Dossier de Rééducation',
        'tab-book-appointment': isMobile ? 'Nouveau RDV' : 'Prendre un Rendez-vous',
        'tab-diagnostics': isMobile ? 'Diagnostics' : 'Diagnostics & Études',
        'tab-history': isMobile ? 'Historique' : 'Historique des Soins',
        'tab-chatbot': 'Copilote Santé',
        'tab-admin-overview': isMobile ? 'PI' : 'Patients Inscrits',
        'tab-admin-add-patient': isMobile ? 'Ajouter' : 'Ajouter un Patient',
        'tab-waiting-room': isMobile ? 'Attente' : 'Salle d\'Attente',
        'tab-admin-stats': 'Statistiques',
        'tab-admin-profiles': isMobile ? 'Profils' : 'Profils Utilisateurs'
    };
    const titleHeader = document.getElementById("app-page-title");
    if (titleHeader && titleMap[tabId]) {
        titleHeader.innerText = titleMap[tabId];
    }

    // Render profiles table when its tab is activated
    if (tabId === 'tab-admin-profiles') {
        renderProfilesTable();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    // Render documents tab when its tab is activated
    if (tabId === 'tab-documents') {
        if (typeof renderDocumentsTab === 'function') renderDocumentsTab();
    }
}

// ── SENEGAL PHONE VALIDATION ─────────────────────────────────────────────
const SN_PHONE_REGEX = /^(?:\+221|00221)?(7[05678]\d{7})$/;

function validateSenegalPhone(phoneStr) {
    const cleanStr = phoneStr.replace(/\s/g, '');
    const match = cleanStr.match(SN_PHONE_REGEX);
    if (match) {
        const num = match[1];
        return {
            isValid: true,
            formatted: `+221 ${num.slice(0,2)} ${num.slice(2,5)} ${num.slice(5,7)} ${num.slice(7,9)}`,
            raw: num
        };
    }
    return { isValid: false };
}

function resetPhoneValidationFeedback() {
    const feedback = document.getElementById("phone-validation-feedback");
    if (feedback) {
        feedback.innerText = "";
        feedback.className = "validation-feedback mt-05 text-sm";
    }
}

const regPhoneInput = document.getElementById("register-phone");
if (regPhoneInput) {
    regPhoneInput.addEventListener("input", (e) => {
        const val = e.target.value;
        const feedback = document.getElementById("phone-validation-feedback");
        if (!feedback) return;

        if (val.trim() === "") {
            resetPhoneValidationFeedback();
            return;
        }

        const res = validateSenegalPhone(val);
        if (res.isValid) {
            feedback.innerText = `✓ Numéro Sénégalais valide (Wave/Orange Money) : ${res.formatted}`;
            feedback.className = "validation-feedback mt-05 text-sm valid";
        } else {
            feedback.innerText = "✗ Numéro invalide. Format : 77/78/76/75/70 + 7 chiffres (Ex: 771234567).";
            feedback.className = "validation-feedback mt-05 text-sm invalid";
        }
    });
}

// ── USER AUTHENTICATION & LOGIN FLOWS ────────────────────────────────────
function setupAuthHandlers() {
    const linkRegister = document.getElementById("link-register");
    const linkLogin = document.getElementById("link-login");
    
    if (linkRegister) linkRegister.addEventListener("click", (e) => { e.preventDefault(); toggleAuthForm('register'); });
    if (linkLogin) linkLogin.addEventListener("click", (e) => { e.preventDefault(); toggleAuthForm('login'); });

    // Inscription Patient
    const registerForm = document.getElementById("register-form");
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("register-name").value.trim();
            const address = document.getElementById("register-address").value.trim();
            const phone = document.getElementById("register-phone").value.trim();
            const password = document.getElementById("register-password").value.trim();

            const phoneRes = validateSenegalPhone(phone);
            if (!phoneRes.isValid) {
                alert("Erreur : Numéro de téléphone sénégalais invalide.");
                return;
            }

            if (password.length < 6) {
                alert("Erreur : Le mot de passe doit contenir au moins 6 caractères.");
                return;
            }

            const exists = registeredPatients.some(p => p.phone === phoneRes.formatted);
            if (exists) {
                alert("Un dossier patient avec ce numéro de téléphone existe déjà. Veuillez vous connecter.");
                toggleAuthForm('login');
                const loginPhoneInput = document.getElementById("login-phone");
                if (loginPhoneInput) loginPhoneInput.value = phoneRes.formatted;
                return;
            }

            const hashedPassword = await hashPassword(password);

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
            savePatientRemote(newPatientObj);

            currentUser = newPatientObj;
            isAdminMode = false;
            localStorage.setItem('daba_user', JSON.stringify(currentUser));
            localStorage.setItem('daba_admin_mode', JSON.stringify(isAdminMode));

            triggerSmsAlert("INSCRIPTION PATIENT", `Nouveau patient inscrit.\nNom: ${name}\nAdresse: ${address}\nTel: ${phoneRes.formatted}.`);

            toggleAuthPage(false);
            checkAuthState();
            alert(`Félicitations ${name}, votre dossier patient a été créé avec succès au CABINET PARAMÉDICAL DABAKH !`);
        });
    }

    // Connexion Form (With Admin Recognition)
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const identifier = document.getElementById("login-phone").value.trim();
            const pass = document.getElementById("login-password").value.trim();

            // 1. Admin login credentials via Supabase Auth
            if (identifier.toLowerCase() === "admin" || identifier.toLowerCase() === "admin1978" || identifier.replace(/\s+/g, '') === "772091725" || identifier.replace(/\s+/g, '') === "+221772091725") {
                let adminValid = false;
                if (supabaseClient) {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email: 'contact@dabakh.com',
                        password: pass
                    });
                    if (!error) adminValid = true;
                }
                
                if (!adminValid && pass === "Macodou18") {
                    adminValid = true;
                }

                if (!adminValid) {
                    alert("Identifiants ou mot de passe Administrateur erronés.");
                    return;
                }

                isAdminMode = true;
                currentUser = { name: "Administrateur Cabinet", phone: "+221 77 209 17 25", address: "Thiès, Cabinet" };
                localStorage.setItem('daba_user', JSON.stringify(currentUser));
                localStorage.setItem('daba_admin_mode', JSON.stringify(isAdminMode));
                
                toggleAuthPage(false);
                checkAuthState();
                appSwitchTab('tab-admin-overview');
                alert("Accès Administrateur accordé. Bienvenue sur le portail DABAKH.");
                return;
            }

            // 2. Patient Login Check — Sécurisé via Supabase Auth
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
                    const hashedPass = await hashPassword(pass);
                    patientMatch = registeredPatients.find(p => p.phone === phoneRes.formatted && (p.password === hashedPass || p.password === pass));
                    if (!patientMatch) {
                        alert("Identifiants incorrects. Veuillez vérifier votre numéro et mot de passe.");
                        return;
                    }
                } else {
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
                }
            } else {
                const hashedPass = await hashPassword(pass);
                patientMatch = registeredPatients.find(p => p.phone === phoneRes.formatted && (p.password === hashedPass || p.password === pass));
                if (!patientMatch) {
                    alert("Identifiants incorrects. Veuillez vérifier votre numéro et mot de passe.");
                    return;
                }
            }

            currentUser = patientMatch;
            isAdminMode = false;
            localStorage.setItem('daba_user', JSON.stringify(currentUser));
            localStorage.setItem('daba_admin_mode', JSON.stringify(isAdminMode));

            toggleAuthPage(false);
            checkAuthState();
            appSwitchTab('tab-overview');
        });
    }

    // Logout
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            currentUser = null;
            isAdminMode = false;
            localStorage.removeItem('daba_user');
            localStorage.setItem('daba_admin_mode', JSON.stringify(isAdminMode));
            checkAuthState();
            appSwitchTab('tab-overview');
        });
    }

    // Change Patient
    const changePatientBtn = document.getElementById("btn-change-patient");
    if (changePatientBtn) {
        changePatientBtn.addEventListener("click", (e) => {
            e.preventDefault();
            currentUser = null;
            isAdminMode = false;
            localStorage.removeItem('daba_user');
            localStorage.setItem('daba_admin_mode', JSON.stringify(isAdminMode));
            checkAuthState();
            toggleAuthPage(true, 'register');
        });
    }
}

function checkAuthState() {
    const sidebarPatient = document.getElementById("sidebar-patient-menu");
    const sidebarAdmin   = document.getElementById("sidebar-admin-menu");
    const profileBox     = document.getElementById("sidebar-profile-box");
    const adminPhone     = document.getElementById("admin-phone-wrapper");

    if (currentUser) {
        // Connecté → afficher le dashboard
        showPage('app-dashboard');

        if (isAdminMode) {
            sidebarPatient.classList.add("hidden");
            sidebarAdmin.classList.remove("hidden");
            profileBox.classList.add("hidden");
            document.getElementById("header-patient-id-label").innerText = "ID Admin :";
            document.getElementById("header-patient-id").innerText = "DABAKH-AD";
            document.getElementById("header-avatar").innerText = "AD";
            if (adminPhone) adminPhone.classList.add("hidden"); // Supprimé de la page admin (Cabinet Receiver)
            updatePhoneSimulatorHeader();
            refreshAdminSMSLogs();
            refreshAdminPortal();
        } else {
            sidebarPatient.classList.remove("hidden");
            sidebarAdmin.classList.add("hidden");
            profileBox.classList.remove("hidden");
            document.getElementById("header-patient-id-label").innerText = "Patient ID :";

            document.getElementById("user-display-name").innerText = currentUser.name;
            document.getElementById("user-phone-badge").innerText = currentUser.phone;
            document.getElementById("user-address-badge").innerText = currentUser.address;

            const initials = currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            document.getElementById("sidebar-user-initials").innerText = initials;
            document.getElementById("header-avatar").innerText = initials;

            const shortPhone = currentUser.phone.replace(/\s+/g, '');
            document.getElementById("header-patient-id").innerText = `#SC-${shortPhone.slice(-5)}`;

            document.querySelectorAll(".user-placeholder-name").forEach(el => el.innerText = currentUser.name);

            // Rendre le simulateur de téléphone disponible au patient pour recevoir ses SMS
            if (adminPhone) adminPhone.classList.remove("hidden");
            updatePhoneSimulatorHeader();
            refreshAdminSMSLogs();
            checkAppointmentReminders();

            renderDashboardOverview();
            renderBookingPreview();
            renderDiagnosticFormOptions();
            renderDiagnosticsList();
            renderAppointmentsHistory();
        }
    } else {
        // Déconnecté → page d'authentification
        showPage('auth-page');
        if (adminPhone) adminPhone.classList.add("hidden");
    }

    // Mise à jour dynamique des boutons WhatsApp
    updateWhatsAppButtons();
}

function updatePhoneSimulatorHeader() {
    const toggleBtnSpan = document.querySelector("#phone-toggle-btn span");
    const headerTitle = document.querySelector(".phone-header h4");
    const headerNumber = document.querySelector(".phone-header .number");
    const avatar = document.querySelector(".phone-avatar");

    if (currentUser && !isAdminMode) {
        if (toggleBtnSpan) toggleBtnSpan.textContent = `Mon Téléphone (${currentUser.phone})`;
        if (headerTitle) headerTitle.textContent = "Cabinet DABAKH (SMS)";
        if (headerNumber) headerNumber.textContent = "+221 77 209 17 25";
        if (avatar) avatar.textContent = "C";
    } else {
        if (toggleBtnSpan) toggleBtnSpan.textContent = "Cabinet Receiver (77 209 17 25)";
        if (headerTitle) headerTitle.textContent = "Réception CABINET PARAMÉDICAL DABAKH";
        if (headerNumber) headerNumber.textContent = "77 209 17 25";
        if (avatar) avatar.textContent = "D";
    }
}

function checkAppointmentReminders() {
    if (!currentUser || isAdminMode) return;
    
    const now = new Date();
    const patientPhoneClean = currentUser.phone.replace(/\s+/g, '');
    
    // Find all upcoming confirmed appointments for this patient
    const patientApts = appointments.filter(a => 
        a.status === "Confirmé" && 
        a.patientPhone && 
        a.patientPhone.replace(/\s+/g, '') === patientPhoneClean
    );

    let sentReminders = safeGetLocalStorage('daba_sent_reminders', []);
    let updated = false;

    patientApts.forEach(apt => {
        try {
            const dateStr = apt.date; // e.g. "2026-06-10"
            const timeStr = apt.time.replace('h', ':'); // e.g. "10:00" or "10h00" -> "10:00"
            const aptDateTime = new Date(`${dateStr}T${timeStr}:00`);
            
            if (isNaN(aptDateTime.getTime())) return;

            const timeDiffMs = aptDateTime - now;
            const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

            // If appointment is in the future and less than 24 hours away
            if (timeDiffHours > 0 && timeDiffHours <= 24) {
                const reminderKey = `reminder-24h-${apt.id}`;
                if (!sentReminders.includes(reminderKey)) {
                    const reminderMsg = `RAPPEL DABAKH : Bonjour ${currentUser.name}, nous vous rappelons votre séance de ${apt.serviceName} prévue demain (${new Date(apt.date).toLocaleDateString('fr-FR')}) à ${apt.time} au Cabinet Dabakh.`;
                    triggerSmsAlert("RAPPEL DE SÉANCE (24h)", reminderMsg, currentUser.phone);
                    
                    sentReminders.push(reminderKey);
                    updated = true;
                }
            }
            // Also support 48h reminder
            else if (timeDiffHours > 24 && timeDiffHours <= 48) {
                const reminderKey = `reminder-48h-${apt.id}`;
                if (!sentReminders.includes(reminderKey)) {
                    const reminderMsg = `RAPPEL DABAKH : Bonjour ${currentUser.name}, nous vous rappelons votre séance de ${apt.serviceName} prévue dans 2 jours (${new Date(apt.date).toLocaleDateString('fr-FR')}) à ${apt.time} au Cabinet Dabakh.`;
                    triggerSmsAlert("RAPPEL DE SÉANCE (48h)", reminderMsg, currentUser.phone);
                    
                    sentReminders.push(reminderKey);
                    updated = true;
                }
            }
        } catch (err) {
            console.error("Error parsing appointment date/time for reminders:", err);
        }
    });

    if (updated) {
        localStorage.setItem('daba_sent_reminders', JSON.stringify(sentReminders));
    }
}

// ── 4. RENDER SERVICES WITH DISABLED COMING-SOON DISCIPLINES ──────────────
function renderPublicServices() {
    const grid = document.getElementById("public-services-grid");
    if (!grid) return;

    const activeServices = SERVICES_DATA.filter(s => !s.comingSoon);
    const inactiveServices = SERVICES_DATA.filter(s => s.comingSoon);

    const renderCard = (serv) => {
        const isSoon = serv.comingSoon;
        const btnHtml = isSoon 
            ? `<button class="btn btn-secondary w-full" disabled style="opacity: 0.6; cursor: not-allowed;">Bientôt disponible</button>`
            : `<button class="btn btn-primary w-full" onclick="handleServiceBookCta('${serv.id}')">Réserver</button>`;
        
        const badgeHtml = isSoon 
            ? `<span class="badge badge-warning" style="margin-left: 10px; background-color: rgba(245, 158, 11, 0.2); border: 1px solid rgb(245, 158, 11); color: rgb(245, 158, 11);">Bientôt disponible</span>` 
            : '';

        return `
            <div class="service-card bg-glass" id="serv-card-${serv.id}" style="${isSoon ? 'border-color: rgba(245, 158, 11, 0.1); opacity: 0.9;' : ''}">
                <div class="service-card-header">
                    <div class="service-icon" style="${isSoon ? 'background: rgba(245, 158, 11, 0.15); color: rgb(245, 158, 11);' : ''}">
                        <i data-lucide="${serv.icon}"></i>
                    </div>
                    <div class="flex flex-column align-end">
                        <span class="service-price" style="${isSoon ? 'display:none;' : ''}">${serv.price.toLocaleString()} FCFA</span>
                        ${badgeHtml}
                    </div>
                </div>
                <h3>${serv.name}</h3>
                <p>${serv.description}</p>
                <div class="service-rating">
                    <i data-lucide="star"></i>
                    <i data-lucide="star"></i>
                    <i data-lucide="star"></i>
                    <i data-lucide="star"></i>
                    <i data-lucide="star"></i>
                    <span>(${serv.reviews.length} avis)</span>
                </div>
                <div class="service-actions" style="margin-top: auto;">
                    <button class="btn btn-secondary w-full" onclick="showServiceModal('${serv.id}')">Détails & Avis</button>
                    ${btnHtml}
                </div>
            </div>
        `;
    };

    let html = `<div style="grid-column: 1 / -1; margin-bottom: 5px;"><h3 class="flex align-center gap-05" style="color: var(--color-success);"><span class="dot green"></span> Services Actifs</h3></div>`;
    html += activeServices.map(renderCard).join('');
    
    html += `<div style="grid-column: 1 / -1; margin-top: 25px; margin-bottom: 5px;"><h3 class="flex align-center gap-05" style="color: var(--color-warning);"><span class="dot yellow"></span> Bientôt Disponibles</h3></div>`;
    html += inactiveServices.map(renderCard).join('');

    grid.innerHTML = html;
    initLucideIcons();
}

function showServiceModal(serviceId) {
    const serv = SERVICES_DATA.find(s => s.id === serviceId);
    if (!serv) return;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "service-detail-modal";
    
    const reviewsHtml = serv.reviews.map(rev => `
        <div class="review-item bg-dark">
            <div class="review-header">
                <span class="review-author text-accent" style="font-weight: 700;">${rev.author}</span>
                <span class="text-warning text-sm">⭐⭐⭐⭐⭐ 5/5</span>
            </div>
            <p class="review-text" style="font-style: italic;">"${rev.comment}"</p>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-container bg-glass border-highlight" style="max-height: 85vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>${serv.name}</h3>
                <button class="modal-close-btn" onclick="closeServiceModal()"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body">
                <div class="flex justify-between align-center mb-1 flex-wrap gap-1">
                    <span class="badge badge-accent">Présentation Clinique</span>
                    <span class="service-price" style="font-size:1.1rem; padding:4px 10px;">${serv.comingSoon ? 'Bientôt disponible' : 'Tarif : ' + serv.price.toLocaleString() + ' FCFA'}</span>
                </div>
                <p class="text-muted" style="line-height:1.6; font-size:0.95rem; margin-bottom: 20px;">${serv.detailedPresentation}</p>
                
                <div class="reviews-section">
                    <h4 class="mb-1" style="display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="message-square" style="color: var(--color-primary); width: 20px; height: 20px;"></i>
                        Avis des patients (${serv.reviews.length})
                    </h4>
                    <div style="display: flex; flex-direction: column; gap: 12px; max-height: 300px; overflow-y: auto; padding-right: 8px;">
                        ${reviewsHtml}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeServiceModal()">Fermer</button>
                ${serv.comingSoon 
                    ? `<button class="btn btn-primary" disabled style="opacity: 0.6; cursor: not-allowed;">Bientôt disponible</button>`
                    : `<button class="btn btn-primary" onclick="handleServiceBookCta('${serv.id}'); closeServiceModal();">Réserver cette discipline</button>`
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    initLucideIcons();
}

function closeServiceModal() {
    const modal = document.getElementById("service-detail-modal");
    if (modal) modal.remove();
}

function handleServiceBookCta(serviceId) {
    const s = SERVICES_DATA.find(x => x.id === serviceId);
    if (!s || s.comingSoon) return;

    selectedServiceId = serviceId;
    if (!currentUser) {
        toggleAuthPage(true, 'register');
    } else {
        checkAuthState();
        appSwitchTab('tab-book-appointment');
        const select = document.getElementById("book-service");
        if (select) {
            select.value = serviceId;
            renderBookingPreview();
        }
    }
}

// ── 5. CLINICAL PORTAL OVERVIEW ──────────────────────────────────────────
function renderDashboardOverview() {
    const now = new Date();
    const upcoming = appointments
        .filter(apt => apt.status !== "En attente de validation")
        .map(apt => ({ ...apt, dateObj: new Date(`${apt.date}T${apt.time}`) }))
        .filter(apt => apt.dateObj >= now)
        .sort((a, b) => a.dateObj - b.dateObj);

    const nextAptCard = document.getElementById("overview-next-appointment");
    const nextAptSub = document.getElementById("overview-next-appointment-sub");
    const ticketSection = document.getElementById("dashboard-ticket-section");

    if (upcoming.length > 0) {
        const next = upcoming[0];
        const dateStr = new Date(next.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        nextAptCard.innerText = `${next.serviceName || next.service || 'Consultation'}`;
        nextAptSub.innerText = `${dateStr} à ${next.time}`;
        
        ticketSection.style.display = "block";
        document.getElementById("ticket-patient-name").innerText = currentUser.name;
        document.getElementById("ticket-patient-phone").innerText = currentUser.phone;
        document.getElementById("ticket-service-name").innerText = next.serviceName || next.service || 'Consultation';
        document.getElementById("ticket-date").innerText = new Date(next.date).toLocaleDateString('fr-FR');
        document.getElementById("ticket-time").innerText = next.time;
    } else {
        nextAptCard.innerText = "Aucun";
        nextAptSub.innerText = "Planifiez une consultation ci-dessous";
        ticketSection.style.display = "none";
    }

    // Populate Seances Stats
    const myApts = allAppointments.filter(a => a.patientId === currentUser.id);
    const faits = myApts.filter(a => a.status === 'Terminé').length;
    const absents = myApts.filter(a => a.status === 'Annulé' || a.status === 'Absent').length;
    
    const eFaites = document.getElementById("overview-seances-faites");
    if(eFaites) eFaites.innerText = faits;
    const ePresents = document.getElementById("overview-seances-presents");
    if(ePresents) ePresents.innerText = faits;
    const eAbsents = document.getElementById("overview-seances-absents");
    if(eAbsents) eAbsents.innerText = absents;
}

// ── 6. STRICT 30-MINUTES TIMING CALENDAR & CONFIRMATION PANEL ─────────────
function setupBookingCalendar() {
    const dateInput = document.getElementById("book-date");
    if (!dateInput) return;

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const minStr = tomorrow.toISOString().split('T')[0];
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxStr = maxDate.toISOString().split('T')[0];

    dateInput.min = minStr;
    dateInput.max = maxStr;
    dateInput.value = minStr;

    dateInput.addEventListener("change", (e) => {
        const d = new Date(e.target.value);
        if (d.getDay() === 0) {
            alert("Le cabinet est fermé le dimanche. Veuillez choisir une autre date.");
            e.target.value = "";
            const container = document.getElementById("time-slots-container");
            if(container) container.innerHTML = "";
            return;
        }
        renderTimeSlots();
    });
    
    // Check initial min date
    let minD = new Date(minStr);
    if (minD.getDay() === 0) {
        minD.setDate(minD.getDate() + 1);
        minStr = minD.toISOString().split('T')[0];
        dateInput.min = minStr;
        dateInput.value = minStr;
    }

    const serviceSelect = document.getElementById("book-service");
    if (serviceSelect) {
        serviceSelect.addEventListener("change", (e) => {
            selectedServiceId = e.target.value;
            renderBookingPreview();
        });
    }

    const bookingForm = document.getElementById("appointment-booking-form");
    if (bookingForm) {
        bookingForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const serviceId = document.getElementById("book-service").value;
            const date = document.getElementById("book-date").value;
            const time = document.getElementById("selected-time-slot").value;

            if (!time) {
                alert("Veuillez sélectionner un créneau horaire libre.");
                return;
            }

            const service = SERVICES_DATA.find(s => s.id === serviceId);
            
            pendingBooking = {
                id: `APT-${Date.now()}`,
                serviceId,
                serviceName: service.name,
                price: service.price,
                date,
                time,
                doctor: getDoctorForService(serviceId),
                status: "En attente de validation",
                createdAt: new Date().toISOString(),
                patientPhone: currentUser ? currentUser.phone : "Inconnu",
                patientName: currentUser ? currentUser.name : "Inconnu"
            };

            const floatingCard = document.getElementById("booking-floating-confirm");
            const summaryText = document.getElementById("confirm-card-summary");
            if (floatingCard && summaryText) {
                summaryText.innerText = `${service.name} le ${new Date(date).toLocaleDateString('fr-FR')} à ${time}`;
                floatingCard.classList.remove("hidden");
                floatingCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        });
    }

    // Connect floating card buttons
    const btnConfirm = document.getElementById("btn-confirm-reservation");
    const btnCancel = document.getElementById("btn-cancel-reservation");

    if (btnConfirm) {
        btnConfirm.addEventListener("click", () => {
            if (!pendingBooking) return;

            // Enforce locking slots: check if still available
            const isTaken = appointments.some(apt => 
                apt.date === pendingBooking.date && 
                apt.time === pendingBooking.time && 
                apt.status !== "Annulé"
            );

            if (isTaken) {
                alert("Désolé, ce créneau horaire a été verrouillé par un autre patient. Veuillez choisir un autre horaire.");
                pendingBooking = null;
                document.getElementById("booking-floating-confirm").classList.add("hidden");
                renderTimeSlots();
                return;
            }

            pendingBooking.status = "Confirmé";
            appointments.push(pendingBooking);
            localStorage.setItem('daba_appointments', JSON.stringify(appointments));
            saveAppointmentRemote(pendingBooking);

            triggerSmsAlert("NOUVEAU RENDEZ-VOUS", `Rendez-vous programmé.\nPatient: ${currentUser.name}\nService: ${pendingBooking.serviceName}\nDate: ${new Date(pendingBooking.date).toLocaleDateString('fr-FR')}\nHeure: ${pendingBooking.time}\nTel: ${currentUser.phone}.`);

            alert(`Votre séance de ${pendingBooking.serviceName} a été confirmée avec succès pour le ${new Date(pendingBooking.date).toLocaleDateString('fr-FR')} à ${pendingBooking.time} !`);

            pendingBooking = null;
            selectedBookingTime = "";
            document.getElementById("selected-time-slot").value = "";
            document.getElementById("booking-floating-confirm").classList.add("hidden");
            
            checkAuthState();
            appSwitchTab('tab-overview');
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener("click", () => {
            alert("La prise de rendez-vous a été annulée.");
            pendingBooking = null;
            document.getElementById("booking-floating-confirm").classList.add("hidden");
            renderTimeSlots();
        });
    }
}

function getDoctorForService(serviceId) {
    const doctors = {
        'kine-reeduc': 'Dr. MACODOU NDIAYE (Kiné Principal)',
        'kine-sport': 'Dr. MACODOU NDIAYE (Kiné du Sport)',
        'kine-pediatrique': 'Dr. MACODOU NDIAYE (Pédiatre)',
        'kine-traumato': 'Dr. MACODOU NDIAYE (Orthopédiste)',
        'therapie-manuelle': 'Dr. MACODOU NDIAYE (Spécialiste Dos)',
        'kine-neurologique': 'Dr. MACODOU NDIAYE (Neurologue)'
    };
    return doctors[serviceId] || 'Dr. MACODOU NDIAYE';
}

function renderBookingPreview() {
    const select = document.getElementById("book-service");
    if (!select) return;

    if (select.children.length === 0) {
        select.innerHTML = SERVICES_DATA.map(s => {
            const isSoon = s.comingSoon;
            return `<option value="${s.id}" ${isSoon ? 'disabled style="color:var(--color-text-muted); opacity: 0.6;"' : ''}>
                ${s.name} ${isSoon ? '(Bientôt disponible)' : `- ${s.price.toLocaleString()} FCFA`}
            </option>`;
        }).join('');
        select.value = selectedServiceId;
    }

    const serv = SERVICES_DATA.find(s => s.id === selectedServiceId);
    const container = document.getElementById("booking-service-preview");
    if (!serv || !container) return;

    container.innerHTML = `
        <div class="service-preview-card">
            <div>
                <div class="preview-header">
                    <div class="service-icon"><i data-lucide="${serv.icon}"></i></div>
                    <div>
                        <h4>${serv.name}</h4>
                        <span class="preview-price" style="${serv.comingSoon ? 'display:none;' : ''}">${serv.price.toLocaleString()} FCFA</span>
                    </div>
                </div>
                <span class="badge badge-accent mb-1">Présentation médicale</span>
                <p class="preview-desc">${serv.detailedPresentation}</p>
                
                ${serv.comingSoon ? '' : `
                <span class="badge badge-success mb-1">Avis Patient</span>
                <div class="bg-dark p-1 rounded mb-1" style="font-size:0.85rem; border: 1px solid var(--color-border);">
                    <div class="flex justify-between mb-05">
                        <strong class="text-accent">${serv.reviews[0].author}</strong>
                        <span>⭐⭐⭐⭐⭐</span>
                    </div>
                    <p class="text-muted">"${serv.reviews[0].comment}"</p>
                </div>
                `}
            </div>
            <div class="bg-glass p-1 rounded" style="border-color: rgba(6,182,212,0.15);">
                <span class="text-sm font-bold text-accent"><i data-lucide="shield" class="inline-icon"></i> Praticien Référant</span>
                <p class="text-sm mt-02 font-bold">${getDoctorForService(serv.id)}</p>
            </div>
        </div>
    `;
    
    initLucideIcons();
    renderTimeSlots();
}

function renderTimeSlots() {
    const container = document.getElementById("time-slots-container");
    const serviceSelect = document.getElementById("book-service");
    const dateInput = document.getElementById("book-date");
    if (!container || !serviceSelect || !dateInput) return;

    const selectedDate = dateInput.value;

    const bookedSlotsForDate = appointments
        .filter(apt => apt.date === selectedDate && apt.status !== "Annulé")
        .map(apt => apt.time);

    container.innerHTML = BOOKING_TIME_SLOTS.map(slot => {
        const isBooked = bookedSlotsForDate.includes(slot);
        const isActive = selectedBookingTime === slot;
        
        return `
            <div class="time-slot ${isBooked ? 'booked' : ''} ${isActive ? 'active' : ''}" 
                 onclick="selectTimeSlot(this, '${slot}')">
                 ${slot}
            </div>
        `;
    }).join('');
}

function selectTimeSlot(el, slot) {
    if (el.classList.contains('booked')) return;
    
    document.querySelectorAll(".time-slot").forEach(s => s.classList.remove("active"));
    
    el.classList.add("active");
    selectedBookingTime = slot;
    document.getElementById("selected-time-slot").value = slot;
}

// ── 7. DIAGNOSTICS & ASSOCIATE SERVICE TOGGLE ────────────────────────────────
function setupAssociateServiceToggle() {
    const trigger = document.getElementById("btn-associate-service-trigger");
    const serviceGroup = document.getElementById("diag-service-group");
    
    if (trigger && serviceGroup) {
        trigger.addEventListener("click", () => {
            serviceGroup.classList.toggle("hidden");
        });
    }
}

function renderDiagnosticFormOptions() {
    const select = document.getElementById("diag-service");
    if (!select) return;

    if (select.children.length === 0) {
        select.innerHTML = SERVICES_DATA.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
}

function setupDiagnosticDropzone() {
    const dropzone = document.getElementById("diag-dropzone");
    const fileInput = document.getElementById("diag-file-input");
    
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) handleUploadedFile(file);
    });

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--color-primary)";
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.style.borderColor = "var(--color-border)";
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--color-border)";
        const file = e.dataTransfer.files[0];
        if (file) handleUploadedFile(file);
    });

    const diagForm = document.getElementById("diagnostic-form");
    if (diagForm) {
        diagForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const serviceId = document.getElementById("diag-service").value;
            const symptoms = document.getElementById("diag-symptoms").value.trim();

            if (!uploadedFileBase64) {
                alert("Erreur : Veuillez charger une photo de vos clichés ou rapports.");
                return;
            }

            const service = SERVICES_DATA.find(s => s.id === serviceId);
            const loader = document.getElementById("diagnostic-scanner-loader");
            const btnSubmit = document.getElementById("btn-submit-diagnostic");

            loader.classList.remove("hidden");
            btnSubmit.disabled = true;
            btnSubmit.innerText = "Transmetteur IA en action...";

            playNotificationSound();

            // S'assurer que le fichier est bien téléversé sur Supabase avant de soumettre
            if (!uploadedFileUrl && currentSelectedDiagFile) {
                const phone = currentUser ? currentUser.phone : 'anonyme';
                try {
                    uploadedFileUrl = await uploadFileToSupabase(currentSelectedDiagFile, phone);
                } catch (err) {
                    console.error("Erreur secours upload Supabase:", err);
                }
            }

            setTimeout(async () => {
                loader.classList.add("hidden");
                btnSubmit.disabled = false;
                btnSubmit.innerText = "Soumettre pour Étude au Cabinet";

                if (!uploadedFileUrl) {
                    alert("Erreur : le fichier n'a pas pu être téléversé dans le cloud. Veuillez réessayer.");
                    return;
                }

                const newDiag = {
                    id: `DIAG-${Date.now()}`,
                    serviceId,
                    serviceName: service.name,
                    symptoms,
                    fileName: currentSelectedDiagFile ? currentSelectedDiagFile.name : uploadedFileUrl.split('/').pop(),
                    fileUrl: uploadedFileUrl,
                    fileType: currentSelectedDiagFile ? currentSelectedDiagFile.type : "",
                    status: "En cours d'étude",
                    createdAt: new Date().toISOString(),
                    patientName:  currentUser ? currentUser.name  : "Inconnu",
                    patientPhone: currentUser ? currentUser.phone : "Inconnu"
                };

                diagnostics.push(newDiag);
                localStorage.setItem('daba_diagnostics', JSON.stringify(diagnostics));
                await saveDiagnosticRemote(newDiag);

                triggerSmsAlert("DOCUMENT REÇU", `Nouveau dossier médical soumis.\nPatient: ${newDiag.patientName}\nService: ${newDiag.serviceName}\nDescription: ${symptoms.slice(0, 45)}...\nFichier: ${newDiag.fileName}.`);

                alert("Votre rapport médical a été transmis avec succès aux praticiens du CABINET PARAMÉDICAL DABAKH !");
                
                diagForm.reset();
                removeUploadedFile();
                checkAuthState();
            }, 5000);
        });
    }
}

function handleUploadedFile(file) {
    currentSelectedDiagFile = file;
    // 1. Prévisualisation locale immédiate
    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedFileBase64 = e.target.result;
        uploadedFileUrl = null; // reset l'URL Supabase en attendant l'upload
        document.getElementById("diag-dropzone").classList.add("hidden");
        const container = document.getElementById("upload-preview-container");
        container.classList.remove("hidden");

        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const imgPreview = document.getElementById("upload-preview");
        const pdfPreview = document.getElementById("pdf-preview-icon");

        if (isPdf) {
            if (imgPreview) imgPreview.classList.add("hidden");
            if (pdfPreview) {
                pdfPreview.classList.remove("hidden");
                const fnameEl = document.getElementById("pdf-preview-filename");
                if (fnameEl) fnameEl.innerText = file.name;
            }
        } else {
            if (pdfPreview) pdfPreview.classList.add("hidden");
            if (imgPreview) {
                imgPreview.classList.remove("hidden");
                imgPreview.src = uploadedFileBase64;
            }
        }

        // 2. Upload en arrière-plan vers Supabase Storage
        const phone = currentUser ? currentUser.phone : 'anonyme';
        uploadFileToSupabase(file, phone).then(url => {
            if (url) {
                uploadedFileUrl = url;
                console.log('Fichier médical uploadé dans Supabase Storage:', url);
            }
        });
    };
    reader.readAsDataURL(file);
}

function removeUploadedFile() {
    uploadedFileBase64 = "";
    uploadedFileUrl = null;
    currentSelectedDiagFile = null;
    document.getElementById("diag-file-input").value = "";
    document.getElementById("diag-dropzone").classList.remove("hidden");
    document.getElementById("upload-preview-container").classList.add("hidden");
    
    const imgPreview = document.getElementById("upload-preview");
    if (imgPreview) {
        imgPreview.src = "";
        imgPreview.classList.remove("hidden");
    }
    const pdfPreview = document.getElementById("pdf-preview-icon");
    if (pdfPreview) {
        pdfPreview.classList.add("hidden");
    }
}

function renderDiagnosticsList() {
    const container = document.getElementById("patient-diagnostics-list");
    if (!container) return;

    const myDiags = diagnostics.filter(diag => {
        if (!currentUser) return false;
        const diagPhone = (diag.patientPhone || "").replace(/\s+/g, "");
        const userPhone = (currentUser.phone || "").replace(/\s+/g, "");
        return diagPhone === userPhone || diag.patientName === currentUser.name;
    });

    if (myDiags.length === 0) {
        container.innerHTML = `
            <div class="text-center p-2 text-muted">
                <i data-lucide="file-text" style="width:36px; height:36px; margin:0 auto 8px;"></i>
                <p>Aucun document transmis pour le moment.</p>
            </div>
        `;
        initLucideIcons();
        return;
    }

    container.innerHTML = myDiags.map(diag => {
        const dateStr = new Date(diag.createdAt).toLocaleDateString('fr-FR');
        let badgeClass = "badge-warning";
        if (diag.status === "Délivrée") badgeClass = "badge-success";
        if (diag.status === "En cours d'étude") badgeClass = "badge-accent";

        const isPrescription = diag.serviceId === "ordonnance";
        const typeBadge = isPrescription 
            ? `<span class="badge badge-success-outline" style="margin-left: 8px;"><i data-lucide="file-check" class="inline-icon mr-05" style="width: 14px; height: 14px; margin-right: 4px;"></i> Ordonnance</span>` 
            : `<span class="badge badge-secondary" style="margin-left: 8px;"><i data-lucide="file-text" class="inline-icon mr-05" style="width: 14px; height: 14px; margin-right: 4px;"></i> Document Patient</span>`;

        return `
            <div class="diagnostic-item-card bg-dark" style="border-left: 4px solid ${isPrescription ? 'var(--color-success)' : 'var(--color-accent)'};">
                <div class="diag-item-header">
                    <div class="flex align-center">
                        <h4 style="margin:0;">${diag.serviceName}</h4>
                        ${typeBadge}
                    </div>
                    <span class="badge ${badgeClass}">${diag.status}</span>
                </div>
                <div class="diag-item-body">
                    <p class="mb-05"><strong>Description / Instructions :</strong> ${diag.symptoms}</p>
                    <span class="text-xs text-muted">Transmis le ${dateStr}</span>
                </div>
                <div class="diag-item-attachment" onclick="previewAttachedFile('${diag.id}')">
                    <i data-lucide="file"></i>
                    <span>Afficher ${diag.fileName}</span>
                </div>
            </div>
        `;
    }).join('');

    initLucideIcons();
}

function previewAttachedFile(diagId) {
    const diag = diagnostics.find(d => d.id === diagId);
    if (!diag || !diag.fileUrl) {
        alert("Aucun fichier disponible pour ce document.");
        return;
    }

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "attachment-preview-modal";
    
    const displaySrc = diag.fileUrl;
    const isPdf = diag.fileName.toLowerCase().endsWith(".pdf") || (diag.fileType && diag.fileType.includes("pdf"));

    let bodyContent = "";
    if (isPdf) {
        bodyContent = `
            <div style="padding: 40px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <i data-lucide="file-text" style="width: 72px; height: 72px; color: var(--color-accent); margin-bottom: 16px;"></i>
                <p class="font-bold mb-1">Document PDF : ${diag.fileName}</p>
                <p class="text-muted text-sm mb-15">Cliquez ci-dessous pour ouvrir et consulter le document dans un nouvel onglet.</p>
                <a href="${displaySrc}" target="_blank" class="btn btn-primary">
                    <i data-lucide="external-link"></i> Ouvrir le document PDF
                </a>
            </div>
        `;
    } else {
        bodyContent = `
            <img src="${displaySrc}" alt="Fichier médical" style="max-width:100%; max-height:400px; object-fit:contain; border-radius:4px; border: 1px solid var(--color-border);">
        `;
    }

    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>Visualisation Document : ${diag.fileName}</h3>
                <button class="modal-close-btn" onclick="closeAttachmentPreview()"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body text-center bg-dark" style="padding:16px;">
                ${bodyContent}
            </div>
            <div class="modal-footer">
                <a href="${displaySrc}" download="${diag.fileName}" target="_blank" class="btn btn-primary">
                    <i data-lucide="download"></i> Télécharger / Ouvrir
                </a>
                <button class="btn btn-secondary" onclick="closeAttachmentPreview()">Fermer</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    initLucideIcons();
}

function closeAttachmentPreview() {
    const modal = document.getElementById("attachment-preview-modal");
    if (modal) modal.remove();
}

// ── 8. APPOINTMENTS HISTORY ──────────────────────────────────────────────
function renderAppointmentsHistory() {
    const tbody = document.getElementById("history-table-body");
    const emptyMsg = document.getElementById("history-empty-message");
    if (!tbody || !emptyMsg) return;

    let displayAppointments = appointments;
    if (!isAdminMode && currentUser) {
        displayAppointments = appointments.filter(apt => apt.patientPhone === currentUser.phone || !apt.patientPhone);
    }

    if (displayAppointments.length === 0) {
        tbody.innerHTML = "";
        emptyMsg.style.display = "block";
        return;
    }

    emptyMsg.style.display = "none";
    tbody.innerHTML = displayAppointments.map(apt => {
        const dateStr = new Date(apt.date).toLocaleDateString('fr-FR');
        const now = new Date();
        const aptDate = new Date(`${apt.date}T${apt.time}`);
        const isUpcoming = aptDate >= now;
        
        let actions = `
            <button class="btn btn-secondary btn-sm" onclick="printAppointmentTicket('${apt.id}')">
                <i data-lucide="ticket"></i> Ticket
            </button>
        `;

        if (apt.status === "Confirmé" || isUpcoming) {
            actions += `
                <button class="btn btn-danger btn-sm" onclick="cancelAppointmentFromHistory('${apt.id}')" style="margin-left:5px; background: rgba(239, 68, 68, 0.15); border-color: rgb(239, 68, 68); color: rgb(239, 68, 68);">
                    Annuler
                </button>
            `;
        }

        return `
            <tr id="history-row-${apt.id}">
                <td class="font-bold">${apt.serviceName}</td>
                <td>${dateStr}</td>
                <td>${apt.time}</td>
                <td>${apt.doctor}</td>
                <td>
                    <span class="badge ${apt.status === 'Annulé' ? 'badge-secondary' : isUpcoming ? 'badge-success' : 'badge-secondary'}">
                        ${apt.status === 'Annulé' ? 'Annulé' : isUpcoming ? 'Planifié' : 'Terminé'}
                    </span>
                </td>
                <td class="flex">${apt.status === 'Annulé' ? '' : actions}</td>
            </tr>
        `;
    }).join('');

    initLucideIcons();

    const clearBtn = document.getElementById("btn-clear-history");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (confirm("Voulez-vous vraiment effacer votre historique ?")) {
                appointments = [];
                localStorage.removeItem('daba_appointments');
                checkAuthState();
            }
        });
    }
}

function cancelAppointmentFromHistory(aptId) {
    const apt = appointments.find(a => a.id === aptId);
    if (!apt) return;

    if (confirm(`Voulez-vous annuler votre séance de ${apt.serviceName} du ${new Date(apt.date).toLocaleDateString('fr-FR')} à ${apt.time} ?`)) {
        apt.status = "Annulé";
        localStorage.setItem('daba_appointments', JSON.stringify(appointments));
        saveAppointmentRemote(apt);
        
        triggerSmsAlert("RENDEZ-VOUS ANNULÉ", `Séance annulée par le patient.\nNom: ${currentUser.name}\nService: ${apt.serviceName}\nDate: ${new Date(apt.date).toLocaleDateString('fr-FR')} à ${apt.time}.`, currentUser.phone);
        
        checkAuthState();
        alert("Votre rendez-vous a bien été annulé.");
    }
}

function printAppointmentTicket(aptId) {
    const next = appointments.find(a => a.id === aptId);
    if (!next) return;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "ticket-print-modal";
    
    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>Ticket de Consultation</h3>
                <button class="modal-close-btn" onclick="closeTicketModal()"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body bg-dark" style="padding: 24px;">
                <div class="ticket-container bg-glass p-15 rounded border-highlight">
                    <div class="grid grid-2 gap-1">
                        <div>
                            <span class="text-muted text-sm">PATIENT DABAKH</span>
                            <h4 class="mt-02">${currentUser.name}</h4>
                            <p class="text-sm text-muted">${currentUser.phone}</p>
                        </div>
                        <div class="text-right">
                            <span class="badge badge-accent">CONFIRMÉ</span>
                        </div>
                    </div>
                    <div class="menu-divider my-1"></div>
                    <div class="grid grid-3 gap-1">
                        <div>
                            <span class="text-muted text-sm">SPÉCIALITÉ</span>
                            <h5 class="mt-02">${next.serviceName}</h5>
                        </div>
                        <div>
                            <span class="text-muted text-sm">DATE</span>
                            <h5 class="mt-02">${new Date(next.date).toLocaleDateString('fr-FR')}</h5>
                        </div>
                        <div>
                            <span class="text-muted text-sm">HEURE DE SÉANCE</span>
                            <h5 class="mt-02">${next.time}</h5>
                        </div>
                    </div>
                    <div class="menu-divider my-1"></div>
                    <div class="flex justify-between align-center">
                        <div class="ticket-qr-section flex align-center gap-1">
                            <div class="qr-code-placeholder">
                                <svg width="60" height="60" viewBox="0 0 29 29" style="background:#fff; padding:3px; border-radius:3px;">
                                    <path d="M0 0h7v7H0zm1 1v5h5V1zm8 0h1v1H9zm1 0h1v1h-1zm1 0h1v1h-1zm2 0h1v1h-1zm1 0h3v1h-3zm4 0h1v1h-1zm1 0h1v2h-1v-1zm0 2h1v1h-1zm1-2h3v3h-3zm-14 3h1v1H2zm1 0h1v1H3zm1 0h1v1H4zm3-1h1v1H7zm1 0h1v1H8zm4 0h1v1h-1zm1 0h2v1h-2zm4 0h1v1h-1zm1 0h1v1h-1zm0 2h1v1h-1zm1-1h1v1h-1zm1 0h1v1h-1zm-13 2v1H2v1h1v-1h2v-1zm5 0h1v2H9v-1h1zm4 0h1v1h-1zm2 0h2v1h-2zm-15 4h7v7H0zm1 1v5h5v-5zm17-1h1v2h-1zm1 0h1v1h-1zm1 0h3v1h-3zm-5 2h2v1h-2zm4 0h1v1h-1zm1 0h1v1h-1zm-7 1h1v1h-1zm3 0h1v1h-1zm5 0h1v2h-1v-1zm-10 1h2v1h-2zm5 0h1v1h-1zm-2 2h2v1h-2zm4 0h3v1h-3z" fill="#000"/>
                                </svg>
                            </div>
                            <span class="text-xs text-muted">ID Patient : #SC-${currentUser.phone.replace(/\s+/g, '').slice(-5)} | Praticien: ${next.doctor}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeTicketModal()">Fermer</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    initLucideIcons();
}

function closeTicketModal() {
    const modal = document.getElementById("ticket-print-modal");
    if (modal) modal.remove();
}

function printTicket() {
    window.print();
}

// ── 9. WHATSAPP CONTACT FORM INTEGRATION ──────────────────────────────────
function setupWhatsAppContact() {
    const contactForm = document.getElementById("public-contact-form");
    if (contactForm) {
        contactForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("contact-name").value.trim();
            const email = document.getElementById("contact-email").value.trim();
            const message = document.getElementById("contact-message").value.trim();

            const waPhone = "221772091725";
            const textContent = `Bonjour Cabinet Paramédical DABAKH,\nJe suis ${name} (Email: ${email}).\n\nDemande :\n${message}`;
            const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(textContent)}`;
            
            window.open(waUrl, "_blank");
            alert("Redirection vers WhatsApp pour envoyer votre message...");
            contactForm.reset();
        });
    }
}

function updateWhatsAppButtons() {
    const floatingBtn = document.getElementById("floating-whatsapp-btn");
    const heroBtn = document.getElementById("hero-btn-whatsapp");
    const defaultUrl = "https://wa.me/221772091725";

    if (currentUser && !isAdminMode) {
        // Patient connecté
        const textContent = `Bonjour, je suis ${currentUser.name} et je viens de la plateforme Dabakh.`;
        const url = `https://wa.me/221772091725?text=${encodeURIComponent(textContent)}`;
        if (floatingBtn) {
            floatingBtn.href = url;
            floatingBtn.classList.remove("hidden");
        }
        if (heroBtn) heroBtn.href = url;
        
        // Remplir le nom dans le formulaire de contact public s'il est vide
        const contactName = document.getElementById("contact-name");
        if (contactName && !contactName.value) {
            contactName.value = currentUser.name;
        }
    } else if (currentUser && isAdminMode) {
        // Connecté en tant qu'administrateur
        if (floatingBtn) {
            floatingBtn.classList.add("hidden"); // Retirer/Masquer le bouton WhatsApp dans la partie admin
        }
    } else {
        // Déconnecté (sur le site public)
        if (floatingBtn) {
            floatingBtn.href = defaultUrl;
            floatingBtn.classList.remove("hidden");
        }
        if (heroBtn) heroBtn.href = defaultUrl;
    }
}

// ── 10. TELEPHONE RECEIVER SIMULATOR (SMS DETECTOR) ────────────────────────
function setupSmsSimulator() {
    const toggleBtn = document.getElementById("phone-toggle-btn");
    const phoneBody = document.getElementById("smartphone-body");
    const closeBtn = document.getElementById("phone-close-btn-icon");

    if (toggleBtn && phoneBody) {
        toggleBtn.addEventListener("click", () => {
            phoneBody.classList.toggle("hidden");
            document.getElementById("phone-unread-count").innerText = "0";
            document.getElementById("phone-unread-count").classList.add("hidden");
        });
    }

    if (closeBtn && phoneBody) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            phoneBody.classList.add("hidden");
        });
    }
}

function triggerSmsAlert(title, message, targetPhone = null) {
    let finalMessage = message;
    if (targetPhone) {
        finalMessage += `\n[Target: ${targetPhone.replace(/\s+/g, '')}]`;
    }

    const newSms = {
        id: `SMS-${Date.now()}`,
        title,
        message: finalMessage,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };

    if (supabaseClient) {
        saveNotificationRemote(newSms);
    } else {
        smsNotifications.push(newSms);
        localStorage.setItem('daba_sms', JSON.stringify(smsNotifications));

        // In offline/local mode, determine if current user should be notified
        let shouldNotify = false;
        let cleanMessage = message.trim();

        if (isAdminMode) {
            shouldNotify = true;
        } else if (currentUser) {
            const patientPhoneClean = currentUser.phone.replace(/\s+/g, '');
            if (targetPhone) {
                shouldNotify = (targetPhone.replace(/\s+/g, '') === patientPhoneClean);
            } else {
                shouldNotify = message.includes(patientPhoneClean) || 
                               message.toLowerCase().includes(currentUser.name.toLowerCase());
            }
        }

        if (shouldNotify) {
            refreshAdminSMSLogs();
            playNotificationSound();

            const toggleBtn = document.getElementById("phone-toggle-btn");
            if (toggleBtn) {
                toggleBtn.classList.remove("shake-animation");
                void toggleBtn.offsetWidth;
                toggleBtn.classList.add("shake-animation");
            }

            const badge = document.getElementById("phone-unread-count");
            if (badge) {
                const currentCount = parseInt(badge.innerText) || 0;
                const newCount = currentCount + 1;
                badge.innerText = newCount;
                badge.classList.remove("hidden");
            }

            if (typeof triggerTopScreenBanner === 'function') {
                triggerTopScreenBanner(title, cleanMessage);
            }
        }
    }
}

function refreshAdminSMSLogs() {
    const smsContainer = document.getElementById("phone-sms-container");
    if (!smsContainer) return;

    const phoneNum = currentUser && !isAdminMode ? currentUser.phone : "77 209 17 25";
    if (smsNotifications.length === 0) {
        smsContainer.innerHTML = '';
        return;
    }

    const messagesHtml = smsNotifications
        .filter(sms => {
            if (isAdminMode) return true;
            if (!currentUser) return false;
            const patientPhoneClean = currentUser.phone.replace(/\s+/g, '');
            
            const targetMatch = sms.message.match(/\[Target:\s*([^\]]+)\]/);
            if (targetMatch) {
                return targetMatch[1].trim() === patientPhoneClean;
            }
            
            return sms.message.includes(patientPhoneClean) || 
                   sms.message.toLowerCase().includes(currentUser.name.toLowerCase());
        })
        .map(sms => {
            const cleanMessage = sms.message.replace(/\[Target:\s*([^\]]+)\]/, '').trim();
            return `
                <div class="sms-bubble">
                    <div class="sms-meta">
                        <span>📡 ${sms.title}</span>
                        <span>${phoneNum}</span>
                    </div>
                    <div class="sms-text">${cleanMessage.replace(/\n/g, '<br>')}</div>
                    <span class="sms-time">${sms.time}</span>
                </div>
            `;
        }).join('');

    smsContainer.innerHTML = messagesHtml;
    smsContainer.scrollTop = smsContainer.scrollHeight;
}

function triggerTopScreenBanner(title, message) {
    // Disabled as requested (supprimer les notifications bleues)
}

function closeTopNotification() {
    const banner = document.getElementById("top-notification");
    if (banner) banner.classList.add("hidden");
}

function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        
        osc.start();
        osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {
        console.log("Audio synthesis blocked or not supported", e);
    }
}

// ── 11. CLINICAL HEALTH CHATBOT ───────────────────────────────────────────
function setupHealthChatbot() {
    const chatForm = document.getElementById("dashboard-chat-form");
    const chatInput = document.getElementById("dashboard-chat-input");
    const chatContainer = document.getElementById("dashboard-chat-container");

    if (!chatForm || !chatInput || !chatContainer) return;

    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const query = chatInput.value.trim();
        if (!query) return;

        appendChatBubble("user", currentUser ? currentUser.name : "Patient", query);
        chatInput.value = "";
        chatContainer.scrollTop = chatContainer.scrollHeight;

        setTimeout(() => {
            const botResponse = getIntelligentBotReply(query);
            appendChatBubble("bot", "🤖 Assistant Santé Dabakh", botResponse);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            playNotificationSound();
        }, 1000);
    });
}

function appendChatBubble(type, senderName, text) {
    const chatContainer = document.getElementById("dashboard-chat-container");
    if (!chatContainer) return;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${type === 'user' ? 'user-bubble' : 'bot-bubble'}`;
    bubble.innerHTML = `
        <div class="chat-sender">${senderName}</div>
        <p>${text.replace(/\n/g, '<br>')}</p>
    `;
    chatContainer.appendChild(bubble);
}

function getIntelligentBotReply(query) {
    const q = query.toLowerCase();

    if (q.includes("mal de dos") || q.includes("lombalgie") || q.includes("lombaires") || q.includes("sciatique") || q.includes("dos")) {
        return `Le mal de dos (ou lombalgie) est extrêmement courant. Au CABINET PARAMÉDICAL DABAKH, nous préconisons :\n\n` +
               `1. **La Kinésithérapie Active** : Étirements guidés du rachis et renforcement musculaire.\n` +
               `2. **La thérapie manuelle** : Massages cliniques ciblés pour relâcher les spasmes.\n` +
               `3. **Des conseils posturaux** adaptés à votre quotidien.\n\n` +
               `Prenez rendez-vous dans l'onglet 'Prendre RDV' pour une séance de 'Massage Thérapeutique & Dos' (10 000 FCFA).`;
    }

    if (q.includes("kine") || q.includes("kinésithérapie") || q.includes("reéducation") || q.includes("reeduquer")) {
        return `La kinésithérapie est une discipline clé pour restaurer les capacités motrices et soigner les douleurs musculo-squelettiques.\n\n` +
               `Au CABINET PARAMÉDICAL DABAKH, nos praticiens diplômés soignent :\n` +
               `- La rééducation post-AVC & paralysies.\n` +
               `- Les pathologies orthopédiques.\n` +
               `- Les traumatologies du sport.\n\n` +
               `Toutes nos séances durent environ 30 à 45 minutes pour assurer une réhabilitation optimale.`;
    }

    if (q.includes("avc") || q.includes("paralysie") || q.includes("hémiplégie") || q.includes("neurologie")) {
        return `La rééducation post-AVC est capitale pour restructurer la motricité fonctionnelle.\n\n` +
               `Nos kinés utilisent des protocoles fondés sur la neuroplasticité : réapprentissage de la marche, de la préhension et de l'équilibre debout en toute sécurité.\n\n` +
               `Séance conseillée : 'Rééducation Fonctionnelle (AVC & Paralysie)' (5 000 FCFA).`;
    }

    if (q.includes("sport") || q.includes("entorse") || q.includes("fracture") || q.includes("déchirure") || q.includes("genou")) {
        return `Pour les traumatismes liés au sport, une réadaptation spécifique est nécessaire pour rééduquer le geste sportif et éviter les récidives chroniques.\n\n` +
               `Nous proposons notre spécialité 'Kinésithérapie du Sport' (5 000 FCFA) animée par nos praticiens référents.`;
    }

    if (q.includes("tarif") || q.includes("prix") || q.includes("combien") || q.includes("coûte") || q.includes("coute")) {
        return `Grille tarifaire officielle du CABINET PARAMÉDICAL DABAKH :\n\n` +
               `- **Rééducation cheville et poignet** : 3 000 FCFA\n` +
               `- **Consultation Générale** : 5 000 FCFA\n` +
               `- **Rééducation AVC / Sport / Pédiatrie / Consultation Neurologique** : 5 000 FCFA\n` +
               `- **Consultation Orthopédique** : 10 000 FCFA\n` +
               `- **Massage Thérapeutique & Dos** : 10 000 FCFA\n\n` +
               `Nous acceptons Wave, Orange Money et les espèces.`;
    }

    if (q.includes("horaire") || q.includes("ouvert") || q.includes("jours") || q.includes("fermé")) {
        return `Le CABINET PARAMÉDICAL DABAKH vous accueille aux horaires suivants :\n\n` +
               `- **Lundi au Vendredi** : 08h00 - 18h30\n` +
               `- **Samedi** : 08h00 - 13h00\n` +
               `- **Dimanche** : Fermé.\n\n` +
               `N'hésitez pas à appeler notre standard : **77 209 17 25** pour des urgences.`;
    }

    return `Je suis le copilote d'aide clinique du CABINET PARAMÉDICAL DABAKH. Je peux vous orienter sur le mal de dos, les suites d'un AVC, la kinésithérapie sportive, nos tarifs et nos horaires. Quelle est votre question ?`;
}

// ── 12. ADMINISTRATOR PORTAL HANDLERS ─────────────────────────────────────
function setupAdminPortalHandlers() {
    const adminAddPatientForm = document.getElementById("admin-add-patient-form");
    if (adminAddPatientForm) {
        adminAddPatientForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name    = document.getElementById("admin-new-name").value.trim();
            const address = document.getElementById("admin-new-address").value.trim();
            const phone   = document.getElementById("admin-new-phone").value.trim();
            const region  = document.getElementById("admin-new-region").value.trim() || "Thiès";
            const password = document.getElementById("admin-new-password").value.trim();

            const phoneRes = validateSenegalPhone(phone);
            if (!phoneRes.isValid) {
                alert("Erreur : Numéro sénégalais invalide (format attendu : 77/78/76/75/70 + 7 chiffres).");
                return;
            }

            if (password.length < 6) {
                alert("Erreur : Le mot de passe doit contenir au moins 6 caractères.");
                return;
            }

            const exists = registeredPatients.some(p => p.phone === phoneRes.formatted);
            if (exists) {
                alert("Ce patient est déjà enregistré dans le fichier clinique.");
                return;
            }

            let authUserId = null;
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

            const hashedPassword = await hashPassword(password);

            const newPat = {
                id: authUserId,
                name,
                address,
                phone: phoneRes.formatted,
                password: hashedPassword,
                region,
                registeredAt: new Date().toISOString(),
                addedByAdmin: true
            };

            registeredPatients.push(newPat);
            localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
            await savePatientRemote(newPat);

            // SMS alert for admin panel
            triggerSmsAlert("NOUVEAU PATIENT AJOUTÉ",
                `Patient créé manuellement par l'administrateur.\nNom: ${name}\nTél: ${phoneRes.formatted}\nAdresse: ${address}\nRégion: ${region}.`);

            // Show success feedback on the button
            const submitBtn = adminAddPatientForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = `<i data-lucide="check-circle"></i> Dossier créé !`;
                submitBtn.style.background = 'var(--color-success)';
                submitBtn.disabled = true;
                initLucideIcons();
                setTimeout(() => {
                    submitBtn.innerHTML = `<i data-lucide="user-plus"></i> Créer le Dossier Patient`;
                    submitBtn.style.background = '';
                    submitBtn.disabled = false;
                    initLucideIcons();
                }, 2500);
            }

            adminAddPatientForm.reset();
            refreshAdminPortal();
        });
    }

    const exportBtn = document.getElementById("btn-export-patients");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            if (registeredPatients.length === 0) {
                alert("La liste des patients est vide.");
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Nom complet,Telephone,Adresse,Date Inscription,Region\n";

            registeredPatients.forEach(p => {
                const dateStr = new Date(p.registeredAt).toLocaleDateString('fr-FR');
                csvContent += `"${p.name}","${p.phone}","${p.address}","${dateStr}","${p.region || 'Thiès'}"\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `patients_cabinet_dabakh_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
}

function refreshAdminPortal() {
    const totalPatientsEl = document.getElementById("admin-total-patients");
    const weeklyPatientsEl = document.getElementById("admin-weekly-patients");
    const totalAppointmentsEl = document.getElementById("admin-total-appointments");
    const totalRevenueEl = document.getElementById("admin-total-revenue");
    const tbody = document.getElementById("admin-patients-table-body");

    // Calculs existants
    if (totalPatientsEl) totalPatientsEl.innerText = registeredPatients.length;
    if (totalAppointmentsEl) totalAppointmentsEl.innerText = appointments.filter(a => a.status === "Confirmé").length;

    // Calcul des nouveaux patients (7 derniers jours)
    if (weeklyPatientsEl) {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const newPatients = registeredPatients.filter(p => new Date(p.registeredAt) >= oneWeekAgo);
        weeklyPatientsEl.innerText = newPatients.length;
    }

    // Calcul du Chiffre d'Affaires (CA) pour les RDV 'Présent'
    if (totalRevenueEl) {
        const ca = appointments
            .filter(a => a.status === "Présent")
            .reduce((sum, a) => sum + (parseInt(a.price) || 5000), 0);
        totalRevenueEl.innerText = ca.toLocaleString('fr-FR') + " FCFA";
    }

    renderAdminStats();

    if (tbody) {
        if (registeredPatients.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Aucun patient inscrit</td></tr>`;
            return;
        }

        tbody.innerHTML = registeredPatients.map(p => {
            const dateStr = new Date(p.registeredAt).toLocaleDateString('fr-FR');
            return `
                <tr>
                    <td class="font-bold">${p.name}</td>
                    <td class="text-accent">${p.phone}</td>
                    <td>${p.address}</td>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-secondary">${p.region || 'Thiès'}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="openPrescriptionModal('${p.phone.replace(/\s+/g, '')}', '${p.name.replace(/'/g, "\\'")}')" title="Uploader une ordonnance">
                            <i data-lucide="file-plus"></i> + Ordonnance
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const tbodyApt = document.getElementById("admin-active-appointments-body");
    if (tbodyApt) {
        const activeApts = appointments.filter(a => a.status !== "Annulé");
        if (activeApts.length === 0) {
            tbodyApt.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Aucun rendez-vous actif</td></tr>`;
        } else {
            tbodyApt.innerHTML = activeApts.map(a => {
                const dateStr = new Date(a.date).toLocaleDateString('fr-FR');
                let badgeClass = "badge-warning";
                if (a.status === "Confirmé" || a.status === "Présent") badgeClass = "badge-success";
                if (a.status === "Refusé" || a.status === "Annulé" || a.status === "Absent") badgeClass = "badge-danger";

                return `
                    <tr>
                        <td class="font-bold">${a.patientName || 'Inconnu'} <br> <span class="text-xs text-muted">${a.patientPhone || ''}</span></td>
                        <td>${a.serviceName}</td>
                        <td>${dateStr}</td>
                        <td class="text-accent font-bold">${a.time}</td>
                        <td><span class="badge ${badgeClass}">${a.status}</span></td>
                        <td>
                            <div class="flex gap-05">
                                ${a.status === "En attente de validation" ? `
                                <button class="btn btn-success btn-sm" onclick="adminConfirmAppointment('${a.id}')" title="Confirmer">
                                    <i data-lucide="check"></i>
                                </button>
                                ` : ''}
                                ${a.status === "Confirmé" ? `
                                    ${(function(){
                                        let isPast = false;
                                        if (a.date) {
                                            const aptDate = new Date(a.date);
                                            if (a.time) {
                                                const [hh, mm] = a.time.split(':');
                                                if (hh && mm) aptDate.setHours(parseInt(hh, 10), parseInt(mm, 10));
                                            }
                                            if (aptDate < new Date()) isPast = true;
                                        }
                                        const phoneWa = (a.patientPhone || '').replace(/\s+/g, '').replace('+', '');
                                        const waText = encodeURIComponent("Bonjour " + (a.patientName||"") + ", le Cabinet DABAKH vous rappelle votre séance de rééducation prévue le " + new Date(a.date).toLocaleDateString('fr-FR') + " à " + a.time + ". En cas d'empêchement, merci de nous prévenir.");
                                        const waUrl = "https://wa.me/" + phoneWa + "?text=" + waText;
                                        
                                        if (isPast) {
                                            return `
                                                <button class="btn btn-success btn-sm" onclick="adminMarkPresent('${a.id}')" title="Présent">
                                                    <i data-lucide="user-check"></i>
                                                </button>
                                                <button class="btn btn-warning btn-sm" onclick="adminMarkAbsent('${a.id}')" title="Absent">
                                                    <i data-lucide="user-x"></i>
                                                </button>
                                            `;
                                        } else {
                                            return `
                                                <a href="${waUrl}" target="_blank" class="btn btn-whatsapp btn-sm" title="Rappel WhatsApp">
                                                    <i data-lucide="message-circle"></i> Rappel
                                                </a>
                                                <button class="btn btn-secondary btn-sm" onclick="adminEditAppointmentPrompt('${a.id}')" title="Reprogrammer / Modifier">
                                                    <i data-lucide="edit"></i>
                                                </button>
                                                <button class="btn btn-danger btn-sm" onclick="adminCancelAppointment('${a.id}')" title="Annuler">
                                                    <i data-lucide="x"></i>
                                                </button>
                                            `;
                                        }
                                    })()}
                                ` : ''}
                                ${a.status !== "Confirmé" && a.status !== "Refusé" && a.status !== "Annulé" && a.status !== "Présent" && a.status !== "Absent" ? `
                                <button class="btn btn-danger btn-sm" onclick="adminRefuseAppointment('${a.id}')" title="Refuser">
                                    <i data-lucide="x"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="adminEditAppointmentPrompt('${a.id}')" title="Reprogrammer / Modifier">
                                    <i data-lucide="edit"></i>
                                </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    const tbodyDiag = document.getElementById("admin-received-documents-body");
    if (tbodyDiag) {
        if (diagnostics.length === 0) {
            tbodyDiag.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Aucun document reçu</td></tr>`;
        } else {
            tbodyDiag.innerHTML = diagnostics.map(d => {
                const dateStr = new Date(d.createdAt).toLocaleDateString('fr-FR');
                return `
                    <tr>
                        <td class="font-bold">${d.patientName || 'Inconnu'} <br> <span class="text-xs text-muted">${d.patientPhone || ''}</span></td>
                        <td>${d.symptoms.substring(0, 50)}...</td>
                        <td>${dateStr}</td>
                        <td>
                            <button class="btn btn-secondary btn-sm" onclick="previewAttachedFile('${d.id}')">
                                <i data-lucide="eye"></i> Voir Document
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

function adminCancelAppointment(aptId) {
    if (confirm("Êtes-vous sûr de vouloir annuler ce rendez-vous ? Le patient sera impacté.")) {
        const aptIndex = appointments.findIndex(a => a.id === aptId);
        if (aptIndex !== -1) {
            appointments[aptIndex].status = "Annulé";
            localStorage.setItem('daba_appointments', JSON.stringify(appointments));
            saveAppointmentRemote(appointments[aptIndex]);
            
            triggerSmsAlert(
                "RENDEZ-VOUS ANNULÉ", 
                `Bonjour, votre rendez-vous pour ${appointments[aptIndex].serviceName} a été ANNULÉ par le cabinet Dabakh.`,
                appointments[aptIndex].patientPhone
            );

            alert("Rendez-vous annulé.");
            refreshAdminPortal();
            if (currentUser && currentUser.phone === appointments[aptIndex].patientPhone) {
                renderAppointmentsHistory();
                renderOverviewTicket();
            }
        }
    }
}

function adminEditAppointmentPrompt(aptId) {
    const apt = appointments.find(a => a.id === aptId);
    if (!apt) return;
    
    const newDate = prompt("Nouvelle date (Format: YYYY-MM-DD):", apt.date);
    if (newDate) {
        const newTime = prompt("Nouvelle heure (ex: 10h00):", apt.time);
        if (newTime) {
            apt.date = newDate;
            apt.time = newTime;
            localStorage.setItem('daba_appointments', JSON.stringify(appointments));
            saveAppointmentRemote(apt);
            
            triggerSmsAlert(
                "RENDEZ-VOUS MODIFIÉ", 
                `Bonjour, votre rendez-vous pour ${apt.serviceName} a été déplacé au ${new Date(newDate).toLocaleDateString('fr-FR')} à ${newTime} par le cabinet Dabakh.`,
                apt.patientPhone
            );

            alert("Rendez-vous modifié avec succès.");
            refreshAdminPortal();
            if (currentUser && currentUser.phone === apt.patientPhone) {
                renderAppointmentsHistory();
                renderOverviewTicket();
            }
        }
    }
}

// ── ADMIN INTERACTIVE APPOINTMENT MANAGEMENT ─────────────────────────────
async function adminConfirmAppointment(aptId) {
    const aptIndex = appointments.findIndex(a => a.id === aptId);
    if (aptIndex !== -1) {
        appointments[aptIndex].status = "Confirmé";
        localStorage.setItem('daba_appointments', JSON.stringify(appointments));
        await saveAppointmentRemote(appointments[aptIndex]);
        
        triggerSmsAlert(
            "CONFIRMATION RDV", 
            `Votre rendez-vous pour ${appointments[aptIndex].serviceName} le ${new Date(appointments[aptIndex].date).toLocaleDateString('fr-FR')} à ${appointments[aptIndex].time} est CONFIRMÉ par le cabinet Dabakh.`,
            appointments[aptIndex].patientPhone
        );
        
        alert("Rendez-vous confirmé avec succès !");
        refreshAdminPortal();
    }
}

async function adminMarkPresent(aptId) {
    const aptIndex = appointments.findIndex(a => a.id === aptId);
    if (aptIndex !== -1) {
        if (confirm("Confirmez-vous la présence de ce patient ?")) {
            appointments[aptIndex].status = "Présent";
            localStorage.setItem('daba_appointments', JSON.stringify(appointments));
            if (typeof saveAppointmentRemote === "function") await saveAppointmentRemote(appointments[aptIndex]);
            alert("Présence confirmée avec succès !");
            refreshAdminPortal();
        }
    }
}

async function adminMarkAbsent(aptId) {
    const aptIndex = appointments.findIndex(a => a.id === aptId);
    if (aptIndex !== -1) {
        if (confirm("Confirmez-vous l'absence de ce patient ?")) {
            appointments[aptIndex].status = "Absent";
            localStorage.setItem('daba_appointments', JSON.stringify(appointments));
            if (typeof saveAppointmentRemote === "function") await saveAppointmentRemote(appointments[aptIndex]);
            alert("Absence confirmée avec succès !");
            refreshAdminPortal();
        }
    }
}

async function adminRefuseAppointment(aptId) {
    if (confirm("Êtes-vous sûr de vouloir refuser ce rendez-vous ?")) {
        const aptIndex = appointments.findIndex(a => a.id === aptId);
        if (aptIndex !== -1) {
            appointments[aptIndex].status = "Refusé";
            localStorage.setItem('daba_appointments', JSON.stringify(appointments));
            await saveAppointmentRemote(appointments[aptIndex]);
            
            triggerSmsAlert(
                "REFUS RDV", 
                `Désolé, votre demande de rendez-vous pour ${appointments[aptIndex].serviceName} a été refusée par le cabinet Dabakh.`,
                appointments[aptIndex].patientPhone
            );
            
            alert("Rendez-vous refusé.");
            refreshAdminPortal();
        }
    }
}

// ── ADMIN PRESCRIPTION UPLOAD & DELIVERY ──────────────────────────────────
function openPrescriptionModal(patientPhone, patientName) {
    const modalId = "prescription-upload-modal";
    if (document.getElementById(modalId)) return;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = modalId;

    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>📄 Uploader une Ordonnance</h3>
                <button class="modal-close-btn" onclick="closePrescriptionModal()"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body">
                <p class="text-sm text-muted mb-1">Patient destinataire : <strong>${patientName}</strong> (${patientPhone})</p>
                <form id="admin-prescription-form">
                    <div class="form-group">
                        <label for="presc-instructions">Instructions médicales / Posologie</label>
                        <textarea id="presc-instructions" class="w-full" rows="3" placeholder="Ex: Exercices quotidiens de renforcement et de proprioception..." required></textarea>
                    </div>
                    <div class="form-group">
                        <label for="presc-file">Fichier de l'ordonnance (Image ou PDF)</label>
                        <input type="file" id="presc-file" class="w-full" accept="image/*,application/pdf" required>
                    </div>
                    <div class="modal-footer flex justify-end gap-1 mt-1">
                        <button type="button" class="btn btn-secondary" onclick="closePrescriptionModal()">Annuler</button>
                        <button type="submit" class="btn btn-primary" id="btn-submit-presc">Transmettre au Patient</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    initLucideIcons();

    const form = document.getElementById("admin-prescription-form");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const instructions = document.getElementById("presc-instructions").value.trim();
        const fileInput = document.getElementById("presc-file");
        const file = fileInput.files[0];
        
        if (!file) {
            alert("Veuillez sélectionner un fichier.");
            return;
        }

        const btnSubmit = document.getElementById("btn-submit-presc");
        btnSubmit.disabled = true;
        btnSubmit.innerText = "Téléchargement cloud...";

        const fileUrl = await uploadFileToSupabase(file, patientPhone);
        if (!fileUrl) {
            alert("Erreur lors de l'envoi du fichier dans Supabase Storage.");
            btnSubmit.disabled = false;
            btnSubmit.innerText = "Transmettre au Patient";
            return;
        }

        const newDiag = {
            id: `DIAG-${Date.now()}`,
            serviceId: "ordonnance",
            serviceName: "Ordonnance Médicale",
            symptoms: instructions,
            fileName: file.name,
            fileUrl: fileUrl,
            fileType: file.type,
            status: "Délivrée",
            createdAt: new Date().toISOString(),
            patientName: patientName,
            patientPhone: patientPhone
        };

        diagnostics.push(newDiag);
        localStorage.setItem('daba_diagnostics', JSON.stringify(diagnostics));
        await saveDiagnosticRemote(newDiag);

        triggerSmsAlert("NOUVELLE ORDONNANCE", `Bonjour ${patientName}, une nouvelle ordonnance a été déposée dans votre espace patient par le Dr. MACODOU NDIAYE.`);

        alert("Ordonnance téléversée et transmise avec succès au patient !");
        closePrescriptionModal();
        refreshAdminPortal();
    });
}

function closePrescriptionModal() {
    const modal = document.getElementById("prescription-upload-modal");
    if (modal) modal.remove();
}

function renderAdminStats() {
    const svg = document.getElementById("admin-stats-svg");
    if (!svg) return;

    // Couleurs directes (les var() CSS ne fonctionnent pas dans les SVG inline)
    const COL_PRIMARY = '#0ea5e9';
    const COL_ACCENT  = '#06b6d4';
    const COL_DARK    = '#050810';

    // Calculer le nombre de patients inscrits sur les 7 derniers jours
    const last7Days = [];
    const counts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        last7Days.push(dateStr);
        
        const count = registeredPatients.filter(p => {
            if (!p.registeredAt) return false;
            return p.registeredAt.startsWith(dateStr);
        }).length;
        counts.push(count);
    }

    const width = 800;
    const height = 300;
    const padding = 50;
    const maxVal = Math.max(...counts, 5);
    
    const points = counts.map((c, i) => {
        const x = padding + (i * ((width - 2 * padding) / 6));
        const y = height - padding - ((c / maxVal) * (height - 2 * padding));
        return {x, y, count: c, label: last7Days[i]};
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    points.forEach((p, i) => {
        if (i > 0) pathD += ` L ${p.x} ${p.y}`;
    });

    let svgHTML = `
        <defs>
            <linearGradient id="gradientLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="${COL_PRIMARY}" />
                <stop offset="100%" stop-color="${COL_ACCENT}" />
            </linearGradient>
            <linearGradient id="gradientFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${COL_PRIMARY}" stop-opacity="0.4"/>
                <stop offset="100%" stop-color="${COL_PRIMARY}" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
        <text x="${padding - 10}" y="${padding + 5}" fill="rgba(255,255,255,0.5)" font-size="12" text-anchor="end">${maxVal}</text>
        <text x="${padding - 10}" y="${height - padding + 5}" fill="rgba(255,255,255,0.5)" font-size="12" text-anchor="end">0</text>
    `;

    let fillD = pathD + ` L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
    svgHTML += `<path d="${fillD}" fill="url(#gradientFill)" />`;
    
    svgHTML += `<path d="${pathD}" fill="none" stroke="url(#gradientLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="chart-line-anim"/>`;

    points.forEach(p => {
        const shortDate = p.label.split('-').slice(1).join('/');
        svgHTML += `
            <circle cx="${p.x}" cy="${p.y}" r="6" fill="${COL_DARK}" stroke="${COL_ACCENT}" stroke-width="3" class="chart-point-anim"/>
            <text x="${p.x}" y="${height - padding + 20}" fill="rgba(255,255,255,0.6)" font-size="11" text-anchor="middle">${shortDate}</text>
            <text x="${p.x}" y="${p.y - 12}" fill="#fff" font-size="12" font-weight="bold" text-anchor="middle" class="chart-point-anim">${p.count}</text>
        `;
    });

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = svgHTML;

    // 1. Calcul et rendu du volume de rendez-vous par spécialité
    const specCounts = {};
    SERVICES_DATA.forEach(s => {
        specCounts[s.name] = 0;
    });

    appointments.forEach(a => {
        if (a.serviceName) {
            specCounts[a.serviceName] = (specCounts[a.serviceName] || 0) + 1;
        }
    });

    const totalApts = appointments.length;
    const specContainer = document.getElementById("stats-specialities-container");
    if (specContainer) {
        if (totalApts === 0) {
            specContainer.innerHTML = `<div class="text-center text-muted p-3">Aucun rendez-vous enregistré</div>`;
        } else {
            // Trier par volume décroissant
            const sortedSpecs = Object.entries(specCounts).sort((a, b) => b[1] - a[1]);
            specContainer.innerHTML = sortedSpecs.map(([name, count]) => {
                const pct = totalApts > 0 ? Math.round((count / totalApts) * 100) : 0;
                return `
                    <div style="margin-bottom: 12px;">
                        <div class="flex justify-between text-xs mb-05 font-medium">
                            <span class="text-white">${name}</span>
                            <span class="text-accent" style="font-weight: 600;">${count} RDV (${pct}%)</span>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); border-radius: 4px; height: 8px; width: 100%; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, #0ea5e9, #06b6d4); width: ${pct}%; height: 100%; border-radius: 4px; transition: width 0.8s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Calcul et rendu de la répartition géographique des patients par région
    const regionCounts = {};
    registeredPatients.forEach(p => {
        const reg = p.region || "Thiès";
        regionCounts[reg] = (regionCounts[reg] || 0) + 1;
    });

    const totalPatients = registeredPatients.length;
    const regionContainer = document.getElementById("stats-regions-container");
    if (regionContainer) {
        if (totalPatients === 0) {
            regionContainer.innerHTML = `<div class="text-center text-muted p-3">Aucun patient inscrit</div>`;
        } else {
            // Trier par volume décroissant
            const sortedRegions = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
            regionContainer.innerHTML = sortedRegions.map(([region, count]) => {
                const pct = totalPatients > 0 ? Math.round((count / totalPatients) * 100) : 0;
                return `
                    <div style="margin-bottom: 12px;">
                        <div class="flex justify-between text-xs mb-05 font-medium">
                            <span class="text-white">📍 ${region}</span>
                            <span class="text-success" style="font-weight: 600;">${count} patient${count > 1 ? 's' : ''} (${pct}%)</span>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); border-radius: 4px; height: 8px; width: 100%; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, #10b981, #34d399); width: ${pct}%; height: 100%; border-radius: 4px; transition: width 0.8s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Mise à jour des compteurs de statistiques globaux
    const elTotalPat = document.getElementById('stats-total-patients');
    const elTotalRdv = document.getElementById('stats-total-rdv');
    const elTotalDocs = document.getElementById('stats-total-docs');
    if (elTotalPat) elTotalPat.innerText = registeredPatients.length;
    if (elTotalRdv) elTotalRdv.innerText = appointments.filter(a => a.status === 'Confirmé').length;
    if (elTotalDocs) elTotalDocs.innerText = diagnostics.length;

    initLucideIcons();
}

// ==========================================================================
//  ADMIN — PROFILS UTILISATEURS TABLE
// ==========================================================================

/** Renders the full profiles table. Call whenever tab becomes active. */
function renderProfilesTable(filterData) {
    const tbody = document.getElementById('profiles-table-body');
    const emptyState = document.getElementById('profiles-empty-state');
    const countBadge = document.getElementById('profiles-table-count-badge');
    if (!tbody) return;

    registeredPatients = JSON.parse(localStorage.getItem('daba_patients')) || registeredPatients;

    const data = filterData !== undefined ? filterData : registeredPatients;
    const now = new Date();

    // Stat pills
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('prof-count-total', registeredPatients.length);
    setEl('prof-count-dakar', registeredPatients.filter(p => (p.region || '').toLowerCase() === 'dakar').length);
    setEl('prof-count-month', registeredPatients.filter(p => {
        if (!p.registeredAt) return false;
        const d = new Date(p.registeredAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length);
    setEl('prof-count-active', registeredPatients.length);
    if (countBadge) countBadge.textContent = data.length + ' profil' + (data.length !== 1 ? 's' : '');

    if (data.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = data.map((p, idx) => {
        const parts = (p.name || 'P A').split(' ');
        const initials = ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
        let dateStr = '—';
        try { if (p.registeredAt) dateStr = new Date(p.registeredAt).toLocaleDateString('fr-SN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch(e) {}
        const pid = '#PT-' + (p.phone || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
        const rawPhone = (p.phone || '').replace(/\s/g, '');
        const waLink = 'https://wa.me/' + rawPhone.replace('+', '');
        const address = (p.address || '—').length > 28 ? (p.address || '—').slice(0, 26) + '…' : (p.address || '—');
        const originalIdx = registeredPatients.findIndex(op => op.phone === p.phone);

        return `<tr>
            <td class="row-num">${idx + 1}</td>
            <td>
                <div class="profile-cell">
                    <div class="profile-avatar">${initials.toUpperCase()}</div>
                    <div>
                        <div class="profile-name">${p.name || '—'}</div>
                        <div class="profile-id">${pid}</div>
                    </div>
                </div>
            </td>
            <td><a href="${waLink}" target="_blank" rel="noopener" class="profile-phone-link">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                ${p.phone || '—'}</a></td>
            <td>${address}</td>
            <td><span class="region-badge">📍 ${p.region || 'Thiès'}</span></td>
            <td><span class="profile-date">${dateStr}</span></td>
            <td><span class="status-badge-active">Actif</span></td>
            <td>
                <div class="profile-actions">
                    <button class="profile-action-btn" title="Copier le numéro" onclick="copyProfilePhone('${p.phone || ''}')">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button class="profile-action-btn danger" title="Supprimer le profil" onclick="deleteProfile(${originalIdx})">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/** Filter the table by search text + region. */
function filterProfilesTable() {
    registeredPatients = JSON.parse(localStorage.getItem('daba_patients')) || registeredPatients;
    const query = (document.getElementById('profiles-search-input')?.value || '').toLowerCase().trim();
    const region = (document.getElementById('profiles-region-filter')?.value || '').toLowerCase().trim();
    const filtered = registeredPatients.filter(p => {
        const matchSearch = !query || (p.name || '').toLowerCase().includes(query) || (p.phone || '').toLowerCase().includes(query) || (p.address || '').toLowerCase().includes(query);
        const matchRegion = !region || (p.region || '').toLowerCase() === region;
        return matchSearch && matchRegion;
    });
    renderProfilesTable(filtered);
}

/** Delete a profile by its index in registeredPatients. */
function deleteProfile(idx) {
    if (idx < 0 || idx >= registeredPatients.length) return;
    const patient = registeredPatients[idx];
    if (!confirm(`Supprimer définitivement le profil de "${patient.name}" ?\nCette action est irréversible.`)) return;
    registeredPatients.splice(idx, 1);
    localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
    if (supabaseClient) supabaseClient.from('profiles').delete().eq('phone', patient.phone).then();
    showNotificationBanner('Profil de ' + patient.name + ' supprimé.');
    filterProfilesTable();
}

/** Copy phone number to clipboard. */
function copyProfilePhone(phone) {
    if (!phone) return;
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = phone;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showNotificationBanner('📋 ' + phone + ' copié !');
    };
    if (navigator.clipboard) {
        navigator.clipboard.writeText(phone).then(() => showNotificationBanner('📋 ' + phone + ' copié !')).catch(fallback);
    } else { fallback(); }
}

/** Export visible profiles as CSV file. */
function exportProfilesCSV() {
    registeredPatients = JSON.parse(localStorage.getItem('daba_patients')) || registeredPatients;
    const query = (document.getElementById('profiles-search-input')?.value || '').toLowerCase().trim();
    const region = (document.getElementById('profiles-region-filter')?.value || '').toLowerCase().trim();
    const data = registeredPatients.filter(p => {
        const matchSearch = !query || (p.name || '').toLowerCase().includes(query) || (p.phone || '').toLowerCase().includes(query);
        const matchRegion = !region || (p.region || '').toLowerCase() === region;
        return matchSearch && matchRegion;
    });
    const header = ['Nom', 'Téléphone', 'Adresse', 'Région', "Date d'Inscription"];
    const rows = data.map(p => {
        const date = p.registeredAt ? new Date(p.registeredAt).toLocaleDateString('fr-SN') : '';
        return [p.name, p.phone, p.address, p.region, date].map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(',');
    });
    const csv = '\ufeff' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profils-patients-dabakh-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotificationBanner('📥 Export CSV de ' + data.length + ' profil(s) lancé !');
}

// ── EXTENDED PATIENT FILE: ADMIN NOTES ──────────────────────────────────
function openAdminNotes(phoneFormatted) {
    const p = registeredPatients.find(x => x.phone.replace(/\s+/g, '') === phoneFormatted);
    if (!p) return;
    
    document.getElementById("admin-notes-patient-name").value = p.name;
    document.getElementById("admin-notes-patient-phone").value = p.phone;
    document.getElementById("admin-notes-content").value = p.adminNotes || p.admin_notes || "";
    
    document.getElementById("modal-admin-notes").classList.remove("hidden");
}

function closeAdminNotesModal() {
    document.getElementById("modal-admin-notes").classList.add("hidden");
}

async function saveAdminNotes() {
    const phone = document.getElementById("admin-notes-patient-phone").value;
    const notes = document.getElementById("admin-notes-content").value;
    
    const pIndex = registeredPatients.findIndex(x => x.phone === phone);
    if (pIndex !== -1) {
        registeredPatients[pIndex].adminNotes = notes;
        registeredPatients[pIndex].admin_notes = notes; // for supabase
        localStorage.setItem('daba_patients', JSON.stringify(registeredPatients));
        
        // Save to Supabase if available
        if (supabaseClient) {
            const btn = document.querySelector("#modal-admin-notes .btn-primary");
            btn.innerHTML = "Sauvegarde...";
            btn.disabled = true;
            try {
                const { error } = await supabaseClient.from('profiles').update({ admin_notes: notes }).eq('phone', phone);
                if (error) console.error("Erreur sauvegarde notes:", error);
            } catch (e) {
                console.error("Erreur notes", e);
            }
            btn.innerHTML = '<i data-lucide="save"></i> Enregistrer';
            btn.disabled = false;
        }
        
        alert("Fiche clinique mise à jour.");
        closeAdminNotesModal();
    }
}


// ==========================================
// TOAST NOTIFICATIONS (SMS REMINDER)
// ==========================================
function showToastNotification(title, message, isSoundEnabled = true) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="bell"></i>
        </div>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>
    `;

    container.appendChild(toast);
    
    // Play sound
    if (isSoundEnabled) {
        const sound = document.getElementById('notification-sound');
        if (sound) {
            sound.play().catch(e => console.log('Audio play blocked by browser', e));
        }
    }

    // Re-initialize lucide icons for the new toast
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);

    // Remove after 10 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 10000);
}

function checkUpcomingAppointments() {
    if (isAdminMode || !currentUser) return;
    
    // Check local storage flag so we only show the reminder once per session
    if (sessionStorage.getItem('daba_reminder_shown')) return;

    const myAppointments = allAppointments.filter(a => a.patientId === currentUser.id && a.status !== 'Annulé' && a.status !== 'Terminé');
    
    if (myAppointments.length > 0) {
        // Sort by date to find the nearest
        myAppointments.sort((a, b) => new Date(a.date) - new Date(b.date));
        const nearest = myAppointments[0];
        
        const aptDate = new Date(nearest.date);
        const today = new Date();
        const diffTime = aptDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // If appointment is within 24 hours (1 day) or today
        if (diffDays <= 1 && diffDays >= 0) {
            setTimeout(() => {
                showToastNotification(
                    "Rappel de Rendez-vous 🩺",
                    `Vous avez une séance prévue le ${nearest.date} à ${nearest.time}.`
                );
                sessionStorage.setItem('daba_reminder_shown', 'true');
            }, 2000); // Wait 2 seconds after login/load
        }
    }
}


// ==========================================
// DOCUMENTS & PDF GENERATION
// ==========================================
function renderDocumentsTab() {
    if (!currentUser) return;

    const invoicesList = document.getElementById('patient-invoices-list');
    const prescriptionsList = document.getElementById('patient-prescriptions-list');

    // Get completed appointments (Factures)
    const completedApts = allAppointments.filter(a => a.patientId === currentUser.id && a.status === 'Terminé');
    
    if (completedApts.length === 0) {
        invoicesList.innerHTML = '<p class="text-muted text-sm text-center">Aucune facture disponible.</p>';
    } else {
        invoicesList.innerHTML = completedApts.map(apt => `
            <div class="flex justify-between align-center border-b pb-1 mb-1" style="border-bottom: 1px solid var(--color-border);">
                <div>
                    <h4 class="font-bold text-sm">${apt.service || 'Consultation'}</h4>
                    <p class="text-xs text-muted">${apt.date} à ${apt.time}</p>
                </div>
                <button class="btn btn-sm btn-primary" onclick="generateInvoicePDF('${apt.id}')">
                    <i data-lucide="download"></i> PDF
                </button>
            </div>
        `).join('');
    }

    // Diagnostics/Prescriptions
    const myDiagnostics = allDiagnostics.filter(d => d.patientId === currentUser.id);
    if (myDiagnostics.length === 0) {
        prescriptionsList.innerHTML = '<p class="text-muted text-sm text-center">Aucune ordonnance/diagnostic disponible.</p>';
    } else {
        prescriptionsList.innerHTML = myDiagnostics.map(diag => {
            const fileUrl = (supabaseClient && diag.file_path) 
                ? supabaseClient.storage.from('medical-files').getPublicUrl(diag.file_path).data.publicUrl
                : '#';
            
            return `
            <div class="flex justify-between align-center border-b pb-1 mb-1" style="border-bottom: 1px solid var(--color-border);">
                <div>
                    <h4 class="font-bold text-sm">${diag.description || 'Document Médical'}</h4>
                    <p class="text-xs text-muted">${new Date(diag.uploadedAt || diag.created_at).toLocaleDateString()}</p>
                </div>
                <a href="${fileUrl}" target="_blank" class="btn btn-sm btn-secondary">
                    <i data-lucide="external-link"></i> Voir
                </a>
            </div>
        `}).join('');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function generateInvoicePDF(appointmentId) {
    const apt = allAppointments.find(a => a.id == appointmentId);
    if (!apt) return;

    // Populate hidden template
    document.getElementById('pdf-invoice-date').innerText = `Date: ${apt.date}`;
    document.getElementById('pdf-invoice-id').innerText = `N°: FAC-${apt.id.toString().substring(0,6).toUpperCase()}`;
    document.getElementById('pdf-patient-name').innerText = currentUser.name;
    document.getElementById('pdf-patient-phone').innerText = currentUser.phone;
    document.getElementById('pdf-service-name').innerText = apt.service || 'Consultation';
    
    // Find service price if possible
    let price = '15 000'; // Default
    if (apt.service) {
        const servObj = SERVICES_DATA.find(s => s.name === apt.service);
        if (servObj) price = servObj.price.replace(' FCFA', '');
    }
    
    document.getElementById('pdf-service-price').innerText = `${price} FCFA`;
    document.getElementById('pdf-total-price').innerText = `${price} FCFA`;

    // Generate PDF using html2pdf
    const element = document.getElementById('invoice-pdf-template');
    element.style.display = 'block'; // Ensure it's visible for capture

    const opt = {
        margin:       10,
        filename:     `Facture_${currentUser.name.replace(/\s+/g, '_')}_${apt.date}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        element.style.display = 'none'; // Hide again
    });
}
