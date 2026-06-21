const BASE_URL = process.env.AOE2WAR_PREWARM_BASE_URL || "http://127.0.0.1:3030";

const urls = [
  "/",
  "/api/lobby",
  "/api/live-games",
  "/api/media-assets/logo/footer-wolo?fallback=%2Flegacy%2Fwolo-logo-transparent.webp",
  "/api/media-assets/avatar/user-u-510b020f19b5450793c95e05de791cc7?fallback=%2Fchampions%2Fplayers%2Fsilhouette.webp&size=thumb",
  "/brand/aoe2war-logo.webp",
  "/lobby/war-chest-bg.webp",
  "/champions/players/silhouette.thumb.webp",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hit(pathname, attempt = 1) {
  const startedAt = Date.now();

  try {
    const res = await fetch(`${BASE_URL}${pathname}`, {
      headers: {
        Accept: "image/webp,image/*,*/*",
        "User-Agent": "aoe2war-prewarm/1.0",
      },
    });

    const bytes = await res.arrayBuffer();
    const elapsed = Date.now() - startedAt;

    console.log(
      `${res.ok ? "ok" : "bad"} status=${res.status} ms=${elapsed} bytes=${bytes.byteLength} path=${pathname}`
    );

    return res.ok;
  } catch (error) {
    console.log(`error attempt=${attempt} path=${pathname} message=${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`== prewarm ${BASE_URL} ==`);

  for (let round = 1; round <= 2; round += 1) {
    console.log(`== round ${round} ==`);

    for (const url of urls) {
      let ok = await hit(url, 1);

      if (!ok) {
        await sleep(750);
        ok = await hit(url, 2);
      }

      await sleep(150);
    }
  }

  console.log("== prewarm done ==");
}

main().catch((error) => {
  console.error(error);
});
