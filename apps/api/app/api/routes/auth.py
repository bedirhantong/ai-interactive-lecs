from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.cookies import clear_session_cookie, set_session_cookie
from app.api.deps import AuthSvc, SessionCtx, SettingsDep, client_ip
from app.api.schemas.auth import DemoIn, LoginIn, LogoutOut, PasswordChangeIn, SessionOut, UserOut
from app.core.responses import ERROR_RESPONSES, ApiResponse, ok
from app.models import Role
from app.services.auth import IssuedSession

router = APIRouter(prefix="/auth", tags=["auth"], responses=ERROR_RESPONSES)
ClientIP = Annotated[str, Depends(client_ip)]


def _session_out(issued: IssuedSession) -> SessionOut:
    return SessionOut(user=UserOut.of(issued.user), expires_at=issued.expires_at)


@router.post("/login", response_model=ApiResponse[SessionOut], summary="E-posta (öğretmen) ya da kullanıcı adı (öğrenci) ile giriş")
def login(body: LoginIn, auth: AuthSvc, settings: SettingsDep, ip: ClientIP, response: Response):
    """Rate limited per account and per IP. If `user.must_change_password` is true, call `/auth/password` next."""
    issued = auth.login(body.login, body.password, ip)
    set_session_cookie(response, issued, settings)
    return ok(_session_out(issued))


@router.post("/demo", response_model=ApiResponse[SessionOut], status_code=status.HTTP_201_CREATED, summary="Demo hesabı (yalnızca demo modunda)")
def demo(body: DemoIn, auth: AuthSvc, settings: SettingsDep, ip: ClientIP, response: Response):
    issued = auth.start_demo(Role(body.role), ip)
    set_session_cookie(response, issued, settings)
    return ok(_session_out(issued))


@router.get("/me", response_model=ApiResponse[UserOut], summary="Oturumdaki kullanıcı")
def me(ctx: SessionCtx):
    return ok(UserOut.of(ctx.user))


@router.post("/password", response_model=ApiResponse[SessionOut], summary="Şifre değiştir (tüm cihazlardan çıkış yapılır)")
def change_password(body: PasswordChangeIn, ctx: SessionCtx, auth: AuthSvc, settings: SettingsDep, response: Response):
    issued = auth.change_password(ctx, body.current_password, body.new_password)
    set_session_cookie(response, issued, settings)
    return ok(_session_out(issued))


@router.post("/logout", response_model=ApiResponse[LogoutOut], summary="Bu cihazdan çıkış")
def logout(ctx: SessionCtx, auth: AuthSvc, response: Response):
    auth.logout(ctx)
    clear_session_cookie(response)
    return ok(LogoutOut(sessions_ended=1))


@router.post("/logout-all", response_model=ApiResponse[LogoutOut], summary="Tüm cihazlardan çıkış")
def logout_all(ctx: SessionCtx, auth: AuthSvc, response: Response):
    count = auth.logout_everywhere(ctx)
    clear_session_cookie(response)
    return ok(LogoutOut(sessions_ended=count))
