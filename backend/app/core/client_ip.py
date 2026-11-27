"""Which client IP to rate-limit (docs/auth.md §3).

The direct peer address is used, UNLESS the peer is a trusted reverse proxy
(TRUSTED_PROXIES, e.g. the Vite dev proxy on localhost or the hosting platform's
proxy). Only then is X-Forwarded-For read, from the right: each trusted proxy
appended the address it received the request from, so the right-most address
that is NOT a trusted proxy is the real client. Anything further left was
written by the client itself and could be forged, so it is never used.
"""

from collections.abc import Iterable, Sequence
from ipaddress import IPv4Address, IPv6Address, ip_address

from app.core.config import IPNetwork

UNKNOWN_CLIENT = "unknown"
IPAddress = IPv4Address | IPv6Address


def _parse(value: str | None) -> IPAddress | None:
    if not value:
        return None
    try:
        address = ip_address(value.strip())
    except ValueError:
        return None
    # Node/Vite often reports IPv4 clients as IPv4-mapped IPv6 (::ffff:127.0.0.1).
    if isinstance(address, IPv6Address) and address.ipv4_mapped is not None:
        return address.ipv4_mapped
    return address


def _is_trusted(address: IPAddress, trusted: Sequence[IPNetwork]) -> bool:
    return any(address.version == network.version and address in network for network in trusted)


def resolve_client_ip(peer: str | None, forwarded_for: Iterable[str], trusted: Sequence[IPNetwork]) -> str:
    """Client IP for rate limiting.

    peer: the TCP peer address (request.client.host)
    forwarded_for: every X-Forwarded-For header value, in order
    trusted: networks whose X-Forwarded-For may be believed
    """
    current = _parse(peer)
    if current is None:
        return peer or UNKNOWN_CLIENT
    if not _is_trusted(current, trusted):
        return str(current)  # direct client, or an untrusted proxy: ignore its header

    hops = [hop.strip() for header in forwarded_for for hop in header.split(",") if hop.strip()]
    for hop in reversed(hops):
        address = _parse(hop)
        if address is None:
            break  # garbage in the chain: stop at the last address we could trust
        if not _is_trusted(address, trusted):
            return str(address)
        current = address
    return str(current)
