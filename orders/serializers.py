from rest_framework import serializers
from .models import Order


class OrderSerializer(serializers.ModelSerializer):
    assigned_to_username = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "code", "customer_name",
            "pickup_address", "pickup_lat", "pickup_lng",
            "drop_address", "drop_lat", "drop_lng",
            "address", "phone", "status", "cod",
            "assigned_to", "assigned_to_username",
            "created_at", "updated_at"
        ]
        read_only_fields = ["created_at", "updated_at", "assigned_to_username"]

    def get_assigned_to_username(self, obj):
        return obj.assigned_to.username if obj.assigned_to else None
