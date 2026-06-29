import sys

try:
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add manifest to head
    if 'manifest.json' not in content:
        content = content.replace(
            '<link rel="stylesheet" href="style.css">',
            '<link rel="manifest" href="manifest.json">\n    <link rel="stylesheet" href="style.css">'
        )

    # Add service worker to body end
    sw_script = """
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('ServiceWorker registration successful');
          }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
          });
        });
      }
    </script>
"""
    if 'serviceWorker.register' not in content:
        content = content.replace('</body>', sw_script + '</body>')

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
except Exception as e:
    print(e)
