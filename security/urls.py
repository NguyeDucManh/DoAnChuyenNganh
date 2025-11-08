# security/urls.py
from django.urls import path
from . import views

app_name = "security"  # bắt buộc để dùng {% url 'security:overview' %}

urlpatterns = [
    path("", views.overview, name="overview"),
]
