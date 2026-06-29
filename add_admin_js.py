import sys

try:
    with open('script.js', 'r', encoding='utf-8') as f:
        content = f.read()

    admin_js = """
// ==========================================
// ADMIN STATS & CHART.JS
// ==========================================
let revenueChartInstance = null;
let servicesChartInstance = null;

function renderAdminStats() {
    if (!isAdminMode) return;
    
    if (typeof Chart === 'undefined') {
        setTimeout(renderAdminStats, 500);
        return;
    }

    // 1. Process Revenue (Terminated Appointments x Price)
    const monthlyRevenue = {};
    const servicesCount = {};
    
    allAppointments.forEach(apt => {
        if (apt.status === 'Terminé') {
            const month = apt.date.substring(0, 7); // YYYY-MM
            if (!monthlyRevenue[month]) monthlyRevenue[month] = 0;
            
            let price = 15000;
            const srv = SERVICES_DATA.find(s => s.name === apt.serviceName || s.name === apt.service);
            if (srv) price = parseInt(srv.price.replace(/\D/g, '')) || 15000;
            
            monthlyRevenue[month] += price;
            
            const serviceName = apt.serviceName || apt.service || 'Consultation';
            if (!servicesCount[serviceName]) servicesCount[serviceName] = 0;
            servicesCount[serviceName]++;
        }
    });

    const revLabels = Object.keys(monthlyRevenue).sort();
    const revData = revLabels.map(k => monthlyRevenue[k]);
    
    const ctxRev = document.getElementById('revenueChart');
    if (ctxRev) {
        if (revenueChartInstance) revenueChartInstance.destroy();
        revenueChartInstance = new Chart(ctxRev, {
            type: 'line',
            data: {
                labels: revLabels.length ? revLabels : ['Jan', 'Fev', 'Mar', 'Avr', 'Mai'],
                datasets: [{
                    label: 'Revenus (FCFA)',
                    data: revData.length ? revData : [0, 0, 0, 0, 0],
                    borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14, 165, 233, 0.2)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const srvLabels = Object.keys(servicesCount);
    const srvData = srvLabels.map(k => servicesCount[k]);
    const ctxSrv = document.getElementById('servicesChart');
    if (ctxSrv) {
        if (servicesChartInstance) servicesChartInstance.destroy();
        servicesChartInstance = new Chart(ctxSrv, {
            type: 'doughnut',
            data: {
                labels: srvLabels.length ? srvLabels : ['Kinésithérapie', 'Post-AVC', 'Traumatologie'],
                datasets: [{
                    data: srvData.length ? srvData : [10, 5, 8],
                    backgroundColor: ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// ==========================================
// WAITING ROOM
// ==========================================
function renderWaitingRoom() {
    const adminList = document.getElementById('admin-waiting-list');
    const patientStatus = document.getElementById('patient-waiting-status');
    const todayStr = new Date().toISOString().split('T')[0];

    if (isAdminMode) {
        adminList.style.display = 'block';
        patientStatus.style.display = 'none';
        
        // Find today's appointments that are Confirmed or En attente
        const todaysApts = allAppointments
            .filter(a => a.date === todayStr && (a.status === 'Confirmé' || a.status === 'En attente de validation'))
            .sort((a, b) => a.time.localeCompare(b.time));
            
        const container = document.getElementById('waiting-room-patients');
        if (todaysApts.length === 0) {
            container.innerHTML = '<p class="text-center text-muted py-2">Aucun patient en attente aujourd\\'hui.</p>';
        } else {
            container.innerHTML = todaysApts.map((apt, index) => `
                <div class="flex justify-between align-center border-b pb-1 mb-1" style="border-bottom: 1px solid var(--color-border);">
                    <div>
                        <h4 class="font-bold">#${index + 1} - ${apt.patientName || 'Patient'}</h4>
                        <p class="text-xs text-muted">Heure: ${apt.time} | Service: ${apt.serviceName || apt.service}</p>
                    </div>
                    <button class="btn btn-sm btn-success" onclick="callPatient('${apt.id}')">
                        <i data-lucide="mic"></i> Appeler
                    </button>
                </div>
            `).join('');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else if (currentUser) {
        adminList.style.display = 'none';
        patientStatus.style.display = 'block';
        
        const todaysApts = allAppointments
            .filter(a => a.date === todayStr && (a.status === 'Confirmé' || a.status === 'En attente de validation'))
            .sort((a, b) => a.time.localeCompare(b.time));
            
        const myIndex = todaysApts.findIndex(a => a.patientId === currentUser.id);
        
        const posEl = document.getElementById('waiting-patient-position');
        const timeEl = document.getElementById('waiting-patient-time');
        
        if (myIndex !== -1) {
            posEl.innerText = (myIndex + 1);
            timeEl.innerText = todaysApts[myIndex].time;
            if (myIndex === 0) {
                posEl.style.color = 'var(--color-success)';
                // Optional: Play a sound if it's their turn
            }
        } else {
            posEl.innerText = '-';
            timeEl.innerText = 'Aucun RDV aujourd\\'hui';
        }
    }
}

function callPatient(appointmentId) {
    const apt = allAppointments.find(a => a.id == appointmentId);
    if (!apt) return;
    
    // In a real app, this would update DB status to "En cours" and trigger Realtime
    // Here we just mock the Realtime notification
    if (supabaseClient) {
        supabaseClient.from('notifications').insert([{
            patient_phone: apt.patientPhone,
            title: "C'est votre tour !",
            message: "Veuillez vous diriger vers la salle de consultation.",
            is_read: false
        }]).then(() => {
            alert("Patient appelé et notifié !");
            apt.status = 'Terminé'; // Mock progression
            renderWaitingRoom();
        });
    }
}
"""

    if 'function renderAdminStats' not in content:
        # We need to replace the old renderAdminStats
        import re
        content = re.sub(r'function renderAdminStats\(\)\s*\{.*?(?=\nfunction |\n//)', '', content, flags=re.DOTALL)
        content += "\n" + admin_js

    # Add to appSwitchTab
    if 'tab-waiting-room' not in content:
        content = content.replace(
            "if (tabId === 'tab-admin-stats') {",
            "if (tabId === 'tab-waiting-room') {\n        renderWaitingRoom();\n    }\n    if (tabId === 'tab-admin-stats') {"
        )
        content = content.replace(
            "'tab-admin-stats': 'Statistiques',",
            "'tab-waiting-room': 'Salle d\\'Attente',\n        'tab-admin-stats': 'Statistiques',"
        )
        
    with open('script.js', 'w', encoding='utf-8') as f:
        f.write(content)

    print("script.js updated successfully.")
except Exception as e:
    print(e)
