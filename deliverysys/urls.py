from django.contrib import admin
from django.urls import path, include
from django.shortcuts import render

def home(request):
    return render(request, "index.html")

urlpatterns = [
    path("", home, name="home"),
    path("admin/", admin.site.urls),

    # auth
    path("accounts/", include("accounts.urls")),
    path("accounts/", include("django.contrib.auth.urls")),

    # apps
    path("orders/", include("orders.urls")),
    path("security/", include(("security.urls", "security"), namespace="security")),
]
