from datetime import timedelta

import requests
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError, transaction
from django.db.models import Count, Sum, Q, F, ExpressionWrapper, DurationField
from django.db.models.functions import Coalesce
from django.shortcuts import render, get_object_or_404
from django.utils.dateparse import parse_datetime
from django.utils.timezone import now

from rest_framework import viewsets, filters, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Order, Attendance
from .serializers import OrderSerializer

User = get_user_model()


# ---------- PERMISSIONS ----------
class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_staff)


# ---------- CRUD + ROUTE ----------
class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [IsAdminOrReadOnly]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "assigned_to"]
    search_fields = ["code", "customer_name", "phone", "address", "assigned_to__username"]
    ordering_fields = ["created_at", "updated_at", "id", "code", "cod"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        return qs if (user.is_staff or user.is_superuser) else qs.filter(assigned_to=user)

    def perform_create(self, serializer):
        try:
            serializer.save(created_by=self.request.user)
        except IntegrityError:
            raise ValidationError({"code": "Mã đơn đã tồn tại."})

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated])
    def route(self, request, pk=None):
        """
        Trả tuyến đường pickup -> drop ở dạng GeoJSON (OSRM).
        Yêu cầu: order.pickup_lat/lng và order.drop_lat/lng phải có.
        Quyền xem: admin, người được gán, hoặc người tạo.
        """
        order = get_object_or_404(Order, pk=pk)
        u = request.user
        if not (u.is_staff or order.assigned_to_id == u.id or order.created_by_id == u.id):
            return Response({"detail": "Forbidden"}, status=403)

        need = [order.pickup_lat, order.pickup_lng, order.drop_lat, order.drop_lng]
        if any(v is None for v in need):
            return Response({"detail": "Thiếu toạ độ pickup/drop"}, status=400)

        coords = f"{order.pickup_lng},{order.pickup_lat};{order.drop_lng},{order.drop_lat}"
        url = f"https://router.project-osrm.org/route/v1/driving/{coords}"
        r = requests.get(url, params={"overview": "full", "geometries": "geojson"}, timeout=10)
        data = r.json()
        if data.get("code") != "Ok":
            return Response({"detail": "OSRM error", "osrm": data}, status=502)

        route = data["routes"][0]
        return Response({
            "distance_m": route["distance"],
            "duration_s": route["duration"],
            "geometry": route["geometry"],  # GeoJSON LineString
        })


# ---------- UI PAGES ----------
@login_required
def order_list(request):
    # Trang list tổng quát cũ (nếu đang dùng)
    return render(request, "orders/orders.html", {
        "is_admin": request.user.is_staff,
        "username": request.user.username,
    })


@login_required
def map_view(request):
    # Trang map tổng quát cũ (nếu đang dùng)
    orders = Order.objects.exclude(address__isnull=True).exclude(address="")
    return render(request, "orders/map.html", {"orders": orders})


@login_required
def my_orders(request):
    # Admin thấy tất cả. Nhân viên thấy đơn gán cho mình.
    u = request.user
    qs = Order.objects.all().order_by('-created_at') if u.is_staff else \
         Order.objects.filter(assigned_to=u).order_by('-created_at')
    return render(request, "orders/my_orders.html", {"orders": qs})


@login_required
def order_detail_page(request, pk):
    # Trang chi tiết đơn + map + gọi /api/orders/{id}/route/
    o = get_object_or_404(Order, pk=pk)
    u = request.user
    if not (u.is_staff or o.assigned_to_id == u.id or o.created_by_id == u.id):
        from django.http import HttpResponseForbidden
        return HttpResponseForbidden("Forbidden")
    return render(request, "orders/order_detail.html", {"order": o})


# ---------- ATTENDANCE API ----------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def attendance_api(request):
    user = request.user
    if request.method == "GET":
        qs = Attendance.objects.filter(employee=user).order_by("-check_in")[:100]
        data = []
        for a in qs:
            hours = None if not a.check_out else round((a.check_out - a.check_in).total_seconds() / 3600.0, 2)
            data.append({
                "id": a.id,
                "check_in": a.check_in,
                "check_out": a.check_out,
                "hours": hours,
            })
        return Response(data)

    action_name = str(request.data.get("action") or "").lower()
    if action_name == "in":
        open_shift = Attendance.objects.filter(employee=user, check_out__isnull=True).last()
        if open_shift:
            return Response({"detail": "Đã check-in."}, status=400)
        with transaction.atomic():
            Attendance.objects.create(employee=user, check_in=now())
        return Response({"detail": "checked-in"})

    if action_name == "out":
        open_shift = Attendance.objects.filter(employee=user, check_out__isnull=True).last()
        if not open_shift:
            return Response({"detail": "Chưa check-in."}, status=400)
        open_shift.check_out = now()
        open_shift.save(update_fields=["check_out"])
        return Response({"detail": "checked-out"})

    return Response({"detail": "action không hợp lệ"}, status=400)


# ---------- TRACK ORDER ----------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def track_order(request):
    code = (request.GET.get("code") or "").strip()
    if not code:
        return Response({"detail": "Thiếu mã đơn."}, status=400)
    order = get_object_or_404(Order, code=code)
    u = request.user
    if not (u.is_staff or order.assigned_to_id == u.id or order.created_by_id == u.id):
        return Response({"detail": "Không có quyền xem đơn này."}, status=403)
    return Response({
        "code": order.code,
        "customer_name": order.customer_name,
        "address": order.address,
        "phone": order.phone,
        "cod": order.cod,
        "status": order.status,
        "assigned_to": getattr(order.assigned_to, "username", None),
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    })


# ---------- PERFORMANCE ----------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def performance_stats(request):
    """Hiệu suất theo khoảng thời gian."""
    u = request.user
    now_dt = now()
    dfrom = parse_datetime(request.GET.get("from") or "") or (now_dt - timedelta(days=30))
    dto = parse_datetime(request.GET.get("to") or "") or now_dt

    oq = Order.objects.filter(assigned_to=u, updated_at__range=(dfrom, dto))
    agg = oq.aggregate(
        total=Count("id"),
        done=Count("id", filter=Q(status="done")),
        cod_sum=Coalesce(Sum("cod", filter=Q(status="done")), 0),
    )

    dur_expr = ExpressionWrapper(Coalesce(F("check_out"), dto) - F("check_in"), output_field=DurationField())
    att_q = Attendance.objects.filter(employee=u)
    att_agg = att_q.aggregate(worked=Coalesce(Sum(dur_expr), timedelta(0)))
    worked_hours = round((att_agg["worked"].total_seconds() / 3600.0), 2) if att_agg["worked"] else 0.0
    done = agg["done"] or 0
    orders_per_hour = round(done / worked_hours, 2) if worked_hours > 0 else None

    return Response({
        "ok": True,
        "result": {
            "user": u.username,
            "orders": agg,
            "attendance": {"worked_hours": worked_hours, "orders_per_hour": orders_per_hour},
        }
    })
