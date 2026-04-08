import { handleCounterfactualAdvisorApi } from "../server/counterfactualAdvisorApi";

export default async function handler(request: any, response: any): Promise<void> {
  const result = await handleCounterfactualAdvisorApi({
    method: request.method,
    headers: request.headers,
    bodyText: JSON.stringify(request.body ?? {}),
    remoteAddress: request.socket?.remoteAddress,
  });

  response.status(result.status).setHeader("Cache-Control", "no-store").json(result.body);
}
