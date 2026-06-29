import sys

try:
    with open('script.js', 'r', encoding='utf-8') as f:
        content = f.read()

    js_code = """
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
"""

    if 'function generateInvoicePDF' not in content:
        content += "\n" + js_code
        with open('script.js', 'w', encoding='utf-8') as f:
            f.write(content)

    # Call renderDocumentsTab() in appSwitchTab
    if 'renderDocumentsTab();' not in content:
        content = content.replace(
            "if (tabId === 'tab-history') {",
            "if (tabId === 'tab-documents') {\n        renderDocumentsTab();\n    }\n    if (tabId === 'tab-history') {"
        )
        with open('script.js', 'w', encoding='utf-8') as f:
            f.write(content)

except Exception as e:
    print(e)
