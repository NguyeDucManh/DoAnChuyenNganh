from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.contrib.auth import logout
from django.shortcuts import redirect

class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]

class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        email = request.data.get("email") or ""
        if not username or not password:
            return Response({"detail": "username và password là bắt buộc"}, status=400)
        if User.objects.filter(username=username).exists():
            return Response({"detail": "username đã tồn tại"}, status=400)

        u = User.objects.create(
            username=username,
            email=email,
            password=make_password(password),
        )
        return Response({"id": u.id, "username": u.username}, status=201)

# Logout UI bằng GET để không còn 405
def logout_get(request):
    logout(request)
    return redirect("home")
