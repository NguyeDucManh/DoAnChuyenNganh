from django.contrib import admin
from django.utils.html import format_html
from .models import Order


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("code", "customer_name", "status", "cod", "assigned_to", "created_at", "map_link")
    list_filter = ("status", "assigned_to", "created_at")
    search_fields = ("code", "customer_name", "address", "phone")
    autocomplete_fields = ("assigned_to",)

    def map_link(self, obj):
        """Nút mở bản đồ điều phối."""
        return format_html('<a href="/orders/{}/" target="_blank">Điều phối</a>', obj.id)
    map_link.short_description = "Map"

    # Nhân viên chỉ thấy đơn của họ
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(assigned_to=request.user)

    # Không cho nhân viên đổi người phụ trách
    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if not request.user.is_superuser:
            ro.append("assigned_to")
        return ro

    # Auto gán người tạo nếu chưa chọn
    def save_model(self, request, obj, form, change):
        if not obj.assigned_to:
            obj.assigned_to = request.user
        super().save_model(request, obj, form, change)
