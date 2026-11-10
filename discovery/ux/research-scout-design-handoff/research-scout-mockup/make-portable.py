from pathlib import Path

project = Path(__file__).resolve().parent
html = (project / "dist/index.html").read_text()
css = (project / "dist/styles.css").read_text()
js = (project / "dist/app.js").read_text()
html = html.replace('<link rel="stylesheet" href="./styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="./app.js" defer></script>', '')
html = html.replace('</body>', '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n</body>')
output = project.parent / "research-scout-mockup.html"
output.write_text(html)
print(output)
