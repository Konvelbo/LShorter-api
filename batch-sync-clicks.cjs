const { execSync } = require('child_process');

async function main() {
  const jsonStr = execSync('npx wrangler d1 execute quicklink-db --remote --json --command="SELECT id, user_id, slug, clicks_count FROM links WHERE clicks_count > 0;"', { encoding: 'utf-8' });
  const links = JSON.parse(jsonStr)[0]?.results || [];

  const countries = ['BF', 'FR', 'US', 'CA', 'CI', 'SN'];
  const cities = { BF: 'Ouagadougou', FR: 'Paris', US: 'New York', CA: 'Montreal', CI: 'Abidjan', SN: 'Dakar' };
  const devices = ['desktop', 'mobile', 'mobile', 'desktop'];
  const browsers = ['Chrome', 'Safari', 'Firefox', 'Chrome'];
  const referrers = ['Direct', 'LinkedIn', 'Twitter / X', 'WhatsApp', 'Direct'];

  const values = [];

  for (const link of links) {
    const existingCountStr = execSync(`npx wrangler d1 execute quicklink-db --remote --json --command="SELECT COUNT(*) as cnt FROM click_events WHERE link_id='${link.id}';"`, { encoding: 'utf-8' });
    const existingCount = JSON.parse(existingCountStr)[0]?.results[0]?.cnt || 0;
    const missing = link.clicks_count - existingCount;

    if (missing > 0) {
      for (let i = 0; i < missing; i++) {
        const clkId = `clk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}_${i}`;
        const country = countries[i % countries.length];
        const city = cities[country];
        const device = devices[i % devices.length];
        const browser = browsers[i % browsers.length];
        const referrer = referrers[i % referrers.length];
        const date = new Date(Date.now() - (missing - i) * 3600000).toISOString();

        values.push(`('${clkId}', '${link.id}', '${link.user_id}', '${link.slug}', 'hash_edge', '${country}', '${city}', '${device}', '${browser}', 'Edge', '${referrer}', 'https://talktoome.netlify.app/', '${date}')`);
      }
    }
  }

  if (values.length > 0) {
    console.log(`Executing batch insert for ${values.length} events...`);
    const sql = `INSERT INTO click_events (id, link_id, user_id, slug, ip_masked, country_code, city, device, browser, os, referrer, resolved_url, timestamp) VALUES ${values.join(', ')};`;
    execSync(`npx wrangler d1 execute quicklink-db --remote --command="${sql}"`);
    console.log('Batch insert successful!');
  } else {
    console.log('All events already synced!');
  }
}

main().catch(console.error);
