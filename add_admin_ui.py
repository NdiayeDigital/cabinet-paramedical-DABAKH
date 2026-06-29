import sys
import re

try:
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add Chart.js script if not present
    if 'chart.js' not in content:
        content = content.replace(
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>',
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>\n    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>'
        )

    # 2. Add waiting room menu item to Admin Sidebar
    if 'tab-waiting-room' not in content:
        admin_menu_add = """<a href="#" class="menu-item" data-tab="tab-waiting-room">
                        <i data-lucide="clock"></i> <span>Salle d'attente</span>
                    </a>
                    """
        content = content.replace(
            '<a href="#" class="menu-item" data-tab="tab-admin-stats">',
            admin_menu_add + '<a href="#" class="menu-item" data-tab="tab-admin-stats">'
        )

    # 3. Add Waiting Room tab UI
    waiting_room_ui = """
                    <!-- ================= TAB: WAITING ROOM ================= -->
                    <div id="tab-waiting-room" class="tab-panel">
                        <div class="flex justify-between align-center mb-2">
                            <div>
                                <h3>🛋️ Salle d'attente virtuelle</h3>
                                <p class="text-muted text-sm">Gérez le flux des patients en temps réel.</p>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="renderWaitingRoom()">
                                <i data-lucide="refresh-cw"></i> Actualiser
                            </button>
                        </div>
                        
                        <div class="grid grid-2 gap-15">
                            <!-- File d'attente Admin -->
                            <div class="card" id="admin-waiting-list" style="display: none;">
                                <div class="card-header bg-glass">
                                    <h3 class="text-accent">Patients en attente (Aujourd'hui)</h3>
                                </div>
                                <div class="card-body" id="waiting-room-patients">
                                    <!-- Populated by JS -->
                                </div>
                            </div>

                            <!-- Vue Patient (Status) -->
                            <div class="card" id="patient-waiting-status" style="display: none;">
                                <div class="card-header bg-glass text-center">
                                    <h3 class="text-success">Votre Tour Approche !</h3>
                                </div>
                                <div class="card-body text-center py-3">
                                    <h1 style="font-size: 4rem; color: var(--color-primary);" id="waiting-patient-position">--</h1>
                                    <p class="text-muted text-lg">Position dans la file d'attente</p>
                                    <p class="mt-1 badge badge-success-outline">Heure estimée : <span id="waiting-patient-time">--</span></p>
                                </div>
                            </div>
                        </div>
                    </div>
    """
    if 'id="tab-waiting-room"' not in content:
        content = content.replace('<!-- ================= TAB: ADMIN STATS ================= -->', waiting_room_ui + '\n                    <!-- ================= TAB: ADMIN STATS ================= -->')

    # 4. Replace SVG graph with Chart.js canvases in tab-admin-stats
    if 'id="admin-stats-svg"' in content:
        new_stats_ui = """
                                <div class="grid grid-2 gap-15">
                                    <div style="background: rgba(255,255,255,0.8); border: 1px solid var(--color-border); border-radius: 8px; padding: 20px; height: 350px;">
                                        <h4 class="text-center text-muted mb-1">Revenus Mensuels (FCFA)</h4>
                                        <canvas id="revenueChart"></canvas>
                                    </div>
                                    <div style="background: rgba(255,255,255,0.8); border: 1px solid var(--color-border); border-radius: 8px; padding: 20px; height: 350px;">
                                        <h4 class="text-center text-muted mb-1">Répartition des Services</h4>
                                        <canvas id="servicesChart"></canvas>
                                    </div>
                                </div>
        """
        content = re.sub(
            r'<div\s+style="background: rgba\(5,8,16,0\.5\);.*?<svg id="admin-stats-svg".*?</svg>\s*</div>',
            new_stats_ui,
            content,
            flags=re.DOTALL
        )

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)

    print("index.html updated successfully.")
except Exception as e:
    print(e)
