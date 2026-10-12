export function renderHtml(title: string, content: string, date: string, author: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .metadata { color: #777; font-size: 0.9em; margin-bottom: 10px; }
    .content { line-height: 1.6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="metadata">Published on ${date} by ${author}</div>
  <div class="content">${content}</div>
</body>
</html>
`;
}