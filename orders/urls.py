from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrderViewSet,
    order_list,
    attendance_api,
    track_order,
    performance_stats,
    map_view,
    my_orders,
    order_detail_page,
)

router = DefaultRouter()
router.register(r"orders", OrderViewSet, basename="orders")

app_name = "orders"

urlpatterns = [
    # UI
    path("", order_list, name="list"),
    path("<int:pk>/", order_detail_page, name="order_detail"),
    path("me/orders/", my_orders, name="my_orders"),
    path("map/", map_view, name="map"),

    # API
    path("api/", include(router.urls)),
    path("api/attendance/",  attendance_api,     name="attendance_api"),
    path("api/track/",       track_order,        name="track_order"),
    path("api/performance/", performance_stats,  name="performance_stats"),
]
