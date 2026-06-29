import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove Copilote from patient sidebar menu
content = re.sub(
    r'<a href="#" class="menu-item" data-tab="tab-chatbot">.*?</a>',
    '',
    content,
    flags=re.DOTALL
)

# Remove logo from sidebar header
content = re.sub(
    r'<div class="logo">\s*<img src="images/logo-dabakh.png" alt="Cabinet Paramédical DABAKH" class="logo-img-header">\s*</div>',
    '',
    content,
    count=1
)

# Replace grid-3 with grid-4 and insert new card
new_card = """
                            <div class="metric-card bg-glass">
                                <div class="flex justify-between align-center mb-1">
                                    <span class="metric-label">Bilan Séances</span>
                                    <i data-lucide="activity" class="text-accent"></i>
                                </div>
                                <div class="flex justify-between text-sm mb-05">
                                    <span class="text-muted">Faits:</span>
                                    <span class="font-bold text-success" id="overview-seances-faites">0</span>
                                </div>
                                <div class="flex justify-between text-sm mb-05">
                                    <span class="text-muted">Présents:</span>
                                    <span class="font-bold text-accent" id="overview-seances-presents">0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-muted">Absents:</span>
                                    <span class="font-bold text-danger" id="overview-seances-absents">0</span>
                                </div>
                            </div>
"""

content = content.replace(
    '<div class="grid grid-3 gap-15">',
    '<div class="grid grid-4 gap-15">'
)

content = content.replace(
    '<h3 class="metric-value text-accent" id="overview-next-appointment">Aucun</h3>\n                            </div>',
    '<h3 class="metric-value text-accent" id="overview-next-appointment">Aucun</h3>\n                            </div>' + new_card
)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
