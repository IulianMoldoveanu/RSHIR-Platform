export type SnippetLang = 'curl' | 'node' | 'python';

const EXAMPLE_BODY = JSON.stringify(
  {
    customer: { firstName: 'Maria', lastName: 'Pop', phone: '+40712345678' },
    items: [{ name: 'Pizza Margherita', qty: 1, priceRon: 35 }],
    totals: { subtotalRon: 35, deliveryFeeRon: 8, totalRon: 43 },
    fulfillment: 'DELIVERY',
    dropoff: { line1: 'Str. Libertății 10', city: 'Cluj-Napoca' },
    notes: '',
  },
  null,
  2,
);

export function buildSnippets(apiKey: string): Record<SnippetLang, string> {
  const base =
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL?.replace(/\/$/, '') ??
    'https://hiraisolutions.ro';
  const endpoint = `${base}/api/public/v1/orders`;

  return {
    curl: `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${EXAMPLE_BODY.replace(/'/g, "\\'")}'`,

    node: `const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${EXAMPLE_BODY}),
});

const data = await response.json();
console.log(data); // { order_id: "...", public_track_token: "..." }`,

    python: `import requests

response = requests.post(
    "${endpoint}",
    headers={
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json",
    },
    json=${EXAMPLE_BODY
      .replace(/true/g, 'True')
      .replace(/false/g, 'False')
      .replace(/null/g, 'None')},
)

print(response.json())  # {'order_id': '...', 'public_track_token': '...'}`,
  };
}
