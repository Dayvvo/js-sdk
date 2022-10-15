import fetch from "node-fetch";
import type { RequestInfo, RequestInit, Response, Headers } from "node-fetch";
import { buildQueryString } from "./utils";
import {
  AuthClient,
} from "./types";

const BASE_URL = "https://api.getalby.com";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  auth?: AuthClient;
  endpoint: string;
  params?: Record<string, any>;
  request_body?: Record<string, any>;
  method?: string;
  max_retries?: number;
  base_url?: string;
}

async function fetchWithRetries(
  url: RequestInfo,
  init: RequestInit,
  max_retries = 0
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 && max_retries > 0) {
    const rateLimitReset = Number(res.headers.get("x-rate-limit-reset"));
    const rateLimitRemaining = Number(res.headers.get("x-rate-limit-remaining"));
    const timeTillReset = rateLimitReset * 1000 - Date.now();
    let timeToWait = 1000;
    if (rateLimitRemaining === 0)
      timeToWait = timeTillReset;
    await new Promise((resolve) => setTimeout(resolve, timeToWait));
    return fetchWithRetries(url, init, max_retries - 1);
  }
  return res;
}

class AlbyResponseError extends Error {
  status: number;
  statusText: string;
  headers: Record<string, any>;
  error: Record<string, any>;
  constructor(
    status: number,
    statusText: string,
    headers: Headers,
    error: Record<string, any>
  ) {
    super();
    this.status = status;
    this.statusText = statusText;
    this.headers = Object.fromEntries(headers);
    this.error = error;
  }
}

export async function request({
  auth,
  endpoint,
  params: query = {},
  request_body,
  method,
  max_retries,
  base_url = BASE_URL,
  headers,
  ...options
}: RequestOptions): Promise<Response> {
  const url = new URL(base_url + endpoint);
  url.search = buildQueryString(query);
  const isPost = method === "POST" && !!request_body;
  const authHeader = auth
    ? await auth.getAuthHeader(url.href, method)
    : undefined;
  const response = await fetchWithRetries(
    url.toString(),
    {
      headers: {
        ...(isPost
          ? { "Content-Type": "application/json; charset=utf-8" }
          : undefined),
        ...authHeader,
        ...headers,
      },
      method,
      body: isPost ? JSON.stringify(request_body) : undefined,
      timeout: 120000,
      ...options,
    },
    max_retries
  );
  if (!response.ok) {
    const error = await response.json();
    throw new AlbyResponseError(
      response.status,
      response.statusText,
      response.headers,
      error
    );
  }
  return response;
}

export async function rest<T = Record<string, any>>(
  args: RequestOptions
): Promise<T> {
  const response = await request(args);
  return response.json();
}
