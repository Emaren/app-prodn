// app/api/parsed_replays/route.js

export async function GET(request) {
    return new Response(JSON.stringify({ message: "Parsed replays endpoint" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  