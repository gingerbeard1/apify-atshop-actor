const Apify = require('apify');
const cheerio = require('cheerio');
const axios = require('axios');

Apify.main(async () => {
  const input = await Apify.getInput();

  const { shopNames, searchKeywords } = input;

  // Check if required input is provided
  if ((!shopNames || shopNames.length === 0) && (!searchKeywords || searchKeywords.length === 0)) {
    throw new Error('Please provide either shopNames or searchKeywords in the input.');
  }

  // Fetches HTML content of a given URL
  async function fetchData(url) {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      return null;
    }
  }

  // Scrapes the shop data from a given shop URL
  async function scrapeShopData(shopUrl) {
    const html = await fetchData(shopUrl);

    if (!html) {
      console.error(`Failed to fetch HTML content for shop: ${shopUrl}`);
      return null;
    }

    const $ = cheerio.load(html);
    const shopDescription = $('meta[name="description"]').attr('content');

    // Extract links from shop description and additional contact information
    const links = [];
    const contactInfo = {
      emails: [],
      telegrams: [],
      discords: [],
      cashApps: [],
    };

    // Regular expressions for detecting various contact information
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const telegramRegex = /(?:https?:\/\/)?(?:www\.)?(?:t\.me\/|telegram\.me\/|@)?([^\s]+)/g;
    const discordRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite\/|discord\.gg\/|@)?([^\s]+)/g;
    const cashAppRegex = /(?:https?:\/\/)?(?:www\.)?(?:cash\.app\/\$|@)?([^\s]+)/g;

    // Extract links from shop description
    $('a').each((i, element) => {
      const link = $(element).attr('href');
      if (link) {
        links.push(link);
      }
    });

    // Extract contact information using regex from shop description
    const shopDescriptionText = shopDescription || '';
    const emailMatches = shopDescriptionText.match(emailRegex);
    const telegramMatches = shopDescriptionText.match(telegramRegex);
    const discordMatches = shopDescriptionText.match(discordRegex);
    const cashAppMatches = shopDescriptionText.match(cashAppRegex);

    if (emailMatches) {
      contactInfo.emails.push(...emailMatches);
    }

    if (telegramMatches) {
      contactInfo.telegrams.push(...telegramMatches);
    }

    if (discordMatches) {
      contactInfo.discords.push(...discordMatches);
    }

    if (cashAppMatches) {
      contactInfo.cashApps.push(...cashAppMatches);
    }

    return {
      shopName: shopUrl.split('.')[0],
      shopDescription,
      links,
      contactInfo,
    };
  }

  // Scrapes atshop.io shops based on the provided shop names
  async function scrapeShopsByNames() {
    const results = [];

    for (const shopName of shopNames) {
      const shopUrl = `https://${shopName}.atshop.io`;
      const shopData = await scrapeShopData(shopUrl);

      if (shopData) {
        results.push(shopData);
      }
    }

    return results;
  }

  // Scrapes atshop.io shops based on the provided search keywords
  async function scrapeShopsByKeywords() {
    const results = [];

    for (const keyword of searchKeywords) {
      const searchUrl = `https://www.google.com/search?q=site%3Aatshop.io+${encodeURIComponent(keyword)}`;
      const searchHtml = await fetchData(searchUrl);

      if (!searchHtml) {
        console.error(`Failed to fetch search results for keyword: ${keyword}`);
        continue;
      }

      const $ = cheerio.load(searchHtml);
      const searchResults = [];

      $('div.g').each((i, element) => {
        const shopUrl = $(element).find('a').attr('href');
        const shopNameMatch = shopUrl.match(/atshop\.io\/([^/]+)/i);

        if (shopNameMatch) {
          const shopName = shopNameMatch[1];
          const shopData = await scrapeShopData(`https://${shopName}.atshop.io`);

          if (shopData) {
            searchResults.push(shopData);
          }
        }
      });

      results.push(...searchResults);
    }

    return results;
  }

  // Scrape shops based on provided shop names or search keywords
  let results = [];

  if (shopNames && shopNames.length > 0) {
    results = await scrapeShopsByNames();
  }

  if (searchKeywords && searchKeywords.length > 0) {
    const searchResults = await scrapeShopsByKeywords();
    results.push(...searchResults);
  }

  // Save the scraped data to the default dataset
  await Apify.pushData(results);
});
