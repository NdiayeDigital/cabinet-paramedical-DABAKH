import codecs
import re

content_html = codecs.open('index.html', 'r', 'utf-8').read()

# Add Appointment filters
old_header = """                        <div class="card bg-glass mt-2">
                            <div class="card-header flex justify-between align-center">
                                <h3>📅 Gestion des Rendez-vous</h3>
                            </div>"""

new_header = """                        <div class="card bg-glass mt-2">
                            <div class="card-header flex justify-between align-center">
                                <h3>📅 Gestion des Rendez-vous</h3>
                                <div class="flex gap-05">
                                    <button class="btn btn-secondary btn-sm" id="btn-filter-apt-all" onclick="setAptFilter('all')" style="border-color: var(--color-primary); color: var(--color-primary);">Tous</button>
                                    <button class="btn btn-secondary btn-sm" id="btn-filter-apt-today" onclick="setAptFilter('today')">Aujourd'hui</button>
                                </div>
                            </div>"""

if old_header in content_html:
    content_html = content_html.replace(old_header, new_header)

with codecs.open('index.html', 'w', 'utf-8') as f:
    f.write(content_html)


# Patch script.js
content_js = codecs.open('script.js', 'r', 'utf-8').read()

# 1. State for Appointment Filter & Payment Toggle
admin_funcs = """
let currentAptFilter = 'all';

function setAptFilter(filter) {
    currentAptFilter = filter;
    
    document.getElementById('btn-filter-apt-all').style.borderColor = filter === 'all' ? 'var(--color-primary)' : 'var(--color-border)';
    document.getElementById('btn-filter-apt-all').style.color = filter === 'all' ? 'var(--color-primary)' : 'var(--color-text-muted)';
    
    document.getElementById('btn-filter-apt-today').style.borderColor = filter === 'today' ? 'var(--color-primary)' : 'var(--color-border)';
    document.getElementById('btn-filter-apt-today').style.color = filter === 'today' ? 'var(--color-primary)' : 'var(--color-text-muted)';
    
    renderAdminAppointments();
}

async function adminTogglePayment(aptId) {
    const aptIndex = appointments.findIndex(a => a.id === aptId);
    if (aptIndex !== -1) {
        appointments[aptIndex].isPaid = !appointments[aptIndex].isPaid;
        localStorage.setItem('daba_appointments', JSON.stringify(appointments));
        
        if (supabaseClient) {
            await supabaseClient.from('appointments').update({ is_paid: appointments[aptIndex].isPaid }).eq('id', aptId);
        }
        renderAdminAppointments();
    }
}
"""

if 'currentAptFilter' not in content_js:
    content_js += admin_funcs

# 2. Modify renderAdminAppointments to filter and show payment toggle
old_render_start = """    const tbodyApt = document.getElementById("admin-active-appointments-body");
    if (tbodyApt) {
        const activeApts = appointments.filter(a => a.status !== "Annulé");"""

new_render_start = """    const tbodyApt = document.getElementById("admin-active-appointments-body");
    if (tbodyApt) {
        let activeApts = appointments.filter(a => a.status !== "Annulé");
        
        if (typeof currentAptFilter !== 'undefined' && currentAptFilter === 'today') {
            const todayStr = new Date().toISOString().split('T')[0];
            activeApts = activeApts.filter(a => a.date === todayStr);
        }
        
        // Trier par date la plus proche en premier
        activeApts.sort((a, b) => new Date(a.date) - new Date(b.date));"""

content_js = content_js.replace(old_render_start, new_render_start)

# Add Payment button in table render
match_return = re.search(r'return `\s*<tr>(.*?)</tr>\s*`;', content_js, re.DOTALL)
if match_return:
    tr_content = match_return.group(1)
    # We want to add the payment badge next to the status badge
    old_td = """<td><span class="badge ${badgeClass}">${a.status}</span></td>"""
    new_td = """<td>
                            <span class="badge ${badgeClass} mb-05 block" style="width:fit-content;">${a.status}</span>
                            <span class="badge ${a.isPaid ? 'badge-success' : 'badge-secondary'} cursor-pointer" onclick="adminTogglePayment('${a.id}')" title="Cliquez pour changer">
                                ${a.isPaid ? '<i data-lucide="check-circle" class="inline-icon"></i> Payé' : '<i data-lucide="clock" class="inline-icon"></i> À Payer'}
                            </span>
                        </td>"""
    
    if old_td in content_js:
        content_js = content_js.replace(old_td, new_td)

with codecs.open('script.js', 'w', 'utf-8') as f:
    f.write(content_js)
