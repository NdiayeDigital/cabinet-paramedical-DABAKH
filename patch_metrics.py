import codecs
import re

content = codecs.open('index.html', 'r', 'utf-8').read()

old_grid = """                        <div class="grid grid-3 gap-15">
                            <div class="metric-card bg-glass">
                                <div class="flex justify-between align-center">
                                    <span class="metric-label">Total Patients Inscrits</span>
                                    <i data-lucide="users" class="text-accent"></i>
                                </div>
                                <h3 class="metric-value text-accent" id="admin-total-patients">0</h3>
                                <span class="metric-desc">Enregistrés dans la base Cabinet</span>
                            </div>
                            <div class="metric-card bg-glass">
                                <div class="flex justify-between align-center">
                                    <span class="metric-label">Rendez-vous Actifs</span>
                                    <i data-lucide="calendar" class="text-success"></i>
                                </div>
                                <h3 class="metric-value text-success" id="admin-total-appointments">0</h3>
                                <span class="metric-desc">Séances planifiées</span>
                            </div>
                            <div class="metric-card bg-glass flex align-center justify-center">
                                <button class="btn btn-primary w-full" id="btn-export-patients">
                                    <i data-lucide="download"></i> Exporter la Liste (CSV)
                                </button>
                            </div>
                        </div>"""

new_grid = """                        <div class="grid grid-4 gap-15 mb-15">
                            <div class="metric-card bg-glass">
                                <div class="flex justify-between align-center">
                                    <span class="metric-label">Patients Inscrits</span>
                                    <i data-lucide="users" class="text-accent"></i>
                                </div>
                                <h3 class="metric-value text-accent" id="admin-total-patients">0</h3>
                                <span class="metric-desc">Total en base</span>
                            </div>
                            <div class="metric-card bg-glass">
                                <div class="flex justify-between align-center">
                                    <span class="metric-label">Nouveaux (7j)</span>
                                    <i data-lucide="user-plus" class="text-primary"></i>
                                </div>
                                <h3 class="metric-value text-primary" id="admin-weekly-patients">0</h3>
                                <span class="metric-desc">Inscrits cette semaine</span>
                            </div>
                            <div class="metric-card bg-glass">
                                <div class="flex justify-between align-center">
                                    <span class="metric-label">RDV Actifs</span>
                                    <i data-lucide="calendar" class="text-success"></i>
                                </div>
                                <h3 class="metric-value text-success" id="admin-total-appointments">0</h3>
                                <span class="metric-desc">Séances à venir</span>
                            </div>
                            <div class="metric-card bg-glass">
                                <div class="flex justify-between align-center">
                                    <span class="metric-label">CA Présents</span>
                                    <i data-lucide="banknote" class="text-warning"></i>
                                </div>
                                <h3 class="metric-value text-warning" id="admin-total-revenue">0</h3>
                                <span class="metric-desc">Généré en FCFA</span>
                            </div>
                        </div>
                        <div class="flex justify-end mb-2">
                            <button class="btn btn-primary" id="btn-export-patients">
                                <i data-lucide="download"></i> Exporter la Liste (CSV)
                            </button>
                        </div>"""

if old_grid in content:
    content = content.replace(old_grid, new_grid)
    print("Replaced grid successfully in index.html")
else:
    print('Failed to match old_grid')

with codecs.open('index.html', 'w', 'utf-8') as f:
    f.write(content)

# Update script.js for refreshAdminPortal
script = codecs.open('script.js', 'r', 'utf-8').read()

old_script = """function refreshAdminPortal() {
    const totalPatientsEl = document.getElementById("admin-total-patients");
    const totalAppointmentsEl = document.getElementById("admin-total-appointments");
    const tbody = document.getElementById("admin-patients-table-body");

    if (totalPatientsEl) totalPatientsEl.innerText = registeredPatients.length;
    if (totalAppointmentsEl) totalAppointmentsEl.innerText = appointments.filter(a => a.status === "Confirmé").length;"""

new_script = """function refreshAdminPortal() {
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
    }"""

if old_script in script:
    script = script.replace(old_script, new_script)
    print("Replaced script successfully in script.js")
else:
    print('Failed to match old_script in script.js')

with codecs.open('script.js', 'w', 'utf-8') as f:
    f.write(script)

# Add grid-4 class to style.css
css = codecs.open('style.css', 'r', 'utf-8').read()
if '.grid-4' not in css:
    css = css.replace('.grid-3 { grid-template-columns: repeat(3, 1fr); }', '.grid-3 { grid-template-columns: repeat(3, 1fr); }\n.grid-4 { grid-template-columns: repeat(4, 1fr); }')
    # Make sure it's responsive on mobile
    responsive_css = """
@media (max-width: 900px) {
    .grid-4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 500px) {
    .grid-4 { grid-template-columns: 1fr; }
}"""
    if '@media (max-width: 900px)' not in css:
        css += responsive_css
    
    with codecs.open('style.css', 'w', 'utf-8') as f:
        f.write(css)
    print("Added grid-4 to style.css")
