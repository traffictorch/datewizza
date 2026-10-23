import { TOOL_PATH } from './tools.js';
const SITE = 'https://traffictorch.net';

export function profileJsonLd(profile, username) {
  const display = profile.display_name || username;
  const url = `${SITE}/torcher/${username}/`;
  const sameAs = [profile.website_url, profile.social1_url, profile.social2_url].filter(Boolean);

  const person = {
    '@type': 'Person',
    name: display,
    alternateName: `@${username}`,
    url,
    image: `${SITE}/images/avatars/${profile.avatar_preset || 'owner'}.svg`,
  };
  if (profile.bio) person.description = profile.bio;
  if (profile.job_title) person.jobTitle = profile.job_title;
  if (profile.company) person.worksFor = { '@type': 'Organization', name: profile.company };
  if (profile.location) person.address = profile.location;
  if (sameAs.length) person.sameAs = sameAs;

  const graph = [
    {
      '@type': 'ProfilePage',
      '@id': url,
      url,
      name: `${display} (@${username}) · Traffic Torch`,
      isPartOf: { '@type': 'WebSite', url: SITE },
      mainEntity: person,
      primaryImageOfPage: { '@type': 'ImageObject', url: person.image },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Community', item: SITE + '/community/' },
        { '@type': 'ListItem', position: 3, name: `@${username}`, item: url },
      ],
    },
  ];

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function jsonLdScript(obj) {
  // escape closing script tag inside strings
  const json = JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
  return `<script type="application/ld+json">${json}</script>`;
}

export function torchJsonLd(post, author, id) {
  const url = `${SITE}/torch/${id}/`;
  const domain = post.domain_mode === 'hidden'
    ? (post.domain_label || 'Hidden site')
    : (post.url ? new URL(post.url).hostname.replace(/^www\./, '') : 'Unknown');
  const headline = (post.page_title && post.page_title.trim()) || `Torch #${id}`;
  const toolLabel = (post.tool || '').replace(/-tool$/, '').replace(/-/g, ' ');
  const toolPath = TOOL_PATH[post.tool] || '/';
  const summary = `${author.display_name || author.username} scored ${post.score}/100 on ${domain} using the ${toolLabel} audit.`;

  const article = {
    '@type': 'TechArticle',
    '@id': url + '#article',
    url,
    headline,
    description: summary,
    datePublished: new Date(post.created_at).toISOString(),
    dateModified: new Date(post.created_at).toISOString(),
    author: {
      '@type': 'Person',
      name: author.display_name || author.username,
      url: `${SITE}/torcher/${author.username}/`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Traffic Torch',
      url: SITE + '/',
      logo: { '@type': 'ImageObject', url: SITE + '/logo-512.webp' },
    },
    about: {
      '@type': 'WebSite',
      name: domain,
      url: post.url || undefined,
    },
    mentions: {
      '@type': 'SoftwareApplication',
      name: toolLabel.charAt(0).toUpperCase() + toolLabel.slice(1),
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser',
      url: SITE + toolPath,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    keywords: [post.category, toolLabel, domain].filter(Boolean),
    isPartOf: {
      '@type': 'CollectionPage',
      name: 'Community Torches',
      url: SITE + '/community/',
    },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1'],
    },
  };
  if (post.note) article.articleBody = post.note;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      article,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Community', item: SITE + '/community/' },
          { '@type': 'ListItem', position: 3, name: '@' + author.username, item: `${SITE}/torcher/${author.username}/` },
          { '@type': 'ListItem', position: 4, name: `Torch #${id}`, item: url },
        ],
      },
    ],
  };
}

export function communityJsonLd(posts, tool) {
  const url = `${SITE}/community/`;
  const items = (posts || []).slice(0, 20).map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `${SITE}/torch/${p.id}/`,
    name: (p.page_title && p.page_title.trim()) || `Torch #${p.id}`,
  }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: tool ? `${tool} Torches` : 'Community Torches',
        isPartOf: { '@type': 'WebSite', url: SITE },
        mainEntity: { '@type': 'ItemList', itemListElement: items },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Community', item: url },
        ],
      },
    ],
  };
}
