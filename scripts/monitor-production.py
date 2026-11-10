#!/usr/bin/env python3
"""Read-only production smoke monitoring. No credentials, cookies, form submits or binaries."""
import argparse
import json
import sys
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ORIGIN = "https://humperdinck.studio"
USER_AGENT = "Humperdinck-Production-Monitor/1.0"

class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = False
        self.title_text = ""
        self.canonical = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "title":
            self.title = True
        if tag == "link" and d.get("rel") == "canonical":
            self.canonical.append(d.get("href"))
    def handle_endtag(self, tag):
        if tag == "title":
            self.title = False
    def handle_data(self, data):
        if self.title:
            self.title_text += data

def read(path, *, open_fn=urlopen):
    request = Request(ORIGIN + path, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
    try:
        with open_fn(request, timeout=12) as response:
            # Limit response memory and external response surprises.
            data = response.read(128_001)
            if len(data) > 128_000:
                raise ValueError("Body exceeded bounded monitoring size")
            return response.status, response.headers, data
    except HTTPError as error:
        return error.code, error.headers, error.read(1024)

def monitor(*, read_fn=read):
    checks = []
    def record(name, condition, detail):
        checks.append({"name": name, "pass": bool(condition), "detail": detail})

    for path in ("/", "/help/", "/account/"):
        try:
            status, headers, body = read_fn(path)
            parser = Head()
            parser.feed(body.decode("utf-8", "replace"))
            canonical = ORIGIN + path
            record("public:" + path, status == 200 and bool(parser.title_text.strip()) and
                   parser.canonical == [canonical] if path != "/account/" else status == 200 and bool(parser.title_text.strip()),
                   "HTTP " + str(status) + "; title=" + ("yes" if parser.title_text.strip() else "no") +
                   ("; canonical=" + ("ok" if parser.canonical == [canonical] else "missing/mismatch") if path != "/account/" else ""))
        except (OSError, ValueError, URLError, TimeoutError) as exc:
            record("public:" + path, False, type(exc).__name__)

    for path in ("/sitemap.xml", "/robots.txt"):
        try:
            status, _, body = read_fn(path)
            expected = b"<urlset" if path.endswith(".xml") else b"Sitemap: https://humperdinck.studio/sitemap.xml"
            record("search:" + path, status == 200 and expected in body, "HTTP " + str(status))
        except (OSError, ValueError, URLError, TimeoutError) as exc:
            record("search:" + path, False, type(exc).__name__)

    for path, kind in (("/downloads.json", "downloads"), ("/updates/latest.json", "updater")):
        try:
            status, _, body = read_fn(path)
            payload = json.loads(body)
            valid = isinstance(payload, dict)
            if kind == "downloads":
                valid &= all(isinstance(payload.get(p), dict) for p in ("windows", "macos", "linux"))
            else:
                valid &= isinstance(payload.get("version"), str) and isinstance(payload.get("platforms"), dict)
            record("distribution:" + kind, status == 200 and valid, "HTTP " + str(status) + "; valid catalog=" + str(bool(valid)))
        except (OSError, ValueError, json.JSONDecodeError, URLError, TimeoutError) as exc:
            record("distribution:" + kind, False, type(exc).__name__)

    try:
        status, headers, body = read_fn("/api/account/dashboard/analytics")
        # The private analytics route MUST NOT leak data when unauthenticated.
        record("security:anonymous-analytics", status in (401, 404),
               "HTTP " + str(status) + "; expected 401 or 404")
    except (OSError, ValueError, URLError, TimeoutError) as exc:
        record("security:anonymous-analytics", False, type(exc).__name__)

    try:
        status, _, body = read_fn("/.well-known/humperdinck-deployment.json")
        payload = json.loads(body)
        record("deployment:provenance", status == 200 and payload.get("provenance_verified") is True and
               isinstance(payload.get("source_git_sha"), str) and len(payload["source_git_sha"]) == 40,
               "HTTP " + str(status) + "; verified=" + str(payload.get("provenance_verified")))
    except (OSError, ValueError, json.JSONDecodeError, URLError, TimeoutError) as exc:
        record("deployment:provenance", False, type(exc).__name__)
    return {"result": "PASS" if all(x["pass"] for x in checks) else "FAIL", "checks": checks,
            "privacy": "No cookies, tokens, customer data, audio or local scripts were requested."}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = monitor()
    print(json.dumps(result, indent=2) if args.json else
          "\n".join(f'{"PASS" if c["pass"] else "FAIL"} {c["name"]}: {c["detail"]}' for c in result["checks"]))
    return 0 if result["result"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
