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

const devPort = Number.parseInt(process.env.AOE2WAR_DEV_PORT || "3000", 10);
if (!Number.isInteger(devPort) || devPort < 1024 || devPort > 65533) throw new Error("Invalid AOE2WAR_DEV_PORT");
const redirectPort = devPort + 1;

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
    .listen(devPort, (err) => {
      if (err) throw err;
      console.log(`> HTTPS Dev Server listening on https://localhost:${devPort}`);
    });

  // 2) HTTP → HTTPS redirector on 3001
  http
    .createServer((req, res) => {
      const hostHeader = req.headers.host || `localhost:${redirectPort}`;
      // strip any port, replace with 3000
      const host = hostHeader.replace(/:\d+$/, "");
      res.writeHead(301, {
        Location: `https://${host}:${devPort}${req.url || "/"}`,
      });
      res.end();
    })
    .listen(redirectPort, (err) => {
      if (err) throw err;
      console.log(
        `> HTTP Redirector listening on http://localhost:${redirectPort} → https://localhost:${devPort}`
      );
    });
});
