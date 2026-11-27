"""Members and routines APIs: CRUD, limits and ownership (user A vs user B)."""

import uuid

import pytest

from app.services.family import MAX_MEMBERS_PER_USER, MAX_ROUTINES_PER_MEMBER
from tests.integration.conftest import new_user

pytestmark = pytest.mark.integration

PRIYA = {"name": "Priya", "age": 34, "conditions": ["asthma"]}
WALK = {"activity": "morning walk", "start_time": "06:30", "days_of_week": ["mon", "tue", "wed", "thu", "fri"]}


def test_member_crud(client):
    _, h = new_user(client)
    created = client.post("/members", headers=h, json=PRIYA)
    assert created.status_code == 201
    member = created.json()
    assert member["conditions"] == ["asthma"] and member["sensitivity"] == 1.0
    mid = member["id"]

    assert [m["id"] for m in client.get("/members", headers=h).json()] == [mid]
    assert client.get(f"/members/{mid}", headers=h).json()["name"] == "Priya"

    updated = client.patch(f"/members/{mid}", headers=h, json={"age": 35, "conditions": ["asthma", "diabetes"]})
    assert updated.status_code == 200 and updated.json()["age"] == 35
    assert updated.json()["name"] == "Priya"  # omitted field unchanged

    assert client.delete(f"/members/{mid}", headers=h).status_code == 204
    assert client.get(f"/members/{mid}", headers=h).status_code == 404


def test_routine_crud(client):
    _, h = new_user(client)
    mid = client.post("/members", headers=h, json=PRIYA).json()["id"]
    created = client.post(f"/members/{mid}/routines", headers=h, json=WALK)
    assert created.status_code == 201
    rid = created.json()["id"]
    assert created.json()["member_id"] == mid

    assert [r["id"] for r in client.get(f"/members/{mid}/routines", headers=h).json()] == [rid]
    patched = client.patch(f"/members/{mid}/routines/{rid}", headers=h, json={"start_time": "07:00"})
    assert patched.json()["start_time"] == "07:00:00" and patched.json()["activity"] == "morning walk"
    assert client.delete(f"/members/{mid}/routines/{rid}", headers=h).status_code == 204
    assert client.get(f"/members/{mid}/routines/{rid}", headers=h).status_code == 404


def test_validation_and_mass_assignment(client):
    _, h = new_user(client)
    assert client.post("/members", headers=h, json={**PRIYA, "age": 121}).status_code == 422
    assert client.post("/members", headers=h, json={**PRIYA, "user_id": str(uuid.uuid4())}).status_code == 422
    mid = client.post("/members", headers=h, json=PRIYA).json()["id"]
    bad_days = client.post(f"/members/{mid}/routines", headers=h, json={**WALK, "days_of_week": ["funday"]})
    assert bad_days.status_code == 422
    assert client.post(f"/members/{mid}/routines", headers=h, json={**WALK, "member_id": mid}).status_code == 422
    assert client.get("/members/not-a-uuid", headers=h).status_code == 422


def test_member_limit(client):
    _, h = new_user(client)
    for i in range(MAX_MEMBERS_PER_USER):
        assert client.post("/members", headers=h, json={"name": f"Member {i}", "age": 30}).status_code == 201
    over = client.post("/members", headers=h, json={"name": "One too many", "age": 30})
    assert over.status_code == 409 and str(MAX_MEMBERS_PER_USER) in over.json()["detail"]


def test_routine_limit(client):
    _, h = new_user(client)
    mid = client.post("/members", headers=h, json=PRIYA).json()["id"]
    for i in range(MAX_ROUTINES_PER_MEMBER):
        r = client.post(f"/members/{mid}/routines", headers=h, json={**WALK, "activity": f"routine {i}"})
        assert r.status_code == 201
    assert client.post(f"/members/{mid}/routines", headers=h, json=WALK).status_code == 409


def test_all_member_routes_require_authentication(client):
    mid = uuid.uuid4()
    for method, path in [("get", "/members"), ("post", "/members"), ("get", f"/members/{mid}"),
                         ("get", f"/members/{mid}/routines"), ("get", f"/members/{mid}/risk"), ("get", "/family/risk")]:
        assert getattr(client, method)(path).status_code == 401, path


def test_user_b_cannot_read_edit_or_delete_user_a_data(client):
    _, a = new_user(client)
    _, b = new_user(client)
    client.patch("/me", headers=b, json={"home_lat": 28.61, "home_lon": 77.21})
    a_member = client.post("/members", headers=a, json=PRIYA).json()["id"]
    a_routine = client.post(f"/members/{a_member}/routines", headers=a, json=WALK).json()["id"]
    b_member = client.post("/members", headers=b, json={"name": "B's member", "age": 40}).json()["id"]

    forbidden = [
        ("get", f"/members/{a_member}", None),
        ("patch", f"/members/{a_member}", {"age": 99}),
        ("delete", f"/members/{a_member}", None),
        ("get", f"/members/{a_member}/routines", None),
        ("post", f"/members/{a_member}/routines", WALK),
        ("get", f"/members/{a_member}/routines/{a_routine}", None),
        ("patch", f"/members/{a_member}/routines/{a_routine}", {"activity": "hijacked"}),
        ("delete", f"/members/{a_member}/routines/{a_routine}", None),
        # A's routine addressed through B's own member id
        ("get", f"/members/{b_member}/routines/{a_routine}", None),
        ("delete", f"/members/{b_member}/routines/{a_routine}", None),
        ("get", f"/members/{a_member}/risk", None),
        ("get", f"/members/{a_member}/risk/hourly", None),
    ]
    for method, path, body in forbidden:
        kwargs = {"headers": b} | ({"json": body} if body is not None else {})
        r = getattr(client, method)(path, **kwargs)
        assert r.status_code == 404, (method, path, r.status_code)
        assert "Priya" not in r.text

    # Same 404 as a member that does not exist at all (no information leak).
    assert client.get(f"/members/{uuid.uuid4()}", headers=b).json() == client.get(f"/members/{a_member}", headers=b).json()

    # B's lists never include A's data; A's data is untouched.
    assert [m["id"] for m in client.get("/members", headers=b).json()] == [b_member]
    assert client.get(f"/members/{a_member}", headers=a).json()["age"] == 34
    assert client.get(f"/members/{a_member}/routines/{a_routine}", headers=a).json()["activity"] == "morning walk"
    family = client.get("/family/risk", headers=b).json()
    assert [card["member_id"] for card in family["members"]] == [b_member]
