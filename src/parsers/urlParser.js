import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes a URL and extracts meaningful text/structure from it.
 * Works for: API docs, data pages, JSON endpoints, regular websites
 */
export async function parseURL(url) {
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  let response;
  try {
    response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UniversalBackend/1.0)',
        'Accept': 'text/html,application/json,*/*',
      },
    });
  } catch (err) {
    throw new Error(`Failed to fetch URL: ${err.message}`);
  }

  const contentType = response.headers['content-type'] || '';

  // If it's a JSON API endpoint, return it directly
  if (contentType.includes('application/json')) {
    const jsonContent = JSON.stringify(response.data, null, 2);
    const MAX_CHARS = 12000;
    return {
      type: 'url',
      sourceType: 'json-api',
      url,
      content: jsonContent.slice(0, MAX_CHARS),
      truncated: jsonContent.length > MAX_CHARS,
    };
  }

  // Otherwise scrape the HTML
  const $ = cheerio.load(response.data);

  // Remove useless tags
  $('script, style, nav, footer, iframe, noscript').remove();

  // Extract meaningful content
  const title = $('title').text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const headings = [];
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(text);
  });

  // Extract tables (often contain data/schema info)
  const tables = [];
  $('table').each((_, table) => {
    const rows = [];
    $(table).find('tr').each((_, row) => {
      const cells = [];
      $(row).find('th, td').each((_, cell) => cells.push($(cell).text().trim()));
      if (cells.length) rows.push(cells.join(' | '));
    });
    if (rows.length) tables.push(rows.join('\n'));
  });

  // Extract all body text
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const MAX_CHARS = 10000;
  const trimmedText = bodyText.slice(0, MAX_CHARS);

  const structured = `
Title: ${title}
Description: ${metaDescription}
URL: ${url}

Headings:
${headings.join('\n')}

${tables.length ? `Tables:\n${tables.join('\n\n')}` : ''}

Page Content:
${trimmedText}
`.trim();

  return {
    type: 'url',
    sourceType: 'website',
    url,
    title,
    content: structured,
    truncated: bodyText.length > MAX_CHARS,
  };
}
