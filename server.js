const http = require("http");
const https = require("https");
const url = require("url");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT) || 10000;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": contentType, "Access-Control-Allow-Origin": "*" });
    res.end(data);
  });
}

function serveHTML(res) {
  serveFile(res, path.join(__dirname, "index.html"), "text/html; charset=utf-8");
}

function proxyToOpenSea(osPath, res) {
  const options = {
    hostname: "api.opensea.io",
    path: osPath,
    method: "GET",
    headers: { "x-api-key": OPENSEA_API_KEY, "accept": "application/json" },
  };
  const req = https.request(options, (osRes) => {
    res.writeHead(osRes.statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    osRes.pipe(res);
  });
  req.on("error", (e) => {
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: e.message }));
  });
  req.end();
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;
  const query = parsed.query || "";

  console.log(`${req.method} ${pathname}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    });
    res.end();
    return;
  }

  // Serve overlay PNG files
  const overlayMatch = pathname.match(/^\/overlays\/(overlay-\d+\.png)$/);
  if (overlayMatch) {
    serveFile(res, path.join(__dirname, "overlays", overlayMatch[1]), "image/png");
    return;
  }

  // API: fetch single NFT by token ID from StonkBrokers collection
  // GET /api/nft/:tokenId
  const nftMatch = pathname.match(/^\/api\/nft\/(\d+)$/);
  if (nftMatch) {
    const tokenId = nftMatch[1];
    const osPath = `/api/v2/chain/robinhood/contract/0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0/nfts/${tokenId}`;
    proxyToOpenSea(osPath, res);
    return;
  }

  // API: fetch NFTs from collection (browsing / lookup by token range)
  // GET /api/collection?limit=20&next=cursor
  const collectionMatch = pathname.match(/^\/api\/collection$/);
  if (collectionMatch) {
    const osPath = `/api/v2/collection/stonkbrokers-434284142/nfts${query ? "?" + query : ""}`;
    proxyToOpenSea(osPath, res);
    return;
  }

  // API: collection stats
  const statsMatch = pathname.match(/^\/api\/stats$/);
  if (statsMatch) {
    proxyToOpenSea("/api/v2/collections/stonkbrokers-434284142/stats", res);
    return;
  }

  // Everything else → serve index.html
  if (!pathname.startsWith("/api/")) {
    serveHTML(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "API route not found: " + pathname }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`STONKBROKERS PFP Tool → http://0.0.0.0:${PORT}`);
  if (!OPENSEA_API_KEY) console.warn("⚠  Set OPENSEA_API_KEY environment variable");
  console.log(`index.html exists: ${fs.existsSync(path.join(__dirname, "index.html"))}`);
  console.log(`overlays dir exists: ${fs.existsSync(path.join(__dirname, "overlays"))}`);
});
