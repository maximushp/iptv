module.exports = async (req, res) => {
  const target = String((req.query && req.query.url) || "");

  if (!/^https?:\/\//i.test(target)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Parâmetro url inválido" }));
    return;
  }

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers["if-none-match"]) headers["If-None-Match"] = req.headers["if-none-match"];
    if (req.headers["if-modified-since"]) headers["If-Modified-Since"] = req.headers["if-modified-since"];

    const upstream = await fetch(target, { headers, redirect: "follow" });

    res.statusCode = upstream.status;
    const pass = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
    ];
    for (const name of pass) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const canContinue = res.write(Buffer.from(value));
      if (!canContinue) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (err) {
    const message = String((err && err.message) || err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: message }));
    } else {
      res.end();
    }
  }
};
