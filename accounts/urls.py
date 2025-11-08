from django.urls import path, reverse_lazy
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.contrib.auth import views as auth_views
from .views import RegisterView, logout_get
from .forms import StrictPasswordResetForm  # nếu có

urlpatterns = [
    # ==== JWT API (Postman / Mobile) ====
    path("api/login/", TokenObtainPairView.as_view(), name="jwt-login"),
    path("api/refresh/", TokenRefreshView.as_view(), name="jwt-refresh"),
    path("api/register/", RegisterView.as_view(), name="jwt-register"),

    # ==== UI (web người dùng) ====
    path("logout/", logout_get, name="logout"),

    # ==== Password Reset ====
    path(
        "password_reset/",
        auth_views.PasswordResetView.as_view(
            form_class=StrictPasswordResetForm,  # nếu có
            template_name="registration/password_reset_form.html",
            email_template_name="registration/password_reset_email.txt",
            subject_template_name="registration/password_reset_subject.txt",
            success_url=reverse_lazy("password_reset_done"),
        ),
        name="password_reset",
    ),
    path(
        "password_reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="registration/password_reset_done.html"
        ),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="registration/password_reset_confirm.html",
            success_url=reverse_lazy("password_reset_complete"),
        ),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="registration/password_reset_complete.html"
        ),
        name="password_reset_complete",
    ),
]
