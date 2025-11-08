def is_admin(user):
    """Kiểm tra xem user có quyền quản lý toàn hệ thống không."""
    return user.is_staff or user.groups.filter(name='Admin').exists()


def is_employee(user):
    """Kiểm tra xem user là nhân viên giao hàng."""
    return user.groups.filter(name='NhanVien').exists()
