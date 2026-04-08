import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { handleAiBriefingApi } from "./server/aiBriefingApi";
import { handleCounterfactualAdvisorApi } from "./server/counterfactualAdvisorApi";

function readBody(request: { on: (event: string, handler: (chunk?: Uint8Array | string) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on("data", (chunk?: Uint8Array | string) => {
      if (!chunk) {
        return;
      }
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => reject(new Error("Unable to read request body")));
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: "counterfactual-advisor-dev-api",
        configureServer(server) {
          server.middlewares.use("/api/ai-briefing", async (request, response, next) => {
            if (request.url && !request.url.startsWith("/api/ai-briefing")) {
              next();
              return;
            }

            try {
              const result = await handleAiBriefingApi({
                method: request.method,
                headers: request.headers as Record<string, string | string[] | undefined>,
                bodyText: await readBody(request),
                remoteAddress: request.socket.remoteAddress,
              });

              response.statusCode = result.status;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.setHeader("Cache-Control", "no-store");
              response.end(JSON.stringify(result.body));
            } catch {
              response.statusCode = 500;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "AI briefing proxy failed" }));
            }
          });

          server.middlewares.use("/api/counterfactual-advisor", async (request, response, next) => {
            if (request.url && !request.url.startsWith("/api/counterfactual-advisor")) {
              next();
              return;
            }

            try {
              const result = await handleCounterfactualAdvisorApi({
                method: request.method,
                headers: request.headers as Record<string, string | string[] | undefined>,
                bodyText: await readBody(request),
                remoteAddress: request.socket.remoteAddress,
              });

              response.statusCode = result.status;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.setHeader("Cache-Control", "no-store");
              response.end(JSON.stringify(result.body));
            } catch {
              response.statusCode = 500;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "Advisor proxy failed" }));
            }
          });
        },
      },
    ],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
    },
  };
});
