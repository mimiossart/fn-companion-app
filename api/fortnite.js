const UPSTREAM = "https://fortnite-api.com";

export default async function handler(req, res) {
  const type = (req.query && req.query.type) || "cosmetics";
  const name = (req.query && req.query.name) || "";
  const key = process.env.FORTNITE_API_KEY || "";

  const paths = {
    cosmetics: "/v2/cosmetics/br?language=fr",
    map: "/v1/map",
    shop: "/v2/shop?language=fr",
    news: "/v2/news",
    stats: name ? "/v2/stats/br/v2?name=" + encodeURIComponent(name) : ""
  };

  if (!paths[type]) return res.status(400).json({error:"Type inconnu ou nom de joueur manquant."});

  const headers = {};
  if (key) headers.authorization = key;

  try {
    const r = await fetch(UPSTREAM + paths[type], { headers });
    const text = await r.text();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(r.status).setHeader("Content-Type", r.headers.get("content-type") || "application/json").send(text);
  } catch (e) {
    res.status(502).json({error:e.message || "API indisponible"});
  }
}
