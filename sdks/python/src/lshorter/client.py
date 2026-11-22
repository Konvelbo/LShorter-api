from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Mapping, Optional, Union

from .errors import LShorterError

DEFAULT_BASE_URL = "https://lshorter-api.fiatechnologiecam.workers.dev"


def _normalize_base_url(base_url: Optional[str]) -> str:
    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    if base in ("https://lsho.cc", "https://api.lsho.cc"):
        return DEFAULT_BASE_URL
    return base


class HttpClient:
    """Zero-dependency HTTP client backed by Python's standard library."""

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = 15.0,
    ) -> None:
        if not api_key or not api_key.strip():
            raise ValueError("api_key is required")
        self.api_key = api_key.strip()
        self.base_url = _normalize_base_url(base_url)
        self.timeout = timeout

    def _build_url(
        self,
        path: str,
        params: Optional[Mapping[str, Any]] = None,
    ) -> str:
        url = f"{self.base_url}{path}"
        if params:
            filtered = {k: str(v) for k, v in params.items() if v is not None}
            if filtered:
                url = f"{url}?{urllib.parse.urlencode(filtered)}"
        return url

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Mapping[str, Any]] = None,
        params: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        url = self._build_url(path, params)
        headers: Dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "User-Agent": "lshorter-python/1.0.0",
        }
        data: Optional[bytes] = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status = resp.status
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            status = exc.code
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                err_json = json.loads(raw)
                raise LShorterError(
                    err_json.get("error") or f"HTTP {status}",
                    status=status,
                    code=err_json.get("code"),
                ) from exc
            except LShorterError:
                raise
            except Exception:
                raise LShorterError(raw or f"HTTP {status}", status=status) from exc
        except urllib.error.URLError as exc:
            raise LShorterError(f"Network error: {exc.reason}", status=0, code="NETWORK_ERROR") from exc

        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise LShorterError(f"Invalid JSON response: {exc}", status=status) from exc

        if not isinstance(payload, dict) or not payload.get("success", False):
            msg = payload.get("error") if isinstance(payload, dict) else None
            code = payload.get("code") if isinstance(payload, dict) else None
            raise LShorterError(msg or f"HTTP {status}", status=status, code=code)

        if "pagination" in payload and isinstance(payload.get("data"), list):
            return {
                "data": payload["data"],
                "pagination": payload["pagination"],
            }
        return payload.get("data")

    def request_text(
        self,
        method: str,
        path: str,
        params: Optional[Mapping[str, Any]] = None,
    ) -> str:
        url = self._build_url(path, params)
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "lshorter-python/1.0.0",
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            status = exc.code
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                err_json = json.loads(raw)
                raise LShorterError(
                    err_json.get("error") or f"HTTP {status}",
                    status=status,
                    code=err_json.get("code"),
                ) from exc
            except LShorterError:
                raise
            except Exception:
                raise LShorterError(raw or f"HTTP {status}", status=status) from exc
        except urllib.error.URLError as exc:
            raise LShorterError(f"Network error: {exc.reason}", status=0, code="NETWORK_ERROR") from exc

    def get(self, path: str, params: Optional[Mapping[str, Any]] = None) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, body: Mapping[str, Any]) -> Any:
        return self.request("POST", path, body=body)

    def patch(self, path: str, body: Mapping[str, Any]) -> Any:
        return self.request("PATCH", path, body=body)

    def delete(self, path: str) -> Any:
        return self.request("DELETE", path)


class LinksResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, payload: Mapping[str, Any]) -> Dict[str, Any]:
        return self._http.post("/api/v1/links", payload)

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self._http.get("/api/v1/links", {"page": page, "limit": limit})

    def get(self, link_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/v1/links/{urllib.parse.quote(link_id, safe='')}")

    def update(self, link_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        return self._http.patch(f"/api/v1/links/{urllib.parse.quote(link_id, safe='')}", payload)

    def delete(self, link_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/v1/links/{urllib.parse.quote(link_id, safe='')}")


class TrackResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def conversion(
        self,
        *,
        event_name: str,
        link_id: str,
        amount: float = 0.0,
        currency: str = "EUR",
        click_id: Optional[str] = None,
        customer: Optional[Mapping[str, Any]] = None,
        customer_id: Optional[str] = None,
        customer_email: Optional[str] = None,
        customer_name: Optional[str] = None,
        customer_avatar: Optional[str] = None,
    ) -> Dict[str, Any]:
        cust = customer or {}
        payload: Dict[str, Any] = {
            "eventName": event_name,
            "amount": amount,
            "currency": currency,
            "customerId": customer_id or cust.get("id") or "usr_anon",
            "linkId": link_id,
            "clickId": click_id,
        }
        email = customer_email or cust.get("email")
        name = customer_name or cust.get("name") or cust.get("fullName")
        avatar = customer_avatar or cust.get("avatarUrl") or cust.get("avatar")
        if email is not None:
            payload["customerEmail"] = email
        if name is not None:
            payload["customerName"] = name
        if avatar is not None:
            payload["customerAvatar"] = avatar
        return self._http.post("/api/v1/track", payload)

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        link_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._http.get(
            "/api/v1/track",
            {"page": page, "limit": limit, "linkId": link_id},
        )


class AnalyticsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def dashboard(
        self,
        *,
        link_id: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._http.get(
            "/api/v1/analytics",
            {"linkId": link_id, "from": from_date, "to": to_date},
        )

    def top(self, *, link_id: Optional[str] = None) -> Dict[str, Any]:
        return self._http.get("/api/v1/analytics/top", {"linkId": link_id})

    def export_csv(self, *, link_id: Optional[str] = None) -> str:
        return self._http.request_text("GET", "/api/v1/analytics/export", {"linkId": link_id})

    def links(self, *, limit: Optional[int] = None) -> List[Any]:
        return self._http.get("/api/v1/analytics/links", {"limit": limit})


class DomainsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, domain: str) -> Dict[str, Any]:
        return self._http.post("/api/v1/domains", {"domain": domain})

    def list(self) -> List[Any]:
        return self._http.get("/api/v1/domains")

    def get(self, domain_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/v1/domains/{urllib.parse.quote(domain_id, safe='')}")

    def verify(self, domain_id: str) -> Dict[str, Any]:
        return self._http.post(
            f"/api/v1/domains/{urllib.parse.quote(domain_id, safe='')}/verify",
            {},
        )

    def delete(self, domain_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/v1/domains/{urllib.parse.quote(domain_id, safe='')}")


class WebhooksResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, *_args: Any, **_kwargs: Any) -> None:
        raise LShorterError(
            "Creating webhooks via the SDK is disabled. Please configure your webhooks from the LShorter Dashboard (Settings > Webhooks).",
            status=403,
        )

    def list(self) -> List[Dict[str, Any]]:
        res = self._http.get("/api/v1/webhooks")
        if isinstance(res, dict) and isinstance(res.get("webhooks"), list):
            return res["webhooks"]
        return res if isinstance(res, list) else []

    def get(self, webhook_id: str) -> Dict[str, Any]:
        res = self._http.get(f"/api/v1/webhooks/{urllib.parse.quote(webhook_id, safe='')}")
        return res["webhook"] if isinstance(res, dict) and "webhook" in res else res

    def update(self, webhook_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        res = self._http.patch(
            f"/api/v1/webhooks/{urllib.parse.quote(webhook_id, safe='')}",
            payload,
        )
        return res["webhook"] if isinstance(res, dict) and "webhook" in res else res

    def delete(self, webhook_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/v1/webhooks/{urllib.parse.quote(webhook_id, safe='')}")


class PixelsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, *_args: Any, **_kwargs: Any) -> None:
        raise LShorterError(
            "Creating retargeting pixels via the SDK is disabled. Please register your pixels from the LShorter Dashboard (Settings > Retargeting Pixels).",
            status=403,
        )

    def list(self) -> List[Dict[str, Any]]:
        res = self._http.get("/api/v1/pixels")
        if isinstance(res, dict) and isinstance(res.get("pixels"), list):
            return res["pixels"]
        return res if isinstance(res, list) else []

    def get(self, pixel_id: str) -> Dict[str, Any]:
        res = self._http.get(f"/api/v1/pixels/{urllib.parse.quote(pixel_id, safe='')}")
        return res["pixel"] if isinstance(res, dict) and "pixel" in res else res

    def update(self, pixel_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        res = self._http.patch(
            f"/api/v1/pixels/{urllib.parse.quote(pixel_id, safe='')}",
            payload,
        )
        return res["pixel"] if isinstance(res, dict) and "pixel" in res else res

    def delete(self, pixel_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/v1/pixels/{urllib.parse.quote(pixel_id, safe='')}")


class NotificationsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, *_args: Any, **_kwargs: Any) -> None:
        raise LShorterError(
            "Creating target alerts and notifications via the SDK is disabled. Notifications must be configured directly from the LShorter Dashboard (Settings > Notifications).",
            status=403,
        )

    create_target = create

    def list(self) -> List[Dict[str, Any]]:
        res = self._http.get("/api/v1/targets")
        if isinstance(res, list):
            return res
        if isinstance(res, dict) and isinstance(res.get("data"), list):
            return res["data"]
        return []

    def get(self, alert_id: str) -> Dict[str, Any]:
        for alert in self.list():
            if alert.get("id") == alert_id:
                return alert
        raise LShorterError("Target alert not found", status=404)


class LShorter:
    """Official LShorter Python SDK client."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: Optional[str] = None,
        timeout: float = 15.0,
    ) -> None:
        self._http = HttpClient(api_key=api_key, base_url=base_url, timeout=timeout)
        self.links = LinksResource(self._http)
        self.track = TrackResource(self._http)
        self.analytics = AnalyticsResource(self._http)
        self.domains = DomainsResource(self._http)
        self.webhooks = WebhooksResource(self._http)
        self.pixels = PixelsResource(self._http)
        self.notifications = NotificationsResource(self._http)
        self.targets = self.notifications

    def __enter__(self) -> "LShorter":
        return self

    def __exit__(self, *_args: Union[object, None]) -> None:
        return None


QuickLink = LShorter
