/**
 * VPN / proxy / hosting detection via proxycheck.io
 * https://proxycheck.io/api/
 */
export async function inspectIp(ip) {
  const key = process.env.PROXYCHECK_API_KEY || "";
  const params = new URLSearchParams({
    vpn: "1",
    asn: "1",
    risk: "1",
    tag: "umbrella-verification",
  });
  if (key) params.set("key", key);

  const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `lookup_http_${res.status}` };
    }
    const data = await res.json();
    if (data.status === "denied" || data.status === "error") {
      return { ok: false, error: data.message || data.status };
    }

    const info = data[ip] || {};
    const proxy = String(info.proxy || "no").toLowerCase() === "yes";
    const type = String(info.type || "").toUpperCase();
    const risk = Number(info.risk || 0);

    const blockedTypes = new Set([
      "VPN",
      "PUB",
      "WEB",
      "SOCKS",
      "SOCKS4",
      "SOCKS5",
      "HTTP",
      "HTTPS",
      "TOR",
      "COMPROMISED",
    ]);

    const isVpnOrProxy = proxy || blockedTypes.has(type) || risk >= 66;

    return {
      ok: true,
      isVpnOrProxy,
      type: type || (proxy ? "PROXY" : "RESIDENTIAL"),
      risk,
      provider: info.provider || info.organisation || info.org || null,
      country: info.isoname || info.country || null,
      raw: info,
    };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

export function vpnFailClosed() {
  return String(process.env.VPN_FAIL_MODE || "closed").toLowerCase() !== "open";
}
