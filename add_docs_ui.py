import re

try:
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add html2pdf script
    if 'html2pdf' not in content:
        content = content.replace(
            '<script src="https://unpkg.com/lucide@latest"></script>',
            '<script src="https://unpkg.com/lucide@latest"></script>\n    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>'
        )

    # Add menu item for documents
    if 'data-tab="tab-documents"' not in content:
        content = content.replace(
            '<a href="#" class="menu-item" data-tab="tab-history">',
            '<a href="#" class="menu-item" data-tab="tab-documents">\n                        <i data-lucide="folder-down"></i> <span>Mes Documents</span>\n                    </a>\n                    <a href="#" class="menu-item" data-tab="tab-history">'
        )

    # Add tab-documents panel
    doc_panel = """
                    <!-- ================= TAB: DOCUMENTS (PDF) ================= -->
                    <div id="tab-documents" class="tab-panel">
                        <h3 class="mb-1">Mes Factures & Ordonnances</h3>
                        <p class="text-muted mb-2 text-sm">Téléchargez vos documents médicaux et reçus de paiement en toute sécurité.</p>
                        
                        <div class="grid grid-2 gap-15">
                            <!-- Factures -->
                            <div class="card">
                                <div class="card-header flex justify-between align-center">
                                    <h3 class="text-accent">Mes Factures</h3>
                                    <i data-lucide="receipt"></i>
                                </div>
                                <div class="card-body" style="max-height: 400px; overflow-y: auto;" id="patient-invoices-list">
                                    <p class="text-muted text-sm text-center">Aucune facture disponible.</p>
                                </div>
                            </div>

                            <!-- Ordonnances -->
                            <div class="card">
                                <div class="card-header flex justify-between align-center">
                                    <h3 class="text-success">Mes Ordonnances</h3>
                                    <i data-lucide="file-text"></i>
                                </div>
                                <div class="card-body" style="max-height: 400px; overflow-y: auto;" id="patient-prescriptions-list">
                                    <p class="text-muted text-sm text-center">Aucune ordonnance disponible.</p>
                                </div>
                            </div>
                        </div>

                        <!-- Hidden PDF Template for Invoices -->
                        <div id="invoice-pdf-template" style="display: none; background: white; color: black; padding: 40px; width: 800px; font-family: sans-serif;">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px;">
                                <div>
                                    <h1 style="color: #0ea5e9; margin: 0; font-size: 24px;">CABINET PARAMÉDICAL DABAKH</h1>
                                    <p style="margin: 5px 0 0 0; color: #555; font-size: 14px;">SERAS, route de Khombole, Thiès<br>Tél: +221 77 209 17 25</p>
                                </div>
                                <div style="text-align: right;">
                                    <h2 style="margin: 0; color: #333;">FACTURE</h2>
                                    <p style="margin: 5px 0 0 0; color: #777;" id="pdf-invoice-date">Date: --</p>
                                    <p style="margin: 5px 0 0 0; color: #777;" id="pdf-invoice-id">N°: --</p>
                                </div>
                            </div>

                            <div style="margin-bottom: 40px;">
                                <h3 style="color: #555; border-bottom: 1px solid #eee; padding-bottom: 5px;">Informations Patient</h3>
                                <p style="margin: 5px 0;"><strong>Nom:</strong> <span id="pdf-patient-name">--</span></p>
                                <p style="margin: 5px 0;"><strong>Téléphone:</strong> <span id="pdf-patient-phone">--</span></p>
                            </div>

                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                                <thead>
                                    <tr style="background: #f8fafc; text-align: left;">
                                        <th style="padding: 12px; border-bottom: 1px solid #ddd;">Description du Soin</th>
                                        <th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">Montant</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style="padding: 12px; border-bottom: 1px solid #eee;" id="pdf-service-name">--</td>
                                        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;" id="pdf-service-price">-- FCFA</td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td style="padding: 12px; font-weight: bold; text-align: right;">TOTAL PAYÉ:</td>
                                        <td style="padding: 12px; font-weight: bold; text-align: right; color: #10b981;" id="pdf-total-price">-- FCFA</td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div style="text-align: center; margin-top: 60px; color: #777; font-size: 12px;">
                                <p>Merci de votre confiance.</p>
                                <p>Cabinet Paramédical DABAKH - Kinésithérapie & Rééducation Spécialisée</p>
                            </div>
                        </div>
                    </div>
"""
    if 'id="tab-documents"' not in content:
        content = content.replace('<!-- ================= TAB: HISTORY ================= -->', doc_panel + '\n                    <!-- ================= TAB: HISTORY ================= -->')

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
except Exception as e:
    print(e)
