const UPSTREAM = "https://fortnite-api.com";
export default async function handler(req, res) {
  const { type = "cosmetics" } = req.query || {};
  const key = process.env.FORTNITE_API_KEY || "";
  const paths = {
    cosmetics: "/v2/cosmetics/br?language=fr",
    map: "/v1/map",
    shop: "/v2/shop?language=fr",
    news: "/v2/news"
  };
  if (!paths[type]) return res.status(400).json({error:"Type inconnu"});
  const headers = key ? { authorization: key } : {};
  try {
    const r = await fetch(UPSTREAM + paths[type], { headers });
    const text = await r.text();
    res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=600");
    res.status(r.status).setHeader("Content-Type", r.headers.get("content-type") || "application/json").send(text);
  } catch (e) {
    res.status(502).json({error:e.message || "API indisponible"});
  }
}
