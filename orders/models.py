from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.contrib.gis.db import models as gis_models


class Order(models.Model):
    STATUS_CHOICES = [
        ("new", "Mới tạo"),
        ("shipping", "Đang giao"),
        ("done", "Hoàn thành"),
        ("cancel", "Đã hủy"),
    ]

    code = models.CharField("Mã đơn", max_length=20, unique=True, db_index=True)
    customer_name = models.CharField("Tên khách hàng", max_length=120, db_index=True)

    # Địa chỉ “cũ” vẫn giữ (nếu dùng 1 điểm). Không bắt buộc.
    address = models.CharField("Địa chỉ", max_length=255, blank=True)

    # Địa chỉ chuẩn cho map: tách LẤY/GIAO + toạ độ để OSRM
    pickup_address = models.CharField("Địa chỉ lấy hàng", max_length=255, blank=True, default="")
    pickup_lat = models.FloatField("Pickup lat", null=True, blank=True)
    pickup_lng = models.FloatField("Pickup lng", null=True, blank=True)

    drop_address = models.CharField("Địa chỉ giao hàng", max_length=255, blank=True, default="")
    drop_lat = models.FloatField("Drop lat", null=True, blank=True)
    drop_lng = models.FloatField("Drop lng", null=True, blank=True)

    phone = models.CharField("Số điện thoại", max_length=20, blank=True)
    cod = models.PositiveIntegerField("COD (₫)", default=0)
    status = models.CharField("Trạng thái", max_length=12, choices=STATUS_CHOICES, default="new", db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="orders_created",
        verbose_name="Người tạo",
        null=True, blank=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="orders_assigned",
        verbose_name="Nhân viên giao hàng",
        db_index=True,
    )

    created_at = models.DateTimeField("Ngày tạo", auto_now_add=True)
    updated_at = models.DateTimeField("Cập nhật", auto_now=True)

    # --- Helpers cho map/route ---
    @property
    def has_coords(self) -> bool:
        return all(v is not None for v in [self.pickup_lat, self.pickup_lng, self.drop_lat, self.drop_lng])

    def route_coords(self) -> tuple[tuple[float, float], tuple[float, float]] | None:
        """Trả ((pickup_lat, pickup_lng), (drop_lat, drop_lng)) nếu đủ tọa độ."""
        if not self.has_coords:
            return None
        return (self.pickup_lat, self.pickup_lng), (self.drop_lat, self.drop_lng)

    def __str__(self):
        return f"{self.code} - {self.customer_name}"

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Đơn hàng"
        verbose_name_plural = "Danh sách đơn hàng"
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["assigned_to", "status"]),
        ]


class Attendance(models.Model):
    """Chấm công theo nhân viên; mỗi thời điểm chỉ có 1 ca đang mở (check_out is NULL)."""

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attendances",
        verbose_name="Nhân viên",
        db_index=True,
    )
    order = models.ForeignKey(
        Order,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="attendances",
        verbose_name="Đơn hàng",
    )
    check_in = models.DateTimeField("Giờ vào ca", auto_now_add=True, db_index=True)
    check_out = models.DateTimeField("Giờ ra ca", null=True, blank=True)

    @property
    def hours(self) -> float | None:
        if not self.check_out:
            return None
        delta = self.check_out - self.check_in
        return round(delta.total_seconds() / 3600, 2)

    def close(self, when: timezone.datetime | None = None):
        if not self.check_out:
            self.check_out = when or timezone.now()
            self.save(update_fields=["check_out"])

    def __str__(self):
        return f"{self.employee} {self.check_in:%Y-%m-%d %H:%M}"

    class Meta:
        ordering = ["-check_in"]
        verbose_name = "Chấm công"
        verbose_name_plural = "Chấm công"
        constraints = [
            models.UniqueConstraint(
                fields=["employee"],
                condition=Q(check_out__isnull=True),
                name="one_open_shift_per_employee",
            ),
        ]
        indexes = [
            models.Index(fields=["employee", "check_out"]),
        ]
class Road(gis_models.Model):
    name = gis_models.CharField(max_length=255, null=True)
    highway = gis_models.CharField(max_length=50, null=True)
    geom = gis_models.LineStringField(srid=4326)

    def __str__(self):
        return self.name or "Unnamed Road"
