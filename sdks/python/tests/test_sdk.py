from __future__ import annotations

import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lshorter import LShorter, LShorterError  # noqa: E402


class _MockApiState:
    requests: List[Tuple[str, str, str, Any]] = []


class _MockHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return

    def _read_json(self) -> Any:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return None
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _send_json(self, status: int, body: Dict[str, Any]) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _dispatch(self, method: str) -> None:
        auth = self.headers.get("Authorization", "")
        body = self._read_json()
        _MockApiState.requests.append((method, self.path, auth, body))

        if auth != "Bearer lsh_live_test":
            return self._send_json(401, {"success": False, "error": "Unauthorized", "code": "UNAUTHORIZED"})

        if method == "POST" and self.path == "/api/v1/links":
            return self._send_json(
                201,
                {
                    "success": True,
                    "data": {
                        "id": "link_01",
                        "slug": body.get("slug", "auto"),
                        "shortUrl": f"https://lsho.cc/{body.get('slug', 'auto')}",
                        "targetUrl": body["targetUrl"],
                    },
                },
            )
        if method == "GET" and self.path.startswith("/api/v1/links?"):
            return self._send_json(
                200,
                {
                    "success": True,
                    "data": [{"id": "link_01", "slug": "summer-2026"}],
                    "pagination": {"page": 1, "limit": 20, "total": 1},
                },
            )
        if method == "POST" and self.path == "/api/v1/track":
            return self._send_json(
                201,
                {
                    "success": True,
                    "data": {
                        "id": "conv_01",
                        "eventName": body["eventName"],
                        "amount": body["amount"],
                        "customerEmail": body.get("customerEmail"),
                    },
                },
            )
        if method == "GET" and self.path.startswith("/api/v1/analytics/export"):
            csv_raw = b"id,amount\nconv_01,49.99\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/csv")
            self.send_header("Content-Length", str(len(csv_raw)))
            self.end_headers()
            self.wfile.write(csv_raw)
            return
        if method == "GET" and self.path.startswith("/api/v1/analytics"):
            return self._send_json(200, {"success": True, "data": {"totalClicks": 120, "trackedRevenue": 499.0}})
        if method == "GET" and self.path == "/api/v1/pixels":
            return self._send_json(
                200,
                {"success": True, "data": {"pixels": [{"id": "px_1", "platform": "pinterest", "pixelId": "26123"}]}},
            )
        if method == "GET" and self.path == "/api/v1/webhooks":
            return self._send_json(
                200,
                {"success": True, "data": {"webhooks": [{"id": "wh_1", "url": "https://example.com/hook"}]}},
            )
        if method == "GET" and self.path == "/api/v1/targets":
            return self._send_json(
                200,
                {"success": True, "data": [{"id": "tgt_1", "metricType": "clicks", "targetValue": 500}]},
            )
        if method == "POST" and self.path == "/api/v1/domains/dom_1/verify":
            return self._send_json(
                200,
                {"success": True, "data": {"id": "dom_1", "domain": "go.brand.com", "status": "active", "message": "Verified"}},
            )
        return self._send_json(404, {"success": False, "error": "Not found", "code": "NOT_FOUND"})

    def do_GET(self) -> None:
        self._dispatch("GET")

    def do_POST(self) -> None:
        self._dispatch("POST")

    def do_PATCH(self) -> None:
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:
        self._dispatch("DELETE")


class LShorterPythonSdkTests(unittest.TestCase):
    server: HTTPServer
    thread: threading.Thread
    base_url: str

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = HTTPServer(("127.0.0.1", 0), _MockHandler)
        port = cls.server.server_address[1]
        cls.base_url = f"http://127.0.0.1:{port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self) -> None:
        _MockApiState.requests.clear()
        self.client = LShorter(api_key="lsh_live_test", base_url=self.base_url)

    def test_links_create_and_list(self) -> None:
        created = self.client.links.create({"targetUrl": "https://example.com/offer", "slug": "summer-2026"})
        self.assertEqual(created["id"], "link_01")
        self.assertEqual(created["shortUrl"], "https://lsho.cc/summer-2026")

        listed = self.client.links.list(page=1, limit=20)
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(len(listed["data"]), 1)

    def test_track_conversion_maps_customer(self) -> None:
        conv = self.client.track.conversion(
            event_name="purchase",
            amount=49.99,
            currency="EUR",
            link_id="link_01",
            customer={"id": "u1", "email": "alice@example.com", "name": "Alice"},
        )
        self.assertEqual(conv["id"], "conv_01")
        self.assertEqual(conv["customerEmail"], "alice@example.com")

    def test_analytics_and_csv_export(self) -> None:
        dash = self.client.analytics.dashboard(link_id="link_01")
        self.assertEqual(dash["totalClicks"], 120)
        csv_data = self.client.analytics.export_csv(link_id="link_01")
        self.assertIn("conv_01,49.99", csv_data)

    def test_domains_pixels_webhooks_notifications(self) -> None:
        verified = self.client.domains.verify("dom_1")
        self.assertEqual(verified["status"], "active")

        pixels = self.client.pixels.list()
        self.assertEqual(pixels[0]["platform"], "pinterest")

        webhooks = self.client.webhooks.list()
        self.assertEqual(webhooks[0]["id"], "wh_1")

        target = self.client.targets.get("tgt_1")
        self.assertEqual(target["targetValue"], 500)

    def test_dashboard_only_creates_raise_403(self) -> None:
        for fn in (self.client.webhooks.create, self.client.pixels.create, self.client.notifications.create):
            with self.assertRaises(LShorterError) as ctx:
                fn()
            self.assertEqual(ctx.exception.status, 403)

    def test_unauthorized_raises_typed_error(self) -> None:
        bad = LShorter(api_key="lsh_live_wrong", base_url=self.base_url)
        with self.assertRaises(LShorterError) as ctx:
            bad.links.list()
        self.assertEqual(ctx.exception.status, 401)
        self.assertEqual(ctx.exception.code, "UNAUTHORIZED")


if __name__ == "__main__":
    unittest.main()
