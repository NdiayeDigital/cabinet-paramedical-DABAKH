import sys

try:
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    toast_html = """
    <!-- Floating Audio Toast Reminder -->
    <div id="toast-container" class="toast-container"></div>
    <audio id="notification-sound" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto"></audio>
    """

    if 'toast-container' not in content:
        content = content.replace('</body>', toast_html + '\n</body>')
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)

    with open('style.css', 'r', encoding='utf-8') as f:
        css_content = f.read()
        
    toast_css = """
/* Toast Notification */
.toast-container {
    position: fixed;
    bottom: 30px;
    right: 30px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.toast {
    background: rgba(14, 165, 233, 0.95);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 16px;
    transform: translateX(120%);
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border-left: 6px solid #10b981;
}
.toast.show {
    transform: translateX(0);
}
.toast-icon {
    font-size: 24px;
    background: white;
    color: #0ea5e9;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.toast-content h4 {
    margin: 0 0 4px 0;
    font-size: 1rem;
    font-family: 'Outfit', sans-serif;
}
.toast-content p {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.9;
}
.toast-close {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 1.2rem;
    opacity: 0.7;
}
.toast-close:hover { opacity: 1; }
"""

    if 'toast-container' not in css_content:
        with open('style.css', 'a', encoding='utf-8') as f:
            f.write(toast_css)
            
except Exception as e:
    print(e)
