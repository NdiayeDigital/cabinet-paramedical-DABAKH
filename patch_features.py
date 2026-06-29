import codecs
import re

content_html = codecs.open('index.html', 'r', 'utf-8').read()

# Add Admin Notes Modal
admin_notes_modal = """
    <!-- Admin Notes Modal -->
    <div id="modal-admin-notes" class="modal-overlay hidden">
        <div class="modal-container">
            <div class="modal-header">
                <h3><i data-lucide="file-text" class="inline-icon text-accent"></i> Fiche Clinique (Privé)</h3>
                <button class="modal-close-btn" onclick="closeAdminNotesModal()"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body">
                <p class="text-sm text-muted mb-1">Notes de consultation, évolution de la rééducation, anamnèse. Ces informations sont <strong class="text-warning">invisibles pour le patient</strong>.</p>
                <div class="form-group">
                    <label>Patient</label>
                    <input type="text" id="admin-notes-patient-name" class="w-full" disabled style="background: rgba(255,255,255,0.05);">
                    <input type="hidden" id="admin-notes-patient-phone">
                </div>
                <div class="form-group">
                    <label>Observations cliniques</label>
                    <textarea id="admin-notes-content" class="w-full" rows="8" placeholder="Écrivez vos notes ici..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeAdminNotesModal()">Fermer</button>
                <button class="btn btn-primary" onclick="saveAdminNotes()"><i data-lucide="save"></i> Enregistrer</button>
            </div>
        </div>
    </div>
"""

if 'modal-admin-notes' not in content_html:
    # insert before </body>
    content_html = content_html.replace('</body>', admin_notes_modal + '\n</body>')

with codecs.open('index.html', 'w', 'utf-8') as f:
    f.write(content_html)

# Patch script.js
content_js = codecs.open('script.js', 'r', 'utf-8').read()

# 1. Calendar restricted to no-Sundays
calendar_logic = """    dateInput.addEventListener("change", () => renderTimeSlots());"""
new_calendar_logic = """    dateInput.addEventListener("change", (e) => {
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
    }"""
content_js = content_js.replace(calendar_logic, new_calendar_logic)

# 2. WhatsApp reminders and status checks in renderAdminAppointments()
match_tbody = re.search(r'tbodyApt\.innerHTML = activeApts\.map\(a => \{.*?return `', content_js, re.DOTALL)
if match_tbody:
    # Find the block inside the map
    pass 
else:
    print("Could not find tbodyApt map")

# Actually, I'll use regex to replace the appointment status rendering
old_status_render = """                                ${a.status === "Confirmé" ? `
                                <button class="btn btn-success btn-sm" onclick="adminMarkPresent('${a.id}')" title="Présent">
                                    <i data-lucide="user-check"></i>
                                </button>
                                <button class="btn btn-warning btn-sm" onclick="adminMarkAbsent('${a.id}')" title="Absent">
                                    <i data-lucide="user-x"></i>
                                </button>
                                ` : ''}
                                ${a.status !== "Refusé" && a.status !== "Annulé" && a.status !== "Présent" && a.status !== "Absent" ? `
                                <button class="btn btn-danger btn-sm" onclick="adminRefuseAppointment('${a.id}')" title="Refuser">
                                    <i data-lucide="x"></i>
                                </button>
                                ` : ''}
                                <button class="btn btn-secondary btn-sm" onclick="adminEditAppointmentPrompt('${a.id}')" title="Reprogrammer / Modifier">
                                    <i data-lucide="edit"></i>
                                </button>"""

new_status_render = """                                ${a.status === "Confirmé" ? `
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
                                ` : ''}"""

content_js = content_js.replace(old_status_render, new_status_render)

# 3. Add Notes button to Patient List
old_patient_row = """                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="openPrescriptionModal('${p.phone.replace(/\s+/g, '')}', '${p.name.replace(/'/g, "\\'")}')" title="Uploader une ordonnance">
                            <i data-lucide="file-plus"></i> + Ordonnance
                        </button>
                    </td>"""

new_patient_row = """                    <td>
                        <div class="flex gap-05">
                            <button class="btn btn-secondary btn-sm" onclick="openPrescriptionModal('${p.phone.replace(/\s+/g, '')}', '${p.name.replace(/'/g, "\\'")}')" title="Uploader une ordonnance">
                                <i data-lucide="file-plus"></i> Ordonnance
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="openAdminNotes('${p.phone.replace(/\s+/g, '')}')" title="Fiche Clinique">
                                <i data-lucide="file-text"></i> Fiche
                            </button>
                        </div>
                    </td>"""

content_js = content_js.replace(old_patient_row, new_patient_row)

# 4. Add the Admin Notes functions
admin_notes_funcs = """
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
"""

if 'function openAdminNotes' not in content_js:
    content_js += admin_notes_funcs

with codecs.open('script.js', 'w', 'utf-8') as f:
    f.write(content_js)
