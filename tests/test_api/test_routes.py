import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_requires_auth(client):
    """POST /chat nằm sau get_current_user nên request không token bị chặn ngay.

    Test này trước đây gửi query rỗng và mong 422. Từ khi thêm JWT auth,
    dependency xác thực chạy TRƯỚC khi Pydantic soi body, nên 401 mới là hành vi
    đúng. Muốn kiểm tra ràng buộc body thì cần một client đã đăng nhập —
    conftest hiện chưa có fixture đó.
    """
    response = await client.post("/api/v1/chat", json={"query": "", "patient_id": "test"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_agent_status(client):
    response = await client.get("/api/v1/status")
    assert response.status_code == 200
