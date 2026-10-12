export function renderTemplate(markdown: string): string {
  // Convert Markdown to HTML
  const html = markdown
    .replace(/# (.*?)\n/g, '<h1>$1</h1>\n')
    .replace(/## (.*?)\n/g, '<h2>$1</h2>\n')
    .replace(/### (.*?)\n/g, '<h3>$1</h3>\n')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/(\n\n)(?!<)/g, '</p><p>');

  // Return the HTML
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Blog</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
    h1, h2, h3 { color: #333; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    img { max-width: 100%; height: auto; }
    a { color: #007bff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div>${html}</div>
</body>
</html>
`;
}