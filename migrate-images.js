const { execSync } = require('child_process');

async function main() {
  const jsonStr = execSync('npx wrangler d1 execute quicklink-db --remote --json --command="SELECT id, og_image FROM links WHERE og_image LIKE \'data:image%\';"', { encoding: 'utf-8' });
  const parsed = JSON.parse(jsonStr);
  const rows = parsed[0]?.results || [];
  console.log(`Found ${rows.length} links with base64 images`);

  for (const row of rows) {
    const res = await fetch('https://lshorter-api.fiatechnologiecam.workers.dev/api/v1/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: row.og_image }),
    });
    const result = await res.json();
    if (result?.url) {
      console.log(`Updating link ${row.id} with CDN URL: ${result.url}`);
      execSync(`npx wrangler d1 execute quicklink-db --remote --command="UPDATE links SET og_image='${result.url}' WHERE id='${row.id}';"`);
    }
  }
  console.log('Migration done!');
}

main().catch(console.error);
