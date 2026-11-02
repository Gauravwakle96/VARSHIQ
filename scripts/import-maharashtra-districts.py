"""Reproduce the bounded official directory under the portal Copyright Policy.

No district photos, village enumerations or assumed geographic coordinates.
"""
import hashlib
import http.cookiejar
import json
import re
import urllib.request
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path

SOURCE = "https://maharashtra.gov.in/Site/1529/Districts"
POLICY = "https://maharashtra.gov.in/Site/1383/Disclaimer-and-Policies"
ALIASES = {
    "Chhatrapati Sambhaji Nagar": ("Chhatrapati Sambhajinagar", ["Chhatrapati Sambhaji Nagar", "Aurangabad", "CSN"]),
    "Ahilyanagar": ("Ahilyanagar", ["Ahmednagar"]),
    "Dharashiv": ("Dharashiv", ["Osmanabad"]),
}


class DirectoryParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.division = ""
        self.heading = False
        self.anchor = None
        self.in_span = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "h3":
            self.heading = True
            self.division = ""
        if tag == "a":
            self.anchor = {"official_website": attributes.get("href", ""), "source_name": "", "district": False}
        if tag == "img" and self.anchor is not None and attributes.get("alt", "").endswith("District"):
            self.anchor["district"] = True
        if tag == "span" and self.anchor and self.anchor["district"]:
            self.in_span = True

    def handle_data(self, data):
        if self.heading:
            self.division += data.strip()
        if self.in_span and self.anchor:
            self.anchor["source_name"] += data.strip()

    def handle_endtag(self, tag):
        if tag == "h3":
            self.heading = False
        if tag == "span":
            self.in_span = False
        if tag == "a" and self.anchor:
            if self.anchor["district"]:
                original = self.anchor["source_name"]
                name, aliases = ALIASES.get(original, (original, []))
                self.rows.append({"id": "IN-MH-" + re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-"),
                                  "name": name, "source_name": original, "aliases": aliases,
                                  "division": self.division, "official_website": self.anchor["official_website"]})
            self.anchor = None


def main():
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    opener.addheaders = [("User-Agent", "VARSHIQ-directory-import/0.1 (https://github.com/Gauravwakle96/VARSHIQ)")]
    opener.open("https://maharashtra.gov.in/HeaderMain/ChangeCurrentCulture/1", timeout=30).read()
    html = opener.open(SOURCE, timeout=30).read()
    parser = DirectoryParser()
    parser.feed(html.decode("utf-8"))
    names = {row["name"] for row in parser.rows}
    if len(parser.rows) != 36 or len(names) != 36 or not {"Chhatrapati Sambhajinagar", "Ahilyanagar", "Dharashiv"} <= names:
        raise ValueError("Official directory structure/count/names changed; review before replacing the licensed extract")
    payload = {"districts": sorted(parser.rows, key=lambda row: row["name"]), "source": SOURCE,
               "licence": "Government of Maharashtra portal Copyright Policy: accurate, nonmisleading reproduction with prominent acknowledgement; third-party assets excluded",
               "policy_url": POLICY, "retrieved_at": datetime.now(UTC).isoformat(),
               "source_sha256": hashlib.sha256(html).hexdigest(),
               "limitations": ["Directory names and official website links only; no district boundaries, coordinates or village records.",
                               "Directory IDs are VARSHIQ identifiers, not official LGD/administrative boundary IDs."]}
    target = Path(__file__).resolve().parents[1] / "backend" / "app" / "data" / "maharashtra-districts.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Imported {len(parser.rows)} official district entries with source and reuse-policy attribution")


if __name__ == "__main__":
    main()
