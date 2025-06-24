// server.js

const https = require("https");
const http = require("http");
const { parse } = require("url");
const next = require("next");
const fs = require("fs");
const path = require("path");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// mkcert will drop these files into your project root
const certDir = process.cwd();
const httpsOptions = {
  key: fs.readFileSync(path.join(certDir, "localhost+2-key.pem")),
  cert: fs.readFileSync(path.join(certDir, "localhost+2.pem")),
};

app.prepare().then(() => {
  // 1) HTTPS on 3000
  https
    .createServer(httpsOptions, (req, res) => {
      const parsedUrl = parse(req.url || "/", true);
      handle(req, res, parsedUrl);
    })
    .listen(3000, (err) => {
      if (err) throw err;
      console.log("> HTTPS Dev Server listening on https://localhost:3000");
    });

  // 2) HTTP → HTTPS redirector on 3001
  http
    .createServer((req, res) => {
      const hostHeader = req.headers.host || "localhost:3001";
      // strip any port, replace with 3000
      const host = hostHeader.replace(/:\d+$/, "");
      res.writeHead(301, {
        Location: `https://${host}:3000${req.url || "/"}`,
      });
      res.end();
    })
    .listen(3001, (err) => {
      if (err) throw err;
      console.log(
        "> HTTP Redirector listening on http://localhost:3001 → https://localhost:3000"
      );
    });
});
