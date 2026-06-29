import sys

try:
    with open('script.js', 'r', encoding='utf-8') as f:
        content = f.read()

    toast_js = """
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
"""

    if 'function showToastNotification' not in content:
        # Insert before the end of the script or at the very end
        content += "\n" + toast_js
        with open('script.js', 'w', encoding='utf-8') as f:
            f.write(content)

    # We need to call checkUpcomingAppointments() in appSwitchTab('tab-overview') or renderPatientDashboard
    if 'renderPatientDashboard();' in content:
        content = content.replace(
            'renderPatientDashboard();',
            'renderPatientDashboard();\n    checkUpcomingAppointments();'
        )
        with open('script.js', 'w', encoding='utf-8') as f:
            f.write(content)
            
except Exception as e:
    print(e)
